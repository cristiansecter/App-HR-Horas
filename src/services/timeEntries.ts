import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Query,
} from "firebase/firestore";
import { noonMsBuenosAires } from "@/domain/dates";
import type { TimeEntry, TimeEntryDoc } from "@/domain/model";
import type { SessionUser } from "@/domain/types";
import { classifyEntry, type ClassificationContext } from "@/domain/overtime";
import { getFirebase } from "./firebase";

/** Aviso interno: algo cambió en los registros y las pantallas abiertas deben volver a leerlos. */
export const ENTRIES_CHANGED = "sgblack:entries-changed";
const announceChange = () => window.dispatchEvent(new Event(ENTRIES_CHANGED));

export interface NewTimeEntry {
  userId: string;
  projectId: string;
  date: string;
  startTime: string;
  endTime: string;
  isOnCall: boolean;
  ticketRef: string;
  notes: string;
  /** "draft" lo deja editable; "submitted" lo manda a aprobación. */
  status: "draft" | "submitted";
  /** Solo si lo carga otra persona (supervisor o administrador) en nombre de `userId`: su uid. Las reglas exigen que sea quien escribe. */
  createdBy?: string;
}

const withIds = (docs: { id: string; data: () => unknown }[]): TimeEntry[] =>
  docs.map((d) => ({ id: d.id, ...(d.data() as TimeEntryDoc) }));

const byDateDesc = (a: TimeEntry, b: TimeEntry) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime);

/**
 * Guarda un registro de horas. Solo viajan los datos que carga la persona: las horas y el desglose
 * las calcula y congela quien aprueba (las reglas de Firestore no dejan escribirlas desde acá).
 */
export async function createTimeEntry(input: NewTimeEntry): Promise<string> {
  const { db } = getFirebase();
  const ref = await addDoc(collection(db, "time_entries"), {
    userId: input.userId,
    projectId: input.projectId,
    date: input.date,
    dateMs: noonMsBuenosAires(input.date),
    startTime: input.startTime,
    endTime: input.endTime,
    isOnCall: input.isOnCall,
    ticketRef: input.ticketRef.trim(),
    notes: input.notes.trim(),
    status: input.status,
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  announceChange();
  return ref.id;
}

export type EditableEntryFields = Omit<NewTimeEntry, "userId" | "createdBy">;

/**
 * Corrige un registro propio que sigue en borrador u observado. Al volver a enviarlo (status "submitted")
 * pasa de nuevo a aprobación. Las reglas rechazan la edición fuera de la ventana de días o de un registro aprobado.
 */
export async function updateTimeEntry(id: string, fields: EditableEntryFields): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, "time_entries", id), {
    projectId: fields.projectId,
    date: fields.date,
    dateMs: noonMsBuenosAires(fields.date),
    startTime: fields.startTime,
    endTime: fields.endTime,
    isOnCall: fields.isOnCall,
    ticketRef: fields.ticketRef.trim(),
    notes: fields.notes.trim(),
    status: fields.status,
    updatedAt: serverTimestamp(),
  });
  announceChange();
}

/** Borra un borrador propio. Los registros enviados o aprobados no se borran. */
export async function deleteDraftEntry(id: string): Promise<void> {
  const { db } = getFirebase();
  await deleteDoc(doc(db, "time_entries", id));
  announceChange();
}

/**
 * Registros propios, del más reciente al más viejo. Se ordenan acá y no en la consulta para no depender de un
 * índice compuesto: con un solo filtro por igualdad, Firestore responde sin índices extra.
 */
export async function listMyTimeEntries(userId: string): Promise<TimeEntry[]> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, "time_entries"), where("userId", "==", userId)));
  return withIds(snap.docs).sort(byDateDesc);
}

// Firestore permite hasta 30 valores en un "in".
const chunk = <T>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

/**
 * Registros enviados que esta persona puede aprobar.
 * El administrador ve los de toda la empresa; un supervisor, solo los de su equipo
 * (la consulta tiene que ir acotada a su gente, porque las reglas no permiten pedir más de lo que puede leer).
 * No incluye los propios de un supervisor: los aprueba el administrador.
 */
