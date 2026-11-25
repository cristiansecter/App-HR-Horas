import { DEFAULT_PARAMS, showConcept, type ConceptId, type PayrollParams, type Visibility, DEFAULT_VISIBILITY } from "./defaults";
import type { PayModel } from "../features";

/**
 * Motor de cálculo de la liquidación (lado del empleado). Función pura: no toca la base ni la pantalla.
 * Portado de LiquiSu y corregido en tres puntos: el SAC usa el 50% de la mejor remuneración del semestre, el
 * divisor de las inasistencias es un parámetro, y se agregan el modelo de pago por hora y las contribuciones patronales.
 *
 * ⚠ Es una herramienta de ANOTACIÓN Y SEGUIMIENTO, no de liquidación legal: el Impuesto a las Ganancias es una versión simplificada (alícuota única,
 * no la escala progresiva anual) y cada convenio puede pedir reglas propias. Revisá el resultado con tu contador.
 */

export interface PayrollEmployee {
  convenio: boolean;
  obraSocial: string;
  hijos: number;
  /** Fecha de ingreso AAAA-MM-DD (para la antigüedad). Puede faltar. */
  hireDate?: string;
}

export interface Novelties {
  /** Horas extra por tramo (id del tramo → horas), por ejemplo { ot50: 4, ot100: 2 }. */
  hoursByTier: Record<string, number>;
  /** Horas normales trabajadas en el mes. Solo se usan en el modelo por hora. */
  normalHours: number;
  /** Días de inasistencia injustificada. */
  inasist: number;
  /** Días de vacaciones tomados en el mes (corridos). */
  vacaciones: number;
  bono: number;
  premio: number;
  viaticos: number;
  reembolsos: number;
  adelanto: number;
  embargo: number;
  /** Liquidar SAC este mes. */
  sac: boolean;
  /** Meses trabajados en el semestre (1 a 6). */
  sacMeses: number;
  /** Mejor remuneración mensual del semestre. Si falta, se usa la de este mes. */
  sacBase?: number;
}

export const EMPTY_NOVELTIES: Novelties = { hoursByTier: {}, normalHours: 0, inasist: 0, vacaciones: 0, bono: 0, premio: 0, viaticos: 0, reembolsos: 0, adelanto: 0, embargo: 0, sac: false, sacMeses: 6 };

export interface PayrollTier {
  id: string;
  label: string;
  percent: number;
}

export interface PayslipLine {
  /** Concepto de origen (para filtrar o sumar por tipo). */
  concept: ConceptId | "basico";
  label: string;
  amount: number;
  /** Línea informativa que no suma (por ejemplo, presentismo que no corresponde). */
  muted?: boolean;
}

export interface PayslipResult {
  basico: number;
  valorHora: number;
  aniosServicio: number;
  remunerativos: PayslipLine[];
  noRemunerativos: PayslipLine[];
  deducciones: PayslipLine[];
  totalRemunerativo: number;
  totalNoRemunerativo: number;
  totalDeducciones: number;
  neto: number;
  /** Lo que le cuesta a la empresa en contribuciones patronales (informativo). */
  contribucionesPatronales: number;
}

