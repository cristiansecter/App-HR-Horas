import { describe, expect, it } from "vitest";
import { addDays, dayOfWeek, isValidIsoDate } from "../dates";
import { ARGENTINA_HOLIDAYS, holidaysOfYear, movableHolidayDate, toHolidayMap } from "./argentina";

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher) para verificar Carnaval y Semana Santa. */
const easterSunday = (year: number): string => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const dates = (year: number, type: "national" | "optional") => holidaysOfYear(year).filter((h) => h.type === type).map((h) => h.date);

describe("feriados de Argentina", () => {
  it("todas las fechas existen y no hay repetidas", () => {
    const all = ARGENTINA_HOLIDAYS.map((h) => h.date);
    expect(all.every(isValidIsoDate)).toBe(true);
    expect(new Set(all).size).toBe(all.length);
  });

  it("cada año tiene los 16 feriados nacionales de la Ley 27.399", () => {
    expect(dates(2026, "national")).toHaveLength(16);
    expect(dates(2027, "national")).toHaveLength(16);
  });

  it("los días no laborables son optativos y no cuentan como feriado", () => {
    for (const h of ARGENTINA_HOLIDAYS.filter((x) => x.type === "optional")) expect(h.countsAsHoliday).toBe(false);
    for (const h of ARGENTINA_HOLIDAYS.filter((x) => x.type === "national")) expect(h.countsAsHoliday).toBe(true);
  });

  it("Carnaval, Jueves Santo y Viernes Santo coinciden con la Pascua de cada año", () => {
    for (const year of [2026, 2027]) {
      const easter = easterSunday(year);
      const list = holidaysOfYear(year).map((h) => h.date);
      expect(list).toContain(addDays(easter, -48)); // lunes de Carnaval
      expect(list).toContain(addDays(easter, -47)); // martes de Carnaval
      expect(list).toContain(addDays(easter, -2)); // Viernes Santo
    }
    expect(dates(2027, "optional")).toContain(addDays(easterSunday(2027), -3)); // Jueves Santo
  });

  it("la regla de traslado de la ley: martes y miércoles al lunes anterior, jueves y viernes al lunes siguiente", () => {
    expect(movableHolidayDate("2026-06-17")).toBe("2026-06-15"); // miércoles
    expect(movableHolidayDate("2026-11-20")).toBe("2026-11-23"); // viernes
    expect(movableHolidayDate("2026-08-17")).toBe("2026-08-17"); // lunes
    expect(movableHolidayDate("2027-11-20")).toBe("2027-11-20"); // sábado
    expect(movableHolidayDate("2027-06-17")).toBe("2027-06-21"); // jueves
    expect(movableHolidayDate("2027-08-17")).toBe("2027-08-16"); // martes
    expect(movableHolidayDate("2027-10-12")).toBe("2027-10-11"); // martes
  });

  it("los feriados trasladables de 2026 oficiales coinciden con lo que da la regla de la ley", () => {
    const list = dates(2026, "national");
    for (const original of ["2026-06-17", "2026-08-17", "2026-10-12", "2026-11-20"]) {
      expect(list).toContain(movableHolidayDate(original));
    }
  });

  it("los trasladables de 2027 son los que da la regla y quedan marcados para confirmar", () => {
    const toConfirm = holidaysOfYear(2027).filter((h) => h.confirmation === "to_confirm").map((h) => h.date);
    expect(toConfirm).toEqual(["2027-06-21", "2027-08-16", "2027-10-11", "2027-11-20"]);
    expect(toConfirm).toEqual(["2027-06-17", "2027-08-17", "2027-10-12", "2027-11-20"].map(movableHolidayDate));
  });

  it("los feriados fijos de 2027 caen en el día de la semana esperado", () => {
    expect(dayOfWeek("2027-01-01")).toBe(5); // viernes
    expect(dayOfWeek("2027-03-24")).toBe(3); // miércoles
    expect(dayOfWeek("2027-12-25")).toBe(6); // sábado
  });

  it("todavía no hay días turísticos de 2027: falta el decreto", () => {
    expect(dates(2027, "optional")).toEqual(["2027-03-25"]);
  });

  it("el mapa por fecha sirve para el motor de horas extra", () => {
    const map = toHolidayMap(ARGENTINA_HOLIDAYS);
    expect(map.get("2026-11-23")?.countsAsHoliday).toBe(true);
    expect(map.get("2026-12-07")?.countsAsHoliday).toBe(false);
    expect(map.get("2027-02-08")?.name).toBe("Carnaval");
  });
});
