import type { Role } from "@/domain/types";

export type NavId =
  | "home"
  | "week"
  | "hours"
  | "leave"
  | "team"
  | "approvals"
  | "directory"
  | "projects"
  | "reports"
  | "settings";

export interface NavItem {
  id: NavId;
  label: string;
  path: string;
  /** Roles que ven y pueden abrir la pantalla. */
  roles: readonly Role[];
}

const ALL: readonly Role[] = ["admin", "supervisor", "employee"];

/** Única fuente de verdad del menú y de las rutas permitidas por rol. */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: "home", label: "Inicio", path: "/", roles: ALL },
  { id: "week", label: "Mi semana", path: "/semana", roles: ["supervisor", "employee"] },
  { id: "hours", label: "Mis horas", path: "/horas", roles: ["supervisor", "employee"] },
  { id: "leave", label: "Mis licencias", path: "/licencias", roles: ["supervisor", "employee"] },
  { id: "team", label: "Calendario del equipo", path: "/equipo", roles: ALL },
  { id: "approvals", label: "Aprobaciones", path: "/aprobaciones", roles: ["supervisor", "admin"] },
  { id: "directory", label: "Directorio", path: "/directorio", roles: ["admin"] },
  { id: "projects", label: "Proyectos", path: "/proyectos", roles: ["admin"] },
  { id: "reports", label: "Reportes y exportación", path: "/reportes", roles: ["admin"] },
  { id: "settings", label: "Configuración", path: "/configuracion", roles: ["admin"] },
];

export const navigationFor = (role: Role): NavItem[] => NAV_ITEMS.filter((item) => item.roles.includes(role));

export const canAccess = (role: Role, path: string): boolean =>
  NAV_ITEMS.some((item) => item.path === path && item.roles.includes(role));
