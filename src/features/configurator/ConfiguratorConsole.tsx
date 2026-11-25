import { useEffect, useMemo, useState } from "react";
import { sgBlackBrand } from "@/config/sgblack.brand";
import {
  applyPreset,
  featureProblems,
  MODULE_IDS,
  MODULE_INFO,
  PAY_MODEL_HINTS,
  PAY_MODEL_LABELS,
  PROJECT_MODULES,
  setWorkMode,
  toggleModule,
  WORK_MODE_HINTS,
  WORK_MODE_LABELS,
  type Features,
  type ModuleId,
  type PayModel,
  type WorkMode,
} from "@/domain/features";
import type { ConfiguratorSession } from "@/services/auth";
import { withCode } from "@/services/errors";
import { loadCompanyNameForConsole, loadFeaturesWithStamp, saveFeatures, type FeaturesStamp } from "@/services/features";
import { useSession } from "@/session/SessionContext";

const card = "rounded-2xl border border-ink-600/80 bg-ink-800/90 p-6 shadow-xl shadow-black/40";

/**
 * Consola del Configurador: activa los módulos de la instancia y define cómo paga la pyme.
 * No es parte de la vista del administrador de la empresa: ese rol no ve ni puede cambiar nada de esto.
 */
export default function ConfiguratorConsole({ configurator }: { configurator: ConfiguratorSession }) {
  const { signOut } = useSession();
  const [saved, setSaved] = useState<Features | null>(null);
  const [draft, setDraft] = useState<Features | null>(null);
  const [stamp, setStamp] = useState<FeaturesStamp>({});
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadFeaturesWithStamp(), loadCompanyNameForConsole()])
      .then(([{ features, stamp: s }, name]) => {
        if (cancelled) return;
        setSaved(features);
        setDraft(features);
        setStamp(s);
        setCompanyName(name);
      })
      .catch((e: unknown) => {
        console.error("No se pudo leer la configuración de módulos", e);
        if (!cancelled) setLoadError(withCode("No se pudo leer la configuración de la instancia.", e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);
  const problems = draft ? featureProblems(draft) : [];

  const setModule = (id: ModuleId, on: boolean) => draft && setDraft(toggleModule(draft, id, on));

  const save = async () => {
    if (!draft || problems.length > 0) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveFeatures(draft, configurator.email);
      setSaved(draft);
      setStamp({ updatedBy: configurator.email, updatedAt: new Date() });
      setMessage({ ok: true, text: "Guardado. Los cambios se ven en la instancia la próxima vez que cada persona abra o recargue la app." });
    } catch (e) {
      console.error("No se pudo guardar", e);
      setMessage({ ok: false, text: withCode("No se pudo guardar. Probá de nuevo.", e) });
    } finally {
      setSaving(false);
    }
  };

  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "(sin configurar)";

  return (
    <div className="bg-sg-mesh min-h-screen font-headline-md text-slate-100 antialiased">
      <header className="border-b border-ink-700/60 bg-ink-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <img alt="" src={sgBlackBrand.glyphUrl} className="h-10 w-auto" />
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-white">Consola del Configurador</h1>
              <p className="text-xs text-ink-300">{configurator.email}</p>
            </div>
          </div>
          <button type="button" onClick={signOut} className="flex items-center gap-1.5 rounded-lg border border-ink-600 px-3 py-2 text-xs font-semibold text-ink-200 hover:border-ink-400 hover:text-white">
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
        <section className={card} aria-label="Instancia">
          <h2 className="text-sm font-bold tracking-wide text-sg-violet uppercase">Instancia</h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-ink-300">Empresa</dt><dd className="font-semibold text-white">{companyName ?? "Sin nombre cargado"}</dd></div>
            <div><dt className="text-xs text-ink-300">Proyecto de Firebase</dt><dd className="font-mono text-xs text-white">{projectId}</dd></div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-ink-300">Última modificación</dt>
              <dd className="text-white">{stamp.updatedAt ? `${stamp.updatedAt.toLocaleString("es-AR")} · ${stamp.updatedBy ?? ""}` : "Todavía no se configuró nada"}</dd>
            </div>
          </dl>
          <p className="mt-4 rounded-lg bg-ink-950/60 px-3 py-2 text-xs text-ink-300">
            El administrador de la empresa no ve esta consola ni la lista de módulos: solo ve las pantallas de los que activás acá.
          </p>
        </section>

        {loadError ? <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{loadError}</p> : null}
        {!draft && !loadError ? <p role="status" className="text-sm text-ink-300">Cargando la configuración…</p> : null}

        {draft ? (
          <>
            <section className={card} aria-label="Modo de trabajo">
              <h2 className="text-sm font-bold tracking-wide text-sg-violet uppercase">Modo de trabajo</h2>
              <p className="mt-1 text-xs text-ink-300">Cómo trabaja esta empresa. Es una decisión de cómo se instala el producto: el administrador de la empresa no la ve ni la cambia.</p>
              <div role="radiogroup" aria-label="Modo de trabajo" className="mt-4 grid gap-3 sm:grid-cols-2">
                {(Object.keys(WORK_MODE_LABELS) as WorkMode[]).map((mode) => {
                  const selected = draft.workMode === mode;
                  return (
                    <button key={mode} type="button" role="radio" aria-checked={selected} onClick={() => setDraft(setWorkMode(draft, mode))} className={`rounded-xl border p-4 text-left transition ${selected ? "border-sg-violet bg-sg-violet/10" : "border-ink-600 bg-ink-850/70 hover:border-ink-400"}`}>
                      <span className="flex items-center gap-2 text-sm font-bold text-white">
                        <span className={`flex size-4 items-center justify-center rounded-full border ${selected ? "border-sg-violet" : "border-ink-400"}`}>{selected ? <span className="size-2 rounded-full bg-sg-violet" /> : null}</span>
                        {WORK_MODE_LABELS[mode]}
                      </span>
                      <span className="mt-1.5 block text-xs leading-relaxed text-ink-300">{WORK_MODE_HINTS[mode]}</span>
                    </button>
                  );
                })}
              </div>
              {draft.workMode === "attendance" ? <p className="mt-3 text-xs text-amber-200/90">Por asistencia se apagan los módulos de proyectos (Rendimiento, Facturación, Dedicación) y desaparecen cargar horas, proyectos y asignaciones. Si ya hay horas cargadas, quedan guardadas pero sin pantalla. Mejor definirlo al instalar, antes de que la gente empiece a usar la app.</p> : null}
            </section>

            <section className={card} aria-label="Modelo de pago">
              <h2 className="text-sm font-bold tracking-wide text-sg-violet uppercase">Modelo de pago</h2>
              <p className="mt-1 text-xs text-ink-300">Cómo paga esta pyme a su gente. Define cómo se cargan los sueldos, cómo se calcula el costo por hora y cómo se arma la liquidación.</p>
              <div role="radiogroup" aria-label="Modelo de pago" className="mt-4 grid gap-3 sm:grid-cols-2">
                {(Object.keys(PAY_MODEL_LABELS) as PayModel[]).map((model) => {
                  const selected = draft.payModel === model;
                  // Por asistencia el sueldo es siempre mensual: el pago por hora no aplica.
                  const locked = draft.workMode === "attendance" && model === "hourly";
                  return (
                    <button key={model} type="button" role="radio" aria-checked={selected} disabled={locked} onClick={() => setDraft({ ...draft, payModel: model })} className={`rounded-xl border p-4 text-left transition ${locked ? "cursor-not-allowed opacity-40" : ""} ${selected ? "border-sg-violet bg-sg-violet/10" : "border-ink-600 bg-ink-850/70 hover:border-ink-400"}`}>
                      <span className="flex items-center gap-2 text-sm font-bold text-white">
                        <span className={`flex size-4 items-center justify-center rounded-full border ${selected ? "border-sg-violet" : "border-ink-400"}`}>{selected ? <span className="size-2 rounded-full bg-sg-violet" /> : null}</span>
                        {PAY_MODEL_LABELS[model]}
                      </span>
                      <span className="mt-1.5 block text-xs leading-relaxed text-ink-300">{PAY_MODEL_HINTS[model]}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-amber-200/90">Si ya hay sueldos cargados, cambiar el modelo cambia cómo se interpretan esos montos (sueldo mensual ↔ valor hora). Revisalos después de cambiarlo.</p>
            </section>

            <section className={card} aria-label="Módulos activables">
              <h2 className="text-sm font-bold tracking-wide text-sg-violet uppercase">Módulos activables</h2>
              {draft.workMode === "projects" ? <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Atajos">
                <span className="text-xs text-ink-300">Atajos:</span>
                <button type="button" onClick={() => setDraft(applyPreset(draft, "consultancy"))} className="rounded-lg border border-ink-500 px-3 py-1.5 text-xs font-semibold text-ink-100 hover:border-sg-violet hover:text-white">Consultoría (factura por proyecto)</button>
                <button type="button" onClick={() => setDraft(applyPreset(draft, "production"))} className="rounded-lg border border-ink-500 px-3 py-1.5 text-xs font-semibold text-ink-100 hover:border-sg-violet hover:text-white">Fábrica o producción por jornada</button>
              </div> : null}
              <p className="mt-1 text-xs text-ink-300">Se activan cuando el cliente los contrata. Un módulo apagado no tiene pantallas y sus datos quedan bloqueados en la base.</p>
              <ul className="mt-4 divide-y divide-ink-700/60">
                {MODULE_IDS.filter((id) => draft.workMode === "projects" || !PROJECT_MODULES.includes(id)).map((id) => {
                  const info = MODULE_INFO[id];
                  const on = draft.modules[id];
                  return (
                    <li key={id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">{info.label}</p>
                        <p className="mt-1 text-xs leading-relaxed text-ink-300">{info.description}</p>
                        {info.requires.length > 0 ? <p className="mt-1.5 text-[11px] font-medium text-ink-400">Necesita: {info.requires.map((r) => MODULE_INFO[r].label).join(", ")}</p> : null}
                      </div>
                      <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-ink-200">
                        {on ? "Activo" : "Apagado"}
                        <input type="checkbox" role="switch" aria-label={`Módulo ${info.label}`} checked={on} onChange={(e) => setModule(id, e.target.checked)} className="size-5 accent-[var(--hz-primary)]" />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className={card} aria-label="Premio y presentismo">
              <h2 className="text-sm font-bold tracking-wide text-sg-violet uppercase">Premio y presentismo</h2>
              <p className="mt-1 text-xs text-ink-300">Para empresas que pagan un adicional por presentismo o un premio por asistencia. Se activa solo si el cliente lo usa: no todas las empresas tienen estas prácticas.</p>
              <div className="mt-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">Marcar si una licencia hace perder presentismo o premio</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-300">Al aprobar o registrar una licencia o ausencia aparecen dos casillas, “pierde presentismo” y “pierde premio”, con un valor por defecto según el tipo (lo define el administrador de la empresa) que se puede cambiar en cada caso. Salen en el resumen y en la planilla para el contador. Solo registra: no calcula importes ni descuentos.</p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-ink-200">
                  {draft.presentism ? "Activo" : "Apagado"}
                  <input type="checkbox" role="switch" aria-label="Premio y presentismo" checked={draft.presentism} onChange={(e) => setDraft({ ...draft, presentism: e.target.checked, presentismLateLimit: e.target.checked ? draft.presentismLateLimit : 0 })} className="size-5 accent-[var(--hz-primary)]" />
                </label>
              </div>
              {draft.presentism && draft.workMode === "attendance" ? (
                <label className="mt-4 block text-sm font-bold text-white">
                  Tardanzas en el mes que hacen perder el presentismo
                  <input type="number" min={0} max={31} aria-label="Tardanzas para perder el presentismo" value={draft.presentismLateLimit} onChange={(e) => setDraft({ ...draft, presentismLateLimit: Math.max(0, Math.min(31, Math.trunc(Number(e.target.value) || 0))) })} className="mt-1.5 block w-28 rounded-lg border border-ink-600 bg-ink-850/70 px-3 py-2 text-sm text-white focus:border-sg-violet focus:outline-hidden" />
                  <span className="mt-1 block text-xs font-normal leading-relaxed text-ink-300">Con 3, quien llega tarde 3 veces o más en el mes figura como que pierde el presentismo. Con 0 esta regla no se aplica. Se define con cada cliente.</span>
                </label>
              ) : null}
            </section>

            <section className={card} aria-label="Permisos">
              <h2 className="text-sm font-bold tracking-wide text-sg-violet uppercase">Permisos</h2>
              <p className="mt-1 text-xs text-ink-300">Por defecto solo el administrador ve los sueldos. Acá se puede ampliar ese acceso.</p>
              <div className="mt-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">Los supervisores ven los sueldos de su equipo</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-300">Solo lectura: cada supervisor ve el sueldo (o valor hora) y el historial de las personas que tiene a cargo, en una pantalla “Sueldos del equipo”. No los edita, no ve los de otros equipos ni los propios, y no ve costos ni liquidaciones.</p>
                  <p className="mt-1.5 text-[11px] font-medium text-ink-400">Necesita: {MODULE_INFO.compensation.label}</p>
                </div>
                <label className={`flex shrink-0 items-center gap-2 text-xs font-semibold text-ink-200 ${draft.modules.compensation ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>
                  {draft.supervisorsSeePay ? "Activo" : "Apagado"}
                  <input type="checkbox" role="switch" aria-label="Supervisores ven sueldos del equipo" disabled={!draft.modules.compensation} checked={draft.supervisorsSeePay} onChange={(e) => setDraft({ ...draft, supervisorsSeePay: e.target.checked })} className="size-5 accent-[var(--hz-primary)]" />
                </label>
              </div>
            </section>

            {problems.length > 0 ? <ul role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
            {message ? <p role={message.ok ? "status" : "alert"} className={`rounded-xl border px-4 py-3 text-sm ${message.ok ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-rose-400/30 bg-rose-500/10 text-rose-200"}`}>{message.text}</p> : null}

            <div className="flex items-center justify-end gap-3">
              {dirty ? <button type="button" onClick={() => { setDraft(saved); setMessage(null); }} className="px-4 py-2.5 text-sm font-semibold text-ink-300 hover:text-white">Descartar cambios</button> : null}
              <button type="button" disabled={!dirty || saving || problems.length > 0} onClick={() => void save()} className="rounded-xl bg-sg-violet px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-sg-violet/20 hover:bg-sg-violet-hover disabled:opacity-40">
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
