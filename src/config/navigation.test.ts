import { describe, expect, it } from "vitest";
import { NAV_ITEMS, canAccess, navigationFor } from "./navigation";
import { ROLES } from "@/domain/types";

const ids = (role: Parameters<typeof navigationFor>[0]) => navigationFor(role).map((i) => i.id);

describe("navegación por rol", () => {
  it("el empleado ve su carga, sus licencias y el calendario, pero no aprueba ni administra", () => {
    expect(ids("employee")).toEqual(["home", "week", "hours", "leave", "team"]);
  });

  it("el supervisor ve lo del empleado y además aprueba", () => {
    expect(ids("supervisor")).toEqual(["home", "week", "hours", "leave", "team", "approvals"]);
  });

  it("el admin administra todo y no carga horas propias", () => {
    expect(ids("admin")).toEqual(["home", "team", "approvals", "directory", "projects", "reports", "settings"]);
  });

  it("canAccess bloquea las rutas que el rol no ve", () => {
    expect(canAccess("employee", "/configuracion")).toBe(false);
    expect(canAccess("employee", "/aprobaciones")).toBe(false);
    expect(canAccess("supervisor", "/reportes")).toBe(false);
    expect(canAccess("admin", "/semana")).toBe(false);
    expect(canAccess("admin", "/reportes")).toBe(true);
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
