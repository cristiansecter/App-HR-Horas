import type { Features, ModuleId } from "@/domain/features";
import type { Role } from "@/domain/types";

export type NavId =
  | "home"
  | "week"
  | "hours"
  | "leave"
  | "team"
  | "approvals"
  | "directory"
  | "assignments"
  | "projection"
  | "projects"
  | "reports"
  | "performance"
  | "payroll"
  | "myPayslips"
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
  /** Si está, la pantalla solo existe cuando ese módulo está activo en la instancia. */
  module?: ModuleId;
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
  { id: "assignments", label: "Asignar proyectos", path: "/asignaciones", roles: ["supervisor", "admin"], icon: "assignment_ind", group: "management" },
  { id: "projection", label: "Proyección", path: "/proyeccion", roles: ["supervisor", "admin"], icon: "timeline", group: "management", module: "allocation" },
  { id: "directory", label: "Directorio", path: "/directorio", roles: ["admin"], icon: "groups", group: "management" },
  { id: "projects", label: "Proyectos", path: "/proyectos", roles: ["admin"], icon: "work", group: "management" },
  { id: "reports", label: "Reportes", path: "/reportes", roles: ["admin"], icon: "analytics", group: "management" },
  { id: "performance", label: "Rendimiento", path: "/rendimiento", roles: ["admin"], icon: "trending_up", group: "management", module: "performance" },
  { id: "payroll", label: "Liquidaciones", path: "/liquidacion", roles: ["admin"], icon: "payments", group: "management", module: "payroll" },
  { id: "myPayslips", label: "Mis liquidaciones", path: "/mis-liquidaciones", roles: ["supervisor", "employee"], icon: "receipt_long", group: "main", module: "payroll" },
  { id: "settings", label: "Configuración", path: "/configuracion", roles: ["admin"], icon: "settings", group: "management" },
];

const moduleActive = (item: NavItem, features?: Features): boolean => !item.module || features?.modules[item.module] === true;

/** Ítems del menú para un rol, sin los de módulos que la instancia no tiene activos. */
export const navigationFor = (role: Role, features?: Features): NavItem[] => NAV_ITEMS.filter((item) => item.roles.includes(role) && moduleActive(item, features));

/** Rutas que no están en el menú pero cuelgan de una pantalla del menú (por ejemplo, la ficha de un empleado). */
const SUBPAGES: Record<string, NavId> = { "/directorio/ficha": "directory" };

export const canAccess = (role: Role, path: string, features?: Features): boolean => {
  const subpage = SUBPAGES[path];
  return NAV_ITEMS.some((item) => (item.path === path || item.id === subpage) && item.roles.includes(role) && moduleActive(item, features));
};
