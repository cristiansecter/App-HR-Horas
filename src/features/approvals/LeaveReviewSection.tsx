import { useMemo, useState, type FormEvent } from "react";
import { useCompany } from "@/company/CompanyContext";
import { dateInBuenosAires } from "@/domain/dates";
import { countLeaveDays, InvalidLeaveError, formatLeaveDays } from "@/domain/leave/days";
import { LEAVE_TYPE_LABELS, type LeaveRequest } from "@/domain/model";
import { withCode } from "@/services/errors";
import { decideLeave, registerUnjustified } from "@/services/leaves";
import { useUser } from "@/session/SessionContext";
import { Chip } from "@/ui/Page";
import { useToast } from "@/ui/Toast";
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
            <span className="material-symbols-outlined text-[20px]">person_off</span>
            Registrar ausencia injustificada
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
                  <td className="px-space-md py-3 font-body-sm text-body-sm text-on-surface-variant italic">{l.reason ? `“${l.reason}”` : ""}</td>
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
        <UnjustifiedDialog
          people={data.reviewable}
          holidays={company.holidays}
          defaultSchedule={company.defaultSchedule}
          onClose={() => setRegistering(false)}
          onDone={(name) => {
            setRegistering(false);
            notify(`Registraste la ausencia injustificada de ${name}.`);
          }}
        />
      ) : null}
    </>
  );
}

function UnjustifiedDialog({
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
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const person = people.find((p) => p.uid === uid);

  const preview = useMemo<{ days: number } | { error: string }>(() => {
    try {
      return { days: countLeaveDays("unjustified", from, to, person?.workSchedule ?? defaultSchedule, holidays) };
    } catch (e) {
      return { error: e instanceof InvalidLeaveError ? e.message : "Revisá las fechas." };
    }
  }, [from, to, person, defaultSchedule, holidays]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!person || "error" in preview) return;
    if (preview.days === 0) return setFormError("Ese período no tiene ningún día hábil para esa persona.");
    setSaving(true);
    setFormError(null);
    try {
      await registerUnjustified(reviewer, { userId: person.uid, startDate: from, endDate: to, daysCount: preview.days, reason });
    } catch (err) {
      console.error("No se pudo registrar la ausencia", err);
      setFormError(withCode("No se pudo registrar la ausencia. Probá de nuevo.", err));
      setSaving(false);
      return;
    }
    onDone(person.fullName);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <form role="dialog" aria-label="Registrar ausencia injustificada" onSubmit={(e) => void submit(e)} className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
        <h2 className="font-headline-md text-headline-md text-on-surface">Registrar ausencia injustificada</h2>
        <label className="block font-label-lg text-label-lg text-on-surface">
          Persona
          <select value={uid} onChange={(e) => setUid(e.target.value)} className={`mt-1.5 ${field}`}>
            {people.map((p) => (
              <option key={p.uid} value={p.uid}>{p.fullName}</option>
            ))}
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
              <span className="font-semibold tabular-nums">{formatLeaveDays(preview.days, "unjustified")}</span>
            </>
          ) : (
            <span className="text-error">{preview.error}</span>
          )}
        </p>
        <label className="block font-label-lg text-label-lg text-on-surface">
          Observación <span className="font-label-xs-mono text-label-xs-mono text-on-surface-variant uppercase">Opcional</span>
          <textarea rows={2} maxLength={250} value={reason} onChange={(e) => setReason(e.target.value)} className={`mt-1.5 ${field}`} />
        </label>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Queda aprobada desde el registro y la persona la ve en sus licencias.</p>
        {formError ? <p role="alert" className="font-body-sm text-body-sm text-error">{formError}</p> : null}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
          <button type="submit" disabled={saving || !person} className="rounded-lg bg-error-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-error-container hover:brightness-110 disabled:opacity-50">{saving ? "Registrando…" : "Registrar"}</button>
        </div>
      </form>
    </div>
  );
}
