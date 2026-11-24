import { useState, type FormEvent } from "react";
import { isDemoMode } from "@/config/env";
import { isFirebaseConfigured } from "@/services/firebase";
import { horusBrand } from "@/config/horus.brand";
import { DEMO_USERS } from "@/demo/demoUsers";
import type { Role } from "@/domain/types";
import { useSession } from "@/session/SessionContext";

type Tab = "demo" | "account";

interface RoleCard {
  role: Role;
  title: string;
  badge: string;
  description: string;
  icon: string;
  accent: { box: string; badge: string; hover: string; text: string };
}

const ROLE_CARDS: RoleCard[] = [
  {
    role: "admin",
    title: "Entrar como Administrador",
    badge: "Acceso total",
    description: "Control del mes, auditoría de horas y exportación de la planilla para el contador.",
    icon: "admin_panel_settings",
    accent: {
      box: "bg-horus-cyan/10 border-horus-cyan/30 text-horus-cyan",
      badge: "text-horus-cyan bg-horus-cyan/10 border-horus-cyan/20",
      hover: "hover:border-horus-cyan/60 focus-visible:ring-horus-cyan/50",
      text: "group-hover:text-horus-cyan",
    },
  },
  {
    role: "supervisor",
    title: "Entrar como Supervisor",
    badge: "Aprobador",
    description: "Aprobación de horas, validación de horas extra y gestión de licencias y ausencias del equipo.",
    icon: "fact_check",
    accent: {
      box: "bg-blue-500/10 border-blue-500/30 text-blue-400",
      badge: "text-blue-300 bg-blue-500/10 border-blue-400/20",
      hover: "hover:border-blue-400/60 focus-visible:ring-blue-400/50",
      text: "group-hover:text-blue-300",
    },
  },
  {
    role: "employee",
    title: "Entrar como Empleado",
    badge: "Autogestión",
    description: "Carga semanal en grilla rápida, registro de tareas, solicitud de licencias y seguimiento.",
    icon: "schedule",
    accent: {
      box: "bg-teal-500/10 border-teal-500/30 text-teal-300",
      badge: "text-teal-300 bg-teal-500/10 border-teal-400/20",
      hover: "hover:border-teal-400/60 focus-visible:ring-teal-400/50",
      text: "group-hover:text-teal-300",
    },
  },
];

