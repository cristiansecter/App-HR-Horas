import type { Role } from "./types";

/**
 * Repositorio de documentos (certificados y recibos). Los archivos se guardan dentro de Firestore, codificados en base64,
 * porque Cloud Storage de Firebase ya no está en el plan gratuito. Eso limita el tamaño de cada archivo.
 */
export type DocumentKind = "certificate" | "receipt";

export const KIND_LABELS: Record<DocumentKind, string> = { certificate: "Certificado", receipt: "Recibo" };

/** Tipos de archivo aceptados. SVG y similares quedan afuera a propósito (pueden llevar scripts). */
export const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMime = (typeof ALLOWED_MIMES)[number];

/** Máximo de un archivo ya listo para guardar: 700 KB. En base64 pesa ~933 KB, bajo el límite de 1 MiB de un documento de Firestore. */
export const MAX_FILE_BYTES = 700 * 1024;
/** Largo máximo del texto base64 que aceptan las reglas (el de 700 KB más un margen). */
export const MAX_BASE64_CHARS = 960_000;
export const MAX_TITLE_LENGTH = 120;

/** Documento guardado: lo que se ve en las listas (el contenido del archivo se pide aparte, solo al abrirlo). */
export interface DocumentMeta {
  id: string;
  /** De quién es el documento. */
  userId: string;
  kind: DocumentKind;
  title: string;
  fileName: string;
  mime: AllowedMime;
  /** Tamaño del archivo en bytes. */
  size: number;
  /** Solo recibos: mes al que corresponde, AAAA-MM. */
  period?: string;
  /** Solo certificados: licencia a la que se adjunta. */
  leaveId?: string;
  /** Quién lo subió. */
  uploadedBy: string;
  uploadedAt?: Date;
}

const isAllowedMime = (m: string): m is AllowedMime => (ALLOWED_MIMES as readonly string[]).includes(m);

/** Extensión según el tipo, para dar un nombre de archivo cuando se descarga. */
export const EXTENSIONS: Record<AllowedMime, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Problemas de un archivo antes de procesarlo. Vacío si se puede subir. Las imágenes se achican solas; un PDF no. */
export const fileProblems = (file: { name: string; type: string; size: number }): string[] => {
  if (!isAllowedMime(file.type)) return ["Solo se aceptan PDF e imágenes JPG, PNG o WebP."];
  if (file.size <= 0) return ["El archivo está vacío."];
  if (file.type === "application/pdf" && file.size > MAX_FILE_BYTES) {
    const kb = Math.round(file.size / 1024);
    return [`El PDF pesa ${kb} KB y el máximo es ${Math.round(MAX_FILE_BYTES / 1024)} KB. Comprimilo, o sacale una foto al documento.`];
  }
  return [];
};

/** Nombre de archivo seguro para mostrar y descargar: sin rutas ni caracteres raros, con largo acotado. */
export const safeFileName = (name: string): string => {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^\p{L}\p{N}._ -]/gu, "").replace(/\s+/g, " ").trim();
  return (cleaned || "documento").slice(0, 120);
};

/** Problemas del título. */
export const titleProblems = (title: string): string[] => {
  const t = title.trim();
  if (!t) return ["Poné un título, por ejemplo “Certificado médico”."];
  if (t.length > MAX_TITLE_LENGTH) return [`El título es muy largo (máximo ${MAX_TITLE_LENGTH} letras).`];
  return [];
};

export const isValidPeriod = (p: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

/**
 * Quién puede subir cada tipo, para quién:
 * - Certificado: la persona (los suyos), su supervisor y el administrador.
 * - Recibo: solo el administrador (los emite la empresa).
 * `targetIsSelf` = el documento es de quien lo sube; `supervisesTarget` = es de alguien de su equipo.
 */
export const canUpload = (role: Role, kind: DocumentKind, targetIsSelf: boolean, supervisesTarget: boolean): boolean => {
  if (role === "admin") return true;
  if (kind === "receipt") return false;
  return targetIsSelf || (role === "supervisor" && supervisesTarget);
};

/** Quién puede leer un documento: su dueño, el administrador y, solo si es un certificado, el supervisor del dueño. */
export const canRead = (role: Role, kind: DocumentKind, isOwner: boolean, supervisesOwner: boolean): boolean =>
  isOwner || role === "admin" || (kind === "certificate" && role === "supervisor" && supervisesOwner);

/** Quién puede borrar: el administrador o quien lo subió. */
export const canDelete = (role: Role, uploadedBy: string, me: string): boolean => role === "admin" || uploadedBy === me;
