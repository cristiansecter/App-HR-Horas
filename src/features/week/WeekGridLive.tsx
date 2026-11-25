import { useMemo, useState } from "react";
import { useCompany } from "@/company/CompanyContext";
import { addDays, dateInBuenosAires, dayOfWeek } from "@/domain/dates";
import { ENTRY_STATUS_LABELS, LEAVE_TYPE_LABELS, type EntryStatus, type TimeEntry } from "@/domain/model";
import { classifyEntry } from "@/domain/overtime";
import { expectedHours, mondayOf, weekDates } from "@/domain/week";
import { useLoadHours } from "@/features/hours/LoadHoursDrawer";
import { withCode } from "@/services/errors";
import { LEAVES_CHANGED, listMyLeaves } from "@/services/leaves";
import { ENTRIES_CHANGED, listMyTimeEntries, updateTimeEntry } from "@/services/timeEntries";
import { useUser } from "@/session/SessionContext";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useToast } from "@/ui/Toast";
import { useAsync } from "@/ui/useAsync";

const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
const TONE: Record<EntryStatus, "ok" | "info" | "warn" | "muted"> = { approved: "ok", submitted: "info", observed: "warn", draft: "muted" };
const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const dm = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;

interface Shown {
  entry: TimeEntry;
  hours: number;
  breakdown: Record<string, number>;
}

