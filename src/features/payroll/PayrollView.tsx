import { useMemo, useState } from "react";
import { useCompany } from "@/company/CompanyContext";
import { formatArs, rateAt } from "@/domain/compensation";
import { dateInBuenosAires } from "@/domain/dates";
import { monthRange } from "@/domain/export/payrollFromEntries";
import { buildPayrollCsv } from "@/domain/payroll/csv";
import { calculatePayslip, type PayslipResult } from "@/domain/payroll/engine";
import { buildAutoNovelties, EMPTY_MANUAL, mergeNovelties, type AutoNovelties, type ManualNovelties } from "@/domain/payroll/novelties";
import { withCode } from "@/services/errors";
import { listUsers } from "@/services/company";
import { listEmployeePay, PAY_CHANGED } from "@/services/compensation";
import { isPeriodClosed, listPayslips, listPayslipsBetween, loadPayrollSettings, PAYROLL_CHANGED, savePayslips, setPeriodClosed, type StoredPayslip } from "@/services/liquidation";
import { loadPayrollRaw } from "@/services/payroll";
import { ENTRIES_CHANGED } from "@/services/timeEntries";
import { useUser } from "@/session/SessionContext";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useToast } from "@/ui/Toast";
import { useAsync } from "@/ui/useAsync";
import NoveltiesDialog from "./NoveltiesDialog";
import ParamsTab from "./ParamsTab";
import ReceiptDialog, { type ReceiptData } from "./ReceiptDialog";

const monthLabel = (m: string) => {
  const t = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
};

interface Row {
  uid: string;
  fullName: string;
  legajo: string;
  cuil: string;
  position: string;
  department: string;
  hireDate: string;
  convenio: boolean;
  rate: number;
  auto: AutoNovelties;
  manual: ManualNovelties;
  result: PayslipResult;
}

/** Semestre del período: enero a junio (1.er semestre) o julio a diciembre. */
const semester = (period: string) => {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return m <= 6 ? { from: `${y}-01`, to: `${y}-06` } : { from: `${y}-07`, to: `${y}-12` };
};

