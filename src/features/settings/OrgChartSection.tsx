import { useMemo, useState, type DragEvent } from "react";
import { buildOrgChart, canHaveReports, descendantsOf, MOVE_PROBLEM_TEXT, moveProblem, type OrgNode, type OrgPerson } from "@/domain/orgchart";
import { ROLE_LABELS, type Role } from "@/domain/types";
import { ASSIGNMENTS_CHANGED, setSupervisor } from "@/services/assignments";
import { listUsers } from "@/services/company";
import { withCode } from "@/services/errors";
import { DIRECTORY_CHANGED } from "@/services/directory";
import { useToast } from "@/ui/Toast";
import { useAsync } from "@/ui/useAsync";

const ROLE_STYLE: Record<Role, string> = {
  admin: "bg-primary-container text-on-primary",
  supervisor: "bg-tertiary-container text-on-tertiary-container",
  employee: "bg-surface-container-high text-on-surface",
};

interface CardProps {
  person: OrgPerson;
  reports: number;
  selected: boolean;
  dragging: boolean;
  onSelect: (uid: string) => void;
  onDragStart: (uid: string) => void;
  onDropOn: (targetUid: string) => void;
}

function PersonCard({ person, reports, selected, dragging, onSelect, onDragStart, onDropOn }: CardProps) {
  const [over, setOver] = useState(false);
  const droppable = canHaveReports(person.role);
  const draggable = person.role !== "admin";
  const allow = (e: DragEvent) => {
    if (droppable && dragging) {
      e.preventDefault();
      setOver(true);
    }
  };
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", person.uid); e.dataTransfer.effectAllowed = "move"; onDragStart(person.uid); }}
      onDragOver={allow}
      onDragEnter={allow}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (droppable) onDropOn(person.uid); }}
      onClick={() => onSelect(person.uid)}
      aria-label={`${person.fullName}, ${ROLE_LABELS[person.role]}`}
      aria-pressed={selected}
      className={`org-card flex h-[3.75rem] w-52 flex-col items-center justify-center rounded-xl px-3 text-center shadow-md transition ${ROLE_STYLE[person.role]} ${selected ? "ring-2 ring-white/80" : ""} ${over ? "scale-105 ring-2 ring-emerald-300" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <span className="block truncate font-label-lg text-label-lg font-bold">{person.fullName}</span>
      <span className="block max-w-full truncate font-label-xs-mono text-[10px] tracking-wide uppercase opacity-80" title={`${ROLE_LABELS[person.role]}${droppable ? ` · ${reports} ${reports === 1 ? "persona" : "personas"}` : ""}`}>
        {ROLE_LABELS[person.role]}{droppable ? ` · ${reports} ${reports === 1 ? "persona" : "personas"}` : ""}
      </span>
    </button>
  );
}

const countReports = (n: OrgNode): number => n.children.length;

/** Nivel de cada rol en el dibujo: administradores arriba, supervisores en el medio y empleados abajo. */
const LEVEL: Record<Role, number> = { admin: 0, supervisor: 1, employee: 2 };

/**
 * Una persona y, debajo, quienes dependen de ella. Cada rol tiene su propia fila: si alguien reporta a una persona de
 * más de un nivel arriba (por ejemplo un empleado sin supervisor que cuelga del administrador), se intercala un tramo
 * de línea vacío para que baje hasta su fila y quede alineado con el resto de su rol.
 * Está fuera del componente principal para no volver a crearse en cada render (cortaría el arrastre).
 */
function TreeNode({ node, depth, cardProps }: { node: OrgNode; depth: number; cardProps: (p: OrgPerson, reports: number) => CardProps }) {
  if (depth < LEVEL[node.person.role]) {
    return (
      <li className="org-ghost">
        <span className="org-ghost-line" aria-hidden="true" />
        <ul><TreeNode node={node} depth={depth + 1} cardProps={cardProps} /></ul>
      </li>
    );
  }
  return (
    <li>
      <PersonCard {...cardProps(node.person, countReports(node))} />
      {node.children.length > 0 ? <ul>{node.children.map((c) => <TreeNode key={c.person.uid} node={c} depth={depth + 1} cardProps={cardProps} />)}</ul> : null}
    </li>
  );
}

/**
 * Organigrama: el árbol de la empresa (administrador → supervisores → empleados), de arriba hacia abajo.
 * El administrador cambia a quién reporta cada persona arrastrándola sobre su nuevo supervisor o eligiéndolo en el panel.
 * Los roles (quién es administrador o supervisor) no se cambian acá: los asigna el Configurador.
 */
export default function OrgChartSection() {
  const { notify } = useToast();
  const { data, loading, error } = useAsync(listUsers, [], [ASSIGNMENTS_CHANGED, DIRECTORY_CHANGED]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const people = useMemo<OrgPerson[]>(() => (data ?? []).map((u) => ({ uid: u.uid, fullName: u.fullName, role: u.role, active: u.active, supervisorId: u.supervisorId })), [data]);
  const chart = useMemo(() => buildOrgChart(people), [people]);
  const person = people.find((p) => p.uid === selected) ?? null;
  const supervisorName = (id?: string) => people.find((p) => p.uid === id)?.fullName;

  const move = async (uid: string, newSupervisorId: string | null) => {
    const p = people.find((x) => x.uid === uid);
    if (!p) return;
    if ((p.supervisorId ?? null) === newSupervisorId) return;
    const why = moveProblem(people.filter((x) => x.active), uid, newSupervisorId);
    if (why) return setProblem(MOVE_PROBLEM_TEXT[why]);
    setProblem(null);
    setSaving(true);
    try {
      await setSupervisor(uid, newSupervisorId);
      notify(newSupervisorId ? `${p.fullName} ahora reporta a ${supervisorName(newSupervisorId)}.` : `${p.fullName} quedó sin supervisor.`);
    } catch (e) {
      console.error("No se pudo cambiar el supervisor", e);
      setProblem(withCode("No se pudo guardar el cambio. Probá de nuevo.", e));
    } finally {
      setSaving(false);
      setDragging(null);
    }
  };

  const cardProps = (p: OrgPerson, reports: number): CardProps => ({
    person: p, reports, selected: selected === p.uid, dragging: dragging !== null,
    onSelect: (uid) => { setSelected(uid); setProblem(null); },
    onDragStart: (uid) => { setDragging(uid); setProblem(null); },
    onDropOn: (target) => { if (dragging) void move(dragging, target); },
  });

  const options = useMemo(() => {
    if (!person) return [];
    const blocked = descendantsOf(people, person.uid);
    return people.filter((p) => p.active && canHaveReports(p.role) && p.uid !== person.uid).map((p) => ({ p, disabled: blocked.has(p.uid) }));
  }, [person, people]);

  return (
    <div className="flex flex-col gap-space-lg">
      <section className="rounded-xl bg-surface-container-low p-space-lg shadow-md">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Organigrama</h2>
        <p className="mt-1 max-w-3xl font-body-sm text-body-sm text-on-surface-variant">
          Quién supervisa a quién. Arrastrá a una persona sobre su nuevo supervisor, o hacé clic en ella y elegí a quién reporta. El supervisor aprueba las horas y licencias de su equipo y le asigna proyectos.
          Los roles (quién es administrador o supervisor) los asigna el Configurador: acá se ordena el equipo, no se cambian los roles.
        </p>
        <div className="mt-space-md flex flex-wrap gap-x-5 gap-y-2 font-label-md text-label-md text-on-surface-variant">
          {(["admin", "supervisor", "employee"] as const).map((r) => (
            <span key={r} className="flex items-center gap-2"><span className={`size-4 rounded ${ROLE_STYLE[r]}`} />{ROLE_LABELS[r]}</span>
          ))}
        </div>

        {error ? <p role="alert" className="mt-space-md rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error}</p> : null}
        {problem ? <p role="alert" className="mt-space-md rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{problem}</p> : null}

        <div className="mt-space-lg overflow-x-auto pb-4">
          {chart.roots.length === 0 && chart.unassigned.length === 0 ? (
            <p className="py-8 text-center text-on-surface-variant">{loading && !data ? "Cargando el equipo…" : "No hay personas activas."}</p>
          ) : (
            <ul className="org-tree" aria-label="Organigrama">
              {chart.roots.map((r) => <TreeNode key={r.person.uid} node={r} depth={0} cardProps={cardProps} />)}
            </ul>
          )}
        </div>

        {chart.unassigned.length > 0 || dragging ? (
          <div
            onDragOver={(e) => { if (dragging) { e.preventDefault(); setDropZone(true); } }}
            onDragLeave={() => setDropZone(false)}
            onDrop={(e) => { e.preventDefault(); setDropZone(false); if (dragging) void move(dragging, null); }}
            aria-label="Sin supervisor"
            className={`mt-space-md rounded-xl border-2 border-dashed p-4 transition ${dropZone ? "border-emerald-300 bg-emerald-500/10" : "border-white/15"}`}
          >
            <p className="font-label-lg text-label-lg font-semibold text-on-surface">Sin supervisor</p>
            <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant">Sus horas y licencias las aprueba el administrador. Arrastrá a una persona hasta acá para dejarla sin supervisor.</p>
            <div className="flex flex-wrap gap-3">
              {chart.unassigned.length === 0 ? <span className="font-body-sm text-body-sm text-on-surface-variant">Nadie por ahora.</span> : null}
              {chart.unassigned.map((p) => <PersonCard key={p.uid} {...cardProps(p, 0)} />)}
            </div>
          </div>
        ) : null}
      </section>

      {person ? (
        <section className="rounded-xl bg-surface-container-low p-space-lg shadow-md" aria-label={`Detalle de ${person.fullName}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">{person.fullName}</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{ROLE_LABELS[person.role]} · reporta a {supervisorName(person.supervisorId) ?? "nadie (lo aprueba el administrador)"}</p>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="rounded-lg px-3 py-1.5 font-label-md text-label-md text-on-surface-variant hover:text-on-surface">Cerrar</button>
          </div>
          {person.role === "admin" ? (
            <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">El administrador encabeza el organigrama: no reporta a nadie.</p>
          ) : (
            <label className="mt-space-md block max-w-md font-label-lg text-label-lg text-on-surface">
              Reporta a
              <select value={person.supervisorId ?? ""} disabled={saving} onChange={(e) => void move(person.uid, e.target.value || null)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden">
                <option value="">Sin supervisor (lo aprueba el administrador)</option>
                {options.map(({ p, disabled }) => <option key={p.uid} value={p.uid} disabled={disabled}>{p.fullName} · {ROLE_LABELS[p.role]}{disabled ? " (depende de esta persona)" : ""}</option>)}
              </select>
            </label>
          )}
        </section>
      ) : null}
    </div>
  );
}
