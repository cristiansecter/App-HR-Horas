import { collection, deleteDoc, deleteField, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, type Query } from "firebase/firestore";
import type { SessionUser } from "@/domain/types";
import { getFirebase } from "./firebase";

/** Aviso interno: cambió una asignación de proyectos o un superior; las pantallas abiertas deben volver a leer. */
export const ASSIGNMENTS_CHANGED = "horus:assignments-changed";

export interface Assignment {
  projectId: string;
  userId: string;
  /** Dedicación de la persona al proyecto, en % (1 a 100). Sin dato = 100 (tiempo completo). Solo con el módulo de dedicación. */
  allocationPct?: number;
}

const chunk = <T>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
const idOf = (code: string, uid: string) => `${code}_${uid}`;

/** Códigos de los proyectos que tiene asignados la persona. */
export async function listMyAssignedProjects(uid: string): Promise<Set<string>> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, "assignments"), where("userId", "==", uid)));
  return new Set(snap.docs.map((d) => (d.data() as Assignment).projectId));
}

/**
 * Asignaciones de las personas que `reviewer` tiene a cargo. El administrador ve las de toda la empresa; un supervisor,
 * solo las de su equipo (la consulta va acotada con `in`, como lo exigen las reglas).
 */
export async function listAssignmentsForReview(reviewer: SessionUser, teamIds: string[]): Promise<Assignment[]> {
  const { db } = getFirebase();
  const col = collection(db, "assignments");
  const queries: Query[] = reviewer.role === "admin" ? [query(col)] : chunk(teamIds, 30).map((ids) => query(col, where("userId", "in", ids)));
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  return snaps.flatMap((s) => s.docs.map((d) => d.data() as Assignment));
}

/** Asigna un proyecto a una persona. Las reglas dejan hacerlo al administrador o al supervisor de esa persona. */
export async function assignProject(code: string, uid: string, byUid: string): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, "assignments", idOf(code, uid)), { projectId: code, userId: uid, assignedBy: byUid, createdAt: serverTimestamp() });
  window.dispatchEvent(new Event(ASSIGNMENTS_CHANGED));
}

/** Fija el porcentaje de dedicación de una persona a un proyecto (entero de 1 a 100). Lo exigen las reglas. */
export async function setAllocationPct(code: string, uid: string, pct: number): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, "assignments", idOf(code, uid)), { allocationPct: pct });
  window.dispatchEvent(new Event(ASSIGNMENTS_CHANGED));
}

export async function unassignProject(code: string, uid: string): Promise<void> {
  const { db } = getFirebase();
  await deleteDoc(doc(db, "assignments", idOf(code, uid)));
  window.dispatchEvent(new Event(ASSIGNMENTS_CHANGED));
}

/** Cambia a quién reporta una persona (solo el administrador). `null` = sin supervisor. */
export async function setSupervisor(uid: string, supervisorId: string | null): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, "users", uid), { supervisorId: supervisorId ?? deleteField() });
  window.dispatchEvent(new Event(ASSIGNMENTS_CHANGED));
}
