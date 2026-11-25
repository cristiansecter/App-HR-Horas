import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCompany } from "@/company/CompanyContext";
import { DEFAULT_ALLOCATION_PCT, isValidPct, totalPct } from "@/domain/allocation";
import { ROLE_LABELS } from "@/domain/types";
import { ASSIGNMENTS_CHANGED, assignProject, listAssignmentsForReview, setAllocationPct, unassignProject } from "@/services/assignments";
import { listUsers } from "@/services/company";
import { withCode } from "@/services/errors";
import { useUser } from "@/session/SessionContext";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useToast } from "@/ui/Toast";
import { useAsync } from "@/ui/useAsync";

/** Porcentaje de dedicación de una persona a un proyecto. Se guarda al salir del campo; si no es válido, vuelve al valor anterior. */
function PctInput({ label, value, disabled, onCommit }: { label: string; value: number; disabled: boolean; onCommit: (pct: number) => void }) {
  const [text, setText] = useState(String(value));
  const commit = () => {
    const n = Number(text);
    if (!isValidPct(n)) return setText(String(value));
    if (n !== value) onCommit(n);
  };
  return (
    <label className="flex items-center justify-center gap-1 font-label-md text-label-md text-on-surface-variant">
      <input aria-label={label} inputMode="numeric" disabled={disabled} value={text} onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 3))} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="w-14 rounded-lg border border-white/10 bg-surface-container-lowest px-2 py-1 text-right font-body-sm text-body-sm text-on-surface tabular-nums focus:border-primary-container focus:outline-hidden disabled:opacity-40" />%
    </label>
  );
}

/**
 * Asignar proyectos: el administrador (a cualquiera) y el supervisor (a quienes tiene a cargo) deciden en qué proyectos
 * puede cargar horas cada persona. Una grilla: personas en filas, proyectos activos en columnas.
 */
