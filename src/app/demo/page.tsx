"use client";
import Link from "next/link";

// Mock muy simple (no Firestore, no login)
const plan = {
  income: 2500,
  fixed: 1200,
  currentSavings: 57000,
  goal: 150000,
  targetDate: "2028-04-26",
  hoursPerMonth: 160,
};

const spends = [
  { date: "2025-10-26", note: "Café", cat: "restauración", amount: 2.5 },
  { date: "2025-10-26", note: "Metro", cat: "transporte", amount: 1.5 },
  { date: "2025-10-25", note: "Cena", cat: "restauración", amount: 18.0 },
];

const fmt = (n?: number) =>
  typeof n === "number"
    ? n.toLocaleString("es-ES", { style: "currency", currency: "EUR" })
    : "—";

function weeklySpent() {
  return spends.reduce((a, s) => a + s.amount, 0);
}

export default function DemoPage() {
  const leftover = plan.income - plan.fixed - ((plan.goal - plan.currentSavings) / 30) * 1; // aprox (meses fake)
  const weeklyBudget = Math.max(0, leftover / 4.33);
  const progress = Math.min(100, Math.max(0, (plan.currentSavings / plan.goal) * 100));

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0b0f14] via-[#0e141b] to-[#0b0f14] text-white p-4 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🏦 Ahorrómetro — Demo</h1>
        <div className="flex gap-2">
          <Link href="/" className="px-3 py-2 rounded-xl bg-white/10 border border-white/15">← Volver</Link>
          <Link href="/app" className="px-3 py-2 rounded-xl bg-white text-black">Entrar y usarlo de verdad</Link>
        </div>
      </header>

      <section className="rounded-2xl p-4 bg-white/5 border border-white/10">
        <div className="mb-2 text-sm text-white/80">
          Vista de ejemplo. <b>No guarda datos</b> y <b>no requiere registro</b>.
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
            <div className="opacity-80 text-sm">Acumulado este mes</div>
            <div className="text-2xl font-semibold mt-1">{fmt(plan.income * 0.5)}</div>
            <div className="opacity-70 text-xs mt-1">Demo (50% del mes)</div>
          </div>
          <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
            <div className="opacity-80 text-sm">€ / hora</div>
            <div className="text-2xl font-semibold mt-1">{fmt(plan.income / plan.hoursPerMonth)}</div>
            <div className="opacity-70 text-xs mt-1">{plan.hoursPerMonth} h/mes</div>
          </div>
          <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
            <div className="opacity-80 text-sm">Semanal (presupuesto)</div>
            <div className="text-2xl font-semibold mt-1">{fmt(weeklyBudget)}</div>
            <div className="opacity-70 text-xs mt-1">Libre tras fijos + ahorro</div>
          </div>
          <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
            <div className="opacity-80 text-sm">Semanal (gastado)</div>
            <div className="text-2xl font-semibold mt-1">{fmt(weeklySpent())}</div>
            <div className="opacity-70 text-xs mt-1">Demo (muestra)</div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl p-4 bg-white/5 border border-white/10">
        <h2 className="font-semibold mb-2">Progreso hacia tu objetivo</h2>
        <div className="text-sm opacity-90 mb-2">
          Ahorros: <b>{fmt(plan.currentSavings)}</b> / Objetivo: <b>{fmt(plan.goal)}</b> · Fecha objetivo: <b>{plan.targetDate}</b>
        </div>
        <div className="w-full h-3 bg-white/10 rounded-xl overflow-hidden">
          <div className="h-3 bg-white/70" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="rounded-2xl p-4 bg-white/5 border border-white/10">
        <h2 className="font-semibold mb-2">Historial (ejemplo)</h2>
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
          </tbody>
        </table>
        <div className="mt-3 text-sm opacity-80">
          ¿Te mola? <Link className="underline" href="/app">Inicia sesión</Link> y guarda tus datos de verdad.
        </div>
      </section>
    </main>
  );
}
