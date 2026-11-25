import ExcelJS from "exceljs";
import type { Tier } from "../overtime/types";

export type LeaveKind = "vacation" | "sick" | "study" | "personal" | "unjustified";

export const LEAVE_LABELS: Record<LeaveKind, string> = {
  vacation: "Vacaciones",
  sick: "Enfermedad",
  study: "Día de estudio",
  personal: "Trámite personal",
  unjustified: "Injustificadas",
};

export interface SummaryRow {
  employeeNumber: number | string;
  /** "Apellido, Nombre" */
  fullName: string;
  cuil: string;
  area: string;
  daysWorked: number;
  normalHours: number;
  /** Horas extra por id de tramo. */
  tierHours: Record<string, number>;
  onCallHours: number;
  holidayHours: number;
  leaveDays: Record<LeaveKind, number>;
  notes: string;
}

export interface DetailRow {
  date: string;
  employee: string;
  project: string;
  ticket: string;
  from: string;
  to: string;
  hours: number;
  dayType: string;
  band: string;
  category: string;
  onCall: boolean;
  status: string;
  description: string;
}

export interface AbsenceRow {
  employee: string;
  type: LeaveKind;
  from: string;
  to: string;
  totalDays: number;
  daysInPeriod: number;
  status: string;
  registeredBy: string;
}

export interface PayrollInput {
  companyName: string;
  periodLabel: string;
  generatedOn: string;
  tiers: readonly Tier[];
  summary: readonly SummaryRow[];
  detail: readonly DetailRow[];
  absences: readonly AbsenceRow[];
}

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF151D32" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F6FD" } };
const HOURS_FORMAT = "#,##0.00";

const titleBlock = (sheet: ExcelJS.Worksheet, input: PayrollInput, title: string, columns: number) => {
  sheet.mergeCells(1, 1, 1, columns);
  sheet.getCell(1, 1).value = `${input.companyName} · ${title}`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.mergeCells(2, 1, 2, columns);
  sheet.getCell(2, 1).value = `Período: ${input.periodLabel}. Solo horas aprobadas.`;
  sheet.mergeCells(3, 1, 3, columns);
  sheet.getCell(3, 1).value = `Generado el ${input.generatedOn}`;
  sheet.getCell(3, 1).font = { color: { argb: "FF5F729F" }, size: 10 };
};

const styleHeader = (sheet: ExcelJS.Worksheet, rowNumber: number) => {
  const row = sheet.getRow(rowNumber);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  row.height = 32;
  sheet.views = [{ state: "frozen", ySplit: rowNumber }];
};

const sum = (rows: readonly number[]): number => Math.round(rows.reduce((a, b) => a + b, 0) * 100) / 100;

/** Arma la planilla para el contador: hojas Resumen, Detalle de horas y Ausencias. */
export const buildPayrollWorkbook = (input: PayrollInput): ExcelJS.Workbook => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Horus";

  // ---- Resumen: una fila por empleado
  const resumen = wb.addWorksheet("Resumen");
  const leaveKinds = Object.keys(LEAVE_LABELS) as LeaveKind[];
  const headers = [
    "Legajo", "Apellido y nombre", "CUIL", "Área", "Días trabajados", "Hs normales",
    ...input.tiers.map((t) => `Hs ${t.label}`),
    "Hs de guardia", "Hs en feriado",
    ...leaveKinds.map((k) => `${LEAVE_LABELS[k]} (días)`),
    "Observaciones",
  ];
  titleBlock(resumen, input, "Resumen por empleado", headers.length);
  resumen.getRow(5).values = headers;
  styleHeader(resumen, 5);
  input.summary.forEach((r, i) => {
    resumen.getRow(6 + i).values = [
      r.employeeNumber, r.fullName, r.cuil, r.area, r.daysWorked, r.normalHours,
      ...input.tiers.map((t) => r.tierHours[t.id] ?? 0),
      r.onCallHours, r.holidayHours,
      ...leaveKinds.map((k) => r.leaveDays[k]),
      r.notes,
    ];
  });
  const totalRow = 6 + input.summary.length;
  resumen.getRow(totalRow).values = [
    "", "TOTAL", "", "",
    sum(input.summary.map((r) => r.daysWorked)),
    sum(input.summary.map((r) => r.normalHours)),
    ...input.tiers.map((t) => sum(input.summary.map((r) => r.tierHours[t.id] ?? 0))),
    sum(input.summary.map((r) => r.onCallHours)),
    sum(input.summary.map((r) => r.holidayHours)),
    ...leaveKinds.map((k) => sum(input.summary.map((r) => r.leaveDays[k]))),
    "",
  ];
  resumen.getRow(totalRow).eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true };
    cell.fill = TOTAL_FILL;
  });
  const hourColumns = [6, ...input.tiers.map((_, i) => 7 + i), 7 + input.tiers.length, 8 + input.tiers.length];
  for (let r = 6; r <= totalRow; r++) for (const c of hourColumns) resumen.getCell(r, c).numFmt = HOURS_FORMAT;
  resumen.columns.forEach((col, i) => {
    col.width = [9, 26, 16, 18, 11, 12][i] ?? 14;
  });
  resumen.getColumn(headers.length).width = 36;

  // ---- Detalle de horas: una fila por registro
  const detalle = wb.addWorksheet("Detalle de horas");
  const dHeaders = ["Fecha", "Empleado", "Proyecto", "Ticket", "Desde", "Hasta", "Horas", "Tipo de día", "Franja", "Categoría", "Guardia", "Estado", "Descripción"];
  titleBlock(detalle, input, "Detalle de horas", dHeaders.length);
  detalle.getRow(5).values = dHeaders;
  styleHeader(detalle, 5);
  input.detail.forEach((r, i) => {
    detalle.getRow(6 + i).values = [r.date, r.employee, r.project, r.ticket, r.from, r.to, r.hours, r.dayType, r.band, r.category, r.onCall ? "Sí" : "No", r.status, r.description];
    detalle.getCell(6 + i, 7).numFmt = HOURS_FORMAT;
  });
  detalle.columns.forEach((col, i) => {
    col.width = [12, 24, 11, 12, 8, 8, 9, 12, 16, 14, 9, 11, 38][i] ?? 12;
  });

  // ---- Ausencias: una fila por licencia
  const ausencias = wb.addWorksheet("Ausencias");
  const aHeaders = ["Empleado", "Tipo", "Desde", "Hasta", "Días totales", "Días en el período", "Estado", "Registrada por"];
  titleBlock(ausencias, input, "Ausencias", aHeaders.length);
  ausencias.getRow(5).values = aHeaders;
  styleHeader(ausencias, 5);
  input.absences.forEach((r, i) => {
    ausencias.getRow(6 + i).values = [r.employee, LEAVE_LABELS[r.type], r.from, r.to, r.totalDays, r.daysInPeriod, r.status, r.registeredBy];
  });
  ausencias.columns.forEach((col, i) => {
    col.width = [24, 18, 12, 12, 13, 18, 12, 20][i] ?? 12;
  });

  return wb;
};

/**
 * Un texto que empieza con = + - @ lo toma Excel como fórmula al abrir un CSV (y puede ejecutar algo). Antes de exportar
 * a CSV se le antepone un apóstrofo a esos textos. En el .xlsx no hace falta: los textos se guardan como texto.
 */
export const neutralizeFormulasForCsv = (wb: ExcelJS.Workbook): ExcelJS.Workbook => {
  wb.eachSheet((sheet) =>
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        if (typeof cell.value === "string" && /^[=+\-@\t\r]/.test(cell.value)) cell.value = `'${cell.value}`;
      }),
    ),
  );
  return wb;
};