/** Mi semana con datos reales: la grilla de lunes a domingo con tus registros, feriados y licencias. */
export default function WeekGridLive() {
  const user = useUser();
  const company = useCompany();
  const { notify } = useToast();
  const { openDrawerOn, editEntry } = useLoadHours();
  const today = dateInBuenosAires(new Date());
  const [monday, setMonday] = useState(mondayOf(today));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entries = useAsync(() => listMyTimeEntries(user.uid), [user.uid], [ENTRIES_CHANGED]);
  const leaves = useAsync(() => listMyLeaves(user.uid), [user.uid], [LEAVES_CHANGED]);
  const schedule = user.workSchedule ?? company.defaultSchedule;
  const days = useMemo(() => weekDates(monday), [monday]);
  const earliest = addDays(today, -company.editWindowDays);

  /** Aprobado: las horas congeladas. El resto: una estimación con las reglas actuales. */
  const shown = useMemo(() => {
    const byDate = new Map<string, Shown[]>();
    for (const e of entries.data ?? []) {
      if (e.date < days[0]! || e.date > days[6]!) continue;
      let hours = e.hours;
      let breakdown = e.breakdown;
      if (e.status !== "approved" || hours === undefined || !breakdown) {
        try {
          const c = classifyEntry({ date: e.date, startTime: e.startTime, endTime: e.endTime, isOnCall: e.isOnCall }, { schedule, holidays: company.holidays, config: company.overtime });
          hours = c.hours;
          breakdown = c.breakdown;
        } catch {
          hours = 0;
          breakdown = {};
        }
      }
      byDate.set(e.date, [...(byDate.get(e.date) ?? []), { entry: e, hours: hours ?? 0, breakdown: breakdown ?? {} }]);
    }
    for (const list of byDate.values()) list.sort((a, b) => a.entry.startTime.localeCompare(b.entry.startTime));
    return byDate;
  }, [entries.data, days, schedule, company.holidays, company.overtime]);

  const leaveOn = (date: string) => (leaves.data ?? []).find((l) => l.status === "approved" && date >= l.startDate && date <= l.endDate);
  const pendingLeaveOn = (date: string) => (leaves.data ?? []).find((l) => l.status === "pending" && date >= l.startDate && date <= l.endDate);

  const all = days.flatMap((d) => shown.get(d) ?? []);
  const totalHours = all.reduce((s, x) => s + x.hours, 0);
  const byCategory = all.reduce<Record<string, number>>((acc, x) => {
    for (const [k, v] of Object.entries(x.breakdown)) acc[k] = (acc[k] ?? 0) + v;
    return acc;
  }, {});
  const expected = days.reduce((s, d) => (leaveOn(d) ? s : s + expectedHours(d, schedule, company.holidays)), 0);
  const drafts = all.filter((x) => x.entry.status === "draft");
  const observed = all.filter((x) => x.entry.status === "observed");
  const label = (id: string) => (id === "normal" ? "Normales" : (company.overtime.tiers.find((t) => t.id === id)?.label ?? id));
  const isCurrent = monday === mondayOf(today);

  const sendDrafts = async () => {
    setSending(true);
    setError(null);
    try {
      for (const { entry } of drafts) {
        await updateTimeEntry(entry.id, { projectId: entry.projectId, date: entry.date, startTime: entry.startTime, endTime: entry.endTime, isOnCall: entry.isOnCall, ticketRef: entry.ticketRef, notes: entry.notes, status: "submitted" });
      }
      notify(drafts.length === 1 ? "Enviaste 1 registro a aprobación." : `Enviaste ${drafts.length} registros a aprobación.`);
    } catch (e) {
      console.error("No se pudo enviar la semana", e);
      setError(withCode("No se pudieron enviar todos los registros. Los que faltan siguen como borrador.", e));
    } finally {
      setSending(false);
    }
  };

  const weekLabel = `${dm(days[0]!)} al ${dm(days[6]!)} de ${days[6]!.slice(0, 4)}`;

  return (
    <Page>
      <PageHeader
        eyebrow={isCurrent ? "Esta semana" : "Semana"}
        title={weekLabel}
        subtitle="Tus registros de lunes a domingo. Tocá un día para cargar horas."
        actions={
          <>
            <div className="flex items-center gap-1 rounded-lg bg-surface-container-high p-1">
              <button type="button" aria-label="Semana anterior" onClick={() => setMonday(addDays(monday, -7))} className="flex size-9 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"><span className="material-symbols-outlined">chevron_left</span></button>
              <button type="button" disabled={isCurrent} onClick={() => setMonday(mondayOf(today))} className="rounded-md px-3 py-1.5 font-label-lg text-label-lg text-on-surface hover:bg-surface-container-highest disabled:opacity-40">Hoy</button>
              <button type="button" aria-label="Semana siguiente" onClick={() => setMonday(addDays(monday, 7))} className="flex size-9 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"><span className="material-symbols-outlined">chevron_right</span></button>
            </div>
            <button type="button" disabled={drafts.length === 0 || sending} onClick={() => void sendDrafts()} className="flex items-center gap-2 rounded-xl bg-primary-container px-4 py-2.5 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-40">
              <span className="material-symbols-outlined text-[20px]">send</span>
              {sending ? "Enviando…" : drafts.length > 0 ? `Enviar borradores (${drafts.length})` : "Enviar borradores"}
            </button>
          </>
        }
      />

      {entries.error || leaves.error || error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error ?? entries.error ?? leaves.error}</p> : null}
      {observed.length > 0 ? (
        <p role="note" className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 font-body-sm text-body-sm text-amber-200">
          {observed.length === 1 ? "Tenés 1 registro observado" : `Tenés ${observed.length} registros observados`} esta semana: tocalo para ver el comentario y corregirlo.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        <div className="rounded-xl bg-surface-container-low p-5 shadow-md">
          <p className="font-label-md text-label-md font-semibold text-on-surface-variant">Horas de la semana</p>
          <p className="mt-2 font-headline-lg text-headline-lg font-bold tabular-nums text-on-surface">{fmt(totalHours)} <span className="font-headline-sm text-headline-sm font-normal text-on-surface-variant">de {fmt(expected)} h</span></p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container-highest" role="progressbar" aria-valuenow={Math.min(100, Math.round((totalHours / (expected || 1)) * 100))} aria-valuemin={0} aria-valuemax={100} aria-label="Horas cargadas sobre las que te corresponden">
            <div className="h-full rounded-full bg-primary-container" style={{ width: `${Math.min(100, (totalHours / (expected || 1)) * 100)}%` }} />
          </div>
        </div>
        {["normal", ...company.overtime.tiers.map((t) => t.id)].slice(0, 3).map((id) => (
          <div key={id} className="rounded-xl bg-surface-container-low p-5 shadow-md">
            <p className="font-label-md text-label-md font-semibold text-on-surface-variant">{label(id)}</p>
            <p className="mt-2 font-headline-lg text-headline-lg font-bold tabular-nums text-on-surface">{fmt(byCategory[id] ?? 0)} <span className="font-headline-sm text-headline-sm font-normal text-on-surface-variant">h</span></p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-gutter md:grid-cols-2 xl:grid-cols-7">
        {days.map((date) => {
          const dow = dayOfWeek(date);
          const holiday = company.holidays.get(date);
          const leave = leaveOn(date);
          const pendingLeave = pendingLeaveOn(date);
          const list = shown.get(date) ?? [];
          const dayHours = list.reduce((s, x) => s + x.hours, 0);
          const isToday = date === today;
          const canLoad = date <= today && date >= earliest && !leave;
          const weekend = dow === 0 || dow === 6;
          return (
            <section key={date} aria-label={`${DAY_NAMES[dow]} ${dm(date)}`} className={`flex min-h-48 flex-col gap-2 rounded-xl p-3 shadow-md ${isToday ? "bg-surface-container ring-1 ring-primary-container/60" : weekend ? "bg-surface-container-lowest/60" : "bg-surface-container-low"}`}>
              <header className="flex items-baseline justify-between">
                <div>
                  <p className={`font-label-xs-mono text-label-xs-mono tracking-wider uppercase ${isToday ? "text-primary" : "text-on-surface-variant"}`}>{DAY_NAMES[dow]}{isToday ? " · hoy" : ""}</p>
                  <p className="font-headline-sm text-headline-sm font-semibold text-on-surface tabular-nums">{dm(date)}</p>
                </div>
                <span className="font-label-md text-label-md font-semibold tabular-nums text-on-surface-variant">{dayHours > 0 ? `${fmt(dayHours)} h` : ""}</span>
              </header>
              <div className="flex flex-wrap gap-1">
                {holiday?.countsAsHoliday ? <Chip tone="warn">{holiday.name.split("(")[0]!.trim()}</Chip> : null}
                {leave ? <Chip tone="info">{LEAVE_TYPE_LABELS[leave.type]}</Chip> : null}
                {!leave && pendingLeave ? <Chip tone="muted">Licencia pendiente</Chip> : null}
              </div>
              <ul className="flex flex-1 flex-col gap-1.5">
                {list.map(({ entry, hours }) => {
                  const editable = (entry.status === "draft" || entry.status === "observed") && entry.date >= earliest;
                  return (
                    <li key={entry.id}>
                      <button type="button" disabled={!editable} onClick={() => editEntry(entry)} title={entry.reviewerNote ?? undefined} className="flex w-full flex-col gap-1 rounded-lg bg-surface-container p-2 text-left transition-colors enabled:hover:bg-surface-container-high disabled:cursor-default">
                        <span className="flex items-center justify-between gap-2 font-label-md text-label-md text-on-surface tabular-nums">
                          <span>{entry.startTime} a {entry.endTime}</span>
                          <span className="font-semibold">{fmt(hours)} h</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                          {entry.projectId}
                          {entry.isOnCall ? <Chip tone="guard">Guardia</Chip> : null}
                          <Chip tone={TONE[entry.status]}>{ENTRY_STATUS_LABELS[entry.status]}</Chip>
                          {entry.createdBy && entry.createdBy !== entry.userId ? <Chip tone="muted">Cargado por un superior</Chip> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {canLoad ? (
                <button type="button" onClick={() => openDrawerOn(date)} className="flex w-full items-center justify-center gap-1 rounded-lg bg-surface-container py-1.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface">
                  <span className="material-symbols-outlined text-[16px]">add</span>Cargar
                </button>
              ) : null}
            </section>
          );
        })}
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Las horas de los registros sin aprobar son una estimación; se confirman cuando tu supervisor aprueba. Solo podés cargar o corregir los últimos {company.editWindowDays} días.</p>
    </Page>
  );
}
