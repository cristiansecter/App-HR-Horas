import { describe, expect, it } from "vitest";
import type { RateEntry } from "./compensation";
import type { TimeEntry } from "./model";
import { DEFAULT_COSTING, buildPerformance, entryCost, fixedRevenue, type PerformanceInput, type ProjectRate } from "./performance";

const rate = (from: string, amount: number): RateEntry => ({ from, amount, setBy: "a", setAt: "x" });
const tiers = [{ id: "ot50", label: "Extra 50%", percent: 50 }, { id: "ot100", label: "Extra 100%", percent: 100 }];
const entry = (id: string, userId: string, projectId: string, date: string, hours: number, breakdown: Record<string, number>): TimeEntry => ({
  id, userId, projectId, date, dateMs: 0, startTime: "09:00", endTime: "18:00", isOnCall: false, ticketRef: "", notes: "", status: "approved", hours, breakdown,
});

const hourly = (hourlyRate: number, personRates: Record<string, number> = {}): ProjectRate => ({ billing: "hourly", hourlyRate, personRates, totalValue: 0, estimatedHours: 0 });
const none: ProjectRate = { billing: "none", hourlyRate: 0, personRates: {}, totalValue: 0, estimatedHours: 0 };
const fixed = (totalValue: number, estimatedHours: number): ProjectRate => ({ billing: "fixed", hourlyRate: 0, personRates: {}, totalValue, estimatedHours });

const base = (over: Partial<PerformanceInput> = {}): PerformanceInput => ({
  entries: [
    entry("1", "emi", "P1", "2026-11-02", 8, { normal: 8 }),
    entry("2", "emi", "P1", "2026-11-03", 2, { ot50: 2 }),
    entry("3", "eze", "P1", "2026-11-02", 8, { normal: 8 }),
    entry("4", "eze", "P2", "2026-11-04", 4, { normal: 4 }),
  ],
  payModel: "salary",
  ratesByUser: new Map([["emi", [rate("2026-01-01", 800000)]], ["eze", [rate("2026-01-01", 640000)]]]),
  projectRates: new Map([["P1", hourly(10000)], ["P2", none]]),
  tiers,
  costing: DEFAULT_COSTING,
  userNames: new Map([["emi", "Emi"], ["eze", "Eze"]]),
  projectNames: new Map([["P1", { name: "Obra", client: "Cliente A" }], ["P2", { name: "Interno", client: "" }]]),
  ...over,
});

describe("entryCost", () => {
  it("por jornada: sueldo ÷ horas del mes, con el recargo de cada tramo", () => {
    // 800000 / 160 = 5000 por hora; 2 h al 50% = 2 × 5000 × 1,5
    expect(entryCost({ date: "2026-11-03", hours: 2, breakdown: { ot50: 2 } }, [rate("2026-01-01", 800000)], "salary", tiers, DEFAULT_COSTING)).toBe(15000);
    expect(entryCost({ date: "2026-11-02", hours: 8, breakdown: { normal: 8 } }, [rate("2026-01-01", 800000)], "salary", tiers, DEFAULT_COSTING)).toBe(40000);
  });
  it("por hora: el valor hora tal cual, sin dividir", () => {
    expect(entryCost({ date: "2026-11-02", hours: 8, breakdown: { normal: 8 } }, [rate("2026-01-01", 4500)], "hourly", tiers, DEFAULT_COSTING)).toBe(36000);
  });
  it("suma el costo laboral adicional", () => {
    expect(entryCost({ date: "2026-11-02", hours: 8, breakdown: { normal: 8 } }, [rate("2026-01-01", 800000)], "salary", tiers, { employerContributionsPct: 20, monthlyHours: 160 })).toBe(48000);
  });
  it("usa el valor vigente en la fecha del registro, no el de hoy", () => {
    const rates = [rate("2026-01-01", 800000), rate("2026-11-03", 1600000)];
    expect(entryCost({ date: "2026-11-02", hours: 8, breakdown: { normal: 8 } }, rates, "salary", tiers, DEFAULT_COSTING)).toBe(40000);
    expect(entryCost({ date: "2026-11-03", hours: 8, breakdown: { normal: 8 } }, rates, "salary", tiers, DEFAULT_COSTING)).toBe(80000);
  });
  it("sin remuneración vigente devuelve null", () => {
    expect(entryCost({ date: "2025-01-01", hours: 8, breakdown: { normal: 8 } }, [rate("2026-01-01", 800000)], "salary", tiers, DEFAULT_COSTING)).toBeNull();
  });
});

