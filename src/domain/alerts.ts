import { expirationName, type Expiration } from "./expirations";
import { LEAVE_TYPE_LABELS, type LeaveType } from "./model";
import { addDays } from "./dates";
import { daysBetween, vacationBalance } from "./vacations";
import type { Role } from "./types";

/**
 * Avisos: lo que conviene saber antes de que pase (vacaciones, licencias que terminan, incorporaciones, vencimientos,
 * superposición de vacaciones y saldo de vacaciones). Se calculan al abrir la app a partir de los datos: no se guardan,
 * y desaparecen solos cuando la fecha pasa. Funciones puras, para probarlas con fechas a mano.
 */

export type AlertKind = "vacation_soon" | "leave_ending" | "new_hire" | "expiration" | "vacation_overlap" | "vacation_balance";
export type AlertSeverity = "urgent" | "warn" | "info";

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  /** Fecha principal del aviso (AAAA-MM-DD), para ordenar. */
  date: string;
  /** De quién se trata, si es de una persona (para ir a su ficha). */
  userId?: string;
}

/** Con cuántos días de anticipación se avisa cada cosa. */
export const WINDOWS = { vacation: 30, leaveEnding: 7, newHire: 30, expiration: 30, expirationUrgent: 7, overlap: 60 } as const;

/** Porcentaje del equipo de vacaciones a la vez a partir del cual se avisa (lo cambia el administrador). */
export const DEFAULT_OVERLAP_PCT = 40;
/** Equipos de menos personas que esto no generan aviso de superposición. */
export const MIN_TEAM_FOR_OVERLAP = 3;
/** Días de vacaciones sin pedir a partir de los cuales se avisa a fin de año. */
export const BALANCE_ALERT_DAYS = 7;

export interface AlertPerson {
  uid: string;
  fullName: string;
  active: boolean;
  hireDate?: string;
  supervisorId?: string;
  role: Role;
}

export interface AlertLeave {
  id: string;
  userId: string;
  type: LeaveType;
  status: string;
  startDate: string;
  endDate: string;
}

export interface AlertInput {
  today: string;
  /** Quien mira. Un empleado solo ve avisos propios; un supervisor, los de su equipo; el administrador, todos. */
  viewer: { uid: string; role: Role };
  /** Personas sobre las que se puede avisar (ya acotadas por rol). */
  people: readonly AlertPerson[];
  leaves: readonly AlertLeave[];
  expirations: readonly Expiration[];
  overlapPct: number;
}

const dmy = (iso: string) => iso.split("-").reverse().join("/");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const inDays = (n: number) => (n === 0 ? "hoy" : n === 1 ? "mañana" : `en ${n} días`);
const SEVERITY_ORDER: Record<AlertSeverity, number> = { urgent: 0, warn: 1, info: 2 };

