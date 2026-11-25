import { describe, expect, it } from "vitest";
import { clockToMinutes, dayStatus, summarizeMonth, type AttendanceMark } from "../attendance";
import { defaultWorkSchedule } from "../overtime/schedule";
import { buildAttendanceWorkbook } from "./buildAttendanceWorkbook";
import { neutralizeFormulasForCsv } from "./buildPayrollWorkbook";

const schedule = defaultWorkSchedule();
const base = { today: "2026-11-25", schedule, holidays: new Map(), leaves: [], toleranceMin: 10 };
const mark = (date: string, arrival: string, note?: string): AttendanceMark => ({ userId: "emi", date, arrivalMinutes: clockToMinutes(arrival), source: "manual", markedBy: "sofia", ...(note ? { note } : {}) });

describe("planilla de asistencia", () => {
  const marks = [mark("2026-11-24", "09:30", "Tren cortado"), mark("2026-11-25", "08:58")];
  const input = {
    companyName: "Empresa Demo SRL",
    periodLabel: "Noviembre 2026",
    generatedOn: "25/11/2026",
    toleranceMin: 10,
    summary: [{ fullName: "Emi Demo", summary: summarizeMonth({ month: "2026-11", ...base, marks }) }],
    detail: ["2026-11-21", "2026-11-24", "2026-11-25", "2026-11-26"].map((date) => ({ fullName: "Emi Demo", status: dayStatus({ ...base, date, mark: marks.find((m) => m.date === date) }) })),
  };
  const wb = buildAttendanceWorkbook(input);

  it("tiene el resumen por persona con los números del mes", () => {
    const ws = wb.getWorksheet("Asistencia")!;
    const header = ws.getRow(4).values as unknown[];
    expect(header.slice(1, 6)).toEqual(["Persona", "Días laborables", "Presentes", "Tardanzas", "Minutos tarde"]);
    const row = ws.getRow(5).values as unknown[];
    expect(row[1]).toBe("Emi Demo");
    expect(row[3]).toBe(2); // presentes
    expect(row[4]).toBe(1); // tardanzas (09:30 con tolerancia 10)
    expect(row[5]).toBe(30); // minutos tarde
  });
  it("el detalle omite fines de semana y días futuros y muestra hora, tardanza y nota", () => {
    const dt = wb.getWorksheet("Detalle")!;
    const rows = (dt.getSheetValues() as unknown[][]).slice(2);
    expect(rows).toHaveLength(2); // solo el 24 y el 25
    expect(rows[0]!.slice(1)).toEqual(["24/11/2026", "Emi Demo", "Tarde", "09:30", 30, "Un superior", "Tren cortado"]);
    expect(rows[1]!.slice(1, 5)).toEqual(["25/11/2026", "Emi Demo", "Presente", "08:58"]);
  });
  it("aclara que no calcula descuentos", () => {
    expect(String(wb.getWorksheet("Asistencia")!.getRow(2).getCell(1).value)).toMatch(/no calcula descuentos/);
  });
  it("el CSV neutraliza fórmulas: una nota que empieza con = no se ejecuta en Excel", async () => {
    const evil = buildAttendanceWorkbook({ ...input, detail: [{ fullName: "=HYPERLINK(\"http://x\")", status: dayStatus({ ...base, date: "2026-11-24", mark: mark("2026-11-24", "09:00", "=1+1") }) }] });
    const csv = Buffer.from(await neutralizeFormulasForCsv(evil).csv.writeBuffer({ sheetName: "Detalle" })).toString();
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'=1+1");
  });
});
