import { addDays, dayOfWeek } from "./dates";

/**
 * Vacaciones: cuántos días corresponden por año y cuántos lleva tomados cada persona. Es una ESTIMACIÓN según la Ley de
 * Contrato de Trabajo; muchos convenios dan más días y el contador es quien confirma el número final.
 */

/** Días entre dos fechas AAAA-MM-DD (b − a). */
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Días de lunes a viernes entre dos fechas, ambas incluidas (aproxima los días de trabajo efectivo). */
export const weekdaysBetween = (from: string, to: string): number => {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const w = dayOfWeek(d);
    if (w !== 0 && w !== 6) n++;
  }
  return n;
};

/** Años cumplidos de antigüedad a una fecha. */
export const completedYears = (hireDate: string, at: string): number => {
  const [hy, hm, hd] = hireDate.split("-").map(Number) as [number, number, number];
  const [ay, am, ad] = at.split("-").map(Number) as [number, number, number];
  let years = ay - hy;
  if (am < hm || (am === hm && ad < hd)) years--;
  return Math.max(0, years);
};

export interface Entitlement {
  /** Días corridos de vacaciones que corresponden ese año. */
  days: number;
  /** true si es proporcional (menos de la mitad del año trabajado) o no hay fecha de ingreso. */
  prorated: boolean;
}

/**
 * Días de vacaciones de un año (días corridos), según la antigüedad al 31 de diciembre:
 * hasta 5 años 14 · de 5 a 10 años 21 · de 10 a 20 años 28 · más de 20 años 35.
 * En el año de ingreso, si se trabajó menos de la mitad de los días del año, corresponde 1 día cada 20 de trabajo efectivo
 * (acá se estiman con los días de lunes a viernes).
 */
export function vacationEntitlement(hireDate: string, year: number): Entitlement {
  const yearEnd = `${year}-12-31`;
  if (hireDate > yearEnd) return { days: 0, prorated: false };
  const years = completedYears(hireDate, yearEnd);
  const full = years >= 20 ? 35 : years >= 10 ? 28 : years >= 5 ? 21 : 14;
  if (hireDate <= `${year}-01-01`) return { days: full, prorated: false };
  const worked = weekdaysBetween(hireDate, yearEnd);
  const total = weekdaysBetween(`${year}-01-01`, yearEnd);
  if (worked * 2 >= total) return { days: full, prorated: false };
  return { days: Math.floor(worked / 20), prorated: true };
}

/** Días corridos de un período que caen dentro de un año. */
export const daysInYear = (startDate: string, endDate: string, year: number): number => {
  const from = startDate > `${year}-01-01` ? startDate : `${year}-01-01`;
  const to = endDate < `${year}-12-31` ? endDate : `${year}-12-31`;
  return to < from ? 0 : daysBetween(from, to) + 1;
};

export interface VacationLeave {
  type: string;
  status: string;
  startDate: string;
  endDate: string;
}

export interface VacationBalance {
  year: number;
  entitled: number;
  prorated: boolean;
  /** Días de vacaciones aprobadas ese año (cuenta también las que todavía no empezaron). */
  taken: number;
  /** Días pedidos que esperan aprobación. */
  pending: number;
  /** Lo que queda sin pedir. Nunca negativo. */
  remaining: number;
}

/** Saldo de vacaciones de una persona en un año. `leaves` son las licencias de esa persona. */
export function vacationBalance(hireDate: string, year: number, leaves: readonly VacationLeave[]): VacationBalance {
  const { days, prorated } = vacationEntitlement(hireDate, year);
  const sum = (status: string) => leaves.filter((l) => l.type === "vacation" && l.status === status).reduce((s, l) => s + daysInYear(l.startDate, l.endDate, year), 0);
  const taken = sum("approved");
  const pending = sum("pending");
  return { year, entitled: days, prorated, taken, pending, remaining: Math.max(0, days - taken - pending) };
}
