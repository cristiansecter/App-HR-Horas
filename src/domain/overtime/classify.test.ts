import { describe, expect, it } from "vitest";
import { classifyEntry, InvalidEntryError } from "./classify";
import { defaultOvertimeConfig, saturdayRules, validateOvertimeConfig } from "./config";
import { defaultWorkSchedule, validateWorkSchedule } from "./schedule";
import type { ClassificationContext, EntryInput, Holiday, OvertimeConfig, WorkSchedule } from "./types";

// Calendario de los tests (2026): 23/11 lunes feriado nacional, 24/11 martes, 27/11 viernes,
// 28/11 sábado, 29/11 domingo, 30/11 lunes. 7/12 lunes es un día no laborable optativo.
const holidays = new Map<string, Holiday>([
  ["2026-11-23", { date: "2026-11-23", name: "Soberanía Nacional", type: "national", countsAsHoliday: true }],
  ["2026-12-07", { date: "2026-12-07", name: "Día no laborable con fines turísticos", type: "optional", countsAsHoliday: false }],
]);

const ctx = (over: Partial<ClassificationContext> = {}): ClassificationContext => ({
  schedule: defaultWorkSchedule(),
  holidays,
  config: defaultOvertimeConfig(),
  ...over,
});

const entry = (date: string, startTime: string, endTime: string, isOnCall = false): EntryInput => ({ date, startTime, endTime, isOnCall });

const mins = (e: EntryInput, c: ClassificationContext = ctx()) => classifyEntry(e, c).minutes;

describe("jornada normal", () => {
  it("09:00 a 18:00 descuenta el almuerzo que el registro cubre: 8 horas normales", () => {
    const r = classifyEntry(entry("2026-11-24", "09:00", "18:00"), ctx());
    expect(r.minutes).toEqual({ normal: 480 });
    expect(r.hours).toBe(8);
    expect(r.breakdown).toEqual({ normal: 8 });
  });

  it("un registro de la mañana (09:00 a 13:00) son 4 horas normales", () => {
    expect(mins(entry("2026-11-24", "09:00", "13:00"))).toEqual({ normal: 240 });
  });

  it("dos registros que no tocan el almuerzo suman la jornada completa", () => {
    const am = mins(entry("2026-11-24", "09:00", "13:00"));
    const pm = mins(entry("2026-11-24", "14:00", "18:00"));
    expect((am.normal ?? 0) + (pm.normal ?? 0)).toBe(480);
  });
});

describe("horas extra entre semana", () => {
  it("hasta las 21:00: 8 normales y 3 al 50%", () => {
    expect(mins(entry("2026-11-24", "09:00", "21:00"))).toEqual({ normal: 480, ot50: 180 });
  });

  it("hasta las 23:00: 8 normales, 3 al 50% y 2 al 100%", () => {
    const r = classifyEntry(entry("2026-11-24", "09:00", "23:00"), ctx());
    expect(r.minutes).toEqual({ normal: 480, ot50: 180, ot100: 120 });
    expect(r.hours).toBe(13);
  });

  it("antes de la jornada: de 07:00 a 09:00 son 1 hora al 100% (antes de las 08:00) y 1 al 50%", () => {
    expect(mins(entry("2026-11-24", "07:00", "09:00"))).toEqual({ ot100: 60, ot50: 60 });
  });

  it("los límites de franja son exactos: 18:00 a 21:00 es todo 50% y 21:00 a 21:30 es 100%", () => {
    expect(mins(entry("2026-11-24", "18:00", "21:00"))).toEqual({ ot50: 180 });
    expect(mins(entry("2026-11-24", "21:00", "21:30"))).toEqual({ ot100: 30 });
  });

  it("salir una hora después de la jornada, en horario diurno, es 1 hora al 50%", () => {
    const schedule: WorkSchedule = { ...defaultWorkSchedule(), tue: { start: "08:00", end: "16:00", lunchStart: "12:00", lunchEnd: "13:00" } };
    expect(mins(entry("2026-11-24", "08:00", "17:00"), ctx({ schedule }))).toEqual({ normal: 420, ot50: 60 });
  });

  it("un empleado sin jornada ese día (martes sin horario) cobra todo como extra del tramo diurno", () => {
    const schedule: WorkSchedule = { ...defaultWorkSchedule(), tue: null };
    expect(mins(entry("2026-11-24", "09:00", "11:00"), ctx({ schedule }))).toEqual({ ot50: 120 });
  });
});