export default function AssignmentsView() {
  const actor = useUser();
  const company = useCompany();
  const { notify } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Con el módulo de dedicación cada asignación lleva un porcentaje (por defecto, tiempo completo).
  const allocationOn = company.features.modules.allocation;

  const { data, loading, error: loadError } = useAsync(
    async () => {
      const users = await listUsers();
      // Administrador: toda la empresa. Supervisor: solo quienes lo tienen como supervisor (las reglas lo exigen igual).
      const team = users.filter((u) => u.active && (actor.role === "admin" || (u.supervisorId === actor.uid && u.uid !== actor.uid)));
      const assignments = team.length > 0 ? await listAssignmentsForReview(actor, team.map((u) => u.uid)) : [];
      return { team, assignments };
    },
    [actor.uid, actor.role],
    [ASSIGNMENTS_CHANGED],
  );

  const projects = useMemo(() => company.projects.filter((p) => p.active), [company.projects]);
  const stored = useMemo(() => new Set((data?.assignments ?? []).map((a) => `${a.projectId}|${a.userId}`)), [data]);
  // Cambios que se muestran al instante mientras se guardan; se descartan cuando llegan los datos reales.
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  useEffect(() => setPending(new Map()), [data]);
  const assigned = useMemo(() => ({ has: (key: string) => pending.get(key) ?? stored.has(key) }), [pending, stored]);
  const team = data?.team ?? [];
  const storedPct = useMemo(() => new Map((data?.assignments ?? []).map((a) => [`${a.projectId}|${a.userId}`, a.allocationPct ?? DEFAULT_ALLOCATION_PCT])), [data]);
  const [pctPending, setPctPending] = useState<Map<string, number>>(new Map());
  useEffect(() => setPctPending(new Map()), [data]);
  const pctOf = (key: string) => pctPending.get(key) ?? storedPct.get(key) ?? DEFAULT_ALLOCATION_PCT;
  /** Suma de dedicaciones de una persona en los proyectos activos que tiene asignados. */
  const pctSum = (uid: string) => totalPct(projects.filter((p) => assigned.has(`${p.code}|${uid}`)).map((p) => pctOf(`${p.code}|${uid}`)));

  const changePct = async (code: string, uid: string, name: string, pct: number) => {
    const key = `${code}|${uid}`;
    setError(null);
    setPctPending((m) => new Map(m).set(key, pct));
    try {
      await setAllocationPct(code, uid, pct);
      notify(`${name} dedica ${pct} % a ${code}.`);
    } catch (e) {
      console.error("No se pudo guardar el porcentaje", e);
      setPctPending((m) => { const next = new Map(m); next.delete(key); return next; });
      setError(withCode("No se pudo guardar el porcentaje. Probá de nuevo.", e));
    }
  };

  const toggle = async (code: string, uid: string, name: string, on: boolean) => {
    const key = `${code}|${uid}`;
    setBusy(key);
    setError(null);
    setPending((m) => new Map(m).set(key, on));
    try {
      if (on) await assignProject(code, uid, actor.uid);
      else await unassignProject(code, uid);
      notify(on ? `Asignaste ${code} a ${name}.` : `Quitaste ${code} a ${name}.`);
    } catch (e) {
      console.error("No se pudo cambiar la asignación", e);
      setPending((m) => { const next = new Map(m); next.delete(key); return next; });
      setError(withCode("No se pudo guardar el cambio. Probá de nuevo.", e));
    } finally {
      setBusy(null);
    }
  };

  /** Asigna (o quita) un proyecto a todas las personas de la lista que todavía no lo tienen (o que lo tienen). */
  const toggleColumn = async (code: string, on: boolean) => {
    const targets = team.filter((u) => assigned.has(`${code}|${u.uid}`) !== on);
    if (targets.length === 0) return;
    setBusy(`col|${code}`);
    setError(null);
    try {
      for (const u of targets) await (on ? assignProject(code, u.uid, actor.uid) : unassignProject(code, u.uid));
      notify(on ? `Asignaste ${code} a ${targets.length} ${targets.length === 1 ? "persona" : "personas"}.` : `Quitaste ${code} a ${targets.length} ${targets.length === 1 ? "persona" : "personas"}.`);
    } catch (e) {
      console.error("No se pudo cambiar la asignación", e);
      setError(withCode("No se pudieron guardar todos los cambios.", e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow={actor.role === "admin" ? "Administrador" : "Supervisor"}
        title="Asignar proyectos"
        subtitle={actor.role === "admin" ? "Elegí en qué proyectos puede cargar horas cada persona de la empresa." : "Elegí en qué proyectos puede cargar horas cada persona que tenés a cargo."}
      />

      {company.projectAccess === "open" ? (
        <p role="note" className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 font-body-sm text-body-sm text-amber-200">
          <span className="material-symbols-outlined text-[18px]">info</span>
          <span>
            Hoy tu empresa tiene los proyectos abiertos: cualquiera carga horas en cualquier proyecto activo, así que estas asignaciones no se exigen.
            {actor.role === "admin" ? <> Para exigirlas, activá “Cada persona carga horas solo en los proyectos que le asignan” en <Link to="/configuracion" className="font-semibold underline">Configuración</Link>.</> : null}
          </span>
        </p>
      ) : null}

      {loadError || error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error ?? loadError}</p> : null}

      <div className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
        {projects.length === 0 ? (
          <p className="px-space-md py-8 text-center text-on-surface-variant">{actor.role === "admin" ? "Todavía no hay proyectos activos. Creá uno en Proyectos." : "Todavía no hay proyectos activos. Pedile al administrador que cree uno."}</p>
        ) : team.length === 0 ? (
          <p className="px-space-md py-8 text-center text-on-surface-variant">{loading && !data ? "Cargando…" : actor.role === "admin" ? "No hay personas activas." : "Todavía no tenés personas a cargo. El administrador te las asigna desde el organigrama."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left" aria-label="Asignación de proyectos">
              <thead>
                <tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">
                  <th className="sticky left-0 z-10 min-w-48 bg-surface-container-lowest px-space-md py-3.5 font-semibold">Persona</th>
                  {projects.map((p) => {
                    const all = team.every((u) => assigned.has(`${p.code}|${u.uid}`));
                    return (
                      <th key={p.code} className="min-w-28 px-space-md py-3.5 text-center font-semibold normal-case">
                        <p className="font-label-md text-label-md tracking-normal text-on-surface" title={p.name}>{p.code}</p>
                        <button type="button" disabled={busy !== null} onClick={() => void toggleColumn(p.code, !all)} className="mt-0.5 font-label-xs-mono text-[10px] tracking-wider text-primary uppercase hover:underline disabled:opacity-40">{all ? "Quitar a todos" : "Asignar a todos"}</button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {team.map((u) => (
                  <tr key={u.uid} className="align-middle hover:bg-surface-container">
                    <th scope="row" className="sticky left-0 z-10 bg-surface-container-low px-space-md py-2.5 text-left font-normal">
                      <p className="font-semibold">{u.fullName}{u.uid === actor.uid ? <span className="ml-2"><Chip tone="muted">Vos</Chip></span> : null}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{ROLE_LABELS[u.role]}{u.position ? ` · ${u.position}` : ""}</p>
                      {allocationOn && pctSum(u.uid) > 100 ? <p className="mt-0.5"><Chip tone="warn">{`Suma ${pctSum(u.uid)} % entre proyectos`}</Chip></p> : null}
                    </th>
                    {projects.map((p) => {
                      const on = assigned.has(`${p.code}|${u.uid}`);
                      return (
                        <td key={p.code} className="px-space-md py-2.5 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                            <input type="checkbox" aria-label={`${u.fullName}: ${p.code}`} checked={on} disabled={busy !== null} onChange={(e) => void toggle(p.code, u.uid, u.fullName, e.target.checked)} className="size-5 accent-[var(--hz-primary)]" />
                            {allocationOn && on ? <PctInput key={`${p.code}-${u.uid}-${pctOf(`${p.code}|${u.uid}`)}`} label={`Dedicación de ${u.fullName} a ${p.code}`} value={pctOf(`${p.code}|${u.uid}`)} disabled={busy !== null} onCommit={(n) => void changePct(p.code, u.uid, u.fullName, n)} /> : null}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">
          {actor.role === "admin" ? "Como administrador asignás a cualquier persona, incluido vos." : "Solo ves y asignás a las personas que tenés a cargo."} Quitar un proyecto no borra las horas ya cargadas; solo impide cargar horas nuevas ahí.
          {allocationOn ? " El porcentaje es cuánto de su tiempo disponible dedica la persona al proyecto (100 % = tiempo completo); se usa en Proyección para sugerir las horas del mes." : ""}
        </p>
      </div>
    </Page>
  );
}
