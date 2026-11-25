import { addDays, dayOfWeek } from "./dates";
import { dayTypeOf } from "./overtime/dayType";
import { normalIntervals, workDayFor } from "./overtime/schedule";
import { totalMinutes } from "./overtime/time";
import type { Holiday, WorkSchedule } from "./overtime/types";

/** Lunes de la semana (lunes a domingo) a la que pertenece una fecha AAAA-MM-DD. */
export const mondayOf = (iso: string): string => {
  const dow = dayOfWeek(iso); // 0 = domingo
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
};

/** Los 7 días de la semana que empieza en `monday`. */
export const weekDates = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/**
 * Horas que le tocan trabajar a una persona un día: su jornada sin el almuerzo, y 0 si es feriado que cuenta como tal.
 * No descuenta licencias: eso lo resuelve quien llama, que conoce las ausencias.
 */
export const expectedHours = (date: string, schedule: WorkSchedule, holidays: ReadonlyMap<string, Holiday>): number => {
  if (dayTypeOf(date, holidays) === "holiday") return 0;
  const day = workDayFor(schedule, date);
  return Math.round((totalMinutes(normalIntervals(day)) / 60) * 100) / 100;
};
