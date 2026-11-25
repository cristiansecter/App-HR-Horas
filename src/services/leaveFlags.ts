import { collection, doc, getDocs, query, serverTimestamp, setDoc, where, type Query } from "firebase/firestore";
import type { LeaveFlags } from "@/domain/presentism";
import type { SessionUser } from "@/domain/types";
import { getFirebase } from "./firebase";

/** Aviso interno: cambió una marca de premio o presentismo y las pantallas abiertas deben volver a leer. */
export const LEAVE_FLAGS_CHANGED = "sgblack:leave-flags-changed";

const chunk = <T>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

/**
 * Marcas de premio y presentismo de las licencias de las personas que `reviewer` tiene a cargo, por id de licencia.
 * Se guardan aparte de la licencia para que la propia persona no las lea. El administrador ve todas; un supervisor, las
 * de su equipo (la consulta va acotada con `in`, como lo exigen las reglas).
 */
export async function listFlagsForReview(reviewer: SessionUser, teamIds: string[]): Promise<Map<string, LeaveFlags>> {
  const { db } = getFirebase();
  const col = collection(db, "leave_flags");
  const queries: Query[] = reviewer.role === "admin" ? [query(col)] : chunk(teamIds, 30).map((ids) => query(col, where("userId", "in", ids)));
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  return new Map(snaps.flatMap((s) => s.docs.map((d) => [d.id, { losesPresentism: d.data().losesPresentism === true, losesPrize: d.data().losesPrize === true }] as const)));
}

/** Pone o cambia las marcas de una licencia ya existente. */
export async function setLeaveFlags(reviewer: SessionUser, leaveId: string, userId: string, flags: LeaveFlags): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, "leave_flags", leaveId), { userId, losesPresentism: flags.losesPresentism, losesPrize: flags.losesPrize, updatedBy: reviewer.uid, updatedAt: serverTimestamp() });
  window.dispatchEvent(new Event(LEAVE_FLAGS_CHANGED));
}
