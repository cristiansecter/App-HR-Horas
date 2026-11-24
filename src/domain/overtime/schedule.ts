import { dayOfWeek } from "../dates";
import { parseTime, type Interval } from "./time";
import { WEEKDAY_KEYS, type WorkDay, type WorkSchedule } from "./types";

/** Jornada por defecto de una empresa nueva: lunes a viernes de 09:00 a 18:00, con almuerzo de 13:00 a 14:00 (8 horas). */
export const defaultWorkSchedule = (): WorkSchedule => {
  const day: WorkDay = { start: "09:00", end: "18:00", lunchStart: "13:00", lunchEnd: "14:00" };
  return {
    sun: null,
    mon: { ...day },
    tue: { ...day },
    wed: { ...day },
    thu: { ...day },
    fri: { ...day },
    sat: null,
  };
};

export const workDayFor = (schedule: WorkSchedule, date: string): WorkDay | null => schedule[WEEKDAY_KEYS[dayOfWeek(date)]!];

/** Franja de almuerzo en minutos, o null si ese día no tiene. */
export const lunchInterval = (day: WorkDay | null): Interval | null => {
  if (!day || day.lunchStart === undefined || day.lunchEnd === undefined) return null;
  return [parseTime(day.lunchStart), parseTime(day.lunchEnd, true)];
};

/** Tramos de la jornada en los que la hora es normal: antes y después del almuerzo. */
export const normalIntervals = (day: WorkDay | null): Interval[] => {
  if (!day) return [];
  const start = parseTime(day.start);
  const end = parseTime(day.end, true);
  const lunch = lunchInterval(day);
  return lunch ? [[start, lunch[0]], [lunch[1], end]] : [[start, end]];
};

/** Errores de una jornada. Una jornada nocturna se carga como dos días: hasta 24:00 y desde 00:00 del día siguiente. */
export const validateWorkSchedule = (schedule: WorkSchedule): string[] => {
  const errors: string[] = [];
  for (const key of WEEKDAY_KEYS) {
    const day = schedule[key];
    if (!day) continue;
    try {
      const start = parseTime(day.start);
      const end = parseTime(day.end, true);
      if (end <= start) errors.push(`${key}: la salida debe ser posterior a la entrada.`);
      if ((day.lunchStart === undefined) !== (day.lunchEnd === undefined)) {
        errors.push(`${key}: el almuerzo necesita inicio y fin.`);
      } else if (day.lunchStart !== undefined && day.lunchEnd !== undefined) {
        const ls = parseTime(day.lunchStart);
        const le = parseTime(day.lunchEnd, true);
        if (le <= ls) errors.push(`${key}: el fin del almuerzo debe ser posterior a su inicio.`);
        else if (ls < start || le > end) errors.push(`${key}: el almuerzo debe estar dentro de la jornada.`);
      }
    } catch (e) {
      errors.push(`${key}: ${(e as Error).message}`);
    }
  }
  return errors;
};
