"use client";

import { auth, db } from "@/lib/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import {
  doc, setDoc, getDoc, collection, addDoc,
  query, orderBy, onSnapshot, serverTimestamp
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Plan = {
  income: number;               // sueldo neto mensual
  fixed: number;                // gastos fijos mensuales
  currentSavings: number;       // ahorros actuales
  goal: number;                 // objetivo de ahorro (piso, etc.)
  targetDate: string | null;    // fecha objetivo (YYYY-MM-DD)
  hoursPerMonth: number;        // horas trabajadas/mes (para €/h)
};

type Spend = {
  note: string;
  amount: number;
  date: string;                 // YYYY-MM-DD
  cat: string;
  createdAt?: any;              // serverTimestamp
};

const fmt = (n?: number) =>
  typeof n === "number"
    ? n.toLocaleString("es-ES", { style: "currency", currency: "EUR" })
    : "—";

const todayISO = () => new Date().toISOString().slice(0, 10);

// ——— helpers de semana (Lunes-Domingo en Europa/Madrid aprox. sin tz) ———
function startOfWeek(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();       // 0 dom, 1 lun, ...
  const diff = (day === 0 ? -6 : 1 - day); // mover a lunes
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

// progreso temporal dentro del mes (para “dinero hora a hora”)
function monthProgressFraction(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  if (total <= 0) return 0;
  const f = Math.min(1, Math.max(0, elapsed / total));
  return f;
}

export default function AppPage() {
  const [user, loading] = useAuthState(auth);

  // Perfil básico: planTier = "free" | "pro"
  const [planTier, setPlanTier] = useState<"free" | "pro">("free");

  const [plan, setPlan] = useState<Plan>({
    income: 0,
    fixed: 0,
    currentSavings: 0,
    goal: 150000,
    targetDate: null,
    hoursPerMonth: 160,
  });

  const [spends, setSpends] = useState<Spend[]>([]);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState(todayISO());
  const [cat, setCat] = useState("otros");

  // “Dinero hora a hora” (se recalcula cada segundo)
  const [earnedThisMonth, setEarnedThisMonth] = useState<number>(0);

  // ——— cargar perfil + plan + suscripción de gastos ———
  useEffect(() => {
    if (!user) return;

    // Perfil (users/{uid}) → planTier
    const userRef = doc(db, "users", user.uid);
    getDoc(userRef).then(async snap => {
      if (snap.exists()) {
        const data = snap.data() as any;
        setPlanTier(data?.planTier === "pro" ? "pro" : "free");
      } else {
        await setDoc(userRef, { planTier: "free", createdAt: serverTimestamp() }, { merge: true });
        setPlanTier("free");
      }
    });

    // Plan por defecto
    const planRef = doc(db, "users", user.uid, "plans", "default");
    getDoc(planRef).then(s => s.exists() && setPlan(s.data() as Plan));

    // Gastos tiempo real
    const q = query(collection(db, "users", user.uid, "expenses"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      const rows: Spend[] = [];
      snap.forEach(d => rows.push(d.data() as Spend));
      setSpends(rows);
    });

    return () => unsub();
  }, [user]);

  // ——— guardar plan ———
  async function savePlan() {
    if (!user) return;
    await setDoc(doc(db, "users", user.uid, "plans", "default"), plan, { merge: true });
    alert("Plan guardado ✅");
  }

  // ——— añadir gasto ———
  async function addSpend() {
    if (!user) return;
    const val = parseFloat(amount || "0");
    if (!(val > 0)) {
      alert("Importe inválido");
      return;
    }
    await addDoc(collection(db, "users", user.uid, "expenses"), {
      note: note.trim() || "Gasto",
      amount: val,
      date,
      cat,
      createdAt: serverTimestamp(),
    });
    setAmount("");
    setNote("");
  }

  // ——— cálculo de metas y presupuestos ———
  const monthsLeft = useMemo(() => {
    if (!plan.targetDate) return null;
    const a = new Date(plan.targetDate + "T00:00:00");
    const b = new Date();
    let m = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
    // si aún no llegamos al día del mes objetivo, resta 1
    if (a.getDate() - b.getDate() < 0) m -= 1;
    return Math.max(0, m);
  }, [plan.targetDate]);

  const needMonthly = useMemo(() => {
    if (!monthsLeft || monthsLeft <= 0) return 0;
    return Math.max(0, (plan.goal - plan.currentSavings) / monthsLeft);
  }, [monthsLeft, plan.goal, plan.currentSavings]);

  const leftover = Math.max(0, plan.income - plan.fixed - needMonthly);
  const weeklyBudget = leftover / 4.33;

  // ——— gasto semanal acumulado ———
  const weeklySpent = useMemo(() => {
    if (!spends.length) return 0;
    const start = startOfWeek();
    const end = endOfWeek();
    return spends.reduce((acc, s) => {
      const d = new Date((s.date || "").replace(/-/g, "/")); // robustez parse
      if (d >= start && d <= end) acc += s.amount || 0;
      return acc;
    }, 0);
  }, [spends]);

  const weeklyRemaining = Math.max(0, weeklyBudget - weeklySpent);

  // ——— contador “dinero hora a hora” ———
  useEffect(() => {
    function refresh() {
      const f = monthProgressFraction(new Date());
      setEarnedThisMonth(plan.income * f);
    }
    refresh();
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [plan.income]);

  // ——— upgrade to pro ———
  const checkoutURL = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_URL || "";
  function handleUpgrade() {
    if (!checkoutURL) {
      alert("Configura NEXT_PUBLIC_STRIPE_CHECKOUT_URL en tu entorno para habilitar el upgrade.");
      return;
    }
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

  const euroPerHour =
    plan.hoursPerMonth > 0 ? plan.income / plan.hoursPerMonth : 0;

  // progreso hacia objetivo
  const goalProgress =
    plan.goal > 0
      ? Math.min(100, Math.max(0, (plan.currentSavings / plan.goal) * 100))
      : 0;

  return (
    <main className="p-4 max-w-6xl mx-auto space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🏦 Ahorrómetro</h1>
        <div className="text-sm opacity-90">
          Sesión: <b>{user.email}</b>
        </div>
      </header>

      {/* Banner Pro */}
      {planTier === "free" ? (
        <section className="rounded-2xl p-4 border border-yellow-400/30 bg-yellow-400/10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="font-semibold">Plan Free</div>
              <div className="opacity-90 text-sm">
                Sincronización en tiempo real incluida. Desbloquea <b>múltiples objetivos</b>,{" "}
                <b>recordatorios</b> y <b>backups automáticos</b> con <span className="font-semibold">Pro</span>.
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleUpgrade}
                className="rounded-xl px-4 py-2 bg-white text-black"
              >
                🚀 Upgrade to Pro
              </button>
              <Link href="/billing" className="rounded-xl px-4 py-2 bg-white/10 border border-white/15">
                Ver planes
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl p-3 border border-emerald-400/30 bg-emerald-400/10">
          <div className="text-sm"><b>Pro activo</b> — gracias por apoyar el proyecto 💚</div>
        </section>
      )}

      {/* Top stats */}
      <section className="grid md:grid-cols-4 gap-4">
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <div className="opacity-80 text-sm">Acumulado este mes</div>
          <div className="text-2xl font-semibold mt-1">{fmt(earnedThisMonth)}</div>
          <div className="opacity-70 text-xs mt-1">Prorrateo de tu sueldo mensual</div>
        </div>
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <div className="opacity-80 text-sm">€ / hora</div>
          <div className="text-2xl font-semibold mt-1">{fmt(euroPerHour)}</div>
          <div className="opacity-70 text-xs mt-1">{plan.hoursPerMonth || 0} h/mes</div>
        </div>
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <div className="opacity-80 text-sm">Semanal (presupuesto)</div>
          <div className="text-2xl font-semibold mt-1">{fmt(weeklyBudget)}</div>
          <div className="opacity-70 text-xs mt-1">Libre tras fijos + ahorro requerido</div>
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
          <div
            className="h-3 bg-white/70"
            style={{ width: `${goalProgress}%` }}
            aria-label={`Progreso ${goalProgress.toFixed(1)}%`}
          />
        </div>
        <div className="mt-3 text-sm opacity-90 grid md:grid-cols-3 gap-2">
          <div>Meses restantes: <b>{monthsLeft ?? "—"}</b></div>
          <div>Ahorro mensual necesario: <b>{fmt(needMonthly)}</b></div>
          <div>Libre mensual (después de fijos+ahorro): <b>{fmt(leftover)}</b></div>
        </div>
      </section>

      {/* Plan + Añadir gasto */}
      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <h2 className="font-semibold mb-2">Tu plan</h2>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Sueldo neto mensual"
              type="number"
              value={plan.income || ""}
              onChange={e => setPlan(p => ({ ...p, income: +e.target.value }))}
              className="bg-black/30 p-2 rounded"
            />
            <input
              placeholder="Gastos fijos"
              type="number"
              value={plan.fixed || ""}
              onChange={e => setPlan(p => ({ ...p, fixed: +e.target.value }))}
              className="bg-black/30 p-2 rounded"
            />
            <input
              placeholder="Ahorros actuales"
              type="number"
              value={plan.currentSavings || ""}
              onChange={e => setPlan(p => ({ ...p, currentSavings: +e.target.value }))}
              className="bg-black/30 p-2 rounded"
            />
            <input
              placeholder="Objetivo (150000)"
              type="number"
              value={plan.goal || ""}
              onChange={e => setPlan(p => ({ ...p, goal: +e.target.value }))}
              className="bg-black/30 p-2 rounded"
            />
            <input
              placeholder="Fecha objetivo"
              type="date"
              value={plan.targetDate || ""}
              onChange={e => setPlan(p => ({ ...p, targetDate: e.target.value || null }))}
              className="bg-black/30 p-2 rounded"
            />
            <input
              placeholder="Horas/mes (160)"
              type="number"
              value={plan.hoursPerMonth || ""}
              onChange={e => setPlan(p => ({ ...p, hoursPerMonth: +e.target.value }))}
              className="bg-black/30 p-2 rounded"
            />
          </div>
          <button onClick={savePlan} className="mt-3 rounded px-3 py-2 bg-white text-black">
            Guardar plan
          </button>
          <div className="mt-3 text-sm opacity-90 space-y-1">
            <div>Semanal: <b>{fmt(weeklyBudget)}</b></div>
            <div>Diario (aprox): <b>{fmt(leftover / 30.4)}</b></div>
          </div>
        </div>

        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <h2 className="font-semibold mb-2">Apuntar un gasto</h2>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Concepto"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="bg-black/30 p-2 rounded"
            />
            <input
              placeholder="Importe (€)"
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="bg-black/30 p-2 rounded"
            />
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="bg-black/30 p-2 rounded"
            />
            <select
              value={cat}
              onChange={e => setCat(e.target.value)}
              className="bg-black/30 p-2 rounded"
            >
              <option value="ocio">Ocio</option>
              <option value="restauración">Restauración</option>
              <option value="transporte">Transporte</option>
              <option value="otros">Otros</option>
            </select>
          </div>
          <div className="mt-2 text-sm">
            Semana restante aprox.: <b>{fmt(weeklyRemaining)}</b> (gastado: {fmt(weeklySpent)})
          </div>
          <button onClick={addSpend} className="mt-3 rounded px-3 py-2 bg-white text-black">
            Añadir gasto
          </button>
        </div>
      </section>

      {/* Historial */}
      <section className="rounded-2xl p-4 bg-white/5 border border-white/10">
        <h2 className="font-semibold mb-2">Historial</h2>
        <table className="w-full text-sm">
          <thead className="opacity-80">
            <tr>
              <th className="text-left">Fecha</th>
              <th className="text-left">Concepto</th>
              <th className="text-left">Categoría</th>
              <th className="text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {spends.map((s, i) => (
              <tr key={i} className="border-t border-white/10">
                <td>{s.date}</td>
                <td>{s.note}</td>
                <td>{s.cat}</td>
                <td className="text-right">{fmt(s.amount)}</td>
              </tr>
            ))}
            {spends.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 opacity-70">
                  Sin gastos aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
