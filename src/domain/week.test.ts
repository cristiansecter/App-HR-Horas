import { describe, expect, it } from "vitest";
import { defaultWorkSchedule } from "./overtime/schedule";
import type { Holiday } from "./overtime/types";
import { expectedHours, mondayOf, weekDates } from "./week";

const holidays = new Map<string, Holiday>([["2026-11-23", { date: "2026-11-23", name: "Soberanía", type: "national", countsAsHoliday: true }]]);

describe("mondayOf", () => {
  it("devuelve el lunes de cualquier día de la semana", () => {
    expect(mondayOf("2026-11-25")).toBe("2026-11-23"); // miércoles
    expect(mondayOf("2026-11-23")).toBe("2026-11-23"); // lunes
    expect(mondayOf("2026-11-29")).toBe("2026-11-23"); // domingo pertenece a la semana que termina
    expect(mondayOf("2026-11-30")).toBe("2026-11-30");
  });
  it("cruza el fin de mes y de año", () => {
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
  });
});

describe("weekDates", () => {
  it("lista lunes a domingo", () => {
    expect(weekDates("2026-12-28")).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  });
});

describe("expectedHours", () => {
  const schedule = defaultWorkSchedule(); // 09:00 a 18:00 con almuerzo 13 a 14
  it("jornada sin almuerzo", () => {
    expect(expectedHours("2026-11-24", schedule, holidays)).toBe(8);
  });
  it("0 en fines de semana y en feriados que cuentan", () => {
    expect(expectedHours("2026-11-28", schedule, holidays)).toBe(0);
    expect(expectedHours("2026-11-23", schedule, holidays)).toBe(0);
  });
});
