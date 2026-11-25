import { describe, expect, it } from "vitest";
import { defaultWorkSchedule } from "../overtime/schedule";
import type { Holiday } from "../overtime/types";
import { countLeaveDays, formatLeaveDays, InvalidLeaveError, leaveDaysInRange, rangesOverlap } from "./days";

const schedule = defaultWorkSchedule(); // lunes a viernes
const holidays = new Map<string, Holiday>([
  ["2026-11-23", { date: "2026-11-23", name: "Soberanía", type: "national", countsAsHoliday: true }],
  ["2026-12-07", { date: "2026-12-07", name: "Puente", type: "optional", countsAsHoliday: false }],
]);

describe("countLeaveDays", () => {
  it("vacaciones: días corridos, con fines de semana y feriados", () => {
    expect(countLeaveDays("vacation", "2026-11-24", "2026-12-07", schedule, holidays)).toBe(14);
    expect(countLeaveDays("vacation", "2027-01-11", "2027-01-24", schedule, holidays)).toBe(14);
  });
  it("un solo día cuenta 1", () => {
    expect(countLeaveDays("vacation", "2026-11-24", "2026-11-24", schedule, holidays)).toBe(1);
    expect(countLeaveDays("study", "2026-11-24", "2026-11-24", schedule, holidays)).toBe(1);
  });
  it("el resto: días hábiles de la jornada, sin fines de semana ni feriados", () => {
    // lun 23 (feriado) a vie 27 = 4 hábiles; sáb 28 y dom 29 no cuentan.
    expect(countLeaveDays("sick", "2026-11-23", "2026-11-29", schedule, holidays)).toBe(4);
  });
  it("un día no laborable optativo cuenta como hábil", () => {
    expect(countLeaveDays("personal", "2026-12-07", "2026-12-07", schedule, holidays)).toBe(1);
  });
  it("respeta la jornada propia de la persona (trabaja el sábado)", () => {
    const saturdays = { ...schedule, sat: { start: "09:00", end: "13:00" } };
    expect(countLeaveDays("unjustified", "2026-11-28", "2026-11-28", saturdays, holidays)).toBe(1);
    expect(countLeaveDays("unjustified", "2026-11-28", "2026-11-28", schedule, holidays)).toBe(0);
  });
  it("rechaza fechas inválidas, invertidas o demasiado largas", () => {
    expect(() => countLeaveDays("vacation", "2026-02-30", "2026-03-01", schedule, holidays)).toThrow(InvalidLeaveError);
    expect(() => countLeaveDays("vacation", "2026-11-25", "2026-11-24", schedule, holidays)).toThrow(/anterior/);
    expect(() => countLeaveDays("vacation", "2026-01-01", "2028-01-01", schedule, holidays)).toThrow(/más de un año/);
  });
});

describe("leaveDaysInRange", () => {
  it("cuenta solo los días dentro del período", () => {
    // Vacaciones del 24/11 al 07/12: en noviembre caen 7 días (24 a 30).
    expect(leaveDaysInRange("vacation", "2026-11-24", "2026-12-07", "2026-11-01", "2026-11-30", schedule, holidays)).toBe(7);
    expect(leaveDaysInRange("vacation", "2026-11-24", "2026-12-07", "2026-12-01", "2026-12-31", schedule, holidays)).toBe(7);
  });
  it("devuelve 0 si no se toca el período", () => {
    expect(leaveDaysInRange("sick", "2026-10-05", "2026-10-06", "2026-11-01", "2026-11-30", schedule, holidays)).toBe(0);
  });
});

describe("rangesOverlap", () => {
  it("detecta superposición con extremos incluidos", () => {
    expect(rangesOverlap("2026-11-01", "2026-11-10", "2026-11-10", "2026-11-12")).toBe(true);
    expect(rangesOverlap("2026-11-01", "2026-11-10", "2026-11-11", "2026-11-12")).toBe(false);
  });
});

describe("formatLeaveDays", () => {
  it("usa singular y plural según el tipo", () => {
    expect(formatLeaveDays(1, "vacation")).toBe("1 día corrido");
    expect(formatLeaveDays(7, "vacation")).toBe("7 días corridos");
    expect(formatLeaveDays(1, "study")).toBe("1 día hábil");
    expect(formatLeaveDays(3, "sick")).toBe("3 días hábiles");
  });
});
