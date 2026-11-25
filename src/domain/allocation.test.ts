import { describe, expect, it } from "vitest";
import { availableHours, deviation, distributeHours, expectedHours, isValidPct, totalPct, workDayHours } from "./allocation";
import { defaultWorkSchedule } from "./overtime/schedule";
import type { Holiday } from "./overtime/types";

const holiday = (date: string): [string, Holiday] => [date, { date, name: "Feriado", type: "national", countsAsHoliday: true }];

describe("workDayHours", () => {
  it("jornada 09:00 a 18:00 con almuerzo de una hora = 8 h", () => expect(workDayHours({ start: "09:00", end: "18:00", lunchStart: "13:00", lunchEnd: "14:00" })).toBe(8));
  it("sin almuerzo cuenta todo", () => expect(workDayHours({ start: "08:00", end: "12:30" })).toBe(4.5));
});

describe("availableHours", () => {
  // Noviembre de 2026: empieza domingo y tiene 30 días → 21 días hábiles de lunes a viernes (del lunes 2 al lunes 30).
  const base = { month: "2026-11", schedule: defaultWorkSchedule(), holidays: new Map<string, Holiday>(), leaves: [] };
  it("21 días hábiles × 8 h = 168 h", () => expect(availableHours(base)).toBe(168));
  it("descuenta feriados que caen en día laborable (y no los de fin de semana)", () => {
    const holidays = new Map([holiday("2026-11-23"), holiday("2026-11-22")]); // lunes y domingo
    expect(availableHours({ ...base, holidays })).toBe(160);
  });
  it("descuenta los días de una licencia aprobada, incluidos los bordes", () => {
    // miércoles 4 a viernes 6 de noviembre = 3 días hábiles
    expect(availableHours({ ...base, leaves: [{ startDate: "2026-11-04", endDate: "2026-11-06" }] })).toBe(144);
  });
  it("una licencia que empieza antes del mes o termina después solo resta los días del mes", () => {
    expect(availableHours({ ...base, leaves: [{ startDate: "2026-10-26", endDate: "2026-11-03" }] })).toBe(168 - 2 * 8); // solo cuentan el lunes 2 y el martes 3
  });
  it("una licencia sobre un feriado no resta dos veces", () => {
    const holidays = new Map([holiday("2026-11-23")]);
    expect(availableHours({ ...base, holidays, leaves: [{ startDate: "2026-11-23", endDate: "2026-11-24" }] })).toBe(168 - 16); // el 23 ya era feriado: solo se suma el 24 de licencia
  });
  it("respeta la jornada propia: media jornada de lunes a viernes = 4 h por día", () => {
    const schedule = defaultWorkSchedule();
    for (const k of ["mon", "tue", "wed", "thu", "fri"] as const) schedule[k] = { start: "09:00", end: "13:00" };
    expect(availableHours({ ...base, schedule })).toBe(84);
  });
  it("una jornada que incluye los sábados los cuenta", () => {
    const schedule = defaultWorkSchedule();
    schedule.sat = { start: "09:00", end: "13:00" };
    expect(availableHours({ ...base, schedule })).toBe(168 + 4 * 4); // 4 sábados
  });
});

describe("expectedHours", () => {
  it("porcentaje de las horas disponibles, de a media hora", () => {
    expect(expectedHours(160, 100)).toBe(160);
    expect(expectedHours(160, 50)).toBe(80);
    expect(expectedHours(152, 25)).toBe(38);
    expect(expectedHours(136, 33)).toBe(45); // 44,88 → 45
  });
  it("un porcentaje fuera de rango se acota", () => {
    expect(expectedHours(160, 250)).toBe(160);
    expect(expectedHours(160, -5)).toBe(0);
  });
});

describe("distributeHours", () => {
  const sumOf = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  it("reparte en proporción al peso", () => {
    const r = distributeHours(100, [{ id: "a", weight: 50 }, { id: "b", weight: 30 }, { id: "c", weight: 20 }]);
    expect([...r.entries()]).toEqual([["a", 50], ["b", 30], ["c", 20]]);
  });
  it("partes iguales cuando todos pesan 0", () => {
    const r = distributeHours(90, [{ id: "a", weight: 0 }, { id: "b", weight: 0 }, { id: "c", weight: 0 }]);
    expect([...r.values()]).toEqual([30, 30, 30]);
  });
  it("no pierde horas por el redondeo: la suma da exactamente el total", () => {
    for (const total of [100, 101, 37.5, 160, 1, 0.5]) {
      const r = distributeHours(total, [{ id: "a", weight: 1 }, { id: "b", weight: 1 }, { id: "c", weight: 1 }]);
      expect(sumOf(r)).toBeCloseTo(total, 10);
      expect([...r.values()].every((h) => h * 2 === Math.round(h * 2))).toBe(true); // múltiplos de 0,5
    }
  });
  it("lo que sobra va a quien tiene el mayor resto, y a igualdad al primero de la lista", () => {
    // 10 h entre 3 iguales = 20 unidades de media hora: 7+7+6 → las dos sobrantes van a los dos primeros
    const r = distributeHours(10, [{ id: "a", weight: 1 }, { id: "b", weight: 1 }, { id: "c", weight: 1 }]);
    expect([...r.values()]).toEqual([3.5, 3.5, 3]);
  });
  it("una persona con peso 0 entre otras con peso recibe 0", () => {
    const r = distributeHours(40, [{ id: "a", weight: 0 }, { id: "b", weight: 100 }]);
    expect(r.get("a")).toBe(0);
    expect(r.get("b")).toBe(40);
  });
  it("sin personas o sin horas devuelve ceros", () => {
    expect(distributeHours(40, []).size).toBe(0);
    expect([...distributeHours(0, [{ id: "a", weight: 1 }]).values()]).toEqual([0]);
    expect([...distributeHours(-5, [{ id: "a", weight: 1 }]).values()]).toEqual([0]);
  });
});

describe("desvío, suma de porcentajes y validación", () => {
  it("desvío = trabajado − proyectado", () => {
    expect(deviation(42.5, 40)).toBe(2.5);
    expect(deviation(30, 40)).toBe(-10);
  });
  it("suma de dedicaciones", () => expect(totalPct([60, 50, 20])).toBe(130));
  it("porcentaje válido: entero de 1 a 100", () => {
    expect([1, 50, 100].every(isValidPct)).toBe(true);
    expect([0, 101, 12.5, -3, NaN].some(isValidPct)).toBe(false);
  });
});
