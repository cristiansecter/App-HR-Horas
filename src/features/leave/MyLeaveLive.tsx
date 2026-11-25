import { useMemo, useState, type FormEvent } from "react";
import { useCompany } from "@/company/CompanyContext";
import { dateInBuenosAires } from "@/domain/dates";
import { countLeaveDays, InvalidLeaveError, formatLeaveDays, rangesOverlap } from "@/domain/leave/days";
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, REQUESTABLE_LEAVE_TYPES, type LeaveRequest, type LeaveType } from "@/domain/model";
import { withCode } from "@/services/errors";
import { cancelLeave, createLeaveRequest, LEAVES_CHANGED, listMyLeaves } from "@/services/leaves";
import { useUser } from "@/session/SessionContext";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useToast } from "@/ui/Toast";
import { useAsync } from "@/ui/useAsync";

const dmy = (iso: string) => iso.split("-").reverse().join("/");
const TONE = { pending: "info", approved: "ok", rejected: "bad" } as const;
const field = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";

/** Mis licencias con datos reales: solicitar, seguir el estado y retirar las pendientes. */
export default function MyLeaveLive() {
  const user = useUser();
  const company = useCompany();
  const { notify } = useToast();
  const { data, loading, error } = useAsync(() => listMyLeaves(user.uid), [user.uid], [LEAVES_CHANGED]);
  const schedule = user.workSchedule ?? company.defaultSchedule;

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LeaveType>("vacation");
  const today = dateInBuenosAires(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const preview = useMemo<{ days: number } | { error: string }>(() => {
    try {
      return { days: countLeaveDays(type, from, to, schedule, company.holidays) };
    } catch (e) {
      return { error: e instanceof InvalidLeaveError ? e.message : "Revisá las fechas." };
    }
  }, [type, from, to, schedule, company.holidays]);

  const clash = useMemo(
    () => (data ?? []).find((l) => l.status !== "rejected" && rangesOverlap(from, to, l.startDate, l.endDate)),
    [data, from, to],
  );

  const open_ = () => {
    setFormError(null);
    setOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if ("error" in preview) return setFormError(preview.error);
    if (clash) return setFormError(`Ya tenés una licencia ${LEAVE_STATUS_LABELS[clash.status].toLowerCase()} del ${dmy(clash.startDate)} al ${dmy(clash.endDate)}.`);
    if (preview.days === 0) return setFormError("Ese período no tiene ningún día hábil: elegí otras fechas.");
    setSaving(true);
    setFormError(null);
    try {
      await createLeaveRequest({ userId: user.uid, type, startDate: from, endDate: to, daysCount: preview.days, reason });
    } catch (err) {
      console.error("No se pudo enviar la solicitud", err);
      setFormError(withCode("No se pudo enviar la solicitud. Probá de nuevo.", err));
      setSaving(false);
      return;
    }
    setSaving(false);
    setOpen(false);
    setReason("");
    notify("Solicitud enviada. Tu supervisor la va a revisar.");
  };

  const retire = async (l: LeaveRequest) => {
    setActionError(null);
    try {
      await cancelLeave(l.id);
      notify("Retiraste la solicitud.");
    } catch (err) {
      setActionError(withCode("No se pudo retirar la solicitud.", err));
    }
  };

  const list = data ?? [];
  const approvedVacation = list.filter((l) => l.status === "approved" && l.type === "vacation").reduce((s, l) => s + l.daysCount, 0);

  return (
    <Page>
      <PageHeader
        eyebrow="Autogestión"
        title="Mis licencias"
        subtitle="Solicitá vacaciones y licencias, y seguí el estado de cada pedido."
        actions={
          <button type="button" onClick={open_} className="flex items-center gap-2 rounded-xl bg-primary-container px-4 py-2.5 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110">
            <span className="material-symbols-outlined text-[20px]">add</span>
            Solicitar licencia
          </button>
        }
      />

      {error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error}</p> : null}
      {actionError ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{actionError}</p> : null}

      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        {[
          ["Pendientes", list.filter((l) => l.status === "pending").length],
          ["Aprobadas", list.filter((l) => l.status === "approved").length],
          ["Vacaciones aprobadas", `${approvedVacation} días`],
          ["Rechazadas", list.filter((l) => l.status === "rejected").length],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl bg-surface-container-low p-5 shadow-md">
            <p className="font-label-md text-label-md font-semibold text-on-surface-variant">{label}</p>
            <p className="mt-2 font-headline-lg text-headline-lg font-bold tabular-nums text-on-surface">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">
                {["Tipo", "Desde", "Hasta", "Días", "Estado", ""].map((h) => (
                  <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {list.map((l) => (
                <tr key={l.id} className="align-top transition-colors hover:bg-surface-container">
                  <td className="px-space-md py-3 font-semibold">
                    {LEAVE_TYPE_LABELS[l.type]}
                    {l.reason ? <p className="mt-0.5 max-w-xs font-body-sm text-body-sm font-normal text-on-surface-variant italic">“{l.reason}”</p> : null}
                  </td>
                  <td className="px-space-md py-3 tabular-nums">{dmy(l.startDate)}</td>
                  <td className="px-space-md py-3 tabular-nums">{dmy(l.endDate)}</td>
                  <td className="px-space-md py-3 tabular-nums">{formatLeaveDays(l.daysCount, l.type)}</td>
                  <td className="px-space-md py-3">
                    <Chip tone={TONE[l.status]}>{LEAVE_STATUS_LABELS[l.status]}</Chip>
                    {l.reviewerNote ? <p className="mt-1.5 max-w-xs font-body-sm text-body-sm text-on-surface-variant italic">“{l.reviewerNote}”</p> : null}
                  </td>
                  <td className="px-space-md py-3 text-right">
                    {l.status === "pending" ? (
                      <button type="button" onClick={() => void retire(l)} className="rounded-lg px-3 py-1.5 font-label-md text-label-md font-semibold text-error hover:bg-error/10">Retirar</button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-space-md py-10 text-center text-on-surface-variant">
                    {loading && !data ? "Cargando tus licencias…" : "Todavía no pediste ninguna licencia."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">
          Las vacaciones se cuentan en días corridos y el resto de las licencias en días hábiles de tu jornada, sin feriados. La ausencia injustificada no se solicita: la registra tu supervisor.
        </p>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <form onSubmit={(e) => void submit(e)} role="dialog" aria-label="Solicitar licencia" className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
            <h2 className="font-headline-md text-headline-md text-on-surface">Solicitar licencia</h2>
            <label className="block font-label-lg text-label-lg text-on-surface">
              Tipo
              <select value={type} onChange={(e) => setType(e.target.value as LeaveType)} className={`mt-1.5 ${field}`}>
                {REQUESTABLE_LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>
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
                <span className="font-semibold tabular-nums">{formatLeaveDays(preview.days, type)}</span>
              ) : (
                <span className="text-error">{preview.error}</span>
              )}
            </p>
            <label className="block font-label-lg text-label-lg text-on-surface">
              Motivo <span className="font-label-xs-mono text-label-xs-mono text-on-surface-variant uppercase">Opcional</span>
              <textarea rows={3} maxLength={250} value={reason} onChange={(e) => setReason(e.target.value)} className={`mt-1.5 ${field}`} />
            </label>
            {formError ? <p role="alert" className="font-body-sm text-body-sm text-error">{formError}</p> : null}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-primary-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-50">{saving ? "Enviando…" : "Enviar solicitud"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </Page>
  );
}
