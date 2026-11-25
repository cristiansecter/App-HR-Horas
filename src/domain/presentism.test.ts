import { describe, expect, it } from "vitest";
import { DEFAULT_FLAG_DEFAULTS, flagsOf, isValidLateLimit, monthPerks, normalizeFlagDefaults, type LeaveFlags } from "./presentism";

const leave = (id: string, type: "vacation" | "sick" | "study" | "personal" | "unjustified", a: string, b = a) => ({ id, type, startDate: a, endDate: b });
const none = new Map<string, LeaveFlags>();

describe("valores por defecto", () => {
  it("solo la ausencia injustificada pierde presentismo y premio", () => {
    for (const t of ["vacation", "sick", "study", "personal"] as const) expect(DEFAULT_FLAG_DEFAULTS[t]).toEqual({ losesPresentism: false, losesPrize: false });
    expect(DEFAULT_FLAG_DEFAULTS.unjustified).toEqual({ losesPresentism: true, losesPrize: true });
  });
  it("se leen completos aunque lo guardado falte, esté incompleto o venga roto", () => {
    expect(normalizeFlagDefaults(undefined)).toEqual(DEFAULT_FLAG_DEFAULTS);
    expect(normalizeFlagDefaults({ sick: { losesPresentism: true } }).sick).toEqual({ losesPresentism: true, losesPrize: false });
    expect(normalizeFlagDefaults({ unjustified: { losesPresentism: "si", losesPrize: 1 } }).unjustified).toEqual({ losesPresentism: true, losesPrize: true });
    expect(normalizeFlagDefaults({ vacation: { losesPrize: true } }).vacation).toEqual({ losesPresentism: false, losesPrize: true });
  });
  it("la marca guardada de una licencia manda sobre el valor por defecto", () => {
    const defs = normalizeFlagDefaults({ sick: { losesPresentism: true, losesPrize: true } });
    expect(flagsOf("sick", undefined, defs)).toEqual({ losesPresentism: true, losesPrize: true });
    expect(flagsOf("sick", { losesPresentism: false, losesPrize: false }, defs)).toEqual({ losesPresentism: false, losesPrize: false });
  });
});

describe("monthPerks", () => {
  const base = { flags: none, defaults: DEFAULT_FLAG_DEFAULTS, lateCount: 0, lateLimit: 0 };
  it("sin licencias ni tardanzas no pierde nada", () => {
    expect(monthPerks({ ...base, leaves: [] })).toEqual({ presentism: { lost: false, reasons: [] }, prize: { lost: false, reasons: [] } });
  });
  it("una injustificada hace perder las dos cosas, con el motivo y la fecha", () => {
    const r = monthPerks({ ...base, leaves: [leave("u", "unjustified", "2026-11-12")] });
    expect(r.presentism).toEqual({ lost: true, reasons: ["ausencia injustificada (12/11)"] });
    expect(r.prize).toEqual({ lost: true, reasons: ["ausencia injustificada (12/11)"] });
  });
  it("vacaciones y enfermedad no hacen perder nada por defecto", () => {
    expect(monthPerks({ ...base, leaves: [leave("v", "vacation", "2026-11-02", "2026-11-13"), leave("s", "sick", "2026-11-17")] }).presentism.lost).toBe(false);
  });
  it("una marca a mano pisa el valor por defecto en los dos sentidos", () => {
    const flags = new Map<string, LeaveFlags>([["s", { losesPresentism: true, losesPrize: false }], ["u", { losesPresentism: false, losesPrize: false }]]);
    const r = monthPerks({ ...base, flags, leaves: [leave("s", "sick", "2026-11-17", "2026-11-19"), leave("u", "unjustified", "2026-11-12")] });
    expect(r.presentism.reasons).toEqual(["enfermedad (17/11 al 19/11)"]);
    expect(r.prize.lost).toBe(false);
  });
  it("las tardanzas hacen perder el presentismo al llegar al límite, pero no el premio", () => {
    expect(monthPerks({ ...base, lateCount: 2, lateLimit: 3, leaves: [] }).presentism.lost).toBe(false);
    const r = monthPerks({ ...base, lateCount: 3, lateLimit: 3, leaves: [] });
    expect(r.presentism).toEqual({ lost: true, reasons: ["3 tardanzas en el mes (regla: 3)"] });
    expect(r.prize.lost).toBe(false);
  });
  it("con límite 0 la regla de tardanzas no se aplica", () => {
    expect(monthPerks({ ...base, lateCount: 20, lateLimit: 0, leaves: [] }).presentism.lost).toBe(false);
  });
  it("junta todos los motivos", () => {
    const r = monthPerks({ ...base, lateCount: 4, lateLimit: 3, leaves: [leave("u", "unjustified", "2026-11-12")] });
    expect(r.presentism.reasons).toHaveLength(2);
  });
});

describe("límite de tardanzas", () => {
  it("entero de 0 a 31", () => {
    for (const ok of [0, 1, 3, 31]) expect(isValidLateLimit(ok)).toBe(true);
    for (const bad of [-1, 32, 2.5, NaN]) expect(isValidLateLimit(bad)).toBe(false);
  });
});
