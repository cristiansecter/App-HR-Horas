import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { DEFAULT_COSTING, type Billing, type CostingParams, type ProjectRate } from "@/domain/performance";
import { getFirebase } from "./firebase";

/** Aviso interno: cambió una tarifa o un parámetro de costos. */
export const PERFORMANCE_CHANGED = "sgblack:performance-changed";

/** Número finito y no negativo; cualquier otra cosa vale 0. */
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Cómo se cobra cada proyecto. Solo administrador, con Rendimiento y Facturación por proyecto activos (lo exigen las reglas).
 * Los documentos viejos (solo `hourlyRate` y `billable`) se leen como "por hora" o "interno".
 */
export async function listProjectRates(): Promise<Map<string, ProjectRate>> {
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, "project_rates"));
  return new Map(snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const billing: Billing = data.billing === "fixed" || data.billing === "none" || data.billing === "hourly" ? data.billing : data.billable === false ? "none" : "hourly";
    const personRates: Record<string, number> = {};
    if (data.personRates && typeof data.personRates === "object") {
      for (const [uid, value] of Object.entries(data.personRates as Record<string, unknown>)) if (num(value) > 0) personRates[uid] = num(value);
    }
    return [d.id, { billing, hourlyRate: num(data.hourlyRate), personRates, totalValue: num(data.totalValue), estimatedHours: num(data.estimatedHours) }] as const;
  }));
}

export async function saveProjectRate(code: string, rate: ProjectRate, byEmail: string): Promise<void> {
  const { db } = getFirebase();
  // Se guardan solo las tarifas por persona con valor: una en 0 significa "usar la general".
  const personRates = Object.fromEntries(Object.entries(rate.personRates).filter(([, v]) => v > 0));
  await setDoc(doc(db, "project_rates", code), {
    billing: rate.billing,
    hourlyRate: rate.hourlyRate,
    totalValue: rate.totalValue,
    estimatedHours: rate.estimatedHours,
    personRates,
    updatedAt: serverTimestamp(),
    updatedBy: byEmail,
  });
  window.dispatchEvent(new Event(PERFORMANCE_CHANGED));
}

export async function loadCosting(): Promise<CostingParams> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, "settings", "costing"));
  const data = (snap.exists() ? snap.data() : {}) as Partial<CostingParams>;
  return {
    employerContributionsPct: typeof data.employerContributionsPct === "number" ? data.employerContributionsPct : DEFAULT_COSTING.employerContributionsPct,
    monthlyHours: typeof data.monthlyHours === "number" ? data.monthlyHours : DEFAULT_COSTING.monthlyHours,
  };
}

export async function saveCosting(params: CostingParams, byEmail: string): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, "settings", "costing"), { ...params, updatedAt: serverTimestamp(), updatedBy: byEmail });
  window.dispatchEvent(new Event(PERFORMANCE_CHANGED));
}
