import type { DocumentMeta } from "@/domain/documents";
import type { SessionUser } from "@/domain/types";
import { getDocumentData, uploadDocument } from "./documents";
import { blobFromBase64, type PreparedFile } from "./files";

/** Abre un documento en otra pestaña (PDF o imagen), pidiendo su contenido recién ahora. */
export async function openDocumentInTab(d: Pick<DocumentMeta, "id" | "mime">): Promise<void> {
  const url = URL.createObjectURL(blobFromBase64(await getDocumentData(d.id), d.mime));
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Sube un certificado y lo adjunta a una licencia. Si falla, no deshace la licencia (que ya existe): devuelve false para
 * que la pantalla avise que hay que subirlo desde Documentos.
 */
export async function attachCertificate(args: { by: SessionUser; userId: string; leaveId: string; title: string; prepared: PreparedFile }): Promise<boolean> {
  try {
    await uploadDocument(args.by, { userId: args.userId, kind: "certificate", title: args.title, fileName: args.prepared.fileName, mime: args.prepared.mime, size: args.prepared.size, base64: args.prepared.base64, leaveId: args.leaveId });
    return true;
  } catch (e) {
    console.error("No se pudo adjuntar el certificado", e);
    return false;
  }
}
