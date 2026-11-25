import { describe, expect, it } from "vitest";
import { nextPref, parsePref, resolveMode } from "./colorMode";

describe("modo de color", () => {
  it("lo guardado inválido o ausente vale automático", () => {
    expect(parsePref(null)).toBe("system");
    expect(parsePref("azul")).toBe("system");
    expect(parsePref(undefined)).toBe("system");
    expect(parsePref("light")).toBe("light");
    expect(parsePref("dark")).toBe("dark");
  });
  it("automático sigue al sistema; claro y oscuro son fijos", () => {
    expect(resolveMode("system", true)).toBe("dark");
    expect(resolveMode("system", false)).toBe("light");
    expect(resolveMode("light", true)).toBe("light");
    expect(resolveMode("dark", false)).toBe("dark");
  });
  it("el botón rota automático → claro → oscuro → automático", () => {
    expect(nextPref("system")).toBe("light");
    expect(nextPref("light")).toBe("dark");
    expect(nextPref("dark")).toBe("system");
  });
});
