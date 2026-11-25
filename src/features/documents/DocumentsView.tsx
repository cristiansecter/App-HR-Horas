import { useMemo, useRef, useState, type FormEvent } from "react";
import { canDelete, canUpload, KIND_LABELS, titleProblems, type DocumentKind, type DocumentMeta } from "@/domain/documents";
import type { UserSummary } from "@/domain/model";
import { dateInBuenosAires } from "@/domain/dates";
import { listUsers } from "@/services/company";
import { deleteDocument, DOCUMENTS_CHANGED, getDocumentData, listDocumentsForReview, listDocumentsOf, uploadDocument } from "@/services/documents";
import { withCode } from "@/services/errors";
import { blobFromBase64, FileError, prepareFile } from "@/services/files";
import { useUser } from "@/session/SessionContext";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useToast } from "@/ui/Toast";
import { useAsync } from "@/ui/useAsync";

const field = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";
const monthLabel = (m: string) => {
  const text = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Abre el contenido de un documento: las imágenes en una ventana propia y los PDF en otra pestaña. */
type Preview = { kind: "image"; url: string; title: string } | null;

/**
 * Documentos: repositorio de certificados y recibos. Cada persona ve y sube los suyos (certificados); el supervisor sube y
 * ve los certificados de su equipo; el administrador sube también los recibos y ve todo. Los recibos nunca los ve el supervisor.
 */
export default function DocumentsView() {
  const actor = useUser();
  const { notify } = useToast();
  const isAdmin = actor.role === "admin";
  const isSupervisor = actor.role === "supervisor";
  const [tab, setTab] = useState<"mine" | "team">(isAdmin ? "team" : "mine");

  const { data, loading, error } = useAsync(
    async () => {
      const users = await listUsers();
      // Administrador: toda la empresa. Supervisor: solo quienes lo tienen como supervisor (las reglas lo exigen igual).
      const team = users.filter((u) => u.active && u.uid !== actor.uid && (isAdmin || u.supervisorId === actor.uid));
      const [mine, others] = await Promise.all([
        isAdmin ? Promise.resolve([] as DocumentMeta[]) : listDocumentsOf(actor.uid),
        isAdmin || (isSupervisor && team.length > 0) ? listDocumentsForReview(actor, team.map((u) => u.uid)) : Promise.resolve([] as DocumentMeta[]),
      ]);
      return { users, team, mine, others };
    },
    [actor.uid, actor.role],
    [DOCUMENTS_CHANGED],
  );
  const nameOf = (uid: string) => data?.users.find((u) => u.uid === uid)?.fullName ?? (uid === actor.uid ? "Vos" : "Persona");

  // ---- subida
  const [target, setTarget] = useState<string | null>(null);
  const [kind, setKind] = useState<DocumentKind>("certificate");
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState(dateInBuenosAires(new Date()).slice(0, 7));
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const team = data?.team ?? [];
  // Quién puede recibir un documento: el administrador, cualquiera; el supervisor, él mismo y su equipo; el empleado, solo él.
  const targets: { uid: string; name: string }[] = [
    ...(isAdmin ? [] : [{ uid: actor.uid, name: isSupervisor ? `Yo (${actor.fullName})` : actor.fullName }]),
    ...team.map((u: UserSummary) => ({ uid: u.uid, name: u.fullName })),
  ];
  const targetUid = target ?? targets[0]?.uid ?? "";
  const canReceipt = canUpload(actor.role, "receipt", false, false);
  const effectiveKind: DocumentKind = canReceipt ? kind : "certificate";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const t = titleProblems(title);
    if (t.length > 0) return setFormError(t[0]!);
    if (!targetUid) return setFormError("Elegí para quién es el documento.");
    if (!file) return setFormError("Elegí un archivo.");
    setSaving(true);
    try {
      const prepared = await prepareFile(file);
      await uploadDocument(actor, {
        userId: targetUid,
        kind: effectiveKind,
        title,
        fileName: prepared.fileName,
        mime: prepared.mime,
        size: prepared.size,
        base64: prepared.base64,
        ...(effectiveKind === "receipt" ? { period } : {}),
      });
      setTitle("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      notify(`Subiste “${title.trim()}”.`);
    } catch (err) {
      console.error("No se pudo subir el documento", err);
      setFormError(err instanceof FileError || (err instanceof Error && /título|período/i.test(err.message)) ? (err as Error).message : withCode("No se pudo subir el documento. Probá de nuevo.", err));
    } finally {
      setSaving(false);
    }
  };

  // ---- ver, descargar y borrar
  const [preview, setPreview] = useState<Preview>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchBlob = async (d: DocumentMeta): Promise<Blob> => blobFromBase64(await getDocumentData(d.id), d.mime);
  const open = async (d: DocumentMeta) => {
    setActionError(null);
    setBusy(d.id);
    try {
      const blob = await fetchBlob(d);
      const url = URL.createObjectURL(blob);
      if (d.mime === "application/pdf") {
        const a = document.createElement("a");
        a.href = url; a.target = "_blank"; a.rel = "noopener";
        document.body.appendChild(a); a.click(); a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else setPreview({ kind: "image", url, title: d.title });
    } catch (err) {
      console.error("No se pudo abrir el documento", err);
      setActionError(withCode("No se pudo abrir el documento.", err));
    } finally {
      setBusy(null);
    }
  };
  const download = async (d: DocumentMeta) => {
    setActionError(null);
    setBusy(d.id);
    try {
      const url = URL.createObjectURL(await fetchBlob(d));
      const a = document.createElement("a");
      a.href = url; a.download = d.fileName;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch (err) {
      console.error("No se pudo descargar el documento", err);
      setActionError(withCode("No se pudo descargar el documento.", err));
    } finally {
      setBusy(null);
    }
  };
  const [removing, setRemoving] = useState<DocumentMeta | null>(null);
  const confirmRemove = async () => {
    if (!removing) return;
    setBusy(removing.id);
    try {
      await deleteDocument(removing.id);
      notify(`Borraste “${removing.title}”.`);
      setRemoving(null);
    } catch (err) {
      console.error("No se pudo borrar el documento", err);
      setActionError(withCode("No se pudo borrar el documento.", err));
    } finally {
      setBusy(null);
    }
  };

  const list = useMemo(() => (tab === "mine" ? (data?.mine ?? []) : (data?.others ?? [])), [tab, data]);
  const showTeamTab = isAdmin || isSupervisor;
  const showMineTab = !isAdmin;
  const [personFilter, setPersonFilter] = useState("all");
  const shown = list.filter((d) => personFilter === "all" || d.userId === personFilter);

  return (
    <Page>
      <PageHeader
        eyebrow="Repositorio"
        title="Documentos"
        subtitle={
          isAdmin
            ? "Certificados y recibos de toda la empresa. Los recibos los subís vos; los certificados los suben las personas, sus supervisores o vos."
            : isSupervisor
              ? "Tus certificados y los de tu equipo. Los recibos de sueldo los sube el administrador y los ve cada persona; vos no los ves."
              : "Tus certificados (por ejemplo médicos) y tus recibos. Podés subir tus certificados; los recibos los sube la empresa."
        }
      />

      <form onSubmit={(e) => void submit(e)} aria-label="Subir documento" className="rounded-xl bg-surface-container-low p-space-lg shadow-md">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Subir un documento</h2>
        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">PDF de hasta 700 KB, o una foto en JPG, PNG o WebP (se achica sola para que entre).</p>
        <div className="mt-space-md grid gap-4 md:grid-cols-2">
          {targets.length > 1 || isAdmin ? (
            <label className="block font-label-lg text-label-lg text-on-surface">Para
              <select aria-label="Para quién" value={targetUid} onChange={(e) => setTarget(e.target.value)} className={`mt-1.5 ${field}`}>
                {targets.map((t) => <option key={t.uid} value={t.uid}>{t.name}</option>)}
              </select>
            </label>
          ) : null}
          <label className="block font-label-lg text-label-lg text-on-surface">Tipo
            <select aria-label="Tipo de documento" value={effectiveKind} disabled={!canReceipt} onChange={(e) => setKind(e.target.value as DocumentKind)} className={`mt-1.5 ${field} disabled:opacity-60`}>
              <option value="certificate">{KIND_LABELS.certificate}</option>
              {canReceipt ? <option value="receipt">{KIND_LABELS.receipt}</option> : null}
            </select>
          </label>
          <label className="block font-label-lg text-label-lg text-on-surface">Título
            <input aria-label="Título del documento" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={effectiveKind === "receipt" ? "Recibo de sueldo octubre" : "Certificado médico"} className={`mt-1.5 ${field}`} />
          </label>
          {effectiveKind === "receipt" ? (
            <label className="block font-label-lg text-label-lg text-on-surface">Mes del recibo
              <input type="month" aria-label="Mes del recibo" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} className={`mt-1.5 ${field}`} />
            </label>
          ) : null}
          <label className="block font-label-lg text-label-lg text-on-surface md:col-span-2">Archivo
            <input ref={fileInput} type="file" accept={ACCEPT} aria-label="Archivo" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={`mt-1.5 ${field} file:mr-3 file:rounded-md file:border-0 file:bg-surface-container-high file:px-3 file:py-1.5 file:font-label-md file:text-on-surface`} />
          </label>
        </div>
        {formError ? <p role="alert" className="mt-3 font-body-sm text-body-sm text-error">{formError}</p> : null}
        <div className="mt-space-md flex justify-end">
          <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-primary-container px-5 py-2.5 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-50">
            <span className="material-symbols-outlined text-[20px]">upload_file</span>{saving ? "Subiendo…" : "Subir"}
          </button>
        </div>
      </form>

      {error || actionError ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{actionError ?? error}</p> : null}

      <div className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-space-md pb-3">
          <div role="tablist" aria-label="Documentos" className="flex gap-2">
            {showMineTab ? <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => { setTab("mine"); setPersonFilter("all"); }} className={`rounded-lg px-4 py-2 font-label-lg text-label-lg ${tab === "mine" ? "bg-surface-container-high font-semibold text-primary" : "text-on-surface-variant hover:text-on-surface"}`}>Míos</button> : null}
            {showTeamTab ? <button type="button" role="tab" aria-selected={tab === "team"} onClick={() => { setTab("team"); setPersonFilter("all"); }} className={`rounded-lg px-4 py-2 font-label-lg text-label-lg ${tab === "team" ? "bg-surface-container-high font-semibold text-primary" : "text-on-surface-variant hover:text-on-surface"}`}>{isAdmin ? "De la empresa" : "De mi equipo"}</button> : null}
          </div>
          {tab === "team" && team.length > 0 ? (
            <select aria-label="Filtrar por persona" value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className={`${field} max-w-60`}>
              <option value="all">Todas las personas</option>
              {team.map((u) => <option key={u.uid} value={u.uid}>{u.fullName}</option>)}
            </select>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="stack-table w-full border-collapse text-left" aria-label="Lista de documentos">
            <thead>
              <tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">
                {["Documento", ...(tab === "team" ? ["Persona"] : []), "Tipo", "Fecha", "Subido por", "Tamaño", ""].map((h, i) => <th key={i} className="px-space-md py-3.5 font-semibold">{h || <span className="sr-only">Acciones</span>}</th>)}
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {shown.map((d) => (
                <tr key={d.id} className="align-middle hover:bg-surface-container">
                  <td className="px-space-md py-3 font-semibold">{d.title}<span className="block font-body-sm text-body-sm font-normal text-on-surface-variant">{d.fileName}</span></td>
                  {tab === "team" ? <td data-label="Persona" className="px-space-md py-3">{nameOf(d.userId)}</td> : null}
                  <td data-label="Tipo" className="px-space-md py-3"><Chip tone={d.kind === "receipt" ? "info" : "normal"}>{KIND_LABELS[d.kind]}</Chip></td>
                  <td data-label="Fecha" className="px-space-md py-3 tabular-nums">{d.kind === "receipt" && d.period ? monthLabel(d.period) : (d.uploadedAt?.toLocaleDateString("es-AR") ?? "—")}</td>
                  <td data-label="Subido por" className="px-space-md py-3 text-on-surface-variant">{d.uploadedBy === d.userId ? (d.userId === actor.uid ? "Vos" : nameOf(d.userId)) : nameOf(d.uploadedBy)}</td>
                  <td data-label="Tamaño" className="px-space-md py-3 tabular-nums text-on-surface-variant">{kb(d.size)}</td>
                  <td className="px-space-md py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" aria-label={`Ver ${d.title}`} title="Ver" disabled={busy === d.id} onClick={() => void open(d)} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-primary disabled:opacity-40"><span className="material-symbols-outlined text-[20px]">visibility</span></button>
                      <button type="button" aria-label={`Descargar ${d.title}`} title="Descargar" disabled={busy === d.id} onClick={() => void download(d)} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-primary disabled:opacity-40"><span className="material-symbols-outlined text-[20px]">download</span></button>
                      {canDelete(actor.role, d.uploadedBy, actor.uid) ? <button type="button" aria-label={`Borrar ${d.title}`} title="Borrar" disabled={busy === d.id} onClick={() => setRemoving(d)} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-error disabled:opacity-40"><span className="material-symbols-outlined text-[20px]">delete</span></button> : null}
                    </div>
                  </td>
                </tr>
              ))}
              {shown.length === 0 ? <tr><td colSpan={7} className="px-space-md py-10 text-center text-on-surface-variant">{loading && !data ? "Cargando…" : "Todavía no hay documentos."}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      {preview ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/85 backdrop-blur-sm" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }} />
          <div role="dialog" aria-label={`Vista de ${preview.title}`} className="relative flex max-h-[90vh] w-full max-w-3xl flex-col gap-3 rounded-xl bg-surface-container-low p-space-md shadow-2xl">
            <div className="flex items-center justify-between gap-3"><h2 className="truncate font-headline-sm text-headline-sm text-on-surface">{preview.title}</h2><button type="button" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }} className="rounded-lg px-3 py-1.5 font-label-md text-label-md text-on-surface-variant hover:text-on-surface">Cerrar</button></div>
            <img src={preview.url} alt={preview.title} className="max-h-[75vh] w-full rounded-lg object-contain" />
          </div>
        </div>
      ) : null}

      {removing ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setRemoving(null)} />
          <div role="alertdialog" aria-label="Borrar documento" className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
            <h2 className="font-headline-md text-headline-md text-on-surface">¿Borrar este documento?</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Vas a borrar “{removing.title}” ({nameOf(removing.userId)}). No se puede deshacer: habría que volver a subirlo.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setRemoving(null)} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
              <button type="button" disabled={busy === removing.id} onClick={() => void confirmRemove()} className="rounded-lg bg-error px-5 py-2 font-label-lg text-label-lg font-bold text-on-error hover:brightness-110 disabled:opacity-50">Borrar</button>
            </div>
          </div>
        </div>
      ) : null}
    </Page>
  );
}
