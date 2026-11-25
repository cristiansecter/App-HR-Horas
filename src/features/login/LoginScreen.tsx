import { useState, type FormEvent } from "react";
import { isDemoMode } from "@/config/env";
import { isFirebaseConfigured } from "@/services/firebase";
import { sgBlackBrand } from "@/config/sgblack.brand";
import { DEMO_USERS } from "@/demo/demoUsers";
import type { Role } from "@/domain/types";
import { useSession } from "@/session/SessionContext";

type Tab = "demo" | "account" | "configurator";

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
      box: "bg-sg-violet/10 border-sg-violet/30 text-sg-violet",
      badge: "text-sg-violet bg-sg-violet/10 border-sg-violet/20",
      hover: "hover:border-sg-violet/60 focus-visible:ring-sg-violet/50",
      text: "group-hover:text-sg-violet",
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

/** La app siempre abre con la marca SG Black. */
export function LoginScreen() {
  const { signIn, signInWithPassword, signInConfigurator, authNotice } = useSession();
  // Si volvemos acá por un aviso (sesión cerrada por inactividad, cuenta sin acceso...), se muestra la pestaña donde se lee.
  const [tab, setTab] = useState<Tab>(isDemoMode && !authNotice ? "demo" : "account");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const continueWithGoogle = async () => {
    if (!isFirebaseConfigured) {
      setNotice("Esta instancia todavía no está conectada a un servidor.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await signInConfigurator();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "No se pudo iniciar sesión con Google. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

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
      await signInWithPassword(String(form.get("email") ?? ""), String(form.get("password") ?? ""), tab === "configurator" ? "configurator" : "app");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "No se pudo iniciar sesión. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-sg-mesh flex min-h-screen flex-col justify-between font-headline-md text-slate-100 antialiased selection:bg-sg-violet selection:text-white">
      <header className="flex w-full flex-col items-center justify-center px-6 pt-10 pb-4 text-center">
        <img alt="" src={sgBlackBrand.logoOnDarkUrl} className="h-20 w-auto max-w-full object-contain sm:h-24" />
        <h1 className="sr-only">{sgBlackBrand.name}</h1>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-2">
        <div className="relative overflow-hidden rounded-2xl border border-ink-600/90 bg-ink-800/90 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-8">
          {isDemoMode ? (
            <div className="mb-6 flex items-center justify-between rounded-xl border border-ink-700/80 bg-ink-950/70 p-1" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "demo"}
                onClick={() => setTab("demo")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs transition-all sm:text-sm ${
                  tab === "demo" ? "border border-ink-600/60 bg-ink-750 font-semibold text-white shadow-sm" : "font-medium text-ink-300 hover:bg-ink-850/60 hover:text-white"
                }`}
              >
                <span className="inline-block size-2 animate-pulse rounded-full bg-sg-violet" />
                Entrá a la demo
                <span className="rounded border border-sg-violet/20 bg-sg-violet/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-sg-violet uppercase">3 roles</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "account"}
                onClick={() => { setTab("account"); setNotice(null); }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs transition-all sm:text-sm ${
                  tab === "account" ? "border border-ink-600/60 bg-ink-750 font-semibold text-white shadow-sm" : "font-medium text-ink-300 hover:bg-ink-850/60 hover:text-white"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">person</span>
                Iniciar sesión con cuenta
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "configurator"}
                onClick={() => { setTab("configurator"); setNotice(null); }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs transition-all sm:text-sm ${
                  tab === "configurator" ? "border border-ink-600/60 bg-ink-750 font-semibold text-white shadow-sm" : "font-medium text-ink-300 hover:bg-ink-850/60 hover:text-white"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">tune</span>
                Configurador
              </button>
            </div>
          ) : null}

          {tab === "demo" && isDemoMode ? (
            <div className="space-y-4" role="tabpanel">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white">Entorno de demostración</h2>
                  <span className="rounded border border-ink-700/60 bg-ink-900 px-2 py-0.5 text-xs text-ink-300">Datos de ejemplo</span>
                </div>
                <p className="mt-1 text-xs text-ink-300">Elegí un rol para explorar la experiencia de cada usuario:</p>
              </div>

              {ROLE_CARDS.map((card) => (
                <button
                  key={card.role}
                  type="button"
                  onClick={() => signIn(DEMO_USERS[card.role])}
                  className={`group flex w-full items-start gap-4 rounded-xl border border-ink-600/70 bg-ink-850/80 p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:bg-ink-750/90 focus-visible:ring-2 focus-visible:outline-hidden ${card.accent.hover}`}
                >
                  <div className={`flex size-11 shrink-0 items-center justify-center rounded-lg border transition-transform group-hover:scale-105 ${card.accent.box}`}>
                    <span className="material-symbols-outlined">{card.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-bold text-white transition-colors ${card.accent.text}`}>{card.title}</span>
                      <span className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold ${card.accent.badge}`}>{card.badge}</span>
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-ink-200">{DEMO_USERS[card.role].fullName}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-300">{card.description}</p>
                  </div>
                  <span className="material-symbols-outlined self-center text-ink-400 transition-all group-hover:translate-x-1">chevron_right</span>
                </button>
              ))}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => signIn(DEMO_USERS.admin)}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sg-violet font-bold text-white shadow-lg shadow-sg-violet/20 transition duration-150 hover:bg-sg-violet-hover"
                >
                  <span>Entrar a la demo</span>
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                </button>
              </div>
            </div>
          ) : (
            <div role="tabpanel">
              {tab === "configurator" ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-sg-violet/20 bg-sg-violet/5 p-3">
                    <p className="text-sm font-bold text-white">Acceso del Configurador</p>
                    <p className="mt-1 text-xs text-ink-300">Solo para el proveedor del sistema, con su cuenta de Google. Administra los módulos y el modelo de pago de esta instancia.</p>
                  </div>
                  {notice ?? authNotice ? <p role="alert" className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{notice ?? authNotice}</p> : null}
                  <button type="button" disabled={busy} onClick={() => void continueWithGoogle()} className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-ink-500 bg-white font-semibold text-slate-800 shadow-lg transition hover:bg-slate-100 disabled:opacity-60">
                    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                    {busy ? "Abriendo Google…" : "Continuar con Google"}
                  </button>
                </div>
              ) : (
              <form className="space-y-4" onSubmit={submitAccount}>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink-200" htmlFor="corporate-email">Email</label>
                  <div className="relative">
                    <span className="material-symbols-outlined pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[18px] text-ink-400">mail</span>
                    <input id="corporate-email" name="email" type="email" required autoComplete="email" placeholder="nombre@empresa.com" className="w-full rounded-xl border border-ink-600 bg-ink-900/90 py-2.5 pr-4 pl-10 text-sm text-white placeholder-ink-500 transition focus:border-sg-violet focus:ring-1 focus:ring-sg-violet focus:outline-hidden" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink-200" htmlFor="account-password">Contraseña</label>
                  <div className="relative">
                    <span className="material-symbols-outlined pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[18px] text-ink-400">lock</span>
                    <input id="account-password" name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" placeholder="••••••••••••" className="w-full rounded-xl border border-ink-600 bg-ink-900/90 py-2.5 pr-10 pl-10 text-sm text-white placeholder-ink-500 transition focus:border-sg-violet focus:ring-1 focus:ring-sg-violet focus:outline-hidden" />
                    <button type="button" aria-label="Mostrar u ocultar la contraseña" onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 right-3.5 flex items-center text-ink-400 hover:text-ink-200">
                      <span className="material-symbols-outlined text-[18px]">{showPassword ? "visibility_off" : "visibility"}</span>
                    </button>
                  </div>
                </div>
                {notice ?? authNotice ? <p role="alert" className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{notice ?? authNotice}</p> : null}
                <div className="pt-2">
                  <button type="submit" disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sg-violet font-bold text-white shadow-lg shadow-sg-violet/25 transition hover:bg-sg-violet-hover disabled:opacity-60">
                    <span>{busy ? "Ingresando…" : "Ingresar"}</span>
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                </div>
              </form>
              )}
              {!isDemoMode ? (
                <p className="mt-4 text-center text-xs text-ink-400">
                  <button type="button" onClick={() => { setTab(tab === "configurator" ? "account" : "configurator"); setNotice(null); }} className="underline-offset-2 hover:text-ink-200 hover:underline">
                    {tab === "configurator" ? "Volver al acceso de personas" : "Acceso del Configurador"}
                  </button>
                </p>
              ) : null}
            </div>
          )}
        </div>
      </main>

      <footer className="mt-6 w-full border-t border-ink-700/50 bg-ink-950/60 px-6 py-6 text-center backdrop-blur-sm">
        <p className="text-[11px] font-medium text-ink-400">SG Black · {sgBlackBrand.tagline}</p>
      </footer>
    </div>
  );
}
