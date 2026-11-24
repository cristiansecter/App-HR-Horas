import { ARGENTINA_HOLIDAYS, toHolidayMap } from "@/domain/holidays/argentina";
import { defaultOvertimeConfig, defaultWorkSchedule } from "@/domain/overtime";

/** Datos de ejemplo de la instancia de demostración. Todo inventado. */
export interface DemoProject {
  code: string;
  name: string;
  client: string;
  budgetHours: number;
}

export const DEMO_PROJECTS: readonly DemoProject[] = [
  { code: "MNT-001", name: "Mantenimiento preventivo de planta", client: "Logística Andina SA", budgetHours: 480 },
  { code: "OBR-002", name: "Remodelación de oficinas", client: "Comercial Pampa SRL", budgetHours: 320 },
  { code: "PRY-003", name: "Proyecto ejecutivo de instalaciones", client: "Estudio Delta Arquitectos", budgetHours: 400 },
  { code: "SOP-004", name: "Soporte técnico mensual", client: "Consorcio Las Acacias", budgetHours: 160 },
];

export const DEMO_HOLIDAYS = toHolidayMap(ARGENTINA_HOLIDAYS);
export const DEMO_OVERTIME_CONFIG = defaultOvertimeConfig({ saturdayMode: "lct" });
/** Jornada de la demo: lunes a viernes de 08:30 a 17:30, con almuerzo de 13:00 a 14:00 (8 horas). */
export const DEMO_SCHEDULE = (() => {
  const day = { start: "08:30", end: "17:30", lunchStart: "13:00", lunchEnd: "14:00" };
  return { ...defaultWorkSchedule(), mon: { ...day }, tue: { ...day }, wed: { ...day }, thu: { ...day }, fri: { ...day } };
})();
