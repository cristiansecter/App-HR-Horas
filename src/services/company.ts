import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import type { Project, UserProfile, UserSummary } from "@/domain/model";
import { defaultOvertimeConfig, defaultWorkSchedule, type Holiday, type OvertimeConfig, type WorkSchedule } from "@/domain/overtime";
import { getFirebase } from "./firebase";

/** Configuración de la empresa que hace falta para clasificar horas: jornada, reglas de extras y feriados. */
export interface CompanyData {
  projects: Project[];
  holidays: Map<string, Holiday>;
  overtime: OvertimeConfig;
  defaultSchedule: WorkSchedule;
  editWindowDays: number;
}

interface SettingsDoc {
  overtime?: OvertimeConfig;
  defaultSchedule?: WorkSchedule;
  editWindowDays?: number;
}

export async function loadCompany(): Promise<CompanyData> {
  const { db } = getFirebase();
  const [settingsSnap, holidaysSnap, projectsSnap] = await Promise.all([
    getDoc(doc(db, "settings", "main")),
    getDocs(collection(db, "holidays")),
    getDocs(collection(db, "projects")),
  ]);
  const settings = (settingsSnap.exists() ? settingsSnap.data() : {}) as SettingsDoc;
  const holidays = new Map<string, Holiday>();
  holidaysSnap.forEach((d) => {
    const h = d.data() as Partial<Holiday>;
    holidays.set(d.id, { date: d.id, name: h.name ?? d.id, type: h.type ?? "national", countsAsHoliday: h.countsAsHoliday ?? true });
  });
  const projects = projectsSnap.docs
    .map((d) => ({ ...(d.data() as Omit<Project, "code">), code: d.id }) satisfies Project)
    .sort((a, b) => a.code.localeCompare(b.code));
  return {
    projects,
    holidays,
    overtime: settings.overtime ?? defaultOvertimeConfig(),
    defaultSchedule: settings.defaultSchedule ?? defaultWorkSchedule(),
    editWindowDays: settings.editWindowDays ?? 7,
  };
}

export async function listUsers(): Promise<UserSummary[]> {
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({ ...(d.data() as UserProfile), uid: d.id })).sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
}

/** Alta o edición de un proyecto (solo administrador, lo hacen cumplir las reglas). */
export async function saveProject(project: Project): Promise<void> {
  const { db } = getFirebase();
  const code = project.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(code)) throw new Error("El código usa letras, números y guiones (de 2 a 20 caracteres).");
  await setDoc(doc(db, "projects", code), {
    name: project.name.trim(),
    client: project.client.trim(),
    budgetHours: Math.max(0, Number(project.budgetHours) || 0),
    active: project.active,
  });
}

export async function setProjectActive(code: string, active: boolean): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, "projects", code), { active });
}
