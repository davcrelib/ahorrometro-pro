"use client";

import { auth, db } from "@/lib/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { collection, query, where, orderBy, getDocs, doc, getDoc } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip as RTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Legend, ResponsiveContainer,
} from "recharts";

type Spend = { id?: string; note: string; amount: number; date: string; cat: string };
type Plan = {
  income: number; fixed: number; currentSavings: number; goal: number;
  targetDate: string | null; hoursPerMonth: number;
};

const fmt = (n:number)=>n.toLocaleString("es-ES",{style:"currency",currency:"EUR"});

function monthRangeISO(yyyyMM: string) {
  const [y,m] = yyyyMM.split("-").map(Number);
  const start = new Date(y, m-1, 1);
  const end   = new Date(y, m,   0);
  const sISO = start.toISOString().slice(0,10);
  const eISO = end.toISOString().slice(0,10);
  return { sISO, eISO };
}

export default function MetricsPage() {
  const [user, loading] = useAuthState(auth);
  const [spends, setSpends] = useState<Spend[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);

  const [monthISO, setMonthISO] = useState(()=> {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  });

  // Carga plan (para presupuesto mensual real)
  useEffect(() => {
    (async () => {
      if (!user) return;
      const snap = await getDoc(doc(db, "users", user.uid, "plans", "default"));
      if (snap.exists()) setPlan(snap.data() as Plan);
    })();
  }, [user]);

  // Carga gastos del mes seleccionado
  useEffect(() => {
    (async () => {
      if (!user) return;
      const { sISO, eISO } = monthRangeISO(monthISO);
      const qx = query(
        collection(db,"users",user.uid,"expenses"),
        where("date", ">=", sISO),
        where("date", "<=", eISO),
        orderBy("date","asc")
      );
      const snap = await getDocs(qx);
      const rows: Spend[] = [];
      snap.forEach(d => rows.push({ id:d.id, ...(d.data() as Spend) }));
      setSpends(rows);
    })();
  }, [user, monthISO]);

  // Agregados
  const byCat = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of spends) map[s.cat] = (map[s.cat]||0)+ (s.amount||0);
    return Object.entries(map).map(([name, value])=>({name, value}));
  }, [spends]);

  const byDay = useMemo(() => {
    const days: Record<string, number> = {};
    for (const s of spends) days[s.date] = (days[s.date]||0)+ (s.amount||0);
    return Object.entries(days).sort(([a],[b])=>a.localeCompare(b))
      .map(([date, value])=>({ date: date.slice(8), value }));
  }, [spends]);

  const totals = useMemo(() => {
    const spent = spends.reduce((a,s)=>a+(s.amount||0),0);
    return { spent };
  }, [spends]);

  // Presupuesto mensual basado en tu plan (igual que en /app)
  const monthlyBudget = useMemo(() => {
    if (!plan) return 0;
    // meses restantes hasta targetDate
    let monthsLeft = 0;
    if (plan.targetDate) {
      const a = new Date(plan.targetDate + "T00:00:00");
      const b = new Date();
      monthsLeft = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
      if (a.getDate() - b.getDate() < 0) monthsLeft -= 1;
      monthsLeft = Math.max(0, monthsLeft);
    }
    const needMonthly = monthsLeft > 0 ? Math.max(0, (plan.goal - plan.currentSavings) / monthsLeft) : 0;
    const leftover = Math.max(0, (plan.income || 0) - (plan.fixed || 0) - needMonthly);
    // leftover ya es “libre mensual”
    return leftover;
  }, [plan]);

  const monthlyRemaining = Math.max(0, monthlyBudget - totals.spent);

  if (loading) return <div className="p-6">Carregant…</div>;
  if (!user) return (
    <div className="p-6">
      Inicia sessió. <Link className="underline" href="/">Inici</Link>
    </div>
  );

  return (
    <main className="p-4 max-w-6xl mx-auto space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">📊 Métricas </h1>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={monthISO}
            onChange={e=>setMonthISO(e.target.value)}
            className="bg-white/10 px-2 py-1 rounded"
          />
          <Link href="/app" className="px-3 py-1 bg-white/10 rounded">← Volver</Link>
        </div>
      </header>

      <section className="grid md:grid-cols-2 gap-4">
        {/* Gasto por categoría */}
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <h2 className="font-semibold mb-2">Gasto por categoria</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie dataKey="value" data={byCat} innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {byCat.map((_,i)=>(<Cell key={i} />))}
                </Pie>
                <RTooltip formatter={(v)=>fmt(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gasto diario del mes */}
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <h2 className="font-semibold mb-2">Gasto diario (mes)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <RTooltip formatter={(v)=>fmt(Number(v))} />
                <Line type="monotone" dataKey="value" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        {/* Presupuesto vs Gastado */}
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <h2 className="font-semibold mb-2">Presupuesto vs gastado (mes)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ name: "Mensual", budget: monthlyBudget, spent: totals.spent, remaining: monthlyRemaining }]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" /><YAxis /><Legend />
                <RTooltip formatter={(v)=>fmt(Number(v))} />
                <Bar dataKey="budget" />
                <Bar dataKey="spent" />
                <Bar dataKey="remaining" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-sm opacity-90">
            Presupuesto: <b>{fmt(monthlyBudget)}</b> · Gastado: <b>{fmt(totals.spent)}</b> · Resta: <b>{fmt(monthlyRemaining)}</b>
          </div>
        </div>

        {/* Top conceptos */}
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <h2 className="font-semibold mb-2">Top conceptos (mes)</h2>
          <ul className="space-y-1 text-sm">
            {Object.entries(
              spends.reduce((acc: Record<string, number>, s) => {
                acc[s.note] = (acc[s.note] || 0) + (s.amount || 0);
                return acc;
              }, {})
            )
              .sort((a,b)=>b[1]-a[1])
              .slice(0,5)
              .map(([note,value])=>(
                <li key={note} className="flex justify-between">
                  <span className="truncate">{note}</span>
                  <span>{fmt(value)}</span>
                </li>
              ))
            }
            {spends.length===0 && <li className="opacity-70">Sense dades</li>}
          </ul>
        </div>
      </section>
    </main>
  );
}
