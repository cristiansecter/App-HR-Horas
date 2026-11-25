import { isValidIsoDate } from "./dates";
import type { PayModel } from "./features";

/**
 * Remuneración de una persona, con historial de vigencias.
 * `amount` es el sueldo mensual (modelo por jornada) o el valor hora (modelo por hora), según el modelo de la pyme.
 */
export interface RateEntry {
  /** Fecha desde la que rige, AAAA-MM-DD. */
  from: string;
  amount: number;
  /** Quién la cargó (email) y cuándo (ISO): queda como constancia del cambio. */
  setBy: string;
  setAt: string;
}

/** Datos del legajo que necesita la liquidación (solo se piden si el módulo está activo). */
export interface PayProfile {
  /** true = dentro de convenio colectivo (aplica aporte sindical y bono de convenio). */
  convenio: boolean;
  obraSocial: string;
  hijos: number;
}

export const DEFAULT_PAY_PROFILE: PayProfile = { convenio: true, obraSocial: "", hijos: 0 };

export interface EmployeePay extends PayProfile {
  userId: string;
  rates: RateEntry[];
}

const byFrom = (a: RateEntry, b: RateEntry) => a.from.localeCompare(b.from);

/** Valor vigente en una fecha: la última vigencia que empezó en esa fecha o antes. `null` si todavía no había ninguna. */
export const rateAt = (rates: readonly RateEntry[], date: string): number | null => {
  let found: RateEntry | null = null;
  for (const r of [...rates].sort(byFrom)) if (r.from <= date) found = r;
  return found ? found.amount : null;
};

export const currentEntry = (rates: readonly RateEntry[], today: string): RateEntry | null => {
  let found: RateEntry | null = null;
  for (const r of [...rates].sort(byFrom)) if (r.from <= today) found = r;
  return found;
};

/** Agrega una vigencia. Si ya había una con la misma fecha, la reemplaza (corrección). Devuelve la lista ordenada. */
export const addRate = (rates: readonly RateEntry[], entry: RateEntry): RateEntry[] =>
  [...rates.filter((r) => r.from !== entry.from), entry].sort(byFrom);

export const MAX_RATE = 1_000_000_000;

/** Problemas de una vigencia nueva. Vacío si está bien. */
export const rateProblems = (from: string, amount: number): string[] => {
  const out: string[] = [];
  if (!isValidIsoDate(from)) out.push("Elegí una fecha válida.");
  if (!Number.isFinite(amount) || amount <= 0) out.push("El monto tiene que ser mayor que 0.");
  else if (amount > MAX_RATE) out.push("El monto es demasiado alto: revisá que no haya un cero de más.");
  return out;
};

/** Costo de una hora de trabajo: el valor hora directo, o el sueldo mensual dividido las horas del mes. */
export const costPerHour = (model: PayModel, rate: number, monthlyHours: number): number => {
  if (model === "hourly") return rate;
  return monthlyHours > 0 ? rate / monthlyHours : 0;
};

export const AMOUNT_LABELS: Record<PayModel, { field: string; unit: string }> = {
  salary: { field: "Sueldo mensual", unit: "por mes" },
  hourly: { field: "Valor hora", unit: "por hora" },
};

export const formatArs = (n: number, decimals = 0): string =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
