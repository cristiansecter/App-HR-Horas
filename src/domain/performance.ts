import { costPerHour, rateAt, type RateEntry } from "./compensation";
import type { PayModel } from "./features";
import type { TimeEntry } from "./model";
import type { Tier } from "./overtime/types";

/**
 * Cómo se factura un proyecto:
 * - hourly: horas × tarifa (una general y, si hace falta, una distinta por persona).
 * - fixed: precio cerrado. Valor total y horas estimadas; el ingreso de cada mes es proporcional a las horas
 *   trabajadas y NUNCA pasa del valor total (si se pasan las horas estimadas, lo de más es costo sin ingreso).
 * - none: proyecto interno, sin facturación.
 */
export type Billing = "hourly" | "fixed" | "none";

export interface ProjectRate {
  billing: Billing;
  /** Tarifa general por hora (modelo hourly). */
  hourlyRate: number;
  /** Tarifas por persona que reemplazan a la general (uid → tarifa por hora). */
  personRates: Record<string, number>;
  /** Valor total del proyecto (modelo fixed). */
  totalValue: number;
  /** Horas estimadas del proyecto (modelo fixed). */
  estimatedHours: number;
}

export const DEFAULT_PROJECT_RATE: ProjectRate = { billing: "hourly", hourlyRate: 0, personRates: {}, totalValue: 0, estimatedHours: 0 };

export interface CostingParams {
  /** Cargas patronales y demás costo laboral sobre lo que se le paga a la persona, en %. */
  employerContributionsPct: number;
  /** Horas de un mes, para pasar un sueldo mensual a costo por hora (solo modelo por jornada). */
  monthlyHours: number;
}

export const DEFAULT_COSTING: CostingParams = { employerContributionsPct: 0, monthlyHours: 160 };

