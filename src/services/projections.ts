import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch, type Query } from "firebase/firestore";
import type { SessionUser } from "@/domain/types";
import { getFirebase } from "./firebase";

/** Aviso interno: cambió una proyección de horas; las pantallas abiertas deben volver a leer. */
export const PROJECTIONS_CHANGED = "horus:projections-changed";

/** `projections/{proyecto}_{persona}_{AAAA-MM}`: horas que se prevé que una persona dedique a un proyecto en un mes. */
export interface Projection {
  projectId: string;
  userId: string;
  /** AAAA-MM */
  month: string;
  hours: number;
}

const chunk = <T>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
const idOf = (p: Pick<Projection, "projectId" | "userId" | "month">) => `${p.projectId}_${p.userId}_${p.month}`;

/**
 * Proyecciones de un mes de las personas que `reviewer` tiene a cargo. El administrador ve las de toda la empresa;
 * un supervisor, solo las de su equipo (la consulta va acotada con `in`, como lo exigen las reglas).
 */
export async function listProjections(reviewer: SessionUser, teamIds: string[], month: string): Promise<Projection[]> {
  const { db } = getFirebase();
  const col = collection(db, "projections");
  const queries: Query[] =
    reviewer.role === "admin"
      ? [query(col, where("month", "==", month))]
      : chunk(teamIds, 30).map((ids) => query(col, where("userId", "in", ids), where("month", "==", month)));
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  return snaps.flatMap((s) => s.docs.map((d) => d.data() as Projection));
}

/** Guarda las proyecciones de varias personas de un proyecto en un solo paso (o se guardan todas o ninguna). */
export async function saveProjections(items: readonly Projection[], byUid: string): Promise<void> {
  if (items.length === 0) return;
  const { db } = getFirebase();
  // Un lote admite hasta 500 escrituras; un proyecto con tantas personas no es realista, pero se parte por las dudas.
  for (const part of chunk([...items], 400)) {
    const batch = writeBatch(db);
    for (const p of part) {
      batch.set(doc(db, "projections", idOf(p)), { projectId: p.projectId, userId: p.userId, month: p.month, hours: p.hours, updatedBy: byUid, updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }
  window.dispatchEvent(new Event(PROJECTIONS_CHANGED));
}
