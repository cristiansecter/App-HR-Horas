import { useMemo, useState } from "react";
import { useCompany } from "@/company/CompanyContext";
import { classifyEntry } from "@/domain/overtime";
import type { TimeEntry } from "@/domain/model";
import { useLoadHours } from "@/features/hours/LoadHoursDrawer";
import { addDays, dateInBuenosAires } from "@/domain/dates";
import { deleteDraftEntry, listMyTimeEntries, ENTRIES_CHANGED } from "@/services/timeEntries";
import { useSession, useUser } from "@/session/SessionContext";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useAsync } from "@/ui/useAsync";

type Status = "approved" | "submitted" | "observed" | "draft";
type Category = "normal" | "ot50" | "ot100";

interface Row {
  date: string;
  project: string;
  from: string;
  to: string;
  hours: number;
  split: Partial<Record<Category, number>>;
  status: Status;
  onCall?: boolean;
  note?: string;
  /** Registro real de Firestore (solo con cuenta real): habilita corregir y borrar. */
  entry?: TimeEntry;
}

// Registros de ejemplo de Camila Romero (semana del 16 al 20 de noviembre de 2026). Datos inventados.
const ROWS: Row[] = [
  { date: "16/11/2026", project: "MNT-001", from: "08:30", to: "13:00", hours: 4.5, split: { normal: 4.5 }, status: "approved" },
  { date: "16/11/2026", project: "SOP-004", from: "14:00", to: "17:30", hours: 3.5, split: { normal: 3.5 }, status: "approved" },
  { date: "17/11/2026", project: "OBR-002", from: "08:30", to: "17:30", hours: 8, split: { normal: 8 }, status: "approved" },
  { date: "17/11/2026", project: "OBR-002", from: "17:30", to: "19:30", hours: 2, split: { ot50: 2 }, status: "observed", note: "Diego Acosta: ¿estas 2 h corresponden al cableado del ticket #402?" },
  { date: "18/11/2026", project: "MNT-001", from: "08:30", to: "13:00", hours: 4.5, split: { normal: 4.5 }, status: "submitted" },
  { date: "18/11/2026", project: "MNT-001", from: "14:00", to: "17:30", hours: 3.5, split: { normal: 3.5 }, status: "draft" },
  { date: "19/11/2026", project: "MNT-001", from: "08:30", to: "17:30", hours: 8, split: { normal: 8 }, status: "draft" },
  { date: "20/11/2026", project: "SOP-004", from: "08:30", to: "16:30", hours: 7, split: { normal: 7 }, status: "draft" },
  { date: "20/11/2026", project: "MNT-001", from: "18:00", to: "20:00", hours: 2, split: { ot50: 2 }, status: "draft", onCall: true },
];

const STATUS: Record<Status, { label: string; tone: "ok" | "info" | "warn" | "muted" }> = {
  approved: { label: "Aprobado", tone: "ok" },
  submitted: { label: "Enviado", tone: "info" },
  observed: { label: "Observado", tone: "warn" },
  draft: { label: "Borrador", tone: "muted" },
};
const CAT: Record<Category, { label: string; tone: "normal" | "ot50" | "ot100" }> = {
  normal: { label: "Normal", tone: "normal" },
  ot50: { label: "Extra 50%", tone: "ot50" },
  ot100: { label: "Extra 100%", tone: "ot100" },
};

const fmt = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const selectClass = "min-w-0 flex-1 sm:flex-none rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";

interface ProjectOption {
  code: string;
  name: string;
}

interface ViewProps {
  rows: Row[];
  projects: ProjectOption[];
  loading?: boolean;
  error?: string | null;
  /** Aclaración que se muestra debajo de la tabla. */
  footnote?: string;
  editWindowDays?: number;
}

/** Con una cuenta real lee los registros de Firestore; en la demo usa los de ejemplo. */
export default function MyHours() {
  const { isReal } = useSession();
  const company = useCompany();
  if (!isReal) return <MyHoursView rows={ROWS} projects={company.projects} />;
  return <MyHoursLive />;
}

const formatDate = (iso: string) => iso.split("-").reverse().join("/");

function MyHoursLive() {
  const user = useUser();
  const company = useCompany();
  const { data, loading, error } = useAsync(() => listMyTimeEntries(user.uid), [user.uid], [ENTRIES_CHANGED]);
  const schedule = user.workSchedule ?? company.defaultSchedule;

  const rows = useMemo<Row[]>(
    () =>
      (data ?? []).map((e: TimeEntry) => {
        // Aprobado: las horas congeladas por quien aprobó. El resto: una estimación con las reglas actuales.
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
        return {
          date: formatDate(e.date),
          project: e.projectId,
          from: e.startTime,
          to: e.endTime,
          hours: hours ?? 0,
          split: breakdown as Partial<Record<Category, number>>,
          status: e.status,
          onCall: e.isOnCall,
          note: e.reviewerNote && e.status === "observed" ? e.reviewerNote : undefined,
          entry: e,
        };
      }),
    [data, schedule, company.holidays, company.overtime],
  );

  return (
    <MyHoursView
      rows={rows}
      projects={company.projects}
      loading={loading && data === null}
      error={error}
      editWindowDays={company.editWindowDays}
      footnote="Las horas de los registros que todavía no están aprobados son una estimación: se confirman y se congelan cuando tu supervisor aprueba."
    />
  );
}

