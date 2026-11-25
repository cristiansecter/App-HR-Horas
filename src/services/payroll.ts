import { collection, getDocs } from "firebase/firestore";
import type { LeaveRequest, TimeEntry, UserSummary } from "@/domain/model";
import { listUsers } from "./company";
import { getFirebase } from "./firebase";
import { listApprovedLeavesOverlapping } from "./leaves";
import { listEntriesBetween } from "./timeEntries";

export interface PayrollRawData {
  approved: TimeEntry[];
  open: TimeEntry[];
  users: UserSummary[];
  cuilByUid: Map<string, string>;
  leaves: LeaveRequest[];
}

/**
 * Lo que hace falta para la planilla de un período. Solo administrador: lee a todo el equipo
 * y los datos personales (CUIL) de `employee_private`, que las reglas no dejan ver a nadie más.
 */
export async function loadPayrollRaw(from: string, to: string): Promise<PayrollRawData> {
  const { db } = getFirebase();
  const [entries, users, privateSnap, leaves] = await Promise.all([
    listEntriesBetween(from, to),
    listUsers(),
    getDocs(collection(db, "employee_private")),
    listApprovedLeavesOverlapping(from, to),
  ]);
  const cuilByUid = new Map<string, string>();
  privateSnap.forEach((d) => {
    const cuil = (d.data() as { cuil?: string }).cuil;
    if (cuil) cuilByUid.set(d.id, cuil);
  });
  return {
    approved: entries.filter((e) => e.status === "approved"),
    open: entries.filter((e) => e.status === "submitted" || e.status === "observed"),
    users,
    cuilByUid,
    leaves,
  };
}
