/**
 * Módulos activables y modelo de pago de una instancia.
 * Los define únicamente el Configurador (el administrador de la pyme no los ve ni los cambia).
 */

export type ModuleId = "compensation" | "performance" | "payroll" | "projectBilling" | "allocation";

/** Cómo paga la pyme: sueldo mensual por jornada completa, o por hora trabajada. */
export type PayModel = "salary" | "hourly";

/**
 * Cómo trabaja la empresa:
 * - "projects": las horas se cargan en proyectos (consultoras y similares). Es lo de siempre.
 * - "attendance": no hay proyectos ni horas; se lleva presencia por jornada (presente, ausente, llegadas tarde) y el sueldo es mensual.
 */
export type WorkMode = "projects" | "attendance";

export const WORK_MODE_LABELS: Record<WorkMode, string> = { projects: "Por proyectos", attendance: "Por asistencia (jornada)" };
export const WORK_MODE_HINTS: Record<WorkMode, string> = {
  projects: "Las personas cargan horas en proyectos, con aprobaciones, horas extra y, si se activan los módulos, costos, facturación y proyección. Para consultoras y empresas que trabajan por proyectos.",
  attendance: "No hay proyectos ni carga de horas: cada persona marca su presencia cada día y se anotan ausencias, licencias y llegadas tarde. El sueldo es mensual. Para empresas donde importa la asistencia y el presentismo, no las horas por proyecto.",
};

/** Módulos que solo tienen sentido trabajando por proyectos: en el modo asistencia quedan apagados y no se pueden prender. */
export const PROJECT_MODULES: readonly ModuleId[] = ["performance", "projectBilling", "allocation"];

export interface Features {
  modules: Record<ModuleId, boolean>;
  payModel: PayModel;
  /**
   * Permiso: los supervisores ven (solo lectura) el sueldo de las personas de su equipo.
   * Por defecto apagado: sin esto, solo el administrador ve sueldos. Necesita el módulo "Sueldos en el legajo".
   */
  supervisorsSeePay: boolean;
  /** Por proyectos (por defecto) o por asistencia. Lo define el Configurador. */
  workMode: WorkMode;
  /**
   * Premio y presentismo: en cada licencia o ausencia se marca si la persona pierde el presentismo y/o el premio.
   * Solo registra y reporta (no calcula importes). Apagado por defecto: muchas empresas no lo usan.
   */
  presentism: boolean;
  /** Tardanzas en un mes que hacen perder el presentismo (solo por asistencia). 0 = esa regla no se aplica. */
  presentismLateLimit: number;
}

export const MODULE_IDS: readonly ModuleId[] = ["compensation", "performance", "payroll", "projectBilling", "allocation"];

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
  projectBilling: {
    label: "Facturación por proyecto",
    description: "En Rendimiento, cada proyecto elige cómo se factura: por hora (con tarifa general y una distinta por persona), a precio cerrado (valor total y horas estimadas, repartido mes a mes según las horas trabajadas) o interno. Calcula ingreso y margen. Apagada, Rendimiento muestra solo costos. Para consultoras y empresas que facturan por proyecto.",
    requires: ["performance"],
  },
  allocation: {
    label: "Asignación por porcentaje y proyección",
    description: "Cada asignación de una persona a un proyecto puede ser parcial (porcentaje) o full time, y el administrador y los supervisores reparten las horas de cada proyecto entre su gente en la vista Proyección, comparadas con lo realmente trabajado. Pensada para consultoras.",
    requires: [],
  },
  payroll: {
    label: "Seguimiento de liquidaciones",
    description: "Anotación y seguimiento digital de las liquidaciones del mes, con las novedades cargadas desde las horas aprobadas, detalle para imprimir, parámetros editables, cierre de período y vista propia para cada persona. No es una herramienta de liquidación legal ni reemplaza el trabajo del contador.",
    requires: ["compensation"],
  },
};

/** Atajos de la consola: "consultoría" prende lo que usa una empresa que factura por proyecto; "producción" lo apaga. */
export const applyPreset = (features: Features, preset: "consultancy" | "production"): Features => {
  // Sin proyectos no hay nada que facturar ni proyectar: el atajo de consultoría no aplica.
  if (features.workMode === "attendance" && preset === "consultancy") return features;
  if (preset === "consultancy") {
    let f = features;
    for (const id of ["projectBilling", "allocation"] as const) f = toggleModule(f, id, true);
    return f;
  }
  let f = features;
  for (const id of ["projectBilling", "allocation"] as const) f = toggleModule(f, id, false);
  return f;
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
  modules: { compensation: false, performance: false, payroll: false, projectBilling: false, allocation: false },
  payModel: "salary",
  supervisorsSeePay: false,
  workMode: "projects",
  presentism: false,
  presentismLateLimit: 0,
};

