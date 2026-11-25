/**
 * Marca del producto (SG Black). Se muestra al abrir la app, en el favicon y en "Powered by SG Black".
 * Los archivos salen de brand/source/ con `python3 scripts/brand-assets.py` y viven en public/brand/.
 * Cada empresa cliente puede tener su propio logo y colores (Configuración); esta es la marca de la plataforma.
 */
export const sgBlackBrand = {
  name: "SG Black",
  /** Isotipo dentro de su cuadrado redondeado (ícono de la app). */
  iconUrl: "/brand/sgblack-isotipo-512.png",
  /** Solo el glifo (sin cuadrado), con transparencia: para usarlo chico sobre cualquier fondo. */
  glyphUrl: "/brand/sgblack-glyph.png",
  /** Logo horizontal con transparencia para fondos oscuros (texto blanco). */
  logoOnDarkUrl: "/brand/sgblack-logo-on-dark.png",
  /** Logo horizontal con transparencia para fondos claros (texto casi negro). */
  logoOnLightUrl: "/brand/sgblack-logo-on-light.png",
  poweredByLabel: "Powered by SG Black",
  tagline: "Gestión de horas, asistencia y licencias para pymes",
  palette: {
    ink: "#090715",
    violet: "#833DF2",
    deep: "#6722DB",
    intense: "#440CA0",
    light: "#C28FF9",
    silver: "#ADA5C7",
    white: "#FFFFFF",
  },
} as const;
