import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, type Query } from "firebase/firestore";
import type { AttendanceMark, MarkSource } from "@/domain/attendance";
import { noonMsBuenosAires } from "@/domain/dates";
import type { SessionUser } from "@/domain/types";
import { getFirebase } from "./firebase";

/** Aviso interno: cambió una marca de asistencia y las pantallas abiertas deben volver a leer. */
export const ATTENDANCE_CHANGED = "sgblack:attendance-changed";
const announce = () => window.dispatchEvent(new Event(ATTENDANCE_CHANGED));

const chunk = <T>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
const idOf = (uid: string, date: string) => `${uid}_${date}`;

const fromDoc = (data: Record<string, unknown>): AttendanceMark => ({
  userId: String(data.userId),
  date: String(data.date),
  arrivalMinutes: Number(data.arrivalMinutes),
  source: (data.source === "manual" || data.source === "import" ? data.source : "self") as MarkSource,
  markedBy: String(data.markedBy ?? ""),
  ...(typeof data.note === "string" && data.note ? { note: data.note } : {}),
});

/**
 * La persona marca su llegada de hoy. Se puede una sola vez por día y las reglas comparan la hora con la del servidor
 * (±5 minutos): no se puede inventar ni cambiar después. Si ya marcó, lanza AlreadyMarkedError.
 */
export class AlreadyMarkedError extends Error {}
export async function markSelf(user: SessionUser, date: string, arrivalMinutes: number): Promise<void> {
  const { db } = getFirebase();
  try {
    await setDoc(doc(db, "attendance", idOf(user.uid, date)), {
      userId: user.uid,
      date,
      month: date.slice(0, 7),
      dateMs: noonMsBuenosAires(date),
      arrivalMinutes,
      source: "self",
      markedBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    // Una marca ya hecha no se puede reemplazar: las reglas rechazan el segundo intento como un permiso denegado.
    if ((e as { code?: string }).code === "permission-denied") throw new AlreadyMarkedError("Ya marcaste hoy, o no se pudo registrar la hora. Si te equivocaste, pedile a tu supervisor que la corrija.");
    throw e;
  }
  announce();
}

/** Un superior marca o corrige la llegada de alguien de su equipo, de cualquier día hasta hoy. */
export async function markFor(reviewer: SessionUser, userId: string, date: string, arrivalMinutes: number, note: string, exists: boolean): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, "attendance", idOf(userId, date));
  const text = note.trim();
  if (exists) {
    await updateDoc(ref, { arrivalMinutes, note: text, markedBy: reviewer.uid, source: "manual", updatedAt: serverTimestamp() });
  } else {
    await setDoc(ref, {
      userId,
      date,
      month: date.slice(0, 7),
      dateMs: noonMsBuenosAires(date),
      arrivalMinutes,
      source: "manual",
      markedBy: reviewer.uid,
      ...(text ? { note: text } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  announce();
}

/** Quita la marca de un día (un superior; sirve para corregir una marca puesta por error). */
export async function removeMark(userId: string, date: string): Promise<void> {
  const { db } = getFirebase();
  await deleteDoc(doc(db, "attendance", idOf(userId, date)));
  announce();
}

/** Marcas de una persona en un mes (las suyas). */
export async function listMyMarks(uid: string, month: string): Promise<AttendanceMark[]> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, "attendance"), where("userId", "==", uid), where("month", "==", month)));
  return snap.docs.map((d) => fromDoc(d.data()));
}

/**
 * Marcas de un mes de las personas que `reviewer` tiene a cargo. El administrador ve toda la empresa; un supervisor, solo
 * su equipo (la consulta va acotada con `in`, como lo exigen las reglas).
 */
export async function listMarksForReview(reviewer: SessionUser, teamIds: string[], month: string): Promise<AttendanceMark[]> {
  const { db } = getFirebase();
  const col = collection(db, "attendance");
  const queries: Query[] =
    reviewer.role === "admin"
      ? [query(col, where("month", "==", month))]
      : chunk(teamIds, 30).map((ids) => query(col, where("userId", "in", ids), where("month", "==", month)));
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  return snaps.flatMap((s) => s.docs.map((d) => fromDoc(d.data())));
}
