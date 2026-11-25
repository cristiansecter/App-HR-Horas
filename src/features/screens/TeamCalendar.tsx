import { useMemo, useState } from "react";
import { useCompany } from "@/company/CompanyContext";
import { addDays, dateInBuenosAires, dayOfWeek } from "@/domain/dates";
import type { LeaveType } from "@/domain/model";
import { listUsers } from "@/services/company";
import { LEAVES_CHANGED, listApprovedLeavesForReview, listTeamAbsences } from "@/services/leaves";
import { useSession, useUser } from "@/session/SessionContext";
import { Page, PageHeader } from "@/ui/Page";
import { useAsync } from "@/ui/useAsync";

interface Absence {
  name: string;
  from: string;
  to: string;
  type: LeaveType;
}

interface CalendarPerson {
  id: string;
  name: string;
}

interface CalendarAbsence {
  personId: string;
  from: string;
  to: string;
  /** Solo lo ven supervisor y administrador, y solo de las personas que pueden leer. */
  type?: LeaveType;
}

const PEOPLE = [
  "Marcela Ibarra", "Diego Acosta", "Valeria Pereyra", "Nicolás Benítez", "Camila Romero", "Sebastián Castro",
  "Julián Medina", "Florencia Giménez", "Matías Herrera", "Agustina Sosa", "Lucía Rodríguez", "Federico Ruiz",
];

// Solo licencias aprobadas. Datos inventados.
const ABSENCES: Absence[] = [
  { name: "Nicolás Benítez", from: "2026-11-24", to: "2026-12-07", type: "vacation" },
  { name: "Julián Medina", from: "2026-11-24", to: "2026-11-24", type: "unjustified" },
];

const TYPE: Record<LeaveType, { label: string; letter: string; cls: string }> = {
  vacation: { label: "Vacaciones", letter: "V", cls: "bg-primary-container/40 text-primary" },
  sick: { label: "Enfermedad", letter: "E", cls: "bg-rose-500/30 text-rose-200" },
  study: { label: "Día de estudio", letter: "D", cls: "bg-blue-500/30 text-blue-200" },
  personal: { label: "Trámite personal", letter: "T", cls: "bg-secondary-container/60 text-secondary" },
  unjustified: { label: "Injustificada", letter: "I", cls: "bg-error-container text-on-error-container" },
};

