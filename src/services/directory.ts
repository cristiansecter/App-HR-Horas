import { collection, deleteField, doc, getDoc, getDocs, writeBatch } from "firebase/firestore";
import type { EmployeePrivate, WorkMode } from "@/domain/model";
import type { WorkSchedule } from "@/domain/overtime";
import { getFirebase } from "./firebase";

/** Aviso interno: cambió una ficha y las pantallas abiertas deben volver a leer el equipo. */
export const DIRECTORY_CHANGED = "sgblack:directory-changed";

/** Datos sensibles de todo el equipo (solo administrador). */
export async function listEmployeePrivate(): Promise<Map<string, EmployeePrivate>> {
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, "employee_private"));
  return new Map(snap.docs.map((d) => [d.id, { userId: d.id, cuil: "", dni: "", phone: "", ...(d.data() as Partial<EmployeePrivate>) }]));
}

export async function getEmployeePrivate(uid: string): Promise<EmployeePrivate> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, "employee_private", uid));
  return { userId: uid, cuil: "", dni: "", phone: "", ...(snap.exists() ? (snap.data() as Partial<EmployeePrivate>) : {}) };
}

export interface ProfileEdit {
  fullName: string;
  employeeNumber: string;
  department: string;
  position: string;
  hireDate: string;
  supervisorId: string | null;
  /** null = usa la jornada de la empresa. */
  workSchedule: WorkSchedule | null;
  active: boolean;
}

export interface PrivateEdit {
  cuil: string;
  dni: string;
  phone: string;
  workMode: WorkMode | null;
}

/** Un campo vacío se borra del documento en vez de guardar un texto en blanco. */
const orDelete = (value: string | null | undefined) => (value && value.trim() ? value.trim() : deleteField());

/**
 * Guarda la ficha: perfil básico en `users/{uid}` y datos sensibles en `employee_private/{uid}`, en un solo paso.
 * El rol no se toca: lo cambia únicamente el Configurador.
 */
export async function saveEmployee(uid: string, profile: ProfileEdit, sensitive: PrivateEdit): Promise<void> {
  const { db } = getFirebase();
  const batch = writeBatch(db);
  batch.update(doc(db, "users", uid), {
    fullName: profile.fullName.trim(),
    employeeNumber: orDelete(profile.employeeNumber),
    department: orDelete(profile.department),
    position: orDelete(profile.position),
    hireDate: orDelete(profile.hireDate),
    supervisorId: orDelete(profile.supervisorId),
    workSchedule: profile.workSchedule ?? deleteField(),
    active: profile.active,
  });
  batch.set(doc(db, "employee_private", uid), {
    userId: uid,
    cuil: sensitive.cuil.trim(),
    dni: sensitive.dni.trim(),
    phone: sensitive.phone.trim(),
    workMode: sensitive.workMode ?? deleteField(),
    // merge: hace falta para poder borrar la modalidad con deleteField() y para crear el documento la primera vez.
  }, { merge: true });
  await batch.commit();
  window.dispatchEvent(new Event(DIRECTORY_CHANGED));
}
