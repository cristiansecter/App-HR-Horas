import { useMemo, useState, type FormEvent } from "react";
import { useCompany } from "@/company/CompanyContext";
import { clockToMinutes, DAY_KIND_LABELS, dayStatus, minutesToClock, summarizeMonth, type DayStatus } from "@/domain/attendance";
import { addDays, dateInBuenosAires, dayOfWeek } from "@/domain/dates";
import { LEAVE_TYPE_LABELS, type UserSummary } from "@/domain/model";
import { workDayFor } from "@/domain/overtime/schedule";
import { monthPerks } from "@/domain/presentism";
import { LEAVE_FLAGS_CHANGED, listFlagsForReview } from "@/services/leaveFlags";
import { RegisterLeaveDialog } from "@/features/approvals/LeaveReviewSection";
import { downloadAttendance } from "@/features/export/downloadAttendance";
import { ATTENDANCE_CHANGED, listMarksForReview, markFor, removeMark } from "@/services/attendance";
import { listUsers } from "@/services/company";
import { withCode } from "@/services/errors";
import { LEAVES_CHANGED, listApprovedLeavesForReview } from "@/services/leaves";
import { useUser } from "@/session/SessionContext";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useToast } from "@/ui/Toast";
import { useAsync } from "@/ui/useAsync";
import { KIND_TONE } from "./MyAttendanceView";

const field = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";
const dmy = (iso: string) => iso.split("-").reverse().join("/");
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const monthLabel = (m: string) => {
  const text = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
};

type Panel = "day" | "month";

/**
 * Asistencia del equipo: el supervisor (su equipo) y el administrador (toda la empresa) ven quién llegó, corrigen marcas,
 * registran ausencias y sacan el resumen del mes. Solo en el modo por asistencia.
 */
