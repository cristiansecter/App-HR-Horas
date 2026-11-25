import type { LeaveType } from "./model";

/**
 * Premio y presentismo. Una empresa que lo activa marca, en cada licencia o ausencia, si la persona pierde el presentismo
 * y/o el premio. El sistema SOLO registra y reporta esas marcas: no calcula descuentos ni importes (eso lo decide el contador).
 * Cada empresa tiene sus propias prácticas, por eso el valor por defecto de cada tipo se puede cambiar y, en cada caso,
 * se puede marcar o desmarcar a mano.
 */

export interface LeaveFlags {
  losesPresentism: boolean;
  losesPrize: boolean;
}

/** Valores por defecto por tipo de licencia (los edita el administrador de la empresa). */
export type FlagDefaults = Record<LeaveType, LeaveFlags>;

/** Punto de partida: solo la ausencia injustificada hace perder presentismo y premio. */
export const DEFAULT_FLAG_DEFAULTS: FlagDefaults = {
  vacation: { losesPresentism: false, losesPrize: false },
  sick: { losesPresentism: false, losesPrize: false },
  study: { losesPresentism: false, losesPrize: false },
  personal: { losesPresentism: false, losesPrize: false },
  unjustified: { losesPresentism: true, losesPrize: true },
};

const LEAVE_TYPES = Object.keys(DEFAULT_FLAG_DEFAULTS) as LeaveType[];

/** Lee los valores por defecto guardados (que pueden faltar o venir incompletos) y devuelve siempre un objeto completo. */
export const normalizeFlagDefaults = (raw: unknown): FlagDefaults => {
  const data = (raw ?? {}) as Partial<Record<LeaveType, Partial<LeaveFlags>>>;
  const out = {} as FlagDefaults;
  for (const t of LEAVE_TYPES) {
    out[t] = {
      losesPresentism: typeof data[t]?.losesPresentism === "boolean" ? data[t]!.losesPresentism! : DEFAULT_FLAG_DEFAULTS[t].losesPresentism,
      losesPrize: typeof data[t]?.losesPrize === "boolean" ? data[t]!.losesPrize! : DEFAULT_FLAG_DEFAULTS[t].losesPrize,
    };
  }
  return out;
};

/** Marcas de una licencia: las guardadas si hay, o las del valor por defecto de su tipo. */
export const flagsOf = (type: LeaveType, stored: LeaveFlags | undefined, defaults: FlagDefaults): LeaveFlags => stored ?? defaults[type];

/** Cantidad de tardanzas del mes: de 0 a 31. 0 = sin esta regla. */
export const isValidLateLimit = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 31;

export interface PerkLeave {
  id: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
}

export interface PerkResult {
  lost: boolean;
  /** Por qué se pierde, para mostrar y para el contador. Vacío si no se pierde. */
  reasons: string[];
}

export interface MonthPerks {
  presentism: PerkResult;
  prize: PerkResult;
}

const dmy = (iso: string) => iso.split("-").slice(1).reverse().join("/");
const LABELS: Record<LeaveType, string> = { vacation: "vacaciones", sick: "enfermedad", study: "día de estudio", personal: "trámite personal", unjustified: "ausencia injustificada" };

/**
 * Qué pierde una persona en un mes: presentismo y premio, según las marcas de sus licencias del mes y, si la empresa lo
 * definió, por acumular tardanzas (`lateLimit` > 0 y `lateCount` >= `lateLimit`). Las tardanzas solo hacen perder el
 * presentismo, no el premio.
 */
export function monthPerks(args: {
  /** Licencias aprobadas de la persona que tocan el mes. */
  leaves: readonly PerkLeave[];
  flags: ReadonlyMap<string, LeaveFlags>;
  defaults: FlagDefaults;
  lateCount: number;
  lateLimit: number;
}): MonthPerks {
  const presentism: string[] = [];
  const prize: string[] = [];
  for (const l of args.leaves) {
    const f = flagsOf(l.type, args.flags.get(l.id), args.defaults);
    const when = l.startDate === l.endDate ? dmy(l.startDate) : `${dmy(l.startDate)} al ${dmy(l.endDate)}`;
    if (f.losesPresentism) presentism.push(`${LABELS[l.type]} (${when})`);
    if (f.losesPrize) prize.push(`${LABELS[l.type]} (${when})`);
  }
  if (args.lateLimit > 0 && args.lateCount >= args.lateLimit) presentism.push(`${args.lateCount} tardanzas en el mes (regla: ${args.lateLimit})`);
  return { presentism: { lost: presentism.length > 0, reasons: presentism }, prize: { lost: prize.length > 0, reasons: prize } };
}
