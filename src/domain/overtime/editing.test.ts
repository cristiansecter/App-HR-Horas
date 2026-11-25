import { describe, expect, it } from "vitest";
import { isValidClock, nextTierId, normalizeClock } from "./editing";

describe("isValidClock", () => {
  it("acepta horas válidas", () => {
    expect(isValidClock("08:00")).toBe(true);
    expect(isValidClock("8:30")).toBe(true);
    expect(isValidClock("23:59")).toBe(true);
  });
  it("rechaza texto, minutos inválidos y 24:00 salvo como fin", () => {
    expect(isValidClock("ocho")).toBe(false);
    expect(isValidClock("12:60")).toBe(false);
    expect(isValidClock("25:00")).toBe(false);
    expect(isValidClock("24:00")).toBe(false);
    expect(isValidClock("24:00", true)).toBe(true);
    expect(isValidClock("24:30", true)).toBe(false);
  });
});

describe("normalizeClock", () => {
  it("completa el cero inicial", () => {
    expect(normalizeClock("8:30")).toBe("08:30");
    expect(normalizeClock(" 18:00 ")).toBe("18:00");
    expect(normalizeClock("x")).toBe("x");
  });
});

describe("nextTierId", () => {
  const tiers = [{ id: "ot50", label: "Extra 50%", percent: 50 }, { id: "ot100", label: "Extra 100%", percent: 100 }];
  it("arma el id con el porcentaje", () => {
    expect(nextTierId(tiers, 75)).toBe("ot75");
  });
  it("evita repetir ids existentes", () => {
    expect(nextTierId(tiers, 50)).toBe("ot50-2");
    expect(nextTierId([...tiers, { id: "ot50-2", label: "x", percent: 50 }], 50)).toBe("ot50-3");
  });
});
