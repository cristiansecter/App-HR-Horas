import { useState } from "react";
import { CONCEPTS, DEFAULT_PARAMS, DEFAULT_VISIBILITY, type ConceptId, type PayrollParams, type Visibility } from "@/domain/payroll/defaults";
import { withCode } from "@/services/errors";
import { savePayrollSettings } from "@/services/liquidation";
import { useUser } from "@/session/SessionContext";
import { useToast } from "@/ui/Toast";

const field = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface tabular-nums focus:border-primary-container focus:outline-hidden";

type NumKey = { [K in keyof PayrollParams]: PayrollParams[K] extends number ? K : never }[keyof PayrollParams];

const GROUPS: { title: string; hint?: string; fields: readonly [NumKey, string, string?][] }[] = [
  { title: "Haberes", fields: [["antiguedadPct", "Antigüedad (% del básico por año)"], ["presentismoPct", "Presentismo (%)"], ["bonoConvenio", "Bono no remunerativo de convenio ($)"], ["asignacionHijo", "Asignación familiar por hijo ($)"]] },
  { title: "Divisores", hint: "Dependen del convenio y de la jornada: validalos con tu contador.", fields: [["divisorHorasExtra", "Valor hora (horas extra)", "200 = 25 días × 8 h"], ["divisorVacaciones", "Valor día de vacaciones", "LCT: 25"], ["divisorInasistencias", "Valor día para inasistencias", "30 = mes comercial"], ["horasJornada", "Horas de una jornada (pago por hora)", "Para pagar un día de vacaciones"]] },
  { title: "Aportes del empleado", fields: [["jubilacionPct", "Jubilación — SIPA (%)"], ["pamiPct", "Ley 19.032 / PAMI (%)"], ["obraSocialPct", "Obra social (%)"], ["sindicalPct", "Aporte sindical (%)"], ["topeAportes", "Tope de la base de aportes ($)", "0 = sin tope"]] },
  { title: "Impuesto a las Ganancias (simplificado)", hint: "Alícuota única sobre el excedente: no es la escala progresiva anual. Revisalo con tu contador.", fields: [["minNoImponible", "Mínimo no imponible ($)"], ["alicuotaGananciasPct", "Alícuota (%)"], ["deduccionHijo", "Deducción por hijo ($)"]] },
  { title: "Costo para la empresa", fields: [["contribucionesPatronalesPct", "Contribuciones patronales (%)", "Informativo: no va en el recibo ni baja el neto"]] },
];

/** Parámetros de la liquidación y qué conceptos se aplican dentro y fuera de convenio. Todo editable, nada fijo en el código. */
export default function ParamsTab({ params: initialParams, visibility: initialVisibility, onSaved }: { params: PayrollParams; visibility: Visibility; onSaved: () => void }) {
  const actor = useUser();
  const { notify } = useToast();
  const [params, setParams] = useState<PayrollParams>(initialParams);
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setNum = (key: NumKey, text: string) => setParams({ ...params, [key]: Number(text.replace(",", ".")) || 0 });
  const toggle = (cat: "convenio" | "fuera", id: ConceptId, on: boolean) => setVisibility({ ...visibility, [cat]: { ...visibility[cat], [id]: on } });
  const isOn = (cat: "convenio" | "fuera", id: ConceptId) => visibility[cat][id] !== false;

  const problems: string[] = [];
  if (params.divisorHorasExtra <= 0 || params.divisorVacaciones <= 0 || params.divisorInasistencias <= 0 || params.horasJornada <= 0) problems.push("Los divisores y las horas de jornada tienen que ser mayores que 0.");
  for (const k of ["jubilacionPct", "pamiPct", "obraSocialPct", "sindicalPct", "alicuotaGananciasPct", "presentismoPct", "antiguedadPct", "contribucionesPatronalesPct"] as const) if (params[k] < 0 || params[k] > 100) problems.push("Los porcentajes van de 0 a 100.");

  const save = async () => {
    if (problems.length > 0) return setError("Revisá los datos marcados.");
    setSaving(true);
    setError(null);
    try {
      await savePayrollSettings(params, visibility, actor.email);
      notify("Guardaste los parámetros de la liquidación.");
      onSaved();
    } catch (e) {
      console.error("No se pudieron guardar los parámetros", e);
      setError(withCode("No se pudo guardar. Probá de nuevo.", e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-space-lg">
      {GROUPS.map((g) => (
        <section key={g.title} className="rounded-xl bg-surface-container-low p-space-lg shadow-md">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">{g.title}</h2>
          {g.hint ? <p className="mt-1 font-body-sm text-body-sm text-amber-200">{g.hint}</p> : null}
          <div className="mt-space-md grid gap-4 md:grid-cols-2">
            {g.fields.map(([key, label, hint]) => (
              <label key={key} className="block font-label-lg text-label-lg text-on-surface">{label}
                <input inputMode="decimal" value={String(params[key])} onChange={(e) => setNum(key, e.target.value)} className={`mt-1.5 ${field}`} />
                {hint ? <span className="mt-1 block font-body-sm text-body-sm font-normal text-on-surface-variant">{hint}</span> : null}
              </label>
            ))}
            {g.title === "Haberes" ? (
              <>
                <label className="flex items-center justify-between gap-3 rounded-lg bg-surface-container p-3 font-label-lg text-label-lg text-on-surface">Presentismo también fuera de convenio<input type="checkbox" role="switch" aria-label="Presentismo fuera de convenio" checked={params.presentismoFueraConvenio} onChange={(e) => setParams({ ...params, presentismoFueraConvenio: e.target.checked })} className="size-5 accent-[var(--hz-primary)]" /></label>
                <label className="flex items-center justify-between gap-3 rounded-lg bg-surface-container p-3 font-label-lg text-label-lg text-on-surface">Valor de la hora extra sobre básico + antigüedad<input type="checkbox" role="switch" aria-label="Horas extra sobre remuneración normal" checked={params.horasExtraSobreRemNormal} onChange={(e) => setParams({ ...params, horasExtraSobreRemNormal: e.target.checked })} className="size-5 accent-[var(--hz-primary)]" /></label>
              </>
            ) : null}
          </div>
        </section>
      ))}

      <section className="rounded-xl bg-surface-container-low p-space-lg shadow-md">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Conceptos del recibo</h2>
        <p className="mt-1 mb-space-md font-body-sm text-body-sm text-on-surface-variant">Qué conceptos se aplican a quienes están dentro y fuera de convenio.</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead><tr className="font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">{["Concepto", "Dentro de convenio", "Fuera de convenio"].map((h) => <th key={h} className="px-space-md py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {CONCEPTS.map((c) => (
                <tr key={c.id} className="hover:bg-surface-container">
                  <td className="px-space-md py-2">{c.label}</td>
                  {(["convenio", "fuera"] as const).map((cat) => (
                    <td key={cat} className="px-space-md py-2"><input type="checkbox" aria-label={`${c.label}: ${cat === "convenio" ? "dentro" : "fuera"} de convenio`} checked={isOn(cat, c.id)} onChange={(e) => toggle(cat, c.id, e.target.checked)} className="size-4 accent-[var(--hz-primary)]" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {error || problems.length > 0 ? <ul role="alert" className="space-y-1 rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error ? <li>{error}</li> : null}{problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => { setParams(DEFAULT_PARAMS); setVisibility(DEFAULT_VISIBILITY); setError(null); }} className="px-4 py-2.5 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Volver a los valores por defecto</button>
        <button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-primary-container px-6 py-2.5 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-50">{saving ? "Guardando…" : "Guardar parámetros"}</button>
      </div>
    </div>
  );
}
