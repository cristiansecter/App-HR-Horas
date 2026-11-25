import { costPerHour, rateAt, type RateEntry } from "./compensation";
import type { PayModel } from "./features";
import type { TimeEntry } from "./model";
import type { Tier } from "./overtime/types";

/** Tarifa de cobro de un proyecto. Un proyecto no facturable (interno) tiene costo pero no ingreso. */
export interface ProjectRate {
  hourlyRate: number;
  billable: boolean;
}

export interface CostingParams {
  /** Cargas patronales y demás costo laboral sobre lo que se le paga a la persona, en %. */
  employerContributionsPct: number;
  /** Horas de un mes, para pasar un sueldo mensual a costo por hora (solo modelo por jornada). */
  monthlyHours: number;
}

export const DEFAULT_COSTING: CostingParams = { employerContributionsPct: 0, monthlyHours: 160 };

export interface PerformanceInput {
  /** Registros aprobados del período (con `hours` y `breakdown` congelados). */
  entries: readonly TimeEntry[];
  payModel: PayModel;
  /** Historial de remuneración por persona. */
  ratesByUser: ReadonlyMap<string, readonly RateEntry[]>;
  projectRates: ReadonlyMap<string, ProjectRate>;
  tiers: readonly Tier[];
  costing: CostingParams;
  userNames: ReadonlyMap<string, string>;
  projectNames: ReadonlyMap<string, { name: string; client: string }>;
}

export interface ProjectResult {
  code: string;
  name: string;
  client: string;
  hours: number;
  revenue: number;
  cost: number;
  margin: number;
  /** Margen sobre la facturación. `null` si no hubo facturación. */
  marginPct: number | null;
  billable: boolean;
  /** Tarifa de cobro cargada (0 si falta). */
  hourlyRate: number;
  /** true si es facturable y no tiene tarifa: la facturación quedó en 0 por falta del dato. */
  missingRate: boolean;
}

export interface PersonResult {
  userId: string;
  name: string;
  hours: number;
  cost: number;
  /** true si trabajó horas y no tiene remuneración cargada para esas fechas: su costo quedó en 0. */
  missingPay: boolean;
}

export interface MonthResult {
  month: string;
  hours: number;
  revenue: number;
  cost: number;
  margin: number;
}

export interface PerformanceResult {
  projects: ProjectResult[];
  people: PersonResult[];
  months: MonthResult[];
  totals: { hours: number; revenue: number; cost: number; margin: number; marginPct: number | null };
  warnings: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (margin: number, revenue: number): number | null => (revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : null);

/**
 * Costo de las horas de un registro aprobado. Cada categoría se valoriza con su recargo
 * (normal ×1, tramo del 50% ×1,5, del 100% ×2...) y se suma el costo laboral adicional.
 * `null` si la persona no tiene remuneración vigente en esa fecha.
 */
export const entryCost = (
  entry: Pick<TimeEntry, "date" | "hours" | "breakdown">,
  rates: readonly RateEntry[],
  payModel: PayModel,
  tiers: readonly Tier[],
  costing: CostingParams,
): number | null => {
  const rate = rateAt(rates, entry.date);
  if (rate === null) return null;
  const base = costPerHour(payModel, rate, costing.monthlyHours);
  const mult = (cat: string) => (cat === "normal" ? 1 : 1 + (tiers.find((t) => t.id === cat)?.percent ?? 0) / 100);
  const parts = entry.breakdown && Object.keys(entry.breakdown).length > 0 ? Object.entries(entry.breakdown) : [["normal", entry.hours ?? 0] as const];
  const wage = parts.reduce((sum, [cat, h]) => sum + h * base * mult(cat), 0);
  return wage * (1 + costing.employerContributionsPct / 100);
};

/** Costos contra facturación por proyecto, persona y mes. Solo cuenta lo aprobado. */
export function buildPerformance(input: PerformanceInput): PerformanceResult {
  const projects = new Map<string, ProjectResult>();
  const people = new Map<string, PersonResult>();
  const months = new Map<string, MonthResult>();

  const projectOf = (code: string): ProjectResult => {
    let p = projects.get(code);
    if (!p) {
      const rate = input.projectRates.get(code);
      const info = input.projectNames.get(code);
      p = { code, name: info?.name ?? code, client: info?.client ?? "", hours: 0, revenue: 0, cost: 0, margin: 0, marginPct: null, billable: rate?.billable ?? true, hourlyRate: rate?.hourlyRate ?? 0, missingRate: false };
      projects.set(code, p);
    }
    return p;
  };

  for (const e of input.entries) {
    if (e.status !== "approved" || e.hours === undefined) continue;
    const proj = projectOf(e.projectId);
    const person = people.get(e.userId) ?? { userId: e.userId, name: input.userNames.get(e.userId) ?? "Persona dada de baja", hours: 0, cost: 0, missingPay: false };
    const month = months.get(e.date.slice(0, 7)) ?? { month: e.date.slice(0, 7), hours: 0, revenue: 0, cost: 0, margin: 0 };

    const cost = entryCost(e, input.ratesByUser.get(e.userId) ?? [], input.payModel, input.tiers, input.costing);
    if (cost === null) person.missingPay = true;
    const revenue = proj.billable ? e.hours * proj.hourlyRate : 0;

    proj.hours += e.hours;
    proj.revenue += revenue;
    proj.cost += cost ?? 0;
    person.hours += e.hours;
    person.cost += cost ?? 0;
    month.hours += e.hours;
    month.revenue += revenue;
    month.cost += cost ?? 0;
    projects.set(e.projectId, proj);
    people.set(e.userId, person);
    months.set(month.month, month);
  }

  const projectList = [...projects.values()]
    .map((p) => {
      const revenue = round2(p.revenue);
      const cost = round2(p.cost);
      const margin = round2(revenue - cost);
      return { ...p, hours: round2(p.hours), revenue, cost, margin, marginPct: pct(margin, revenue), missingRate: p.billable && p.hourlyRate <= 0 };
    })
    .sort((a, b) => b.hours - a.hours);
  const peopleList = [...people.values()].map((p) => ({ ...p, hours: round2(p.hours), cost: round2(p.cost) })).sort((a, b) => b.cost - a.cost);
  const monthList = [...months.values()].map((m) => ({ month: m.month, hours: round2(m.hours), revenue: round2(m.revenue), cost: round2(m.cost), margin: round2(m.revenue - m.cost) })).sort((a, b) => a.month.localeCompare(b.month));

  const revenue = round2(projectList.reduce((s, p) => s + p.revenue, 0));
  const cost = round2(projectList.reduce((s, p) => s + p.cost, 0));
  const margin = round2(revenue - cost);
  const warnings: string[] = [];
  const noPay = peopleList.filter((p) => p.missingPay);
  if (noPay.length) warnings.push(`Sin sueldo cargado para esas fechas (su costo figura en 0): ${noPay.map((p) => p.name).join(", ")}.`);
  const noRate = projectList.filter((p) => p.missingRate);
  if (noRate.length) warnings.push(`Proyectos facturables sin tarifa de cobro (su facturación figura en 0): ${noRate.map((p) => p.code).join(", ")}.`);

  return { projects: projectList, people: peopleList, months: monthList, totals: { hours: round2(projectList.reduce((s, p) => s + p.hours, 0)), revenue, cost, margin, marginPct: pct(margin, revenue) }, warnings };
}
