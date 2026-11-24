import { describe, expect, it } from "vitest";
import { addDays, dateInBuenosAires, dayOfWeek, isValidIsoDate, noonMsBuenosAires } from "./dates";

describe("fechas", () => {
  it("calcula el día de la semana sin depender de la zona horaria", () => {
    expect(dayOfWeek("2026-11-23")).toBe(1); // lunes
    expect(dayOfWeek("2026-11-28")).toBe(6); // sábado
    expect(dayOfWeek("2026-11-29")).toBe(0); // domingo
  });

  it("suma días cruzando fin de mes y de año", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("rechaza fechas mal escritas o inexistentes", () => {
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("24/11/2026")).toBe(false);
    expect(isValidIsoDate("2026-11-24")).toBe(true);
    expect(() => dayOfWeek("2026-13-01")).toThrow();
  });

  it("después de las 21:00 en Buenos Aires la fecha local sigue siendo la de hoy (toISOString ya diría mañana)", () => {
    const instant = new Date("2026-11-25T02:30:00Z"); // 23:30 del 24/11 en Buenos Aires
    expect(instant.toISOString().slice(0, 10)).toBe("2026-11-25");
    expect(dateInBuenosAires(instant)).toBe("2026-11-24");
  });

  it("el mediodía de Buenos Aires es 15:00 UTC", () => {
    expect(noonMsBuenosAires("2026-11-24")).toBe(Date.parse("2026-11-24T15:00:00Z"));
  });
});
