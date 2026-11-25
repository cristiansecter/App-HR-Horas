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

export type LeaveType = "vacation" | "sick" | "study" | "personal" | "unjustified";
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

/** `projects/{código}`. El id del documento es el código del proyecto. */
export interface Project {
  code: string;
  name: string;
  client: string;
  budgetHours: number;
  active: boolean;
}

export interface UserSummary extends UserProfile {
  uid: string;
}

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  vacation: "Vacaciones",
  sick: "Enfermedad",
  study: "Día de estudio",
  personal: "Trámite personal",
  unjustified: "Injustificada",
};

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
};

/** Tipos que la persona puede solicitar. La injustificada la registra quien supervisa. */
export const REQUESTABLE_LEAVE_TYPES: readonly LeaveType[] = ["vacation", "sick", "study", "personal"];

/** `leave_requests/{id}`. */
export interface LeaveRequestDoc {
  userId: string;
  type: LeaveType;
  /** AAAA-MM-DD, ambos incluidos. */
  startDate: string;
  endDate: string;
  /** Días según el tipo: corridos para vacaciones, hábiles de la jornada para el resto. */
  daysCount: number;
  reason: string;
  status: LeaveStatus;
  createdBy: string;
  approvedBy?: string;
  reviewerNote?: string;
}

export interface LeaveRequest extends LeaveRequestDoc {
  id: string;
}

/** `team_absences/{id de la licencia}`: solo "ausente", sin el tipo (es un dato de salud). */
export interface TeamAbsence {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  leaveId: string;
}

export type WorkMode = "onsite" | "remote" | "hybrid";

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  onsite: "Presencial",
  remote: "Remoto",
  hybrid: "Híbrido",
};

/** `employee_private/{uid}`: datos sensibles de la ficha. Solo los lee y escribe el administrador. */
export interface EmployeePrivate {
  userId: string;
  cuil: string;
  dni: string;
  phone: string;
  workMode?: WorkMode;
}
