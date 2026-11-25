import { collection, doc, getDoc, getDocs, orderBy, limit, query, serverTimestamp, where, writeBatch, type Query } from "firebase/firestore";
import { isValidPeriod, titleProblems, type AllowedMime, type DocumentKind, type DocumentMeta } from "@/domain/documents";
import type { SessionUser } from "@/domain/types";
import { getFirebase } from "./firebase";

/** Aviso interno: se subió o borró un documento y las pantallas abiertas deben volver a leer. */
export const DOCUMENTS_CHANGED = "sgblack:documents-changed";
const announce = () => window.dispatchEvent(new Event(DOCUMENTS_CHANGED));

const chunk = <T>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

const fromDoc = (id: string, data: Record<string, unknown>): DocumentMeta => ({
  id,
  userId: String(data.userId),
  kind: data.kind === "receipt" ? "receipt" : "certificate",
  title: String(data.title ?? ""),
  fileName: String(data.fileName ?? ""),
  mime: data.mime as AllowedMime,
  size: Number(data.size) || 0,
  period: typeof data.period === "string" ? data.period : undefined,
  leaveId: typeof data.leaveId === "string" ? data.leaveId : undefined,
  uploadedBy: String(data.uploadedBy ?? ""),
  uploadedAt: (data.uploadedAt as { toDate?: () => Date } | undefined)?.toDate?.(),
});

const newestFirst = (a: DocumentMeta, b: DocumentMeta) => (b.uploadedAt?.getTime() ?? 0) - (a.uploadedAt?.getTime() ?? 0);

export interface NewDocument {
  /** De quién es el documento. */
  userId: string;
  kind: DocumentKind;
  title: string;
  fileName: string;
  mime: AllowedMime;
  size: number;
  base64: string;
  /** Solo recibos: AAAA-MM. */
  period?: string;
  /** Solo certificados: licencia a la que se adjunta. */
  leaveId?: string;
}

/** Sube un documento: los datos y el contenido en un solo lote (o se guardan los dos o ninguno). Las reglas validan quién puede. */
export async function uploadDocument(by: SessionUser, input: NewDocument): Promise<string> {
  const problems = titleProblems(input.title);
  if (problems.length > 0) throw new Error(problems[0]);
  if (input.period !== undefined && !isValidPeriod(input.period)) throw new Error("El período tiene que ser un mes válido.");
  const { db } = getFirebase();
  const ref = doc(collection(db, "documents"));
  const batch = writeBatch(db);
  batch.set(ref, {
    userId: input.userId,
    kind: input.kind,
    title: input.title.trim(),
    fileName: input.fileName,
    mime: input.mime,
    size: input.size,
    ...(input.period ? { period: input.period } : {}),
    ...(input.leaveId ? { leaveId: input.leaveId } : {}),
    uploadedBy: by.uid,
    uploadedAt: serverTimestamp(),
  });
  batch.set(doc(db, "document_files", ref.id), { data: input.base64 });
  await batch.commit();
  announce();
  return ref.id;
}

/** Documentos de una persona (los suyos). Sin el contenido de los archivos. */
export async function listDocumentsOf(uid: string): Promise<DocumentMeta[]> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, "documents"), where("userId", "==", uid)));
  return snap.docs.map((d) => fromDoc(d.id, d.data())).sort(newestFirst);
}

/**
 * Documentos de las personas que `reviewer` tiene a cargo. El administrador ve todos (los últimos 300); un supervisor, solo
 * los certificados de su equipo (la consulta va acotada con `in` y por tipo, como lo exigen las reglas).
 */
export async function listDocumentsForReview(reviewer: SessionUser, teamIds: string[]): Promise<DocumentMeta[]> {
  const { db } = getFirebase();
  const col = collection(db, "documents");
  const queries: Query[] =
    reviewer.role === "admin"
      ? [query(col, orderBy("uploadedAt", "desc"), limit(300))]
      : chunk(teamIds, 30).map((ids) => query(col, where("userId", "in", ids), where("kind", "==", "certificate")));
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  return snaps.flatMap((s) => s.docs.map((d) => fromDoc(d.id, d.data()))).sort(newestFirst);
}

/** Contenido de un archivo (base64), solo cuando se lo abre. */
export async function getDocumentData(id: string): Promise<string> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, "document_files", id));
  const data = snap.exists() ? (snap.data() as { data?: unknown }).data : undefined;
  if (typeof data !== "string") throw new Error("No se encontró el archivo.");
  return data;
}

/** Borra el documento y su contenido. Lo puede hacer quien lo subió o el administrador. */
export async function deleteDocument(id: string): Promise<void> {
  const { db } = getFirebase();
  const batch = writeBatch(db);
  batch.delete(doc(db, "documents", id));
  batch.delete(doc(db, "document_files", id));
  await batch.commit();
  announce();
}

