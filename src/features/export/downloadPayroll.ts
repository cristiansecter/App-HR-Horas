import { DEFAULT_TIERS } from "@/domain/overtime/config";
import { dateInBuenosAires } from "@/domain/dates";
import { buildPayrollWorkbook, neutralizeFormulasForCsv, type PayrollInput } from "@/domain/export/buildPayrollWorkbook";
import { buildDemoPayroll } from "@/demo/demoPayroll";
import { tenantConfig } from "@/config/tenant.config";

const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** Arma la planilla del período y la descarga. ExcelJS se carga recién acá para no pesar en el resto de la app. */
export const downloadPayroll = async (kind: "xlsx" | "csv"): Promise<void> => {
  const today = dateInBuenosAires(new Date());
  const wb = buildPayrollWorkbook({
    companyName: tenantConfig.companyName,
    periodLabel: "01/11/2026 al 24/11/2026",
    generatedOn: dmy(today),
    tiers: DEFAULT_TIERS,
    ...buildDemoPayroll(),
  });
  const buffer = kind === "xlsx" ? await wb.xlsx.writeBuffer() : await neutralizeFormulasForCsv(wb).csv.writeBuffer({ sheetName: "Resumen" });
  const blob = new Blob([buffer], { type: kind === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `horus-planilla-2026-11.${kind}`;
  a.click();
  URL.revokeObjectURL(url);
};

/** Descarga una planilla ya armada (la de una cuenta real). Misma carga diferida de ExcelJS. */
export const downloadWorkbook = async (input: PayrollInput, kind: "xlsx" | "csv", fileName: string): Promise<void> => {
  const wb = buildPayrollWorkbook(input);
  const buffer = kind === "xlsx" ? await wb.xlsx.writeBuffer() : await neutralizeFormulasForCsv(wb).csv.writeBuffer({ sheetName: "Resumen" });
  const blob = new Blob([buffer], { type: kind === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.${kind}`;
  a.click();
  URL.revokeObjectURL(url);
};
