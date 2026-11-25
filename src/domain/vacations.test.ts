import { describe, expect, it } from "vitest";
import { completedYears, daysBetween, daysInYear, vacationBalance, vacationEntitlement, weekdaysBetween } from "./vacations";

describe("fechas", () => {
  it("días entre fechas y años cumplidos", () => {
    expect(daysBetween("2026-11-25", "2026-12-05")).toBe(10);
    expect(daysBetween("2026-12-05", "2026-11-25")).toBe(-10);
    expect(completedYears("2020-03-01", "2026-12-31")).toBe(6);
    expect(completedYears("2021-12-31", "2026-12-31")).toBe(5);
    expect(completedYears("2021-12-31", "2026-12-30")).toBe(4);
    expect(completedYears("2027-01-01", "2026-12-31")).toBe(0);
  });
  it("días de lunes a viernes, extremos incluidos", () => {
    expect(weekdaysBetween("2026-11-23", "2026-11-27")).toBe(5);
    expect(weekdaysBetween("2026-11-21", "2026-11-22")).toBe(0);
    expect(weekdaysBetween("2026-11-20", "2026-11-23")).toBe(2);
  });
});

describe("vacationEntitlement (días corridos según la antigüedad al 31/12)", () => {
  it("14 hasta 5 años, 21 de 5 a 10, 28 de 10 a 20 y 35 de más de 20", () => {
    expect(vacationEntitlement("2023-03-01", 2026).days).toBe(14); // 3 años
    expect(vacationEntitlement("2021-12-31", 2026).days).toBe(21); // justo 5 años al 31/12
    expect(vacationEntitlement("2021-12-30", 2026).days).toBe(21);
    expect(vacationEntitlement("2020-03-01", 2026).days).toBe(21); // 6 años
    expect(vacationEntitlement("2016-01-01", 2026).days).toBe(28); // 10 años
    expect(vacationEntitlement("2006-06-01", 2026).days).toBe(35); // 20 años
  });
  it("quien ingresa antes de empezar el año tiene el año completo", () => {
    expect(vacationEntitlement("2026-01-01", 2026)).toEqual({ days: 14, prorated: false });
  });
  it("quien ingresa en la primera mitad del año tiene el año completo; en la segunda, proporcional", () => {
    expect(vacationEntitlement("2026-03-02", 2026)).toEqual({ days: 14, prorated: false });
    const late = vacationEntitlement("2026-10-01", 2026); // ~64 días de lunes a viernes → 3 días (1 cada 20)
    expect(late.prorated).toBe(true);
    expect(late.days).toBe(3);
  });
  it("quien todavía no ingresó ese año no tiene días", () => {
    expect(vacationEntitlement("2027-02-01", 2026)).toEqual({ days: 0, prorated: false });
  });
});

describe("daysInYear", () => {
  it("cuenta solo los días del año, también si el período cruza el fin de año", () => {
    expect(daysInYear("2026-12-28", "2027-01-04", 2026)).toBe(4);
    expect(daysInYear("2026-12-28", "2027-01-04", 2027)).toBe(4);
    expect(daysInYear("2026-07-01", "2026-07-14", 2026)).toBe(14);
    expect(daysInYear("2025-07-01", "2025-07-14", 2026)).toBe(0);
  });
});

describe("vacationBalance", () => {
  const leaves = [
    { type: "vacation", status: "approved", startDate: "2026-01-12", endDate: "2026-01-25" }, // 14
    { type: "vacation", status: "pending", startDate: "2026-12-14", endDate: "2026-12-18" }, // 5
    { type: "vacation", status: "rejected", startDate: "2026-06-01", endDate: "2026-06-30" }, // no cuenta
    { type: "sick", status: "approved", startDate: "2026-03-01", endDate: "2026-03-05" }, // no es vacación
  ];
  it("descuenta lo aprobado y lo pedido, y no cuenta rechazadas ni otras licencias", () => {
    expect(vacationBalance("2020-03-01", 2026, leaves)).toEqual({ year: 2026, entitled: 21, prorated: false, taken: 14, pending: 5, remaining: 2 });
  });
  it("el saldo no baja de cero", () => {
    expect(vacationBalance("2023-03-01", 2026, [{ type: "vacation", status: "approved", startDate: "2026-01-01", endDate: "2026-03-01" }]).remaining).toBe(0);
  });
});
