import { addDays } from "./dates";
import type { LeaveType } from "./model";
import { dayTypeOf } from "./overtime/dayType";
import { workDayFor } from "./overtime/schedule";
import { parseTime } from "./overtime/time";
import type { Holiday, WorkSchedule } from "./overtime/types";

/**
 * Asistencia (modo "por asistencia"). Todo son funciones puras para poder probarlas con fechas a mano.
 *
 * Qué se guarda y qué se calcula:
 * - Se guarda solo la marca de presencia (la hora de llegada de un día).
 * - Las ausencias salen de las licencias aprobadas (la injustificada la registra quien supervisa).
 * - La tardanza se calcula al mirar: hora de llegada contra el inicio de la jornada vigente, con una tolerancia.
 */

export type MarkSource = "self" | "manual" | "import";

/** Marca de presencia de una persona en un día. */
export interface AttendanceMark {
  userId: string;
  /** AAAA-MM-DD */
  date: string;
  /** Hora de llegada, en minutos desde las 00:00 (por ejemplo 09:05 = 545). */
  arrivalMinutes: number;
  /** Quién la hizo: la propia persona, un superior o un sistema externo de fichaje. */
  source: MarkSource;
  markedBy: string;
  note?: string;
}

/** Tolerancia de llegada por defecto, en minutos. La empresa la puede cambiar. */
export const DEFAULT_LATE_TOLERANCE_MIN = 10;

export type DayKind =
  | "future" // todavía no llegó ese día
  | "nonworking" // fin de semana u otro día sin jornada
  | "holiday" // feriado
  | "present" // llegó a horario
  | "late" // llegó pasada la tolerancia
  | "leave" // licencia aprobada (justificada)
  | "unjustified" // ausencia injustificada registrada
  | "pending" // hoy, todavía sin marca
  | "missing"; // día laborable pasado sin marca ni licencia: alguien tiene que resolverlo

export interface DayStatus {
  date: string;
  kind: DayKind;
  /** Hora de llegada, si hay marca. */
  arrivalMinutes?: number;
  /** Minutos pasados del inicio de la jornada (sin descontar la tolerancia). Solo con marca. */
  lateMinutes?: number;
  /** Tipo de la licencia que cubre el día. */
  leaveType?: LeaveType;
  mark?: AttendanceMark;
}

export interface DayInput {
  date: string;
  /** Hoy (AAAA-MM-DD, hora de Buenos Aires). */
  today: string;
  schedule: WorkSchedule;
  holidays: ReadonlyMap<string, Holiday>;
  /** Licencias aprobadas de la persona. */
  leaves: readonly { type: LeaveType; startDate: string; endDate: string }[];
  mark?: AttendanceMark;
  toleranceMin: number;
}

/** "09:05" → 545 */
export const clockToMinutes = (hhmm: string): number => parseTime(hhmm);
/** 545 → "09:05" */
export const minutesToClock = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Minutos desde las 00:00 de Buenos Aires para un instante (Argentina no usa horario de verano: UTC−3 fijo). */
export const minutesOfDayBA = (instant: Date): number => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(instant);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
};

/** Estado de un día para una persona. */
export function dayStatus(input: DayInput): DayStatus {
  const { date, today, mark } = input;
  const base = { date, ...(mark ? { mark } : {}) };
  if (date > today) return { ...base, kind: "future" };
  if (dayTypeOf(date, input.holidays) === "holiday") return { ...base, kind: "holiday" };
  const day = workDayFor(input.schedule, date);
  if (!day) return { ...base, kind: "nonworking" };

  // Si hay marca, manda: la persona fue a trabajar (aunque tuviera una licencia cargada).
  if (mark) {
    const late = Math.max(0, mark.arrivalMinutes - clockToMinutes(day.start));
    return { ...base, kind: late > input.toleranceMin ? "late" : "present", arrivalMinutes: mark.arrivalMinutes, lateMinutes: late };
  }
  const leave = input.leaves.find((l) => l.startDate <= date && date <= l.endDate);
  if (leave) return { ...base, kind: leave.type === "unjustified" ? "unjustified" : "leave", leaveType: leave.type };
  return { ...base, kind: date === today ? "pending" : "missing" };
}

export interface MonthSummary {
  /** Días laborables que ya pasaron (o es hoy) y cuentan para la asistencia. */
  workingDays: number;
  /** Días con presencia marcada (a horario o tarde). */
  present: number;
  /** Días que llegó tarde (pasada la tolerancia) y la suma de esos minutos. */
  late: number;
  lateMinutes: number;
  /** Días con licencia justificada, por tipo. */
  leaves: Partial<Record<LeaveType, number>>;
  leaveDays: number;
  unjustified: number;
  /** Días pasados sin marca ni licencia: hay que resolverlos. */
  missing: number;
  /** Hoy sin marca todavía (no cuenta como falta). */
  pending: number;
  /** Informativo: sin tardanzas, ausencias injustificadas ni días sin resolver. No toca el sueldo. */
  perfect: boolean;
}

/** Resumen de un mes para una persona. `marks` son sus marcas de ese mes. */
export function summarizeMonth(args: {
  month: string;
  today: string;
  schedule: WorkSchedule;
  holidays: ReadonlyMap<string, Holiday>;
  leaves: DayInput["leaves"];
  marks: readonly AttendanceMark[];
  toleranceMin: number;
}): MonthSummary {
  const byDate = new Map(args.marks.map((m) => [m.date, m]));
  const [y, m] = args.month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: MonthSummary = { workingDays: 0, present: 0, late: 0, lateMinutes: 0, leaves: {}, leaveDays: 0, unjustified: 0, missing: 0, pending: 0, perfect: true };
  for (let d = 1; d <= last; d++) {
    const date = addDays(`${args.month}-01`, d - 1);
    const s = dayStatus({ date, today: args.today, schedule: args.schedule, holidays: args.holidays, leaves: args.leaves, mark: byDate.get(date), toleranceMin: args.toleranceMin });
    if (s.kind === "future" || s.kind === "nonworking" || s.kind === "holiday") continue;
    out.workingDays++;
    if (s.kind === "present" || s.kind === "late") {
      out.present++;
      if (s.kind === "late") { out.late++; out.lateMinutes += s.lateMinutes ?? 0; }
    } else if (s.kind === "leave") {
      out.leaveDays++;
      if (s.leaveType) out.leaves[s.leaveType] = (out.leaves[s.leaveType] ?? 0) + 1;
    } else if (s.kind === "unjustified") out.unjustified++;
    else if (s.kind === "missing") out.missing++;
    else if (s.kind === "pending") out.pending++;
  }
  out.perfect = out.late === 0 && out.unjustified === 0 && out.missing === 0;
  return out;
}

export const DAY_KIND_LABELS: Record<DayKind, string> = {
  future: "—",
  nonworking: "No laborable",
  holiday: "Feriado",
  present: "Presente",
  late: "Tarde",
  leave: "Licencia",
  unjustified: "Ausente sin justificar",
  pending: "Sin marcar todavía",
  missing: "Sin registro",
};

/** Tolerancia válida: entero de 0 a 120 minutos. */
export const isValidTolerance = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 120;
