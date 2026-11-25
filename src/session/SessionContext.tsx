import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { IDLE_SIGN_OUT_MINUTES } from "@/config/security";
import { isFirebaseConfigured } from "@/services/firebase";
import { signInConfiguratorWithGoogle, signInWithPassword, signOutFromFirebase, subscribeToSession, type ConfiguratorSession, type SessionKind } from "@/services/auth";
import type { SessionUser } from "@/domain/types";
import { useIdleSignOut } from "./useIdleSignOut";

interface SessionValue {
  user: SessionUser | null;
  /** Sesión del Configurador (proveedor del sistema), si entró por esa pestaña. No es un usuario de la pyme. */
  configurator: ConfiguratorSession | null;
  /** true mientras Firebase confirma si ya había una sesión abierta. */
  loading: boolean;
  /** Motivo por el que una cuenta real fue rechazada (sin rol, dada de baja...). */
  authNotice: string | null;
  /** Entrada de la demo: usuario inventado, en memoria. */
  signIn: (user: SessionUser) => void;
  /** Entrada real con email y contraseña (Firebase Auth). Lanza un error con mensaje legible. */
  signInWithPassword: (email: string, password: string, as?: SessionKind) => Promise<void>;
  /** Entrada del Configurador: solo con Google. */
  signInConfigurator: () => Promise<void>;
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
  const [configurator, setConfigurator] = useState<ConfiguratorSession | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return subscribeToSession((result, error) => {
      setRealUser(result?.kind === "app" ? result.user : null);
      setConfigurator(result?.kind === "configurator" ? result.configurator : null);
      if (error) setAuthNotice(error);
      if (result) setAuthNotice(null);
      setLoading(false);
    });
  }, []);

  const signIn = useCallback((u: SessionUser) => setDemoUser(u), []);
  const signOut = useCallback(() => {
    setDemoUser(null);
    setAuthNotice(null);
    if (isFirebaseConfigured) void signOutFromFirebase().catch(() => undefined);
  }, []);

  // Una sesión real (de una persona o del Configurador) se cierra sola tras un rato sin actividad. La demo no.
  const signOutForInactivity = useCallback(() => {
    setAuthNotice(`Cerramos tu sesión por inactividad (${IDLE_SIGN_OUT_MINUTES} minutos). Volvé a entrar para seguir.`);
    void signOutFromFirebase().catch(() => undefined);
  }, []);
  useIdleSignOut(isFirebaseConfigured && (realUser !== null || configurator !== null), IDLE_SIGN_OUT_MINUTES, signOutForInactivity);

  const value = useMemo<SessionValue>(
    () => ({
      user: realUser ?? demoUser,
      configurator,
      loading,
      authNotice,
      signIn,
      signInWithPassword,
      signInConfigurator: signInConfiguratorWithGoogle,
      signOut,
      isReal: realUser !== null,
    }),
    [realUser, demoUser, configurator, loading, authNotice, signIn, signOut],
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
