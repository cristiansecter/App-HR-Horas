import { describe, expect, it } from "vitest";
import { NAV_ITEMS, canAccess, navigationFor } from "./navigation";
import { ROLES } from "@/domain/types";
import { DEFAULT_FEATURES, setWorkMode, toggleModule } from "@/domain/features";

const ids = (role: Parameters<typeof navigationFor>[0]) => navigationFor(role).map((i) => i.id);

describe("navegación por rol", () => {
  it("el empleado ve su carga, sus licencias y el calendario, pero no aprueba ni administra", () => {
    expect(ids("employee")).toEqual(["home", "week", "hours", "leave", "team", "documents"]);
  });

  it("el supervisor ve lo del empleado y además aprueba", () => {
    expect(ids("supervisor")).toEqual(["home", "week", "hours", "leave", "team", "documents", "approvals", "assignments"]);
  });

  it("el admin administra todo y no carga horas propias", () => {
    expect(ids("admin")).toEqual(["home", "team", "documents", "approvals", "assignments", "directory", "projects", "reports", "settings"]);
  });

  it("canAccess bloquea las rutas que el rol no ve", () => {
    expect(canAccess("employee", "/configuracion")).toBe(false);
    expect(canAccess("employee", "/aprobaciones")).toBe(false);
    expect(canAccess("supervisor", "/reportes")).toBe(false);
    expect(canAccess("admin", "/semana")).toBe(false);
    expect(canAccess("admin", "/reportes")).toBe(true);
    expect(canAccess("employee", "/asignaciones")).toBe(false);
    expect(canAccess("supervisor", "/asignaciones")).toBe(true);
    expect(canAccess("admin", "/asignaciones")).toBe(true);
  });

  it("una ruta que no existe no es accesible para nadie", () => {
    for (const role of ROLES) expect(canAccess(role, "/no-existe")).toBe(false);
  });

  it("no hay rutas ni ids repetidos y todo ítem tiene al menos un rol", () => {
    const paths = NAV_ITEMS.map((i) => i.path);
    const itemIds = NAV_ITEMS.map((i) => i.id);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(itemIds).size).toBe(itemIds.length);
    for (const item of NAV_ITEMS) expect(item.roles.length).toBeGreaterThan(0);
  });
});

describe("Sueldos del equipo (permiso del Configurador)", () => {
  const withPay = { ...toggleModule(DEFAULT_FEATURES, "compensation", true), supervisorsSeePay: true };
  const moduleOnly = toggleModule(DEFAULT_FEATURES, "compensation", true);
  it("el supervisor la ve solo con el módulo de sueldos y el permiso activos", () => {
    expect(navigationFor("supervisor", withPay).map((i) => i.id)).toContain("teamPay");
    expect(navigationFor("supervisor", moduleOnly).map((i) => i.id)).not.toContain("teamPay");
    expect(navigationFor("supervisor", { ...DEFAULT_FEATURES, supervisorsSeePay: true }).map((i) => i.id)).not.toContain("teamPay");
    expect(navigationFor("supervisor", DEFAULT_FEATURES).map((i) => i.id)).not.toContain("teamPay");
    expect(navigationFor("supervisor").map((i) => i.id)).not.toContain("teamPay");
  });
  it("ni el empleado ni el admin la tienen, aunque el permiso esté activo", () => {
    expect(canAccess("employee", "/sueldos-equipo", withPay)).toBe(false);
    expect(canAccess("admin", "/sueldos-equipo", withPay)).toBe(false);
    expect(canAccess("supervisor", "/sueldos-equipo", withPay)).toBe(true);
    expect(canAccess("supervisor", "/sueldos-equipo", moduleOnly)).toBe(false);
  });
});

describe("modo de trabajo", () => {
  const att = setWorkMode(DEFAULT_FEATURES, "attendance");
  const idsOf = (role: Parameters<typeof navigationFor>[0], f = att) => navigationFor(role, f).map((i) => i.id);
  it("por asistencia el empleado ve su asistencia y no la carga de horas", () => {
    const ids = idsOf("employee");
    expect(ids).toContain("myAttendance");
    for (const hidden of ["week", "hours"]) expect(ids).not.toContain(hidden);
    expect(ids).toEqual(expect.arrayContaining(["home", "leave", "team", "documents"]));
  });
  it("por asistencia el supervisor ve la asistencia del equipo y no asignar proyectos", () => {
    const ids = idsOf("supervisor");
    expect(ids).toEqual(expect.arrayContaining(["myAttendance", "teamAttendance", "approvals"]));
    expect(ids).not.toContain("assignments");
  });
  it("por asistencia el admin no ve proyectos, reportes de horas ni asignaciones, y sí la asistencia del equipo", () => {
    const ids = idsOf("admin");
    expect(ids).toContain("teamAttendance");
    for (const hidden of ["projects", "reports", "assignments", "performance", "projection"]) expect(ids).not.toContain(hidden);
    expect(ids).toEqual(expect.arrayContaining(["directory", "settings", "approvals", "documents"]));
  });
  it("por proyectos (o sin configurar) no aparece nada de asistencia", () => {
    for (const role of ROLES) {
      for (const f of [DEFAULT_FEATURES, undefined]) {
        const ids = navigationFor(role, f).map((i) => i.id);
        expect(ids).not.toContain("myAttendance");
        expect(ids).not.toContain("teamAttendance");
      }
    }
  });
  it("las rutas de asistencia solo se abren en ese modo y para el rol que corresponde", () => {
    expect(canAccess("employee", "/asistencia", att)).toBe(true);
    expect(canAccess("employee", "/asistencia", DEFAULT_FEATURES)).toBe(false);
    expect(canAccess("employee", "/asistencia-equipo", att)).toBe(false);
    expect(canAccess("supervisor", "/asistencia-equipo", att)).toBe(true);
    expect(canAccess("admin", "/asistencia-equipo", att)).toBe(true);
    expect(canAccess("admin", "/asistencia", att)).toBe(false);
    expect(canAccess("employee", "/horas", att)).toBe(false);
    expect(canAccess("supervisor", "/asignaciones", att)).toBe(false);
  });
});
