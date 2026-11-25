import { describe, expect, it } from "vitest";
import { clockToMinutes, dayStatus, DEFAULT_LATE_TOLERANCE_MIN, isValidTolerance, minutesOfDayBA, minutesToClock, summarizeMonth, type AttendanceMark } from "./attendance";
import { defaultWorkSchedule } from "./overtime/schedule";
import type { Holiday } from "./overtime/types";

const schedule = defaultWorkSchedule(); // lunes a viernes, 09:00 a 18:00
const holidays = new Map<string, Holiday>([["2026-11-23", { date: "2026-11-23", name: "Soberanía", type: "national", countsAsHoliday: true }]]);
const mark = (date: string, arrival: string, over: Partial<AttendanceMark> = {}): AttendanceMark => ({ userId: "emi", date, arrivalMinutes: clockToMinutes(arrival), source: "self", markedBy: "emi", ...over });
const base = { today: "2026-11-25", schedule, holidays, leaves: [], toleranceMin: 10 };

describe("hora en minutos", () => {
  it("convierte ida y vuelta", () => {
    expect(clockToMinutes("09:05")).toBe(545);
    expect(minutesToClock(545)).toBe("09:05");
    expect(minutesToClock(0)).toBe("00:00");
    expect(minutesToClock(1439)).toBe("23:59");
  });
  it("minutos del día en Buenos Aires (UTC−3, sin horario de verano)", () => {
    expect(minutesOfDayBA(new Date("2026-11-25T12:05:00Z"))).toBe(9 * 60 + 5);
    expect(minutesOfDayBA(new Date("2026-11-25T02:30:00Z"))).toBe(23 * 60 + 30); // el día anterior en Buenos Aires
    expect(minutesOfDayBA(new Date("2026-11-25T03:00:00Z"))).toBe(0);
  });
});

describe("dayStatus", () => {
  it("un día laborable con marca a horario está presente", () => {
    const s = dayStatus({ ...base, date: "2026-11-24", mark: mark("2026-11-24", "08:55") });
    expect(s).toMatchObject({ kind: "present", lateMinutes: 0, arrivalMinutes: 535 });
  });
  it("hasta la tolerancia no es tarde; pasada la tolerancia sí, con los minutos reales", () => {
    expect(dayStatus({ ...base, date: "2026-11-24", mark: mark("2026-11-24", "09:10") }).kind).toBe("present");
    const late = dayStatus({ ...base, date: "2026-11-24", mark: mark("2026-11-24", "09:11") });
    expect(late.kind).toBe("late");
    expect(late.lateMinutes).toBe(11);
  });
  it("con tolerancia 0 cualquier minuto de atraso cuenta", () => {
    expect(dayStatus({ ...base, toleranceMin: 0, date: "2026-11-24", mark: mark("2026-11-24", "09:01") }).kind).toBe("late");
    expect(dayStatus({ ...base, toleranceMin: 0, date: "2026-11-24", mark: mark("2026-11-24", "09:00") }).kind).toBe("present");
  });
  it("la tardanza se mide contra el inicio de la jornada de la persona (no un horario fijo)", () => {
    const early = defaultWorkSchedule();
    early.tue = { start: "07:00", end: "15:00" };
    expect(dayStatus({ ...base, schedule: early, date: "2026-11-24", mark: mark("2026-11-24", "07:30") })).toMatchObject({ kind: "late", lateMinutes: 30 });
  });
  it("sin marca: ayer es 'sin registro', hoy es 'pendiente' y mañana es futuro", () => {
    expect(dayStatus({ ...base, date: "2026-11-24" }).kind).toBe("missing");
    expect(dayStatus({ ...base, date: "2026-11-25" }).kind).toBe("pending");
    expect(dayStatus({ ...base, date: "2026-11-26" }).kind).toBe("future");
  });
  it("fines de semana y feriados no son días de asistencia", () => {
    expect(dayStatus({ ...base, date: "2026-11-21" }).kind).toBe("nonworking"); // sábado
    expect(dayStatus({ ...base, date: "2026-11-22" }).kind).toBe("nonworking"); // domingo
    expect(dayStatus({ ...base, date: "2026-11-23" }).kind).toBe("holiday");
  });
  it("una licencia aprobada cubre el día; la injustificada se distingue", () => {
    const leaves = [{ type: "sick" as const, startDate: "2026-11-24", endDate: "2026-11-24" }];
    expect(dayStatus({ ...base, leaves, date: "2026-11-24" })).toMatchObject({ kind: "leave", leaveType: "sick" });
    const unj = [{ type: "unjustified" as const, startDate: "2026-11-24", endDate: "2026-11-24" }];
    expect(dayStatus({ ...base, leaves: unj, date: "2026-11-24" }).kind).toBe("unjustified");
  });
  it("si hay marca y licencia el mismo día, manda la marca (fue a trabajar)", () => {
    const leaves = [{ type: "vacation" as const, startDate: "2026-11-24", endDate: "2026-11-24" }];
    expect(dayStatus({ ...base, leaves, date: "2026-11-24", mark: mark("2026-11-24", "09:00") }).kind).toBe("present");
  });
  it("una marca en un día no laborable no cambia que no sea laborable", () => {
    expect(dayStatus({ ...base, date: "2026-11-21", mark: mark("2026-11-21", "10:00") }).kind).toBe("nonworking");
  });
});