/** La app siempre abre con la marca Horus. */
export function LoginScreen() {
  const { signIn, signInWithPassword, authNotice } = useSession();
  const [tab, setTab] = useState<Tab>(isDemoMode ? "demo" : "account");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitAccount = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isFirebaseConfigured) {
      setNotice("Esta instancia todavía no está conectada a un servidor. Por ahora solo está disponible la demo.");
      return;
    }
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setNotice(null);
    try {
      await signInWithPassword(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "No se pudo iniciar sesión. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-horus-mesh flex min-h-screen flex-col justify-between font-headline-md text-slate-100 antialiased selection:bg-horus-cyan selection:text-slate-900">
      <header className="flex w-full flex-col items-center justify-center px-6 pt-10 pb-4 text-center">
        <div className="relative">
          <div className="absolute -inset-1.5 rounded-3xl bg-linear-to-r from-horus-cyan to-blue-600 opacity-30 blur" />
          <div className="brand-glow relative flex size-24 items-center justify-center overflow-hidden rounded-2xl border border-navy-600 bg-navy-850 p-1 shadow-2xl">
            <img alt="Horus" className="size-full rounded-xl object-cover" src={horusBrand.iconUrl} />
          </div>
        </div>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-white">{horusBrand.name}</h1>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-2">
        <div className="relative overflow-hidden rounded-2xl border border-navy-600/90 bg-navy-800/90 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-8">
          {isDemoMode ? (
            <div className="mb-6 flex items-center justify-between rounded-xl border border-navy-700/80 bg-navy-950/70 p-1" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "demo"}
                onClick={() => setTab("demo")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs transition-all sm:text-sm ${
                  tab === "demo" ? "border border-navy-600/60 bg-navy-750 font-semibold text-white shadow-sm" : "font-medium text-navy-300 hover:bg-navy-850/60 hover:text-white"
                }`}
              >
                <span className="inline-block size-2 animate-pulse rounded-full bg-horus-cyan" />
                Entrá a la demo
                <span className="rounded border border-horus-cyan/20 bg-horus-cyan/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-horus-cyan uppercase">3 roles</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "account"}
                onClick={() => setTab("account")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs transition-all sm:text-sm ${
                  tab === "account" ? "border border-navy-600/60 bg-navy-750 font-semibold text-white shadow-sm" : "font-medium text-navy-300 hover:bg-navy-850/60 hover:text-white"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">person</span>
                Iniciar sesión con cuenta
              </button>
            </div>
          ) : null}

          {tab === "demo" && isDemoMode ? (
            <div className="space-y-4" role="tabpanel">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white">Entorno de demostración</h2>
                  <span className="rounded border border-navy-700/60 bg-navy-900 px-2 py-0.5 text-xs text-navy-300">Datos de ejemplo</span>
                </div>
                <p className="mt-1 text-xs text-navy-300">Elegí un rol para explorar la experiencia de cada usuario:</p>
              </div>

              {ROLE_CARDS.map((card) => (
                <button
                  key={card.role}
                  type="button"
                  onClick={() => signIn(DEMO_USERS[card.role])}
                  className={`group flex w-full items-start gap-4 rounded-xl border border-navy-600/70 bg-navy-850/80 p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:bg-navy-750/90 focus-visible:ring-2 focus-visible:outline-hidden ${card.accent.hover}`}
                >
                  <div className={`flex size-11 shrink-0 items-center justify-center rounded-lg border transition-transform group-hover:scale-105 ${card.accent.box}`}>
                    <span className="material-symbols-outlined">{card.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-bold text-white transition-colors ${card.accent.text}`}>{card.title}</span>
                      <span className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold ${card.accent.badge}`}>{card.badge}</span>
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-navy-200">{DEMO_USERS[card.role].fullName}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-navy-300">{card.description}</p>
                  </div>
                  <span className="material-symbols-outlined self-center text-navy-400 transition-all group-hover:translate-x-1">chevron_right</span>
                </button>
              ))}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => signIn(DEMO_USERS.admin)}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-horus-cyan font-bold text-navy-950 shadow-lg shadow-horus-cyan/20 transition duration-150 hover:bg-horus-cyan-hover"
                >
                  <span>Entrar a la demo</span>
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                </button>
              </div>
            </div>
          ) : (
            <div role="tabpanel">
              <form className="space-y-4" onSubmit={submitAccount}>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-navy-200" htmlFor="corporate-email">Email</label>
                  <div className="relative">
                    <span className="material-symbols-outlined pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[18px] text-navy-400">mail</span>
                    <input id="corporate-email" name="email" type="email" required autoComplete="email" placeholder="nombre@empresa.com" className="w-full rounded-xl border border-navy-600 bg-navy-900/90 py-2.5 pr-4 pl-10 text-sm text-white placeholder-navy-500 transition focus:border-horus-cyan focus:ring-1 focus:ring-horus-cyan focus:outline-hidden" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-navy-200" htmlFor="account-password">Contraseña</label>
                  <div className="relative">
                    <span className="material-symbols-outlined pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[18px] text-navy-400">lock</span>
                    <input id="account-password" name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" placeholder="••••••••••••" className="w-full rounded-xl border border-navy-600 bg-navy-900/90 py-2.5 pr-10 pl-10 text-sm text-white placeholder-navy-500 transition focus:border-horus-cyan focus:ring-1 focus:ring-horus-cyan focus:outline-hidden" />
                    <button type="button" aria-label="Mostrar u ocultar la contraseña" onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 right-3.5 flex items-center text-navy-400 hover:text-navy-200">
                      <span className="material-symbols-outlined text-[18px]">{showPassword ? "visibility_off" : "visibility"}</span>
                    </button>
                  </div>
                </div>
                {notice ?? authNotice ? <p role="alert" className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{notice ?? authNotice}</p> : null}
                <div className="pt-2">
                  <button type="submit" disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-horus-cyan font-bold text-navy-950 shadow-lg shadow-horus-cyan/25 transition hover:bg-horus-cyan-hover disabled:opacity-60">
                    <span>{busy ? "Ingresando…" : "Ingresar"}</span>
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      <footer className="mt-6 w-full border-t border-navy-700/50 bg-navy-950/60 px-6 py-6 text-center backdrop-blur-sm">
        <p className="text-[11px] font-medium text-navy-400">Horus · Gestión de horas y licencias para pymes</p>
      </footer>
    </div>
  );
}