describe("buildPerformance", () => {
  const r = buildPerformance(base());
  it("facturación, costo y margen por proyecto", () => {
    const p1 = r.projects.find((p) => p.code === "P1")!;
    expect(p1).toMatchObject({ hours: 18, revenue: 180000, cost: 87000, margin: 93000, marginPct: 51.7, name: "Obra", client: "Cliente A" });
  });
  it("un proyecto interno tiene costo y margen negativo, sin porcentaje", () => {
    const p2 = r.projects.find((p) => p.code === "P2")!;
    expect(p2).toMatchObject({ hours: 4, revenue: 0, cost: 16000, margin: -16000, marginPct: null, billing: "none", billable: false, missingRate: false });
  });
  it("totales", () => {
    expect(r.totals).toEqual({ hours: 22, revenue: 180000, cost: 103000, margin: 77000, marginPct: 42.8 });
  });
  it("costo por persona", () => {
    expect(r.people.find((p) => p.userId === "emi")).toMatchObject({ hours: 10, cost: 55000, missingPay: false });
    expect(r.people.find((p) => p.userId === "eze")).toMatchObject({ hours: 12, cost: 48000 });
  });
  it("serie por mes", () => {
    expect(r.months).toEqual([{ month: "2026-11", hours: 22, revenue: 180000, cost: 103000, margin: 77000 }]);
  });
  it("proyecto facturable sin tarifa y persona sin sueldo: se avisa", () => {
    const w = buildPerformance(base({ projectRates: new Map(), ratesByUser: new Map([["emi", [rate("2026-01-01", 800000)]]]) }));
    expect(w.warnings.join(" ")).toMatch(/Sin sueldo cargado.*Eze/);
    expect(w.warnings.join(" ")).toMatch(/no tienen el dato de cobro completo.*P1/);
    expect(w.projects.find((p) => p.code === "P1")!.missingRate).toBe(true);
  });
  it("los proyectos sembrados figuran aunque no tengan horas, y no generan aviso de tarifa", () => {
    const r2 = buildPerformance(base({ entries: [], seedProjects: ["P1", "P2", "P3"], projectRates: new Map() }));
    expect(r2.projects.map((p) => p.code)).toEqual(["P1", "P2", "P3"]);
    expect(r2.projects.every((p) => p.hours === 0 && p.cost === 0 && p.revenue === 0)).toBe(true);
    expect(r2.warnings).toEqual([]);
  });
  it("solo cuenta lo aprobado y no revienta sin datos", () => {
    const pending = { ...entry("9", "emi", "P1", "2026-11-05", 8, { normal: 8 }), status: "submitted" as const };
    expect(buildPerformance(base({ entries: [pending] })).totals.hours).toBe(0);
    expect(buildPerformance(base({ entries: [] })).totals).toEqual({ hours: 0, revenue: 0, cost: 0, margin: 0, marginPct: null });
  });
  it("agrupa por mes distinto", () => {
    const more = buildPerformance(base({ entries: [entry("1", "emi", "P1", "2026-10-30", 8, { normal: 8 }), entry("2", "emi", "P1", "2026-11-02", 8, { normal: 8 })] }));
    expect(more.months.map((m) => m.month)).toEqual(["2026-10", "2026-11"]);
  });
});

describe("facturación: tarifa por persona", () => {
  it("la tarifa de una persona reemplaza a la general solo para ella", () => {
    // Emi: 10 h a $12.000 (tarifa propia); Eze: 8 h a la general ($10.000) en P1
    const r = buildPerformance(base({ projectRates: new Map([["P1", hourly(10000, { emi: 12000 })], ["P2", none]]) }));
    expect(r.projects.find((p) => p.code === "P1")!.revenue).toBe(10 * 12000 + 8 * 10000);
  });
  it("sin tarifa general pero con tarifas por persona no se avisa como faltante", () => {
    const r = buildPerformance(base({ projectRates: new Map([["P1", hourly(0, { emi: 12000, eze: 9000 })], ["P2", none]]) }));
    expect(r.warnings.join(" ")).not.toMatch(/dato de cobro/);
    expect(r.projects.find((p) => p.code === "P1")!.revenue).toBe(10 * 12000 + 8 * 9000);
  });
});