export interface PerformanceInput {
  /**
   * Registros aprobados. Si hay proyectos a precio cerrado conviene incluir también los anteriores al período
   * (para saber cuántas horas del proyecto ya se trabajaron); solo cuentan para costos y tarifas por hora los del período.
   */
  entries: readonly TimeEntry[];
  /** Período mostrado (AAAA-MM-DD, ambos incluidos). Sin él, cuentan todos los registros. */
  range?: { from: string; to: string };
  payModel: PayModel;
  /** false = la empresa no factura por proyecto (módulo apagado): solo costos, sin ingreso ni margen. */
  billingEnabled?: boolean;
  /** Historial de remuneración por persona. */
  ratesByUser: ReadonlyMap<string, readonly RateEntry[]>;
  projectRates: ReadonlyMap<string, ProjectRate>;
  tiers: readonly Tier[];
  costing: CostingParams;
  userNames: ReadonlyMap<string, string>;
  projectNames: ReadonlyMap<string, { name: string; client: string }>;
  /** Proyectos que tienen que figurar aunque no tengan horas (para poder cargarles la facturación antes de trabajar en ellos). */
  seedProjects?: readonly string[];
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
  billing: Billing;
  /** Comodidad para la pantalla: el proyecto genera ingreso. */
  billable: boolean;
  rate: ProjectRate;
  /** true si genera ingreso y le falta el dato para calcularlo (tarifa, o valor y horas del precio cerrado). */
  missingRate: boolean;
  /** Solo precio cerrado: horas trabajadas en total hasta el fin del período y cuánto ingreso corresponde a lo acumulado. */
  fixed?: { cumulativeHours: number; estimatedHours: number; recognizedToDate: number; overrunHours: number };
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

/** Ingreso de un precio cerrado entre dos acumulados de horas: proporcional, con tope en el valor total. */
export const fixedRevenue = (totalValue: number, estimatedHours: number, hoursBefore: number, hoursAfter: number): number => {
  if (totalValue <= 0 || estimatedHours <= 0) return 0;
  const recognized = (h: number) => (Math.min(Math.max(h, 0), estimatedHours) / estimatedHours) * totalValue;
  return recognized(hoursAfter) - recognized(hoursBefore);
};

/** Costos contra facturación por proyecto, persona y mes. Solo cuenta lo aprobado. */
export function buildPerformance(input: PerformanceInput): PerformanceResult {
  const billingOn = input.billingEnabled !== false;
  const inRange = (date: string) => !input.range || (date >= input.range.from && date <= input.range.to);
  const afterRange = (date: string) => Boolean(input.range) && date > input.range!.to;

  const projects = new Map<string, ProjectResult>();
  const people = new Map<string, PersonResult>();
  const months = new Map<string, MonthResult>();
  /** Horas aprobadas por proyecto y mes (todas las del historial recibido), para repartir los precios cerrados. */
  const hoursByProjectMonth = new Map<string, Map<string, number>>();

  const projectOf = (code: string): ProjectResult => {
    let p = projects.get(code);
    if (!p) {
      const rate = input.projectRates.get(code) ?? DEFAULT_PROJECT_RATE;
      const info = input.projectNames.get(code);
      p = { code, name: info?.name ?? code, client: info?.client ?? "", hours: 0, revenue: 0, cost: 0, margin: 0, marginPct: null, billing: rate.billing, billable: rate.billing !== "none", rate, missingRate: false };
      projects.set(code, p);
    }
    return p;
  };
  const monthOf = (m: string): MonthResult => {
    let r = months.get(m);
    if (!r) {
      r = { month: m, hours: 0, revenue: 0, cost: 0, margin: 0 };
      months.set(m, r);
    }
    return r;
  };

  for (const code of input.seedProjects ?? []) projectOf(code);

  for (const e of input.entries) {
    if (e.status !== "approved" || e.hours === undefined || afterRange(e.date)) continue;
    const byMonth = hoursByProjectMonth.get(e.projectId) ?? new Map<string, number>();
    byMonth.set(e.date.slice(0, 7), (byMonth.get(e.date.slice(0, 7)) ?? 0) + e.hours);
    hoursByProjectMonth.set(e.projectId, byMonth);
    if (!inRange(e.date)) continue;

    const proj = projectOf(e.projectId);
    const person = people.get(e.userId) ?? { userId: e.userId, name: input.userNames.get(e.userId) ?? "Persona dada de baja", hours: 0, cost: 0, missingPay: false };
    const month = monthOf(e.date.slice(0, 7));

    const cost = entryCost(e, input.ratesByUser.get(e.userId) ?? [], input.payModel, input.tiers, input.costing);
    if (cost === null) person.missingPay = true;
    // Por hora: tarifa de la persona si la tiene, o la general. El precio cerrado se reparte más abajo.
    const revenue = billingOn && proj.billing === "hourly" ? e.hours * (proj.rate.personRates[e.userId] ?? proj.rate.hourlyRate) : 0;

    proj.hours += e.hours;
    proj.revenue += revenue;
    proj.cost += cost ?? 0;
    person.hours += e.hours;
    person.cost += cost ?? 0;
    month.hours += e.hours;
    month.revenue += revenue;
    month.cost += cost ?? 0;
    people.set(e.userId, person);
  }

  // Precio cerrado: ingreso proporcional a las horas trabajadas, con tope en el valor total.
  if (billingOn) {
    for (const proj of projects.values()) {
      if (proj.billing !== "fixed") continue;
      const { totalValue, estimatedHours } = proj.rate;
      const byMonth = [...(hoursByProjectMonth.get(proj.code) ?? new Map<string, number>()).entries()].sort(([a], [b]) => a.localeCompare(b));
      let cumulative = 0;
      for (const [m, h] of byMonth) {
        const before = cumulative;
        cumulative += h;
        // Solo suma el ingreso de los meses del período mostrado (el resto sirve para saber cuánto se trabajó antes).
        if (input.range && (m < input.range.from.slice(0, 7) || m > input.range.to.slice(0, 7))) continue;
        const revenue = fixedRevenue(totalValue, estimatedHours, before, cumulative);
        proj.revenue += revenue;
        monthOf(m).revenue += revenue;
      }
      proj.fixed = {
        cumulativeHours: round2(cumulative),
        estimatedHours,
        recognizedToDate: round2(fixedRevenue(totalValue, estimatedHours, 0, cumulative)),
        overrunHours: round2(Math.max(0, cumulative - estimatedHours)),
      };
    }
  }

  const projectList = [...projects.values()]
    .map((p) => {
      const revenue = round2(p.revenue);
      const cost = round2(p.cost);
      const margin = round2(revenue - cost);
      const missingRate =
        billingOn &&
        ((p.billing === "hourly" && p.rate.hourlyRate <= 0 && Object.values(p.rate.personRates).every((r) => r <= 0)) ||
          (p.billing === "fixed" && (p.rate.totalValue <= 0 || p.rate.estimatedHours <= 0)));
      return { ...p, hours: round2(p.hours), revenue, cost, margin, marginPct: pct(margin, revenue), missingRate };
    })
    .sort((a, b) => b.hours - a.hours || a.code.localeCompare(b.code));
  const peopleList = [...people.values()].map((p) => ({ ...p, hours: round2(p.hours), cost: round2(p.cost) })).sort((a, b) => b.cost - a.cost);
  const monthList = [...months.values()].map((m) => ({ month: m.month, hours: round2(m.hours), revenue: round2(m.revenue), cost: round2(m.cost), margin: round2(m.revenue - m.cost) })).sort((a, b) => a.month.localeCompare(b.month));

  const revenue = round2(projectList.reduce((s, p) => s + p.revenue, 0));
  const cost = round2(projectList.reduce((s, p) => s + p.cost, 0));
  const margin = round2(revenue - cost);
  const warnings: string[] = [];
  const noPay = peopleList.filter((p) => p.missingPay);
  if (noPay.length) warnings.push(`Sin sueldo cargado para esas fechas (su costo figura en 0): ${noPay.map((p) => p.name).join(", ")}.`);
  const noRate = projectList.filter((p) => p.missingRate && p.hours > 0);
  if (noRate.length) warnings.push(`Proyectos que facturan y no tienen el dato de cobro completo (su ingreso figura en 0): ${noRate.map((p) => p.code).join(", ")}.`);
  const over = projectList.filter((p) => p.fixed && p.fixed.overrunHours > 0);
  if (over.length) warnings.push(`Proyectos a precio cerrado que ya pasaron las horas estimadas (lo de más es costo sin ingreso): ${over.map((p) => `${p.code} (+${p.fixed!.overrunHours} h)`).join(", ")}.`);

  return { projects: projectList, people: peopleList, months: monthList, totals: { hours: round2(projectList.reduce((s, p) => s + p.hours, 0)), revenue, cost, margin, marginPct: pct(margin, revenue) }, warnings };
}
