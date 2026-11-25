import { collection, getDocs, query, where } from "firebase/firestore";
import type { LeaveRequest, TimeEntry, TimeEntryDoc, UserSummary } from "@/domain/model";
import { listUsers } from "./company";
import { getFirebase } from "./firebase";
import { listApprovedLeavesOverlapping } from "./leaves";
import { listApprovedBetween } from "./timeEntries";

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
  const [approved, openSnap, users, privateSnap, leaves] = await Promise.all([
    listApprovedBetween(from, to),
    getDocs(query(collection(db, "time_entries"), where("status", "in", ["submitted", "observed"]), where("date", ">=", from), where("date", "<=", to))),
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
    approved,
    open: openSnap.docs.map((d) => ({ id: d.id, ...(d.data() as TimeEntryDoc) })),
    users,
    cuilByUid,
    leaves,
  };
}
