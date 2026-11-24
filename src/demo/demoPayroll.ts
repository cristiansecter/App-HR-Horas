import { addDays, dayOfWeek } from "@/domain/dates";
import type { AbsenceRow, DetailRow, SummaryRow } from "@/domain/export/buildPayrollWorkbook";

/**
 * Planilla de ejemplo de la demo (1 al 24 de noviembre de 2026, solo horas aprobadas). Datos inventados.
 * Fuente de verdad de los números que muestra la pantalla Reportes: el detalle se genera para que sume
 * exactamente lo mismo que el resumen.
 */
interface Person {
  leg: number;
  name: string;
  area: string;
  days: number;
  normal: number;
  e50: number;
  e100: number;
  guard: number;
  holiday: number;
  leave?: { type: "vacation" | "unjustified"; note: string };
  notes?: string;
}

export const PAYROLL_PEOPLE: readonly Person[] = [
  { leg: 1002, name: "Acosta, Diego", area: "Servicio Técnico", days: 14, normal: 112, e50: 3, e100: 0, guard: 0, holiday: 0 },
  { leg: 1003, name: "Pereyra, Valeria", area: "Proyectos", days: 14, normal: 112, e50: 2, e100: 0, guard: 0, holiday: 0 },
  { leg: 1004, name: "Benítez, Nicolás", area: "Servicio Técnico", days: 10, normal: 80, e50: 6, e100: 4, guard: 0, holiday: 0, leave: { type: "vacation", note: "" }, notes: "Vacaciones desde el 24/11" },
  { leg: 1005, name: "Romero, Camila", area: "Servicio Técnico", days: 11, normal: 88, e50: 0, e100: 2, guard: 0, holiday: 2, notes: "Tiene un registro observado sin aprobar" },
  { leg: 1006, name: "Castro, Sebastián", area: "Servicio Técnico", days: 12, normal: 96, e50: 0, e100: 0, guard: 8, holiday: 0 },
  { leg: 1007, name: "Medina, Julián", area: "Servicio Técnico", days: 11, normal: 85, e50: 0, e100: 0, guard: 0, holiday: 0, leave: { type: "unjustified", note: "" }, notes: "Ausencia registrada por el supervisor" },
  { leg: 1008, name: "Giménez, Florencia", area: "Proyectos", days: 16, normal: 128, e50: 10, e100: 0, guard: 0, holiday: 0 },
  { leg: 1009, name: "Herrera, Matías", area: "Proyectos", days: 11, normal: 88, e50: 0, e100: 0, guard: 0, holiday: 0, notes: "Semana incompleta" },
  { leg: 1010, name: "Sosa, Agustina", area: "Proyectos", days: 16, normal: 128, e50: 5, e100: 0, guard: 0, holiday: 0 },
  { leg: 1011, name: "Rodríguez, Lucía", area: "Administración", days: 13, normal: 104, e50: 0, e100: 0, guard: 0, holiday: 0 },
  { leg: 1012, name: "Ruiz, Federico", area: "Administración", days: 13, normal: 104, e50: 0, e100: 0, guard: 0, holiday: 0 },
];

const PROJECTS: Record<string, string[]> = {
  "Servicio Técnico": ["MNT-001", "SOP-004", "OBR-002"],
  Proyectos: ["PRY-003", "OBR-002"],
  Administración: ["SOP-004"],
};
const DESCRIPTIONS: Record<string, string> = {
  "MNT-001": "Mantenimiento preventivo de planta",
  "OBR-002": "Remodelación de oficinas",
  "PRY-003": "Proyecto ejecutivo de instalaciones",
  "SOP-004": "Soporte técnico mensual",
};

const HOLIDAY = "2026-11-23";
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const START = 8 * 60 + 30;

/** Días hábiles del 2 al 24 de noviembre sin el feriado y sin los días de ausencia. */
const workdays = (p: Person): string[] => {
  const out: string[] = [];
  for (let d = "2026-11-02"; d <= "2026-11-24"; d = addDays(d, 1)) {
    const dow = dayOfWeek(d);
    if (dow === 0 || dow === 6 || d === HOLIDAY) continue;
    if (p.leave && d === "2026-11-24") continue;
    out.push(d);
  }
  return out;
};

