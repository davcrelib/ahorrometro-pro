"use client";

import { auth, db } from "@/lib/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import {
  doc, setDoc, getDoc, collection, addDoc,
  query, orderBy, onSnapshot, serverTimestamp,
  where, limit, startAfter, getDocs, updateDoc, deleteDoc
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Plan = {
  income: number; fixed: number; currentSavings: number; goal: number;
  targetDate: string | null; hoursPerMonth: number;
};

type Spend = {
  id?: string; note: string; amount: number; date: string; cat: string; createdAt?: any;
};

const fmt = (n?: number) =>
  typeof n === "number" ? n.toLocaleString("es-ES", { style: "currency", currency: "EUR" }) : "—";
const todayISO = () => new Date().toISOString().slice(0, 10);

// Semana (Lunes–Domingo)
function startOfWeek(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay(); // 0 dom, 1 lun...
  const diff = (day === 0 ? -6 : 1 - day);
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function endOfWeek(d = new Date()) {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}
function monthProgressFraction(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, elapsed / total));
}

type ViewMode = "week" | "month" | "all";

export const runtime = "edge"; // UI only
export default function AppPage() {
  const [user, loading] = useAuthState(auth);

  // Perfil Free/Pro (opcional)
  const [planTier, setPlanTier] = useState<"free" | "pro">("free");

  // Plan
  const [plan, setPlan] = useState<Plan>({
    income: 0, fixed: 0, currentSavings: 0, goal: 150000, targetDate: null, hoursPerMonth: 160,
  });

  // Gastos + paginación
  const [view, setView] = useState<ViewMode>("week");
  const [spends, setSpends] = useState<Spend[]>([]);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Form gasto
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState(todayISO());
  const [cat, setCat] = useState("otros");

  // Editar gasto
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Spend | null>(null);

  // Métricas
  const [earnedThisMonth, setEarnedThisMonth] = useState<number>(0);

  // Carga perfil + plan + primera página de gastos
  useEffect(() => {
    if (!user) return;

    // Perfil
    getDoc(doc(db, "users", user.uid)).then(async snap => {
      if (snap.exists()) setPlanTier((snap.data() as any)?.planTier === "pro" ? "pro" : "free");
      else {
        await setDoc(doc(db, "users", user.uid), { planTier: "free", createdAt: serverTimestamp() }, { merge: true });
        setPlanTier("free");
      }
    });

    // Plan
    getDoc(doc(db, "users", user.uid, "plans", "default")).then(s => s.exists() && setPlan(s.data() as Plan));

  }, [user]);

  // Suscripción a gastos con filtro + primera página
  useEffect(() => {
    if (!user) return;

    // Construye query inicial según vista
    let qBase;
    if (view === "week") {
      const sISO = startOfWeek().toISOString().slice(0, 10);
      const eISO = endOfWeek().toISOString().slice(0, 10);
      qBase = query(
        collection(db, "users", user.uid, "expenses"),
        where("date", ">=", sISO), where("date", "<=", eISO),
        orderBy("date", "desc"),
        limit(20)
      );
    } else if (view === "month") {
      const now = new Date();
      const sISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const eISO = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      qBase = query(
        collection(db, "users", user.uid, "expenses"),
        where("date", ">=", sISO), where("date", "<=", eISO),
        orderBy("date", "desc"),
        limit(20)
      );
    } else {
      qBase = query(
        collection(db, "users", user.uid, "expenses"),
        orderBy("createdAt", "desc"),
        limit(20)
      );
    }

    const unsub = onSnapshot(qBase, (snap) => {
      const rows: Spend[] = [];
      snap.forEach(d => rows.push({ id: d.id, ...(d.data() as Spend) }));
      setSpends(rows);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
    });

    return () => unsub();
  }, [user, view]);

  // Guardar plan
  async function savePlan() {
    if (!user) return;
    await setDoc(doc(db, "users", user.uid, "plans", "default"), plan, { merge: true });
    alert("Plan guardado ✅");
  }

  // Añadir gasto
  async function addSpend() {
    if (!user) return;
    const val = parseFloat(amount || "0");
    if (!(val > 0)) { alert("Importe inválido"); return; }
    await addDoc(collection(db, "users", user.uid, "expenses"), {
      note: note.trim() || "Gasto",
      amount: val,
      date,
      cat,
      createdAt: serverTimestamp(),
    });
    setAmount(""); setNote("");
  }

  // Borrar gasto
  async function removeSpend(id?: string) {
    if (!user || !id) return;
    if (!confirm("¿Borrar este gasto?")) return;
    await deleteDoc(doc(db, "users", user.uid, "expenses", id));
  }

  // Editar gasto
  function startEdit(s: Spend) {
    setEditingId(s.id || null);
    setEditRow({ ...s });
  }
  function cancelEdit() {
    setEditingId(null);
    setEditRow(null);
  }
  async function saveEdit() {
    if (!user || !editingId || !editRow) return;
    await updateDoc(doc(db, "users", user.uid, "expenses", editingId), {
      note: editRow.note,
      amount: editRow.amount,
      date: editRow.date,
      cat: editRow.cat,
    });
    setEditingId(null);
    setEditRow(null);
  }

  // Cargar más (paginación)
  async function loadMore() {
    if (!user || !lastDoc || loadingMore) return;
    setLoadingMore(true);

    let qNext;
    if (view === "all") {
      qNext = query(
        collection(db, "users", user.uid, "expenses"),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(20)
      );
    } else {
      const now = new Date();
      let sISO = "", eISO = "";
      if (view === "week") {
        sISO = startOfWeek().toISOString().slice(0, 10);
        eISO = endOfWeek().toISOString().slice(0, 10);
      } else {
        sISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        eISO = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      }
      qNext = query(
        collection(db, "users", user.uid, "expenses"),
        where("date", ">=", sISO), where("date", "<=", eISO),
        orderBy("date", "desc"),
        startAfter(lastDoc),
        limit(20)
      );
    }

    const snap = await getDocs(qNext);
    const rows: Spend[] = [];
    snap.forEach(d => rows.push({ id: d.id, ...(d.data() as Spend) }));
    setSpends(prev => [...prev, ...rows]);
    setLastDoc(snap.docs[snap.docs.length - 1] || null);
    setLoadingMore(false);
  }

  // Cálculos
  const monthsLeft = useMemo(() => {
    if (!plan.targetDate) return null;
    const a = new Date(plan.targetDate + "T00:00:00");
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

  // Dinero “acumulado este mes”
  useEffect(() => {
    function refresh() {
      const f = monthProgressFraction(new Date());
      setEarnedThisMonth(plan.income * f);
    }
    refresh();
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [plan.income]);

  // Upgrade (si luego usas /api/checkout, sustituye handler)
  const checkoutURL = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_URL || "";
  function handleUpgrade() {
    if (!checkoutURL) { alert("Configura NEXT_PUBLIC_STRIPE_CHECKOUT_URL"); return; }
    const url = new URL(checkoutURL);
    if (user?.email) url.searchParams.set("prefilled_email", user.email);
    window.location.href = url.toString();
  }

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
  const goalProgress = plan.goal > 0 ? Math.min(100, Math.max(0, (plan.currentSavings / plan.goal) * 100)) : 0;

  return (
    <main className="p-4 max-w-6xl mx-auto space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🏦 Ahorrómetro</h1>
        <div className="text-sm opacity-90">Sesión: <b>{user.email}</b></div>
      </header>

      {/* Banner Pro */}
      {planTier === "free" ? (
        <section className="rounded-2xl p-4 border border-yellow-400/30 bg-yellow-400/10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="font-semibold">Plan Free</div>
              <div className="opacity-90 text-sm">
                Desbloquea <b>múltiples objetivos</b>, <b>recordatorios</b> y <b>backups</b> con <b>Pro</b>.
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleUpgrade} className="rounded-xl px-4 py-2 bg-white text-black">🚀 Upgrade to Pro</button>
              <Link href="/billing" className="rounded-xl px-4 py-2 bg-white/10 border border-white/15">Ver planes</Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl p-3 border border-emerald-400/30 bg-emerald-400/10">
          <div className="text-sm"><b>Pro activo</b> — ¡gracias! 💚</div>
        </section>
      )}

      {/* Top stats */}
      <section className="grid md:grid-cols-4 gap-4">
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <div className="opacity-80 text-sm">Acumulado este mes</div>
          <div className="text-2xl font-semibold mt-1">{fmt(earnedThisMonth)}</div>
          <div className="opacity-70 text-xs mt-1">Prorrateo de sueldo mensual</div>
        </div>
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <div className="opacity-80 text-sm">€ / hora</div>
          <div className="text-2xl font-semibold mt-1">{fmt(euroPerHour)}</div>
          <div className="opacity-70 text-xs mt-1">{plan.hoursPerMonth || 0} h/mes</div>
        </div>
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <div className="opacity-80 text-sm">Semanal (presupuesto)</div>
          <div className="text-2xl font-semibold mt-1">{fmt(weeklyBudget)}</div>
          <div className="opacity-70 text-xs mt-1">Libre tras fijos + ahorro</div>
        </div>
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <div className="opacity-80 text-sm">Semanal (restante)</div>
          <div className={`text-2xl font-semibold mt-1 ${weeklyRemaining <= weeklyBudget * 0.4 ? "text-red-300" : ""}`}>
            {fmt(weeklyRemaining)}
          </div>
          <div className="opacity-70 text-xs mt-1">Gastado esta semana: {fmt(weeklySpent)}</div>
        </div>
      </section>

      {/* Progreso objetivo */}
      <section className="rounded-2xl p-4 bg-white/5 border border-white/10">
        <h2 className="font-semibold mb-2">Progreso hacia tu objetivo</h2>
        <div className="text-sm opacity-90 mb-2">
          Ahorros: <b>{fmt(plan.currentSavings)}</b> / Objetivo: <b>{fmt(plan.goal)}</b>{" "}
          {plan.targetDate ? <>· Fecha objetivo: <b>{plan.targetDate}</b></> : null}
        </div>
        <div className="w-full h-3 bg-white/10 rounded-xl overflow-hidden">
          <div className="h-3 bg-white/70" style={{ width: `${goalProgress}%` }} />
        </div>
        <div className="mt-3 text-sm opacity-90 grid md:grid-cols-3 gap-2">
          <div>Meses restantes: <b>{monthsLeft ?? "—"}</b></div>
          <div>Ahorro mensual necesario: <b>{fmt(needMonthly)}</b></div>
          <div>Libre mensual: <b>{fmt(leftover)}</b></div>
        </div>
      </section>

      {/* Plan + Añadir gasto */}
      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <h2 className="font-semibold mb-2">Tu plan</h2>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Sueldo neto mensual" type="number" value={plan.income || ""}
              onChange={e => setPlan(p => ({ ...p, income: +e.target.value }))} className="bg-black/30 p-2 rounded" />
            <input placeholder="Gastos fijos" type="number" value={plan.fixed || ""}
              onChange={e => setPlan(p => ({ ...p, fixed: +e.target.value }))} className="bg-black/30 p-2 rounded" />
            <input placeholder="Ahorros actuales" type="number" value={plan.currentSavings || ""}
              onChange={e => setPlan(p => ({ ...p, currentSavings: +e.target.value }))} className="bg-black/30 p-2 rounded" />
            <input placeholder="Objetivo (150000)" type="number" value={plan.goal || ""}
              onChange={e => setPlan(p => ({ ...p, goal: +e.target.value }))} className="bg-black/30 p-2 rounded" />
            <input placeholder="Fecha objetivo" type="date" value={plan.targetDate || ""}
              onChange={e => setPlan(p => ({ ...p, targetDate: e.target.value || null }))} className="bg-black/30 p-2 rounded" />
            <input placeholder="Horas/mes (160)" type="number" value={plan.hoursPerMonth || ""}
              onChange={e => setPlan(p => ({ ...p, hoursPerMonth: +e.target.value }))} className="bg-black/30 p-2 rounded" />
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
            <input placeholder="Concepto" value={note} onChange={e => setNote(e.target.value)} className="bg-black/30 p-2 rounded" />
            <input placeholder="Importe (€)" type="number" value={amount} onChange={e => setAmount(e.target.value)} className="bg-black/30 p-2 rounded" />
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-black/30 p-2 rounded" />
            <select value={cat} onChange={e => setCat(e.target.value)} className="bg-black/30 p-2 rounded">
              <option value="ocio">Ocio</option>
              <option value="restauración">Restauración</option>
              <option value="transporte">Transporte</option>
              <option value="otros">Otros</option>
            </select>
          </div>
          <div className="mt-2 text-sm">Semana restante aprox.: <b>{fmt(weeklyRemaining)}</b> (gastado: {fmt(weeklySpent)})</div>
          <button onClick={addSpend} className="mt-3 rounded px-3 py-2 bg-white text-black">Añadir gasto</button>
        </div>
      </section>

      {/* Historial */}
      <section className="rounded-2xl p-4 bg-white/5 border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Historial</h2>
          <div className="flex gap-2 text-sm">
            <button className={`px-3 py-1 rounded ${view==="week"?"bg-white text-black":"bg-white/10"}`} onClick={()=>setView("week")}>Semana</button>
            <button className={`px-3 py-1 rounded ${view==="month"?"bg-white text-black":"bg-white/10"}`} onClick={()=>setView("month")}>Mes</button>
            <button className={`px-3 py-1 rounded ${view==="all"?"bg-white text-black":"bg-white/10"}`} onClick={()=>setView("all")}>Todo</button>
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
                    <td><input type="date" value={editRow?.date || ""} onChange={e=>setEditRow(r=>({...r!, date:e.target.value}))} className="bg-black/30 p-1 rounded" /></td>
                    <td><input value={editRow?.note || ""} onChange={e=>setEditRow(r=>({...r!, note:e.target.value}))} className="bg-black/30 p-1 rounded" /></td>
                    <td>
                      <select value={editRow?.cat || ""} onChange={e=>setEditRow(r=>({...r!, cat:e.target.value}))} className="bg-black/30 p-1 rounded">
                        <option value="ocio">Ocio</option>
                        <option value="restauración">Restauración</option>
                        <option value="transporte">Transporte</option>
                        <option value="otros">Otros</option>
                      </select>
                    </td>
                    <td className="text-right">
                      <input type="number" value={editRow?.amount ?? 0}
                        onChange={e=>setEditRow(r=>({...r!, amount:+e.target.value}))}
                        className="bg-black/30 p-1 rounded w-28 text-right" />
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
                      <button onClick={()=>startEdit(s)} className="px-2 py-1 bg-white/10 rounded mr-2">✏️</button>
                      <button onClick={()=>removeSpend(s.id)} className="px-2 py-1 bg-white/10 rounded">🗑️</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {spends.length === 0 && (
              <tr><td colSpan={5} className="py-3 opacity-70">Sin gastos aún.</td></tr>
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
    </main>
  );
}
