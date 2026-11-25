import { describe, expect, it } from "vitest";
import type { LeaveRequest, TimeEntry, UserSummary } from "../model";
import { defaultWorkSchedule } from "../overtime/schedule";
import { DEFAULT_TIERS } from "../overtime/config";
import type { Holiday } from "../overtime/types";
import { buildPayrollData, monthRange } from "./payrollFromEntries";

const user = (uid: string, fullName: string, extra: Partial<UserSummary> = {}): UserSummary => ({ uid, fullName, email: `${uid}@x.example`, role: "employee", active: true, ...extra });
const entry = (id: string, userId: string, date: string, status: TimeEntry["status"], extra: Partial<TimeEntry> = {}): TimeEntry => ({
  id, userId, projectId: "MNT-001", date, dateMs: 0, startTime: "09:00", endTime: "18:00", isOnCall: false, ticketRef: "", notes: "", status, ...extra,
});
const holidays = new Map<string, Holiday>([["2026-11-23", { date: "2026-11-23", name: "Soberanía", type: "national", countsAsHoliday: true }]]);

const base = {
  users: [user("u1", "Camila Romero", { employeeNumber: "1005", department: "Técnica" }), user("u2", "Diego Acosta")],
  cuilByUid: new Map([["u1", "27-30111222-4"]]),
  holidays,
  tiers: DEFAULT_TIERS,
  projectNames: new Map([["MNT-001", "Mantenimiento"]]),
  leaves: [] as LeaveRequest[],
  range: { from: "2026-11-01", to: "2026-11-30" },
  scheduleFor: () => defaultWorkSchedule(),
};

const leave = (id: string, userId: string, type: LeaveRequest["type"], startDate: string, endDate: string, daysCount: number, createdBy = userId): LeaveRequest => ({
  id, userId, type, startDate, endDate, daysCount, reason: "", status: "approved", createdBy,
});

describe("buildPayrollData", () => {
  const approved = [
    entry("a", "u1", "2026-11-16", "approved", { hours: 8, breakdown: { normal: 8 } }),
    entry("b", "u1", "2026-11-17", "approved", { hours: 10, breakdown: { normal: 8, ot50: 2 } }),
    entry("c", "u1", "2026-11-17", "approved", { hours: 2, breakdown: { ot100: 2 }, isOnCall: true, startTime: "20:00", endTime: "22:00" }),
    entry("d", "u1", "2026-11-23", "approved", { hours: 4, breakdown: { ot100: 4 } }),
    entry("e", "u2", "2026-11-16", "approved", { hours: 8, breakdown: { normal: 8 } }),
  ];
  const open = [entry("f", "u1", "2026-11-18", "submitted"), entry("g", "u2", "2026-11-19", "observed")];
  const data = buildPayrollData({ ...base, approved, open });

  it("suma por empleado con el desglose congelado", () => {
    const camila = data.summary.find((r) => r.fullName === "Camila Romero")!;
    expect(camila).toMatchObject({ employeeNumber: "1005", cuil: "27-30111222-4", area: "Técnica", daysWorked: 3, normalHours: 16, onCallHours: 2, holidayHours: 4 });
    expect(camila.tierHours).toEqual({ ot50: 2, ot100: 6 });
  });
  it("el detalle suma exactamente lo mismo que el resumen", () => {
    const fromDetail = data.detail.reduce((s, r) => s + r.hours, 0);
    expect(fromDetail).toBe(data.totals.hours);
    expect(data.totals.hours).toBe(32);
    expect(data.totals.normal).toBe(24);
    expect(data.totals.tiers).toEqual({ ot50: 2, ot100: 6 });
  });
  it("no incluye lo no aprobado pero lo avisa", () => {
    expect(data.detail.map((r) => r.date + r.employee)).not.toContain("2026-11-18Camila Romero");
    expect(data.summary.find((r) => r.fullName === "Camila Romero")!.notes).toMatch(/1 registro sin aprobar/);
    expect(data.summary.find((r) => r.fullName === "Diego Acosta")!.notes).toMatch(/1 observado sin corregir/);
    expect(data.warnings.join(" ")).toMatch(/1 registro enviado esperando aprobación/);
    expect(data.warnings.join(" ")).toMatch(/1 registro observado sin corregir/);
  });
  it("marca el tipo de día y la guardia en el detalle", () => {
    const feriado = data.detail.find((r) => r.date === "2026-11-23")!;
    expect(feriado.dayType).toBe("Feriado");
    expect(data.detail.find((r) => r.onCall)!.band).toBe("Guardia");
    expect(data.detail.find((r) => r.date === "2026-11-17" && r.hours === 10)!.category).toBe("Normal 8 h + Extra 50% 2 h");
  });
  it("avisa de personas sin CUIL y de registros sin horas congeladas", () => {
    expect(data.warnings.join(" ")).toMatch(/1 persona sin CUIL/);
    const broken = buildPayrollData({ ...base, approved: [entry("x", "u1", "2026-11-16", "approved")], open: [] });
    expect(broken.warnings.join(" ")).toMatch(/sin horas congeladas/);
  });
  it("avisa si hay horas en un tramo que ya no existe en la configuración", () => {
    const data = buildPayrollData({ ...base, approved: [entry("z", "u1", "2026-11-16", "approved", { hours: 2, breakdown: { ot75: 2 } })], open: [] });
    expect(data.warnings.join(" ")).toMatch(/tramos que ya no existen.*ot75/);
  });
  it("ordena por nombre y no revienta con un período vacío", () => {
    expect(data.summary.map((r) => r.fullName)).toEqual(["Camila Romero", "Diego Acosta"]);
    const empty = buildPayrollData({ ...base, approved: [], open: [] });
    expect(empty.summary).toEqual([]);
    expect(empty.totals.hours).toBe(0);
  });
});