export interface PayslipInput {
  employee: PayrollEmployee;
  /** Sueldo mensual (modelo por jornada) o valor hora (modelo por hora). */
  rate: number;
  payModel: PayModel;
  novelties: Novelties;
  params?: PayrollParams;
  visibility?: Visibility;
  tiers: readonly PayrollTier[];
  /** Primer día del período que se liquida, AAAA-MM-DD. */
  periodStart: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (lines: readonly PayslipLine[]) => r2(lines.filter((l) => !l.muted).reduce((s, l) => s + l.amount, 0));

/** Años cumplidos entre dos fechas AAAA-MM-DD (0 si falta alguna o si la primera es posterior). */
export const fullYearsBetween = (from: string | undefined, to: string): number => {
  if (!from) return 0;
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  let years = ty - fy;
  if (tm < fm || (tm === fm && td < fd)) years--;
  return Math.max(0, years);
};

export function calculatePayslip(input: PayslipInput): PayslipResult {
  const p = input.params ?? DEFAULT_PARAMS;
  const vis = input.visibility ?? DEFAULT_VISIBILITY;
  const { employee: emp, novelties: nov, tiers } = input;
  const V = (id: ConceptId) => showConcept(id, emp.convenio, vis);
  const hourly = input.payModel === "hourly";

  const remun: PayslipLine[] = [];
  const noRemun: PayslipLine[] = [];
  const deduc: PayslipLine[] = [];

  // --- Básico: el sueldo mensual, o el valor hora por las horas normales trabajadas ---
  const basico = r2(hourly ? input.rate * nov.normalHours : input.rate);
  remun.push({ concept: "basico", label: hourly ? `Horas normales (${nov.normalHours} h)` : "Sueldo básico", amount: basico });

  // --- Antigüedad ---
  const years = fullYearsBetween(emp.hireDate, input.periodStart);
  const antiguedad = V("antiguedad") ? r2(basico * (p.antiguedadPct / 100) * years) : 0;
  if (years > 0 && V("antiguedad")) remun.push({ concept: "antiguedad", label: `Antigüedad (${years} año${years === 1 ? "" : "s"} × ${p.antiguedadPct}%)`, amount: antiguedad });

  // --- Presentismo: solo si no hubo inasistencias ---
  const presentismoAplica = V("presentismo") && (emp.convenio || p.presentismoFueraConvenio);
  if (presentismoAplica && nov.inasist === 0) {
    remun.push({ concept: "presentismo", label: `Presentismo (${p.presentismoPct}%)`, amount: r2((basico + antiguedad) * (p.presentismoPct / 100)) });
  } else if (presentismoAplica) {
    remun.push({ concept: "presentismo", label: "Presentismo (no corresponde: inasistencias)", amount: 0, muted: true });
  }

  // --- Horas extra, por tramo: valor hora × (1 + recargo) × horas ---
  const valorHora = hourly ? input.rate : (basico + (p.horasExtraSobreRemNormal ? antiguedad : 0)) / p.divisorHorasExtra;
  if (V("horasExtra")) {
    for (const tier of tiers) {
      const hours = nov.hoursByTier[tier.id] ?? 0;
      if (hours > 0) remun.push({ concept: "horasExtra", label: `${tier.label} (${hours} hs)`, amount: r2(valorHora * (1 + tier.percent / 100) * hours) });
    }
  }

  // --- Vacaciones: valor día × días corridos tomados ---
  if (V("vacaciones") && nov.vacaciones > 0) {
    const valorDia = hourly ? input.rate * p.horasJornada : basico / p.divisorVacaciones;
    remun.push({ concept: "vacaciones", label: `Vacaciones (${nov.vacaciones} días)`, amount: r2(valorDia * nov.vacaciones) });
  }

  if (V("bonoIndividual") && nov.bono > 0) remun.push({ concept: "bonoIndividual", label: emp.convenio ? "Bono acordado individualmente" : "Bono / gratificación fuera de convenio", amount: r2(nov.bono) });
  if (V("premio") && nov.premio > 0) remun.push({ concept: "premio", label: "Premio por desempeño", amount: r2(nov.premio) });

  // --- Inasistencias injustificadas: se descuentan en el modelo por jornada; por hora simplemente no se pagan ---
  if (!hourly && V("inasistencias") && nov.inasist > 0) {
    remun.push({ concept: "inasistencias", label: `Descuento por inasistencias (${nov.inasist} días)`, amount: -r2((basico / p.divisorInasistencias) * nov.inasist) });
  }

  // --- SAC: 50% de la mejor remuneración mensual del semestre, proporcional a los meses trabajados ---
  const remunBeforeSac = sum(remun);
  if (V("sac") && nov.sac) {
    const months = Math.min(6, Math.max(1, Math.trunc(nov.sacMeses || 6)));
    const best = nov.sacBase && nov.sacBase > 0 ? nov.sacBase : remunBeforeSac;
    remun.push({ concept: "sac", label: `SAC (50% de la mejor remuneración × ${months}/6)`, amount: r2(best * 0.5 * (months / 6)) });
  }
  const totalRemunerativo = sum(remun);

  // --- No remunerativos ---
  if (V("bonoConvenio") && emp.convenio && p.bonoConvenio > 0) noRemun.push({ concept: "bonoConvenio", label: "Bono no remunerativo (acuerdo de convenio)", amount: r2(p.bonoConvenio) });
  if (V("viaticos") && nov.viaticos > 0) noRemun.push({ concept: "viaticos", label: "Viáticos", amount: r2(nov.viaticos) });
  if (V("reembolsos") && nov.reembolsos > 0) noRemun.push({ concept: "reembolsos", label: "Reembolsos de gastos", amount: r2(nov.reembolsos) });
  if (V("asignacionFamiliar") && emp.hijos > 0) noRemun.push({ concept: "asignacionFamiliar", label: `Asignación familiar por hijo (${emp.hijos})`, amount: r2(p.asignacionHijo * emp.hijos) });
  const totalNoRemunerativo = sum(noRemun);

  // --- Aportes sobre la base remunerativa (con tope si hay) ---
  const base = p.topeAportes > 0 ? Math.min(totalRemunerativo, p.topeAportes) : totalRemunerativo;
  if (V("jubilacion")) deduc.push({ concept: "jubilacion", label: `Jubilación — SIPA (${p.jubilacionPct}%)`, amount: r2(base * (p.jubilacionPct / 100)) });
  if (V("pami")) deduc.push({ concept: "pami", label: `Ley 19.032 / PAMI (${p.pamiPct}%)`, amount: r2(base * (p.pamiPct / 100)) });
  if (V("obraSocial")) deduc.push({ concept: "obraSocial", label: `Obra social${emp.obraSocial ? ` — ${emp.obraSocial}` : ""} (${p.obraSocialPct}%)`, amount: r2(base * (p.obraSocialPct / 100)) });
  if (V("sindical") && emp.convenio && p.sindicalPct > 0) deduc.push({ concept: "sindical", label: `Aporte sindical (${p.sindicalPct}%)`, amount: r2(base * (p.sindicalPct / 100)) });

  // --- Ganancias: SIMPLIFICADO (alícuota única sobre el excedente del mínimo no imponible y de las cargas de familia) ---
  if (V("ganancias")) {
    const taxable = Math.max(0, totalRemunerativo - p.minNoImponible - p.deduccionHijo * emp.hijos);
    if (taxable > 0 && p.alicuotaGananciasPct > 0) deduc.push({ concept: "ganancias", label: "Retención Impuesto a las Ganancias (simplificado)", amount: r2(taxable * (p.alicuotaGananciasPct / 100)) });
  }
  if (V("adelanto") && nov.adelanto > 0) deduc.push({ concept: "adelanto", label: "Adelanto de sueldo", amount: r2(nov.adelanto) });
  if (V("embargo") && nov.embargo > 0) deduc.push({ concept: "embargo", label: "Embargo judicial", amount: r2(nov.embargo) });
  const totalDeducciones = sum(deduc);

  return {
    basico,
    valorHora: r2(valorHora),
    aniosServicio: years,
    remunerativos: remun,
    noRemunerativos: noRemun,
    deducciones: deduc,
    totalRemunerativo,
    totalNoRemunerativo,
    totalDeducciones,
    neto: r2(totalRemunerativo + totalNoRemunerativo - totalDeducciones),
    contribucionesPatronales: r2(totalRemunerativo * (p.contribucionesPatronalesPct / 100)),
  };
}
