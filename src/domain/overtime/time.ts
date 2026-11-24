/** Horas del día como minutos desde la medianoche (0 a 1440). */

const HH_MM = /^(\d{2}):(\d{2})$/;

/** "HH:MM" a minutos. "24:00" solo se acepta si `allowEndOfDay` es true. */
export const parseTime = (value: string, allowEndOfDay = false): number => {
  const m = HH_MM.exec(value);
  if (!m) throw new Error(`Hora inválida: "${value}". Usá el formato HH:MM.`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h === 24 && min === 0 && allowEndOfDay) return 1440;
  if (h > 23 || min > 59) throw new Error(`Hora inválida: "${value}".`);
  return h * 60 + min;
};

export const formatTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const minutesToHours = (minutes: number): number => Math.round((minutes / 60) * 100) / 100;

/** Intervalo de minutos [inicio, fin). */
export type Interval = readonly [number, number];

const nonEmpty = (i: Interval): boolean => i[1] > i[0];

export const intersect = (a: readonly Interval[], b: readonly Interval[]): Interval[] => {
  const out: Interval[] = [];
  for (const x of a) {
    for (const y of b) {
      const piece: Interval = [Math.max(x[0], y[0]), Math.min(x[1], y[1])];
      if (nonEmpty(piece)) out.push(piece);
    }
  }
  return out.sort((p, q) => p[0] - q[0]);
};

export const subtract = (a: readonly Interval[], b: readonly Interval[]): Interval[] => {
  let current: Interval[] = [...a];
  for (const cut of b) {
    const next: Interval[] = [];
    for (const x of current) {
      const left: Interval = [x[0], Math.min(x[1], cut[0])];
      const right: Interval = [Math.max(x[0], cut[1]), x[1]];
      if (cut[1] <= x[0] || cut[0] >= x[1]) next.push(x);
      else {
        if (nonEmpty(left)) next.push(left);
        if (nonEmpty(right)) next.push(right);
      }
    }
    current = next;
  }
  return current.sort((p, q) => p[0] - q[0]);
};

export const totalMinutes = (intervals: readonly Interval[]): number => intervals.reduce((sum, i) => sum + (i[1] - i[0]), 0);
