import { describe, expect, it } from "vitest";
import { buildAlerts, DEFAULT_OVERLAP_PCT, type AlertInput, type AlertLeave, type AlertPerson } from "./alerts";
import type { Expiration } from "./expirations";

const today = "2026-11-25";
const person = (uid: string, over: Partial<AlertPerson> = {}): AlertPerson => ({ uid, fullName: uid.toUpperCase(), active: true, role: "employee", supervisorId: "sofia", ...over });
const leave = (id: string, userId: string, type: AlertLeave["type"], startDate: string, endDate: string, status = "approved"): AlertLeave => ({ id, userId, type, status, startDate, endDate });
const exp = (id: string, userId: string, kind: Expiration["kind"], date: string, title = ""): Expiration => ({ id, userId, kind, title, date });
const base: AlertInput = { today, viewer: { uid: "ana", role: "admin" }, people: [], leaves: [], expirations: [], overlapPct: DEFAULT_OVERLAP_PCT };
const run = (over: Partial<AlertInput>) => buildAlerts({ ...base, ...over });
const kinds = (a: ReturnType<typeof run>) => a.map((x) => x.kind);

describe("vacaciones que empiezan pronto", () => {
  const people = [person("emi")];
  it("avisa las aprobadas que empiezan en los próximos 30 días, con urgencia si es en una semana", () => {
    const a = run({ people, leaves: [leave("l1", "emi", "vacation", "2026-12-01", "2026-12-10"), leave("l2", "emi", "vacation", "2026-12-20", "2026-12-30")] });
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ kind: "vacation_soon", severity: "warn", title: "EMI se va de vacaciones en 6 días", detail: "Del 01/12/2026 al 10/12/2026 (10 días)." });
    expect(a[1]!.severity).toBe("info");
  });
  it("no avisa las que ya empezaron, las que están a más de 30 días, ni las pendientes o rechazadas", () => {
    expect(run({ people, leaves: [leave("a", "emi", "vacation", "2026-11-10", "2026-11-20"), leave("b", "emi", "vacation", "2027-02-01", "2027-02-10"), leave("c", "emi", "vacation", "2026-12-01", "2026-12-05", "pending"), leave("d", "emi", "vacation", "2026-12-01", "2026-12-05", "rejected")] })).toEqual([]);
  });
  it("a la propia persona le habla en segunda persona", () => {
    const a = run({ viewer: { uid: "emi", role: "employee" }, people, leaves: [leave("l1", "emi", "vacation", "2026-11-26", "2026-12-05")] });
    expect(a[0]!.title).toBe("Tus vacaciones empiezan mañana");
  });
});

describe("licencias que terminan", () => {
  const people = [person("emi")];
  it("avisa cuando una licencia en curso termina dentro de 7 días y dice cuándo vuelve", () => {
    const a = run({ people, leaves: [leave("l1", "emi", "sick", "2026-11-23", "2026-11-30")] });
    expect(a[0]).toMatchObject({ kind: "leave_ending", severity: "info", title: "EMI se reincorpora el 01/12/2026", detail: "Enfermedad hasta el 30/11/2026." });
  });
  it("es 'atención' cuando faltan 2 días o menos", () => {
    expect(run({ people, leaves: [leave("l1", "emi", "vacation", "2026-11-20", "2026-11-26")] })[0]!.severity).toBe("warn");
  });
  it("no avisa si termina en más de 7 días, si todavía no empezó ni las ausencias injustificadas", () => {
    expect(run({ people, leaves: [leave("a", "emi", "sick", "2026-11-20", "2026-12-20"), leave("b", "emi", "sick", "2026-11-26", "2026-11-27"), leave("c", "emi", "unjustified", "2026-11-25", "2026-11-25")] })).toEqual([]);
  });
});

describe("próximas incorporaciones", () => {
  it("avisa a quien supervisa o administra, no a un empleado", () => {
    const people = [person("nuevo", { hireDate: "2026-12-01" }), person("viejo", { hireDate: "2020-01-01" })];
    const a = run({ people }).filter((x) => x.kind === "new_hire");
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: "new_hire", title: "Se incorpora NUEVO en 6 días" });
    expect(run({ people, viewer: { uid: "emi", role: "employee" } }).filter((x) => x.kind === "new_hire")).toEqual([]);
  });
  it("no avisa si ya ingresó o falta más de 30 días", () => {
    expect(run({ people: [person("a", { hireDate: "2026-11-25" }), person("b", { hireDate: "2027-02-01" })] })).toEqual([]);
  });
});

describe("vencimientos", () => {
  const people = [person("emi")];
  it("urgente si vence en una semana o ya venció; atención si falta hasta 30 días", () => {
    const a = run({ people, expirations: [exp("e1", "emi", "insurance", "2026-11-30"), exp("e2", "emi", "probation", "2026-12-20"), exp("e3", "emi", "internship", "2026-11-20")] });
    expect(a.map((x) => [x.severity, x.title])).toEqual([
      ["urgent", "Venció: Pasantía de EMI"],
      ["urgent", "Seguro de EMI vence en 5 días"],
      ["warn", "Período de prueba de EMI vence en 25 días"],
    ]);
    expect(a[0]!.detail).toBe("Venció el 20/11/2026 (hace 5 días).");
  });
  it("usa el texto libre si hay", () => {
    expect(run({ people, expirations: [exp("e", "emi", "other", "2026-11-26", "Carnet de conducir")] })[0]!.title).toBe("Carnet de conducir de EMI vence mañana");
  });
  it("no avisa lo que vence en más de 30 días ni de personas fuera del alcance", () => {
    expect(run({ people, expirations: [exp("e1", "emi", "insurance", "2027-03-01"), exp("e2", "otro", "insurance", "2026-11-26")] })).toEqual([]);
  });
  it("las personas dadas de baja no generan avisos", () => {
    expect(run({ people: [person("emi", { active: false })], expirations: [exp("e1", "emi", "insurance", "2026-11-26")] })).toEqual([]);
  });
});

