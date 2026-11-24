import { dayOfWeek } from "../dates";
import type { DayType, Holiday } from "./types";

/** Tipo de día de una fecha. Un feriado que cuenta como tal manda sobre el día de la semana. */
export const dayTypeOf = (date: string, holidays: ReadonlyMap<string, Holiday>): DayType => {
  if (holidays.get(date)?.countsAsHoliday === true) return "holiday";
  const dow = dayOfWeek(date);
  if (dow === 0) return "sunday";
  if (dow === 6) return "saturday";
  return "weekday";
};
