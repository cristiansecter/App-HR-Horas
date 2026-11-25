import { describe, expect, it } from "vitest";
import { applyPreset, DEFAULT_FEATURES, featureProblems, normalizeFeatures, setWorkMode, toggleModule } from "./features";

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
    expect(featureProblems({ modules: { compensation: false, performance: true, payroll: false, projectBilling: false, allocation: false }, payModel: "salary", supervisorsSeePay: false, workMode: "projects" })).toHaveLength(1);
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

describe("permiso: supervisores ven sueldos del equipo", () => {
  it("por defecto está apagado", () => {
    expect(DEFAULT_FEATURES.supervisorsSeePay).toBe(false);
    expect(normalizeFeatures({ modules: { compensation: true } }).supervisorsSeePay).toBe(false);
  });
  it("se lee prendido solo con true y solo si Sueldos en el legajo está activo", () => {
    expect(normalizeFeatures({ modules: { compensation: true }, supervisorsSeePay: true }).supervisorsSeePay).toBe(true);
    expect(normalizeFeatures({ modules: { compensation: false }, supervisorsSeePay: true }).supervisorsSeePay).toBe(false);
    expect(normalizeFeatures({ modules: { compensation: true }, supervisorsSeePay: "si" }).supervisorsSeePay).toBe(false);
  });
  it("apagar Sueldos en el legajo apaga también el permiso", () => {
    const on = { ...toggleModule(DEFAULT_FEATURES, "compensation", true), supervisorsSeePay: true };
    expect(toggleModule(on, "compensation", false).supervisorsSeePay).toBe(false);
    expect(toggleModule(on, "performance", true).supervisorsSeePay).toBe(true);
  });
  it("avisa si el permiso está prendido sin el módulo", () => {
    expect(featureProblems({ ...DEFAULT_FEATURES, supervisorsSeePay: true })).toHaveLength(1);
    expect(featureProblems({ ...toggleModule(DEFAULT_FEATURES, "compensation", true), supervisorsSeePay: true })).toEqual([]);
  });
});

describe("modo de trabajo: por proyectos o por asistencia", () => {
  const withMods = { ...toggleModule(toggleModule(DEFAULT_FEATURES, "projectBilling", true), "allocation", true), payModel: "hourly" as const };
  it("por defecto es por proyectos", () => {
    expect(DEFAULT_FEATURES.workMode).toBe("projects");
    expect(normalizeFeatures({}).workMode).toBe("projects");
    expect(normalizeFeatures({ workMode: "cualquier-cosa" }).workMode).toBe("projects");
  });
  it("pasar a asistencia apaga los módulos de proyectos y deja el sueldo mensual", () => {
    const f = setWorkMode(withMods, "attendance");
    expect(f.workMode).toBe("attendance");
    expect(f.modules.performance).toBe(false);
    expect(f.modules.projectBilling).toBe(false);
    expect(f.modules.allocation).toBe(false);
    expect(f.payModel).toBe("salary");
    expect(f.modules.compensation).toBe(true); // sueldos sigue disponible
  });
  it("lo guardado por asistencia se lee siempre coherente, aunque la base tenga módulos de proyectos prendidos u horas", () => {
    const f = normalizeFeatures({ workMode: "attendance", payModel: "hourly", modules: { compensation: true, performance: true, projectBilling: true, allocation: true, payroll: true } });
    expect(f.modules).toEqual({ compensation: true, performance: false, payroll: true, projectBilling: false, allocation: false });
    expect(f.payModel).toBe("salary");
  });
  it("por asistencia no se pueden prender los módulos de proyectos, pero sí los de sueldos y liquidación", () => {
    const att = setWorkMode(DEFAULT_FEATURES, "attendance");
    expect(toggleModule(att, "allocation", true)).toEqual(att);
    expect(toggleModule(att, "performance", true)).toEqual(att);
    expect(toggleModule(att, "payroll", true).modules.payroll).toBe(true);
  });
  it("el atajo de consultoría no aplica por asistencia", () => {
    const att = setWorkMode(DEFAULT_FEATURES, "attendance");
    expect(applyPreset(att, "consultancy")).toEqual(att);
  });
  it("volver a proyectos no vuelve a prender lo que se apagó", () => {
    const back = setWorkMode(setWorkMode(withMods, "attendance"), "projects");
    expect(back.workMode).toBe("projects");
    expect(back.modules.allocation).toBe(false);
  });
  it("avisa si por asistencia queda un módulo de proyectos o el pago por hora", () => {
    expect(featureProblems({ ...DEFAULT_FEATURES, workMode: "attendance", payModel: "hourly" })).toHaveLength(1);
    const bad = { ...DEFAULT_FEATURES, workMode: "attendance" as const, modules: { ...DEFAULT_FEATURES.modules, allocation: true } };
    expect(featureProblems(bad)).toHaveLength(1);
    expect(featureProblems(setWorkMode(DEFAULT_FEATURES, "attendance"))).toEqual([]);
  });
});
