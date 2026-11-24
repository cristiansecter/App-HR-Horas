/**
 * Marca del cliente. Es lo único que se toca para personalizar una instancia nueva:
 * nombre, logo y colores. No contiene lógica de negocio.
 *
 * Lo que el administrador de la empresa edita en uso (jornadas, reglas de horas extra,
 * feriados) vive en la base de datos, no acá.
 */
export interface TenantColors {
  /** Color principal: botones, ítem activo del menú, acentos. */
  primary: string;
  /** Color secundario: degradados y fondos de énfasis. */
  secondary: string;
  /** Color de acento: avisos y detalles. */
  accent: string;
}

export interface TenantConfig {
  companyName: string;
  /** Ruta o URL del logo de la empresa. Con `null` se muestra un monograma con las iniciales. */
  logoUrl: string | null;
  colors: TenantColors;
}

export const tenantConfig: TenantConfig = {
  companyName: "Empresa Demo SRL",
  logoUrl: null,
  colors: {
    primary: "#1ABEFB",
    secondary: "#0058F8",
    accent: "#E3F6FD",
  },
};
