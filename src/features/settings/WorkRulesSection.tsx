import { useMemo, useState, type FormEvent } from "react";
import { useCompany } from "@/company/CompanyContext";
import { isValidClock, nextTierId, normalizeClock } from "@/domain/overtime/editing";
import {
  DAY_TYPES,
  defaultOvertimeConfig,
  defaultWorkSchedule,
  saturdayRules,
  validateOvertimeConfig,
  type DayType,
  type OvertimeRule,
  type Tier,
  type WorkSchedule,
} from "@/domain/overtime";
import { withCode } from "@/services/errors";
import { saveWorkRules } from "@/services/settings";
import { useToast } from "@/ui/Toast";
import { ScheduleEditor, scheduleProblems } from "@/features/directory/ScheduleEditor";

const field = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";
const DAY_LABEL: Record<DayType, string> = { weekday: "Día hábil", saturday: "Sábado", sunday: "Domingo", holiday: "Feriado" };
const DAY_HINT: Record<DayType, string> = {
  weekday: "Lo que cae dentro de la jornada es hora normal; estas franjas definen cómo se computa lo que queda afuera.",
  saturday: "El sábado es día no laborable: todo lo trabajado es extra según estas franjas.",
  sunday: "Todo lo trabajado un domingo es extra.",
  holiday: "En un feriado que cuenta como tal no hay jornada: todo lo trabajado es extra.",
};

