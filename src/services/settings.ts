import { collection, deleteDoc, doc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import type { HolidayRecord } from "@/domain/model";
import type { OvertimeConfig, WorkSchedule } from "@/domain/overtime";
import { getFirebase } from "./firebase";

/** Todo lo que cambia aquí lo escribe solo el administrador (lo hacen cumplir las reglas de Firestore). */

export interface BrandingEdit {
  companyName: string;
  /** URL https del logo, o vacío para usar el monograma con las iniciales. */
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

export async function saveBranding(edit: BrandingEdit): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, "settings", "main"), { ...edit, companyName: edit.companyName.trim(), logoUrl: edit.logoUrl.trim() }, { merge: true });
}

export interface WorkRulesEdit {
  overtime: OvertimeConfig;
  defaultSchedule: WorkSchedule;
  editWindowDays: number;
  projectAccess: "open" | "assigned";
  /** Minutos de tolerancia en la llegada antes de contar una tardanza (modo por asistencia). */
  lateToleranceMin: number;
  /** % del equipo de vacaciones a la vez a partir del cual se avisa. */
  vacationOverlapPct: number;
}

/** Cambia las reglas hacia adelante: lo ya aprobado conserva las horas que se congelaron al aprobar. */
export async function saveWorkRules(edit: WorkRulesEdit): Promise<void> {
  const { db } = getFirebase();
  await setDoc(
    doc(db, "settings", "main"),
    { overtime: edit.overtime, defaultSchedule: edit.defaultSchedule, editWindowDays: edit.editWindowDays, projectAccess: edit.projectAccess, lateToleranceMin: edit.lateToleranceMin, vacationOverlapPct: edit.vacationOverlapPct },
    { merge: true },
  );
}

export type HolidayEdit = HolidayRecord;

const holidayData = (h: HolidayEdit) => ({
  name: h.name.trim(),
  type: h.type,
  countsAsHoliday: h.countsAsHoliday,
  ...(h.confirmation ? { confirmation: h.confirmation } : {}),
});

/** Crea o actualiza un feriado. Si cambió la fecha (`previousDate`), el viejo se borra en el mismo paso. */
export async function saveHoliday(holiday: HolidayEdit, previousDate?: string): Promise<void> {
  const { db } = getFirebase();
  const batch = writeBatch(db);
  if (previousDate && previousDate !== holiday.date) batch.delete(doc(db, "holidays", previousDate));
  batch.set(doc(db, "holidays", holiday.date), holidayData(holiday));
  await batch.commit();
}

export async function deleteHoliday(date: string): Promise<void> {
  const { db } = getFirebase();
  await deleteDoc(doc(db, "holidays", date));
}

/** Carga varios feriados de una vez (los nacionales de un año). No pisa los que ya existen. */
export async function addHolidays(holidays: readonly HolidayEdit[]): Promise<number> {
  const { db } = getFirebase();
  const existing = new Set((await getDocs(collection(db, "holidays"))).docs.map((d) => d.id));
  const missing = holidays.filter((h) => !existing.has(h.date));
  for (let i = 0; i < missing.length; i += 400) {
    const batch = writeBatch(db);
    for (const h of missing.slice(i, i + 400)) batch.set(doc(db, "holidays", h.date), holidayData(h));
    await batch.commit();
  }
  return missing.length;
}
