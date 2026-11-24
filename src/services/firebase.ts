import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

/**
 * Único lugar donde se inicializa Firebase. Toda la app accede a Firebase a través de `src/services/`.
 * La configuración web sale de variables VITE_FIREBASE_* (no son secretas: la seguridad la hacen las reglas).
 */
const env = import.meta.env;

const config: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/** Indica si esta instancia tiene Firebase configurado. Sin configuración, la app solo funciona en modo demo. */
export const isFirebaseConfigured: boolean = Boolean(config.apiKey && config.projectId && config.appId);

interface Firebase {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let cached: Firebase | null = null;

export function getFirebase(): Firebase {
  if (cached) return cached;
  if (!isFirebaseConfigured) throw new Error("Falta la configuración de Firebase (variables VITE_FIREBASE_*).");
  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (env.VITE_USE_EMULATORS === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  cached = { app, auth, db };
  return cached;
}
