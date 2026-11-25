import { useState, type FormEvent } from "react";
import { formatArs } from "@/domain/compensation";
import type { AutoNovelties, ManualNovelties } from "@/domain/payroll/novelties";

const field = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface tabular-nums focus:border-primary-container focus:outline-hidden";
const num = (s: string) => Math.max(0, Number(s.replace(/\./g, "").replace(",", ".")) || 0);

const MONEY_FIELDS: readonly [keyof ManualNovelties, string][] = [
  ["bono", "Bono individual"],
  ["premio", "Premio por desempeño"],
  ["viaticos", "Viáticos (no remunerativo)"],
  ["reembolsos", "Reembolsos de gastos (no remunerativo)"],
  ["adelanto", "Adelanto de sueldo (descuento)"],
  ["embargo", "Embargo judicial (descuento)"],
];

/** Novedades del mes de una persona: lo que se carga solo desde las horas y licencias (para ver) y lo que se carga a mano. */
export default function NoveltiesDialog({ name, auto, manual, onSave, onClose }: { name: string; auto: AutoNovelties; manual: ManualNovelties; onSave: (m: ManualNovelties) => void; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(MONEY_FIELDS.map(([k]) => [k, manual[k] ? String(manual[k]) : ""])));
  const [sac, setSac] = useState(manual.sac);
  const [sacMeses, setSacMeses] = useState(String(manual.sacMeses));
  const [sacBase, setSacBase] = useState(manual.sacBase ? String(manual.sacBase) : "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = { ...Object.fromEntries(MONEY_FIELDS.map(([k]) => [k, num(values[k] ?? "")])), sac, sacMeses: Math.min(6, Math.max(1, Math.trunc(Number(sacMeses) || 6))) } as unknown as ManualNovelties;
    if (sac && num(sacBase) > 0) next.sacBase = num(sacBase);
    onSave(next);
  };

  const tiers = Object.entries(auto.hoursByTier).filter(([, h]) => h > 0);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto p-4">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <form role="dialog" aria-label="Novedades del mes" onSubmit={submit} className="relative my-6 flex w-full max-w-lg flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-surface">Novedades de {name}</h2>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Lo de arriba se carga solo desde las horas y licencias aprobadas. Lo de abajo lo cargás vos.</p>
        </div>
        <div className="rounded-lg bg-surface-container p-3 font-body-sm text-body-sm text-on-surface">
          <p className="mb-1 font-label-md text-label-md font-semibold text-on-surface-variant">Desde Horus</p>
          <p>Horas normales: <strong>{auto.normalHours}</strong>{tiers.map(([id, h]) => <span key={id}> · {id}: <strong>{h}</strong> h</span>)}</p>
          <p>Inasistencias injustificadas: <strong>{auto.inasist}</strong> días · Vacaciones: <strong>{auto.vacaciones}</strong> días</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {MONEY_FIELDS.map(([key, label]) => (
            <label key={key} className="block font-label-md text-label-md text-on-surface">{label}<input inputMode="decimal" value={values[key] ?? ""} placeholder="0" onChange={(e) => setValues({ ...values, [key]: e.target.value })} className={`mt-1 ${field}`} /></label>
          ))}
        </div>
        <div className="rounded-lg bg-surface-container p-3">
          <label className="flex items-center justify-between gap-3 font-label-lg text-label-lg text-on-surface">
            Liquidar SAC (aguinaldo) este mes
            <input type="checkbox" role="switch" aria-label="Liquidar SAC" checked={sac} onChange={(e) => setSac(e.target.checked)} className="size-5 accent-[var(--hz-primary)]" />
          </label>
          {sac ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block font-label-md text-label-md text-on-surface">Meses trabajados en el semestre (1 a 6)<input type="number" min={1} max={6} value={sacMeses} onChange={(e) => setSacMeses(e.target.value)} className={`mt-1 ${field}`} /></label>
              <label className="block font-label-md text-label-md text-on-surface">Mejor remuneración del semestre<input inputMode="decimal" value={sacBase} placeholder="Automática" onChange={(e) => setSacBase(e.target.value)} className={`mt-1 ${field}`} /><span className="mt-1 block text-[11px] font-normal text-on-surface-variant">Vacío: se toma la mayor entre los recibos guardados del semestre y la de este mes{sacBase && num(sacBase) > 0 ? ` (${formatArs(num(sacBase))})` : ""}.</span></label>
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
          <button type="submit" className="rounded-lg bg-primary-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110">Aplicar</button>
        </div>
      </form>
    </div>
  );
}
