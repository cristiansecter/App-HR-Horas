import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEMO_HOLIDAYS, DEMO_OVERTIME_CONFIG, DEMO_PROJECTS, DEMO_SCHEDULE } from "@/demo/demoData";
import { dateInBuenosAires } from "@/domain/dates";
import { classifyEntry, dayTypeOf, InvalidEntryError, type ClassifiedEntry, type DayType } from "@/domain/overtime";
import { useSession, useUser } from "@/session/SessionContext";
import { createTimeEntry } from "@/services/timeEntries";

interface LoadHoursValue {
  openDrawer: () => void;
  closeDrawer: () => void;
}

const LoadHoursContext = createContext<LoadHoursValue | null>(null);

export const useLoadHours = (): LoadHoursValue => {
  const ctx = useContext(LoadHoursContext);
  if (!ctx) throw new Error("useLoadHours debe usarse dentro de <LoadHoursProvider>.");
  return ctx;
};

export function LoadHoursProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openDrawer, closeDrawer }), [openDrawer, closeDrawer]);
  return (
    <LoadHoursContext.Provider value={value}>
      {children}
      {open ? <LoadHoursDrawer onClose={closeDrawer} /> : null}
    </LoadHoursContext.Provider>
  );
}

const DAY_TYPE_LABELS: Record<DayType, string> = { weekday: "Día hábil", saturday: "Sábado", sunday: "Domingo", holiday: "Feriado" };

const CATEGORY_STYLE: Record<string, string> = {
  normal: "bg-primary-container",
  ot50: "bg-primary",
  ot100: "bg-error",
};

const formatHours = (hours: number): string => `${hours.toLocaleString("es-AR", { maximumFractionDigits: 2 })} h`;

const categoryLabel = (id: string): string =>
  id === "normal" ? "Normales" : (DEMO_OVERTIME_CONFIG.tiers.find((t) => t.id === id)?.label ?? id);

const toMinutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const inputClass =
  "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 focus:outline-hidden";

