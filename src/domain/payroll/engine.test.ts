import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, DEFAULT_VISIBILITY } from "./defaults";
import { calculatePayslip, EMPTY_NOVELTIES, fullYearsBetween, type PayslipInput } from "./engine";

const tiers = [{ id: "ot50", label: "Extra 50%", percent: 50 }, { id: "ot100", label: "Extra 100%", percent: 100 }];
const input = (over: Partial<PayslipInput> = {}): PayslipInput => ({
  employee: { convenio: true, obraSocial: "OSDE", hijos: 1, hireDate: "2020-03-01" },
  rate: 1_000_000,
  payModel: "salary",
  novelties: { ...EMPTY_NOVELTIES, hoursByTier: { ot50: 4, ot100: 2 } },
  tiers,
  periodStart: "2026-11-01",
  ...over,
});
const line = (lines: { concept: string; amount: number; muted?: boolean }[], concept: string) => lines.find((l) => l.concept === concept);

describe("fullYearsBetween", () => {
  it("años cumplidos, no redondeados", () => {
    expect(fullYearsBetween("2020-03-01", "2026-11-01")).toBe(6);
    expect(fullYearsBetween("2020-12-01", "2026-11-01")).toBe(5);
    expect(fullYearsBetween("2020-11-01", "2026-11-01")).toBe(6);
    expect(fullYearsBetween("2020-11-02", "2026-11-01")).toBe(5);
  });
  it("sin fecha o fecha futura, cero", () => {
    expect(fullYearsBetween(undefined, "2026-11-01")).toBe(0);
    expect(fullYearsBetween("2027-01-01", "2026-11-01")).toBe(0);
  });
});

describe("calculatePayslip: dentro de convenio, por jornada (cálculo a mano)", () => {
  // Básico 1.000.000; 6 años → antigüedad 60.000; presentismo (1.060.000 × 8,33%) = 88.298;
  // valor hora 1.000.000/200 = 5.000 → 4 h al 50% = 30.000 y 2 h al 100% = 20.000.
  const r = calculatePayslip(input());
  it("haberes remunerativos", () => {
    expect(r.basico).toBe(1_000_000);
    expect(r.aniosServicio).toBe(6);
    expect(line(r.remunerativos, "antiguedad")!.amount).toBe(60_000);
    expect(line(r.remunerativos, "presentismo")!.amount).toBe(88_298);
    expect(r.remunerativos.filter((l) => l.concept === "horasExtra").map((l) => l.amount)).toEqual([30_000, 20_000]);
    expect(r.totalRemunerativo).toBe(1_198_298);
  });
  it("no remunerativos: bono de convenio y asignación por 1 hijo", () => {
    expect(r.noRemunerativos.map((l) => [l.concept, l.amount])).toEqual([["bonoConvenio", 45_000], ["asignacionFamiliar", 25_000]]);
    expect(r.totalNoRemunerativo).toBe(70_000);
  });
  it("aportes sobre 1.198.298: jubilación 11%, PAMI 3%, obra social 3%, sindical 2%", () => {
    expect(r.deducciones.map((l) => [l.concept, l.amount])).toEqual([["jubilacion", 131_812.78], ["pami", 35_948.94], ["obraSocial", 35_948.94], ["sindical", 23_965.96]]);
    expect(r.totalDeducciones).toBeCloseTo(227_676.62, 2);
  });
  it("neto = remunerativo + no remunerativo − deducciones; sin Ganancias por estar bajo el mínimo", () => {
    expect(line(r.deducciones, "ganancias")).toBeUndefined();
    expect(r.neto).toBeCloseTo(1_040_621.38, 2);
  });
});

