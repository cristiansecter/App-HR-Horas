/** Validaciones y formato de los datos de identificación de una persona (Argentina). */

const digitsOf = (value: string): string => value.replace(/\D/g, "");

/** "20123456786" o "20-12345678-6" → "20-12345678-6". Si no tiene 11 dígitos devuelve el texto como vino. */
export const formatCuil = (value: string): string => {
  const d = digitsOf(value);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : value.trim();
};

/** Dígito verificador de un CUIL/CUIT (módulo 11 con pesos 5,4,3,2,7,6,5,4,3,2). */
export const cuilCheckDigit = (first10: string): number => {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = [...first10].reduce((acc, ch, i) => acc + Number(ch) * weights[i]!, 0);
  const rest = 11 - (sum % 11);
  return rest === 11 ? 0 : rest === 10 ? 9 : rest;
};

export type CuilCheck = { ok: true; formatted: string } | { ok: false; formatted: string; blocking: boolean; message: string };

/**
 * Revisa un CUIL. Vacío es válido (el dato es opcional). Si no tiene 11 dígitos es un error que impide guardar;
 * si el dígito verificador no coincide es solo un aviso, porque puede ser un error de tipeo o un dato de prueba.
 */
export const checkCuil = (value: string): CuilCheck => {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, formatted: "" };
  const d = digitsOf(trimmed);
  const formatted = formatCuil(trimmed);
  if (d.length !== 11) return { ok: false, formatted, blocking: true, message: "El CUIL tiene que tener 11 dígitos (por ejemplo 20-12345678-6)." };
  if (cuilCheckDigit(d.slice(0, 10)) !== Number(d[10])) {
    return { ok: false, formatted, blocking: false, message: "El dígito verificador no coincide: revisá que el CUIL esté bien escrito." };
  }
  return { ok: true, formatted };
};

/** "12345678" → "12.345.678". Acepta 7 u 8 dígitos; si no, devuelve el texto como vino. */
export const formatDni = (value: string): string => {
  const d = digitsOf(value);
  if (d.length < 7 || d.length > 8) return value.trim();
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

export const checkDni = (value: string): { ok: true; formatted: string } | { ok: false; formatted: string; message: string } => {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, formatted: "" };
  const d = digitsOf(trimmed);
  if (d.length < 7 || d.length > 8) return { ok: false, formatted: trimmed, message: "El DNI tiene 7 u 8 dígitos." };
  return { ok: true, formatted: formatDni(trimmed) };
};
