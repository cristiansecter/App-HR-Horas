import { describe, expect, it } from "vitest";
import { checkCuil, checkDni, cuilCheckDigit, formatCuil, formatDni } from "./identity";

describe("CUIL", () => {
  it("calcula el dígito verificador", () => {
    expect(cuilCheckDigit("2012345678")).toBe(6); // 20-12345678-6
    expect(cuilCheckDigit("2730111222")).toBe(5); // suma 83 → resto 6 → 11-6 = 5
    expect(cuilCheckDigit("3071234567")).toBe(1); // suma 142 → resto 10 → 11-10 = 1
  });
  it("casos especiales del dígito: resto 0 da 0 y resto 1 da 9", () => {
    expect(cuilCheckDigit("2000000006")).toBe(0); // suma múltiplo de 11 → 11-0 = 11 → 0
    expect(cuilCheckDigit("2000000001")).toBe(9); // resto 1 → 11-1 = 10 → 9
  });
  it("da formato con guiones", () => {
    expect(formatCuil("20123456786")).toBe("20-12345678-6");
    expect(formatCuil(" 20-12345678-6 ")).toBe("20-12345678-6");
    expect(formatCuil("123")).toBe("123");
  });
  it("vacío es válido: el dato es opcional", () => {
    expect(checkCuil("  ")).toEqual({ ok: true, formatted: "" });
  });
  it("uno correcto pasa y queda formateado", () => {
    expect(checkCuil("20123456786")).toEqual({ ok: true, formatted: "20-12345678-6" });
  });
  it("con otra cantidad de dígitos es un error que impide guardar", () => {
    expect(checkCuil("20-1234-6")).toMatchObject({ ok: false, blocking: true });
  });
  it("con dígito verificador incorrecto es solo un aviso", () => {
    expect(checkCuil("20-12345678-5")).toMatchObject({ ok: false, blocking: false, formatted: "20-12345678-5" });
  });
});

describe("DNI", () => {
  it("formatea con puntos", () => {
    expect(formatDni("12345678")).toBe("12.345.678");
    expect(formatDni("1234567")).toBe("1.234.567");
    expect(formatDni("12.345.678")).toBe("12.345.678");
  });
  it("valida 7 u 8 dígitos", () => {
    expect(checkDni("")).toEqual({ ok: true, formatted: "" });
    expect(checkDni("30111222")).toEqual({ ok: true, formatted: "30.111.222" });
    expect(checkDni("123")).toMatchObject({ ok: false });
    expect(checkDni("123456789")).toMatchObject({ ok: false });
  });
});
