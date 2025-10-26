"use client";
import { auth, db } from "@/lib/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import {
  doc, setDoc, getDoc, collection, addDoc,
  query, orderBy, onSnapshot, serverTimestamp
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

type Plan = {
  income: number; fixed: number; currentSavings: number; goal: number;
  targetDate: string | null; hoursPerMonth: number;
};

type Spend = {
  note: string; amount: number; date: string; cat: string; createdAt?: any;
};

const fmt = (n?: number) => (typeof n === "number" ? n.toLocaleString("es-ES",{style:"currency",currency:"EUR"}) : "—");
const todayISO = () => new Date().toISOString().slice(0,10);

export default function AppPage() {
  const [user, loading] = useAuthState(auth);
  const [plan, setPlan] = useState<Plan>({
    income: 0, fixed: 0, currentSavings: 0, goal: 150000,
    targetDate: null, hoursPerMonth: 160
  });
  const [spends, setSpends] = useState<Spend[]>([]);
  const [note, setNote] = useState(""); const [amount, setAmount] = useState<string>(""); 
  const [date, setDate] = useState(todayISO()); const [cat, setCat] = useState("otros");

  useEffect(() => {
    if (!user) return;
    // Carga plan
    const planRef = doc(db, "users", user.uid, "plans", "default");
    getDoc(planRef).then(s => s.exists() && setPlan(s.data() as Plan));
    // Suscribe gastos
    const q = query(collection(db, "users", user.uid, "expenses"), orderBy("createdAt","desc"));
    const unsub = onSnapshot(q, snap => {
      const rows: Spend[] = [];
      snap.forEach(d => rows.push(d.data() as Spend));
      setSpends(rows);
    });
    return () => unsub();
  }, [user]);

  async function savePlan(){
    if (!user) return;
    await setDoc(doc(db, "users", user.uid, "plans", "default"), plan, { merge:true });
    alert("Plan guardado ✅");
  }

  async function addSpend(){
    if (!user) return;
    const val = parseFloat(amount || "0");
    if (!(val>0)) { alert("Importe inválido"); return; }
    await addDoc(collection(db, "users", user.uid, "expenses"), {
      note: note.trim() || "Gasto",
      amount: val, date, cat, createdAt: serverTimestamp()
    });
    setAmount(""); setNote("");
  }

  const monthsLeft = useMemo(() => {
    if (!plan.targetDate) return null;
    const a = new Date(plan.targetDate+"T00:00:00"), b = new Date();
    let m = (a.getFullYear()-b.getFullYear())*12 + (a.getMonth()-b.getMonth());
    if (a.getDate() - b.getDate() < 0) m -= 1;
    return Math.max(0, m);
  }, [plan.targetDate]);

  const needMonthly = useMemo(() => {
    if (!monthsLeft || monthsLeft <= 0) return 0;
    return Math.max(0, (plan.goal - plan.currentSavings) / monthsLeft);
  }, [monthsLeft, plan.goal, plan.currentSavings]);

  const leftover = Math.max(0, plan.income - plan.fixed - needMonthly);
  const weekly = leftover / 4.33;

  return loading ? <div className="p-6">Cargando…</div> : (
    <main className="p-4 max-w-6xl mx-auto space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🏦 Ahorrómetro</h1>
      </header>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <h2 className="font-semibold mb-2">Tu plan</h2>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Sueldo neto mensual" type="number" value={plan.income || ""} onChange={e=>setPlan(p=>({...p, income:+e.target.value}))} className="bg-black/30 p-2 rounded" />
            <input placeholder="Gastos fijos" type="number" value={plan.fixed || ""} onChange={e=>setPlan(p=>({...p, fixed:+e.target.value}))} className="bg-black/30 p-2 rounded" />
            <input placeholder="Ahorros actuales" type="number" value={plan.currentSavings || ""} onChange={e=>setPlan(p=>({...p, currentSavings:+e.target.value}))} className="bg-black/30 p-2 rounded" />
            <input placeholder="Objetivo (150000)" type="number" value={plan.goal || ""} onChange={e=>setPlan(p=>({...p, goal:+e.target.value}))} className="bg-black/30 p-2 rounded" />
            <input placeholder="Fecha objetivo" type="date" value={plan.targetDate || ""} onChange={e=>setPlan(p=>({...p, targetDate:e.target.value||null}))} className="bg-black/30 p-2 rounded" />
            <input placeholder="Horas/mes (160)" type="number" value={plan.hoursPerMonth || ""} onChange={e=>setPlan(p=>({...p, hoursPerMonth:+e.target.value}))} className="bg-black/30 p-2 rounded" />
          </div>
          <button onClick={savePlan} className="mt-3 rounded px-3 py-2 bg-white text-black">Guardar plan</button>

          <div className="mt-3 text-sm opacity-90 space-y-1">
            <div>Meses restantes: <b>{monthsLeft ?? "—"}</b></div>
            <div>Ahorro mensual necesario: <b>{fmt(needMonthly)}</b></div>
            <div>Resto mensual (gasto libre): <b>{fmt(leftover)}</b></div>
            <div>Semanal: <b>{fmt(weekly)}</b></div>
          </div>
        </div>

        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <h2 className="font-semibold mb-2">Apuntar un gasto</h2>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Concepto" value={note} onChange={e=>setNote(e.target.value)} className="bg-black/30 p-2 rounded" />
            <input placeholder="Importe (€)" type="number" value={amount} onChange={e=>setAmount(e.target.value)} className="bg-black/30 p-2 rounded" />
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="bg-black/30 p-2 rounded" />
            <select value={cat} onChange={e=>setCat(e.target.value)} className="bg-black/30 p-2 rounded">
              <option value="ocio">Ocio</option>
              <option value="restauración">Restauración</option>
              <option value="transporte">Transporte</option>
              <option value="otros">Otros</option>
            </select>
          </div>
          <div className="mt-2 text-sm">Semana restante aprox.: <b>{fmt(weekly)}</b> (menos lo gastado)</div>
          <button onClick={addSpend} className="mt-3 rounded px-3 py-2 bg-white text-black">Añadir gasto</button>
        </div>
      </section>

      <section className="rounded-2xl p-4 bg-white/5 border border-white/10">
        <h2 className="font-semibold mb-2">Historial</h2>
        <table className="w-full text-sm">
          <thead className="opacity-80">
            <tr><th className="text-left">Fecha</th><th className="text-left">Concepto</th><th className="text-left">Categoría</th><th className="text-right">Importe</th></tr>
          </thead>
          <tbody>
            {spends.map((s, i) => (
              <tr key={i} className="border-t border-white/10">
                <td>{s.date}</td><td>{s.note}</td><td>{s.cat}</td><td className="text-right">{fmt(s.amount)}</td>
              </tr>
            ))}
            {spends.length===0 && <tr><td colSpan={4} className="py-3 opacity-70">Sin gastos aún.</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}
