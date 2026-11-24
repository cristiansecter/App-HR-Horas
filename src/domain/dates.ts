/**
 * Fechas de los registros: siempre texto AAAA-MM-DD en hora de Buenos Aires.
 * Nunca se usa toISOString() para obtenerlas: después de las 21:00 (UTC-3) ya devuelve el día siguiente.
 */

export const BUENOS_AIRES_TZ = "America/Argentina/Buenos_Aires";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const toUtc = (iso: string): Date => {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`Fecha inválida: "${iso}". Usá el formato AAAA-MM-DD.`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // Rechaza fechas que JavaScript "corrige", como 2026-02-30.
  if (d.toISOString().slice(0, 10) !== iso) throw new Error(`Fecha inexistente: "${iso}".`);
  return d;
};

export const isValidIsoDate = (value: string): boolean => {
  try {
    toUtc(value);
    return true;
  } catch {
    return false;
  }
};

/** Día de la semana: 0 = domingo ... 6 = sábado. */
export const dayOfWeek = (iso: string): number => toUtc(iso).getUTCDay();

export const addDays = (iso: string, days: number): string => {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Fecha local de Buenos Aires de un instante. */
export const dateInBuenosAires = (instant: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: BUENOS_AIRES_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);

/** Mediodía de Buenos Aires de una fecha, en milisegundos (UTC-3 fijo, sin horario de verano). */
export const noonMsBuenosAires = (iso: string): number => {
  toUtc(iso);
  return Date.parse(`${iso}T12:00:00-03:00`);
};
