import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isFirebaseConfigured } from "@/services/firebase";
import { signInWithPassword, signOutFromFirebase, subscribeToSession } from "@/services/auth";
import type { SessionUser } from "@/domain/types";

interface SessionValue {
  user: SessionUser | null;
  /** true mientras Firebase confirma si ya había una sesión abierta. */
  loading: boolean;
  /** Motivo por el que una cuenta real fue rechazada (sin rol, dada de baja...). */
  authNotice: string | null;
  /** Entrada de la demo: usuario inventado, en memoria. */
  signIn: (user: SessionUser) => void;
  /** Entrada real con email y contraseña (Firebase Auth). Lanza un error con mensaje legible. */
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  /** true si la sesión es de una cuenta real y no de la demo. */
  isReal: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Sesión de la app. Hay dos orígenes: el usuario de demostración (en memoria) y una cuenta real de Firebase Auth,
 * cuyo rol sale del custom claim `role`. Sin Firebase configurado solo existe la demo.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [demoUser, setDemoUser] = useState<SessionUser | null>(null);
  const [realUser, setRealUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return subscribeToSession((session, error) => {
      setRealUser(session);
      if (error) setAuthNotice(error);
      if (session) setAuthNotice(null);
      setLoading(false);
    });
  }, []);

  const signIn = useCallback((u: SessionUser) => setDemoUser(u), []);
  const signOut = useCallback(() => {
    setDemoUser(null);
    setAuthNotice(null);
    if (isFirebaseConfigured) void signOutFromFirebase().catch(() => undefined);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      user: realUser ?? demoUser,
      loading,
      authNotice,
      signIn,
      signInWithPassword,
      signOut,
      isReal: realUser !== null,
    }),
    [realUser, demoUser, loading, authNotice, signIn, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>.");
  return ctx;
}

/** Usuario con sesión iniciada. Solo se usa en pantallas que están detrás del login. */
export function useUser(): SessionUser {
  const { user } = useSession();
  if (!user) throw new Error("No hay una sesión iniciada.");
  return user;
}
