/** Roles de usuario. Los asigna únicamente el Configurador (custom claim `role`). */
export type Role = "admin" | "supervisor" | "employee";

export const ROLES: readonly Role[] = ["admin", "supervisor", "employee"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  employee: "Empleado",
};

/** Usuario con sesión iniciada. */
export interface SessionUser {
  uid: string;
  fullName: string;
  email: string;
  role: Role;
}