describe("calculatePayslip: casos", () => {
  it("fuera de convenio: sin sindical ni bono de convenio, y sin presentismo por defecto", () => {
    const r = calculatePayslip(input({ employee: { convenio: false, obraSocial: "", hijos: 0, hireDate: "2020-03-01" } }));
    expect(line(r.deducciones, "sindical")).toBeUndefined();
    expect(line(r.noRemunerativos, "bonoConvenio")).toBeUndefined();
    expect(line(r.remunerativos, "presentismo")).toBeUndefined();
    expect(calculatePayslip(input({ employee: { convenio: false, obraSocial: "", hijos: 0 }, params: { ...DEFAULT_PARAMS, presentismoFueraConvenio: true } })).remunerativos.some((l) => l.concept === "presentismo")).toBe(true);
  });
  it("inasistencias: descuenta básico ÷ 30 por día (divisor parametrizable) y el presentismo no corresponde", () => {
    const novelties = { ...EMPTY_NOVELTIES, inasist: 2 };
    const r = calculatePayslip(input({ novelties }));
    expect(line(r.remunerativos, "inasistencias")!.amount).toBeCloseTo(-66_666.67, 2);
    const p = line(r.remunerativos, "presentismo")!;
    expect(p.muted).toBe(true);
    expect(p.amount).toBe(0);
    const r2 = calculatePayslip(input({ novelties, params: { ...DEFAULT_PARAMS, divisorInasistencias: 25 } }));
    expect(line(r2.remunerativos, "inasistencias")!.amount).toBe(-80_000);
  });
  it("vacaciones: valor día = básico ÷ 25 × días", () => {
    const r = calculatePayslip(input({ novelties: { ...EMPTY_NOVELTIES, vacaciones: 14 } }));
    expect(line(r.remunerativos, "vacaciones")!.amount).toBe(560_000);
  });
  it("SAC: 50% de la mejor remuneración del semestre, proporcional a los meses", () => {
    const full = calculatePayslip(input({ novelties: { ...EMPTY_NOVELTIES, sac: true, sacMeses: 6, sacBase: 1_500_000 } }));
    expect(line(full.remunerativos, "sac")!.amount).toBe(750_000);
    const part = calculatePayslip(input({ novelties: { ...EMPTY_NOVELTIES, sac: true, sacMeses: 3, sacBase: 1_500_000 } }));
    expect(line(part.remunerativos, "sac")!.amount).toBe(375_000);
  });
  it("SAC sin mejor remuneración informada usa el remunerativo del mes (sin contar el propio SAC)", () => {
    const r = calculatePayslip(input({ novelties: { ...EMPTY_NOVELTIES, sac: true, sacMeses: 6 } }));
    // remunerativo antes del SAC: 1.000.000 + 60.000 + 88.298 = 1.148.298 → 574.149
    expect(line(r.remunerativos, "sac")!.amount).toBe(574_149);
  });
  it("tope de aportes: la base no pasa del tope", () => {
    const r = calculatePayslip(input({ params: { ...DEFAULT_PARAMS, topeAportes: 1_000_000 } }));
    expect(line(r.deducciones, "jubilacion")!.amount).toBe(110_000);
  });
  it("Ganancias simplificado: alícuota única sobre el excedente del mínimo y de las cargas de familia", () => {
    const r = calculatePayslip(input({ rate: 3_000_000, employee: { convenio: false, obraSocial: "", hijos: 2, hireDate: undefined }, novelties: EMPTY_NOVELTIES }));
    // remunerativo 3.000.000 − 1.900.000 − 2 × 60.000 = 980.000 × 19% = 186.200
    expect(line(r.deducciones, "ganancias")!.amount).toBe(186_200);
  });
  it("adelanto, embargo y conceptos apagados por visibilidad", () => {
    const withDed = calculatePayslip(input({ novelties: { ...EMPTY_NOVELTIES, adelanto: 100_000, embargo: 50_000, hoursByTier: { ot50: 10 } } }));
    expect(line(withDed.deducciones, "adelanto")!.amount).toBe(100_000);
    expect(line(withDed.deducciones, "embargo")!.amount).toBe(50_000);
    const off = calculatePayslip(input({ visibility: { convenio: { horasExtra: false, ganancias: false }, fuera: DEFAULT_VISIBILITY.fuera } }));
    expect(line(off.remunerativos, "horasExtra")).toBeUndefined();
  });
  it("horas extra sobre remuneración normal: el valor hora incluye la antigüedad (parámetro)", () => {
    const r = calculatePayslip(input({ params: { ...DEFAULT_PARAMS, horasExtraSobreRemNormal: true }, novelties: { ...EMPTY_NOVELTIES, hoursByTier: { ot50: 4 } } }));
    // (1.000.000 + 60.000) / 200 = 5.300 × 1,5 × 4 = 31.800
    expect(line(r.remunerativos, "horasExtra")!.amount).toBe(31_800);
  });
  it("un tramo configurado por la empresa (75%) se liquida con su recargo", () => {
    const r = calculatePayslip(input({ tiers: [{ id: "ot75", label: "Extra 75%", percent: 75 }], novelties: { ...EMPTY_NOVELTIES, hoursByTier: { ot75: 4 } } }));
    expect(line(r.remunerativos, "horasExtra")!.amount).toBe(35_000); // 5.000 × 1,75 × 4
  });
  it("contribuciones patronales: costo informativo para la empresa, no baja el neto", () => {
    const base = calculatePayslip(input());
    const withEmployer = calculatePayslip(input({ params: { ...DEFAULT_PARAMS, contribucionesPatronalesPct: 24 } }));
    expect(withEmployer.contribucionesPatronales).toBeCloseTo(1_198_298 * 0.24, 2);
    expect(withEmployer.neto).toBe(base.neto);
  });
});

describe("calculatePayslip: modelo por hora", () => {
  // Valor hora 5.000 × 160 h normales = 800.000; 10 h al 50% = 5.000 × 1,5 × 10 = 75.000.
  const hourly = (over: Partial<PayslipInput> = {}) => calculatePayslip(input({ payModel: "hourly", rate: 5000, employee: { convenio: true, obraSocial: "", hijos: 0, hireDate: undefined }, novelties: { ...EMPTY_NOVELTIES, normalHours: 160, hoursByTier: { ot50: 10 } }, ...over }));
  it("el básico sale de las horas normales trabajadas", () => {
    const r = hourly();
    expect(r.basico).toBe(800_000);
    expect(r.valorHora).toBe(5000);
    expect(line(r.remunerativos, "horasExtra")!.amount).toBe(75_000);
    expect(line(r.remunerativos, "presentismo")!.amount).toBe(66_640); // 800.000 × 8,33%
    expect(r.totalRemunerativo).toBe(941_640);
  });
  it("las inasistencias no se descuentan: esas horas simplemente no se pagan", () => {
    const r = hourly({ novelties: { ...EMPTY_NOVELTIES, normalHours: 144, inasist: 2 } });
    expect(line(r.remunerativos, "inasistencias")).toBeUndefined();
    expect(r.basico).toBe(720_000);
  });
  it("un día de vacaciones se paga como una jornada de horas", () => {
    const r = hourly({ novelties: { ...EMPTY_NOVELTIES, normalHours: 100, vacaciones: 5 } });
    expect(line(r.remunerativos, "vacaciones")!.amount).toBe(200_000); // 5 días × 8 h × 5.000
  });
});
