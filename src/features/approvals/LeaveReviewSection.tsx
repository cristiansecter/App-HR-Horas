import { useMemo, useState, type FormEvent } from "react";
import { useCompany } from "@/company/CompanyContext";
import { dateInBuenosAires } from "@/domain/dates";
import { countLeaveDays, InvalidLeaveError, formatLeaveDays, rangesOverlap } from "@/domain/leave/days";
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, type LeaveRequest, type LeaveType } from "@/domain/model";
import { withCode } from "@/services/errors";
import { listDocumentsForReview, DOCUMENTS_CHANGED } from "@/services/documents";
import { FileError, prepareFile, type PreparedFile } from "@/services/files";
import { decideLeave, LEAVES_CHANGED, listMyLeaves, registerLeaveFor } from "@/services/leaves";
import { attachCertificate, openDocumentInTab } from "@/services/openDocument";
import { useUser } from "@/session/SessionContext";
import { Chip } from "@/ui/Page";
import { useToast } from "@/ui/Toast";
import { useAsync } from "@/ui/useAsync";
import { usePendingLeaves } from "./usePendingLeaves";

const dmy = (iso: string) => iso.split("-").reverse().join("/");
const field = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";

/** Licencias pendientes de resolver y alta de ausencias injustificadas. Va dentro de Aprobaciones. */
export default function LeaveReviewSection() {
  const reviewer = useUser();
  const company = useCompany();
  const { notify } = useToast();
  const { data, loading, error } = usePendingLeaves(reviewer);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null);
  const [note, setNote] = useState("");
  const [registering, setRegistering] = useState(false);

  const nameOf = (uid: string) => data?.users.get(uid)?.fullName ?? "Persona";
  const leaves = data?.leaves ?? [];
  // Certificados adjuntos a las licencias que se revisan (un supervisor solo ve los de su equipo; lo exigen las reglas).
  const certs = useAsync(
    async () => (data && data.reviewable.length > 0 ? listDocumentsForReview(reviewer, data.reviewable.map((u) => u.uid)) : []),
    [data, reviewer.uid, reviewer.role],
    [DOCUMENTS_CHANGED, LEAVES_CHANGED],
  );
  const certOf = (leaveId: string) => (certs.data ?? []).find((d) => d.kind === "certificate" && d.leaveId === leaveId);

  const resolve = async (leave: LeaveRequest, approve: boolean, why = "") => {
    setFailure(null);
    setBusy(leave.id);
    try {
      await decideLeave(leave, reviewer, approve, why);
      notify(approve ? `Aprobaste la licencia de ${nameOf(leave.userId)}.` : `Rechazaste la licencia de ${nameOf(leave.userId)}.`);
    } catch (e) {
      console.error("No se pudo resolver la licencia", e);
      setFailure(withCode("No se pudo guardar la decisión. Actualizá la pantalla y probá de nuevo.", e));
    } finally {
      setBusy(null);
      setRejecting(null);
      setNote("");
    }
  };

  return (
    <>
      <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-low p-space-md shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Licencias pendientes</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Al aprobar, la ausencia aparece en el calendario del equipo y en la planilla del mes.</p>
          </div>
          <button type="button" onClick={() => setRegistering(true)} disabled={(data?.reviewable.length ?? 0) === 0} className="flex items-center gap-2 rounded-xl bg-surface-container-high px-4 py-2 font-label-lg text-label-lg font-semibold text-on-surface hover:bg-surface-container-highest disabled:opacity-40">
            <span className="material-symbols-outlined text-[20px]">edit_calendar</span>
            Registrar licencia de una persona
          </button>
        </div>

        {failure || error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{failure ?? error}</p> : null}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">
                {["Persona", "Tipo", "Desde", "Hasta", "Días", "Motivo", ""].map((h) => (
                  <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {leaves.map((l) => (
                <tr key={l.id} className="align-top transition-colors hover:bg-surface-container">
                  <td className="px-space-md py-3 font-semibold">{nameOf(l.userId)}</td>
                  <td className="px-space-md py-3"><Chip tone="info">{LEAVE_TYPE_LABELS[l.type]}</Chip></td>
                  <td className="px-space-md py-3 tabular-nums">{dmy(l.startDate)}</td>
                  <td className="px-space-md py-3 tabular-nums">{dmy(l.endDate)}</td>
                  <td className="px-space-md py-3 tabular-nums">{formatLeaveDays(l.daysCount, l.type)}</td>
                  <td className="px-space-md py-3 font-body-sm text-body-sm text-on-surface-variant italic">
                    {l.reason ? `“${l.reason}”` : ""}
                    {certOf(l.id) ? (
                      <button type="button" aria-label={`Ver certificado de ${nameOf(l.userId)}`} onClick={() => void openDocumentInTab(certOf(l.id)!).catch((e) => { console.error(e); setFailure("No se pudo abrir el certificado."); })} className="mt-1 flex items-center gap-1 rounded-lg bg-surface-container-high px-2 py-1 font-label-md text-label-md font-semibold not-italic text-primary hover:bg-surface-container-highest">
                        <span className="material-symbols-outlined text-[16px]">attach_file</span>Ver certificado
                      </button>
                    ) : null}
                  </td>
                  <td className="px-space-md py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button type="button" disabled={busy === l.id} onClick={() => void resolve(l, true)} className="rounded-lg bg-primary-container/20 px-3 py-1.5 font-label-md text-label-md font-semibold text-primary hover:bg-primary-container/30 disabled:opacity-40">Aprobar</button>
                      <button type="button" disabled={busy === l.id} onClick={() => { setRejecting(l); setNote(""); }} className="rounded-lg bg-surface-container-high px-3 py-1.5 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-highest disabled:opacity-40">Rechazar</button>
                    </div>
                  </td>
                </tr>
              ))}
              {leaves.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-space-md py-8 text-center text-on-surface-variant">
                    {loading && !data ? "Cargando licencias…" : "No hay licencias pendientes."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {rejecting ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setRejecting(null)} />
          <form role="dialog" aria-label="Rechazar licencia" onSubmit={(e) => { e.preventDefault(); void resolve(rejecting, false, note); }} className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface">Rechazar licencia</h2>
              <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{nameOf(rejecting.userId)} · {LEAVE_TYPE_LABELS[rejecting.type]} · {dmy(rejecting.startDate)} al {dmy(rejecting.endDate)}</p>
            </div>
            <label className="block font-label-lg text-label-lg text-on-surface">
              Motivo del rechazo <span className="font-label-xs-mono text-label-xs-mono text-on-surface-variant uppercase">Opcional</span>
              <textarea rows={3} maxLength={250} value={note} onChange={(e) => setNote(e.target.value)} className={`mt-1.5 ${field}`} />
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setRejecting(null)} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
              <button type="submit" className="rounded-lg bg-error-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-error-container hover:brightness-110">Rechazar</button>
            </div>
          </form>
        </div>
      ) : null}

      {registering && data ? (
        <RegisterLeaveDialog
          people={data.reviewable}
          holidays={company.holidays}
          defaultSchedule={company.defaultSchedule}
          onClose={() => setRegistering(false)}
          onDone={(name) => {
            setRegistering(false);
            notify(`Registraste la licencia de ${name}.`);
          }}
        />
      ) : null}
    </>
  );
}

/** Tipos que se pueden registrar por otra persona: todos los solicitables y la ausencia injustificada (que solo se registra así). */
const REGISTERABLE: readonly LeaveType[] = ["vacation", "sick", "study", "personal", "unjustified"];

/** Quien supervisa (o el administrador) registra una licencia por alguien de su equipo, ya aprobada. */
function RegisterLeaveDialog({
  people,
  holidays,
  defaultSchedule,
  onClose,
  onDone,
}: {
  people: { uid: string; fullName: string; workSchedule?: import("@/domain/overtime").WorkSchedule }[];
  holidays: ReturnType<typeof useCompany>["holidays"];
  defaultSchedule: import("@/domain/overtime").WorkSchedule;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const reviewer = useUser();
  const today = dateInBuenosAires(new Date());
  const [uid, setUid] = useState(people[0]?.uid ?? "");
  const [type, setType] = useState<LeaveType>("vacation");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState("");
  const [certificate, setCertificate] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const person = people.find((p) => p.uid === uid);
  // Licencias que esa persona ya tiene, para no registrar dos veces el mismo período.
  const theirs = useAsync(() => (uid ? listMyLeaves(uid) : Promise.resolve([] as LeaveRequest[])), [uid], [LEAVES_CHANGED]);
  const clash = useMemo(() => (theirs.data ?? []).find((l) => l.status !== "rejected" && rangesOverlap(from, to, l.startDate, l.endDate)), [theirs.data, from, to]);

  const preview = useMemo<{ days: number } | { error: string }>(() => {
    try {
      return { days: countLeaveDays(type, from, to, person?.workSchedule ?? defaultSchedule, holidays) };
    } catch (e) {
      return { error: e instanceof InvalidLeaveError ? e.message : "Revisá las fechas." };
    }
  }, [type, from, to, person, defaultSchedule, holidays]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!person || "error" in preview) return;
    if (preview.days === 0) return setFormError("Ese período no tiene ningún día hábil para esa persona.");
    if (clash) return setFormError(`${person.fullName} ya tiene una licencia ${LEAVE_STATUS_LABELS[clash.status].toLowerCase()} del ${dmy(clash.startDate)} al ${dmy(clash.endDate)}.`);
    setSaving(true);
    setFormError(null);
    let prepared: PreparedFile | null = null;
    if (certificate) {
      try {
        prepared = await prepareFile(certificate);
      } catch (err) {
        setFormError(err instanceof FileError ? err.message : "No se pudo leer el certificado.");
        setSaving(false);
        return;
      }
    }
    try {
      const leaveId = await registerLeaveFor(reviewer, { userId: person.uid, type, startDate: from, endDate: to, daysCount: preview.days, reason });
      if (prepared) await attachCertificate({ by: reviewer, userId: person.uid, leaveId, title: `Certificado de ${LEAVE_TYPE_LABELS[type].toLowerCase()}`, prepared });
    } catch (err) {
      console.error("No se pudo registrar la licencia", err);
      setFormError(withCode("No se pudo registrar la licencia. Probá de nuevo.", err));
      setSaving(false);
      return;
    }
    onDone(person.fullName);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <form role="dialog" aria-label="Registrar licencia" onSubmit={(e) => void submit(e)} className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
        <h2 className="font-headline-md text-headline-md text-on-surface">Registrar licencia de una persona</h2>
        <label className="block font-label-lg text-label-lg text-on-surface">
          Persona
          <select value={uid} onChange={(e) => setUid(e.target.value)} className={`mt-1.5 ${field}`}>
            {people.map((p) => (
              <option key={p.uid} value={p.uid}>{p.fullName}</option>
            ))}
          </select>
        </label>
        <label className="block font-label-lg text-label-lg text-on-surface">
          Tipo
          <select aria-label="Tipo de licencia" value={type} onChange={(e) => setType(e.target.value as LeaveType)} className={`mt-1.5 ${field}`}>
            {REGISTERABLE.map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block font-label-lg text-label-lg text-on-surface">
            Desde
            <input type="date" required value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} className={`mt-1.5 ${field}`} />
          </label>
          <label className="block font-label-lg text-label-lg text-on-surface">
            Hasta
            <input type="date" required min={from} value={to} onChange={(e) => setTo(e.target.value)} className={`mt-1.5 ${field}`} />
          </label>
        </div>
        <p className="rounded-lg bg-surface-container px-3 py-2 font-body-md text-body-md text-on-surface" aria-live="polite">
          {"days" in preview ? (
            <>
              <span className="font-semibold tabular-nums">{formatLeaveDays(preview.days, type)}</span>
            </>
          ) : (
            <span className="text-error">{preview.error}</span>
          )}
        </p>
        <label className="block font-label-lg text-label-lg text-on-surface">
          Observación <span className="font-label-xs-mono text-label-xs-mono text-on-surface-variant uppercase">Opcional</span>
          <textarea rows={2} maxLength={250} value={reason} onChange={(e) => setReason(e.target.value)} className={`mt-1.5 ${field}`} />
        </label>
        <label className="block font-label-lg text-label-lg text-on-surface">
          Certificado <span className="font-label-xs-mono text-label-xs-mono text-on-surface-variant uppercase">Opcional</span>
          <input type="file" aria-label="Certificado" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setCertificate(e.target.files?.[0] ?? null)} className={`mt-1.5 ${field} file:mr-3 file:rounded-md file:border-0 file:bg-surface-container-high file:px-3 file:py-1.5 file:font-label-md file:text-on-surface`} />
        </label>
        {clash ? <p role="note" className="font-body-sm text-body-sm text-amber-200">{person?.fullName} ya tiene una licencia {LEAVE_STATUS_LABELS[clash.status].toLowerCase()} del {dmy(clash.startDate)} al {dmy(clash.endDate)}.</p> : null}
        <p className="font-body-sm text-body-sm text-on-surface-variant">Queda aprobada desde el registro y la persona la ve en sus licencias, anotada como cargada por vos.</p>
        {formError ? <p role="alert" className="font-body-sm text-body-sm text-error">{formError}</p> : null}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
          <button type="submit" disabled={saving || !person} className="rounded-lg bg-primary-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-50">{saving ? "Registrando…" : "Registrar"}</button>
        </div>
      </form>
    </div>
  );
}
