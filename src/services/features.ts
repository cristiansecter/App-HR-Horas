import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { normalizeFeatures, type Features } from "@/domain/features";
import { getFirebase } from "./firebase";

/** Módulos activos y modelo de pago de la instancia. Lo puede leer cualquier usuario con rol; lo escribe solo el Configurador. */
export async function loadFeatures(): Promise<Features> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, "settings", "features"));
  return normalizeFeatures(snap.exists() ? snap.data() : undefined);
}

export interface FeaturesStamp {
  updatedBy?: string;
  updatedAt?: Date;
}

/** Lo que ve la consola del Configurador: la configuración y quién la cambió por última vez. */
export async function loadFeaturesWithStamp(): Promise<{ features: Features; stamp: FeaturesStamp }> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, "settings", "features"));
  const data = snap.exists() ? (snap.data() as { updatedBy?: string; updatedAt?: { toDate: () => Date } }) : {};
  return { features: normalizeFeatures(snap.exists() ? snap.data() : undefined), stamp: { updatedBy: data.updatedBy, updatedAt: data.updatedAt?.toDate() } };
}

/** Solo el Configurador puede guardar (las reglas de Firestore lo hacen cumplir). */
export async function saveFeatures(features: Features, configuratorEmail: string): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, "settings", "features"), {
    modules: features.modules,
    payModel: features.payModel,
    supervisorsSeePay: features.supervisorsSeePay,
    updatedAt: serverTimestamp(),
    updatedBy: configuratorEmail,
  });
}

/** Nombre de la empresa, para mostrarlo en la consola. El Configurador puede leer `settings/main` y nada más de la empresa. */
export async function loadCompanyNameForConsole(): Promise<string | null> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, "settings", "main"));
  return snap.exists() ? ((snap.data() as { companyName?: string }).companyName ?? null) : null;
}