describe("summarizeMonth", () => {
  // Noviembre 2026: 21 días hábiles (2 al 30) menos el feriado del 23 = 20. Hoy es el 25: cuentan hasta el 25.
  const args = { month: "2026-11", ...base, marks: [] as AttendanceMark[] };
  it("sin ninguna marca: todos los días pasados quedan 'sin registro' y hoy pendiente", () => {
    const s = summarizeMonth(args);
    // hábiles del 2 al 25: 2-6, 9-13, 16-20, 24, 25 = 17 (el 23 es feriado)
    expect(s.workingDays).toBe(17);
    expect(s.missing).toBe(16);
    expect(s.pending).toBe(1);
    expect(s.perfect).toBe(false);
  });
  it("cuenta presentes, tardanzas y minutos, licencias por tipo e injustificadas", () => {
    const marks: AttendanceMark[] = [
      mark("2026-11-02", "08:50"), mark("2026-11-03", "09:05"), mark("2026-11-04", "09:20"), mark("2026-11-05", "09:45"),
      mark("2026-11-06", "09:00"), mark("2026-11-09", "09:00"), mark("2026-11-10", "09:00"), mark("2026-11-11", "09:00"),
      mark("2026-11-12", "09:00"), mark("2026-11-13", "09:00"), mark("2026-11-16", "09:00"), mark("2026-11-17", "09:00"),
      mark("2026-11-18", "09:00"), mark("2026-11-19", "09:00"), mark("2026-11-24", "09:00"), mark("2026-11-25", "09:00"),
    ];
    const leaves = [
      { type: "sick" as const, startDate: "2026-11-20", endDate: "2026-11-20" },
    ];
    const s = summarizeMonth({ ...args, marks, leaves });
    expect(s.workingDays).toBe(17);
    expect(s.present).toBe(16);
    expect(s.late).toBe(2); // 09:20 (20 min) y 09:45 (45 min); 09:05 está dentro de la tolerancia
    expect(s.lateMinutes).toBe(65);
    expect(s.leaves).toEqual({ sick: 1 });
    expect(s.leaveDays).toBe(1);
    expect(s.missing).toBe(0);
    expect(s.pending).toBe(0);
    expect(s.perfect).toBe(false); // tuvo tardanzas
  });
  it("un mes sin tardanzas, injustificadas ni días sin resolver es perfecto (solo informativo)", () => {
    const days = ["02", "03", "04", "05", "06", "09", "10", "11", "12", "13", "16", "17", "18", "19", "20", "24", "25"];
    const marks = days.map((d) => mark(`2026-11-${d}`, "09:00"));
    expect(summarizeMonth({ ...args, marks }).perfect).toBe(true);
  });
  it("un mes futuro no cuenta nada", () => {
    const s = summarizeMonth({ ...args, month: "2026-12" });
    expect(s.workingDays).toBe(0);
    expect(s.perfect).toBe(true);
  });
  it("un mes pasado completo cuenta todos sus días laborables", () => {
    const s = summarizeMonth({ ...args, month: "2026-10" });
    // octubre 2026 arranca jueves: 22 días de lunes a viernes, y no hay feriados cargados en este mapa
    expect(s.workingDays).toBe(22);
    expect(s.missing).toBe(22);
  });
});

describe("tolerancia", () => {
  it("por defecto 10 minutos; válida de 0 a 120 enteros", () => {
    expect(DEFAULT_LATE_TOLERANCE_MIN).toBe(10);
    for (const ok of [0, 10, 120]) expect(isValidTolerance(ok)).toBe(true);
    for (const bad of [-1, 121, 5.5, NaN]) expect(isValidTolerance(bad)).toBe(false);
  });
});