export async function listPendingForReview(reviewer: SessionUser, teamIds: string[]): Promise<TimeEntry[]> {
  const { db } = getFirebase();
  const col = collection(db, "time_entries");
  const queries: Query[] =
    reviewer.role === "admin"
      ? [query(col, where("status", "==", "submitted"))]
      : chunk(teamIds, 30).map((ids) => query(col, where("userId", "in", ids), where("status", "==", "submitted")));
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  return withIds(snaps.flatMap((s) => s.docs)).sort(byDateDesc);
}

/**
 * Horas aprobadas de las personas que `reviewer` tiene a cargo dentro de un rango de fechas. El administrador ve toda la
 * empresa (consulta por rango de fecha); un supervisor, solo a su gente (consulta acotada con `in`, como piden las reglas,
 * y el rango se filtra acá para no depender de un índice compuesto).
 */
export async function listApprovedForReview(reviewer: SessionUser, teamIds: string[], range: { from: string; to: string }): Promise<TimeEntry[]> {
  if (reviewer.role === "admin") return (await listEntriesBetween(range.from, range.to)).filter((e) => e.status === "approved");
  const { db } = getFirebase();
  const col = collection(db, "time_entries");
  const snaps = await Promise.all(chunk(teamIds, 30).map((ids) => getDocs(query(col, where("userId", "in", ids), where("status", "==", "approved")))));
  return withIds(snaps.flatMap((s) => s.docs)).filter((e) => e.date >= range.from && e.date <= range.to);
}

/**
 * Todos los registros de un rango de fechas, sin importar el estado (solo administrador). Se pide solo por rango de fecha
 * y el estado se filtra acá: así no hace falta un índice compuesto en Firestore (que puede tardar en construirse o no
 * estar publicado) y la consulta queda acotada al mes.
 */
export async function listEntriesBetween(from: string, to: string): Promise<TimeEntry[]> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, "time_entries"), where("date", ">=", from), where("date", "<=", to)));
  return withIds(snap.docs);
}

/** Horas aprobadas de todo el equipo en un rango de fechas (solo administrador). */
export async function listApprovedBetween(from: string, to: string): Promise<TimeEntry[]> {
  return (await listEntriesBetween(from, to)).filter((e) => e.status === "approved");
}

/** Horas aprobadas de un proyecto (solo administrador). */
export async function listApprovedForProject(projectId: string): Promise<TimeEntry[]> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, "time_entries"), where("projectId", "==", projectId), where("status", "==", "approved")));
  return withIds(snap.docs);
}

/**
 * Aprueba un registro: calcula las horas con la jornada del empleado, los feriados y las reglas de la empresa,
 * y las congela junto con el desglose. Después de esto el registro no se puede editar.
 */
export async function approveEntry(entry: TimeEntry, reviewer: SessionUser, ctx: ClassificationContext): Promise<void> {
  const { db } = getFirebase();
  const result = classifyEntry({ date: entry.date, startTime: entry.startTime, endTime: entry.endTime, isOnCall: entry.isOnCall }, ctx);
  await updateDoc(doc(db, "time_entries", entry.id), {
    status: "approved",
    reviewedBy: reviewer.uid,
    reviewedAt: serverTimestamp(),
    hours: result.hours,
    breakdown: result.breakdown,
  });
  announceChange();
}

/** Devuelve un registro al empleado con una nota para que lo corrija. La nota es obligatoria. */
export async function observeEntry(entry: TimeEntry, reviewer: SessionUser, note: string): Promise<void> {
  const reviewerNote = note.trim();
  if (!reviewerNote) throw new Error("Escribí qué hay que corregir.");
  const { db } = getFirebase();
  await updateDoc(doc(db, "time_entries", entry.id), {
    status: "observed",
    reviewerNote,
    reviewedBy: reviewer.uid,
    reviewedAt: serverTimestamp(),
  });
  announceChange();
}
