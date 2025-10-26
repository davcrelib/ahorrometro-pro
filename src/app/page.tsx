"use client";
import { auth, provider, db } from "@/lib/firebase";
import { signInWithPopup, signOut } from "firebase/auth";
import { useAuthState } from "react-firebase-hooks/auth";
import Link from "next/link";

export default function Home() {
  const [user, loading] = useAuthState(auth);

  if (loading) return <div className="p-6">Cargando…</div>;

  if (!user) {
    return (
      <main className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">🏦 Ahorrómetro</h1>
        <p className="opacity-90 mb-6">Tu dinero, en tiempo real. Sin complicarte.</p>
        <button
          onClick={() => signInWithPopup(auth, provider)}
          className="rounded-xl px-4 py-2 bg-white text-black"
        >
          Entrar con Google
        </button>
      </main>
    );
  }

  return (
    <main className="p-4 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div className="font-semibold">Hola, {user.displayName?.split(" ")[0]} 👋</div>
        <div className="flex gap-2">
          <Link href="/app" className="underline">Ir al Ahorrómetro</Link>
          <button onClick={() => signOut(auth)} className="rounded px-3 py-1 bg-white/10">
            Salir
          </button>
        </div>
      </header>
      <section className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <h2 className="font-semibold mb-2">Listo para usar</h2>
        <p className="opacity-90">Abre el panel y empieza a guardar tu plan y gastos.</p>
      </section>
    </main>
  );
}