function MyHoursView({ rows: allRows, projects, loading, error, footnote, editWindowDays }: ViewProps) {
  const { editEntry } = useLoadHours();
  const earliest = addDays(dateInBuenosAires(new Date()), -(editWindowDays ?? 7));
  const [actionError, setActionError] = useState<string | null>(null);
  const remove = async (id: string) => {
    setActionError(null);
    try {
      await deleteDraftEntry(id);
    } catch {
      setActionError("No se pudo borrar el borrador. Probá de nuevo.");
    }
  };
  const [project, setProject] = useState("all");
  const [status, setStatus] = useState<"all" | Status>("all");
  const rows = useMemo(() => allRows.filter((r) => (project === "all" || r.project === project) && (status === "all" || r.status === status)), [allRows, project, status]);
  const totals = useMemo(() => {
    const t: Record<Category, number> = { normal: 0, ot50: 0, ot100: 0 };
    for (const r of rows) for (const [k, v] of Object.entries(r.split)) t[k as Category] += v;
    return t;
  }, [rows]);
  const total = totals.normal + totals.ot50 + totals.ot100;

  return (
    <Page>
      <PageHeader eyebrow="Historial" title="Mis horas" subtitle="Todos tus registros con su estado. Los aprobados quedan bloqueados." />

      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        {[
          ["Total del período", total, "text-on-surface"],
          ["Horas normales", totals.normal, "text-primary"],
          ["Extra 50%", totals.ot50, "text-primary-fixed"],
          ["Extra 100%", totals.ot100, "text-error"],
        ].map(([label, value, color]) => (
          <div key={label as string} className="rounded-xl bg-surface-container-low p-5 shadow-md">
            <p className="font-label-md text-label-md font-semibold text-on-surface-variant">{label as string}</p>
            <p className={`mt-2 font-headline-lg text-headline-lg font-bold tabular-nums ${color as string}`}>
              {fmt(value as number)} <span className="font-headline-sm text-headline-sm font-normal text-on-surface-variant">h</span>
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-low p-space-md shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex w-full items-center gap-2 font-label-md text-label-md text-on-surface-variant sm:w-auto">
            Proyecto
            <select value={project} onChange={(e) => setProject(e.target.value)} className={selectClass}>
              <option value="all">Todos</option>
              {projects.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-full items-center gap-2 font-label-md text-label-md text-on-surface-variant sm:w-auto">
            Estado
            <select value={status} onChange={(e) => setStatus(e.target.value as "all" | Status)} className={selectClass}>
              <option value="all">Todos</option>
              {(Object.keys(STATUS) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS[s].label}
                </option>
              ))}
            </select>
          </label>
          <span className="ml-auto font-label-md text-label-md text-on-surface-variant">{rows.length} registros</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">
                {["Fecha", "Proyecto", "Desde", "Hasta", "Horas", "Categoría", "Estado", ""].map((h) => (
                  <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {rows.map((r, i) => (
                <tr key={i} className="align-top transition-colors hover:bg-surface-container">
                  <td className="px-space-md py-3 tabular-nums">{r.date}</td>
                  <td className="px-space-md py-3 font-semibold">{r.project}</td>
                  <td className="px-space-md py-3 tabular-nums">{r.from}</td>
                  <td className="px-space-md py-3 tabular-nums">{r.to}</td>
                  <td className="px-space-md py-3 font-semibold tabular-nums">{fmt(r.hours)} h</td>
                  <td className="px-space-md py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(r.split) as Category[]).map((c) => (
                        <Chip key={c} tone={CAT[c].tone}>{CAT[c].label}</Chip>
                      ))}
                      {r.onCall ? <Chip tone="guard">Guardia</Chip> : null}
                    </div>
                  </td>
                  <td className="px-space-md py-3">
                    <Chip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Chip>
                    {r.note ? <p className="mt-1.5 max-w-xs font-body-sm text-body-sm text-on-surface-variant italic">“{r.note}”</p> : null}
                  </td>
                  <td className="px-space-md py-3 text-right">
                    {r.entry && (r.status === "draft" || r.status === "observed") && r.entry.date >= earliest ? (
                      <div className="inline-flex gap-2">
                        <button type="button" onClick={() => editEntry(r.entry!)} className="rounded-lg bg-surface-container-high px-3 py-1.5 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-highest">{r.status === "observed" ? "Corregir" : "Editar"}</button>
                        {r.status === "draft" ? <button type="button" onClick={() => void remove(r.entry!.id)} className="rounded-lg px-3 py-1.5 font-label-md text-label-md font-semibold text-error hover:bg-error/10">Borrar</button> : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-space-md py-10 text-center text-on-surface-variant">
                    {loading ? "Cargando tus registros…" : error ? error : allRows.length === 0 ? "Todavía no cargaste horas. Usá “Cargar horas” para empezar." : "No hay registros con esos filtros."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {actionError ? <p role="alert" className="font-body-sm text-body-sm text-error">{actionError}</p> : null}
        {footnote ? <p className="font-body-sm text-body-sm text-on-surface-variant">{footnote}</p> : null}
      </div>
    </Page>
  );
}
