import ExcelJS from "exceljs";
import { DAY_KIND_LABELS, minutesToClock, type DayStatus, type MonthSummary } from "../attendance";
import type { LeaveType } from "../model";

/** Una persona en el resumen del mes. */
export interface AttendanceSummaryRow {
  fullName: string;
  summary: MonthSummary;
}

/** Un día de una persona (para la hoja de detalle). */
export interface AttendanceDetailRow {
  fullName: string;
  status: DayStatus;
}

export interface AttendanceWorkbookInput {
  companyName: string;
  /** Por ejemplo "Noviembre 2026". */
  periodLabel: string;
  generatedOn: string;
  toleranceMin: number;
  summary: readonly AttendanceSummaryRow[];
  detail: readonly AttendanceDetailRow[];
}

const LEAVE_COLUMNS: { type: Exclude<LeaveType, "unjustified">; label: string }[] = [
  { type: "vacation", label: "Vacaciones" },
  { type: "sick", label: "Enfermedad" },
  { type: "study", label: "Día de estudio" },
  { type: "personal", label: "Trámite personal" },
];

const dmy = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Planilla de asistencia del mes para el contador: un resumen por persona y el detalle día por día.
 * Es solo información de asistencia: no calcula descuentos ni presentismo en pesos (eso lo decide el contador).
 */
export function buildAttendanceWorkbook(input: AttendanceWorkbookInput): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = input.companyName;

  const ws = wb.addWorksheet("Asistencia");
  ws.addRow([`${input.companyName} · Asistencia · ${input.periodLabel}`]).font = { bold: true, size: 13 };
  ws.addRow([`Generado el ${input.generatedOn}. Tolerancia de llegada: ${input.toleranceMin} min. Solo informa la asistencia: no calcula descuentos.`]);
  ws.addRow([]);
  const head = ws.addRow(["Persona", "Días laborables", "Presentes", "Tardanzas", "Minutos tarde", ...LEAVE_COLUMNS.map((c) => `${c.label} (días)`), "Ausencias injustificadas", "Días sin registro", "Sin tardanzas ni faltas"]);
  head.font = { bold: true };
  for (const r of input.summary) {
    const s = r.summary;
    ws.addRow([r.fullName, s.workingDays, s.present, s.late, s.lateMinutes, ...LEAVE_COLUMNS.map((c) => s.leaves[c.type] ?? 0), s.unjustified, s.missing, s.perfect ? "Sí" : "No"]);
  }
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 28 : 16; });

  const dt = wb.addWorksheet("Detalle");
  dt.addRow(["Fecha", "Persona", "Estado", "Llegada", "Minutos tarde", "Marcó", "Nota"]).font = { bold: true };
  const who = { self: "La persona", manual: "Un superior", import: "Sistema externo" } as const;
  for (const d of input.detail) {
    const st = d.status;
    // Solo los días con algo que informar: se omiten fines de semana, feriados y futuros.
    if (st.kind === "future" || st.kind === "nonworking" || st.kind === "holiday") continue;
    dt.addRow([
      dmy(st.date),
      d.fullName,
      DAY_KIND_LABELS[st.kind],
      st.arrivalMinutes !== undefined ? minutesToClock(st.arrivalMinutes) : "",
      st.kind === "late" ? (st.lateMinutes ?? 0) : "",
      st.mark ? who[st.mark.source] : "",
      st.mark?.note ?? "",
    ]);
  }
  dt.columns.forEach((c, i) => { c.width = i === 1 ? 28 : i === 6 ? 40 : 16; });
  return wb;
}
