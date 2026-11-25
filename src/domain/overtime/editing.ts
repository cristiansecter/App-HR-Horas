import type { Tier } from "./types";

/** "08:00", "8:30" o "24:00" (solo como fin de franja) → true si es una hora válida. */
export const isValidClock = (text: string, allow24 = false): boolean => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return false;
  return allow24 ? h < 24 || (h === 24 && min === 0) : h < 24;
};

/** Normaliza "8:30" → "08:30". Devuelve el texto como vino si no es una hora válida. */
export const normalizeClock = (text: string): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  return m ? `${m[1]!.padStart(2, "0")}:${m[2]}` : text.trim();
};

/** Id estable para un tramo nuevo: "ot75", y si ya existe "ot75-2", "ot75-3"... Los ids no se cambian después. */
export const nextTierId = (tiers: readonly Tier[], percent: number): string => {
  const base = `ot${Math.round(percent)}`;
  const taken = new Set(tiers.map((t) => t.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
};
