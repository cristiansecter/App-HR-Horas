import { parseTime, type Interval } from "./time";
import { DAY_TYPES, type DayType, type OvertimeConfig, type OvertimeRule, type SaturdayMode, type Tier } from "./types";

export const DEFAULT_TIERS: readonly Tier[] = [
  { id: "ot50", label: "Extra 50%", percent: 50 },
  { id: "ot100", label: "Extra 100%", percent: 100 },
];

const FULL_DAY = { from: "00:00", to: "24:00" } as const;

/**
 * Reglas del sábado según el modo que elige la empresa.
 * - flat_50: todo el sábado a `low` (por defecto el tramo del 50%).
 * - lct: según la Ley de Contrato de Trabajo (art. 201): hasta las 13:00 a `low` y desde las 13:00 a `high`.
 */
export const saturdayRules = (mode: SaturdayMode, low = "ot50", high = "ot100"): OvertimeRule[] =>
  mode === "flat_50"
    ? [{ dayType: "saturday", ...FULL_DAY, tierId: low }]
    : [
        { dayType: "saturday", from: "00:00", to: "13:00", tierId: low },
        { dayType: "saturday", from: "13:00", to: "24:00", tierId: high },
      ];

/**
 * Reglas por defecto:
 * - Día hábil: 18:00 a 21:00 al 50%, 21:00 a 08:00 al 100%, y fuera de la jornada entre 08:00 y 18:00 al 50%.
 * - Sábado: según saturdayMode.
 * - Domingo y feriado: 100% todo el día.
 */
export const defaultOvertimeConfig = (options: { saturdayMode?: SaturdayMode; onCallCountsAsNormal?: boolean } = {}): OvertimeConfig => ({
  tiers: DEFAULT_TIERS,
  rules: [
    { dayType: "weekday", from: "18:00", to: "21:00", tierId: "ot50" },
    { dayType: "weekday", from: "21:00", to: "08:00", tierId: "ot100" },
    { dayType: "weekday", from: "08:00", to: "18:00", tierId: "ot50" },
    ...saturdayRules(options.saturdayMode ?? "flat_50"),
    { dayType: "sunday", ...FULL_DAY, tierId: "ot100" },
    { dayType: "holiday", ...FULL_DAY, tierId: "ot100" },
  ],
  onCallCountsAsNormal: options.onCallCountsAsNormal ?? true,
});

/** Ventanas [desde, hasta) de una regla dentro de un mismo día. Una franja que cruza la medianoche son dos. */
export const ruleWindows = (rule: OvertimeRule): Interval[] => {
  const from = parseTime(rule.from);
  const to = parseTime(rule.to, true);
  if (from === to) throw new Error(`La franja ${rule.from} a ${rule.to} está vacía. Para todo el día usá 00:00 a 24:00.`);
  return from < to ? [[from, to]] : [[from, 1440], [0, to]];
};

/** Errores de una configuración. Cada tipo de día debe quedar cubierto las 24 horas, sin superposiciones. */
export const validateOvertimeConfig = (config: OvertimeConfig): string[] => {
  const errors: string[] = [];
  const tierIds = new Set<string>();
  for (const tier of config.tiers) {
    if (tierIds.has(tier.id)) errors.push(`El tramo "${tier.id}" está repetido.`);
    tierIds.add(tier.id);
    if (!(tier.percent > 0)) errors.push(`El tramo "${tier.id}" necesita un porcentaje mayor que 0.`);
  }

  for (const dayType of DAY_TYPES) {
    const windows: Interval[] = [];
    for (const rule of config.rules.filter((r) => r.dayType === dayType)) {
      if (!tierIds.has(rule.tierId)) errors.push(`${dayType}: la regla ${rule.from} a ${rule.to} usa un tramo que no existe ("${rule.tierId}").`);
      try {
        windows.push(...ruleWindows(rule));
      } catch (e) {
        errors.push(`${dayType}: ${(e as Error).message}`);
      }
    }
    windows.sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [start, end] of windows) {
      if (start < cursor) errors.push(`${label(dayType)}: hay franjas que se superponen cerca de las ${fmt(start)}.`);
      else if (start > cursor) errors.push(`${label(dayType)}: falta una regla entre las ${fmt(cursor)} y las ${fmt(start)}.`);
      cursor = Math.max(cursor, end);
    }
    if (cursor < 1440) errors.push(`${label(dayType)}: falta una regla entre las ${fmt(cursor)} y las 24:00.`);
  }
  return errors;
};

const LABELS: Record<DayType, string> = { weekday: "día hábil", saturday: "sábado", sunday: "domingo", holiday: "feriado" };
const label = (d: DayType): string => LABELS[d];
const fmt = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
