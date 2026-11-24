import { describe, expect, it } from "vitest";
import { buildDemoPayroll } from "./demoPayroll";

const round = (n: number) => Math.round(n * 100) / 100;

describe("planilla de ejemplo de la demo", () => {
  const { summary, detail, absences } = buildDemoPayroll();
  const by = (cat: string, name: string) => round(detail.filter((d) => d.employee === name && d.category === cat).reduce((s, d) => s + d.hours, 0));

  it("los totales coinciden con lo que muestra la pantalla de Reportes", () => {
    const sum = (f: (r: (typeof summary)[number]) => number) => round(summary.reduce((s, r) => s + f(r), 0));
    expect(sum((r) => r.daysWorked)).toBe(141);
    expect(sum((r) => r.normalHours)).toBe(1125);
    expect(sum((r) => r.tierHours.ot50 ?? 0)).toBe(26);
    expect(sum((r) => r.tierHours.ot100 ?? 0)).toBe(6);
    expect(sum((r) => r.onCallHours)).toBe(8);
    expect(sum((r) => r.holidayHours)).toBe(2);
    expect(sum((r) => r.normalHours + (r.tierHours.ot50 ?? 0) + (r.tierHours.ot100 ?? 0))).toBe(1157);
  });

  it("el detalle suma, por empleado y por categoría, lo mismo que el resumen", () => {
    for (const r of summary) {
      expect(by("Normal", r.fullName)).toBe(r.normalHours);
      expect(by("Extra 50%", r.fullName)).toBe(r.tierHours.ot50 ?? 0);
      expect(by("Extra 100%", r.fullName)).toBe(r.tierHours.ot100 ?? 0);
    }
  });

  it("las horas de guardia del detalle están marcadas y suman las del resumen", () => {
    expect(round(detail.filter((d) => d.onCall).reduce((s, d) => s + d.hours, 0))).toBe(8);
  });

  it("las ausencias del resumen coinciden con la hoja de ausencias", () => {
    expect(summary.reduce((s, r) => s + r.leaveDays.vacation + r.leaveDays.unjustified, 0)).toBe(absences.reduce((s, a) => s + a.daysInPeriod, 0));
  });

  it("ningún registro cae en fines de semana ni feriado si no corresponde a una hora extra o guardia", () => {
    for (const d of detail.filter((x) => x.category === "Normal" && !x.onCall)) expect(d.dayType).toBe("Hábil");
  });
});