const detailFor = (p: Person): DetailRow[] => {
  const rows: DetailRow[] = [];
  const projects = PROJECTS[p.area] ?? ["SOP-004"];
  const base = { employee: p.name, ticket: "", status: "Aprobado", onCall: false };
  const push = (date: string, from: number, to: number, hours: number, dayType: string, band: string, category: string, project: string, onCall = false) =>
    rows.push({ ...base, date, from: clock(from), to: clock(to), hours, dayType, band, category, project, onCall, description: DESCRIPTIONS[project]! });

  const weekdayCount = p.days - (p.guard > 0 ? 1 : 0);
  const days = workdays(p).slice(0, weekdayCount);
  let remaining = p.normal - p.guard;
  days.forEach((d, i) => {
    const h = Math.min(8, remaining);
    remaining -= h;
    if (h <= 0) return;
    // Con almuerzo (13:00 a 14:00) se descuenta una hora cuando el registro lo abarca.
    const end = h === 8 ? START + 9 * 60 : h > 4.5 ? START + (h + 1) * 60 : START + h * 60;
    push(d, START, end, h, "Hábil", "Dentro de la jornada", "Normal", projects[i % projects.length]!);
  });

  let left = p.e50;
  for (let i = 2; left > 0; i++) {
    const h = Math.min(2, left);
    left -= h;
    const d = days[i % days.length]!;
    push(d, 17 * 60 + 30, 17 * 60 + 30 + h * 60, h, "Hábil", "Después de la jornada", "Extra 50%", projects[0]!);
  }

  if (p.holiday > 0) push(HOLIDAY, 10 * 60, 10 * 60 + p.holiday * 60, p.holiday, "Feriado", "Feriado", "Extra 100%", projects[0]!);
  const sundayHours = p.e100 - p.holiday;
  if (sundayHours > 0) push("2026-11-22", 8 * 60, 8 * 60 + sundayHours * 60, sundayHours, "Domingo", "Domingo", "Extra 100%", projects[0]!);
  if (p.guard > 0) push("2026-11-14", 9 * 60, 9 * 60 + p.guard * 60, p.guard, "Sábado", "Guardia", "Normal", projects[0]!, true);
  return rows;
};

export interface DemoPayroll {
  summary: SummaryRow[];
  detail: DetailRow[];
  absences: AbsenceRow[];
}

export const buildDemoPayroll = (): DemoPayroll => {
  const summary: SummaryRow[] = PAYROLL_PEOPLE.map((p) => ({
    employeeNumber: p.leg,
    fullName: p.name,
    cuil: `20-${String(p.leg - 900).padStart(8, "0")}-0`,
    area: p.area,
    daysWorked: p.days,
    normalHours: p.normal,
    tierHours: { ot50: p.e50, ot100: p.e100 },
    onCallHours: p.guard,
    holidayHours: p.holiday,
    leaveDays: { vacation: p.leave?.type === "vacation" ? 1 : 0, sick: 0, study: 0, personal: 0, unjustified: p.leave?.type === "unjustified" ? 1 : 0 },
    notes: p.notes ?? "",
  }));
  const detail = PAYROLL_PEOPLE.flatMap(detailFor).sort((a, b) => (a.date === b.date ? a.employee.localeCompare(b.employee, "es") : a.date.localeCompare(b.date)));
  const absences: AbsenceRow[] = [
    { employee: "Benítez, Nicolás", type: "vacation", from: "2026-11-24", to: "2026-12-07", totalDays: 14, daysInPeriod: 1, status: "Aprobada", registeredBy: "Benítez, Nicolás (solicitud)" },
    { employee: "Medina, Julián", type: "unjustified", from: "2026-11-24", to: "2026-11-24", totalDays: 1, daysInPeriod: 1, status: "Aprobada", registeredBy: "Acosta, Diego" },
  ];
  return { summary, detail, absences };
};
