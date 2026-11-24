export type DayType = "weekday" | "saturday" | "sunday" | "holiday";

export const DAY_TYPES: readonly DayType[] = ["weekday", "saturday", "sunday", "holiday"];

/** Categoría de una hora: "normal" o el id de un tramo de hora extra de la empresa. */
export type Category = string;

export const NORMAL: Category = "normal";

/** Tramo de hora extra que define la empresa. Ejemplo: { id: "ot50", label: "Extra 50%", percent: 50 }. */
export interface Tier {
  id: string;
  label: string;
  percent: number;
}

/**
 * Regla que asigna una franja horaria de un tipo de día a un tramo.
 * `from` y `to` son "HH:MM" ("24:00" vale como fin de día). Si `from` > `to` la franja cruza la medianoche
 * (por ejemplo 21:00 a 08:00).
 */
export interface OvertimeRule {
  dayType: DayType;
  from: string;
  to: string;
  tierId: string;
}

export interface OvertimeConfig {
  tiers: readonly Tier[];
  rules: readonly OvertimeRule[];
  /** Si es true, las horas de una guardia cuentan como normales aunque caigan fuera de la jornada. */
  onCallCountsAsNormal: boolean;
}

export type SaturdayMode = "flat_50" | "lct";

/** Jornada de un día: entrada, salida y, opcionalmente, franja de almuerzo. Todo "HH:MM". */
export interface WorkDay {
  start: string;
  end: string;
  lunchStart?: string;
  lunchEnd?: string;
}

export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** Jornada por día de la semana. `null` = día sin jornada (no laborable para ese empleado). */
export type WorkSchedule = Record<WeekdayKey, WorkDay | null>;

export interface Holiday {
  date: string;
  name: string;
  type: "national" | "optional" | "custom";
  /** Si cuenta como feriado para las horas extra. Los días no laborables optativos arrancan en false. */
  countsAsHoliday: boolean;
}

export interface EntryInput {
  /** AAAA-MM-DD, el día en que empieza el registro. */
  date: string;
  startTime: string;
  endTime: string;
  isOnCall: boolean;
}

export interface ClassificationContext {
  schedule: WorkSchedule;
  holidays: ReadonlyMap<string, Holiday>;
  config: OvertimeConfig;
}

/** Tramo continuo de un registro, ya clasificado. */
export interface ClassifiedSegment {
  date: string;
  from: string;
  to: string;
  dayType: DayType;
  category: Category;
}

export interface ClassifiedEntry {
  /** Duración total descontando el almuerzo cuando corresponde. */
  totalMinutes: number;
  /** Horas totales (2 decimales). */
  hours: number;
  /** Minutos por categoría: fuente de verdad para sumar sin arrastrar redondeos. */
  minutes: Record<Category, number>;
  /** Horas por categoría (2 decimales). Ejemplo: { normal: 8, ot50: 3, ot100: 2 }. */
  breakdown: Record<Category, number>;
  /** Minutos del registro marcados como guardia. */
  onCallMinutes: number;
  segments: ClassifiedSegment[];
}
