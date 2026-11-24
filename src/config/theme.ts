import type { TenantColors, TenantConfig } from "./tenant.config";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const isHexColor = (value: string): boolean => HEX_COLOR.test(value);

const channel = (c: number): number => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** Luminancia relativa (WCAG) de un color #RRGGBB. */
export const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};

/** Color de texto legible sobre un fondo de marca: oscuro sobre colores claros, blanco sobre oscuros. */
export const readableTextOn = (hex: string): string => (luminance(hex) > 0.4 ? "#0B1020" : "#FFFFFF");

/** Variables CSS que genera la marca del cliente. Falla si algún color no es #RRGGBB. */
export const tenantCssVariables = (colors: TenantColors): Record<string, string> => {
  for (const [name, value] of Object.entries(colors)) {
    if (!isHexColor(value)) {
      throw new Error(`Color inválido en tenant.config.ts (${name}): "${value}". Usá el formato #RRGGBB.`);
    }
  }
  return {
    "--hz-primary": colors.primary,
    "--hz-secondary": colors.secondary,
    "--hz-accent": colors.accent,
    "--hz-on-primary": readableTextOn(colors.primary),
  };
};

export const applyTenantTheme = (config: TenantConfig, root: HTMLElement = document.documentElement): void => {
  for (const [name, value] of Object.entries(tenantCssVariables(config.colors))) {
    root.style.setProperty(name, value);
  }
};

/** Iniciales para el monograma cuando la empresa no tiene logo: "Empresa Demo SRL" → "ED". */
export const companyInitials = (companyName: string): string => {
  const words = companyName
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(s\.?r\.?l\.?|s\.?a\.?|s\.?a\.?s\.?)$/i.test(w));
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase());
  return letters.join("") || "?";
};