export function buildAlerts(input: AlertInput): Alert[] {
  const { today, viewer, overlapPct } = input;
  const out: Alert[] = [];
  const people = input.people.filter((p) => p.active);
  const byId = new Map(people.map((p) => [p.uid, p]));
  const mine = (uid: string) => uid === viewer.uid;
  const nameOf = (uid: string) => byId.get(uid)?.fullName ?? "Una persona";
  const leaves = input.leaves.filter((l) => byId.has(l.userId));

  // --- vacaciones que empiezan pronto
  for (const l of leaves) {
    if (l.type !== "vacation" || l.status !== "approved") continue;
    const n = daysBetween(today, l.startDate);
    if (n <= 0 || n > WINDOWS.vacation) continue;
    const days = daysBetween(l.startDate, l.endDate) + 1;
    out.push({
      id: `vac-${l.id}`, kind: "vacation_soon", severity: n <= 7 ? "warn" : "info", date: l.startDate, userId: l.userId,
      title: mine(l.userId) ? `Tus vacaciones empiezan ${inDays(n)}` : `${nameOf(l.userId)} se va de vacaciones ${inDays(n)}`,
      detail: `Del ${dmy(l.startDate)} al ${dmy(l.endDate)} (${plural(days, "día", "días")}).`,
    });
  }

  // --- licencias en curso que terminan pronto (la persona se reincorpora)
  for (const l of leaves) {
    if (l.status !== "approved" || l.type === "unjustified") continue;
    if (l.startDate > today || l.endDate < today) continue;
    const left = daysBetween(today, l.endDate);
    if (left > WINDOWS.leaveEnding) continue;
    const back = addDays(l.endDate, 1);
    out.push({
      id: `end-${l.id}`, kind: "leave_ending", severity: left <= 2 ? "warn" : "info", date: l.endDate, userId: l.userId,
      title: mine(l.userId) ? `Tu licencia termina ${left === 0 ? "hoy" : inDays(left)}` : `${nameOf(l.userId)} se reincorpora el ${dmy(back)}`,
      detail: `${LEAVE_TYPE_LABELS[l.type]} hasta el ${dmy(l.endDate)}.`,
    });
  }

  // --- próximas incorporaciones (quien supervisa o administra)
  if (viewer.role !== "employee") {
    for (const p of people) {
      if (!p.hireDate || p.hireDate <= today) continue;
      const n = daysBetween(today, p.hireDate);
      if (n > WINDOWS.newHire) continue;
      out.push({ id: `hire-${p.uid}`, kind: "new_hire", severity: n <= 3 ? "warn" : "info", date: p.hireDate, userId: p.uid, title: `Se incorpora ${p.fullName} ${inDays(n)}`, detail: `Fecha de ingreso: ${dmy(p.hireDate)}.` });
    }
  }

  // --- vencimientos (seguro, período de prueba, pasantía...)
  for (const e of input.expirations) {
    if (!byId.has(e.userId)) continue;
    const n = daysBetween(today, e.date);
    if (n > WINDOWS.expiration) continue;
    const what = expirationName(e);
    const overdue = n < 0;
    out.push({
      id: `exp-${e.id}`, kind: "expiration", date: e.date, userId: e.userId,
      severity: overdue || n <= WINDOWS.expirationUrgent ? "urgent" : "warn",
      title: overdue ? `Venció: ${what} de ${nameOf(e.userId)}` : `${what} de ${nameOf(e.userId)} vence ${inDays(n)}`,
      detail: overdue ? `Venció el ${dmy(e.date)} (hace ${plural(-n, "día", "días")}).` : `Vence el ${dmy(e.date)}.`,
    });
  }

  // --- superposición de vacaciones, por equipo (quien supervisa o administra)
  if (viewer.role !== "employee") {
    const groups = new Map<string, AlertPerson[]>();
    for (const p of people) groups.set(p.supervisorId ?? "none", [...(groups.get(p.supervisorId ?? "none") ?? []), p]);
    for (const [key, members] of groups) {
      if (members.length < MIN_TEAM_FOR_OVERLAP) continue;
      const need = Math.max(2, Math.ceil((members.length * overlapPct) / 100));
      const away = leaves.filter((l) => l.type === "vacation" && (l.status === "approved" || l.status === "pending") && members.some((m) => m.uid === l.userId));
      let start: string | null = null;
      let peak = 0;
      const flush = (end: string) => {
        if (!start) return;
        out.push({
          id: `ovl-${key}-${start}`, kind: "vacation_overlap", severity: "warn", date: start,
          title: `Superposición de vacaciones del ${dmy(start)} al ${dmy(end)}`,
          detail: `${peak} de ${members.length} personas de vacaciones a la vez${byId.get(key) ? ` en el equipo de ${byId.get(key)!.fullName}` : ""}.`,
        });
        start = null;
        peak = 0;
      };
      let last = today;
      for (let i = 0; i <= WINDOWS.overlap; i++) {
        const day = addDays(today, i);
        const count = new Set(away.filter((l) => l.startDate <= day && day <= l.endDate).map((l) => l.userId)).size;
        if (count >= need) {
          start ??= day;
          peak = Math.max(peak, count);
          last = day;
        } else {
          flush(last);
        }
      }
      flush(last);
    }
  }

  // --- vacaciones sin tomar, hacia fin de año (quien supervisa o administra)
  if (viewer.role !== "employee" && today.slice(5, 7) >= "11") {
    const year = Number(today.slice(0, 4));
    for (const p of people) {
      if (!p.hireDate) continue;
      const b = vacationBalance(p.hireDate, year, leaves.filter((l) => l.userId === p.uid));
      if (b.remaining >= BALANCE_ALERT_DAYS) {
        out.push({ id: `bal-${p.uid}-${year}`, kind: "vacation_balance", severity: "info", date: `${year}-12-31`, userId: p.uid, title: `${p.fullName} tiene ${plural(b.remaining, "día", "días")} de vacaciones sin pedir`, detail: `De ${b.entitled} que le corresponden en ${year} (estimado). Tomó ${b.taken}${b.pending ? ` y tiene ${b.pending} pedidos` : ""}.` });
      }
    }
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export const SEVERITY_LABELS: Record<AlertSeverity, string> = { urgent: "Urgente", warn: "Atención", info: "Para tener en cuenta" };
