/** Exportación de la nómina del mes a CSV (separador ";" y coma decimal, para abrirlo directo en Excel en español). */

export interface CsvRow {
  legajo: string;
  fullName: string;
  cuil: string;
  remunerativo: number;
  noRemunerativo: number;
  deducciones: number;
  neto: number;
  contribucionesPatronales: number;
}

/**
 * Un texto que empieza con = + - @ lo toma Excel como fórmula (y podría ejecutar algo): se le antepone un apóstrofo.
 * Los textos con ; " o saltos de línea van entre comillas.
 */
export const csvText = (value: string): string => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const money = (n: number): string => n.toFixed(2).replace(".", ",");

export const buildPayrollCsv = (rows: readonly CsvRow[]): string => {
  const header = ["Legajo", "Apellido y nombre", "CUIL", "Remunerativo", "No remunerativo", "Deducciones", "Neto", "Contribuciones patronales"].join(";");
  const lines = rows.map((r) => [csvText(r.legajo), csvText(r.fullName), csvText(r.cuil), money(r.remunerativo), money(r.noRemunerativo), money(r.deducciones), money(r.neto), money(r.contribucionesPatronales)].join(";"));
  const total = (pick: (r: CsvRow) => number) => money(rows.reduce((s, r) => s + pick(r), 0));
  const totals = ["", "TOTAL", "", total((r) => r.remunerativo), total((r) => r.noRemunerativo), total((r) => r.deducciones), total((r) => r.neto), total((r) => r.contribucionesPatronales)].join(";");
  // BOM para que Excel respete las tildes.
  return `﻿${[header, ...lines, totals].join("\r\n")}\r\n`;
};
