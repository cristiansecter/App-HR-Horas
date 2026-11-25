import { useState, type FormEvent } from "react";
import { useCompany } from "@/company/CompanyContext";
import { AMOUNT_LABELS, currentEntry, formatArs, rateProblems, type RateEntry } from "@/domain/compensation";
import { dateInBuenosAires } from "@/domain/dates";
import { PAY_MODEL_LABELS } from "@/domain/features";
import { withCode } from "@/services/errors";
import { deleteRate, getEmployeePay, PAY_CHANGED, RateEditError, saveProfile, saveRate, updateRate } from "@/services/compensation";
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
  // Vigencia que se está corrigiendo (null = se está cargando una nueva) y la que se pidió borrar.
  const [editing, setEditing] = useState<RateEntry | null>(null);
  const [removing, setRemoving] = useState<RateEntry | null>(null);
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
      if (editing) await updateRate(uid, editing.from, { from, amount: value }, actor.email);
      else await saveRate(uid, { from, amount: value, setBy: actor.email }, actor.email);
    } catch (err) {
      console.error("No se pudo guardar la remuneración", err);
      setFormError(err instanceof RateEditError ? err.message : withCode("No se pudo guardar. Probá de nuevo.", err));
      setSaving(false);
      return;
    }
    setSaving(false);
    setAdding(false);
    setAmount("");
    notify(editing ? `Corregiste la vigencia del ${dmy(editing.from)} de ${fullName}.` : `Guardaste el ${labels.field.toLowerCase()} de ${fullName}.`);
    setEditing(null);
  };

  const startEdit = (r: RateEntry) => { setEditing(r); setFrom(r.from); setAmount(String(r.amount).replace(".", ",")); setFormError(null); setAdding(true); };
  const confirmRemove = async () => {
    if (!removing) return;
    setSaving(true);
    try {
      await deleteRate(uid, removing.from, actor.email);
      notify(`Quitaste la vigencia del ${dmy(removing.from)} de ${fullName}.`);
      setRemoving(null);
    } catch (err) {
      console.error("No se pudo borrar la vigencia", err);
      setFormError(err instanceof RateEditError ? err.message : withCode("No se pudo borrar. Probá de nuevo.", err));
    } finally {
      setSaving(false);
    }
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
        <button type="button" onClick={() => { setEditing(null); setAmount(""); setAdding(true); setFormError(null); setFrom(today); }} className="flex items-center gap-1.5 rounded-xl bg-primary-container px-4 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110">
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
                {["Desde", labels.field, "Lo cargó", "Cuándo", ""].map((h, i) => <th key={i} className="px-space-md py-2 font-semibold">{h || <span className="sr-only">Acciones</span>}</th>)}
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {history.map((r) => (
                <tr key={r.from}>
                  <td className="px-space-md py-2 tabular-nums">{dmy(r.from)}</td>
                  <td className="px-space-md py-2 tabular-nums">{formatArs(r.amount, model === "hourly" ? 2 : 0)}</td>
                  <td className="px-space-md py-2 text-on-surface-variant">{r.setBy}</td>
                  <td className="px-space-md py-2 text-on-surface-variant tabular-nums">
                    {new Date(r.setAt).toLocaleString("es-AR")}
                    {r.editedAt ? <span className="block font-body-sm text-body-sm">Corregido por {r.editedBy ?? "—"} el {new Date(r.editedAt).toLocaleString("es-AR")}</span> : null}
                  </td>
                  <td className="px-space-md py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" aria-label={`Editar la vigencia del ${dmy(r.from)}`} title="Editar" onClick={() => startEdit(r)} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-primary"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                      <button type="button" aria-label={`Borrar la vigencia del ${dmy(r.from)}`} title="Borrar" onClick={() => { setFormError(null); setRemoving(r); }} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-error"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                    </div>
                  </td>
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
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => { setAdding(false); setEditing(null); }} />
          <form role="dialog" aria-label={editing ? "Editar vigencia" : "Nueva vigencia"} onSubmit={(e) => void submitRate(e)} className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
            <h2 className="font-headline-md text-headline-md text-on-surface">{editing ? "Editar vigencia" : "Nueva vigencia"}</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{editing ? "Corregí la fecha o el monto de esta vigencia. Queda registrado quién la corrigió y cuándo. Los costos de Rendimiento se recalculan con el valor corregido." : "El monto rige desde la fecha que elijas. Lo anterior queda en el historial."}</p>
            <label className="block font-label-lg text-label-lg text-on-surface">Rige desde<input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} className={`mt-1.5 ${field}`} /></label>
            <label className="block font-label-lg text-label-lg text-on-surface">{labels.field} ($ {labels.unit})<input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={model === "hourly" ? "4.500" : "850.000"} className={`mt-1.5 ${field}`} /></label>
            {formError ? <p role="alert" className="font-body-sm text-body-sm text-error">{formError}</p> : null}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setAdding(false); setEditing(null); }} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-primary-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-50">{saving ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {removing ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setRemoving(null)} />
          <div role="alertdialog" aria-label="Borrar vigencia" className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
            <h2 className="font-headline-md text-headline-md text-on-surface">¿Borrar esta vigencia?</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Vas a borrar el {labels.field.toLowerCase()} de {formatArs(removing.amount, model === "hourly" ? 2 : 0)} que rige desde el {dmy(removing.from)}. Las fechas que cubría pasan a usar la vigencia anterior (o quedan sin monto si no hay otra). Los recibos ya publicados no cambian.
            </p>
            {formError ? <p role="alert" className="font-body-sm text-body-sm text-error">{formError}</p> : null}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setRemoving(null)} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
              <button type="button" disabled={saving} onClick={() => void confirmRemove()} className="rounded-lg bg-error px-5 py-2 font-label-lg text-label-lg font-bold text-on-error hover:brightness-110 disabled:opacity-50">{saving ? "Borrando…" : "Borrar"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
