import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { DEFAULT_LATE_TOLERANCE_MIN, isValidTolerance } from "@/domain/attendance";
import { normalizeFeatures, type Features } from "@/domain/features";
import type { HolidayRecord, Project, UserProfile, UserSummary } from "@/domain/model";
import { defaultOvertimeConfig, defaultWorkSchedule, type OvertimeConfig, type WorkSchedule } from "@/domain/overtime";
import { getFirebase } from "./firebase";

/** Configuración de la empresa que hace falta para clasificar horas: jornada, reglas de extras y feriados. */
export interface CompanyData {
  projects: Project[];
  holidays: Map<string, HolidayRecord>;
  overtime: OvertimeConfig;
  defaultSchedule: WorkSchedule;
  editWindowDays: number;
  /** "assigned": cada persona carga horas solo en los proyectos que le asignan. "open": en cualquiera activo. */
  projectAccess: "open" | "assigned";
  /** Minutos de tolerancia en la hora de llegada antes de contar una tardanza (modo por asistencia). */
  lateToleranceMin: number;
  features: Features;
  companyName?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
}

interface SettingsDoc {
  companyName?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  overtime?: OvertimeConfig;
  defaultSchedule?: WorkSchedule;
  editWindowDays?: number;
  projectAccess?: "open" | "assigned";
  lateToleranceMin?: number;
}

export async function loadCompany(): Promise<CompanyData> {
  const { db } = getFirebase();
  const [settingsSnap, featuresSnap, holidaysSnap, projectsSnap] = await Promise.all([
    getDoc(doc(db, "settings", "main")),
    getDoc(doc(db, "settings", "features")),
    getDocs(collection(db, "holidays")),
    getDocs(collection(db, "projects")),
  ]);
  const settings = (settingsSnap.exists() ? settingsSnap.data() : {}) as SettingsDoc;
  const holidays = new Map<string, HolidayRecord>();
  holidaysSnap.forEach((d) => {
    const h = d.data() as Partial<HolidayRecord>;
    holidays.set(d.id, { date: d.id, name: h.name ?? d.id, type: h.type ?? "national", countsAsHoliday: h.countsAsHoliday ?? true, ...(h.confirmation ? { confirmation: h.confirmation } : {}) });
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
    projectAccess: settings.projectAccess === "open" ? "open" : "assigned",
    lateToleranceMin: isValidTolerance(settings.lateToleranceMin as number) ? (settings.lateToleranceMin as number) : DEFAULT_LATE_TOLERANCE_MIN,
    features: normalizeFeatures(featuresSnap.exists() ? featuresSnap.data() : undefined),
    companyName: settings.companyName,
    logoUrl: settings.logoUrl,
    primaryColor: settings.primaryColor,
    secondaryColor: settings.secondaryColor,
    accentColor: settings.accentColor,
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
