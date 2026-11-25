import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, where } from "firebase/firestore";
import { addRate, DEFAULT_PAY_PROFILE, removeRate, replaceRate, type EmployeePay, type PayProfile, type RateEntry } from "@/domain/compensation";
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

/** Error con mensaje para mostrar tal cual: lo que se quiso corregir cambió o choca con otra vigencia. */
export class RateEditError extends Error {}

/** Corrige una vigencia (fecha y/o monto) en una transacción. Solo el administrador (lo exigen las reglas). */
export async function updateRate(uid: string, originalFrom: string, change: { from: string; amount: number }, byEmail: string): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, "employee_pay", uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = fromDoc(uid, snap.exists() ? (snap.data() as Partial<EmployeePay>) : undefined);
    if (!current.rates.some((r) => r.from === originalFrom)) throw new RateEditError("Esa vigencia ya no existe: alguien la cambió. Recargá la ficha.");
    const rates = replaceRate(current.rates, originalFrom, change, byEmail, new Date().toISOString());
    if (!rates) throw new RateEditError("Ya hay otra vigencia con esa fecha. Cambiá la fecha o corregí esa otra.");
    tx.set(ref, { userId: uid, rates, convenio: current.convenio, obraSocial: current.obraSocial, hijos: current.hijos, updatedAt: serverTimestamp(), updatedBy: byEmail });
  });
  window.dispatchEvent(new Event(PAY_CHANGED));
}

/** Borra una vigencia del historial. Solo el administrador. */
export async function deleteRate(uid: string, from: string, byEmail: string): Promise<void> {
  const { db } = getFirebase();
  const ref = doc(db, "employee_pay", uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = fromDoc(uid, snap.exists() ? (snap.data() as Partial<EmployeePay>) : undefined);
    if (!current.rates.some((r) => r.from === from)) throw new RateEditError("Esa vigencia ya no existe: alguien la cambió. Recargá la ficha.");
    tx.set(ref, { userId: uid, rates: removeRate(current.rates, from), convenio: current.convenio, obraSocial: current.obraSocial, hijos: current.hijos, updatedAt: serverTimestamp(), updatedBy: byEmail });
  });
  window.dispatchEvent(new Event(PAY_CHANGED));
}

/**
 * Remuneración de las personas indicadas (para el supervisor, que solo puede pedir a su equipo y solo si el Configurador
 * le dio el permiso). La consulta va acotada con `in`, como lo exigen las reglas.
 */
export async function listPayOfPeople(uids: string[]): Promise<Map<string, EmployeePay>> {
  const { db } = getFirebase();
  const out = new Map<string, EmployeePay>();
  for (let i = 0; i < uids.length; i += 30) {
    const snap = await getDocs(query(collection(db, "employee_pay"), where("userId", "in", uids.slice(i, i + 30))));
    for (const d of snap.docs) out.set(d.id, fromDoc(d.id, d.data() as Partial<EmployeePay>));
  }
  return out;
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