function LoadHoursDrawer({ onClose }: { onClose: () => void }) {
  const user = useUser();
  const { isReal } = useSession();
  const today = dateInBuenosAires(new Date());
  const [date, setDate] = useState(today);
  const [project, setProject] = useState(DEMO_PROJECTS[2]!.code);
  const [ticket, setTicket] = useState("");
  const [from, setFrom] = useState("08:30");
  const [to, setTo] = useState("17:30");
  const [onCall, setOnCall] = useState(false);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const result = useMemo<{ ok: true; value: ClassifiedEntry } | { ok: false; message: string } | null>(() => {
    if (!date || !from || !to) return null;
    try {
      return { ok: true, value: classifyEntry({ date, startTime: from, endTime: to, isOnCall: onCall }, { schedule: DEMO_SCHEDULE, holidays: DEMO_HOLIDAYS, config: DEMO_OVERTIME_CONFIG }) };
    } catch (e) {
      return { ok: false, message: e instanceof InvalidEntryError ? e.message : "No se pudo calcular el registro." };
    }
  }, [date, from, to, onCall]);

  const dayType = date ? dayTypeOf(date, DEMO_HOLIDAYS) : "weekday";
  const holiday = date ? DEMO_HOLIDAYS.get(date) : undefined;
  const crossesMidnight = from && to && toMinutes(to) <= toMinutes(from);

  const save = async (label: string, status: "draft" | "submitted") => {
    if (!result?.ok || saving) return;
    setSaveError(null);
    if (isReal) {
      // Cuenta real: el registro se guarda en Firestore. La demo solo simula.
      setSaving(true);
      try {
        await createTimeEntry({ userId: user.uid, projectId: project, date, startTime: from, endTime: to, isOnCall: onCall, ticketRef: ticket, notes, status });
      } catch (e) {
        console.error("No se pudo guardar el registro", e);
        setSaveError("No se pudo guardar el registro. Revisá que la fecha esté dentro de los días permitidos y probá de nuevo.");
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    setSaved(label);
    window.setTimeout(onClose, 1200);
  };

  const dateText = date
    ? new Intl.DateTimeFormat("es-AR", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))
    : "";

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <aside role="dialog" aria-label="Cargar horas" className="relative flex h-full w-full max-w-xl flex-col bg-surface-container-low shadow-[0_20px_40px_-10px_rgba(0,0,0,0.7)]">
        <div className="flex items-start justify-between gap-4 p-space-lg pb-space-md">
          <div>
            <span className="flex items-center gap-2 font-label-xs-mono text-label-xs-mono tracking-widest text-primary-container uppercase">
              <span className="size-1.5 rounded-full bg-primary-container" />
              Imputación diaria
            </span>
            <h2 className="mt-1 font-headline-md text-headline-md text-on-surface">Cargar horas</h2>
            <p className="mt-1 flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant first-letter:uppercase">
              <span className="material-symbols-outlined text-[16px] text-primary">calendar_today</span>
              {dateText}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex size-10 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 space-y-space-md overflow-y-auto px-space-lg pb-space-lg">
          <div className="flex items-center gap-3 rounded-xl bg-surface-container p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-surface-container-high text-primary">
              <span className="material-symbols-outlined">badge</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-label-lg text-label-lg text-on-surface">{user.fullName}</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Jornada: lunes a viernes, 08:30 a 17:30</p>
            </div>
            <span className="rounded bg-secondary-container px-2 py-1 font-label-xs-mono text-label-xs-mono font-bold text-on-secondary-container uppercase">
              {holiday ? holiday.name.split("(")[0]!.trim().slice(0, 18) : DAY_TYPE_LABELS[dayType]}
            </span>
          </div>

          <label className="block">
            <span className="mb-1.5 flex justify-between font-label-lg text-label-lg text-on-surface">
              Fecha <span className="font-label-xs-mono text-label-xs-mono text-on-surface-variant uppercase">Obligatorio</span>
            </span>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>

          <label className="block">
            <span className="mb-1.5 block font-label-lg text-label-lg text-on-surface">Proyecto</span>
            <select value={project} onChange={(e) => setProject(e.target.value)} className={inputClass}>
              {DEMO_PROJECTS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 flex justify-between font-label-lg text-label-lg text-on-surface">
              Ticket o referencia <span className="font-label-xs-mono text-label-xs-mono text-on-surface-variant uppercase">Opcional</span>
            </span>
            <input type="text" value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="Ej.: TCK-8921" className={inputClass} />
          </label>

          <div className="rounded-xl bg-surface-container p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-label-lg text-label-lg text-on-surface">Franja horaria</span>
              {result?.ok ? (
                <span className="rounded bg-surface-container-high px-2 py-1 font-label-xs-mono text-label-xs-mono text-primary tabular-nums">Total: {formatHours(result.value.hours)}</span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block font-label-md text-label-md text-on-surface-variant">Hora desde</span>
                <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1 block font-label-md text-label-md text-on-surface-variant">Hora hasta</span>
                <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
              </label>
            </div>
            {crossesMidnight && result?.ok ? (
              <p className="mt-3 flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] text-primary">nightlight</span>
                El registro termina al día siguiente. Cada día se evalúa por separado.
              </p>
            ) : null}
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-surface-container p-4">
            <div>
              <p className="font-label-lg text-label-lg text-on-surface">Guardia</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Queda identificada en el reporte. Las horas se cuentan como normales.</p>
            </div>
            <input type="checkbox" role="switch" checked={onCall} onChange={(e) => setOnCall(e.target.checked)} className="size-5 accent-[var(--hz-primary)]" />
          </label>

          <label className="block">
            <span className="mb-1.5 flex justify-between font-label-lg text-label-lg text-on-surface">
              Descripción <span className="font-label-xs-mono text-label-xs-mono text-on-surface-variant">{notes.length} / 250</span>
            </span>
            <textarea value={notes} maxLength={250} rows={3} onChange={(e) => setNotes(e.target.value)} placeholder="Qué hiciste en esta franja" className={inputClass} />
          </label>

          <section aria-label="Vista previa del registro" className="rounded-xl border border-primary-container/20 bg-surface-container-lowest p-4">
            <h3 className="mb-3 flex items-center gap-2 font-label-xs-mono text-label-xs-mono tracking-widest text-primary-container uppercase">
              <span className="material-symbols-outlined text-[16px]">preview</span>
              Vista previa
            </h3>
            {result === null ? <p className="text-body-sm text-on-surface-variant">Completá fecha y horas para ver el desglose.</p> : null}
            {result && !result.ok ? <p role="alert" className="text-body-sm text-error">{result.message}</p> : null}
            {result?.ok ? (
              <div className="space-y-3">
                <p className="font-headline-sm text-headline-sm text-on-surface tabular-nums">
                  {formatHours(result.value.hours)}
                  <span className="ml-2 font-body-md text-body-md text-on-surface-variant">
                    {Object.entries(result.value.breakdown)
                      .map(([id, h]) => `${formatHours(h)} ${categoryLabel(id).toLowerCase()}`)
                      .join(" + ")}
                  </span>
                </p>
                {[...new Set(result.value.segments.map((s) => s.date))].map((segDate) => (
                  <div key={segDate}>
                    {crossesMidnight ? <p className="mb-1 font-label-md text-label-md text-on-surface-variant">{segDate.split("-").reverse().join("/")} · {DAY_TYPE_LABELS[result.value.segments.find((s) => s.date === segDate)!.dayType]}</p> : null}
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-container-high" role="img" aria-label="Línea de tiempo del día">
                      {(() => {
                        let cursor = 0;
                        return result.value.segments
                          .filter((s) => s.date === segDate)
                          .flatMap((s) => {
                            const a = toMinutes(s.from === "24:00" ? "23:59" : s.from);
                            const b = s.to === "24:00" ? 1440 : toMinutes(s.to);
                            const gap = a - cursor;
                            cursor = b;
                            return [
                              gap > 0 ? <span key={`${s.from}-gap`} style={{ width: `${(gap / 1440) * 100}%` }} /> : null,
                              <span key={`${s.from}-${s.category}`} className={CATEGORY_STYLE[s.category] ?? "bg-tertiary-container"} title={`${s.from} a ${s.to}`} style={{ width: `${((b - a) / 1440) * 100}%` }} />,
                            ];
                          });
                      })()}
                    </div>
                    <div className="mt-1 flex justify-between font-label-xs-mono text-label-xs-mono text-on-surface-variant"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
                  </div>
                ))}
                <ul className="flex flex-wrap gap-x-4 gap-y-1 font-label-xs-mono text-label-xs-mono text-on-surface">
                  {Object.keys(result.value.breakdown).map((id) => (
                    <li key={id} className="flex items-center gap-1.5">
                      <span className={`size-3 rounded-sm ${CATEGORY_STYLE[id] ?? "bg-tertiary-container"}`} />
                      {categoryLabel(id)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/5 bg-surface-container-low p-space-md">
          {saveError ? <p role="alert" className="mr-auto font-body-sm text-body-sm text-error">{saveError}</p> : null}
          {saved ? (
            <p role="status" className="mr-auto flex items-center gap-2 font-body-sm text-body-sm text-primary">
              <span className="material-symbols-outlined text-[18px]">task_alt</span>
              {saved}.{isReal ? "" : " En la demo los registros no se conservan."}
            </p>
          ) : null}
          <button type="button" onClick={onClose} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
          <button type="button" disabled={!result?.ok || saving} onClick={() => void save("Borrador guardado", "draft")} className="rounded-lg bg-surface-container-high px-4 py-2 font-label-lg text-label-lg text-on-surface disabled:opacity-40">Guardar borrador</button>
          <button type="button" disabled={!result?.ok || saving} onClick={() => void save("Registro enviado", "submitted")} className="flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 font-label-lg text-label-lg font-semibold text-on-primary shadow-[0_0_16px_color-mix(in_srgb,var(--hz-primary)_30%,transparent)] disabled:opacity-40">
            <span className="material-symbols-outlined text-[18px]">send</span>
            Guardar y enviar
          </button>
        </div>
      </aside>
    </div>
  );
}
