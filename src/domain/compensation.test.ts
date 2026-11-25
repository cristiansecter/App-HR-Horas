import { describe, expect, it } from "vitest";
import { addRate, costPerHour, currentEntry, rateAt, rateProblems, removeRate, replaceRate, type RateEntry } from "./compensation";

const e = (from: string, amount: number): RateEntry => ({ from, amount, setBy: "a@x.example", setAt: "2026-01-01T00:00:00Z" });

describe("rateAt", () => {
  const rates = [e("2026-01-01", 1000), e("2026-07-01", 1200), e("2026-10-01", 1500)];
  it("devuelve el valor vigente en una fecha", () => {
    expect(rateAt(rates, "2026-01-01")).toBe(1000);
    expect(rateAt(rates, "2026-06-30")).toBe(1000);
    expect(rateAt(rates, "2026-07-01")).toBe(1200);
    expect(rateAt(rates, "2026-12-31")).toBe(1500);
  });
  it("antes de la primera vigencia no hay valor", () => {
    expect(rateAt(rates, "2025-12-31")).toBeNull();
    expect(rateAt([], "2026-01-01")).toBeNull();
  });
  it("no depende del orden en que vengan", () => {
    expect(rateAt([...rates].reverse(), "2026-08-15")).toBe(1200);
  });
});

describe("addRate", () => {
  it("agrega y ordena", () => {
    const out = addRate([e("2026-07-01", 2), e("2026-01-01", 1)], e("2026-04-01", 15));
    expect(out.map((r) => r.from)).toEqual(["2026-01-01", "2026-04-01", "2026-07-01"]);
  });
  it("una vigencia con la misma fecha reemplaza a la anterior", () => {
    const out = addRate([e("2026-01-01", 1)], e("2026-01-01", 9));
    expect(out).toHaveLength(1);
    expect(out[0]!.amount).toBe(9);
  });
  it("no modifica la lista original", () => {
    const original = [e("2026-01-01", 1)];
    addRate(original, e("2026-02-01", 2));
    expect(original).toHaveLength(1);
  });
});

describe("currentEntry", () => {
  it("es la vigencia de hoy y no una futura", () => {
    const rates = [e("2026-01-01", 1), e("2027-01-01", 2)];
    expect(currentEntry(rates, "2026-11-25")!.amount).toBe(1);
    expect(currentEntry(rates, "2025-01-01")).toBeNull();
  });
});

describe("rateProblems", () => {
  it("acepta datos válidos", () => {
    expect(rateProblems("2026-11-01", 850000)).toEqual([]);
  });
  it("rechaza fecha inválida, monto cero, negativo, NaN o desmedido", () => {
    expect(rateProblems("2026-02-30", 1)).toHaveLength(1);
    expect(rateProblems("2026-11-01", 0)).toHaveLength(1);
    expect(rateProblems("2026-11-01", -5)).toHaveLength(1);
    expect(rateProblems("2026-11-01", Number.NaN)).toHaveLength(1);
    expect(rateProblems("2026-11-01", 5_000_000_000)).toHaveLength(1);
  });
});

describe("costPerHour", () => {
  it("por hora: el valor hora tal cual", () => {
    expect(costPerHour("hourly", 4500, 160)).toBe(4500);
  });
  it("por jornada: el sueldo dividido las horas del mes", () => {
    expect(costPerHour("salary", 800000, 160)).toBe(5000);
  });
  it("sin horas del mes no divide por cero", () => {
    expect(costPerHour("salary", 800000, 0)).toBe(0);
  });
});

describe("replaceRate (corregir una vigencia)", () => {
  const rates = [e("2026-01-01", 1000), e("2026-07-01", 1200)];
  it("cambia el monto y deja constancia de quién y cuándo, sin pisar la carga original", () => {
    const out = replaceRate(rates, "2026-07-01", { from: "2026-07-01", amount: 1300 }, "ana@x.example", "2026-11-25T10:00:00Z")!;
    expect(out[1]).toEqual({ from: "2026-07-01", amount: 1300, setBy: "a@x.example", setAt: "2026-01-01T00:00:00Z", editedBy: "ana@x.example", editedAt: "2026-11-25T10:00:00Z" });
    expect(out[0]).toEqual(rates[0]);
  });
  it("cambiar la fecha reordena el historial (una fecha cargada mal)", () => {
    const out = replaceRate(rates, "2026-07-01", { from: "2025-12-01", amount: 1200 }, "ana@x.example", "t")!;
    expect(out.map((r) => r.from)).toEqual(["2025-12-01", "2026-01-01"]);
    expect(rateAt(out, "2026-01-15")).toBe(1000);
  });
  it("si la fecha nueva ya tiene otra vigencia, no hace nada", () => {
    expect(replaceRate(rates, "2026-07-01", { from: "2026-01-01", amount: 5 }, "a", "t")).toBeNull();
  });
  it("si la vigencia ya no existe, no hace nada", () => {
    expect(replaceRate(rates, "2026-09-09", { from: "2026-09-09", amount: 5 }, "a", "t")).toBeNull();
  });
  it("no modifica la lista original", () => {
    replaceRate(rates, "2026-07-01", { from: "2026-07-01", amount: 1 }, "a", "t");
    expect(rates[1]!.amount).toBe(1200);
  });
});

describe("removeRate", () => {
  it("quita solo la vigencia de esa fecha", () => {
    const rates = [e("2026-01-01", 1000), e("2026-07-01", 1200)];
    expect(removeRate(rates, "2026-07-01")).toEqual([rates[0]]);
    expect(rateAt(removeRate(rates, "2026-07-01"), "2026-12-01")).toBe(1000);
  });
  it("una fecha inexistente deja todo igual", () => {
    const rates = [e("2026-01-01", 1000)];
    expect(removeRate(rates, "2030-01-01")).toEqual(rates);
  });
});
