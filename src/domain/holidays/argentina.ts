import { addDays, dayOfWeek } from "../dates";
import type { Holiday } from "../overtime/types";

/**
 * Feriados nacionales de Argentina (Ley 27.399) y días no laborables.
 *
 * - `confirmed`: la fecha la fija la ley o ya está publicada en el calendario oficial.
 * - `to_confirm`: la fecha se calculó con la regla de traslado de la ley y falta la confirmación oficial.
 *   El Admin puede corregirla desde Configuración.
 *
 * Los "días no laborables con fines turísticos" (los puentes) los fija el Poder Ejecutivo por decreto, hasta
 * tres por año. Los de 2027 todavía no se decretaron: cuando salga el decreto se suman como `optional`.
 */
export interface HolidaySeed extends Holiday {
  confirmation: "confirmed" | "to_confirm";
}

/**
 * Traslado de un feriado trasladable (art. 6 de la Ley 27.399): si cae martes o miércoles pasa al lunes anterior,
 * si cae jueves o viernes pasa al lunes siguiente, y si cae sábado, domingo o lunes queda donde está.
 */
export const movableHolidayDate = (date: string): string => {
  const dow = dayOfWeek(date);
  if (dow === 2 || dow === 3) return addDays(date, -(dow - 1));
  if (dow === 4 || dow === 5) return addDays(date, 8 - dow);
  return date;
};

const national = (date: string, name: string, confirmation: HolidaySeed["confirmation"] = "confirmed"): HolidaySeed => ({
  date,
  name,
  type: "national",
  countsAsHoliday: true,
  confirmation,
});

/** Día no laborable: es optativo para el empleador, por eso no cuenta como feriado salvo que la empresa lo decida. */
const optional = (date: string, name: string): HolidaySeed => ({
  date,
  name,
  type: "optional",
  countsAsHoliday: false,
  confirmation: "confirmed",
});

export const ARGENTINA_HOLIDAYS: readonly HolidaySeed[] = [
  // 2026 (calendario oficial)
  national("2026-01-01", "Año Nuevo"),
  national("2026-02-16", "Carnaval"),
  national("2026-02-17", "Carnaval"),
  optional("2026-03-23", "Día no laborable con fines turísticos"),
  national("2026-03-24", "Día Nacional de la Memoria por la Verdad y la Justicia"),
  national("2026-04-02", "Día del Veterano y de los Caídos en la Guerra de Malvinas (y Jueves Santo)"),
  national("2026-04-03", "Viernes Santo"),
  national("2026-05-01", "Día del Trabajador"),
  national("2026-05-25", "Día de la Revolución de Mayo"),
  national("2026-06-15", "Paso a la Inmortalidad del General Güemes (trasladado del 17/6)"),
  national("2026-06-20", "Paso a la Inmortalidad del General Belgrano (Día de la Bandera)"),
  national("2026-07-09", "Día de la Independencia"),
  optional("2026-07-10", "Día no laborable con fines turísticos"),
  national("2026-08-17", "Paso a la Inmortalidad del General San Martín"),
  national("2026-10-12", "Día del Respeto a la Diversidad Cultural"),
  national("2026-11-23", "Día de la Soberanía Nacional (trasladado del 20/11)"),
  optional("2026-12-07", "Día no laborable con fines turísticos"),
  national("2026-12-08", "Inmaculada Concepción de María"),
  national("2026-12-25", "Navidad"),

  // 2027 (fechas fijadas por la ley; los trasladables, calculados con el art. 6)
  national("2027-01-01", "Año Nuevo"),
  national("2027-02-08", "Carnaval"),
  national("2027-02-09", "Carnaval"),
  national("2027-03-24", "Día Nacional de la Memoria por la Verdad y la Justicia"),
  optional("2027-03-25", "Jueves Santo (día no laborable)"),
  national("2027-03-26", "Viernes Santo"),
  national("2027-04-02", "Día del Veterano y de los Caídos en la Guerra de Malvinas"),
  national("2027-05-01", "Día del Trabajador"),
  national("2027-05-25", "Día de la Revolución de Mayo"),
  national("2027-06-20", "Paso a la Inmortalidad del General Belgrano (Día de la Bandera)"),
  national("2027-06-21", "Paso a la Inmortalidad del General Güemes (trasladado del 17/6)", "to_confirm"),
  national("2027-07-09", "Día de la Independencia"),
  national("2027-08-16", "Paso a la Inmortalidad del General San Martín (trasladado del 17/8)", "to_confirm"),
  national("2027-10-11", "Día del Respeto a la Diversidad Cultural (trasladado del 12/10)", "to_confirm"),
  national("2027-11-20", "Día de la Soberanía Nacional", "to_confirm"),
  national("2027-12-08", "Inmaculada Concepción de María"),
  national("2027-12-25", "Navidad"),
];

export const holidaysOfYear = (year: number): HolidaySeed[] => ARGENTINA_HOLIDAYS.filter((h) => h.date.startsWith(`${year}-`));

export const toHolidayMap = (holidays: readonly Holiday[]): Map<string, Holiday> => new Map(holidays.map((h) => [h.date, h]));
