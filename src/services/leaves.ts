import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, where, writeBatch, type Query } from "firebase/firestore";
import type { LeaveRequest, LeaveRequestDoc, LeaveType, TeamAbsence } from "@/domain/model";
import type { LeaveFlags } from "@/domain/presentism";
import type { SessionUser } from "@/domain/types";
import { getFirebase } from "./firebase";

/** Aviso interno: cambió algo en las licencias y las pantallas abiertas deben volver a leerlas. */
export const LEAVES_CHANGED = "sgblack:leaves-changed";
const announceChange = () => window.dispatchEvent(new Event(LEAVES_CHANGED));

const withIds = (docs: { id: string; data: () => unknown }[]): LeaveRequest[] =>
  docs.map((d) => ({ id: d.id, ...(d.data() as LeaveRequestDoc) }));

const byStartDesc = (a: LeaveRequest, b: LeaveRequest) => b.startDate.localeCompare(a.startDate);
const chunk = <T>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

export interface NewLeave {
  userId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
}

/** Solicitud propia: queda pendiente hasta que la apruebe tu supervisor o el administrador. */
export async function createLeaveRequest(input: NewLeave): Promise<string> {
  const { db } = getFirebase();
  const ref = await addDoc(collection(db, "leave_requests"), {
    userId: input.userId,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    daysCount: input.daysCount,
    reason: input.reason.trim(),
    status: "pending",
    createdBy: input.userId,
    createdAt: serverTimestamp(),
  });
  announceChange();
  return ref.id;
}

export async function listMyLeaves(userId: string): Promise<LeaveRequest[]> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, "leave_requests"), where("userId", "==", userId)));
  return withIds(snap.docs).sort(byStartDesc);
}

/**
 * Licencias de una persona o equipo con un estado dado. El administrador ve toda la empresa; un supervisor,
 * solo a su gente (la consulta va acotada con `in`, porque las reglas no dejan pedir más de lo que puede leer).
 */
async function listByStatus(reviewer: SessionUser, teamIds: string[], status: "pending" | "approved"): Promise<LeaveRequest[]> {
  const { db } = getFirebase();
  const col = collection(db, "leave_requests");
  const queries: Query[] =
    reviewer.role === "admin"
      ? [query(col, where("status", "==", status))]
      : chunk(teamIds, 30).map((ids) => query(col, where("userId", "in", ids), where("status", "==", status)));
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  return withIds(snaps.flatMap((s) => s.docs)).sort(byStartDesc);
}

export const listPendingLeavesForReview = (reviewer: SessionUser, teamIds: string[]) => listByStatus(reviewer, teamIds, "pending");
export const listApprovedLeavesForReview = (reviewer: SessionUser, teamIds: string[]) => listByStatus(reviewer, teamIds, "approved");

/**
 * Licencias aprobadas que tocan un período (solo administrador). Para la planilla.
 * Se pide por fecha de fin (que no esté antes del período) y lo demás se filtra acá, sin índice compuesto.
 */
export async function listApprovedLeavesOverlapping(from: string, to: string): Promise<LeaveRequest[]> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, "leave_requests"), where("endDate", ">=", from)));
  return withIds(snap.docs).filter((l) => l.status === "approved" && l.startDate <= to);
}

/** Calendario del equipo: lo puede leer cualquier usuario con rol. No trae el tipo de licencia. */
export async function listTeamAbsences(): Promise<TeamAbsence[]> {
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, "team_absences"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeamAbsence, "id">) }));
}

/** Aprobar o rechazar. Al aprobar, la ausencia pasa al calendario del equipo en el mismo paso. */
export async function decideLeave(leave: LeaveRequest, reviewer: SessionUser, approve: boolean, note: string, flags?: LeaveFlags): Promise<void> {
  const { db } = getFirebase();
  const batch = writeBatch(db);
  const reviewerNote = note.trim();
  batch.update(doc(db, "leave_requests", leave.id), {
    status: approve ? "approved" : "rejected",
    approvedBy: reviewer.uid,
    decidedAt: serverTimestamp(),
    ...(reviewerNote ? { reviewerNote } : {}),
  });
  if (approve) {
    batch.set(doc(db, "team_absences", leave.id), { userId: leave.userId, startDate: leave.startDate, endDate: leave.endDate, leaveId: leave.id });
    // Premio y presentismo (si la empresa lo usa): se guardan en el mismo paso que la aprobación.
    if (flags) batch.set(doc(db, "leave_flags", leave.id), { userId: leave.userId, losesPresentism: flags.losesPresentism, losesPrize: flags.losesPrize, updatedBy: reviewer.uid, updatedAt: serverTimestamp() });
  }
  await batch.commit();
  announceChange();
  if (approve && flags) window.dispatchEvent(new Event("sgblack:leave-flags-changed"));
}

export interface NewLeaveFor {
  userId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
}

/**
 * Quien supervisa (o el administrador) registra una licencia por una persona de su equipo, directamente aprobada
 * (por ejemplo si la persona no puede cargarla). Sirve para cualquier tipo, también la ausencia injustificada,
 * que solo se registra así. La ausencia queda también en el calendario del equipo.
 */
export async function registerLeaveFor(reviewer: SessionUser, input: NewLeaveFor, flags?: LeaveFlags): Promise<string> {
  const { db } = getFirebase();
  const ref = doc(collection(db, "leave_requests"));
  const batch = writeBatch(db);
  batch.set(ref, {
    userId: input.userId,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    daysCount: input.daysCount,
    reason: input.reason.trim(),
    status: "approved",
    createdBy: reviewer.uid,
    approvedBy: reviewer.uid,
    decidedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "team_absences", ref.id), { userId: input.userId, startDate: input.startDate, endDate: input.endDate, leaveId: ref.id });
  if (flags) batch.set(doc(db, "leave_flags", ref.id), { userId: input.userId, losesPresentism: flags.losesPresentism, losesPrize: flags.losesPrize, updatedBy: reviewer.uid, updatedAt: serverTimestamp() });
  await batch.commit();
  announceChange();
  if (flags) window.dispatchEvent(new Event("sgblack:leave-flags-changed"));
  return ref.id;
}

/** Retira una solicitud propia que todavía está pendiente. */
export async function cancelLeave(id: string): Promise<void> {
  const { db } = getFirebase();
  await deleteDoc(doc(db, "leave_requests", id));
  announceChange();
}
