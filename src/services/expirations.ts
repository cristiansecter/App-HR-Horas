import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where, type Query } from "firebase/firestore";
import { expirationProblems, type Expiration, type ExpirationKind } from "@/domain/expirations";
import type { SessionUser } from "@/domain/types";
import { getFirebase } from "./firebase";

/** Aviso interno: cambió un vencimiento y las pantallas abiertas deben volver a leer. */
export const EXPIRATIONS_CHANGED = "horus:expirations-changed";
const announce = () => window.dispatchEvent(new Event(EXPIRATIONS_CHANGED));

const chunk = <T>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

const fromDoc = (id: string, d: Record<string, unknown>): Expiration => ({
  id,
  userId: String(d.userId),
  kind: d.kind as ExpirationKind,
  title: String(d.title ?? ""),
  date: String(d.date),
  ...(typeof d.note === "string" && d.note ? { note: d.note } : {}),
});
const byDate = (a: Expiration, b: Expiration) => a.date.localeCompare(b.date);

/** Vencimientos de una persona (solo el administrador, para su ficha). */
export async function listExpirationsOf(uid: string): Promise<Expiration[]> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, "expirations"), where("userId", "==", uid)));
  return snap.docs.map((d) => fromDoc(d.id, d.data())).sort(byDate);
}

/**
 * Vencimientos de las personas que `reviewer` tiene a cargo. El administrador ve todos; un supervisor, solo los de su
 * equipo (la consulta va acotada con `in`, como lo exigen las reglas).
 */
export async function listExpirationsForReview(reviewer: SessionUser, teamIds: string[]): Promise<Expiration[]> {
  const { db } = getFirebase();
  const col = collection(db, "expirations");
  const queries: Query[] = reviewer.role === "admin" ? [query(col)] : chunk(teamIds, 30).map((ids) => query(col, where("userId", "in", ids)));
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  return snaps.flatMap((s) => s.docs.map((d) => fromDoc(d.id, d.data()))).sort(byDate);
}

export interface ExpirationInput {
  userId: string;
  kind: ExpirationKind;
  title: string;
  date: string;
  note: string;
}

/** Crea (sin `id`) o reemplaza un vencimiento. Solo el administrador. */
export async function saveExpiration(by: SessionUser, input: ExpirationInput, id?: string): Promise<void> {
  const problems = expirationProblems(input);
  if (problems.length > 0) throw new Error(problems[0]);
  const { db } = getFirebase();
  const ref = id ? doc(db, "expirations", id) : doc(collection(db, "expirations"));
  const note = input.note.trim();
  await setDoc(ref, { userId: input.userId, kind: input.kind, title: input.title.trim(), date: input.date, ...(note ? { note } : {}), updatedBy: by.uid, updatedAt: serverTimestamp() });
  announce();
}

export async function deleteExpiration(id: string): Promise<void> {
  const { db } = getFirebase();
  await deleteDoc(doc(db, "expirations", id));
  announce();
}
