import { isValidIsoDate } from "./dates";

/**
 * Vencimientos de cada persona que conviene no olvidar: el seguro, el fin del período de prueba o de una pasantía,
 * un contrato a plazo fijo u otro. Los carga el administrador en la ficha y aparecen como avisos antes de la fecha.
 */
export type ExpirationKind = "insurance" | "probation" | "internship" | "fixed_term" | "other";

export const EXPIRATION_KINDS: readonly ExpirationKind[] = ["insurance", "probation", "internship", "fixed_term", "other"];

export const EXPIRATION_LABELS: Record<ExpirationKind, string> = {
  insurance: "Seguro",
  probation: "Período de prueba",
  internship: "Pasantía",
  fixed_term: "Contrato a plazo fijo",
  other: "Otro vencimiento",
};

/** `expirations/{id}` */
export interface Expiration {
  id: string;
  userId: string;
  kind: ExpirationKind;
  /** Texto libre opcional (por ejemplo "Seguro de vida" o "Carnet de conducir"). */
  title: string;
  /** AAAA-MM-DD */
  date: string;
  note?: string;
}

export const MAX_EXPIRATION_TEXT = 120;

/** Problemas de un vencimiento antes de guardarlo. Vacío si está bien. */
export const expirationProblems = (input: { kind: string; title: string; date: string }): string[] => {
  const out: string[] = [];
  if (!(EXPIRATION_KINDS as readonly string[]).includes(input.kind)) out.push("Elegí el tipo de vencimiento.");
  if (!isValidIsoDate(input.date)) out.push("Elegí una fecha válida.");
  if (input.kind === "other" && !input.title.trim()) out.push("Para “Otro vencimiento” poné de qué se trata.");
  if (input.title.length > MAX_EXPIRATION_TEXT) out.push(`El texto es muy largo (máximo ${MAX_EXPIRATION_TEXT} letras).`);
  return out;
};

/** Nombre para mostrar: el texto libre si hay, o el tipo. */
export const expirationName = (e: Pick<Expiration, "kind" | "title">): string => e.title.trim() || EXPIRATION_LABELS[e.kind];