describe("fixedRevenue", () => {
  it("proporcional a las horas, con tope en el valor total", () => {
    expect(fixedRevenue(1_000_000, 100, 0, 30)).toBe(300_000);
    expect(fixedRevenue(1_000_000, 100, 30, 70)).toBe(400_000);
    expect(fixedRevenue(1_000_000, 100, 70, 120)).toBe(300_000); // las horas pasadas de 100 no suman ingreso
    expect(fixedRevenue(1_000_000, 100, 100, 130)).toBe(0);
  });
  it("sin valor u horas estimadas no hay ingreso", () => {
    expect(fixedRevenue(0, 100, 0, 30)).toBe(0);
    expect(fixedRevenue(1_000_000, 0, 0, 30)).toBe(0);
  });
});

describe("facturación: precio cerrado", () => {
  // Valor total $1.000.000 y 100 h estimadas → $10.000 por hora mientras se esté dentro de lo estimado.
  const e = (id: string, date: string, hours: number) => entry(id, "emi", "PF", date, hours, { normal: hours });
  const fx = (entries: TimeEntry[], range?: { from: string; to: string }, value = 1_000_000, est = 100) =>
    buildPerformance(base({ entries, range, projectRates: new Map([["PF", fixed(value, est)]]), seedProjects: ["PF"] }));

  it("el ingreso del mes es proporcional a las horas trabajadas", () => {
    const r = fx([e("1", "2026-10-05", 30), e("2", "2026-11-10", 40)]);
    expect(r.months.map((m) => [m.month, m.revenue])).toEqual([["2026-10", 300_000], ["2026-11", 400_000]]);
    expect(r.projects[0]!.revenue).toBe(700_000);
  });
  it("en un período solo cuenta el ingreso de ese período, pero sabiendo lo trabajado antes", () => {
    const r = fx([e("1", "2026-10-05", 30), e("2", "2026-11-10", 40)], { from: "2026-11-01", to: "2026-11-30" });
    expect(r.projects[0]!.revenue).toBe(400_000);
    expect(r.projects[0]!.hours).toBe(40);
    expect(r.projects[0]!.fixed).toMatchObject({ cumulativeHours: 70, estimatedHours: 100, recognizedToDate: 700_000, overrunHours: 0 });
  });
  it("si se pasan las horas estimadas, lo de más es costo sin ingreso y se avisa", () => {
    const r = fx([e("1", "2026-10-05", 80), e("2", "2026-11-10", 40)]);
    expect(r.projects[0]!.revenue).toBe(1_000_000);
    expect(r.months.map((m) => m.revenue)).toEqual([800_000, 200_000]);
    expect(r.projects[0]!.fixed!.overrunHours).toBe(20);
    expect(r.warnings.join(" ")).toMatch(/precio cerrado.*PF \(\+20 h\)/);
  });
  it("las horas posteriores al período no se cuentan", () => {
    const r = fx([e("1", "2026-10-05", 30), e("2", "2026-12-10", 50)], { from: "2026-10-01", to: "2026-10-31" });
    expect(r.projects[0]!.fixed!.cumulativeHours).toBe(30);
    expect(r.projects[0]!.revenue).toBe(300_000);
  });
  it("sin valor total u horas estimadas se avisa que falta el dato", () => {
    const r = fx([e("1", "2026-11-10", 10)], undefined, 0, 0);
    expect(r.projects[0]!.missingRate).toBe(true);
    expect(r.projects[0]!.revenue).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/dato de cobro completo.*PF/);
  });
});

describe("sin facturación por proyecto", () => {
  it("con el módulo apagado solo hay costos: sin ingreso ni avisos de tarifa", () => {
    const r = buildPerformance(base({ billingEnabled: false, projectRates: new Map() }));
    expect(r.totals.revenue).toBe(0);
    expect(r.totals.cost).toBe(103000);
    expect(r.projects.every((p) => p.revenue === 0 && !p.missingRate)).toBe(true);
    expect(r.warnings.join(" ")).not.toMatch(/cobro/);
  });
});
