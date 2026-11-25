import { describe, expect, it } from "vitest";
import type { RateEntry } from "./compensation";
import type { TimeEntry } from "./model";
import { DEFAULT_COSTING, buildPerformance, entryCost, type PerformanceInput } from "./performance";

const rate = (from: string, amount: number): RateEntry => ({ from, amount, setBy: "a", setAt: "x" });
const tiers = [{ id: "ot50", label: "Extra 50%", percent: 50 }, { id: "ot100", label: "Extra 100%", percent: 100 }];
const entry = (id: string, userId: string, projectId: string, date: string, hours: number, breakdown: Record<string, number>): TimeEntry => ({
  id, userId, projectId, date, dateMs: 0, startTime: "09:00", endTime: "18:00", isOnCall: false, ticketRef: "", notes: "", status: "approved", hours, breakdown,
});

const base = (over: Partial<PerformanceInput> = {}): PerformanceInput => ({
  entries: [
    entry("1", "emi", "P1", "2026-11-02", 8, { normal: 8 }),
    entry("2", "emi", "P1", "2026-11-03", 2, { ot50: 2 }),
    entry("3", "eze", "P1", "2026-11-02", 8, { normal: 8 }),
    entry("4", "eze", "P2", "2026-11-04", 4, { normal: 4 }),
  ],
  payModel: "salary",
  ratesByUser: new Map([["emi", [rate("2026-01-01", 800000)]], ["eze", [rate("2026-01-01", 640000)]]]),
  projectRates: new Map([["P1", { hourlyRate: 10000, billable: true }], ["P2", { hourlyRate: 0, billable: false }]]),
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
    expect(p2).toMatchObject({ hours: 4, revenue: 0, cost: 16000, margin: -16000, marginPct: null, billable: false, missingRate: false });
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
    expect(w.warnings.join(" ")).toMatch(/sin tarifa de cobro.*P1/);
    expect(w.projects.find((p) => p.code === "P1")!.missingRate).toBe(true);
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
