import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCompany } from "@/company/CompanyContext";
import { usePending } from "@/features/approvals/usePending";
import { useLoadHours } from "@/features/hours/LoadHoursDrawer";
import { dateInBuenosAires } from "@/domain/dates";
import { ENTRIES_CHANGED, listApprovedBetween, listMyTimeEntries } from "@/services/timeEntries";
import { listUsers } from "@/services/company";
import type { TimeEntry } from "@/domain/model";
import { ENTRY_STATUS_LABELS } from "@/domain/model";
import { classifyEntry } from "@/domain/overtime";
import { useUser } from "@/session/SessionContext";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useAsync } from "@/ui/useAsync";

const fmt = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const formatDate = (iso: string) => iso.split("-").reverse().join("/");
const TONE = { approved: "ok", submitted: "info", observed: "warn", draft: "muted" } as const;

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function Card({ label, value, unit = "h", hint, tone = "text-on-surface" }: { label: string; value: string; unit?: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-5 shadow-md">
      <p className="font-label-md text-label-md font-semibold text-on-surface-variant">{label}</p>
      <p className={`mt-2 font-headline-lg text-headline-lg font-bold tabular-nums ${tone}`}>
        {value} {unit ? <span className="font-headline-sm text-headline-sm font-normal text-on-surface-variant">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}

/** Inicio con datos reales. Muestra tu mes y, si aprobás horas, lo pendiente del equipo. */
export default function HomeLive() {
  const user = useUser();
  const company = useCompany();
  const { openDrawer } = useLoadHours();
  const today = dateInBuenosAires(new Date());
  const monthPrefix = today.slice(0, 7);
  const monthName = `${MONTHS[Number(today.slice(5, 7)) - 1]} de ${today.slice(0, 4)}`;
  const isApprover = user.role !== "employee";

  const mine = useAsync(() => listMyTimeEntries(user.uid), [user.uid], [ENTRIES_CHANGED]);
  const pending = usePending(user);
  const company_ = useAsync(
    async () => (user.role === "admin" ? { users: await listUsers(), approved: await listApprovedBetween(`${monthPrefix}-01`, `${monthPrefix}-31`) } : null),
    [user.role, monthPrefix],
    [ENTRIES_CHANGED],
  );

  const month = useMemo(() => (mine.data ?? []).filter((e) => e.date.startsWith(monthPrefix)), [mine.data, monthPrefix]);
  const schedule = user.workSchedule ?? company.defaultSchedule;
  const stats = useMemo(() => {
    let approved = 0;
    let review = 0;
    let observed = 0;
    let drafts = 0;
    for (const e of month) {
      if (e.status === "approved") approved += e.hours ?? 0;
      else if (e.status === "submitted") {
        try {
          review += classifyEntry({ date: e.date, startTime: e.startTime, endTime: e.endTime, isOnCall: e.isOnCall }, { schedule, holidays: company.holidays, config: company.overtime }).hours;
        } catch {
          /* un registro inválido no suma */
        }
      } else if (e.status === "observed") observed++;
      else drafts++;
    }
    return { approved, review, observed, drafts };
  }, [month, schedule, company.holidays, company.overtime]);

  const recent: TimeEntry[] = (mine.data ?? []).slice(0, 6);
  const pendingList = pending.data?.entries ?? [];
  const approvedTotal = (company_.data?.approved ?? []).reduce((sum, e) => sum + (e.hours ?? 0), 0);
  const activePeople = (company_.data?.users ?? []).filter((u) => u.active).length;
  const firstName = user.fullName.split(" ")[0];

  return (
    <Page>
      <PageHeader
        eyebrow={user.role === "admin" ? "Administrador" : user.role === "supervisor" ? "Supervisor" : "Empleado"}
        title={`Hola, ${firstName}`}
        subtitle={`Tu resumen de ${monthName}.`}
        actions={
          <button type="button" onClick={() => openDrawer()} className="flex items-center gap-2 rounded-xl bg-primary-container px-4 py-2.5 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110">
            <span className="material-symbols-outlined text-[20px]">add</span>
            Cargar horas
          </button>
        }
      />

      {[company.error, mine.error, isApprover ? pending.error : null].filter(Boolean).map((msg) => (
        <p key={msg} role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{msg}</p>
      ))}

      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        <Card label="Aprobadas" value={fmt(stats.approved)} tone="text-primary" hint="Horas confirmadas este mes" />
        <Card label="En revisión" value={fmt(stats.review)} hint="Enviadas, esperando aprobación (estimado)" />
        <Card label="Para corregir" value={String(stats.observed)} unit="" tone={stats.observed > 0 ? "text-amber-300" : "text-on-surface"} hint="Registros observados" />
        <Card label="Borradores" value={String(stats.drafts)} unit="" hint="Sin enviar todavía" />
      </div>

      {isApprover ? (
        <section className="rounded-xl bg-surface-container-low p-space-lg shadow-md">
          <div className="mb-space-md flex items-center justify-between gap-3">
            <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Pendientes de aprobación</h2>
            <Link to="/aprobaciones" className="font-label-lg text-label-lg font-semibold text-primary hover:underline">Ver todas</Link>
          </div>
          {pendingList.length === 0 ? (
            <p className="text-on-surface-variant">{pending.loading && !pending.data ? "Cargando…" : "No hay registros esperando aprobación."}</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {pendingList.slice(0, 5).map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 font-body-md text-body-md text-on-surface">
                  <span className="font-semibold">{pending.data?.users.get(e.userId)?.fullName ?? "Persona"}</span>
                  <span className="text-on-surface-variant tabular-nums">{formatDate(e.date)} · {e.startTime} a {e.endTime} · {e.projectId}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-space-md font-label-md text-label-md text-on-surface-variant">{pendingList.length === 1 ? "1 registro pendiente" : `${pendingList.length} registros pendientes`}</p>
        </section>
      ) : null}

      {user.role === "admin" ? (
        <div className="grid grid-cols-2 gap-gutter">
          <Card label="Horas aprobadas del equipo" value={fmt(approvedTotal)} hint={`Todo ${monthName}`} />
          <Card label="Personas activas" value={String(activePeople)} unit="" />
        </div>
      ) : null}

      <section className="rounded-xl bg-surface-container-low p-space-lg shadow-md">
        <div className="mb-space-md flex items-center justify-between gap-3">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Tus últimos registros</h2>
          {user.role !== "admin" ? <Link to="/horas" className="font-label-lg text-label-lg font-semibold text-primary hover:underline">Ver historial</Link> : null}
        </div>
        {recent.length === 0 ? (
          <p className="text-on-surface-variant">{mine.loading && !mine.data ? "Cargando…" : "Todavía no cargaste horas. Usá “Cargar horas” para empezar."}</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {recent.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 font-body-md text-body-md text-on-surface">
                <span className="tabular-nums">{formatDate(e.date)} · {e.startTime} a {e.endTime}</span>
                <span className="flex items-center gap-3">
                  <span className="text-on-surface-variant">{e.projectId}</span>
                  <Chip tone={TONE[e.status]}>{ENTRY_STATUS_LABELS[e.status]}</Chip>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
