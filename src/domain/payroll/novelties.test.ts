import { describe, expect, it } from "vitest";
import type { LeaveRequest, TimeEntry } from "../model";
import { defaultWorkSchedule } from "../overtime/schedule";
import { buildPayrollCsv, csvText } from "./csv";
import { buildAutoNovelties, mergeNovelties } from "./novelties";

const entry = (id: string, date: string, status: TimeEntry["status"], breakdown?: Record<string, number>): TimeEntry => ({
  id, userId: "u", projectId: "P", date, dateMs: 0, startTime: "09:00", endTime: "18:00", isOnCall: false, ticketRef: "", notes: "", status, ...(breakdown ? { hours: Object.values(breakdown).reduce((a, b) => a + b, 0), breakdown } : {}),
});
const leave = (type: LeaveRequest["type"], startDate: string, endDate: string, status: LeaveRequest["status"] = "approved"): LeaveRequest => ({ id: type + startDate, userId: "u", type, startDate, endDate, daysCount: 0, reason: "", status, createdBy: "u" });
const range = { from: "2026-11-01", to: "2026-11-30" };
const common = { range, schedule: defaultWorkSchedule(), holidays: new Map(), tierIds: ["ot50", "ot100"] };

describe("buildAutoNovelties", () => {
  it("suma horas normales y extra por tramo, solo de lo aprobado y del mes", () => {
    const n = buildAutoNovelties({
      ...common,
      entries: [entry("1", "2026-11-02", "approved", { normal: 8 }), entry("2", "2026-11-03", "approved", { normal: 7.5, ot50: 0.5 }), entry("3", "2026-11-04", "approved", { ot100: 2 }), entry("4", "2026-11-05", "submitted"), entry("5", "2026-12-01", "approved", { normal: 8 })],
      leaves: [],
    });
    expect(n).toEqual({ hoursByTier: { ot50: 0.5, ot100: 2 }, normalHours: 15.5, inasist: 0, vacaciones: 0 });
  });
  it("los tramos sin horas figuran en cero", () => {
    expect(buildAutoNovelties({ ...common, entries: [], leaves: [] }).hoursByTier).toEqual({ ot50: 0, ot100: 0 });
  });
  it("vacaciones: días corridos dentro del mes; injustificadas: días hábiles", () => {
    const n = buildAutoNovelties({ ...common, entries: [], leaves: [leave("vacation", "2026-11-24", "2026-12-07"), leave("unjustified", "2026-11-10", "2026-11-11")] });
    expect(n.vacaciones).toBe(7);
    expect(n.inasist).toBe(2);
  });
  it("enfermedad, estudio y licencias no aprobadas no cambian la liquidación", () => {
    const n = buildAutoNovelties({ ...common, entries: [], leaves: [leave("sick", "2026-11-10", "2026-11-12"), leave("study", "2026-11-13", "2026-11-13"), leave("unjustified", "2026-11-16", "2026-11-16", "pending")] });
    expect(n.inasist).toBe(0);
    expect(n.vacaciones).toBe(0);
  });
});

describe("mergeNovelties", () => {
  it("junta lo automático con lo manual", () => {
    const n = mergeNovelties({ hoursByTier: { ot50: 2 }, normalHours: 160, inasist: 1, vacaciones: 0 }, { bono: 5000, sac: true, sacMeses: 4 });
    expect(n).toMatchObject({ hoursByTier: { ot50: 2 }, normalHours: 160, inasist: 1, bono: 5000, sac: true, sacMeses: 4, adelanto: 0 });
  });
});

describe("CSV de la nómina", () => {
  it("neutraliza fórmulas y escapa separadores y comillas", () => {
    expect(csvText("=SUMA(A1)")).toBe("'=SUMA(A1)");
    expect(csvText("+54 11")).toBe("'+54 11");
    expect(csvText("-1")).toBe("'-1");
    expect(csvText("@cmd")).toBe("'@cmd");
    expect(csvText("Pérez; Juan")).toBe('"Pérez; Juan"');
    expect(csvText('Dijo "hola"')).toBe('"Dijo ""hola"""');
    expect(csvText("normal")).toBe("normal");
  });
  it("arma encabezado, filas con coma decimal y el total", () => {
    const csv = buildPayrollCsv([
      { legajo: "1005", fullName: "Romero, Camila", cuil: "27-30111222-5", remunerativo: 1198298, noRemunerativo: 70000, deducciones: 227676.62, neto: 1040621.38, contribucionesPatronales: 0 },
      { legajo: "1006", fullName: "=cmd", cuil: "", remunerativo: 100, noRemunerativo: 0, deducciones: 10, neto: 90, contribucionesPatronales: 0 },
    ]);
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("Legajo;Apellido y nombre;CUIL;Remunerativo;No remunerativo;Deducciones;Neto;Contribuciones patronales");
    expect(lines[1]).toBe("1005;Romero, Camila;27-30111222-5;1198298,00;70000,00;227676,62;1040621,38;0,00");
    expect(lines[2]!.split(";")[1]).toBe("'=cmd");
    expect(lines[3]).toBe(";TOTAL;;1198398,00;70000,00;227686,62;1040711,38;0,00");
    expect(csv.startsWith("﻿")).toBe(true);
  });
});
