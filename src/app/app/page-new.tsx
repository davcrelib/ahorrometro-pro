"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  limit as qLimit,
  writeBatch,
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase/firestore";

// ----------------- Tipos -----------------
type Plan = {
  income: number;
  fixed: number;
  currentSavings: number;
  goal: number;
  targetDate: string | null; // "YYYY-MM-DD"
  hoursPerMonth: number;
};

type SpendDoc = {
  note: string;
  amount: number;
  date: string;     // "YYYY-MM-DD"
  cat: string;
  createdAt?: any;
};

type CategoryDoc = {
  name: string;
  emoji?: string;
  color?: string;
  order?: number;
  isDefault?: boolean;
  createdAt?: any;
};

// Tus tipos “con id” pueden quedar como:
type Spend = SpendDoc & { id: string };
type Category = CategoryDoc & { id?: string };

// ----------------- Utilidades -----------------
function fmt(n: number) {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n || 0);
  } catch {
    return `${(n || 0).toFixed(2)} €`;
  }
}
function monthProgressFraction(d: Date) {
  const year = d.getFullYear();
  const month = d.getMonth();
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  const now = d.getTime();
  return Math.max(0, Math.min(1, (now - start) / (end - start)));
}
function startOfWeek(d = new Date()) {
  const res = new Date(d);
  const day = (res.getDay() + 6) % 7; // lunes=0
  res.setDate(res.getDate() - day);
  res.setHours(0, 0, 0, 0);
  return res;
}
function endOfWeek(d = new Date()) {
  const res = startOfWeek(d);
  res.setDate(res.getDate() + 6);
  res.setHours(23, 59, 59, 999);
  return res;
}

