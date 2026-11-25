import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import type { PayModel } from "@/domain/features";
import { DEFAULT_PARAMS, DEFAULT_VISIBILITY, type PayrollParams, type Visibility } from "@/domain/payroll/defaults";
import type { PayslipResult } from "@/domain/payroll/engine";
import type { ManualNovelties } from "@/domain/payroll/novelties";
import { getFirebase } from "./firebase";

/** Aviso interno: cambió algo de la liquidación y las pantallas abiertas deben volver a leerla. */
export const PAYROLL_CHANGED = "horus:payroll-changed";

/** Datos de la persona congelados en el recibo: si después cambia su ficha, el recibo de ese mes no cambia. */
export interface PayslipSnapshot {
  fullName: string;
  legajo: string;
  cuil: string;
  position: string;
  department: string;
  hireDate: string;
  convenio: boolean;
  obraSocial: string;
}

export interface StoredPayslip {
  userId: string;
  period: string;
  manual: ManualNovelties;
  result: PayslipResult;
  rate: number;
  payModel: PayModel;
  snapshot: PayslipSnapshot;
  /** Visible para la propia persona. Lo decide el administrador. */
  published?: boolean;
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

/**
 * Guarda recibos en un solo paso (todo o nada). Las reglas lo rechazan si el período está cerrado.
 * Un recibo que se guarda de nuevo queda SIN publicar: si cambió, el administrador lo vuelve a publicar.
 * El costo patronal no se guarda en el recibo: es un dato de la empresa y el recibo lo puede ver la propia persona.
 */
export async function savePayslips(slips: readonly StoredPayslip[], byEmail: string): Promise<void> {
  const { db } = getFirebase();
  for (let i = 0; i < slips.length; i += 200) {
    const batch = writeBatch(db);
    for (const s of slips.slice(i, i + 200)) {
      const result = { ...s.result, contribucionesPatronales: 0 };
      batch.set(doc(db, "payslips", `${s.userId}_${s.period}`), clean({ ...s, result, published: false, createdAt: serverTimestamp(), createdBy: byEmail, updatedAt: serverTimestamp() }));
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

/** Publica (o retira) recibos de un mes para que cada persona vea el suyo. Se puede hacer con el período cerrado. */
export async function publishPayslips(period: string, userIds: readonly string[], published: boolean, byEmail: string): Promise<void> {
  const { db } = getFirebase();
  for (let i = 0; i < userIds.length; i += 200) {
    const batch = writeBatch(db);
    for (const uid of userIds.slice(i, i + 200)) {
      batch.update(doc(db, "payslips", `${uid}_${period}`), { published, publishedAt: serverTimestamp(), publishedBy: byEmail });
    }
    await batch.commit();
  }
  window.dispatchEvent(new Event(PAYROLL_CHANGED));
}

/** Los recibos publicados de una persona (los suyos). Las reglas no dejan pedir otros ni los que no están publicados. */
export async function listMyPayslips(uid: string): Promise<StoredPayslip[]> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, "payslips"), where("userId", "==", uid), where("published", "==", true)));
  return snap.docs.map((d) => d.data() as StoredPayslip).sort((a, b) => b.period.localeCompare(a.period));
}
