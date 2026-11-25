import { leaveDaysInRange } from "../leave/days";
import type { LeaveRequest, TimeEntry } from "../model";
import type { Holiday, WorkSchedule } from "../overtime/types";
import { EMPTY_NOVELTIES, type Novelties } from "./engine";

/** Lo que SG Black ya sabe del mes de una persona: se carga solo en la liquidación. */
export type AutoNovelties = Pick<Novelties, "hoursByTier" | "normalHours" | "inasist" | "vacaciones">;

/** Lo que carga a mano el administrador. */
export type ManualNovelties = Pick<Novelties, "bono" | "premio" | "viaticos" | "reembolsos" | "adelanto" | "embargo" | "sac" | "sacMeses" | "sacBase">;

export const EMPTY_MANUAL: ManualNovelties = { bono: 0, premio: 0, viaticos: 0, reembolsos: 0, adelanto: 0, embargo: 0, sac: false, sacMeses: 6 };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Novedades automáticas del mes a partir de las horas aprobadas y las licencias aprobadas de una persona:
 * horas normales y extra por tramo, días de inasistencia injustificada y días de vacaciones (corridos) dentro del mes.
 * Enfermedad, estudio y trámites no cambian la liquidación: se pagan como un día normal.
 */
export function buildAutoNovelties(input: {
  entries: readonly TimeEntry[];
  leaves: readonly LeaveRequest[];
  range: { from: string; to: string };
  schedule: WorkSchedule;
  holidays: ReadonlyMap<string, Holiday>;
  tierIds: readonly string[];
}): AutoNovelties {
  const hoursByTier: Record<string, number> = {};
  let normalHours = 0;
  for (const e of input.entries) {
    if (e.status !== "approved" || e.date < input.range.from || e.date > input.range.to) continue;
    for (const [cat, h] of Object.entries(e.breakdown ?? {})) {
      if (cat === "normal") normalHours += h;
      else hoursByTier[cat] = (hoursByTier[cat] ?? 0) + h;
    }
  }
  for (const id of input.tierIds) hoursByTier[id] = round2(hoursByTier[id] ?? 0);
  for (const id of Object.keys(hoursByTier)) hoursByTier[id] = round2(hoursByTier[id]!);

  const days = (type: LeaveRequest["type"]) =>
    input.leaves
      .filter((l) => l.status === "approved" && l.type === type)
      .reduce((s, l) => s + leaveDaysInRange(l.type, l.startDate, l.endDate, input.range.from, input.range.to, input.schedule, input.holidays), 0);

  return { hoursByTier, normalHours: round2(normalHours), inasist: days("unjustified"), vacaciones: days("vacation") };
}

export const mergeNovelties = (auto: AutoNovelties, manual: Partial<ManualNovelties> = {}): Novelties => ({ ...EMPTY_NOVELTIES, ...auto, ...EMPTY_MANUAL, ...manual });
