import { FirebaseError } from "firebase/app";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { ROLES, type Role, type SessionUser } from "@/domain/types";
import type { UserProfile } from "@/domain/model";
import { getFirebase } from "./firebase";

/** Lo que pasa cuando hay una cuenta de Firebase pero no se puede armar una sesión de Horus. */
export class SessionError extends Error {}

const isRole = (value: unknown): value is Role => typeof value === "string" && (ROLES as readonly string[]).includes(value);

/**
 * Arma la sesión de la app a partir de la cuenta de Firebase.
 * El rol sale del custom claim `role` del token (lo asigna solo el Configurador); el nombre, del perfil.
 */
async function toSessionUser(user: User): Promise<SessionUser> {
  const token = await user.getIdTokenResult();
  const role = token.claims.role;
  if (!isRole(role)) {
    throw new SessionError("Tu cuenta todavía no tiene un rol asignado. Pedile al Configurador de tu empresa que la habilite.");
  }
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, "users", user.uid));
  const profile = snap.exists() ? (snap.data() as Partial<UserProfile>) : undefined;
  if (profile?.active === false) throw new SessionError("Tu cuenta está dada de baja. Consultá con el administrador de tu empresa.");
  return {
    uid: user.uid,
    fullName: profile?.fullName ?? user.displayName ?? user.email ?? "Usuario",
    email: user.email ?? "",
    role,
  };
}

/** Escucha los cambios de sesión de Firebase. `onChange` recibe la sesión o un error legible. */
export function subscribeToSession(onChange: (user: SessionUser | null, error?: string) => void): () => void {
  const { auth } = getFirebase();
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      onChange(null);
      return;
    }
    toSessionUser(user)
      .then((session) => onChange(session))
      .catch(async (e: unknown) => {
        // Una cuenta sin rol o dada de baja no entra: se cierra la sesión de Firebase y se explica por qué.
        const message = e instanceof SessionError ? e.message : "No se pudo cargar tu sesión. Probá de nuevo en unos minutos.";
        await signOut(auth).catch(() => undefined);
        onChange(null, message);
      });
  });
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { auth } = getFirebase();
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (e) {
    throw new SessionError(translateAuthError(e));
  }
}

export async function signOutFromFirebase(): Promise<void> {
  await signOut(getFirebase().auth);
}

export function translateAuthError(e: unknown): string {
  if (e instanceof FirebaseError) {
    switch (e.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
      case "auth/invalid-email":
        return "El email o la contraseña no son correctos.";
      case "auth/user-disabled":
        return "Esta cuenta está deshabilitada. Consultá con el administrador de tu empresa.";
      case "auth/too-many-requests":
        return "Demasiados intentos fallidos. Esperá unos minutos y probá de nuevo.";
      case "auth/network-request-failed":
        return "No hay conexión con el servidor. Revisá tu internet y probá de nuevo.";
      case "auth/operation-not-allowed":
        return "El inicio de sesión con email y contraseña no está habilitado en esta instancia.";
      default:
        return "No se pudo iniciar sesión. Probá de nuevo.";
    }
  }
  return "No se pudo iniciar sesión. Probá de nuevo.";
}
