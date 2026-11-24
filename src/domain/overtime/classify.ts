import { addDays, isValidIsoDate } from "../dates";
import { ruleWindows } from "./config";
import { dayTypeOf } from "./dayType";
import { lunchInterval, normalIntervals, workDayFor } from "./schedule";
import { formatTime, intersect, minutesToHours, parseTime, subtract, totalMinutes, type Interval } from "./time";
import {
  NORMAL,
  type Category,
  type ClassificationContext,
  type ClassifiedEntry,
  type ClassifiedSegment,
  type DayType,
  type EntryInput,
} from "./types";

export class InvalidEntryError extends Error {}

interface Piece {
  date: string;
  dayType: DayType;
  interval: Interval;
  category: Category;
}

/**
 * Clasifica un registro de horas en normales y extra.
 *
 * 1. Si cruza la medianoche, se parte en un tramo por día calendario, y cada tramo se evalúa con el tipo de día
 *    de su propia fecha.
 * 2. Es hora normal la que cae dentro de la jornada del empleado ese día. En un feriado no hay jornada.
 * 3. Si el almuerzo de la jornada queda estrictamente dentro del registro (empieza antes y termina después),
 *    esa franja se descuenta. Si el registro solo la toca o la cubre en parte, no se descuenta nada y esa porción
 *    cuenta como fuera de la jornada: nunca desaparece tiempo trabajado sin que el registro lo abarque entero.
 * 4. Todo lo demás es hora extra: el tipo de día y la franja horaria eligen el tramo según las reglas de la empresa.
 * 5. Una guardia con onCallCountsAsNormal cuenta entera como normal, sin descontar almuerzo.
 */
export const classifyEntry = (entry: EntryInput, ctx: ClassificationContext): ClassifiedEntry => {
  if (!isValidIsoDate(entry.date)) throw new InvalidEntryError(`Fecha inválida: "${entry.date}".`);
  let start: number;
  let end: number;
  try {
    start = parseTime(entry.startTime);
    end = parseTime(entry.endTime);
  } catch (e) {
    throw new InvalidEntryError((e as Error).message);
  }
  if (start === end) throw new InvalidEntryError("La hora desde y la hora hasta no pueden ser iguales.");

  // Si la hora hasta es menor o igual, el registro cruza la medianoche y termina al día siguiente.
  const raw: { date: string; interval: Interval }[] =
    end > start
      ? [{ date: entry.date, interval: [start, end] }]
      : [
          { date: entry.date, interval: [start, 1440] },
          ...(end > 0 ? [{ date: addDays(entry.date, 1), interval: [0, end] as Interval }] : []),
        ];

  const onCallAsNormal = entry.isOnCall && ctx.config.onCallCountsAsNormal;
  const pieces: Piece[] = [];

  for (const { date, interval } of raw) {
    const dayType = dayTypeOf(date, ctx.holidays);

    if (onCallAsNormal) {
      pieces.push({ date, dayType, interval, category: NORMAL });
      continue;
    }

    const day = dayType === "holiday" ? null : workDayFor(ctx.schedule, date);
    const lunch = lunchInterval(day);
    const worked: Interval[] = lunch && interval[0] < lunch[0] && interval[1] > lunch[1] ? subtract([interval], [lunch]) : [interval];

    const normal = intersect(worked, normalIntervals(day));
    for (const i of normal) pieces.push({ date, dayType, interval: i, category: NORMAL });

    for (const extra of subtract(worked, normalIntervals(day))) {
      let remaining: Interval[] = [extra];
      for (const rule of ctx.config.rules.filter((r) => r.dayType === dayType)) {
        const covered = intersect(remaining, ruleWindows(rule));
        for (const i of covered) pieces.push({ date, dayType, interval: i, category: rule.tierId });
        remaining = subtract(remaining, covered);
      }
      if (remaining.length > 0) {
        const [from, to] = remaining[0]!;
        throw new Error(
          `La configuración de horas extra no cubre el ${dayType} entre las ${formatTime(from)} y las ${formatTime(to)}. Revisá las reglas en Configuración.`,
        );
      }
    }
  }

  pieces.sort((a, b) => (a.date === b.date ? a.interval[0] - b.interval[0] : a.date < b.date ? -1 : 1));

  const minutes: Record<Category, number> = {};
  for (const p of pieces) minutes[p.category] = (minutes[p.category] ?? 0) + (p.interval[1] - p.interval[0]);

  const total = totalMinutes(pieces.map((p) => p.interval));
  const breakdown: Record<Category, number> = {};
  for (const [category, m] of Object.entries(minutes)) breakdown[category] = minutesToHours(m);

  return {
    totalMinutes: total,
    hours: minutesToHours(total),
    minutes,
    breakdown,
    onCallMinutes: entry.isOnCall ? total : 0,
    segments: mergeSegments(pieces),
  };
};

/** Une tramos contiguos del mismo día y la misma categoría. */
const mergeSegments = (pieces: Piece[]): ClassifiedSegment[] => {
  const out: { date: string; dayType: DayType; category: Category; from: number; to: number }[] = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last && last.date === p.date && last.category === p.category && last.to === p.interval[0]) last.to = p.interval[1];
    else out.push({ date: p.date, dayType: p.dayType, category: p.category, from: p.interval[0], to: p.interval[1] });
  }
  return out.map((s) => ({ date: s.date, from: formatTime(s.from), to: formatTime(s.to), dayType: s.dayType, category: s.category }));
};
