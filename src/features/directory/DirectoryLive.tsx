import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WORK_MODE_LABELS, type UserSummary } from "@/domain/model";
import { ROLE_LABELS } from "@/domain/types";
import { listUsers } from "@/services/company";
import { useCompany } from "@/company/CompanyContext";
import { currentEntry } from "@/domain/compensation";
import { dateInBuenosAires } from "@/domain/dates";
import { listEmployeePay, PAY_CHANGED } from "@/services/compensation";
import { DIRECTORY_CHANGED, listEmployeePrivate } from "@/services/directory";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useAsync } from "@/ui/useAsync";

const dmy = (iso?: string) => (iso ? iso.split("-").reverse().join("/") : "—");
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const select = "rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";

/** Directorio con datos reales: todo el equipo, con filtros y acceso a la ficha de cada persona. */
export default function DirectoryLive() {
  const navigate = useNavigate();
  const { features } = useCompany();
  const withPay = features.modules.compensation;
  const { data, loading, error } = useAsync(
    async () => {
      const [users, sensitive, pay] = await Promise.all([listUsers(), listEmployeePrivate(), withPay ? listEmployeePay() : Promise.resolve(null)]);
      return { users, sensitive, pay };
    },
    [withPay],
    [DIRECTORY_CHANGED, PAY_CHANGED],
  );
  const today = dateInBuenosAires(new Date());
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [help, setHelp] = useState(false);

  const users = data?.users ?? [];
  const names = useMemo(() => new Map(users.map((u) => [u.uid, u.fullName])), [users]);
  const departments = useMemo(() => [...new Set(users.map((u) => u.department).filter((d): d is string => Boolean(d)))].sort((a, b) => a.localeCompare(b, "es")), [users]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter(
      (u) =>
        (status === "all" || (status === "active") === u.active) &&
        (department === "all" || u.department === department) &&
        (!needle || [u.fullName, u.email, u.position, u.department, u.employeeNumber].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [users, q, department, status]);

  const open = (u: UserSummary) => navigate(`/directorio/ficha?uid=${encodeURIComponent(u.uid)}`);
  const missing = (u: UserSummary) => !data?.sensitive.get(u.uid)?.cuil;

  return (
    <Page>
      <PageHeader
        eyebrow="Equipo"
        title="Directorio"
        subtitle="Las personas de tu empresa, con su puesto, supervisor y datos de la ficha."
        actions={
          <button type="button" onClick={() => setHelp(true)} className="flex items-center gap-2 rounded-xl bg-primary-container px-4 py-2.5 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110">
            <span className="material-symbols-outlined text-[20px]">person_add</span>
            Nuevo empleado
          </button>
        }
      />

      {error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error}</p> : null}

      <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-low p-space-md shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <input type="search" placeholder="Buscar por nombre, puesto, área o legajo" aria-label="Buscar personas" value={q} onChange={(e) => setQ(e.target.value)} className={`${select} min-w-64 flex-1`} />
          <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">
            Área
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className={select}>
              <option value="all">Todas</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">
            Estado
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={select}>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
              <option value="all">Todos</option>
            </select>
          </label>
          <span className="ml-auto font-label-md text-label-md text-on-surface-variant">{rows.length === 1 ? "1 persona" : `${rows.length} personas`}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">
                {["Persona", "Puesto y área", "Rol", "Supervisor", "Ingreso", "Estado"].map((h) => <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {rows.map((u) => {
                const mode = data?.sensitive.get(u.uid)?.workMode;
                return (
                  <tr key={u.uid} tabIndex={0} onClick={() => open(u)} onKeyDown={(e) => e.key === "Enter" && open(u)} className="cursor-pointer align-middle transition-colors hover:bg-surface-container focus-visible:bg-surface-container focus-visible:outline-hidden">
                    <td className="px-space-md py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary-container font-bold text-[13px] text-on-secondary-container">{initials(u.fullName)}</span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{u.fullName}</p>
                          <p className="truncate font-body-sm text-body-sm text-on-surface-variant">{u.email}{u.employeeNumber ? ` · Legajo ${u.employeeNumber}` : ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-space-md py-3">
                      <p>{u.position || "—"}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{[u.department, mode ? WORK_MODE_LABELS[mode] : null].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-space-md py-3">{ROLE_LABELS[u.role]}</td>
                    <td className="px-space-md py-3">{u.supervisorId ? (names.get(u.supervisorId) ?? "—") : "—"}</td>
                    <td className="px-space-md py-3 tabular-nums">{dmy(u.hireDate)}</td>
                    <td className="px-space-md py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {u.active ? <Chip tone="ok">Activo</Chip> : <Chip tone="muted">Inactivo</Chip>}
                        {u.active && missing(u) ? <Chip tone="warn">Falta CUIL</Chip> : null}
                        {u.active && withPay && data?.pay && !currentEntry(data.pay.get(u.uid)?.rates ?? [], today) ? <Chip tone="warn">Sin sueldo</Chip> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-space-md py-10 text-center text-on-surface-variant">{loading && !data ? "Cargando el equipo…" : "No hay personas con esos filtros."}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {help ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setHelp(false)} />
          <div role="dialog" aria-label="Alta de un empleado" className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
            <h2 className="font-headline-md text-headline-md text-on-surface">Alta de un empleado</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Por ahora las altas las hace el Configurador de Horus: le pasás nombre completo, email, quién lo supervisa y el área, y te avisa cuando la persona ya puede entrar. Después completás su ficha desde acá.
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">La invitación por email desde la app se habilita con el plan Blaze de Firebase.</p>
            <div className="flex justify-end"><button type="button" onClick={() => setHelp(false)} className="rounded-lg bg-primary-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110">Entendido</button></div>
          </div>
        </div>
      ) : null}
    </Page>
  );
}