/** Liquidación de sueldos (módulo activable): cálculo del mes con las novedades de Horus, recibos y cierre de período. */
export default function PayrollView() {
  const company = useCompany();
  const actor = useUser();
  const { notify } = useToast();
  const model = company.features.payModel;
  const [month, setMonth] = useState(dateInBuenosAires(new Date()).slice(0, 7));
  const [tab, setTab] = useState<"run" | "params">("run");
  const [edits, setEdits] = useState<Record<string, ManualNovelties>>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const range = useMemo(() => monthRange(month), [month]);
  const sem = useMemo(() => semester(month), [month]);

  const { data, loading, error: loadError } = useAsync(
    async () => {
      const [raw, pay, settings, slips, closed, semSlips] = await Promise.all([loadPayrollRaw(range.from, range.to), listEmployeePay(), loadPayrollSettings(), listPayslips(month), isPeriodClosed(month), listPayslipsBetween(sem.from, sem.to)]);
      const users = await listUsers();
      return { raw, pay, settings, slips, closed, semSlips, users };
    },
    [month],
    [ENTRIES_CHANGED, PAY_CHANGED, PAYROLL_CHANGED],
  );

  /** Mejor remuneración (sin SAC) de otros meses del semestre ya guardados. */
  const bestOtherMonths = useMemo(() => {
    let best = 0;
    for (const s of data?.semSlips ?? []) {
      if (s.period === month) continue;
      const sac = s.result.remunerativos.filter((l) => l.concept === "sac").reduce((a, l) => a + l.amount, 0);
      best = Math.max(best, s.result.totalRemunerativo - sac);
    }
    return best;
  }, [data, month]);

  const { rows, skipped } = useMemo(() => {
    const out: Row[] = [];
    const skippedNoPay: string[] = [];
    if (!data) return { rows: out, skipped: skippedNoPay };
    const tiers = company.overtime.tiers;
    for (const u of data.users) {
      if (!u.active || (u.hireDate && u.hireDate > range.to)) continue;
      const pay = data.pay.get(u.uid);
      const rate = pay ? rateAt(pay.rates, range.to) : null;
      if (rate === null || rate === undefined) {
        skippedNoPay.push(u.fullName);
        continue;
      }
      const schedule = u.workSchedule ?? company.defaultSchedule;
      const auto = buildAutoNovelties({ entries: data.raw.approved.filter((e) => e.userId === u.uid), leaves: data.raw.leaves.filter((l) => l.userId === u.uid), range, schedule, holidays: company.holidays, tierIds: tiers.map((t) => t.id) });
      const manual = edits[u.uid] ?? data.slips.get(u.uid)?.manual ?? EMPTY_MANUAL;
      const employee = { convenio: pay?.convenio ?? true, obraSocial: pay?.obraSocial ?? "", hijos: pay?.hijos ?? 0, hireDate: u.hireDate };
      const run = (sacBase?: number) => calculatePayslip({ employee, rate, payModel: model, novelties: { ...mergeNovelties(auto, manual), ...(sacBase ? { sacBase } : {}) }, params: data.settings.params, visibility: data.settings.visibility, tiers, periodStart: range.from });
      let result = run(manual.sac ? manual.sacBase : undefined);
      if (manual.sac && !manual.sacBase) {
        // Mejor remuneración del semestre: la mayor entre los otros meses guardados y la de este mes sin SAC.
        const without = calculatePayslip({ employee, rate, payModel: model, novelties: { ...mergeNovelties(auto, manual), sac: false }, params: data.settings.params, visibility: data.settings.visibility, tiers, periodStart: range.from });
        result = run(Math.max(bestOtherMonths, without.totalRemunerativo));
      }
      out.push({ uid: u.uid, fullName: u.fullName, legajo: u.employeeNumber ?? "", cuil: data.raw.cuilByUid.get(u.uid) ?? "", position: u.position ?? "", department: u.department ?? "", hireDate: u.hireDate ?? "", convenio: employee.convenio, rate, auto, manual, result });
    }
    out.sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
    return { rows: out, skipped: skippedNoPay };
  }, [data, edits, model, company, range, bestOtherMonths]);

  const savedFor = (uid: string): StoredPayslip | undefined => data?.slips.get(uid);
  const stateOf = (row: Row): "saved" | "changed" | "new" => {
    const s = savedFor(row.uid);
    if (!s) return "new";
    return s.result.neto === row.result.neto && s.result.totalRemunerativo === row.result.totalRemunerativo && s.rate === row.rate ? "saved" : "changed";
  };

  const totals = useMemo(() => ({
    rem: rows.reduce((s, r) => s + r.result.totalRemunerativo, 0),
    noRem: rows.reduce((s, r) => s + r.result.totalNoRemunerativo, 0),
    ded: rows.reduce((s, r) => s + r.result.totalDeducciones, 0),
    neto: rows.reduce((s, r) => s + r.result.neto, 0),
    employer: rows.reduce((s, r) => s + r.result.contribucionesPatronales, 0),
  }), [rows]);

  const warnings: string[] = [];
  if (skipped.length) warnings.push(`Sin sueldo cargado, no se liquidan: ${skipped.join(", ")}.`);
  const openCount = data?.raw.open.length ?? 0;
  if (openCount) warnings.push(`${openCount} registro${openCount === 1 ? "" : "s"} de horas sin aprobar ${openCount === 1 ? "no está incluido" : "no están incluidos"} en las novedades.`);
  const noHire = rows.filter((r) => !r.hireDate).length;
  if (noHire) warnings.push(`${noHire} persona${noHire === 1 ? "" : "s"} sin fecha de ingreso: no se calcula la antigüedad.`);
  const noCuil = rows.filter((r) => !r.cuil).length;
  if (noCuil) warnings.push(`${noCuil} persona${noCuil === 1 ? "" : "s"} sin CUIL en el recibo.`);

  const closed = data?.closed ?? false;
  const dirty = rows.some((r) => stateOf(r) !== "saved");

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await savePayslips(rows.map((r) => ({ userId: r.uid, period: month, manual: r.manual, result: r.result, rate: r.rate, payModel: model })), actor.email);
      setEdits({});
      notify(`Guardaste la liquidación de ${monthLabel(month)} (${rows.length === 1 ? "1 recibo" : `${rows.length} recibos`}).`);
    } catch (e) {
      console.error("No se pudo guardar la liquidación", e);
      setError(withCode("No se pudo guardar la liquidación. Si el período está cerrado, reabrilo primero.", e));
    } finally {
      setSaving(false);
    }
  };

  const toggleClosed = async () => {
    if (!closed && dirty && !window.confirm("Hay recibos sin guardar o con cambios. Si cerrás ahora, no se van a poder guardar. ¿Cerrar igual?")) return;
    if (!window.confirm(closed ? `¿Reabrir ${monthLabel(month)}? Vas a poder volver a cambiar los recibos.` : `¿Cerrar ${monthLabel(month)}? No se van a poder crear ni cambiar recibos de ese mes hasta reabrirlo.`)) return;
    try {
      await setPeriodClosed(month, !closed, actor.email);
      notify(closed ? "Período reabierto." : "Período cerrado.");
    } catch (e) {
      console.error("No se pudo cambiar el estado del período", e);
      setError(withCode("No se pudo cambiar el estado del período.", e));
    }
  };

  const exportCsv = () => {
    const csv = buildPayrollCsv(rows.map((r) => ({ legajo: r.legajo, fullName: r.fullName, cuil: r.cuil, remunerativo: r.result.totalRemunerativo, noRemunerativo: r.result.totalNoRemunerativo, deducciones: r.result.totalDeducciones, neto: r.result.neto, contribucionesPatronales: r.result.contribucionesPatronales })));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `horus-liquidacion-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openReceipt = (r: Row) => setReceipt({ companyName: company.companyName, periodLabel: monthLabel(month), fullName: r.fullName, cuil: r.cuil, legajo: r.legajo, hireDate: r.hireDate, position: r.position, department: r.department, convenio: r.convenio, result: r.result });

  const thisMonth = dateInBuenosAires(new Date()).slice(0, 7);
  return (
    <Page>
      <PageHeader
        eyebrow="Liquidación asistida"
        title="Liquidación de sueldos"
        subtitle={`${monthLabel(month)}. Las novedades salen de las horas y licencias aprobadas. Modelo de pago: ${model === "hourly" ? "por hora" : "por jornada (sueldo mensual)"}. Revisá el resultado con tu contador.`}
        actions={
          tab === "run" ? (
            <>
              <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">Mes<input type="month" value={month} max={thisMonth} onChange={(e) => e.target.value && (setMonth(e.target.value), setEdits({}))} className="rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden" /></label>
              <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="rounded-xl bg-surface-container-high px-4 py-2.5 font-label-lg text-label-lg font-semibold text-on-surface hover:bg-surface-container-highest disabled:opacity-40">Exportar CSV</button>
              <button type="button" onClick={() => void toggleClosed()} className="rounded-xl bg-surface-container-high px-4 py-2.5 font-label-lg text-label-lg font-semibold text-on-surface hover:bg-surface-container-highest">{closed ? "Reabrir período" : "Cerrar período"}</button>
              <button type="button" onClick={() => void save()} disabled={closed || saving || rows.length === 0 || !dirty} className="flex items-center gap-2 rounded-xl bg-primary-container px-4 py-2.5 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-40">
                <span className="material-symbols-outlined text-[20px]">save</span>{saving ? "Guardando…" : "Guardar liquidación"}
              </button>
            </>
          ) : undefined
        }
      />

      <div role="tablist" aria-label="Secciones de liquidación" className="flex flex-wrap gap-2 rounded-xl bg-surface-container-low p-2">
        {([["run", "Liquidar", "payments"], ["params", "Parámetros y conceptos", "tune"]] as const).map(([id, label, icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex items-center gap-2 rounded-lg px-4 py-2 font-label-lg text-label-lg ${tab === id ? "bg-surface-container-high font-semibold text-primary" : "text-on-surface-variant hover:text-on-surface"}`}><span className="material-symbols-outlined text-[18px]">{icon}</span>{label}</button>
        ))}
      </div>

      {loadError || error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error ?? loadError}</p> : null}

      {tab === "params" ? (
        data ? <ParamsTab key={JSON.stringify(data.settings)} params={data.settings.params} visibility={data.settings.visibility} onSaved={() => undefined} /> : <p className="text-on-surface-variant">Cargando…</p>
      ) : (
        <>
          {closed ? <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 font-body-sm text-body-sm text-emerald-200"><span className="material-symbols-outlined text-[18px]">lock</span>Período cerrado: los recibos no se pueden crear ni cambiar. Reabrilo para hacer correcciones.</p> : null}
          {warnings.length > 0 ? <ul role="note" className="space-y-1 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 font-body-sm text-body-sm text-amber-200">{warnings.map((w) => <li key={w} className="flex gap-2"><span className="material-symbols-outlined text-[18px]">warning</span>{w}</li>)}</ul> : null}

          <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
            {[["Remunerativo", totals.rem], ["No remunerativo", totals.noRem], ["Deducciones", totals.ded], ["Neto a pagar", totals.neto]].map(([label, value]) => (
              <div key={label as string} className="rounded-xl bg-surface-container-low p-5 shadow-md">
                <p className="font-label-md text-label-md font-semibold text-on-surface-variant">{label as string}</p>
                <p className="mt-2 font-headline-lg text-headline-lg font-bold tabular-nums text-on-surface">{formatArs(value as number, 2)}</p>
                {label === "Neto a pagar" && totals.employer > 0 ? <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Contribuciones patronales: {formatArs(totals.employer, 2)}</p> : null}
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead><tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">{["Persona", model === "hourly" ? "Horas normales" : "Básico", "Horas extra", "Remunerativo", "No rem.", "Deducciones", "Neto", "Estado", ""].map((h) => <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>)}</tr></thead>
                <tbody className="font-body-md text-body-md text-on-surface">
                  {rows.map((r) => {
                    const st = stateOf(r);
                    const extra = Object.values(r.auto.hoursByTier).reduce((a, b) => a + b, 0);
                    return (
                      <tr key={r.uid} className="align-middle hover:bg-surface-container">
                        <td className="px-space-md py-3 font-semibold">{r.fullName}<p className="font-body-sm text-body-sm font-normal text-on-surface-variant">{r.convenio ? "Dentro de convenio" : "Fuera de convenio"}</p></td>
                        <td className="px-space-md py-3 tabular-nums">{model === "hourly" ? `${r.auto.normalHours} h` : formatArs(r.result.basico)}</td>
                        <td className="px-space-md py-3 tabular-nums">{extra > 0 ? `${extra} h` : "—"}</td>
                        <td className="px-space-md py-3 tabular-nums">{formatArs(r.result.totalRemunerativo, 2)}</td>
                        <td className="px-space-md py-3 tabular-nums">{formatArs(r.result.totalNoRemunerativo, 2)}</td>
                        <td className="px-space-md py-3 tabular-nums text-error">{formatArs(r.result.totalDeducciones, 2)}</td>
                        <td className="px-space-md py-3 font-bold tabular-nums">{formatArs(r.result.neto, 2)}</td>
                        <td className="px-space-md py-3"><Chip tone={st === "saved" ? "ok" : st === "changed" ? "warn" : "muted"}>{st === "saved" ? "Guardado" : st === "changed" ? "Con cambios" : "Sin guardar"}</Chip></td>
                        <td className="px-space-md py-3 text-right"><div className="inline-flex gap-1">
                          <button type="button" disabled={closed} onClick={() => setEditing(r)} className="rounded-lg px-3 py-1.5 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-40">Novedades</button>
                          <button type="button" onClick={() => openReceipt(r)} className="rounded-lg px-3 py-1.5 font-label-md text-label-md font-semibold text-primary hover:bg-primary-container/15">Recibo</button>
                        </div></td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 ? <tr><td colSpan={9} className="px-space-md py-10 text-center text-on-surface-variant">{loading && !data ? "Cargando el período…" : "No hay personas para liquidar: cargá el sueldo de cada una en su ficha."}</td></tr> : null}
                </tbody>
              </table>
            </div>
            <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">
              Se usa el sueldo vigente al final del mes. Guardar la liquidación deja un recibo por persona; con el período cerrado ya no se puede cambiar.
            </p>
          </div>
        </>
      )}

      {editing ? <NoveltiesDialog name={editing.fullName} auto={editing.auto} manual={editing.manual} onClose={() => setEditing(null)} onSave={(m) => { setEdits({ ...edits, [editing.uid]: m }); setEditing(null); }} /> : null}
      {receipt ? <ReceiptDialog data={receipt} onClose={() => setReceipt(null)} /> : null}
    </Page>
  );
}

