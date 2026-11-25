import { validateWorkSchedule, type WorkDay, type WorkSchedule } from "@/domain/overtime";

const DAYS = [
  ["mon", "Lunes"],
  ["tue", "Martes"],
  ["wed", "Miércoles"],
  ["thu", "Jueves"],
  ["fri", "Viernes"],
  ["sat", "Sábado"],
  ["sun", "Domingo"],
] as const;

type Key = (typeof DAYS)[number][0];
const DAY_NAME: Record<string, string> = Object.fromEntries(DAYS);

const timeInput = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-2 py-1.5 font-body-md text-body-md text-on-surface tabular-nums focus:border-primary-container focus:outline-hidden disabled:opacity-40";

/** Mensajes de validación con el nombre del día en vez de la clave interna ("mon: ..." → "Lunes: ..."). */
export const scheduleProblems = (schedule: WorkSchedule): string[] =>
  validateWorkSchedule(schedule).map((m) => m.replace(/^(\w{3}):/, (_, k: string) => `${DAY_NAME[k] ?? k}:`));

/** Editor de la jornada semanal: qué días trabaja, de qué hora a qué hora y el almuerzo (que se descuenta). */
export function ScheduleEditor({ value, onChange }: { value: WorkSchedule; onChange: (next: WorkSchedule) => void }) {
  const setDay = (key: Key, day: WorkDay | null) => onChange({ ...value, [key]: day });
  const problems = scheduleProblems(value);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr className="font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">
              {["Día", "Entrada", "Salida", "Almuerzo desde", "Almuerzo hasta"].map((h) => (
                <th key={h} className="px-2 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="font-body-md text-body-md text-on-surface">
            {DAYS.map(([key, label]) => {
              const day = value[key];
              const hasLunch = day?.lunchStart !== undefined;
              return (
                <tr key={key}>
                  <td className="px-2 py-1.5">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={day !== null} onChange={(e) => setDay(key, e.target.checked ? { start: "09:00", end: "18:00", lunchStart: "13:00", lunchEnd: "14:00" } : null)} className="size-4 accent-[var(--hz-primary)]" />
                      <span className={day ? "" : "text-on-surface-variant"}>{label}</span>
                    </label>
                  </td>
                  <td className="px-2 py-1.5"><input type="time" aria-label={`${label}: entrada`} disabled={!day} value={day?.start ?? ""} onChange={(e) => day && setDay(key, { ...day, start: e.target.value })} className={timeInput} /></td>
                  <td className="px-2 py-1.5"><input type="time" aria-label={`${label}: salida`} disabled={!day} value={day?.end ?? ""} onChange={(e) => day && setDay(key, { ...day, end: e.target.value })} className={timeInput} /></td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" aria-label={`${label}: con almuerzo`} disabled={!day} checked={hasLunch} onChange={(e) => day && setDay(key, e.target.checked ? { ...day, lunchStart: "13:00", lunchEnd: "14:00" } : { start: day.start, end: day.end })} className="size-4 accent-[var(--hz-primary)]" />
                      <input type="time" aria-label={`${label}: almuerzo desde`} disabled={!day || !hasLunch} value={day?.lunchStart ?? ""} onChange={(e) => day && setDay(key, { ...day, lunchStart: e.target.value })} className={timeInput} />
                    </div>
                  </td>
                  <td className="px-2 py-1.5"><input type="time" aria-label={`${label}: almuerzo hasta`} disabled={!day || !hasLunch} value={day?.lunchEnd ?? ""} onChange={(e) => day && setDay(key, { ...day, lunchEnd: e.target.value })} className={timeInput} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {problems.length > 0 ? (
        <ul role="alert" className="space-y-1 rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
