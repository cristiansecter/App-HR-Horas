import type { Role } from "./types";
import type { WorkSchedule } from "./overtime/types";

/** Estado de un registro de horas. */
export type EntryStatus = "draft" | "submitted" | "approved" | "observed";

export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  draft: "Borrador",
  submitted: "Enviado",
  approved: "Aprobado",
  observed: "Observado",
};

export type LeaveType = "vacation" | "sick" | "study" | "personal" | "unjustified" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected";

/** `users/{uid}`: perfil visible para todo el equipo. Lo sensible vive en `employee_private`. */
export interface UserProfile {
  fullName: string;
  email: string;
  /** Copia informativa del rol. La fuente de verdad es el custom claim del token. */
  role: Role;
  employeeNumber?: string;
  department?: string;
  position?: string;
  hireDate?: string;
  supervisorId?: string;
  workSchedule?: WorkSchedule;
  active: boolean;
}

/** `time_entries/{id}`. `hours` y `breakdown` los escribe solo quien aprueba y quedan congelados. */
export interface TimeEntryDoc {
  userId: string;
  projectId: string;
  /** AAAA-MM-DD en hora de Buenos Aires. */
  date: string;
  /** Mediodía de Buenos Aires de `date`, en milisegundos. Sirve para filtrar por ventana de edición. */
  dateMs: number;
  startTime: string;
  endTime: string;
  isOnCall: boolean;
  ticketRef: string;
  notes: string;
  status: EntryStatus;
  reviewerNote?: string;
  reviewedBy?: string;
  hours?: number;
  breakdown?: Record<string, number>;
}

export interface TimeEntry extends TimeEntryDoc {
  id: string;
}
