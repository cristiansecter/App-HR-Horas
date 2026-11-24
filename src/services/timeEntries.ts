import { addDoc, collection, getDocs, orderBy, query, serverTimestamp, where } from "firebase/firestore";
import { noonMsBuenosAires } from "@/domain/dates";
import type { TimeEntry, TimeEntryDoc } from "@/domain/model";
import { getFirebase } from "./firebase";

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
}

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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Registros propios, del más reciente al más viejo. */
export async function listMyTimeEntries(userId: string): Promise<TimeEntry[]> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, "time_entries"), where("userId", "==", userId), orderBy("date", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TimeEntryDoc) }));
}
