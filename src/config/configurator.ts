/**
 * Único correo con acceso de Configurador (el proveedor del sistema). Entra SOLO con su cuenta de Google.
 *
 * Esto es una comprobación de comodidad (para avisar enseguida si entra otra cuenta): la barrera real son las reglas
 * de Firestore (`isConfigurator()` en firestore.rules), que exigen este mismo correo, verificado y con inicio de
 * sesión de Google. Si el proveedor cambia, hay que cambiarlo en los dos lugares.
 */
export const CONFIGURATOR_EMAIL = "cristiansecter@gmail.com";

export interface TokenFacts {
  /** Proveedor con el que se inició ESTA sesión ("google.com", "password"...). */
  signInProvider: string | null;
  email: unknown;
  emailVerified: unknown;
}

/**
 * ¿Esta sesión es la del Configurador? Hace falta todo junto: correo exacto, verificado y sesión iniciada con Google.
 * Es la misma condición que exigen las reglas de Firestore.
 */
export const isConfiguratorToken = (t: TokenFacts): boolean =>
  t.signInProvider === "google.com" && t.emailVerified === true && typeof t.email === "string" && t.email === CONFIGURATOR_EMAIL;
