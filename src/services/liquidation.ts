import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import type { PayModel } from "@/domain/features";
import { DEFAULT_PARAMS, DEFAULT_VISIBILITY, type PayrollParams, type Visibility } from "@/domain/payroll/defaults";
import type { PayslipResult } from "@/domain/payroll/engine";
import type { ManualNovelties } from "@/domain/payroll/novelties";
import { getFirebase } from "./firebase";

/** Aviso interno: cambió algo de la liquidación y las pantallas abiertas deben volver a leerla. */
export const PAYROLL_CHANGED = "horus:payroll-changed";

export interface StoredPayslip {
  userId: string;
  period: string;
  manual: ManualNovelties;
  result: PayslipResult;
  rate: number;
  payModel: PayModel;
}

/** Firestore no acepta `undefined`: se limpian los campos vacíos antes de guardar. */
const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export async function loadPayrollSettings(): Promise<{ params: PayrollParams; visibility: Visibility }> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, "settings", "payroll"));
  const data = (snap.exists() ? snap.data() : {}) as { params?: Partial<PayrollParams>; visibility?: Partial<Visibility> };
  return {
    params: { ...DEFAULT_PARAMS, ...(data.params ?? {}) },
    visibility: { convenio: { ...DEFAULT_VISIBILITY.convenio, ...(data.visibility?.convenio ?? {}) }, fuera: { ...DEFAULT_VISIBILITY.fuera, ...(data.visibility?.fuera ?? {}) } },
  };
}

export async function savePayrollSettings(params: PayrollParams, visibility: Visibility, byEmail: string): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, "settings", "payroll"), clean({ params, visibility, updatedAt: serverTimestamp(), updatedBy: byEmail }));
  window.dispatchEvent(new Event(PAYROLL_CHANGED));
}

export async function listPayslips(period: string): Promise<Map<string, StoredPayslip>> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, "payslips"), where("period", "==", period)));
  return new Map(snap.docs.map((d) => [(d.data() as StoredPayslip).userId, d.data() as StoredPayslip]));
}

/** Recibos guardados entre dos períodos (para el SAC: la mejor remuneración del semestre). */
export async function listPayslipsBetween(fromPeriod: string, toPeriod: string): Promise<StoredPayslip[]> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, "payslips"), where("period", ">=", fromPeriod), where("period", "<=", toPeriod)));
  return snap.docs.map((d) => d.data() as StoredPayslip);
}

/** Guarda todos los recibos del mes en un solo paso (todo o nada). Las reglas lo rechazan si el período está cerrado. */
export async function savePayslips(slips: readonly StoredPayslip[], byEmail: string): Promise<void> {
  const { db } = getFirebase();
  for (let i = 0; i < slips.length; i += 200) {
    const batch = writeBatch(db);
    for (const s of slips.slice(i, i + 200)) {
      batch.set(doc(db, "payslips", `${s.userId}_${s.period}`), clean({ ...s, createdAt: serverTimestamp(), createdBy: byEmail, updatedAt: serverTimestamp() }));
    }
    await batch.commit();
  }
  window.dispatchEvent(new Event(PAYROLL_CHANGED));
}

export async function isPeriodClosed(period: string): Promise<boolean> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, "payroll_periods", period));
  return snap.exists() && (snap.data() as { closed?: boolean }).closed === true;
}

export async function setPeriodClosed(period: string, closed: boolean, byEmail: string): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, "payroll_periods", period), closed ? { closed: true, closedAt: serverTimestamp(), closedBy: byEmail } : { closed: false, reopenedAt: serverTimestamp(), reopenedBy: byEmail });
  window.dispatchEvent(new Event(PAYROLL_CHANGED));
}
