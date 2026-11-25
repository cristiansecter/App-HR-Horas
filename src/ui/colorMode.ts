import { useEffect, useSyncExternalStore } from "react";

/**
 * Modo de color (claro u oscuro). Cada persona elige el suyo en su dispositivo: "Automático" sigue al del sistema.
 * Se guarda solo en el navegador (localStorage, con try/catch porque puede estar bloqueado) y no viaja a la base.
 */
export type ColorPref = "system" | "light" | "dark";
export type ColorMode = "light" | "dark";

export const COLOR_PREF_KEY = "sgblack:color-mode";
export const COLOR_PREFS: readonly ColorPref[] = ["system", "light", "dark"];

/** Lo guardado puede faltar o venir roto: cualquier cosa que no sea una opción válida vale "automático". */
export const parsePref = (raw: unknown): ColorPref => (raw === "light" || raw === "dark" ? raw : "system");

/** Modo real a mostrar: la elección de la persona o, en automático, el del sistema. */
export const resolveMode = (pref: ColorPref, systemDark: boolean): ColorMode => (pref === "system" ? (systemDark ? "dark" : "light") : pref);

/** Siguiente opción al tocar el botón: automático → claro → oscuro → automático. */
export const nextPref = (pref: ColorPref): ColorPref => COLOR_PREFS[(COLOR_PREFS.indexOf(pref) + 1) % COLOR_PREFS.length]!;

export const PREF_LABELS: Record<ColorPref, string> = { system: "Automático", light: "Claro", dark: "Oscuro" };
export const PREF_ICONS: Record<ColorPref, string> = { system: "brightness_auto", light: "light_mode", dark: "dark_mode" };

const systemDark = (): boolean => {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return true;
  }
};

const readStored = (): ColorPref => {
  try {
    return parsePref(localStorage.getItem(COLOR_PREF_KEY));
  } catch {
    return "system";
  }
};

// --- estado compartido (una sola fuente para todos los botones y para el documento) ---
let pref: ColorPref = readStored();
const listeners = new Set<() => void>();
/** Pantallas que fuerzan el oscuro (entrada y consola del Configurador, que son de la marca): cuántas están montadas. */
let forcedDark = 0;

/** Pinta el documento con el modo que corresponde ahora. */
export function applyColorMode(): void {
  const mode: ColorMode = forcedDark > 0 ? "dark" : resolveMode(pref, systemDark());
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode === "dark" ? "#0b0914" : "#f4f2fb");
}

export function setColorPref(next: ColorPref): void {
  pref = next;
  try {
    localStorage.setItem(COLOR_PREF_KEY, next);
  } catch {
    /* sin almacenamiento: la elección vale hasta cerrar la pestaña */
  }
  applyColorMode();
  listeners.forEach((l) => l());
}

/** Se llama una vez al arrancar: aplica el modo y sigue los cambios del sistema mientras esté en automático. */
export function initColorMode(): void {
  applyColorMode();
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (pref === "system") applyColorMode();
    });
  } catch {
    /* navegador sin matchMedia */
  }
}

/** Elección actual y función para cambiarla (para el botón del encabezado). */
export function useColorPref(): [ColorPref, (p: ColorPref) => void] {
  const current = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pref,
    () => "system" as ColorPref,
  );
  return [current, setColorPref];
}

/** Mientras la pantalla esté montada, el documento se ve oscuro sin importar la elección de la persona. */
export function useForcedDark(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    forcedDark += 1;
    applyColorMode();
    return () => {
      forcedDark -= 1;
      applyColorMode();
    };
  }, [active]);
}
