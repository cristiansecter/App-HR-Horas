import { FirebaseError } from "firebase/app";

/** Código técnico de un error de Firebase (por ejemplo "permission-denied"), para mostrar chico junto al mensaje. */
export const errorCode = (e: unknown): string => (e instanceof FirebaseError ? e.code : "");

/** Agrega el código técnico al mensaje para que un reporte de "no anda" diga exactamente qué rechazó el servidor. */
export const withCode = (message: string, e: unknown): string => {
  const code = errorCode(e);
  return code ? `${message} (${code})` : message;
};
