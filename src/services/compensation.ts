import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { addRate, DEFAULT_PAY_PROFILE, type EmployeePay, type PayProfile, type RateEntry } from "@/domain/compensation";
import { getFirebase } from "./firebase";

/** Aviso interno: cambió una remuneración y las pantallas abiertas deben volver a leerla. */
export const PAY_CHANGED = "horus:pay-changed";

const fromDoc = (uid: string, data: Partial<EmployeePay> | undefined): EmployeePay => ({
  ...DEFAULT_PAY_PROFILE,
  ...(data ?? {}),
  userId: uid,
  rates: [...(data?.rates ?? [])],
});

/** Remuneración de una persona. Solo el administrador, con el módulo "Sueldos en el legajo" activo (lo exigen las reglas). */
export async function getEmployeePay(uid: string): Promise<EmployeePay> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, "employee_pay", uid));
  return fromDoc(uid, snap.exists() ? (snap.data() as Partial<EmployeePay>) : undefined);
}

export async function listEmployeePay(): Promise<Map<string, EmployeePay>> {
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, "employee_pay"));
  return new Map(snap.docs.map((d) => [d.id, fromDoc(d.id, d.data() as Partial<EmployeePay>)]));
}

/** Agrega una vigencia al historial en una transacción, para no pisar un cambio simultáneo. */
export async function saveRate(uid: string, entry: Omit<RateEntry, "setAt">, byEmail: string): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, "employee_pay", uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = fromDoc(uid, snap.exists() ? (snap.data() as Partial<EmployeePay>) : undefined);
    const rates = addRate(current.rates, { ...entry, setAt: new Date().toISOString() });
    tx.set(ref, { userId: uid, rates, convenio: current.convenio, obraSocial: current.obraSocial, hijos: current.hijos, updatedAt: serverTimestamp(), updatedBy: byEmail });
  });
  window.dispatchEvent(new Event(PAY_CHANGED));
}

/** Datos del legajo que usa la liquidación: convenio, obra social, hijos. */
export async function saveProfile(uid: string, profile: PayProfile, byEmail: string): Promise<void> {
  const { db } = getFirebase();
  const current = await getEmployeePay(uid);
  await setDoc(doc(db, "employee_pay", uid), {
    userId: uid,
    rates: current.rates,
    convenio: profile.convenio,
    obraSocial: profile.obraSocial.trim(),
    hijos: Math.max(0, Math.min(30, Math.trunc(profile.hijos))),
    updatedAt: serverTimestamp(),
    updatedBy: byEmail,
  });
  window.dispatchEvent(new Event(PAY_CHANGED));
}
