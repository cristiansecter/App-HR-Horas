import { useEffect, useMemo, useState } from "react";
import { horusBrand } from "@/config/horus.brand";
import {
  applyPreset,
  featureProblems,
  MODULE_IDS,
  MODULE_INFO,
  PAY_MODEL_HINTS,
  PAY_MODEL_LABELS,
  toggleModule,
  type Features,
  type ModuleId,
  type PayModel,
} from "@/domain/features";
import type { ConfiguratorSession } from "@/services/auth";
import { withCode } from "@/services/errors";
import { loadCompanyNameForConsole, loadFeaturesWithStamp, saveFeatures, type FeaturesStamp } from "@/services/features";
import { useSession } from "@/session/SessionContext";

const card = "rounded-2xl border border-navy-600/80 bg-navy-800/90 p-6 shadow-xl shadow-black/40";

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
    <div className="bg-horus-mesh min-h-screen font-headline-md text-slate-100 antialiased">
      <header className="border-b border-navy-700/60 bg-navy-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <img alt="" src={horusBrand.iconUrl} className="size-10 rounded-xl border border-navy-600 bg-navy-850 p-0.5" />
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-white">Consola del Configurador</h1>
              <p className="text-xs text-navy-300">{configurator.email}</p>
            </div>
          </div>
          <button type="button" onClick={signOut} className="flex items-center gap-1.5 rounded-lg border border-navy-600 px-3 py-2 text-xs font-semibold text-navy-200 hover:border-navy-400 hover:text-white">
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
        <section className={card} aria-label="Instancia">
          <h2 className="text-sm font-bold tracking-wide text-horus-cyan uppercase">Instancia</h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-navy-300">Empresa</dt><dd className="font-semibold text-white">{companyName ?? "Sin nombre cargado"}</dd></div>
            <div><dt className="text-xs text-navy-300">Proyecto de Firebase</dt><dd className="font-mono text-xs text-white">{projectId}</dd></div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-navy-300">Última modificación</dt>
              <dd className="text-white">{stamp.updatedAt ? `${stamp.updatedAt.toLocaleString("es-AR")} · ${stamp.updatedBy ?? ""}` : "Todavía no se configuró nada"}</dd>
            </div>
          </dl>
          <p className="mt-4 rounded-lg bg-navy-950/60 px-3 py-2 text-xs text-navy-300">
            El administrador de la empresa no ve esta consola ni la lista de módulos: solo ve las pantallas de los que activás acá.
          </p>
        </section>

        {loadError ? <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{loadError}</p> : null}
        {!draft && !loadError ? <p role="status" className="text-sm text-navy-300">Cargando la configuración…</p> : null}

        {draft ? (
          <>
            <section className={card} aria-label="Modelo de pago">
              <h2 className="text-sm font-bold tracking-wide text-horus-cyan uppercase">Modelo de pago</h2>
              <p className="mt-1 text-xs text-navy-300">Cómo paga esta pyme a su gente. Define cómo se cargan los sueldos, cómo se calcula el costo por hora y cómo se arma la liquidación.</p>
              <div role="radiogroup" aria-label="Modelo de pago" className="mt-4 grid gap-3 sm:grid-cols-2">
                {(Object.keys(PAY_MODEL_LABELS) as PayModel[]).map((model) => {
                  const selected = draft.payModel === model;
                  return (
                    <button key={model} type="button" role="radio" aria-checked={selected} onClick={() => setDraft({ ...draft, payModel: model })} className={`rounded-xl border p-4 text-left transition ${selected ? "border-horus-cyan bg-horus-cyan/10" : "border-navy-600 bg-navy-850/70 hover:border-navy-400"}`}>
                      <span className="flex items-center gap-2 text-sm font-bold text-white">
                        <span className={`flex size-4 items-center justify-center rounded-full border ${selected ? "border-horus-cyan" : "border-navy-400"}`}>{selected ? <span className="size-2 rounded-full bg-horus-cyan" /> : null}</span>
                        {PAY_MODEL_LABELS[model]}
                      </span>
                      <span className="mt-1.5 block text-xs leading-relaxed text-navy-300">{PAY_MODEL_HINTS[model]}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-amber-200/90">Si ya hay sueldos cargados, cambiar el modelo cambia cómo se interpretan esos montos (sueldo mensual ↔ valor hora). Revisalos después de cambiarlo.</p>
            </section>

            <section className={card} aria-label="Módulos activables">
              <h2 className="text-sm font-bold tracking-wide text-horus-cyan uppercase">Módulos activables</h2>
              <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Atajos">
                <span className="text-xs text-navy-300">Atajos:</span>
                <button type="button" onClick={() => setDraft(applyPreset(draft, "consultancy"))} className="rounded-lg border border-navy-500 px-3 py-1.5 text-xs font-semibold text-navy-100 hover:border-horus-cyan hover:text-white">Consultoría (factura por proyecto)</button>
                <button type="button" onClick={() => setDraft(applyPreset(draft, "production"))} className="rounded-lg border border-navy-500 px-3 py-1.5 text-xs font-semibold text-navy-100 hover:border-horus-cyan hover:text-white">Fábrica o producción por jornada</button>
              </div>
              <p className="mt-1 text-xs text-navy-300">Se activan cuando el cliente los contrata. Un módulo apagado no tiene pantallas y sus datos quedan bloqueados en la base.</p>
              <ul className="mt-4 divide-y divide-navy-700/60">
                {MODULE_IDS.map((id) => {
                  const info = MODULE_INFO[id];
                  const on = draft.modules[id];
                  return (
                    <li key={id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">{info.label}</p>
                        <p className="mt-1 text-xs leading-relaxed text-navy-300">{info.description}</p>
                        {info.requires.length > 0 ? <p className="mt-1.5 text-[11px] font-medium text-navy-400">Necesita: {info.requires.map((r) => MODULE_INFO[r].label).join(", ")}</p> : null}
                      </div>
                      <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-navy-200">
                        {on ? "Activo" : "Apagado"}
                        <input type="checkbox" role="switch" aria-label={`Módulo ${info.label}`} checked={on} onChange={(e) => setModule(id, e.target.checked)} className="size-5 accent-[var(--hz-primary)]" />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>

            {problems.length > 0 ? <ul role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
            {message ? <p role={message.ok ? "status" : "alert"} className={`rounded-xl border px-4 py-3 text-sm ${message.ok ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-rose-400/30 bg-rose-500/10 text-rose-200"}`}>{message.text}</p> : null}

            <div className="flex items-center justify-end gap-3">
              {dirty ? <button type="button" onClick={() => { setDraft(saved); setMessage(null); }} className="px-4 py-2.5 text-sm font-semibold text-navy-300 hover:text-white">Descartar cambios</button> : null}
              <button type="button" disabled={!dirty || saving || problems.length > 0} onClick={() => void save()} className="rounded-xl bg-horus-cyan px-6 py-2.5 text-sm font-bold text-navy-950 shadow-lg shadow-horus-cyan/20 hover:bg-horus-cyan-hover disabled:opacity-40">
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