const WEEKDAYS = ["D", "L", "M", "X", "J", "V", "S"];
const monthName = (y: number, m: number) => {
  const t = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const pad = (n: number) => String(n).padStart(2, "0");

/** Con cuenta real lee el equipo y las ausencias de Firestore; en la demo usa los datos de ejemplo. */
export default function TeamCalendar() {
  const { isReal } = useSession();
  return isReal ? <TeamCalendarLive /> : <TeamCalendarView people={PEOPLE.map((n) => ({ id: n, name: n }))} absences={ABSENCES.map((a) => ({ personId: a.name, from: a.from, to: a.to, type: a.type }))} />;
}

function TeamCalendarLive() {
  const user = useUser();
  const { data, loading, error } = useAsync(
    async () => {
      const users = await listUsers();
      const teamIds = users.filter((u) => u.supervisorId === user.uid && u.active && u.uid !== user.uid).map((u) => u.uid);
      const [absences, leaves] = await Promise.all([
        listTeamAbsences(),
        // El tipo de licencia solo lo ven quienes aprueban; un supervisor sin equipo no consulta nada.
        user.role === "employee" || (user.role === "supervisor" && teamIds.length === 0) ? Promise.resolve([]) : listApprovedLeavesForReview(user, teamIds),
      ]);
      const typeByLeave = new Map(leaves.map((l) => [l.id, l.type]));
      return {
        people: users.filter((u) => u.active).map((u) => ({ id: u.uid, name: u.fullName })),
        absences: absences.map<CalendarAbsence>((a) => ({ personId: a.userId, from: a.startDate, to: a.endDate, type: typeByLeave.get(a.leaveId) })),
      };
    },
    [user.uid, user.role],
    [LEAVES_CHANGED],
  );
  const today = dateInBuenosAires(new Date());
  return <TeamCalendarView people={data?.people ?? []} absences={data?.absences ?? []} loading={loading && !data} error={error} startMonth={{ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }} />;
}

/** El empleado ve solo "Ausente"; el supervisor y el administrador ven el tipo de licencia (es un dato de salud). */
function TeamCalendarView({ people, absences, loading, error, startMonth }: { people: CalendarPerson[]; absences: CalendarAbsence[]; loading?: boolean; error?: string | null; startMonth?: { y: number; m: number } }) {
  const user = useUser();
  const { holidays } = useCompany();
  const canSeeType = user.role !== "employee";
  const [{ y, m }, setMonth] = useState(startMonth ?? { y: 2026, m: 11 });
  const days = useMemo(() => {
    const first = `${y}-${pad(m)}-01`;
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: count }, (_, i) => addDays(first, i));
  }, [y, m]);
  const shift = (d: number) => setMonth(({ y, m }) => { const t = new Date(Date.UTC(y, m - 1 + d, 1)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 }; });
  const monthHolidays = days.filter((d) => holidays.has(d));

  return (
    <Page>
      <PageHeader
        eyebrow="Equipo"
        title="Calendario del equipo"
        subtitle={canSeeType ? "Ausencias aprobadas con el tipo de licencia." : "Quién está ausente. No se muestra el motivo."}
        actions={
          <div className="flex items-center gap-2 rounded-lg bg-surface-container-high p-1">
            <button type="button" onClick={() => shift(-1)} aria-label="Mes anterior" className="flex size-9 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface">
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <span className="min-w-36 text-center font-label-lg text-label-lg text-on-surface">{monthName(y, m)}</span>
            <button type="button" onClick={() => shift(1)} aria-label="Mes siguiente" className="flex size-9 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface">
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        }
      />

      <div className="overflow-x-auto rounded-xl bg-surface-container-low p-space-md shadow-sm">
        <table className="w-full border-separate border-spacing-0 text-center" aria-label={`Ausencias de ${monthName(y, m)}`}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-44 bg-surface-container-low px-3 py-2 text-left font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">Persona</th>
              {days.map((d) => {
                const dow = dayOfWeek(d);
                const h = holidays.get(d);
                return (
                  <th key={d} title={h?.name} className={`px-0.5 py-1 font-label-xs-mono text-label-xs-mono font-medium ${h?.countsAsHoliday ? "text-amber-300" : dow === 0 || dow === 6 ? "text-outline" : "text-on-surface-variant"}`}>
                    <div>{WEEKDAYS[dow]}</div>
                    <div className="tabular-nums">{Number(d.slice(8))}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id}>
                <th scope="row" className="sticky left-0 z-10 bg-surface-container-low px-3 py-1.5 text-left font-body-sm text-body-sm font-medium whitespace-nowrap text-on-surface">{person.name}</th>
                {days.map((d) => {
                  const dow = dayOfWeek(d);
                  const h = holidays.get(d);
                  const abs = absences.find((a) => a.personId === person.id && d >= a.from && d <= a.to);
                  const base = h?.countsAsHoliday ? "bg-amber-500/10" : dow === 0 || dow === 6 ? "bg-surface-container-lowest/60" : "bg-surface-container/50";
                  return (
                    <td key={d} className="p-0.5">
                      <div
                        title={abs ? (canSeeType && abs.type ? TYPE[abs.type].label : "Ausente") : undefined}
                        className={`flex h-7 min-w-6 items-center justify-center rounded text-[11px] font-bold ${abs ? (canSeeType && abs.type ? TYPE[abs.type].cls : "bg-surface-container-highest text-on-surface-variant") : base}`}
                      >
                        {abs ? (canSeeType && abs.type ? TYPE[abs.type].letter : "A") : ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error}</p> : null}
      {loading ? <p className="text-on-surface-variant">Cargando el equipo…</p> : null}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-surface-container-low p-space-md font-label-md text-label-md text-on-surface-variant">
        {canSeeType ? (
          (Object.keys(TYPE) as LeaveType[]).map((t) => (
            <span key={t} className="flex items-center gap-2">
              <span className={`flex size-5 items-center justify-center rounded text-[11px] font-bold ${TYPE[t].cls}`}>{TYPE[t].letter}</span>
              {TYPE[t].label}
            </span>
          ))
        ) : (
          <span className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded bg-surface-container-highest text-[11px] font-bold text-on-surface-variant">A</span>
            Ausente
          </span>
        )}
        <span className="flex items-center gap-2">
          <span className="size-5 rounded bg-amber-500/10 ring-1 ring-amber-500/30" />
          Feriado
        </span>
      </div>

      {monthHolidays.length > 0 ? (
        <ul className="grid gap-2 rounded-xl bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant sm:grid-cols-2">
          {monthHolidays.map((d) => (
            <li key={d} className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-amber-300">flag</span>
              <span className="tabular-nums">{d.slice(8)}/{d.slice(5, 7)}</span>
              <span className="text-on-surface">{holidays.get(d)!.name}</span>
              {!holidays.get(d)!.countsAsHoliday ? <span className="text-outline">(optativo)</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Page>
  );
}