describe("almuerzo", () => {
  it("cubierto por completo se descuenta; trabajarlo en un registro propio es hora extra", () => {
    expect(mins(entry("2026-11-24", "13:00", "14:00"))).toEqual({ ot50: 60 });
  });

  it("cubierto solo en parte no se descuenta: 09:00 a 13:30 son 4 normales y 30 minutos fuera de la jornada", () => {
    expect(mins(entry("2026-11-24", "09:00", "13:30"))).toEqual({ normal: 240, ot50: 30 });
  });

  it("un registro que solo toca el borde del almuerzo no lo descuenta: no desaparece tiempo trabajado", () => {
    expect(mins(entry("2026-11-24", "09:00", "14:00"))).toEqual({ normal: 240, ot50: 60 });
    expect(mins(entry("2026-11-24", "13:00", "15:00"))).toEqual({ ot50: 60, normal: 60 });
  });

  it("una jornada sin almuerzo cuenta todo el tramo", () => {
    const schedule: WorkSchedule = { ...defaultWorkSchedule(), tue: { start: "09:00", end: "17:00" } };
    expect(mins(entry("2026-11-24", "09:00", "17:00"), ctx({ schedule }))).toEqual({ normal: 480 });
  });
});

describe("sábado", () => {
  it("modo plano: todo el sábado al 50%", () => {
    expect(mins(entry("2026-11-28", "09:00", "13:00"))).toEqual({ ot50: 240 });
    expect(mins(entry("2026-11-28", "11:00", "15:00"))).toEqual({ ot50: 240 });
  });

  it("modo ley (art. 201): 50% hasta las 13:00 y 100% desde las 13:00", () => {
    const config = defaultOvertimeConfig({ saturdayMode: "lct" });
    expect(mins(entry("2026-11-28", "11:00", "15:00"), ctx({ config }))).toEqual({ ot50: 120, ot100: 120 });
  });

  it("un empleado con sábado en su jornada trabaja horas normales ese día", () => {
    const schedule: WorkSchedule = { ...defaultWorkSchedule(), sat: { start: "09:00", end: "13:00" } };
    expect(mins(entry("2026-11-28", "09:00", "13:00"), ctx({ schedule }))).toEqual({ normal: 240 });
  });
});

describe("domingo y feriados", () => {
  it("domingo: todo al 100%", () => {
    expect(mins(entry("2026-11-29", "10:00", "12:00"))).toEqual({ ot100: 120 });
  });

  it("un empleado con domingo en su jornada trabaja horas normales", () => {
    const schedule: WorkSchedule = { ...defaultWorkSchedule(), sun: { start: "10:00", end: "14:00" } };
    expect(mins(entry("2026-11-29", "10:00", "14:00"), ctx({ schedule }))).toEqual({ normal: 240 });
  });

  it("feriado nacional: todo al 100%, aunque sea lunes y tenga jornada, y sin descontar almuerzo", () => {
    const r = classifyEntry(entry("2026-11-23", "09:00", "18:00"), ctx());
    expect(r.minutes).toEqual({ ot100: 540 });
    expect(r.segments).toEqual([{ date: "2026-11-23", from: "09:00", to: "18:00", dayType: "holiday", category: "ot100" }]);
  });

  it("día no laborable optativo que no cuenta como feriado: se trata como día hábil", () => {
    expect(mins(entry("2026-12-07", "09:00", "18:00"))).toEqual({ normal: 480 });
  });

  it("si la empresa decide que el día optativo cuenta como feriado, va al 100%", () => {
    const withOptional = new Map(holidays);
    withOptional.set("2026-12-07", { ...holidays.get("2026-12-07")!, countsAsHoliday: true });
    expect(mins(entry("2026-12-07", "09:00", "18:00"), ctx({ holidays: withOptional }))).toEqual({ ot100: 540 });
  });
});

