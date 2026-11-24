import type { Role, SessionUser } from "@/domain/types";

/** Usuarios de la instancia de demostración. Datos inventados. */
export const DEMO_USERS: Record<Role, SessionUser> = {
  admin: { uid: "demo-admin", fullName: "Marcela Ibarra", email: "marcela.ibarra@demo.example", role: "admin" },
  supervisor: { uid: "demo-supervisor", fullName: "Diego Acosta", email: "diego.acosta@demo.example", role: "supervisor" },
  employee: { uid: "demo-employee", fullName: "Camila Romero", email: "camila.romero@demo.example", role: "employee" },
};

export const DEMO_SUPERVISOR_OF: Partial<Record<Role, string>> = { employee: "Diego Acosta", supervisor: "Marcela Ibarra" };

/** Cantidad de registros pendientes de aprobación que muestra el menú en la demo. */
export const DEMO_PENDING_APPROVALS = 18;
