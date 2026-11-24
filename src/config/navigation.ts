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
  /** Nombre del ícono (Material Symbols). */
  icon: string;
  /** "management" va bajo el título Gestión del menú. */
  group: "main" | "management";
}

const ALL: readonly Role[] = ["admin", "supervisor", "employee"];

/** Única fuente de verdad del menú y de las rutas permitidas por rol. */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: "home", label: "Inicio", path: "/", roles: ALL, icon: "dashboard", group: "main" },
  { id: "week", label: "Mi semana", path: "/semana", roles: ["supervisor", "employee"], icon: "view_week", group: "main" },
  { id: "hours", label: "Mis horas", path: "/horas", roles: ["supervisor", "employee"], icon: "history_toggle_off", group: "main" },
  { id: "leave", label: "Mis licencias", path: "/licencias", roles: ["supervisor", "employee"], icon: "beach_access", group: "main" },
  { id: "team", label: "Calendario del equipo", path: "/equipo", roles: ALL, icon: "calendar_month", group: "main" },
  { id: "approvals", label: "Aprobaciones", path: "/aprobaciones", roles: ["supervisor", "admin"], icon: "fact_check", group: "management" },
  { id: "directory", label: "Directorio", path: "/directorio", roles: ["admin"], icon: "groups", group: "management" },
  { id: "projects", label: "Proyectos", path: "/proyectos", roles: ["admin"], icon: "work", group: "management" },
  { id: "reports", label: "Reportes", path: "/reportes", roles: ["admin"], icon: "analytics", group: "management" },
  { id: "settings", label: "Configuración", path: "/configuracion", roles: ["admin"], icon: "settings", group: "management" },
];

export const navigationFor = (role: Role): NavItem[] => NAV_ITEMS.filter((item) => item.roles.includes(role));

/** Rutas que no están en el menú pero cuelgan de una pantalla del menú (por ejemplo, la ficha de un empleado). */
const SUBPAGES: Record<string, NavId> = { "/directorio/ficha": "directory" };

export const canAccess = (role: Role, path: string): boolean => {
  const subpage = SUBPAGES[path];
  return NAV_ITEMS.some((item) => (item.path === path || item.id === subpage) && item.roles.includes(role));
};
