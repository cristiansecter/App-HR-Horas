import type { WorkMode } from "@/domain/features";

/**
 * Último modo de trabajo conocido de la empresa, recordado en este navegador. Sirve solo para que el menú y el inicio
 * no muestren por un instante las pantallas del otro modo mientras se carga la configuración. Lo que manda siempre es
 * lo que se lee de la base. La clave lleva el proyecto de Firebase, así dos empresas en el mismo navegador no se pisan.
 */
const key = () => `horus:work-mode:${import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "local"}`;

export const readCachedWorkMode = (): WorkMode | null => {
  try {
    const v = localStorage.getItem(key());
    return v === "attendance" || v === "projects" ? v : null;
  } catch {
    return null;
  }
};

export const writeCachedWorkMode = (mode: WorkMode): void => {
  try {
    localStorage.setItem(key(), mode);
  } catch {
    /* sin almacenamiento: solo se pierde el recuerdo */
  }
};
