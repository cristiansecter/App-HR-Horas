import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { DEFAULT_COSTING, type CostingParams, type ProjectRate } from "@/domain/performance";
import { getFirebase } from "./firebase";

/** Aviso interno: cambió una tarifa o un parámetro de costos. */
export const PERFORMANCE_CHANGED = "horus:performance-changed";

/** Tarifas de cobro por proyecto. Solo administrador, con el módulo Rendimiento activo (lo exigen las reglas). */
export async function listProjectRates(): Promise<Map<string, ProjectRate>> {
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, "project_rates"));
  return new Map(snap.docs.map((d) => {
    const data = d.data() as Partial<ProjectRate>;
    return [d.id, { hourlyRate: Number(data.hourlyRate) || 0, billable: data.billable !== false }] as const;
  }));
}

export async function saveProjectRate(code: string, rate: ProjectRate, byEmail: string): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, "project_rates", code), { hourlyRate: rate.hourlyRate, billable: rate.billable, updatedAt: serverTimestamp(), updatedBy: byEmail });
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
