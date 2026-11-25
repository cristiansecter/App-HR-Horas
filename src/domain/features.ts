/**
 * Módulos activables y modelo de pago de una instancia.
 * Los define únicamente el Configurador (el administrador de la pyme no los ve ni los cambia).
 */

export type ModuleId = "compensation" | "performance" | "payroll";

/** Cómo paga la pyme: sueldo mensual por jornada completa, o por hora trabajada. */
export type PayModel = "salary" | "hourly";

export interface Features {
  modules: Record<ModuleId, boolean>;
  payModel: PayModel;
}

export const MODULE_IDS: readonly ModuleId[] = ["compensation", "performance", "payroll"];

export interface ModuleInfo {
  label: string;
  description: string;
  /** Módulos que tienen que estar activos para poder activar este. */
  requires: readonly ModuleId[];
}

export const MODULE_INFO: Record<ModuleId, ModuleInfo> = {
  compensation: {
    label: "Sueldos en el legajo",
    description: "Permite cargar el sueldo (o el valor hora) de cada persona en su ficha, con historial de vigencias. Solo lo ve el administrador. Es la base de los otros dos módulos.",
    requires: [],
  },
  performance: {
    label: "Rendimiento",
    description: "Vista de costos contra facturación por proyecto y por mes: tarifa de cobro por hora de cada proyecto, costo de cada persona y margen.",
    requires: ["compensation"],
  },
  payroll: {
    label: "Seguimiento de liquidaciones",
    description: "Anotación y seguimiento digital de las liquidaciones del mes, con las novedades cargadas desde las horas aprobadas, detalle para imprimir, parámetros editables, cierre de período y vista propia para cada persona. No es una herramienta de liquidación legal ni reemplaza el trabajo del contador.",
    requires: ["compensation"],
  },
};

export const PAY_MODEL_LABELS: Record<PayModel, string> = {
  salary: "Por jornada (sueldo mensual)",
  hourly: "Por hora trabajada",
};

export const PAY_MODEL_HINTS: Record<PayModel, string> = {
  salary: "Cada persona tiene un sueldo mensual por su jornada completa. El costo por hora se calcula dividiéndolo por las horas del mes.",
  hourly: "Cada persona tiene un valor hora. El sueldo del mes sale de multiplicarlo por las horas aprobadas.",
};

export const DEFAULT_FEATURES: Features = {
  modules: { compensation: false, performance: false, payroll: false },
  payModel: "salary",
};

/** Lee lo guardado (que puede faltar o venir incompleto) y devuelve siempre un objeto completo y coherente. */
export const normalizeFeatures = (raw: unknown): Features => {
  const data = (raw ?? {}) as { modules?: Partial<Record<ModuleId, unknown>>; payModel?: unknown };
  const modules = { ...DEFAULT_FEATURES.modules };
  for (const id of MODULE_IDS) modules[id] = data.modules?.[id] === true;
  // Un módulo sin sus requisitos no se considera activo, aunque figure prendido en la base.
  for (const id of MODULE_IDS) {
    if (modules[id] && MODULE_INFO[id].requires.some((r) => !modules[r])) modules[id] = false;
  }
  return { modules, payModel: data.payModel === "hourly" ? "hourly" : "salary" };
};

/** Problemas de dependencias de una configuración (para mostrar antes de guardar). */
export const featureProblems = (features: Features): string[] =>
  MODULE_IDS.flatMap((id) =>
    features.modules[id]
      ? MODULE_INFO[id].requires.filter((r) => !features.modules[r]).map((r) => `“${MODULE_INFO[id].label}” necesita “${MODULE_INFO[r].label}”.`)
      : [],
  );

/**
 * Prende o apaga un módulo. Al prender uno se prenden también sus requisitos;
 * al apagar uno se apagan los que dependen de él.
 */
export const toggleModule = (features: Features, id: ModuleId, on: boolean): Features => {
  const modules = { ...features.modules, [id]: on };
  if (on) for (const r of MODULE_INFO[id].requires) modules[r] = true;
  else for (const other of MODULE_IDS) if (MODULE_INFO[other].requires.includes(id)) modules[other] = false;
  return { ...features, modules };
};
