import { useState, type FormEvent } from "react";
import { useCompany } from "@/company/CompanyContext";
import { AMOUNT_LABELS, currentEntry, formatArs, rateProblems } from "@/domain/compensation";
import { dateInBuenosAires } from "@/domain/dates";
import { PAY_MODEL_LABELS } from "@/domain/features";
import { withCode } from "@/services/errors";
import { getEmployeePay, PAY_CHANGED, saveProfile, saveRate } from "@/services/compensation";
import { useUser } from "@/session/SessionContext";
import { useToast } from "@/ui/Toast";
import { useAsync } from "@/ui/useAsync";

const field = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";
const dmy = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Sueldo de una persona en su ficha (módulo "Sueldos en el legajo"). Solo lo ve el administrador.
 * Cada cambio es una vigencia nueva con fecha: el historial no se pisa, así los costos de meses pasados siguen siendo los de entonces.
 */
export default function PaySection({ uid, fullName }: { uid: string; fullName: string }) {
  const { features } = useCompany();
  const actor = useUser();
  const { notify } = useToast();
  const model = features.payModel;
  const labels = AMOUNT_LABELS[model];
  const { data, loading, error } = useAsync(() => getEmployeePay(uid), [uid], [PAY_CHANGED]);
  const today = dateInBuenosAires(new Date());

  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState(today);
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [convenio, setConvenio] = useState<boolean | null>(null);
  const [obraSocial, setObraSocial] = useState<string | null>(null);
  const [hijos, setHijos] = useState<string | null>(null);

  const current = data ? currentEntry(data.rates, today) : null;
  const history = data ? [...data.rates].sort((a, b) => b.from.localeCompare(a.from)) : [];

  const submitRate = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount.replace(/\./g, "").replace(",", "."));
    const problems = rateProblems(from, value);
    if (problems.length > 0) return setFormError(problems[0]!);
    setSaving(true);
    setFormError(null);
    try {
      await saveRate(uid, { from, amount: value, setBy: actor.email }, actor.email);
    } catch (err) {
      console.error("No se pudo guardar la remuneración", err);
      setFormError(withCode("No se pudo guardar. Probá de nuevo.", err));
      setSaving(false);
      return;
    }
    setSaving(false);
    setAdding(false);
    setAmount("");
    notify(`Guardaste el ${labels.field.toLowerCase()} de ${fullName}.`);
  };

  const submitProfile = async () => {
    if (!data) return;
    try {
      await saveProfile(uid, { convenio: convenio ?? data.convenio, obraSocial: obraSocial ?? data.obraSocial, hijos: Number(hijos ?? data.hijos) || 0 }, actor.email);
      setConvenio(null); setObraSocial(null); setHijos(null);
      notify("Guardaste los datos para la liquidación.");
    } catch (err) {
      console.error("No se pudieron guardar los datos de liquidación", err);
      setFormError(withCode("No se pudo guardar. Probá de nuevo.", err));
    }
  };

  return (
    <section className="rounded-xl bg-surface-container-low p-space-lg shadow-md" aria-label="Sueldo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Sueldo</h2>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Solo lo ve el administrador. Modelo de pago de la empresa: {PAY_MODEL_LABELS[model].toLowerCase()}.</p>
        </div>
        <button type="button" onClick={() => { setAdding(true); setFormError(null); setFrom(today); }} className="flex items-center gap-1.5 rounded-xl bg-primary-container px-4 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110">
          <span className="material-symbols-outlined text-[18px]">add</span>Cargar nueva vigencia
        </button>
      </div>

      {error ? <p role="alert" className="mt-space-md rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error}</p> : null}

      <div className="mt-space-md rounded-xl bg-surface-container p-4">
        <p className="font-label-md text-label-md text-on-surface-variant">{labels.field} vigente</p>
        {current ? (
          <p className="mt-1 font-headline-lg text-headline-lg font-bold tabular-nums text-on-surface">
            {formatArs(current.amount, model === "hourly" ? 2 : 0)} <span className="font-headline-sm text-headline-sm font-normal text-on-surface-variant">{labels.unit}</span>
          </p>
        ) : (
          <p className="mt-1 font-body-md text-body-md text-amber-300">{loading && !data ? "Cargando…" : "Todavía no tiene un monto cargado."}</p>
        )}
        {current ? <p className="font-body-sm text-body-sm text-on-surface-variant">Desde el {dmy(current.from)}</p> : null}
      </div>

      {history.length > 0 ? (
        <div className="mt-space-md overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">
                {["Desde", labels.field, "Lo cargó", "Cuándo"].map((h) => <th key={h} className="px-space-md py-2 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {history.map((r) => (
                <tr key={r.from}>
                  <td className="px-space-md py-2 tabular-nums">{dmy(r.from)}</td>
                  <td className="px-space-md py-2 tabular-nums">{formatArs(r.amount, model === "hourly" ? 2 : 0)}</td>
                  <td className="px-space-md py-2 text-on-surface-variant">{r.setBy}</td>
                  <td className="px-space-md py-2 text-on-surface-variant tabular-nums">{new Date(r.setAt).toLocaleString("es-AR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {features.modules.payroll && data ? (
        <div className="mt-space-lg border-t border-white/5 pt-space-md">
          <h3 className="font-label-lg text-label-lg font-semibold text-on-surface">Datos para la liquidación</h3>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <label className="flex items-center justify-between gap-3 rounded-lg bg-surface-container p-3 font-label-lg text-label-lg text-on-surface">
              Dentro de convenio
              <input type="checkbox" role="switch" aria-label="Dentro de convenio" checked={convenio ?? data.convenio} onChange={(e) => setConvenio(e.target.checked)} className="size-5 accent-[var(--hz-primary)]" />
            </label>
            <label className="block font-label-lg text-label-lg text-on-surface">Obra social<input value={obraSocial ?? data.obraSocial} maxLength={80} onChange={(e) => setObraSocial(e.target.value)} className={`mt-1.5 ${field}`} /></label>
            <label className="block font-label-lg text-label-lg text-on-surface">Hijos a cargo<input type="number" min={0} max={30} value={hijos ?? String(data.hijos)} onChange={(e) => setHijos(e.target.value)} className={`mt-1.5 ${field}`} /></label>
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" disabled={convenio === null && obraSocial === null && hijos === null} onClick={() => void submitProfile()} className="rounded-lg bg-surface-container-high px-4 py-2 font-label-lg text-label-lg font-semibold text-on-surface hover:bg-surface-container-highest disabled:opacity-40">Guardar datos</button>
          </div>
        </div>
      ) : null}

      {adding ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setAdding(false)} />
          <form role="dialog" aria-label="Nueva vigencia" onSubmit={(e) => void submitRate(e)} className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
            <h2 className="font-headline-md text-headline-md text-on-surface">Nueva vigencia</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">El monto rige desde la fecha que elijas. Lo anterior queda en el historial.</p>
            <label className="block font-label-lg text-label-lg text-on-surface">Rige desde<input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} className={`mt-1.5 ${field}`} /></label>
            <label className="block font-label-lg text-label-lg text-on-surface">{labels.field} ($ {labels.unit})<input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={model === "hourly" ? "4.500" : "850.000"} className={`mt-1.5 ${field}`} /></label>
            {formError ? <p role="alert" className="font-body-sm text-body-sm text-error">{formError}</p> : null}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-primary-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-50">{saving ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
