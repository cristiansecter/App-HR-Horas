import { describe, expect, it } from "vitest";
import { buildOrgChart, descendantsOf, moveProblem, type OrgPerson } from "./orgchart";

const p = (uid: string, role: OrgPerson["role"], supervisorId?: string, active = true): OrgPerson => ({ uid, fullName: uid.toUpperCase(), role, active, ...(supervisorId ? { supervisorId } : {}) });
const people = [
  p("ana", "admin"),
  p("sofia", "supervisor", "ana"),
  p("diego", "supervisor", "ana"),
  p("emi", "employee", "sofia"),
  p("eze", "employee", "sofia"),
  p("olga", "employee", "diego"),
  p("suelto", "employee"),
];

describe("buildOrgChart", () => {
  const chart = buildOrgChart(people);
  it("arma administrador → supervisores → empleados", () => {
    expect(chart.roots.map((n) => n.person.uid)).toEqual(["ana"]);
    const ana = chart.roots[0]!;
    expect(ana.children.map((n) => n.person.uid)).toEqual(["diego", "sofia"]);
    expect(ana.children.find((n) => n.person.uid === "sofia")!.children.map((n) => n.person.uid)).toEqual(["emi", "eze"]);
  });
  it("los empleados sin supervisor van aparte", () => {
    expect(chart.unassigned.map((x) => x.uid)).toEqual(["suelto"]);
  });
  it("no cuenta a las personas dadas de baja", () => {
    const c = buildOrgChart([...people, p("baja", "employee", "sofia", false)]);
    expect(JSON.stringify(c)).not.toContain("baja");
  });
  it("un supervisor sin superior encabeza su propio árbol", () => {
    const c = buildOrgChart([p("jefe", "supervisor"), p("x", "employee", "jefe")]);
    expect(c.roots.map((n) => n.person.uid)).toEqual(["jefe"]);
    expect(c.roots[0]!.children.map((n) => n.person.uid)).toEqual(["x"]);
  });
  it("si el superior está de baja o no existe, la persona queda arriba o sin asignar", () => {
    const c = buildOrgChart([p("ana", "admin"), p("s", "supervisor", "fantasma"), p("e", "employee", "fantasma")]);
    expect(c.roots.map((n) => n.person.uid)).toEqual(["ana", "s"]);
    expect(c.unassigned.map((x) => x.uid)).toEqual(["e"]);
  });
  it("un empleado no puede ser superior de nadie: quien figure bajo un empleado queda sin ese superior", () => {
    const c = buildOrgChart([p("ana", "admin"), p("e1", "employee", "ana"), p("e2", "employee", "e1")]);
    expect(c.unassigned.map((x) => x.uid)).toEqual(["e2"]);
  });
  it("un ciclo en los datos no cuelga el armado", () => {
    const c = buildOrgChart([p("a", "supervisor", "b"), p("b", "supervisor", "a")]);
    expect(c.roots.length).toBeGreaterThan(0);
    expect(JSON.stringify(c).split('"uid":"a"').length - 1).toBe(1);
  });
});

describe("descendantsOf y moveProblem", () => {
  it("descendientes directos e indirectos", () => {
    expect([...descendantsOf(people, "ana")].sort()).toEqual(["diego", "emi", "eze", "olga", "sofia"]);
    expect([...descendantsOf(people, "sofia")].sort()).toEqual(["emi", "eze"]);
    expect(descendantsOf(people, "emi").size).toBe(0);
  });
  it("mover está permitido bajo un supervisor o un administrador, o a ninguno", () => {
    expect(moveProblem(people, "emi", "diego")).toBeNull();
    expect(moveProblem(people, "emi", "ana")).toBeNull();
    expect(moveProblem(people, "emi", null)).toBeNull();
  });
  it("no se puede mover bajo sí mismo, bajo un empleado ni bajo un descendiente", () => {
    expect(moveProblem(people, "sofia", "sofia")).toBe("self");
    expect(moveProblem(people, "emi", "eze")).toBe("cannot_supervise");
    expect(moveProblem(people, "sofia", "emi")).toBe("cannot_supervise");
    expect(moveProblem(people, "ana", "sofia")).toBe("cycle");
    expect(moveProblem(people, "sofia", "fantasma")).toBe("cannot_supervise");
  });
});
