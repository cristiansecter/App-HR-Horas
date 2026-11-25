import type { Role } from "./types";

/** Lo mínimo de una persona para armar el organigrama. */
export interface OrgPerson {
  uid: string;
  fullName: string;
  role: Role;
  active: boolean;
  supervisorId?: string;
}

export interface OrgNode {
  person: OrgPerson;
  children: OrgNode[];
}

export interface OrgChart {
  /** Quienes encabezan un árbol: administradores y supervisores sin superior. */
  roots: OrgNode[];
  /** Empleados sin supervisor asignado: sus horas y licencias las aprueba el administrador. */
  unassigned: OrgPerson[];
}

const ORDER: Record<Role, number> = { admin: 0, supervisor: 1, employee: 2 };
const byRoleThenName = (a: OrgPerson, b: OrgPerson) => ORDER[a.role] - ORDER[b.role] || a.fullName.localeCompare(b.fullName, "es");

/** Solo un administrador o un supervisor puede tener gente a cargo. */
export const canHaveReports = (role: Role): boolean => role === "admin" || role === "supervisor";

/**
 * Árbol de la empresa a partir de "quién supervisa a quién" (supervisorId). Solo cuenta a las personas activas.
 * Si el superior de alguien no existe, está inactivo o no puede tener gente a cargo, esa persona queda arriba
 * (o en "sin supervisor", si es empleado). Un ciclo de datos corruptos no cuelga el armado: se corta.
 */
export function buildOrgChart(people: readonly OrgPerson[]): OrgChart {
  const active = people.filter((p) => p.active);
  const byId = new Map(active.map((p) => [p.uid, p]));
  const parentOf = (p: OrgPerson): OrgPerson | null => {
    const parent = p.supervisorId ? byId.get(p.supervisorId) : undefined;
    return parent && parent.uid !== p.uid && canHaveReports(parent.role) ? parent : null;
  };

  const children = new Map<string, OrgPerson[]>();
  const rootsRaw: OrgPerson[] = [];
  const unassigned: OrgPerson[] = [];
  for (const p of active) {
    const parent = parentOf(p);
    if (parent) children.set(parent.uid, [...(children.get(parent.uid) ?? []), p]);
    else if (p.role === "employee") unassigned.push(p);
    else rootsRaw.push(p);
  }

  const seen = new Set<string>();
  const build = (p: OrgPerson): OrgNode => {
    seen.add(p.uid);
    const kids = (children.get(p.uid) ?? []).filter((c) => !seen.has(c.uid)).sort(byRoleThenName);
    return { person: p, children: kids.map(build) };
  };
  const roots = rootsRaw.sort(byRoleThenName).map(build);
  // Personas que quedaron fuera por un ciclo (A supervisa a B y B a A): se muestran arriba para que se puedan corregir.
  for (const p of active) if (!seen.has(p.uid) && p.role !== "employee") roots.push(build(p));
  return { roots, unassigned: unassigned.sort(byRoleThenName) };
}

/** Todas las personas que cuelgan (directa o indirectamente) de `uid`. */
export function descendantsOf(people: readonly OrgPerson[], uid: string): Set<string> {
  const out = new Set<string>();
  const stack = [uid];
  while (stack.length) {
    const current = stack.pop()!;
    for (const p of people) {
      if (p.supervisorId === current && !out.has(p.uid) && p.uid !== uid) {
        out.add(p.uid);
        stack.push(p.uid);
      }
    }
  }
  return out;
}

export type MoveProblem = "self" | "cannot_supervise" | "cycle" | null;

/**
 * ¿Se puede poner a `uid` bajo `newSupervisorId`? No consigo mismo, no bajo un empleado (no puede tener gente a cargo)
 * y no bajo alguien que ya depende de él (formaría un círculo). `null` como superior = sin supervisor.
 */
export function moveProblem(people: readonly OrgPerson[], uid: string, newSupervisorId: string | null): MoveProblem {
  if (newSupervisorId === null) return null;
  if (newSupervisorId === uid) return "self";
  const target = people.find((p) => p.uid === newSupervisorId);
  if (!target || !canHaveReports(target.role)) return "cannot_supervise";
  if (descendantsOf(people, uid).has(newSupervisorId)) return "cycle";
  return null;
}

export const MOVE_PROBLEM_TEXT: Record<Exclude<MoveProblem, null>, string> = {
  self: "Una persona no puede supervisarse a sí misma.",
  cannot_supervise: "Solo un administrador o un supervisor puede tener gente a cargo.",
  cycle: "No se puede: esa persona ya depende de quien querés mover.",
};
