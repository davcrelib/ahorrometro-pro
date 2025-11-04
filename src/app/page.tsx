"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  type User,
} from "firebase/auth";

export default function HomePage() {
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [user, setUser] = useState<User | null>(auth.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  async function signInIfNeeded() {
    if (auth.currentUser) return;
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }

  async function handleSignIn() {
    try {
      setSigningIn(true);
      await signInIfNeeded();
      router.push("/app");
    } catch {
      alert(
        "No se pudo iniciar sesión. Revisa Firebase Auth (proveedores habilitados y dominios autorizados)."
      );
    } finally {
      setSigningIn(false);
    }
  }

  async function handleCTA(target: string) {
    try {
      setSigningIn(true);
      await signInIfNeeded();
      router.push(target);
    } catch {
      alert(
        "No se pudo continuar. Comprueba el inicio de sesión de Google y los dominios autorizados en Firebase."
      );
    } finally {
      setSigningIn(false);
    }
  }

  // === Upgrade / Checkout (Stripe) ===
  async function handleUpgrade() {
    try {
      setUpgrading(true);
      if (!auth.currentUser) {
        await signInIfNeeded();
      }
      const current = auth.currentUser;
      if (!current?.uid || !current.email) {
        alert("Inicia sesión primero");
        return;
      }
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: current.uid, email: current.email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) {
        alert("Error creando checkout: " + (json?.error || "desconocido"));
        return;
      }
      window.location.href = json.url;
    } catch {
      alert("Error de red creando checkout");
    } finally {
      setUpgrading(false);
    }
  }

  // Botones con micro-interacciones
  const btnBase =
    "inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-medium transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e141b] disabled:opacity-60 disabled:cursor-not-allowed";
  const btnPrimary =
    `${btnBase} bg-white text-black hover:opacity-90 shadow-sm hover:shadow md:will-change-[transform]`;
  const btnGhost =
    `${btnBase} bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] backdrop-blur supports-[backdrop-filter]:bg-white/5`;

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a0f14] via-[#0c131a] to-[#0a0f14] text-white selection:bg-emerald-400/20 selection:text-white">
      {/* NAVBAR */}
      <nav className="sticky top-0 z-40 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between backdrop-blur supports-[backdrop-filter]:bg-white/5 bg-white/[0.02] border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-white/10 grid place-items-center shadow-inner">
            <span className="text-lg" aria-hidden>
              🏦
            </span>
          </div>
          <span className="font-semibold tracking-tight text-white/95">
            Ahorrómetro
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => handleCTA("/app")}
            className={btnGhost + " hidden sm:inline-flex"}
          >
            Ir al panel
          </button>
          <Link
            href="/demo"
            className={btnGhost + " hidden sm:inline-flex"}
            aria-label="Ver una demostración sin iniciar sesión"
          >
            Ver demo
          </Link>
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className={btnPrimary}
            aria-busy={signingIn}
          >
            {signingIn ? (
              <>
                <Spinner /> Entrando…
              </>
            ) : (
              "Entrar"
            )}
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(59,130,246,0.25),transparent)]"
          aria-hidden
        />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12 md:py-16 lg:py-24 relative">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <h1 className="text-[clamp(2rem,5vw,3.25rem)] font-extrabold leading-tight tracking-tight">
                Tu dinero,{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-300">
                  en tiempo real
                </span>
              </h1>
              <p className="mt-4 text-base sm:text-lg text-white/85">
                Ahorrómetro convierte tus ingresos y gastos en una guía clara:
                ve cuánto <b>ganas cada hora</b>, cuánto puedes{" "}
                <b>gastar esta semana</b> y cómo avanzan tus <b>objetivos</b>.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => handleCTA("/app")}
                  disabled={signingIn}
                  className={btnPrimary + " shadow-md hover:shadow-lg"}
                  aria-busy={signingIn}
                >
                  {signingIn ? (
                    <>
                      <Spinner /> Cargando…
                    </>
                  ) : (
                    "Probar gratis"
                  )}
                </button>
                <a href="#precios" className={btnGhost}>
                  Ver planes
                </a>
              </div>

              <div className="mt-6 grid grid-cols-1 xs:grid-cols-3 sm:grid-cols-3 gap-4 text-sm text-white/85">
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 shadow-sm">
                  <div className="text-2xl font-bold">0€</div>
                  <div className="opacity-80">Plan Free</div>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 shadow-sm">
                  <div className="text-2xl font-bold">5 min</div>
                  <div className="opacity-80">De configuración</div>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 shadow-sm">
                  <div className="text-2xl font-bold">100%</div>
                  <div className="opacity-80">En tu control</div>
                </div>
              </div>
            </div>

            <div className="relative max-w-[680px] mx-auto w-full">
              <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 shadow-2xl p-4 backdrop-blur supports-[backdrop-filter]:bg-white/5">
                <div className="rounded-2xl bg-black/40 border border-white/10 p-4 md:p-5">
                  <div className="text-sm text-white/70">Acumulado este mes</div>
                  <div className="text-3xl sm:text-4xl font-bold mt-1">
                    1.257,34 €
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                      <div className="text-xs text-white/70">€ / hora</div>
                      <div className="text-lg sm:text-xl font-semibold">
                        15,62 €
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                      <div className="text-xs text-white/70">
                        Presupuesto semanal
                      </div>
                      <div className="text-lg sm:text-xl font-semibold">
                        185,00 €
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-sm text-white/70">
                      Progreso hacia tu objetivo
                    </div>
                    <div className="mt-2 h-3 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-3 bg-gradient-to-r from-sky-400 to-emerald-300 w-[38%] motion-safe:transition-[width] motion-safe:duration-700" />
                    </div>
                    <div className="mt-1 text-xs text-white/70">
                      Ahorros: 57.000 € / 150.000 €
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                      <div className="text-white/70">Hoy</div>
                      <div className="font-semibold">−12,50 €</div>
                    </div>
                    <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                      <div className="text-white/70">Semana</div>
                      <div className="font-semibold">Restan 142,50 €</div>
                    </div>
                    <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                      <div className="text-white/70">Mes</div>
                      <div className="font-semibold">Libre 420,00 €</div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full blur-3xl bg-emerald-400/30"
                aria-hidden
              />
              <div
                className="absolute -top-6 -right-8 h-24 w-24 rounded-full blur-3xl bg-sky-400/30"
                aria-hidden
              />
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="text-center text-white/75 text-sm">
          Con hábitos reales, no magia ✨
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-2xl md:text-3xl font-bold text-center">
          Todo lo que necesitas para ahorrar sin Excel
        </h2>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl bg-white/5 border border-white/10 p-5 shadow-sm transition hover:border-white/20 hover:bg-white/10 hover:shadow"
            >
              <div className="text-2xl" aria-hidden>
                {f.emoji}
              </div>
              <div className="mt-2 font-semibold">{f.title}</div>
              <p className="mt-1 text-sm text-white/85">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl md:text-3xl font-bold text-center">
          Cómo funciona
        </h2>
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {steps.map((s, idx) => (
            <div
              key={s.title}
              className="rounded-2xl bg-white/5 border border-white/10 p-5 shadow-sm transition hover:border-white/20 hover:bg-white/10 hover:shadow"
            >
              <div className="h-8 w-8 grid place-items-center rounded-lg bg-white/10 border border-white/10 font-bold text-sm">
                {idx + 1}
              </div>
              <div className="mt-2 font-semibold">{s.title}</div>
              <p className="mt-1 text-sm text-white/85">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <button
            onClick={() => handleCTA("/app")}
            disabled={signingIn}
            className={btnPrimary + " shadow-md hover:shadow-lg"}
            aria-busy={signingIn}
          >
            {signingIn ? (
              <>
                <Spinner /> Cargando…
              </>
            ) : (
              "Empieza ahora"
            )}
          </button>
        </div>
      </section>

      {/* TESTIMONIOS */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl md:text-3xl font-bold text-center">
          Historias reales
        </h2>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="rounded-2xl bg-white/5 border border-white/10 p-5 shadow-sm transition hover:border-white/20 hover:bg-white/10 hover:shadow"
            >
              <p className="text-sm text-white/90">“{t.quote}”</p>
              <div className="mt-3 text-xs text-white/70">{t.name}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section
        id="precios"
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12"
      >
        <h2 className="text-2xl md:text-3xl font-bold text-center">
          Precios simples
        </h2>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* FREE */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 flex flex-col shadow-sm">
            <div className="text-sm uppercase tracking-wider text-white/70">
              Free
            </div>
            <div className="mt-1 text-4xl font-extrabold">0 €</div>
            <ul className="mt-4 text-sm space-y-2 text-white/85">
              <li>• Cálculo € / hora y acumulado mensual</li>
              <li>• Registro de gastos ilimitado</li>
              <li>• Datos en tu dispositivo local</li>
            </ul>
            <div className="mt-6">
              <button
                onClick={() => handleCTA("/app")}
                disabled={signingIn}
                className={btnPrimary + " w-full shadow-md hover:shadow-lg"}
                aria-busy={signingIn}
              >
                {signingIn ? (
                  <>
                    <Spinner /> Cargando…
                  </>
                ) : (
                  "Empieza gratis"
                )}
              </button>
            </div>
          </div>

          {/* PRO */}
          <div className="relative rounded-3xl border border-emerald-300/30 bg-gradient-to-b from-emerald-400/10 to-emerald-400/5 p-6 flex flex-col shadow-[0_0_0_1px_rgba(16,185,129,0.15)]">
            <div className="absolute -top-3 right-6 text-xs px-2 py-1 rounded-full bg-emerald-400 text-black font-semibold shadow">
              Recomendado
            </div>
            <div className="text-sm uppercase tracking-wider text-white/70">
              Pro
            </div>
            <div className="mt-1 text-4xl font-extrabold">
              2,99 €<span className="text-base font-semibold text-white/70">
                {" "}
                / mes
              </span>
            </div>
            <ul className="mt-4 text-sm space-y-2 text-white/85">
              <li>• Sincronización en la nube (móvil y PC)</li>
              <li>• Backups automáticos y exportación 1-click</li>
              <li>• Soporte personalizado</li>
              <li>• Próximamente notificaciones para recordatorios</li>
            </ul>
            <div className="mt-6">
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                className={btnPrimary + " w-full shadow-md hover:shadow-lg"}
                aria-busy={upgrading}
              >
                {upgrading ? (
                  <>
                    <Spinner /> Redirigiendo…
                  </>
                ) : (
                  "Actualizar a Pro"
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl md:text-3xl font-bold text-center">
          Preguntas frecuentes
        </h2>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {faq.map((q) => (
            <div
              key={q.q}
              className="rounded-2xl bg-white/5 border border-white/10 p-5 shadow-sm transition hover:border-white/20 hover:bg-white/10 hover:shadow"
            >
              <div className="font-semibold">{q.q}</div>
              <p className="mt-1 text-sm text-white/85">{q.a}</p>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin motion-reduce:hidden"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-white/75">
        <div>© {new Date().getFullYear()} Ahorrómetro. Hecho con ❤️ en España.</div>
        <div className="flex items-center gap-4">
          <Link
            href="/terminos"
            className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 rounded-md px-1"
          >
            Términos
          </Link>
          <Link
            href="/privacidad"
            className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 rounded-md px-1"
          >
            Privacidad
          </Link>
          <a
            href="#precios"
            className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 rounded-md px-1"
          >
            Precios
          </a>
        </div>
      </div>
    </footer>
  );
}

// ====== Datos estáticos ======
const features = [
  {
    emoji: "⏱️",
    title: "Dinero hora a hora",
    desc:
      "Ve cuánto llevas acumulado este mes en tiempo real. Motivación diaria sin fórmulas raras.",
  },
  {
    emoji: "🧾",
    title: "Gastos en 3 toques",
    desc:
      "Apunta cualquier gasto al momento. Categorías simples y sin complicaciones.",
  },
  {
    emoji: "📆",
    title: "Límite semanal automático",
    desc:
      "El sistema calcula cuánto puedes gastar esta semana para no romper tu objetivo.",
  },
  {
    emoji: "🎯",
    title: "Objetivo (ej. entrada piso)",
    desc:
      "Marca tu meta (ej. 150.000 €) y fecha. Calculamos el ahorro mensual que necesitas.",
  },
  {
    emoji: "☁️",
    title: "Sincronización (Pro)",
    desc:
      "Tus datos en la nube: iPhone y portátil siempre iguales. Backups automáticos.",
  },
  {
    emoji: "📈",
    title: "Métricas claras",
    desc:
      "€ / hora, acumulado del mes, progreso y tendencia semanal. Todo a simple vista.",
  },
];

const steps = [
  {
    title: "Crea tu plan",
    desc: "Introduce sueldo, gastos fijos, ahorros y la fecha objetivo.",
  },
  {
    title: "Apunta tus gastos",
    desc: "Anótalos al momento. El límite semanal se ajusta automáticamente.",
  },
  {
    title: "Sigue el progreso",
    desc: "Revisa tu acumulado y cómo te acercas a tus objetivos.",
  },
];

const testimonials = [
  {
    name: "María, 27 — Barcelona",
    quote:
      "Por fin entiendo cuánto puedo gastar sin sentir culpa. En 2 meses he ahorrado más que en todo el año.",
  },
  {
    name: "Javi, 31 — Madrid",
    quote:
      "El contador por horas me motiva a no gastar de más. El objetivo del piso ya no parece imposible.",
  },
  {
    name: "Laura, 25 — Valencia",
    quote:
      "Ligero y claro. Tengo mis gastos controlados sin depender del banco ni hojas de Excel.",
  },
];

const faq = [
  {
    q: "¿Necesito conectar mis bancos?",
    a:
      "No. Lo apuntas tú en segundos. Tus datos son tuyos y puedes exportarlos cuando quieras.",
  },
  {
    q: "¿Funciona sin internet?",
    a:
      "No. Tienes que tener una conexión a internet. Para disfrutar sin conexión puedes trabajar en local utilizando el código fuente en github.",
  },
  {
    q: "¿Qué incluye el plan Pro?",
    a:
      "Sincronización entre dispositivos, múltiples objetivos, backups automáticos y recordatorios.",
  },
  {
    q: "¿Puedo cancelar cuando quiera?",
    a:
      "Claro. Sin permanencia. Si cancelas, tu información sigue siendo tuya.",
  },
];
