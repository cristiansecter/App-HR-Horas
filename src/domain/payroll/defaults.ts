/** Parámetros y conceptos de la liquidación. Todo lo que está acá es editable por el administrador desde Liquidación → Parámetros. */

export interface PayrollParams {
  /** Antigüedad: % del básico por cada año de servicio. */
  antiguedadPct: number;
  presentismoPct: number;
  /** Si el presentismo también corresponde fuera de convenio. */
  presentismoFueraConvenio: boolean;
  /** Divisor del valor hora para horas extra (200 = 25 días × 8 h). Depende del convenio y de la jornada. */
  divisorHorasExtra: number;
  /** El valor hora de las horas extra se calcula sobre básico + antigüedad (muchos convenios lo piden así). */
  horasExtraSobreRemNormal: boolean;
  /** Divisor del valor día de vacaciones (LCT: 25). */
  divisorVacaciones: number;
  /** Divisor del valor día para descontar inasistencias (30 en el mes comercial). */
  divisorInasistencias: number;
  /** Horas de una jornada, para pagar un día de vacaciones a quien cobra por hora. */
  horasJornada: number;
  bonoConvenio: number;
  asignacionHijo: number;
  jubilacionPct: number;
  pamiPct: number;
  obraSocialPct: number;
  sindicalPct: number;
  /** Tope de la base de aportes. 0 = sin tope. */
  topeAportes: number;
  minNoImponible: number;
  alicuotaGananciasPct: number;
  deduccionHijo: number;
  /** Contribuciones patronales sobre lo remunerativo, en %. Solo informan el costo para la empresa: no van en el recibo. */
  contribucionesPatronalesPct: number;
}

export const DEFAULT_PARAMS: PayrollParams = {
  antiguedadPct: 1,
  presentismoPct: 8.33,
  presentismoFueraConvenio: false,
  divisorHorasExtra: 200,
  horasExtraSobreRemNormal: false,
  divisorVacaciones: 25,
  divisorInasistencias: 30,
  horasJornada: 8,
  bonoConvenio: 45000,
  asignacionHijo: 25000,
  jubilacionPct: 11,
  pamiPct: 3,
  obraSocialPct: 3,
  sindicalPct: 2,
  topeAportes: 0,
  minNoImponible: 1900000,
  alicuotaGananciasPct: 19,
  deduccionHijo: 60000,
  contribucionesPatronalesPct: 0,
};

export type ConceptId =
  | "antiguedad" | "presentismo" | "horasExtra" | "vacaciones" | "bonoConvenio" | "bonoIndividual" | "premio"
  | "inasistencias" | "sac" | "viaticos" | "reembolsos" | "asignacionFamiliar"
  | "jubilacion" | "pami" | "obraSocial" | "sindical" | "ganancias" | "adelanto" | "embargo";

export const CONCEPTS: readonly { id: ConceptId; label: string; kind: "haber" | "no_remunerativo" | "descuento" }[] = [
  { id: "antiguedad", label: "Antigüedad", kind: "haber" },
  { id: "presentismo", label: "Presentismo", kind: "haber" },
  { id: "horasExtra", label: "Horas extra", kind: "haber" },
  { id: "vacaciones", label: "Vacaciones", kind: "haber" },
  { id: "bonoIndividual", label: "Bono individual", kind: "haber" },
  { id: "premio", label: "Premio por desempeño", kind: "haber" },
  { id: "sac", label: "SAC (aguinaldo)", kind: "haber" },
  { id: "inasistencias", label: "Descuento por inasistencias", kind: "descuento" },
  { id: "bonoConvenio", label: "Bono no remunerativo de convenio", kind: "no_remunerativo" },
  { id: "viaticos", label: "Viáticos", kind: "no_remunerativo" },
  { id: "reembolsos", label: "Reembolsos de gastos", kind: "no_remunerativo" },
  { id: "asignacionFamiliar", label: "Asignación familiar por hijo", kind: "no_remunerativo" },
  { id: "jubilacion", label: "Jubilación (SIPA)", kind: "descuento" },
  { id: "pami", label: "Ley 19.032 / PAMI", kind: "descuento" },
  { id: "obraSocial", label: "Obra social", kind: "descuento" },
  { id: "sindical", label: "Aporte sindical", kind: "descuento" },
  { id: "ganancias", label: "Impuesto a las Ganancias (simplificado)", kind: "descuento" },
  { id: "adelanto", label: "Adelanto de sueldo", kind: "descuento" },
  { id: "embargo", label: "Embargo judicial", kind: "descuento" },
];

/** Qué conceptos se aplican a quienes están dentro y fuera de convenio. Un concepto ausente se considera prendido. */
export interface Visibility {
  convenio: Partial<Record<ConceptId, boolean>>;
  fuera: Partial<Record<ConceptId, boolean>>;
}

/** Por defecto, fuera de convenio no hay aporte sindical ni bono de convenio. */
export const DEFAULT_VISIBILITY: Visibility = { convenio: {}, fuera: { sindical: false, bonoConvenio: false } };

export const showConcept = (id: ConceptId, convenio: boolean, visibility: Visibility): boolean => (convenio ? visibility.convenio : visibility.fuera)[id] !== false;