/** Reglas de horas extra, jornada general y ventana de edición. Valida que cada tipo de día quede cubierto las 24 horas. */
export default function WorkRulesSection() {
  const company = useCompany();
  const { notify } = useToast();
  const [tiers, setTiers] = useState<Tier[]>(() => company.overtime.tiers.map((t) => ({ ...t })));
  const [rules, setRules] = useState<OvertimeRule[]>(() => company.overtime.rules.map((r) => ({ ...r })));
  const [onCall, setOnCall] = useState(company.overtime.onCallCountsAsNormal);
  const [windowDays, setWindowDays] = useState(String(company.editWindowDays));
  const [schedule, setSchedule] = useState<WorkSchedule>(company.defaultSchedule);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problems = useMemo(() => {
    const out: string[] = [];
    for (const t of tiers) if (!t.label.trim()) out.push(`El tramo "${t.id}" necesita un nombre.`);
    if (tiers.length === 0) out.push("Tiene que haber al menos un tramo de hora extra.");
    for (const r of rules) {
      if (!isValidClock(r.from)) out.push(`${DAY_LABEL[r.dayType]}: la hora "${r.from}" no es válida (usá HH:MM).`);
      if (!isValidClock(r.to, true)) out.push(`${DAY_LABEL[r.dayType]}: la hora "${r.to}" no es válida (usá HH:MM; 24:00 para fin del día).`);
    }
    // Si alguna hora no es válida, la validación de cobertura solo repetiría el error.
    if (out.length === 0) out.push(...validateOvertimeConfig({ tiers, rules, onCallCountsAsNormal: onCall }));
    const days = Number(windowDays);
    if (!Number.isInteger(days) || days < 1 || days > 60) out.push("La ventana de edición va de 1 a 60 días.");
    out.push(...scheduleProblems(schedule));
    return out;
  }, [tiers, rules, onCall, windowDays, schedule]);

  const setTier = (id: string, patch: Partial<Tier>) => setTiers((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const setRule = (index: number, patch: Partial<OvertimeRule>) => setRules((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addTier = () => setTiers((ts) => [...ts, { id: nextTierId(ts, 75), label: "Extra 75%", percent: 75 }]);
  const lowHigh = (): [string, string] => {
    const sorted = [...tiers].sort((a, b) => a.percent - b.percent);
    return [sorted[0]?.id ?? "", sorted[sorted.length - 1]?.id ?? ""];
  };
  const applySaturday = (mode: "flat_50" | "lct") => {
    const [low, high] = lowHigh();
    setRules((rs) => [...rs.filter((r) => r.dayType !== "saturday"), ...saturdayRules(mode, low, high)]);
  };
  const reset = () => {
    const d = defaultOvertimeConfig({ saturdayMode: "lct" });
    setTiers(d.tiers.map((t) => ({ ...t })));
    setRules(d.rules.map((r) => ({ ...r })));
    setOnCall(d.onCallCountsAsNormal);
    setSchedule(defaultWorkSchedule());
    setWindowDays("7");
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problems.length > 0) return setError("Revisá los puntos marcados antes de guardar.");
    setSaving(true);
    setError(null);
    try {
      await saveWorkRules({
        overtime: { tiers: tiers.map((t) => ({ id: t.id, label: t.label.trim(), percent: Number(t.percent) })), rules: rules.map((r) => ({ ...r, from: normalizeClock(r.from), to: normalizeClock(r.to) })), onCallCountsAsNormal: onCall },
        defaultSchedule: schedule,
        editWindowDays: Number(windowDays),
      });
      company.reload();
      notify("Guardaste las reglas. Se aplican a lo que se apruebe de ahora en más.");
    } catch (err) {
      console.error("No se pudieron guardar las reglas", err);
      setError(withCode("No se pudo guardar. Probá de nuevo.", err));
    } finally {
      setSaving(false);
    }
  };

  const card = "rounded-xl bg-surface-container-low p-space-lg shadow-md";
  const h2 = "font-headline-sm text-headline-sm font-semibold text-on-surface";
  const hint = "mt-1 mb-space-md font-body-sm text-body-sm text-on-surface-variant";

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-space-lg">
      <section className={card}>
        <h2 className={h2}>Jornada general de la empresa</h2>
        <p className={hint}>La usan todas las personas que no tienen una jornada propia en su ficha.</p>
        <ScheduleEditor value={schedule} onChange={setSchedule} />
      </section>

      <section className={card}>
        <h2 className={h2}>Tramos de hora extra</h2>
        <p className={hint}>Cada tramo es una forma de pagar la hora extra. El identificador no se cambia: lo usan las horas ya aprobadas. No se pueden borrar tramos; si ya no querés usar uno, sacalo de las franjas de abajo.</p>
        <div className="space-y-2">
          {tiers.map((t) => (
            <div key={t.id} className="grid grid-cols-[6rem_1fr_7rem] items-center gap-3">
              <code className="rounded bg-surface-container px-2 py-2 text-center font-mono text-[12px] text-on-surface-variant" title="Identificador fijo">{t.id}</code>
              <input aria-label={`Nombre del tramo ${t.id}`} value={t.label} onChange={(e) => setTier(t.id, { label: e.target.value })} className={field} />
              <label className="flex items-center gap-1.5">
                <input aria-label={`Porcentaje del tramo ${t.id}`} type="number" min={1} max={300} value={t.percent} onChange={(e) => setTier(t.id, { percent: Number(e.target.value) })} className={field} />
                <span className="text-on-surface-variant">%</span>
              </label>
            </div>
          ))}
        </div>
        <button type="button" onClick={addTier} className="mt-3 flex items-center gap-1.5 font-label-lg text-label-lg font-semibold text-primary hover:underline">
          <span className="material-symbols-outlined text-[18px]">add</span>Agregar tramo
        </button>
      </section>

      <section className={card}>
        <h2 className={h2}>Franjas por tipo de día</h2>
        <p className={hint}>Cada tipo de día tiene que quedar cubierto las 24 horas, sin superposiciones. Usá 24:00 como fin del día. Una franja que cruza la medianoche va, por ejemplo, de 21:00 a 08:00.</p>
        <div className="space-y-space-lg">
          {DAY_TYPES.map((dayType) => (
            <div key={dayType}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-label-lg text-label-lg font-semibold text-on-surface">{DAY_LABEL[dayType]}</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{DAY_HINT[dayType]}</p>
                </div>
                {dayType === "saturday" ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => applySaturday("flat_50")} className="rounded-lg bg-surface-container-high px-3 py-1.5 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-highest">Todo el sábado al tramo menor</button>
                    <button type="button" onClick={() => applySaturday("lct")} className="rounded-lg bg-surface-container-high px-3 py-1.5 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-highest">Según la ley: hasta las 13 el menor, desde las 13 el mayor</button>
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                {rules.map((r, i) =>
                  r.dayType !== dayType ? null : (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1.4fr_auto] items-center gap-3">
                      <input aria-label={`${DAY_LABEL[dayType]}: desde`} value={r.from} onChange={(e) => setRule(i, { from: e.target.value })} onBlur={() => setRule(i, { from: normalizeClock(r.from) })} placeholder="00:00" className={`${field} tabular-nums`} />
                      <input aria-label={`${DAY_LABEL[dayType]}: hasta`} value={r.to} onChange={(e) => setRule(i, { to: e.target.value })} onBlur={() => setRule(i, { to: normalizeClock(r.to) })} placeholder="24:00" className={`${field} tabular-nums`} />
                      <select aria-label={`${DAY_LABEL[dayType]}: tramo`} value={r.tierId} onChange={(e) => setRule(i, { tierId: e.target.value })} className={field}>
                        {tiers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                      <button type="button" aria-label="Quitar franja" onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))} className="flex size-9 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                    </div>
                  ),
                )}
              </div>
              <button type="button" onClick={() => setRules((rs) => [...rs, { dayType, from: "00:00", to: "24:00", tierId: tiers[0]?.id ?? "" }])} className="mt-2 flex items-center gap-1.5 font-label-md text-label-md font-semibold text-primary hover:underline">
                <span className="material-symbols-outlined text-[16px]">add</span>Agregar franja
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className={h2}>Otras reglas</h2>
        <div className="mt-space-md space-y-4">
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-surface-container p-4">
            <div>
              <p className="font-label-lg text-label-lg text-on-surface">Las horas de guardia cuentan como normales</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Si está activado, una guardia se computa entera como hora normal aunque caiga fuera de la jornada, y queda identificada en la planilla.</p>
            </div>
            <input type="checkbox" role="switch" aria-label="Guardia cuenta como normal" checked={onCall} onChange={(e) => setOnCall(e.target.checked)} className="size-5 accent-[var(--hz-primary)]" />
          </label>
          <label className="block font-label-lg text-label-lg text-on-surface">
            Ventana de edición (días)
            <input type="number" min={1} max={60} value={windowDays} onChange={(e) => setWindowDays(e.target.value)} className={`mt-1.5 max-w-40 ${field}`} />
            <span className="mt-1 block font-body-sm text-body-sm font-normal text-on-surface-variant">Cuántos días hacia atrás puede cargar o corregir horas cada persona.</span>
          </label>
        </div>
      </section>

      <p className="rounded-lg bg-surface-container px-4 py-3 font-body-sm text-body-sm text-on-surface-variant">
        Los cambios se aplican a las horas que se aprueben de ahora en más. Lo que ya está aprobado conserva sus horas y su desglose.
      </p>

      {error || problems.length > 0 ? (
        <ul role="alert" className="space-y-1 rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">
          {error ? <li>{error}</li> : null}
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      ) : null}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={reset} className="px-4 py-2.5 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Volver a los valores por defecto</button>
        <button type="submit" disabled={saving} className="rounded-xl bg-primary-container px-6 py-2.5 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-50">{saving ? "Guardando…" : "Guardar reglas"}</button>
      </div>
    </form>
  );
}