describe("buildPayrollData: licencias", () => {
  const leaves = [
    leave("l1", "u2", "vacation", "2026-11-24", "2026-12-07", 14),
    leave("l2", "u1", "unjustified", "2026-11-24", "2026-11-24", 1, "u2"),
    leave("l3", "u1", "study", "2026-11-26", "2026-11-27", 2),
    leave("l4", "u1", "sick", "2026-12-02", "2026-12-03", 2),
  ];
  const data = buildPayrollData({ ...base, approved: [], open: [], leaves: leaves.filter((l) => l.id !== "l4") });

  it("cuenta los días de cada tipo que caen dentro del mes", () => {
    const diego = data.summary.find((r) => r.fullName === "Diego Acosta")!;
    expect(diego.leaveDays.vacation).toBe(7); // 24 al 30 de noviembre, corridos
    const camila = data.summary.find((r) => r.fullName === "Camila Romero")!;
    expect(camila.leaveDays).toMatchObject({ unjustified: 1, study: 2, vacation: 0 });
  });
  it("una persona con solo licencias aparece en el resumen sin horas", () => {
    expect(data.summary.map((r) => r.fullName)).toEqual(["Camila Romero", "Diego Acosta"]);
    expect(data.summary[1]!.daysWorked).toBe(0);
  });
  it("la hoja de ausencias trae una fila por licencia con días totales y del período", () => {
    const vac = data.absences.find((a) => a.type === "vacation")!;
    expect(vac).toMatchObject({ employee: "Diego Acosta", totalDays: 14, daysInPeriod: 7, status: "Aprobada", registeredBy: "Diego Acosta (solicitud)" });
    expect(data.absences.find((a) => a.type === "unjustified")!.registeredBy).toBe("Diego Acosta");
  });
  it("una licencia de otro mes no suma", () => {
    const withDecember = buildPayrollData({ ...base, approved: [], open: [], leaves });
    expect(withDecember.summary.find((r) => r.fullName === "Camila Romero")!.leaveDays.sick).toBe(0);
  });
});

describe("monthRange", () => {
  it("devuelve el primer y el último día del mes", () => {
    expect(monthRange("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});
