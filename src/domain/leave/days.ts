import { addDays, dayOfWeek, isValidIsoDate } from "../dates";
import type { LeaveType } from "../model";
import { WEEKDAY_KEYS, type Holiday, type WorkSchedule } from "../overtime/types";

export class InvalidLeaveError extends Error {}

const MAX_DAYS = 366;

/**
 * Cantidad de días de una licencia, según el criterio de la empresa:
 * - Vacaciones: días corridos (todos los del calendario, ambos extremos incluidos).
 * - Resto de las licencias: días hábiles según la jornada de la persona, sin contar feriados.
 */
export const countLeaveDays = (
  type: LeaveType,
  from: string,
  to: string,
  schedule: WorkSchedule,
  holidays: ReadonlyMap<string, Holiday>,
): number => {
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) throw new InvalidLeaveError("Elegí fechas válidas.");
  if (to < from) throw new InvalidLeaveError("La fecha hasta no puede ser anterior a la fecha desde.");
  let count = 0;
  let steps = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (++steps > MAX_DAYS) throw new InvalidLeaveError("Una licencia no puede durar más de un año.");
    if (type === "vacation") {
      count++;
      continue;
    }
    const worksThatDay = schedule[WEEKDAY_KEYS[dayOfWeek(d)]!] !== null;
    const isHoliday = holidays.get(d)?.countsAsHoliday === true;
    if (worksThatDay && !isHoliday) count++;
  }
  return count;
};

/** Días de una licencia que caen dentro de un período (para la planilla del mes). */
export const leaveDaysInRange = (
  type: LeaveType,
  from: string,
  to: string,
  rangeFrom: string,
  rangeTo: string,
  schedule: WorkSchedule,
  holidays: ReadonlyMap<string, Holiday>,
): number => {
  const start = from > rangeFrom ? from : rangeFrom;
  const end = to < rangeTo ? to : rangeTo;
  if (end < start) return 0;
  return countLeaveDays(type, start, end, schedule, holidays);
};

/** true si dos rangos de fechas (extremos incluidos) se pisan. */
export const rangesOverlap = (aFrom: string, aTo: string, bFrom: string, bTo: string): boolean => aFrom <= bTo && bFrom <= aTo;

/** "corridos" para vacaciones, "hábiles" para el resto (criterio de la empresa). */
export const leaveDayUnit = (type: LeaveType): "corridos" | "hábiles" => (type === "vacation" ? "corridos" : "hábiles");

/** "1 día corrido", "7 días corridos", "1 día hábil", "3 días hábiles". */
export const formatLeaveDays = (days: number, type: LeaveType): string => {
  const one = days === 1;
  const unit = type === "vacation" ? (one ? "corrido" : "corridos") : one ? "hábil" : "hábiles";
  return `${days} ${one ? "día" : "días"} ${unit}`;
};
