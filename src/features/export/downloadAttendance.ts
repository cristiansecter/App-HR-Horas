import type { AttendanceWorkbookInput } from "@/domain/export/buildAttendanceWorkbook";

/** Arma la planilla de asistencia y la descarga. ExcelJS se carga recién acá para no pesar en el resto de la app. */
export async function downloadAttendance(input: AttendanceWorkbookInput, kind: "xlsx" | "csv", fileName: string): Promise<void> {
  const [{ buildAttendanceWorkbook }, { neutralizeFormulasForCsv }] = await Promise.all([import("@/domain/export/buildAttendanceWorkbook"), import("@/domain/export/buildPayrollWorkbook")]);
  const wb = buildAttendanceWorkbook(input);
  const buffer = kind === "xlsx" ? await wb.xlsx.writeBuffer() : await neutralizeFormulasForCsv(wb).csv.writeBuffer({ sheetName: "Asistencia" });
  const blob = new Blob([buffer], { type: kind === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.${kind}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
