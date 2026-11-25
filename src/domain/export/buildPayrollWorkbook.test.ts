import { describe, expect, it } from "vitest";
import { DEFAULT_TIERS } from "../overtime/config";
import { buildPayrollWorkbook, type PayrollInput } from "./buildPayrollWorkbook";

const input: PayrollInput = {
  companyName: "Empresa Demo SRL",
  periodLabel: "01/11/2026 al 24/11/2026",
  generatedOn: "24/11/2026",
  tiers: DEFAULT_TIERS,
  summary: [
    { employeeNumber: 1005, fullName: "Romero, Camila", cuil: "20-00000105-0", area: "Servicio Técnico", daysWorked: 11, normalHours: 88, tierHours: { ot100: 2 }, onCallHours: 0, holidayHours: 2, leaveDays: { vacation: 0, sick: 0, study: 0, personal: 0, unjustified: 0 }, notes: "" },
    { employeeNumber: 1007, fullName: "Medina, Julián", cuil: "20-00000107-0", area: "Servicio Técnico", daysWorked: 11, normalHours: 85.5, tierHours: { ot50: 1.5 }, onCallHours: 0, holidayHours: 0, leaveDays: { vacation: 0, sick: 0, study: 0, personal: 0, unjustified: 1 }, notes: "Ausencia registrada por el supervisor" },
  ],
  detail: [
    { date: "2026-11-16", employee: "Romero, Camila", project: "MNT-001", ticket: "", from: "08:30", to: "17:30", hours: 8, dayType: "Hábil", band: "Dentro de la jornada", category: "Normal", onCall: false, status: "Aprobado", description: "Mantenimiento preventivo" },
  ],
  absences: [{ employee: "Medina, Julián", type: "unjustified", from: "2026-11-24", to: "2026-11-24", totalDays: 1, daysInPeriod: 1, status: "Aprobada", registeredBy: "Acosta, Diego" }],
};

describe("planilla para el contador", () => {
  const wb = buildPayrollWorkbook(input);

  it("tiene las tres hojas con los nombres acordados", () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Detalle de horas", "Ausencias"]);
  });

  it("el encabezado del resumen trae las columnas de la especificación, con un tramo por columna de extra", () => {
    const header = (wb.getWorksheet("Resumen")!.getRow(5).values as unknown[]).slice(1);
    expect(header).toEqual([
      "Legajo", "Apellido y nombre", "CUIL", "Área", "Días trabajados", "Hs normales", "Hs Extra 50%", "Hs Extra 100%",
      "Hs de guardia", "Hs en feriado", "Vacaciones (días)", "Enfermedad (días)", "Día de estudio (días)", "Trámite personal (días)", "Injustificadas (días)", "Observaciones",
    ]);
  });

  it("una fila por empleado y una fila de totales que suma sin arrastrar redondeos", () => {
    const sheet = wb.getWorksheet("Resumen")!;
    expect(sheet.getRow(6).getCell(2).value).toBe("Romero, Camila");
    expect(sheet.getRow(7).getCell(2).value).toBe("Medina, Julián");
    const total = sheet.getRow(8);
    expect(total.getCell(2).value).toBe("TOTAL");
    expect(total.getCell(5).value).toBe(22); // días
    expect(total.getCell(6).value).toBe(173.5); // normales
    expect(total.getCell(7).value).toBe(1.5); // extra 50%
    expect(total.getCell(8).value).toBe(2); // extra 100%
    expect(total.getCell(15).value).toBe(1); // injustificadas
  });

  it("cada hoja lleva empresa, período y fecha de generación", () => {
    for (const name of ["Resumen", "Detalle de horas", "Ausencias"]) {
      const sheet = wb.getWorksheet(name)!;
      expect(String(sheet.getCell(1, 1).value)).toContain("Empresa Demo SRL");
      expect(String(sheet.getCell(2, 1).value)).toContain("01/11/2026 al 24/11/2026");
      expect(String(sheet.getCell(3, 1).value)).toContain("24/11/2026");
    }
  });

  it("detalle y ausencias traen una fila por registro y por licencia", () => {
    expect(wb.getWorksheet("Detalle de horas")!.getRow(6).getCell(7).value).toBe(8);
    expect(wb.getWorksheet("Ausencias")!.getRow(6).getCell(2).value).toBe("Injustificadas");
  });

  it("se puede escribir como .xlsx y como .csv", async () => {
    const xlsx = await wb.xlsx.writeBuffer();
    expect(xlsx.byteLength).toBeGreaterThan(2000);
    const csv = await wb.csv.writeBuffer({ sheetName: "Resumen" });
    expect(new TextDecoder().decode(csv as ArrayBuffer)).toContain("Romero, Camila");
  });
});

describe("CSV: fórmulas neutralizadas", () => {
  it("un nombre o una observación que empieza con = + - @ no llega como fórmula", async () => {
    const { neutralizeFormulasForCsv } = await import("./buildPayrollWorkbook");
    const wb = buildPayrollWorkbook({
      companyName: "Empresa", periodLabel: "p", generatedOn: "g", tiers: [],
      summary: [{ employeeNumber: "1", fullName: "=HYPERLINK(\"http://x\")", cuil: "", area: "+cmd", daysWorked: 1, normalHours: 8, tierHours: {}, onCallHours: 0, holidayHours: 0, leaveDays: { vacation: 0, sick: 0, study: 0, personal: 0, unjustified: 0 }, notes: "@algo" }],
      detail: [], absences: [],
    });
    const csv = Buffer.from(await neutralizeFormulasForCsv(wb).csv.writeBuffer({ sheetName: "Resumen" })).toString();
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+cmd");
    expect(csv).toContain("'@algo");
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
  });
});