describe("cruce de medianoche", () => {
  it("viernes 22:00 a sábado 02:00: 2 horas al 100% (viernes noche) y 2 al 50% (sábado)", () => {
    const r = classifyEntry(entry("2026-11-27", "22:00", "02:00"), ctx());
    expect(r.minutes).toEqual({ ot100: 120, ot50: 120 });
    expect(r.segments).toEqual([
      { date: "2026-11-27", from: "22:00", to: "24:00", dayType: "weekday", category: "ot100" },
      { date: "2026-11-28", from: "00:00", to: "02:00", dayType: "saturday", category: "ot50" },
    ]);
  });

  it("sábado 23:00 a domingo 01:00: 1 hora al 50% y 1 al 100%", () => {
    expect(mins(entry("2026-11-28", "23:00", "01:00"))).toEqual({ ot50: 60, ot100: 60 });
  });

  it("domingo 23:00 a lunes feriado 01:00 usa el tipo de día de cada fecha", () => {
    expect(mins(entry("2026-11-22", "23:00", "01:00"))).toEqual({ ot100: 120 });
  });

  it("terminar justo a la medianoche (hasta 00:00) no crea un tramo vacío", () => {
    const r = classifyEntry(entry("2026-11-24", "21:00", "00:00"), ctx());
    expect(r.minutes).toEqual({ ot100: 180 });
    expect(r.segments).toHaveLength(1);
  });
});

describe("guardia", () => {
  it("con la opción encendida cuenta entera como normal y queda marcada", () => {
    const r = classifyEntry(entry("2026-11-29", "22:00", "06:00", true), ctx());
    expect(r.minutes).toEqual({ normal: 480 });
    expect(r.onCallMinutes).toBe(480);
  });

  it("con la opción apagada se clasifica con las reglas generales y igual queda marcada", () => {
    const config: OvertimeConfig = { ...defaultOvertimeConfig(), onCallCountsAsNormal: false };
    const r = classifyEntry(entry("2026-11-29", "22:00", "06:00", true), ctx({ config }));
    expect(r.minutes).toEqual({ ot100: 480 });
    expect(r.onCallMinutes).toBe(480);
  });

  it("una guardia no descuenta almuerzo", () => {
    expect(classifyEntry(entry("2026-11-24", "09:00", "18:00", true), ctx()).minutes).toEqual({ normal: 540 });
  });

  it("un registro sin guardia no suma minutos de guardia", () => {
    expect(classifyEntry(entry("2026-11-24", "09:00", "18:00"), ctx()).onCallMinutes).toBe(0);
  });
});

describe("tramos configurables por empresa", () => {
  it("una empresa que paga todo al 75% usa su propio tramo", () => {
    const config: OvertimeConfig = {
      tiers: [{ id: "ot75", label: "Extra 75%", percent: 75 }],
      rules: (["weekday", "saturday", "sunday", "holiday"] as const).map((dayType) => ({ dayType, from: "00:00", to: "24:00", tierId: "ot75" })),
      onCallCountsAsNormal: true,
    };
    expect(validateOvertimeConfig(config)).toEqual([]);
    expect(mins(entry("2026-11-24", "09:00", "23:00"), ctx({ config }))).toEqual({ normal: 480, ot75: 300 });
  });

  it("falla con un mensaje claro si la configuración deja franjas sin cubrir", () => {
    const config: OvertimeConfig = { ...defaultOvertimeConfig(), rules: defaultOvertimeConfig().rules.filter((r) => !(r.dayType === "weekday" && r.from === "18:00")) };
    expect(() => classifyEntry(entry("2026-11-24", "18:00", "20:00"), ctx({ config }))).toThrow(/no cubre el weekday entre las 18:00 y las 20:00/);
  });
});

