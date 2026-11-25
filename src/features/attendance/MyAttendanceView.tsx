import { useMemo, useState } from "react";
import { useCompany } from "@/company/CompanyContext";
import { DAY_KIND_LABELS, dayStatus, minutesOfDayBA, minutesToClock, summarizeMonth, type DayKind } from "@/domain/attendance";
import { addDays, dateInBuenosAires, dayOfWeek } from "@/domain/dates";
import { LEAVE_TYPE_LABELS } from "@/domain/model";
import { ATTENDANCE_CHANGED, AlreadyMarkedError, listMyMarks, markSelf } from "@/services/attendance";
import { withCode } from "@/services/errors";
import { LEAVES_CHANGED, listMyLeaves } from "@/services/leaves";
import { useUser } from "@/session/SessionContext";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useToast } from "@/ui/Toast";
import { useAsync } from "@/ui/useAsync";

export const KIND_TONE: Record<DayKind, "ok" | "warn" | "info" | "bad" | "muted"> = {
  future: "muted", nonworking: "muted", holiday: "muted", present: "ok", late: "warn", leave: "info", unjustified: "bad", pending: "muted", missing: "bad",
};
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const dmy = (iso: string) => iso.split("-").reverse().join("/");
const monthLabel = (m: string) => {
  const text = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const shiftMonth = (m: string, delta: number) => {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-5 shadow-md">
      <p className="font-label-md text-label-md font-semibold text-on-surface-variant">{label}</p>
      <p className="mt-2 font-headline-lg text-headline-lg font-bold tabular-nums text-on-surface">{value}</p>
      {hint ? <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}

/** Mi asistencia: marcar la llegada de hoy y ver el mes día por día. Solo en el modo por asistencia. */
export default function MyAttendanceView() {
  const user = useUser();
  const company = useCompany();
  const { notify } = useToast();
  const today = dateInBuenosAires(new Date());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const schedule = user.workSchedule ?? company.defaultSchedule;
  const tol = company.lateToleranceMin;

  const { data, loading, error: loadError } = useAsync(
    async () => {
      const [marks, leaves] = await Promise.all([listMyMarks(user.uid, month), listMyLeaves(user.uid)]);
      return { marks, leaves: leaves.filter((l) => l.status === "approved") };
    },
    [user.uid, month],
    [ATTENDANCE_CHANGED, LEAVES_CHANGED],
  );

  const days = useMemo(() => {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const byDate = new Map((data?.marks ?? []).map((mk) => [mk.date, mk]));
    return Array.from({ length: last }, (_, i) => addDays(`${month}-01`, i)).map((date) =>
      dayStatus({ date, today, schedule, holidays: company.holidays, leaves: data?.leaves ?? [], mark: byDate.get(date), toleranceMin: tol }),
    );
  }, [month, data, today, schedule, company.holidays, tol]);
  const summary = useMemo(
    () => summarizeMonth({ month, today, schedule, holidays: company.holidays, leaves: data?.leaves ?? [], marks: data?.marks ?? [], toleranceMin: tol }),
    [month, data, today, schedule, company.holidays, tol],
  );

  const todayStatus = dayStatus({ date: today, today, schedule, holidays: company.holidays, leaves: data?.leaves ?? [], mark: (data?.marks ?? []).find((m) => m.date === today), toleranceMin: tol });
  const canMark = todayStatus.kind === "pending" && month === today.slice(0, 7) && Boolean(data);

  const mark = async () => {
    setError(null);
    setMarking(true);
    try {
      await markSelf(user, today, minutesOfDayBA(new Date()));
      notify("Registraste tu llegada.");
    } catch (e) {
      console.error("No se pudo marcar la llegada", e);
      setError(e instanceof AlreadyMarkedError ? e.message : withCode("No se pudo registrar tu llegada. Probá de nuevo.", e));
    } finally {
      setMarking(false);
    }
  };

  const todayText = (): { title: string; hint: string } => {
    switch (todayStatus.kind) {
      case "present": return { title: `Llegaste a las ${minutesToClock(todayStatus.arrivalMinutes ?? 0)}`, hint: "Estás presente hoy." };
      case "late": return { title: `Llegaste a las ${minutesToClock(todayStatus.arrivalMinutes ?? 0)}`, hint: `Quedó anotado como tarde (${todayStatus.lateMinutes} min después del inicio de tu jornada).` };
      case "leave": return { title: "Tenés licencia hoy", hint: `${LEAVE_TYPE_LABELS[todayStatus.leaveType ?? "personal"]}. No hace falta marcar.` };
      case "unjustified": return { title: "Hoy figura como ausencia", hint: "Tu supervisor la registró como ausencia injustificada. Si es un error, hablá con él." };
      case "nonworking": return { title: "Hoy no trabajás", hint: "Según tu jornada, hoy no es un día laborable." };
      case "holiday": return { title: "Hoy es feriado", hint: "No hace falta marcar." };
      default: return { title: "Todavía no marcaste tu llegada", hint: `Tu jornada empieza a las ${schedule[(["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[dayOfWeek(today)]!]?.start ?? "—"}. Tolerancia: ${tol} min.` };
    }
  };
  const t = todayText();

  return (
    <Page>
      <PageHeader eyebrow="Autogestión" title="Mi asistencia" subtitle="Marcá tu llegada cada día. Las licencias aprobadas figuran solas." />
      {loadError || error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error ?? loadError}</p> : null}

      <section aria-label="Hoy" className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-md">
        <div>
          <p className="font-label-md text-label-md font-semibold text-on-surface-variant">Hoy · {dmy(today)}</p>
          <p className="mt-1 font-headline-md text-headline-md text-on-surface">{t.title}</p>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">{t.hint}</p>
        </div>
        {canMark ? (
          <button type="button" disabled={marking} onClick={() => void mark()} className="flex items-center gap-2 rounded-xl bg-primary-container px-6 py-3 font-label-lg text-label-lg font-bold text-on-primary shadow-[0_0_16px_color-mix(in_srgb,var(--hz-primary)_30%,transparent)] hover:brightness-110 disabled:opacity-50">
            <span className="material-symbols-outlined text-[22px]">how_to_reg</span>
            {marking ? "Marcando…" : "Marcar presente"}
          </button>
        ) : null}
      </section>

      <div className="flex items-center gap-2">
        <button type="button" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high"><span className="material-symbols-outlined">chevron_left</span></button>
        <h2 className="min-w-44 text-center font-headline-sm text-headline-sm font-semibold text-on-surface">{monthLabel(month)}</h2>
        <button type="button" aria-label="Mes siguiente" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30"><span className="material-symbols-outlined">chevron_right</span></button>
      </div>

      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        <Kpi label="Presentes" value={`${summary.present} de ${summary.workingDays}`} hint="Días laborables del mes hasta hoy" />
        <Kpi label="Llegadas tarde" value={String(summary.late)} hint={summary.late > 0 ? `${summary.lateMinutes} min en total (tolerancia ${tol} min)` : `Tolerancia ${tol} min`} />
        <Kpi label="Licencias" value={String(summary.leaveDays)} hint="Días con licencia aprobada" />
        <Kpi label="Ausencias / sin registro" value={`${summary.unjustified} / ${summary.missing}`} hint="Injustificadas y días sin marcar" />
      </div>

      <div className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
        <div className="overflow-x-auto">
          <table className="stack-table w-full border-collapse text-left" aria-label="Días del mes">
            <thead>
              <tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">
                {["Día", "Estado", "Llegada", "Marcó", "Nota"].map((h) => <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {[...days].reverse().filter((d) => d.kind !== "future").map((d) => (
                <tr key={d.date} className={d.kind === "nonworking" || d.kind === "holiday" ? "text-on-surface-variant" : ""}>
                  <td className="px-space-md py-2.5 tabular-nums">{WEEKDAYS[dayOfWeek(d.date)]} {dmy(d.date)}</td>
                  <td data-label="Estado" className="px-space-md py-2.5"><Chip tone={KIND_TONE[d.kind]}>{d.kind === "leave" && d.leaveType ? LEAVE_TYPE_LABELS[d.leaveType] : DAY_KIND_LABELS[d.kind]}</Chip>{d.kind === "late" ? <span className="ml-2 font-body-sm text-body-sm text-on-surface-variant">{d.lateMinutes} min</span> : null}</td>
                  <td data-label="Llegada" className="px-space-md py-2.5 tabular-nums">{d.arrivalMinutes !== undefined ? minutesToClock(d.arrivalMinutes) : "—"}</td>
                  <td data-label="Marcó" className="px-space-md py-2.5 text-on-surface-variant">{d.mark ? (d.mark.source === "self" ? "Vos" : d.mark.source === "manual" ? "Tu supervisor" : "Sistema de fichaje") : "—"}</td>
                  <td data-label="Nota" className="px-space-md py-2.5 text-on-surface-variant">{d.mark?.note ?? ""}</td>
                </tr>
              ))}
              {days.every((d) => d.kind === "future") ? <tr><td colSpan={5} className="px-space-md py-8 text-center text-on-surface-variant">{loading && !data ? "Cargando…" : "Todavía no hay días para mostrar en este mes."}</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">Una marca no se puede cambiar: si te equivocaste, pedile a tu supervisor que la corrija. Un día sin marca ni licencia figura como “sin registro” hasta que tu supervisor lo resuelva.</p>
      </div>
    </Page>
  );
}
