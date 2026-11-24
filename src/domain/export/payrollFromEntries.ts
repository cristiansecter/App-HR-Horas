import type { TimeEntry, UserSummary } from "../model";
import { dayTypeOf } from "../overtime/dayType";
import type { Holiday, Tier } from "../overtime/types";
import type { AbsenceRow, DetailRow, SummaryRow, LeaveKind } from "./buildPayrollWorkbook";

export interface PayrollSources {
  /** Registros aprobados del período (con `hours` y `breakdown` congelados). */
  approved: readonly TimeEntry[];
  /** Registros del período que todavía no están aprobados (enviados u observados): no entran en la planilla. */
  open: readonly TimeEntry[];
  users: readonly UserSummary[];
  /** CUIL por uid (sale de employee_private, solo administrador). */
  cuilByUid: ReadonlyMap<string, string>;
  holidays: ReadonlyMap<string, Holiday>;
  tiers: readonly Tier[];
  projectNames: ReadonlyMap<string, string>;
}

export interface PayrollData {
  summary: SummaryRow[];
  detail: DetailRow[];
  absences: AbsenceRow[];
  /** Avisos para quien exporta: lo que quedó afuera o puede estar incompleto. */
  warnings: string[];
  totals: { hours: number; normal: number; tiers: Record<string, number>; onCall: number; holiday: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY_LABELS = { weekday: "Hábil", saturday: "Sábado", sunday: "Domingo", holiday: "Feriado" } as const;
const STATUS_LABEL = { approved: "Aprobado", submitted: "Enviado", observed: "Observado", draft: "Borrador" } as const;
const NO_LEAVES: Record<LeaveKind, number> = { vacation: 0, sick: 0, study: 0, personal: 0, unjustified: 0 };

const sumBreakdown = (entries: readonly TimeEntry[]): Record<string, number> => {
  const total: Record<string, number> = {};
  for (const e of entries) for (const [cat, h] of Object.entries(e.breakdown ?? {})) total[cat] = (total[cat] ?? 0) + h;
  return total;
};

/**
 * Arma la planilla del contador a partir de lo aprobado. Reglas:
 * - Solo cuentan las horas aprobadas, con el desglose congelado al aprobar (nunca se recalcula acá).
 * - El resumen y el detalle suman exactamente lo mismo.
 * - Los registros enviados u observados no entran, pero se avisan por persona y en `warnings`.
 * - "Hs en feriado" y "Días trabajados" se toman de la fecha de inicio de cada registro.
 */
export function buildPayrollData(src: PayrollSources): PayrollData {
  const byUser = new Map<string, TimeEntry[]>();
  for (const e of src.approved) byUser.set(e.userId, [...(byUser.get(e.userId) ?? []), e]);
  const openByUser = new Map<string, TimeEntry[]>();
  for (const e of src.open) openByUser.set(e.userId, [...(openByUser.get(e.userId) ?? []), e]);

  const people = new Map(src.users.map((u) => [u.uid, u]));
  const nameOf = (uid: string) => people.get(uid)?.fullName ?? "Persona dada de baja";
  const ids = [...new Set([...byUser.keys(), ...openByUser.keys()])].sort((a, b) => nameOf(a).localeCompare(nameOf(b), "es"));

  const summary: SummaryRow[] = ids.map((uid) => {
    const entries = byUser.get(uid) ?? [];
    const open = openByUser.get(uid) ?? [];
    const breakdown = sumBreakdown(entries);
    const user = people.get(uid);
    const notes: string[] = [];
    const observed = open.filter((e) => e.status === "observed").length;
    const submitted = open.filter((e) => e.status === "submitted").length;
    if (submitted) notes.push(`${submitted} registro${submitted === 1 ? "" : "s"} sin aprobar (no incluido${submitted === 1 ? "" : "s"})`);
    if (observed) notes.push(`${observed} observado${observed === 1 ? "" : "s"} sin corregir`);
    return {
      employeeNumber: user?.employeeNumber ?? "",
      fullName: nameOf(uid),
      cuil: src.cuilByUid.get(uid) ?? "",
      area: user?.department ?? "",
      daysWorked: new Set(entries.map((e) => e.date)).size,
      normalHours: round2(breakdown.normal ?? 0),
      tierHours: Object.fromEntries(src.tiers.map((t) => [t.id, round2(breakdown[t.id] ?? 0)])),
      onCallHours: round2(entries.filter((e) => e.isOnCall).reduce((s, e) => s + (e.hours ?? 0), 0)),
      holidayHours: round2(entries.filter((e) => dayTypeOf(e.date, src.holidays) === "holiday").reduce((s, e) => s + (e.hours ?? 0), 0)),
      leaveDays: { ...NO_LEAVES },
      notes: notes.join(". "),
    };
  });

  const label = (id: string) => (id === "normal" ? "Normal" : (src.tiers.find((t) => t.id === id)?.label ?? id));
  const detail: DetailRow[] = [...src.approved]
    .sort((a, b) => a.date.localeCompare(b.date) || nameOf(a.userId).localeCompare(nameOf(b.userId), "es") || a.startTime.localeCompare(b.startTime))
    .map((e) => ({
      date: e.date,
      employee: nameOf(e.userId),
      project: e.projectId,
      ticket: e.ticketRef,
      from: e.startTime,
      to: e.endTime,
      hours: round2(e.hours ?? 0),
      dayType: DAY_LABELS[dayTypeOf(e.date, src.holidays)],
      band: e.isOnCall ? "Guardia" : "",
      category: Object.entries(e.breakdown ?? {})
        .filter(([, h]) => h > 0)
        .map(([id, h]) => `${label(id)} ${h.toLocaleString("es-AR")} h`)
        .join(" + "),
      onCall: e.isOnCall,
      status: STATUS_LABEL[e.status],
      description: e.notes || src.projectNames.get(e.projectId) || "",
    }));

  const totals = {
    hours: round2(summary.reduce((s, r) => s + r.normalHours + Object.values(r.tierHours).reduce((a, b) => a + b, 0), 0)),
    normal: round2(summary.reduce((s, r) => s + r.normalHours, 0)),
    tiers: Object.fromEntries(src.tiers.map((t) => [t.id, round2(summary.reduce((s, r) => s + (r.tierHours[t.id] ?? 0), 0))])),
    onCall: round2(summary.reduce((s, r) => s + r.onCallHours, 0)),
    holiday: round2(summary.reduce((s, r) => s + r.holidayHours, 0)),
  };

  const warnings: string[] = [];
  const pendingCount = src.open.filter((e) => e.status === "submitted").length;
  const observedCount = src.open.filter((e) => e.status === "observed").length;
  if (pendingCount) warnings.push(`${pendingCount} registro${pendingCount === 1 ? "" : "s"} enviado${pendingCount === 1 ? "" : "s"} esperando aprobación: no ${pendingCount === 1 ? "está incluido" : "están incluidos"} en la planilla.`);
  if (observedCount) warnings.push(`${observedCount} registro${observedCount === 1 ? "" : "s"} observado${observedCount === 1 ? "" : "s"} sin corregir: no ${observedCount === 1 ? "está incluido" : "están incluidos"} en la planilla.`);
  if (src.approved.some((e) => e.hours === undefined || !e.breakdown)) warnings.push("Hay registros aprobados sin horas congeladas: revisalos antes de exportar.");
  const noCuil = summary.filter((r) => !r.cuil && r.fullName !== "Persona dada de baja").length;
  if (noCuil) warnings.push(`${noCuil} persona${noCuil === 1 ? "" : "s"} sin CUIL cargado.`);

  return { summary, detail, absences: [], warnings, totals };
}

/** Primer y último día (AAAA-MM-DD) de un mes "AAAA-MM". */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