describe("totales y redondeo", () => {
  it("guarda minutos exactos y horas con 2 decimales", () => {
    const r = classifyEntry(entry("2026-11-24", "18:00", "18:20"), ctx());
    expect(r.totalMinutes).toBe(20);
    expect(r.hours).toBe(0.33);
    expect(r.breakdown).toEqual({ ot50: 0.33 });
  });

  it("la suma de minutos por categoría siempre es igual al total", () => {
    const r = classifyEntry(entry("2026-11-24", "06:45", "23:50"), ctx());
    expect(Object.values(r.minutes).reduce((a, b) => a + b, 0)).toBe(r.totalMinutes);
  });

  it("une tramos contiguos de la misma categoría en el detalle", () => {
    const r = classifyEntry(entry("2026-11-24", "09:00", "13:00"), ctx());
    expect(r.segments).toEqual([{ date: "2026-11-24", from: "09:00", to: "13:00", dayType: "weekday", category: "normal" }]);
  });
});

describe("registros inválidos", () => {
  it("hora desde igual a hora hasta", () => {
    expect(() => classifyEntry(entry("2026-11-24", "09:00", "09:00"), ctx())).toThrow(InvalidEntryError);
  });

  it("formato de hora incorrecto", () => {
    expect(() => classifyEntry(entry("2026-11-24", "9:00", "18:00"), ctx())).toThrow(InvalidEntryError);
    expect(() => classifyEntry(entry("2026-11-24", "09:00", "25:00"), ctx())).toThrow(InvalidEntryError);
  });

  it("fecha inexistente", () => {
    expect(() => classifyEntry(entry("2026-02-30", "09:00", "18:00"), ctx())).toThrow(InvalidEntryError);
  });
});

describe("validación de la configuración y de la jornada", () => {
  it("la configuración por defecto es válida en los dos modos de sábado", () => {
    expect(validateOvertimeConfig(defaultOvertimeConfig())).toEqual([]);
    expect(validateOvertimeConfig(defaultOvertimeConfig({ saturdayMode: "lct" }))).toEqual([]);
  });

  it("detecta franjas sin cubrir, superpuestas y tramos inexistentes", () => {
    const base = defaultOvertimeConfig();
    const gap = { ...base, rules: base.rules.filter((r) => r.dayType !== "sunday") };
    expect(validateOvertimeConfig(gap).join(" ")).toMatch(/domingo: falta una regla entre las 00:00 y las 24:00/);

    const overlap = { ...base, rules: [...base.rules, { dayType: "sunday" as const, from: "10:00", to: "12:00", tierId: "ot50" }] };
    expect(validateOvertimeConfig(overlap).join(" ")).toMatch(/domingo: hay franjas que se superponen/);

    const unknown = { ...base, rules: base.rules.map((r) => (r.dayType === "holiday" ? { ...r, tierId: "ot999" } : r)) };
    expect(validateOvertimeConfig(unknown).join(" ")).toMatch(/tramo que no existe \("ot999"\)/);
  });

  it("las reglas del sábado en modo ley dividen el día a las 13:00", () => {
    expect(saturdayRules("lct")).toEqual([
      { dayType: "saturday", from: "00:00", to: "13:00", tierId: "ot50" },
      { dayType: "saturday", from: "13:00", to: "24:00", tierId: "ot100" },
    ]);
  });

  it("la jornada por defecto es válida y detecta salida anterior a la entrada o almuerzo fuera de la jornada", () => {
    expect(validateWorkSchedule(defaultWorkSchedule())).toEqual([]);
    const bad: WorkSchedule = {
      ...defaultWorkSchedule(),
      mon: { start: "18:00", end: "09:00" },
      tue: { start: "09:00", end: "17:00", lunchStart: "17:00", lunchEnd: "18:00" },
      wed: { start: "09:00", end: "17:00", lunchStart: "12:00" },
    };
    const errors = validateWorkSchedule(bad).join(" ");
    expect(errors).toMatch(/mon: la salida debe ser posterior/);
    expect(errors).toMatch(/tue: el almuerzo debe estar dentro de la jornada/);
    expect(errors).toMatch(/wed: el almuerzo necesita inicio y fin/);
  });
});
