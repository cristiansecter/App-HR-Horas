import { ALLOWED_MIMES, EXTENSIONS, fileProblems, MAX_FILE_BYTES, safeFileName, type AllowedMime } from "@/domain/documents";

/** Archivo listo para guardar: contenido en base64 (sin el prefijo "data:"), tipo y tamaño reales en bytes. */
export interface PreparedFile {
  base64: string;
  mime: AllowedMime;
  /** Tamaño en bytes del archivo ya procesado. */
  size: number;
  fileName: string;
}

export class FileError extends Error {}

const readAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new FileError("No se pudo leer el archivo."));
    reader.readAsDataURL(blob);
  });

const base64Of = (dataUrl: string): string => dataUrl.slice(dataUrl.indexOf(",") + 1);

/** Bytes que representa un texto base64. */
const bytesOfBase64 = (b64: string): number => Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);

const loadImage = (file: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new FileError("No se pudo abrir la imagen. Probá con otra foto o con un PDF.")); };
    img.src = url;
  });

const toBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> => new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

/**
 * Achica una foto hasta que entre en el límite: baja el tamaño (máximo 1600 px de lado) y la calidad de a poco.
 * Siempre sale como JPG (fondo blanco, si la imagen tenía transparencia).
 */
async function shrinkImage(file: File): Promise<Blob> {
  const img = await loadImage(file);
  let side = Math.min(1600, Math.max(img.naturalWidth, img.naturalHeight));
  // Margen bajo el máximo: el texto base64 pesa un tercio más y las reglas miran su largo.
  const target = MAX_FILE_BYTES - 20 * 1024;
  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new FileError("Este navegador no puede procesar imágenes. Subí un PDF.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.72, 0.6, 0.48]) {
      const blob = await toBlob(canvas, quality);
      if (blob && blob.size <= target) return blob;
    }
    side = Math.round(side * 0.75);
  }
  throw new FileError("No se pudo achicar la imagen lo suficiente. Probá con otra foto o con un PDF.");
}

/**
 * Valida el archivo y lo deja listo para guardar. Un PDF se acepta tal cual si pesa hasta 700 KB; una imagen se
 * achica sola. Lanza FileError con un mensaje para mostrar si no se puede.
 */
export async function prepareFile(file: File): Promise<PreparedFile> {
  const problems = fileProblems({ name: file.name, type: file.type, size: file.size });
  if (problems.length > 0) throw new FileError(problems[0]!);

  let blob: Blob = file;
  let mime = file.type as AllowedMime;
  let fileName = safeFileName(file.name);
  if (mime !== "application/pdf") {
    // Una imagen que ya es chica se guarda como está (no se pierde calidad); si no, se achica.
    if (file.size > MAX_FILE_BYTES - 20 * 1024) {
      blob = await shrinkImage(file);
      mime = "image/jpeg";
      fileName = fileName.replace(/\.[^.]+$/, "") + ".jpg";
    }
  }
  const base64 = base64Of(await readAsDataUrl(blob));
  const size = bytesOfBase64(base64);
  if (size > MAX_FILE_BYTES) throw new FileError("El archivo sigue pesando demasiado. Probá con uno más liviano.");
  // Nombre con la extensión que corresponde al tipo (por si venía sin ella).
  if (!new RegExp(`\\.${EXTENSIONS[mime]}$`, "i").test(fileName) && !(mime === "image/jpeg" && /\.jpeg$/i.test(fileName))) fileName = `${fileName}.${EXTENSIONS[mime]}`;
  return { base64, mime, size, fileName: fileName.slice(0, 120) };
}

/** Texto base64 → archivo para abrir o descargar. Solo tipos de la lista permitida. */
export function blobFromBase64(base64: string, mime: string): Blob {
  if (!(ALLOWED_MIMES as readonly string[]).includes(mime)) throw new FileError("Tipo de archivo no permitido.");
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