/** Lee lo guardado (que puede faltar o venir incompleto) y devuelve siempre un objeto completo y coherente. */
export const normalizeFeatures = (raw: unknown): Features => {
  const data = (raw ?? {}) as { modules?: Partial<Record<ModuleId, unknown>>; payModel?: unknown; supervisorsSeePay?: unknown; workMode?: unknown; presentism?: unknown; presentismLateLimit?: unknown };
  const modules = { ...DEFAULT_FEATURES.modules };
  for (const id of MODULE_IDS) modules[id] = data.modules?.[id] === true;
  // Un módulo sin sus requisitos no se considera activo, aunque figure prendido en la base.
  for (const id of MODULE_IDS) {
    if (modules[id] && MODULE_INFO[id].requires.some((r) => !modules[r])) modules[id] = false;
  }
  const workMode: WorkMode = data.workMode === "attendance" ? "attendance" : "projects";
  // Por asistencia no hay proyectos: sus módulos no cuentan y el sueldo es siempre mensual, aunque la base diga otra cosa.
  if (workMode === "attendance") for (const id of PROJECT_MODULES) modules[id] = false;
  const payModel: PayModel = workMode === "attendance" ? "salary" : data.payModel === "hourly" ? "hourly" : "salary";
  // El permiso de los supervisores no vale sin el módulo de sueldos, aunque figure prendido en la base.
  const presentism = data.presentism === true;
  // La regla de tardanzas solo existe por asistencia y con el presentismo activo.
  const limit = Number.isInteger(data.presentismLateLimit) && (data.presentismLateLimit as number) >= 0 && (data.presentismLateLimit as number) <= 31 ? (data.presentismLateLimit as number) : 0;
  return { modules, payModel, supervisorsSeePay: data.supervisorsSeePay === true && modules.compensation, workMode, presentism, presentismLateLimit: presentism && workMode === "attendance" ? limit : 0 };
};

/** Problemas de dependencias de una configuración (para mostrar antes de guardar). */
export const featureProblems = (features: Features): string[] => [
  ...MODULE_IDS.flatMap((id) =>
    features.modules[id]
      ? MODULE_INFO[id].requires.filter((r) => !features.modules[r]).map((r) => `“${MODULE_INFO[id].label}” necesita “${MODULE_INFO[r].label}”.`)
      : [],
  ),
  ...(features.supervisorsSeePay && !features.modules.compensation ? ["El permiso de sueldos para supervisores necesita “Sueldos en el legajo”."] : []),
  ...(features.presentismLateLimit > 0 && !features.presentism ? ["La regla de tardanzas necesita que premio y presentismo esté activo."] : []),
  ...(features.presentismLateLimit > 0 && features.workMode !== "attendance" ? ["La regla de tardanzas solo existe en el modo por asistencia."] : []),
  ...(features.workMode === "attendance"
    ? [
        ...PROJECT_MODULES.filter((id) => features.modules[id]).map((id) => `“${MODULE_INFO[id].label}” no se puede usar en el modo por asistencia (no hay proyectos).`),
        ...(features.payModel === "hourly" ? ["En el modo por asistencia el sueldo es mensual, no por hora."] : []),
      ]
    : []),
];

/**
 * Prende o apaga un módulo. Al prender uno se prenden también sus requisitos;
 * al apagar uno se apagan los que dependen de él.
 */
export const toggleModule = (features: Features, id: ModuleId, on: boolean): Features => {
  // Por asistencia no se pueden prender los módulos de proyectos.
  if (on && features.workMode === "attendance" && PROJECT_MODULES.includes(id)) return features;
  const modules = { ...features.modules };
  // Prender arrastra los requisitos (y los requisitos de los requisitos); apagar apaga todo lo que dependa, directa o indirectamente.
  const turnOn = (m: ModuleId) => {
    modules[m] = true;
    for (const r of MODULE_INFO[m].requires) turnOn(r);
  };
  const turnOff = (m: ModuleId) => {
    modules[m] = false;
    for (const other of MODULE_IDS) if (MODULE_INFO[other].requires.includes(m) && modules[other]) turnOff(other);
  };
  if (on) turnOn(id);
  else turnOff(id);
  // Sin el módulo de sueldos no hay sueldos que mostrar: el permiso de los supervisores se apaga con él.
  return { ...features, modules, supervisorsSeePay: features.supervisorsSeePay && modules.compensation };
};

/** Cambia el modo de trabajo. Pasar a asistencia apaga los módulos de proyectos y deja el sueldo mensual; volver a proyectos no los vuelve a prender. */
export const setWorkMode = (features: Features, mode: WorkMode): Features => {
  if (mode === "projects") return { ...features, workMode: "projects", presentismLateLimit: 0 };
  const modules = { ...features.modules };
  for (const id of PROJECT_MODULES) modules[id] = false;
  return { ...features, workMode: "attendance", modules, payModel: "salary" };
};
