import { useState } from "react";
import { Link } from "react-router-dom";
import { useCompany } from "@/company/CompanyContext";
import { usePendingLeaves } from "@/features/approvals/usePendingLeaves";
import { dayStatus, minutesOfDayBA, minutesToClock } from "@/domain/attendance";
import { dateInBuenosAires } from "@/domain/dates";
import { ATTENDANCE_CHANGED, AlreadyMarkedError, listMarksForReview, listMyMarks, markSelf } from "@/services/attendance";
import { listUsers } from "@/services/company";
import { withCode } from "@/services/errors";
import { LEAVES_CHANGED, listApprovedLeavesForReview, listMyLeaves } from "@/services/leaves";
import { useUser } from "@/session/SessionContext";
import { Page, PageHeader } from "@/ui/Page";
import { useToast } from "@/ui/Toast";
import { useAsync } from "@/ui/useAsync";

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-5 shadow-md">
      <p className="font-label-md text-label-md font-semibold text-on-surface-variant">{label}</p>
      <p className="mt-2 font-headline-lg text-headline-lg font-bold tabular-nums text-on-surface">{value}</p>
      {hint ? <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}

/** Inicio del modo por asistencia: marcar la llegada de hoy y, si supervisás, ver cómo viene el equipo. */
export default function HomeAttendance() {
  const user = useUser();
  const company = useCompany();
  const { notify } = useToast();
  const today = dateInBuenosAires(new Date());
  const month = today.slice(0, 7);
  const isApprover = user.role !== "employee";
  const pendingLeaves = usePendingLeaves(user);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const schedule = user.workSchedule ?? company.defaultSchedule;

  const mine = useAsync(
    async () => (user.role === "admin" ? null : { marks: await listMyMarks(user.uid, month), leaves: (await listMyLeaves(user.uid)).filter((l) => l.status === "approved") }),
    [user.uid, user.role, month],
    [ATTENDANCE_CHANGED, LEAVES_CHANGED],
  );
  // Cómo viene el equipo hoy (quien supervisa, o el administrador con toda la empresa).
  const team = useAsync(
    async () => {
      if (!isApprover) return null;
      const users = await listUsers();
      const people = users.filter((u) => u.active && u.uid !== user.uid && (user.role === "admin" ? u.role !== "admin" : u.supervisorId === user.uid));
      if (people.length === 0) return { people, marks: [], leaves: [] };
      const ids = people.map((u) => u.uid);
      const [marks, leaves] = await Promise.all([listMarksForReview(user, ids, month), listApprovedLeavesForReview(user, ids)]);
      return { people, marks, leaves };
    },
    [user.uid, user.role, month, isApprover],
    [ATTENDANCE_CHANGED, LEAVES_CHANGED],
  );

  const status = mine.data
    ? dayStatus({ date: today, today, schedule, holidays: company.holidays, leaves: mine.data.leaves, mark: mine.data.marks.find((m) => m.date === today), toleranceMin: company.lateToleranceMin })
    : null;

  const counts = { present: 0, late: 0, leave: 0, absent: 0, none: 0 };
  for (const u of team.data?.people ?? []) {
    const s = dayStatus({ date: today, today, schedule: u.workSchedule ?? company.defaultSchedule, holidays: company.holidays, leaves: (team.data?.leaves ?? []).filter((l) => l.userId === u.uid), mark: (team.data?.marks ?? []).find((m) => m.userId === u.uid && m.date === today), toleranceMin: company.lateToleranceMin });
    if (s.kind === "present") counts.present++;
    else if (s.kind === "late") counts.late++;
    else if (s.kind === "leave") counts.leave++;
    else if (s.kind === "unjustified") counts.absent++;
    else if (s.kind === "pending" || s.kind === "missing") counts.none++;
  }

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

  return (
    <Page>
      <PageHeader eyebrow={user.role === "admin" ? "Administrador" : user.role === "supervisor" ? "Supervisor" : "Empleado"} title={`Hola, ${user.fullName.split(" ")[0]}`} subtitle="Tu asistencia de hoy." />
      {error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error}</p> : null}

      {user.role !== "admin" ? (
        <section aria-label="Mi asistencia de hoy" className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-md">
          <div>
            <p className="font-headline-md text-headline-md text-on-surface">
              {status?.kind === "present" || status?.kind === "late" ? `Llegaste a las ${minutesToClock(status.arrivalMinutes ?? 0)}` : status?.kind === "pending" ? "Todavía no marcaste tu llegada" : status?.kind === "leave" ? "Tenés licencia hoy" : status?.kind === "nonworking" || status?.kind === "holiday" ? "Hoy no es un día laborable" : mine.loading ? "Cargando…" : "Hoy"}
            </p>
            <Link to="/asistencia" className="mt-1 inline-block font-label-lg text-label-lg font-semibold text-primary hover:underline">Ver mi asistencia del mes</Link>
          </div>
          {status?.kind === "pending" ? (
            <button type="button" disabled={marking} onClick={() => void mark()} className="flex items-center gap-2 rounded-xl bg-primary-container px-6 py-3 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-50">
              <span className="material-symbols-outlined text-[22px]">how_to_reg</span>{marking ? "Marcando…" : "Marcar presente"}
            </button>
          ) : null}
        </section>
      ) : null}

      {isApprover ? (
        <>
          <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
            <Card label="Presentes hoy" value={String(counts.present + counts.late)} hint={counts.late > 0 ? `${counts.late} llegaron tarde` : "Sin tardanzas"} />
            <Card label="Con licencia" value={String(counts.leave)} />
            <Card label="Ausentes" value={String(counts.absent)} hint="Injustificadas registradas" />
            <Card label="Sin marcar" value={String(counts.none)} hint="Todavía sin llegada ni licencia" />
          </div>
          <section className="rounded-xl bg-surface-container-low p-space-lg shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Para resolver</h2>
                <p className="font-body-md text-body-md text-on-surface-variant">{(pendingLeaves.data?.leaves.length ?? 0) === 1 ? "1 licencia pendiente de aprobación" : `${pendingLeaves.data?.leaves.length ?? 0} licencias pendientes de aprobación`}</p>
              </div>
              <div className="flex gap-3">
                <Link to="/aprobaciones" className="rounded-xl bg-surface-container-high px-4 py-2.5 font-label-lg text-label-lg font-semibold text-on-surface hover:bg-surface-container-highest">Aprobaciones</Link>
                <Link to="/asistencia-equipo" className="rounded-xl bg-primary-container px-4 py-2.5 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110">Asistencia del equipo</Link>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </Page>
  );
}