// ----------------- Componente -----------------
export default function AppPage() {
  const [user, loading] = useAuthState(auth);

  // Perfil / plan
  const [plan, setPlan] = useState<Plan>({
    income: 0,
    fixed: 0,
    currentSavings: 0,
    goal: 0,
    targetDate: null,
    hoursPerMonth: 160,
  });
  const [planTier, setPlanTier] = useState<"free" | "pro">("free");

  // Categorías
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCatName, setNewCatName] = useState("");

  // Gasto actual
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [cat, setCat] = useState<string>("");

  // Historial / filtros / paginación
  const [view, setView] = useState<"week" | "month" | "all">("week");
  const [spends, setSpends] = useState<Spend[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Edición inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Partial<Spend> | null>(null);

  // Dinero ganado este mes (contador)
  const [earnedThisMonth, setEarnedThisMonth] = useState(0);

  // ----------------- Cargar plan + planTier -----------------
  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    const unsub = onSnapshot(userRef, (snap) => {
      const d = snap.data() || {};
      setPlan({
        income: d.income ?? 0,
        fixed: d.fixed ?? 0,
        currentSavings: d.currentSavings ?? 0,
        goal: d.goal ?? 0,
        targetDate: d.targetDate ?? null,
        hoursPerMonth: d.hoursPerMonth ?? 160,
      });
      setPlanTier(d.planTier === "pro" ? "pro" : "free");
    });
    return () => unsub();
  }, [user]);

  // ----------------- Cargar/sembrar categorías -----------------
  useEffect(() => {
    if (!user) return;

    const qCats = query(
      collection(db, "users", user.uid, "categories"),
      orderBy("order", "asc")
    );

    const unsub = onSnapshot(qCats, async (snap) => {
      if (snap.empty) {
        // Sembrar por defecto si no hay
        const seed: Omit<Category, "id">[] = [
          { name: "Supermercado", emoji: "🛒", order: 10, isDefault: true },
          { name: "Restauración", emoji: "🍽️", order: 20, isDefault: true },
          { name: "Transporte", emoji: "🚌", order: 30, isDefault: true },
          { name: "Ocio", emoji: "🎮", order: 40, isDefault: true },
          { name: "Otros", emoji: "📦", order: 50, isDefault: true },
        ];
        const batch = writeBatch(db);
        seed.forEach((c) => {
          const ref = doc(collection(db, "users", user.uid, "categories"));
          batch.set(ref, { ...c, createdAt: serverTimestamp() });
        });
        await batch.commit();
        return; // la siguiente notificación traerá datos
      }

      const list: Category[] = [];
      snap.forEach((d) => {
        const data = d.data() as CategoryDoc;
        list.push({ ...data, id: d.id });
      });
      setCategories(list);

      // Seleccionar una categoría por defecto si no hay
      setCat((prev) => prev || list[0]?.name || "");
    });

    return () => unsub();
  }, [user]);

  // ----------------- Cargar gastos (suscripción) -----------------
  useEffect(() => {
    if (!user) return;

    let q = query(
      collection(db, "users", user.uid, "expenses"),
      orderBy("createdAt", "desc"),
      qLimit(20)
    );

    const today = new Date();
    if (view === "week") {
      const s = startOfWeek(today).toISOString().slice(0, 10);
      const e = endOfWeek(today).toISOString().slice(0, 10);
      q = query(
        collection(db, "users", user.uid, "expenses"),
        where("date", ">=", s),
        where("date", "<=", e),
        orderBy("date", "desc"),
        qLimit(20)
      );
    } else if (view === "month") {
      const y = today.getFullYear();
      const m = (today.getMonth() + 1).toString().padStart(2, "0");
      const s = `${y}-${m}-01`;
      const e = new Date(y, today.getMonth() + 1, 0).toISOString().slice(0, 10);
      q = query(
        collection(db, "users", user.uid, "expenses"),
        where("date", ">=", s),
        where("date", "<=", e),
        orderBy("date", "desc"),
        qLimit(20)
      );
    }

    const unsub = onSnapshot(q, (snap) => {
      const arr: Spend[] = [];
      snap.forEach((d) => {
        const data = d.data() as SpendDoc;
        arr.push({ ...data, id: d.id });
      });
      setSpends(arr);
      setLastDoc(snap.docs.length ? snap.docs[snap.docs.length - 1] : null);
    });

    return () => unsub();
  }, [user, view]);

  // ----------------- Load more -----------------
  async function loadMore() {
    if (!user || !lastDoc || loadingMore) return;
    setLoadingMore(true);

    let q = query(
      collection(db, "users", user.uid, "expenses"),
      orderBy("createdAt", "desc"),
      startAfter(lastDoc),
      qLimit(20)
    );

    const today = new Date();
    if (view === "week") {
      const s = startOfWeek(today).toISOString().slice(0, 10);
      const e = endOfWeek(today).toISOString().slice(0, 10);
      q = query(
        collection(db, "users", user.uid, "expenses"),
        where("date", ">=", s),
        where("date", "<=", e),
        orderBy("date", "desc"),
        startAfter(lastDoc),
        qLimit(20)
      );
    } else if (view === "month") {
      const y = today.getFullYear();
      const m = (today.getMonth() + 1).toString().padStart(2, "0");
      const s = `${y}-${m}-01`;
      const e = new Date(y, today.getMonth() + 1, 0).toISOString().slice(0, 10);
      q = query(
        collection(db, "users", user.uid, "expenses"),
        where("date", ">=", s),
        where("date", "<=", e),
        orderBy("date", "desc"),
        startAfter(lastDoc),
        qLimit(20)
      );
    }

    const snap = await getDocs(q);
    const more: Spend[] = snap.docs.map((d) => {
      const data = d.data() as SpendDoc;
      return { ...data, id: d.id };
    });
setSpends((prev) => [...prev, ...more]);
    setLastDoc(snap.docs.length ? snap.docs[snap.docs.length - 1] : null);
    setLoadingMore(false);
  }

  // ----------------- Guardar plan -----------------
  async function savePlan() {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    await setDoc(
      ref,
      {
        ...plan,
        planTier, // no se toca aquí, solo se conserva
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    alert("Plan guardado ✅");
  }

  // ----------------- Añadir gasto -----------------
  async function addSpend() {
    if (!user) return;
    const n = (note || "").trim();
    const a = +amount;
    if (!n || !a || !date || !cat) {
      alert("Rellena concepto, importe, fecha y categoría.");
      return;
    }
    await addDoc(collection(db, "users", user.uid, "expenses"), {
      note: n,
      amount: a,
      date,
      cat,
      createdAt: serverTimestamp(),
    });
    setNote("");
    setAmount("");
  }

  // ----------------- Borrar / editar -----------------
  async function removeSpend(id: string) {
    if (!user) return;
    if (!confirm("¿Eliminar este gasto?")) return;
    await deleteDoc(doc(db, "users", user.uid, "expenses", id));
  }
  function startEdit(s: Spend) {
    setEditingId(s.id);
    setEditRow({ ...s });
  }
  function cancelEdit() {
    setEditingId(null);
    setEditRow(null);
  }
  async function saveEdit() {
    if (!user || !editingId || !editRow) return;
    const ref = doc(db, "users", user.uid, "expenses", editingId);
    const { note, amount, date, cat } = editRow;
    await updateDoc(ref, {
      note: (note || "").trim(),
      amount: +(+amount! || 0),
      date: date || new Date().toISOString().slice(0, 10),
      cat: cat || "Otros",
    });
    setEditingId(null);
    setEditRow(null);
  }

  // ----------------- Alta rápida de categoría -----------------
  async function createCategory() {
    if (!user) return;
    const name = (newCatName || "").trim();
    if (!name) {
      alert("Pon un nombre para la categoría.");
      return;
    }
    const exists = categories.some(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      setCat(name);
      setNewCatName("");
      return;
    }
    await addDoc(collection(db, "users", user.uid, "categories"), {
      name,
      emoji: "",
      order: (categories[categories.length - 1]?.order ?? 0) + 10,
      createdAt: serverTimestamp(),
    });
    setCat(name);
    setNewCatName("");
  }

  // ----------------- Cálculos -----------------
  const monthsLeft = useMemo(() => {
    if (!plan.targetDate) return 0;
    const a = new Date(plan.targetDate);
    const b = new Date();
    let m = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
    if (a.getDate() - b.getDate() < 0) m -= 1;
    return Math.max(0, m);
  }, [plan.targetDate]);

  const needMonthly = useMemo(() => {
    if (!monthsLeft || monthsLeft <= 0) return 0;
    return Math.max(0, (plan.goal - plan.currentSavings) / monthsLeft);
  }, [monthsLeft, plan.goal, plan.currentSavings]);

  const leftover = Math.max(0, plan.income - plan.fixed - needMonthly);
  const weeklyBudget = leftover / 4.33;

  const weeklySpent = useMemo(() => {
    if (!spends.length) return 0;
    const start = startOfWeek();
    const end = endOfWeek();
    return spends.reduce((acc, s) => {
      const d = new Date((s.date || "").replace(/-/g, "/"));
      if (d >= start && d <= end) acc += s.amount || 0;
      return acc;
    }, 0);
  }, [spends]);

  const weeklyRemaining = Math.max(0, weeklyBudget - weeklySpent);

  useEffect(() => {
    function refresh() {
      const f = monthProgressFraction(new Date());
      setEarnedThisMonth(plan.income * f);
    }
    refresh();
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [plan.income]);

  // ----------------- Estado de login -----------------
  if (loading) return <div className="p-6">Cargando…</div>;
  if (!user) {
    return (
      <main className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">🏦 Ahorrómetro</h1>
        <p className="opacity-90">Inicia sesión en la página principal para continuar.</p>
        <Link href="/" className="underline">Volver al inicio</Link>
      </main>
    );
  }

  const euroPerHour = plan.hoursPerMonth > 0 ? plan.income / plan.hoursPerMonth : 0;
  const goalProgress =
    plan.goal > 0 ? Math.min(100, Math.max(0, (plan.currentSavings / plan.goal) * 100)) : 0;

  // ----------------- UI -----------------
  return (
    <main className="p-4 max-w-6xl mx-auto space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🏦 Ahorrómetro</h1>
        <div className="text-sm opacity-90">Sesión: <b>{user.email}</b></div>
      </header>

      {/* Banner Pro (placeholder) */}
      {planTier === "free" ? (
        <section className="rounded-2xl p-4 border border-yellow-400/30 bg-yellow-400/10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="font-semibold">Plan Free</div>
              <div className="opacity-90 text-sm">
                Sincronización en tiempo real incluida. Próximamente podrás activar <b>Pro</b> para desbloquear más funciones.
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl p-4 border border-emerald-400/30 bg-emerald-400/10">
          <div className="font-semibold">✅ Cuenta PRO activa</div>
        </section>
      )}

      {/* Panel superior */}
      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <h2 className="font-semibold mb-2">Tu plan</h2>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Ingreso mensual" type="number"
              value={plan.income || ""}
              onChange={(e) => setPlan((p) => ({ ...p, income: +e.target.value }))}
              className="bg-black/30 p-2 rounded" />
            <input placeholder="Gastos fijos" type="number"
              value={plan.fixed || ""}
              onChange={(e) => setPlan((p) => ({ ...p, fixed: +e.target.value }))}
              className="bg-black/30 p-2 rounded" />
            <input placeholder="Ahorros actuales" type="number"
              value={plan.currentSavings || ""}
              onChange={(e) => setPlan((p) => ({ ...p, currentSavings: +e.target.value }))}
              className="bg-black/30 p-2 rounded" />
            <input placeholder="Objetivo (150000)" type="number"
              value={plan.goal || ""}
              onChange={(e) => setPlan((p) => ({ ...p, goal: +e.target.value }))}
              className="bg-black/30 p-2 rounded" />
            <input placeholder="Fecha objetivo" type="date"
              value={plan.targetDate || ""}
              onChange={(e) => setPlan((p) => ({ ...p, targetDate: e.target.value || null }))}
              className="bg-black/30 p-2 rounded" />
            <input placeholder="Horas/mes (160)" type="number"
              value={plan.hoursPerMonth || ""}
              onChange={(e) => setPlan((p) => ({ ...p, hoursPerMonth: +e.target.value }))}
              className="bg-black/30 p-2 rounded" />
          </div>
          <button onClick={savePlan} className="mt-3 rounded px-3 py-2 bg-white text-black">Guardar plan</button>
          <div className="mt-3 text-sm opacity-90 space-y-1">
            <div>Semanal: <b>{fmt(weeklyBudget)}</b></div>
            <div>Diario (aprox): <b>{fmt(leftover / 30.4)}</b></div>
          </div>
        </div>

        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <h2 className="font-semibold mb-2">Apuntar un gasto</h2>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Concepto" value={note} onChange={(e) => setNote(e.target.value)} className="bg-black/30 p-2 rounded" />
            <input placeholder="Importe (€)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-black/30 p-2 rounded" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-black/30 p-2 rounded" />

            {/* Select de categorías + alta rápida */}
            <div className="col-span-2 flex gap-2">
              <select
                value={cat}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v !== "__new__") setCat(v);
                }}
                className="bg-black/30 p-2 rounded flex-1"
              >
                {categories.map((c) => (
                  <option key={c.id || c.name} value={c.name}>
                    {c.emoji ? `${c.emoji} ${c.name}` : c.name}
                  </option>
                ))}
                <option value="__new__">+ Nueva categoría…</option>
              </select>
              <input
                placeholder="Nueva categoría"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="bg-black/30 p-2 rounded w-44"
              />
              <button type="button" onClick={createCategory} className="px-3 py-2 bg-white text-black rounded">
                Crear
              </button>
            </div>
          </div>
          <div className="mt-2 text-sm">
            Semana restante aprox.: <b>{fmt(weeklyRemaining)}</b> (gastado: {fmt(weeklySpent)})
          </div>
          <button onClick={addSpend} className="mt-3 rounded px-3 py-2 bg-white text-black">Añadir gasto</button>
        </div>
      </section>

      {/* Historial */}
      <section className="rounded-2xl p-4 bg-white/5 border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Historial</h2>
          <div className="flex gap-2 text-sm">
            <button className={`px-3 py-1 rounded ${view === "week" ? "bg-white text-black" : "bg-white/10"}`} onClick={() => setView("week")}>Semana</button>
            <button className={`px-3 py-1 rounded ${view === "month" ? "bg-white text-black" : "bg-white/10"}`} onClick={() => setView("month")}>Mes</button>
            <button className={`px-3 py-1 rounded ${view === "all" ? "bg-white text-black" : "bg-white/10"}`} onClick={() => setView("all")}>Todo</button>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="opacity-80">
            <tr>
              <th className="text-left">Fecha</th>
              <th className="text-left">Concepto</th>
              <th className="text-left">Categoría</th>
              <th className="text-right">Importe</th>
              <th className="text-right w-40">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {spends.map((s) => (
              <tr key={s.id} className="border-t border-white/10">
                {editingId === s.id ? (
                  <>
                    <td>
                      <input
                        type="date"
                        value={editRow?.date || ""}
                        onChange={(e) => setEditRow((r) => ({ ...(r as Spend), date: e.target.value }))}
                        className="bg-black/30 p-1 rounded"
                      />
                    </td>
                    <td>
                      <input
                        value={editRow?.note || ""}
                        onChange={(e) => setEditRow((r) => ({ ...(r as Spend), note: e.target.value }))}
                        className="bg-black/30 p-1 rounded"
                      />
                    </td>
                    <td>
                      <select
                        value={editRow?.cat || ""}
                        onChange={(e) => setEditRow((r) => ({ ...(r as Spend), cat: e.target.value }))}
                        className="bg-black/30 p-1 rounded"
                      >
                        {categories.map((c) => (
                          <option key={c.id || c.name} value={c.name}>
                            {c.emoji ? `${c.emoji} ${c.name}` : c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-right">
                      <input
                        type="number"
                        value={editRow?.amount ?? 0}
                        onChange={(e) => setEditRow((r) => ({ ...(r as Spend), amount: +e.target.value }))}
                        className="bg-black/30 p-1 rounded w-28 text-right"
                      />
                    </td>
                    <td className="text-right">
                      <button onClick={saveEdit} className="px-2 py-1 bg-emerald-500 text-black rounded mr-2">Guardar</button>
                      <button onClick={cancelEdit} className="px-2 py-1 bg-white/10 rounded">Cancelar</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{s.date}</td>
                    <td>{s.note}</td>
                    <td>{s.cat}</td>
                    <td className="text-right">{fmt(s.amount)}</td>
                    <td className="text-right">
                      <button onClick={() => startEdit(s)} className="px-2 py-1 bg-white/10 rounded mr-2">✏️</button>
                      <button onClick={() => removeSpend(s.id)} className="px-2 py-1 bg-white/10 rounded">🗑️</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {spends.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 opacity-70">Sin gastos aún.</td>
              </tr>
            )}
          </tbody>
        </table>

        {lastDoc && (
          <div className="mt-3 text-right">
            <button onClick={loadMore} disabled={loadingMore} className="px-3 py-2 bg-white/10 rounded">
              {loadingMore ? "Cargando…" : "Cargar más"}
            </button>
          </div>
        )}
      </section>

      {/* Indicadores */}
      <section className="rounded-2xl p-4 bg-white/5 border border-white/10">
        <h2 className="font-semibold mb-2">Indicadores rápidos</h2>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl p-3 bg-black/30">
            <div className="opacity-80">Has “ganado” este mes</div>
            <div className="text-lg font-semibold">{fmt(earnedThisMonth)}</div>
            <div className="opacity-70">~ {fmt(euroPerHour)}/hora</div>
          </div>
          <div className="rounded-xl p-3 bg-black/30">
            <div className="opacity-80">Restante semanal</div>
            <div className="text-lg font-semibold">{fmt(weeklyRemaining)}</div>
            <div className="opacity-70">Gastado esta semana: {fmt(weeklySpent)}</div>
          </div>
          <div className="rounded-xl p-3 bg-black/30">
            <div className="opacity-80">Progreso objetivo</div>
            <div className="text-lg font-semibold">{goalProgress.toFixed(0)}%</div>
            <div className="opacity-70">Objetivo: {fmt(plan.goal)}</div>
          </div>
        </div>
      </section>
    </main>
  );
}