export default function TeamAttendanceView() {
  const actor = useUser();
  const company = useCompany();
  const { notify } = useToast();
  const today = dateInBuenosAires(new Date());
  const [panel, setPanel] = useState<Panel>("day");
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [marking, setMarking] = useState<{ person: UserSummary; status: DayStatus } | null>(null);
  const [absence, setAbsence] = useState<UserSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tol = company.lateToleranceMin;
  // Las marcas se piden por mes: la pestaña "Día" usa el mes de la fecha elegida.
  const loadMonth = panel === "day" ? date.slice(0, 7) : month;

  const { data, loading, error: loadError } = useAsync(
    async () => {
      const users = await listUsers();
      // Administrador: toda la empresa menos los administradores (no tienen jornada). Supervisor: quienes lo tienen como supervisor.
      const team = users.filter((u) => u.active && u.uid !== actor.uid && (actor.role === "admin" ? u.role !== "admin" : u.supervisorId === actor.uid));
      if (team.length === 0) return { team, marks: [], leaves: [], flags: new Map() };
      const ids = team.map((u) => u.uid);
      const [marks, leaves, flags] = await Promise.all([listMarksForReview(actor, ids, loadMonth), listApprovedLeavesForReview(actor, ids), company.features.presentism ? listFlagsForReview(actor, ids) : Promise.resolve(new Map())]);
      return { team, marks, leaves, flags };
    },
    [actor.uid, actor.role, loadMonth, company.features.presentism],
    [ATTENDANCE_CHANGED, LEAVES_CHANGED, LEAVE_FLAGS_CHANGED],
  );
  const team = data?.team ?? [];

  const scheduleOf = (u: UserSummary) => u.workSchedule ?? company.defaultSchedule;
  const statusOf = (u: UserSummary, d: string): DayStatus =>
    dayStatus({
      date: d, today, schedule: scheduleOf(u), holidays: company.holidays, toleranceMin: tol,
      leaves: (data?.leaves ?? []).filter((l) => l.userId === u.uid),
      mark: (data?.marks ?? []).find((m) => m.userId === u.uid && m.date === d),
    });

  // ---- pestaña Día
  const rows = useMemo(() => team.map((u) => ({ u, s: statusOf(u, date) })), [team, data, date, company.holidays, tol]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => {
    const c = { present: 0, late: 0, leave: 0, unjustified: 0, missing: 0 };
    for (const { s } of rows) {
      if (s.kind === "present") c.present++;
      else if (s.kind === "late") c.late++;
      else if (s.kind === "leave") c.leave++;
      else if (s.kind === "unjustified") c.unjustified++;
      else if (s.kind === "missing" || s.kind === "pending") c.missing++;
    }
    return c;
  }, [rows]);

  // ---- pestaña Mes
  const perksOn = company.features.presentism;
  const summaries = useMemo(
    () => team.map((u) => {
      const leaves = (data?.leaves ?? []).filter((l) => l.userId === u.uid);
      const summary = summarizeMonth({ month, today, schedule: scheduleOf(u), holidays: company.holidays, toleranceMin: tol, leaves, marks: (data?.marks ?? []).filter((m) => m.userId === u.uid) });
      // Premio y presentismo del mes: las marcas de las licencias que tocan el mes y, si se definió, las tardanzas acumuladas.
      const monthStart = `${month}-01`;
      const monthEnd = `${month}-31`;
      const perks = perksOn ? monthPerks({ leaves: leaves.filter((l) => l.startDate <= monthEnd && l.endDate >= monthStart), flags: data?.flags ?? new Map(), defaults: company.presentismDefaults, lateCount: summary.late, lateLimit: company.features.presentismLateLimit }) : undefined;
      return { u, summary, perks };
    }),
    [team, data, month, today, company.holidays, tol, perksOn, company.presentismDefaults, company.features.presentismLateLimit], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const exportFile = async (kind: "xlsx" | "csv") => {
    setError(null);
    try {
      const [y, m] = month.split("-").map(Number) as [number, number];
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const dates = Array.from({ length: last }, (_, i) => addDays(`${month}-01`, i));
      await downloadAttendance(
        {
          companyName: company.companyName,
          periodLabel: monthLabel(month),
          generatedOn: dmy(today),
          toleranceMin: tol,
          summary: summaries.map(({ u, summary, perks }) => ({ fullName: u.fullName, summary, ...(perks ? { perks } : {}) })),
          detail: team.flatMap((u) => dates.map((d) => ({ fullName: u.fullName, status: statusOf(u, d) }))),
        },
        kind,
        `sgblack-asistencia-${month}`,
      );
    } catch (e) {
      console.error("No se pudo exportar", e);
      setError(withCode("No se pudo armar la planilla.", e));
    }
  };

  const tab = (id: Panel, label: string) => (
    <button key={id} type="button" role="tab" aria-selected={panel === id} onClick={() => setPanel(id)} className={`rounded-lg px-4 py-2 font-label-lg text-label-lg ${panel === id ? "bg-surface-container-high font-semibold text-primary" : "text-on-surface-variant hover:text-on-surface"}`}>{label}</button>
  );

  return (
    <Page>
      <PageHeader
        eyebrow={actor.role === "admin" ? "Administrador" : "Supervisor"}
        title="Asistencia del equipo"
        subtitle={actor.role === "admin" ? "Quién llegó cada día en toda la empresa, y el resumen del mes para el contador." : "Quién llegó cada día en tu equipo, y el resumen del mes."}
      />
      {loadError || error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error ?? loadError}</p> : null}

      <div role="tablist" aria-label="Vistas" className="flex flex-wrap gap-2 rounded-xl bg-surface-container-low p-2">{tab("day", "Día")}{tab("month", "Resumen del mes")}</div>

      {team.length === 0 ? (
        <div className="rounded-xl bg-surface-container-low p-space-lg text-center text-on-surface-variant shadow-sm">{loading && !data ? "Cargando…" : actor.role === "admin" ? "No hay personas activas." : "Todavía no tenés personas a cargo. El administrador te las asigna desde el organigrama."}</div>
      ) : panel === "day" ? (
        <div className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3 px-space-md pb-3">
            <label className="font-label-md text-label-md text-on-surface-variant">Día
              <input type="date" aria-label="Día" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className={`mt-1 block ${field} !w-auto`} />
            </label>
            <p className="font-body-md text-body-md text-on-surface-variant capitalize">{WEEKDAYS[dayOfWeek(date)]} {dmy(date)}</p>
            <p aria-label="Resumen del día" className="font-body-sm text-body-sm text-on-surface-variant">
              Presentes {counts.present + counts.late} · Tarde {counts.late} · Licencia {counts.leave} · Ausentes {counts.unjustified} · {date === today ? "Sin marcar" : "Sin registro"} {counts.missing}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="stack-table w-full border-collapse text-left" aria-label="Asistencia del día">
              <thead><tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">{["Persona", "Estado", "Llegada", "Marcó", "Nota", ""].map((h, i) => <th key={i} className="px-space-md py-3.5 font-semibold">{h || <span className="sr-only">Acciones</span>}</th>)}</tr></thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {rows.map(({ u, s }) => {
                  const workable = s.kind !== "nonworking" && s.kind !== "holiday" && s.kind !== "future";
                  return (
                    <tr key={u.uid} className="align-middle hover:bg-surface-container">
                      <td className="px-space-md py-2.5 font-semibold">{u.fullName}</td>
                      <td data-label="Estado" className="px-space-md py-2.5"><Chip tone={KIND_TONE[s.kind]}>{s.kind === "leave" && s.leaveType ? LEAVE_TYPE_LABELS[s.leaveType] : s.kind === "pending" ? "Sin marcar" : DAY_KIND_LABELS[s.kind]}</Chip>{s.kind === "late" ? <span className="ml-2 font-body-sm text-body-sm text-on-surface-variant">{s.lateMinutes} min</span> : null}</td>
                      <td data-label="Llegada" className="px-space-md py-2.5 tabular-nums">{s.arrivalMinutes !== undefined ? minutesToClock(s.arrivalMinutes) : "—"}</td>
                      <td data-label="Marcó" className="px-space-md py-2.5 text-on-surface-variant">{s.mark ? (s.mark.source === "self" ? "La persona" : s.mark.source === "manual" ? "Un superior" : "Sistema de fichaje") : "—"}</td>
                      <td data-label="Nota" className="px-space-md py-2.5 text-on-surface-variant">{s.mark?.note ?? ""}</td>
                      <td className="px-space-md py-2.5">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {workable ? (
                            <button type="button" aria-label={s.mark ? `Corregir la marca de ${u.fullName}` : `Marcar presente a ${u.fullName}`} onClick={() => setMarking({ person: u, status: s })} className="rounded-lg bg-surface-container-high px-3 py-1.5 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-highest">{s.mark ? "Corregir" : "Marcar presente"}</button>
                          ) : null}
                          {workable && !s.mark && s.kind !== "leave" && s.kind !== "unjustified" ? (
                            <button type="button" aria-label={`Registrar ausencia de ${u.fullName}`} onClick={() => setAbsence(u)} className="rounded-lg px-3 py-1.5 font-label-md text-label-md font-semibold text-error hover:bg-error/10">Ausente</button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">“Marcar presente” carga la llegada de alguien que no pudo marcar. “Ausente” registra una ausencia (injustificada por defecto; también podés elegir otro tipo de licencia). Las licencias aprobadas aparecen solas.</p>
        </div>
      ) : (
        <div className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3 px-space-md pb-3">
            <label className="font-label-md text-label-md text-on-surface-variant">Mes
              <input type="month" aria-label="Mes" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`mt-1 block ${field} !w-auto`} />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => void exportFile("xlsx")} className="flex items-center gap-2 rounded-xl bg-surface-container-high px-4 py-2.5 font-label-lg text-label-lg font-semibold text-on-surface hover:bg-surface-container-highest"><span className="material-symbols-outlined text-[20px]">download</span>Excel</button>
              <button type="button" onClick={() => void exportFile("csv")} className="flex items-center gap-2 rounded-xl bg-surface-container-high px-4 py-2.5 font-label-lg text-label-lg font-semibold text-on-surface hover:bg-surface-container-highest"><span className="material-symbols-outlined text-[20px]">download</span>CSV</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="stack-table w-full border-collapse text-left" aria-label="Resumen del mes">
              <thead><tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">{["Persona", "Días laborables", "Presentes", "Tardanzas", "Licencias", "Injustificadas", "Sin registro", "Sin tardanzas ni faltas", ...(perksOn ? ["Pierde presentismo", "Pierde premio"] : [])].map((h) => <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {summaries.map(({ u, summary: s, perks }) => (
                  <tr key={u.uid} className="hover:bg-surface-container">
                    <td className="px-space-md py-2.5 font-semibold">{u.fullName}</td>
                    <td data-label="Días laborables" className="px-space-md py-2.5 tabular-nums">{s.workingDays}</td>
                    <td data-label="Presentes" className="px-space-md py-2.5 tabular-nums">{s.present}</td>
                    <td data-label="Tardanzas" className="px-space-md py-2.5 tabular-nums">{s.late}{s.late > 0 ? <span className="text-on-surface-variant"> ({s.lateMinutes} min)</span> : null}</td>
                    <td data-label="Licencias" className="px-space-md py-2.5 tabular-nums">{s.leaveDays}</td>
                    <td data-label="Injustificadas" className="px-space-md py-2.5 tabular-nums">{s.unjustified}</td>
                    <td data-label="Sin registro" className="px-space-md py-2.5 tabular-nums">{s.missing > 0 ? <span className="font-semibold text-error">{s.missing}</span> : 0}</td>
                    <td data-label="Sin tardanzas ni faltas" className="px-space-md py-2.5">{s.workingDays === 0 ? "—" : s.perfect ? <Chip tone="ok">Sí</Chip> : <Chip tone="muted">No</Chip>}</td>
                    {perks ? (
                      <>
                        <td data-label="Pierde presentismo" className="px-space-md py-2.5">{perks.presentism.lost ? <span title={perks.presentism.reasons.join("; ")}><Chip tone="bad">Sí</Chip><span className="mt-0.5 block max-w-52 font-body-sm text-body-sm text-on-surface-variant">{perks.presentism.reasons.join("; ")}</span></span> : <Chip tone="ok">No</Chip>}</td>
                        <td data-label="Pierde premio" className="px-space-md py-2.5">{perks.prize.lost ? <span title={perks.prize.reasons.join("; ")}><Chip tone="bad">Sí</Chip><span className="mt-0.5 block max-w-52 font-body-sm text-body-sm text-on-surface-variant">{perks.prize.reasons.join("; ")}</span></span> : <Chip tone="ok">No</Chip>}</td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">Solo informa la asistencia: no calcula descuentos ni presentismo en pesos, eso lo decide el contador. Tolerancia de llegada: {tol} min. Los “sin registro” se resuelven en la pestaña Día (marcando presente o registrando la ausencia).</p>
        </div>
      )}

      {marking ? (
        <MarkDialog
          person={marking.person}
          date={date}
          status={marking.status}
          startMinutes={(() => { const d = workDayFor(scheduleOf(marking.person), date); return d ? clockToMinutes(d.start) : 540; })()}
          onClose={() => setMarking(null)}
          onDone={(msg) => { setMarking(null); notify(msg); }}
        />
      ) : null}

      {absence && data ? (
        <RegisterLeaveDialog
          people={team}
          holidays={company.holidays}
          defaultSchedule={company.defaultSchedule}
          initial={{ uid: absence.uid, date, type: "unjustified" }}
          onClose={() => setAbsence(null)}
          onDone={(name) => { setAbsence(null); notify(`Registraste la ausencia de ${name}.`); }}
        />
      ) : null}
    </Page>
  );
}

/** Marcar o corregir la llegada de una persona en un día. Se puede dejar una nota y quitar una marca puesta por error. */
function MarkDialog({ person, date, status, startMinutes, onClose, onDone }: { person: UserSummary; date: string; status: DayStatus; startMinutes: number; onClose: () => void; onDone: (message: string) => void }) {
  const reviewer = useUser();
  const [time, setTime] = useState(minutesToClock(status.mark?.arrivalMinutes ?? startMinutes));
  const [note, setNote] = useState(status.mark?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{2}:\d{2}$/.test(time)) return setError("Poné la hora de llegada.");
    setSaving(true);
    setError(null);
    try {
      await markFor(reviewer, person.uid, date, clockToMinutes(time), note, Boolean(status.mark));
      onDone(status.mark ? `Corregiste la llegada de ${person.fullName}.` : `Marcaste presente a ${person.fullName}.`);
    } catch (err) {
      console.error("No se pudo guardar la marca", err);
      setError(withCode("No se pudo guardar. Probá de nuevo.", err));
      setSaving(false);
    }
  };
  const remove = async () => {
    setSaving(true);
    try {
      await removeMark(person.uid, date);
      onDone(`Quitaste la marca de ${person.fullName}.`);
    } catch (err) {
      console.error("No se pudo quitar la marca", err);
      setError(withCode("No se pudo quitar la marca.", err));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <form role="dialog" aria-label={status.mark ? "Corregir llegada" : "Marcar presente"} onSubmit={(e) => void save(e)} className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-surface">{status.mark ? "Corregir llegada" : "Marcar presente"}</h2>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{person.fullName} · {dmy(date)}</p>
        </div>
        <label className="block font-label-lg text-label-lg text-on-surface">Hora de llegada
          <input type="time" required aria-label="Hora de llegada" value={time} onChange={(e) => setTime(e.target.value)} className={`mt-1.5 ${field}`} />
        </label>
        <label className="block font-label-lg text-label-lg text-on-surface">Nota <span className="font-label-xs-mono text-label-xs-mono text-on-surface-variant uppercase">Opcional</span>
          <input aria-label="Nota" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Por ejemplo: avisó que llegaba tarde" className={`mt-1.5 ${field}`} />
        </label>
        {error ? <p role="alert" className="font-body-sm text-body-sm text-error">{error}</p> : null}
        <div className="flex items-center justify-between gap-3">
          {status.mark ? <button type="button" disabled={saving} onClick={() => void remove()} className="rounded-lg px-3 py-2 font-label-md text-label-md font-semibold text-error hover:bg-error/10 disabled:opacity-50">Quitar marca</button> : <span />}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-primary-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-50">Guardar</button>
          </div>
        </div>
      </form>
    </div>
  );
}
