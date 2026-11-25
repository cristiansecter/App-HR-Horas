import { describe, expect, it } from "vitest";
import { applyPreset, DEFAULT_FEATURES, featureProblems, normalizeFeatures, toggleModule } from "./features";

describe("normalizeFeatures", () => {
  it("sin datos devuelve todo apagado y pago por jornada", () => {
    expect(normalizeFeatures(undefined)).toEqual(DEFAULT_FEATURES);
    expect(normalizeFeatures({})).toEqual(DEFAULT_FEATURES);
  });
  it("lee módulos y modelo de pago", () => {
    const f = normalizeFeatures({ modules: { compensation: true, payroll: true }, payModel: "hourly" });
    expect(f.modules).toEqual({ compensation: true, performance: false, payroll: true, projectBilling: false, allocation: false });
    expect(f.payModel).toBe("hourly");
  });
  it("ignora valores raros: solo true prende un módulo", () => {
    const f = normalizeFeatures({ modules: { compensation: "si", performance: 1 }, payModel: "x" });
    expect(f.modules.compensation).toBe(false);
    expect(f.modules.performance).toBe(false);
    expect(f.payModel).toBe("salary");
  });
  it("un módulo sin su requisito no cuenta como activo", () => {
    const f = normalizeFeatures({ modules: { performance: true, payroll: true } });
    expect(f.modules).toEqual({ compensation: false, performance: false, payroll: false, projectBilling: false, allocation: false });
  });
  it("la facturación por proyecto necesita Rendimiento, que necesita Sueldos", () => {
    expect(normalizeFeatures({ modules: { projectBilling: true } }).modules.projectBilling).toBe(false);
    expect(normalizeFeatures({ modules: { compensation: true, performance: true, projectBilling: true } }).modules.projectBilling).toBe(true);
  });
  it("la asignación por porcentaje no depende de nada", () => {
    expect(normalizeFeatures({ modules: { allocation: true } }).modules.allocation).toBe(true);
  });
});

describe("toggleModule", () => {
  it("al prender un módulo prende sus requisitos", () => {
    const f = toggleModule(DEFAULT_FEATURES, "payroll", true);
    expect(f.modules).toMatchObject({ compensation: true, performance: false, payroll: true });
  });
  it("al apagar la base apaga lo que depende de ella", () => {
    const on = toggleModule(toggleModule(DEFAULT_FEATURES, "payroll", true), "performance", true);
    const off = toggleModule(on, "compensation", false);
    expect(off.modules).toMatchObject({ compensation: false, performance: false, payroll: false });
  });
  it("apagar un módulo hoja no toca a los demás", () => {
    const on = toggleModule(toggleModule(DEFAULT_FEATURES, "payroll", true), "performance", true);
    expect(toggleModule(on, "payroll", false).modules).toMatchObject({ compensation: true, performance: true, payroll: false });
  });
});

describe("featureProblems", () => {
  it("detecta dependencias rotas", () => {
    expect(featureProblems({ modules: { compensation: false, performance: true, payroll: false, projectBilling: false, allocation: false }, payModel: "salary" })).toHaveLength(1);
    expect(featureProblems(DEFAULT_FEATURES)).toEqual([]);
  });
});

describe("applyPreset", () => {
  it("consultoría prende facturación por proyecto (y sus bases) y la asignación por porcentaje", () => {
    const f = applyPreset(DEFAULT_FEATURES, "consultancy");
    expect(f.modules).toEqual({ compensation: true, performance: true, payroll: false, projectBilling: true, allocation: true });
  });
  it("producción apaga solo esas dos y no toca el resto", () => {
    const base = applyPreset(toggleModule(DEFAULT_FEATURES, "payroll", true), "consultancy");
    const f = applyPreset(base, "production");
    expect(f.modules).toEqual({ compensation: true, performance: true, payroll: true, projectBilling: false, allocation: false });
  });
});
