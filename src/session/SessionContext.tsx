import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { SessionUser } from "@/domain/types";

interface SessionValue {
  user: SessionUser | null;
  signIn: (user: SessionUser) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Sesión en memoria. La autenticación real (Firebase Auth con el rol en un custom claim)
 * se conecta acá más adelante: solo cambia quién llama a signIn/signOut.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const value = useMemo<SessionValue>(() => ({ user, signIn: setUser, signOut: () => setUser(null) }), [user]);
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