describe("superposición de vacaciones", () => {
  // Equipo de 5 (supervisor sofia). Umbral: 40 % = 2 personas.
  const team = ["a", "b", "c", "d", "e"].map((u) => person(u));
  it("avisa cuando 2 de 5 están de vacaciones a la vez, con el período y el pico", () => {
    const a = run({ people: team, leaves: [leave("1", "a", "vacation", "2027-01-05", "2027-01-15"), leave("2", "b", "vacation", "2027-01-10", "2027-01-20")] });
    const o = a.filter((x) => x.kind === "vacation_overlap");
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ severity: "warn", title: "Superposición de vacaciones del 10/01/2027 al 15/01/2027", detail: "2 de 5 personas de vacaciones a la vez." });
  });
  it("cuentan también las vacaciones pedidas que esperan aprobación", () => {
    const a = run({ people: team, leaves: [leave("1", "a", "vacation", "2027-01-05", "2027-01-15"), leave("2", "b", "vacation", "2027-01-10", "2027-01-20", "pending")] });
    expect(kinds(a)).toContain("vacation_overlap");
  });
  it("no avisa si nunca coinciden, ni con licencias que no son vacaciones", () => {
    expect(kinds(run({ people: team, leaves: [leave("1", "a", "vacation", "2027-01-05", "2027-01-09"), leave("2", "b", "vacation", "2027-01-12", "2027-01-20")] }))).not.toContain("vacation_overlap");
    expect(kinds(run({ people: team, leaves: [leave("1", "a", "sick", "2027-01-05", "2027-01-15"), leave("2", "b", "sick", "2027-01-10", "2027-01-20")] }))).not.toContain("vacation_overlap");
  });
  it("equipos de menos de 3 personas no generan aviso", () => {
    const two = [person("a"), person("b")];
    expect(kinds(run({ people: two, leaves: [leave("1", "a", "vacation", "2027-01-05", "2027-01-15"), leave("2", "b", "vacation", "2027-01-05", "2027-01-15")] }))).not.toContain("vacation_overlap");
  });
  it("el porcentaje es configurable: con 80 % hacen falta 4 de 5", () => {
    const lv = [leave("1", "a", "vacation", "2027-01-05", "2027-01-15"), leave("2", "b", "vacation", "2027-01-05", "2027-01-15")];
    expect(kinds(run({ people: team, leaves: lv, overlapPct: 80 }))).not.toContain("vacation_overlap");
    expect(kinds(run({ people: team, leaves: lv, overlapPct: 40 }))).toContain("vacation_overlap");
  });
  it("se calcula por equipo: dos personas de equipos distintos no se superponen entre sí", () => {
    const people = [person("a"), person("b"), person("c"), person("x", { supervisorId: "otro" }), person("y", { supervisorId: "otro" }), person("z", { supervisorId: "otro" })];
    const lv = [leave("1", "a", "vacation", "2027-01-05", "2027-01-10"), leave("2", "x", "vacation", "2027-01-05", "2027-01-10")];
    expect(kinds(run({ people, leaves: lv }))).not.toContain("vacation_overlap");
  });
  it("un empleado no recibe este aviso", () => {
    expect(kinds(run({ viewer: { uid: "a", role: "employee" }, people: team, leaves: [leave("1", "a", "vacation", "2027-01-05", "2027-01-15"), leave("2", "b", "vacation", "2027-01-05", "2027-01-15")] }))).not.toContain("vacation_overlap");
  });
});

describe("vacaciones sin tomar a fin de año", () => {
  const people = [person("emi", { hireDate: "2020-03-01" })]; // 21 días
  it("desde noviembre avisa a quien supervisa a quienes tienen 7 días o más sin pedir", () => {
    const a = run({ people, leaves: [leave("1", "emi", "vacation", "2026-01-12", "2026-01-18")] }); // tomó 7 → quedan 14
    expect(a[0]).toMatchObject({ kind: "vacation_balance", title: "EMI tiene 14 días de vacaciones sin pedir" });
    expect(a[0]!.detail).toContain("De 21 que le corresponden en 2026 (estimado). Tomó 7.");
  });
  it("antes de noviembre no avisa, ni a quien ya casi las usó", () => {
    expect(run({ today: "2026-09-10", people })).toEqual([]);
    expect(run({ people, leaves: [leave("1", "emi", "vacation", "2026-01-12", "2026-01-31")] })).toEqual([]); // 20 días tomados → queda 1
  });
});

describe("orden", () => {
  it("urgentes primero, después atención y por último lo informativo; dentro de cada nivel, por fecha", () => {
    const people = [person("emi")];
    const a = run({ people, leaves: [leave("l1", "emi", "vacation", "2026-12-20", "2026-12-30"), leave("l2", "emi", "vacation", "2026-11-28", "2026-12-05")], expirations: [exp("e1", "emi", "insurance", "2026-11-27")] });
    expect(a.map((x) => x.severity)).toEqual(["urgent", "warn", "info"]);
  });
});
