import { addDays } from "./dates";
import { dayTypeOf } from "./overtime/dayType";
import { workDayFor } from "./overtime/schedule";
import { parseTime } from "./overtime/time";
import type { Holiday, WorkSchedule } from "./overtime/types";

/**
 * Dedicación a proyectos y proyección de horas.
 * Todo son funciones puras (sin Firebase ni HTML) para poder probarlas con números a mano.
 */

/** Porcentaje de dedicación por defecto: tiempo completo en el proyecto. */
export const DEFAULT_ALLOCATION_PCT = 100;

/** Las horas se reparten de a media hora: es lo más fino que tiene sentido proyectar. */
export const HOUR_STEP = 0.5;

/** Tope de horas proyectadas por persona y proyecto en un mes (31 días × 24 h). Lo mismo exigen las reglas. */
export const MAX_PROJECTED_HOURS = 744;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Horas de trabajo de un día de la jornada (salida − entrada − almuerzo). */
export const workDayHours = (day: { start: string; end: string; lunchStart?: string; lunchEnd?: string }): number => {
  const total = parseTime(day.end, true) - parseTime(day.start);
  const lunch = day.lunchStart !== undefined && day.lunchEnd !== undefined ? parseTime(day.lunchEnd, true) - parseTime(day.lunchStart) : 0;
  return Math.max(0, total - lunch) / 60;
};

export interface AvailabilityInput {
  /** Mes "AAAA-MM". */
  month: string;
  schedule: WorkSchedule;
  holidays: ReadonlyMap<string, Holiday>;
  /** Licencias aprobadas de la persona (fechas AAAA-MM-DD, ambas incluidas). */
  leaves: readonly { startDate: string; endDate: string }[];
}

/**
 * Horas que una persona puede dedicar a proyectos en un mes: las de su jornada en los días laborables,
 * menos los feriados y los días de licencia aprobada.
 */
export function availableHours(input: AvailabilityInput): number {
  const [y, m] = input.month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let total = 0;
  for (let d = 1; d <= last; d++) {
    const date = addDays(`${input.month}-01`, d - 1);
    const day = workDayFor(input.schedule, date);
    if (!day) continue;
    if (dayTypeOf(date, input.holidays) === "holiday") continue;
    if (input.leaves.some((l) => l.startDate <= date && date <= l.endDate)) continue;
    total += workDayHours(day);
  }
  return round2(total);
}

/** Horas que se espera que dedique al proyecto: porcentaje de las horas disponibles, redondeado a media hora. */
export const expectedHours = (available: number, pct: number): number => roundToStep((available * Math.min(Math.max(pct, 0), 100)) / 100);

export const roundToStep = (hours: number): number => Math.round(hours / HOUR_STEP) * HOUR_STEP;

export interface Weighted {
  id: string;
  /** Peso para repartir (por ejemplo, el porcentaje de dedicación). Todos en 0 = partes iguales. */
  weight: number;
}

/**
 * Reparte `total` horas entre las personas en proporción a su peso, de a media hora y sin perder nada:
 * la suma de lo repartido es exactamente el total (si el total es múltiplo de media hora; si no, se redondea).
 * Lo que sobra por el redondeo va a quienes tienen el resto mayor (desempate: el orden de la lista).
 */
export function distributeHours(total: number, people: readonly Weighted[]): Map<string, number> {
  const result = new Map<string, number>(people.map((p) => [p.id, 0]));
  if (people.length === 0 || !Number.isFinite(total) || total <= 0) return result;
  const totalWeight = people.reduce((s, p) => s + Math.max(p.weight, 0), 0);
  const weights = totalWeight > 0 ? people.map((p) => Math.max(p.weight, 0)) : people.map(() => 1);
  const sum = weights.reduce((s, w) => s + w, 0);
  const units = Math.round(total / HOUR_STEP);
  const shares = weights.map((w, i) => ({ i, exact: (units * w) / sum }));
  const given = shares.map((s) => Math.floor(s.exact + 1e-9));
  let left = units - given.reduce((a, b) => a + b, 0);
  const order = [...shares].sort((a, b) => b.exact - Math.floor(b.exact + 1e-9) - (a.exact - Math.floor(a.exact + 1e-9)) || a.i - b.i);
  for (const s of order) {
    if (left <= 0) break;
    given[s.i]! += 1;
    left -= 1;
  }
  people.forEach((p, i) => result.set(p.id, given[i]! * HOUR_STEP));
  return result;
}

/** Desvío de lo trabajado contra lo proyectado: positivo = se trabajó de más, negativo = de menos. */
export const deviation = (worked: number, projected: number): number => round2(worked - projected);

/**
 * Suma de dedicaciones de una persona en todos sus proyectos. Si pasa de 100 % está asignada de más:
 * la pantalla lo avisa (no se bloquea, a veces es a propósito).
 */
export const totalPct = (pcts: readonly number[]): number => pcts.reduce((s, p) => s + p, 0);

/** Un porcentaje válido es un entero de 1 a 100. */
export const isValidPct = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 100;
