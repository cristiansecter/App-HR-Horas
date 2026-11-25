import { useMemo, useState, type FormEvent } from "react";
import { useCompany } from "@/company/CompanyContext";
import { costPerHour, currentEntry, formatArs } from "@/domain/compensation";
import { dateInBuenosAires } from "@/domain/dates";
import { monthRange } from "@/domain/export/payrollFromEntries";
import { buildPerformance, type ProjectResult } from "@/domain/performance";
import { withCode } from "@/services/errors";
import { listUsers } from "@/services/company";
import { listEmployeePay, PAY_CHANGED } from "@/services/compensation";
import { listProjectRates, loadCosting, PERFORMANCE_CHANGED, saveCosting, saveProjectRate } from "@/services/performance";
import { ENTRIES_CHANGED, listApprovedBetween } from "@/services/timeEntries";
import { useUser } from "@/session/SessionContext";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useToast } from "@/ui/Toast";
import { useAsync } from "@/ui/useAsync";

const fmtH = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
const monthLabel = (m: string) => {
  const text = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const field = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";
const tone = (n: number) => (n < 0 ? "text-error" : "text-on-surface");

function Kpi({ label, value, hint, color = "text-on-surface" }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-5 shadow-md">
      <p className="font-label-md text-label-md font-semibold text-on-surface-variant">{label}</p>
      <p className={`mt-2 font-headline-lg text-headline-lg font-bold tabular-nums ${color}`}>{value}</p>
      {hint ? <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}

/** Tarifa de cobro y marca de "facturable" de un proyecto, editables en la misma fila. */
function RateEditor({ project, onSave }: { project: ProjectResult; onSave: (rate: { hourlyRate: number; billable: boolean }) => Promise<void> }) {
  const [value, setValue] = useState(String(project.hourlyRate || ""));
  const [billable, setBillable] = useState(project.billable);
  const commit = (nextValue = value, nextBillable = billable) => {
    const n = Number(nextValue.replace(/\./g, "").replace(",", ".")) || 0;
    if (n === project.hourlyRate && nextBillable === project.billable) return;
    void onSave({ hourlyRate: Math.max(0, n), billable: nextBillable });
  };
  return (
    <div className="flex items-center gap-3">
      <input aria-label={`Tarifa por hora de ${project.code}`} inputMode="decimal" disabled={!billable} value={value} placeholder="0" onChange={(e) => setValue(e.target.value)} onBlur={() => commit()} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="w-28 rounded-lg border border-white/10 bg-surface-container-lowest px-2 py-1.5 text-right font-body-md text-body-md text-on-surface tabular-nums focus:border-primary-container focus:outline-hidden disabled:opacity-40" />
      <label className="flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant">
        <input type="checkbox" aria-label={`${project.code} facturable`} checked={billable} onChange={(e) => { setBillable(e.target.checked); commit(value, e.target.checked); }} className="size-4 accent-[var(--hz-primary)]" />
        Facturable
      </label>
    </div>
  );
}

/** Rendimiento: costos contra facturación por proyecto y por mes (módulo activable). */
export default function PerformanceView() {
  const company = useCompany();
  const actor = useUser();
  const { notify } = useToast();
  const model = company.features.payModel;
  const thisMonth = dateInBuenosAires(new Date()).slice(0, 7);
  const [from, setFrom] = useState(thisMonth);
  const [to, setTo] = useState(thisMonth);
  const [tab, setTab] = useState<"projects" | "people" | "months">("projects");
  const [costingOpen, setCostingOpen] = useState(false);
  const [pct, setPct] = useState("");
  const [hours, setHours] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const range = useMemo(() => ({ from: monthRange(start).from, to: monthRange(end).to }), [start, end]);

  const { data, loading, error } = useAsync(
    async () => {
      const [entries, users, pay, projectRates, costing] = await Promise.all([listApprovedBetween(range.from, range.to), listUsers(), listEmployeePay(), listProjectRates(), loadCosting()]);
      return { entries, users, pay, projectRates, costing };
    },
    [range.from, range.to],
    [ENTRIES_CHANGED, PAY_CHANGED, PERFORMANCE_CHANGED],
  );

  const result = useMemo(() => {
    if (!data) return null;
    return buildPerformance({
      entries: data.entries,
      payModel: model,
      ratesByUser: new Map([...data.pay].map(([uid, p]) => [uid, p.rates])),
      projectRates: data.projectRates,
      tiers: company.overtime.tiers,
      costing: data.costing,
      userNames: new Map(data.users.map((u) => [u.uid, u.fullName])),
      projectNames: new Map(company.projects.map((p) => [p.code, { name: p.name, client: p.client }])),
      seedProjects: company.projects.filter((p) => p.active).map((p) => p.code),
    });
  }, [data, model, company.overtime.tiers, company.projects]);

  const today = dateInBuenosAires(new Date());
  const saveRate = async (code: string, rate: { hourlyRate: number; billable: boolean }) => {
    setActionError(null);
    try {
      await saveProjectRate(code, rate, actor.email);
      notify(`Guardaste la tarifa de ${code}.`);
    } catch (e) {
      console.error("No se pudo guardar la tarifa", e);
      setActionError(withCode("No se pudo guardar la tarifa.", e));
    }
  };

  const openCosting = () => {
    setPct(String(data?.costing.employerContributionsPct ?? 0));
    setHours(String(data?.costing.monthlyHours ?? 160));
    setFormError(null);
    setCostingOpen(true);
  };
  const submitCosting = async (e: FormEvent) => {
    e.preventDefault();
    const p = Number(pct.replace(",", "."));
    const h = Number(hours.replace(",", "."));
    if (!Number.isFinite(p) || p < 0 || p > 200) return setFormError("Las cargas van de 0 a 200 %.");
    if (!Number.isFinite(h) || h < 1 || h > 400) return setFormError("Las horas del mes van de 1 a 400.");
    try {
      await saveCosting({ employerContributionsPct: p, monthlyHours: h }, actor.email);
      setCostingOpen(false);
      notify("Guardaste los parámetros de costos.");
    } catch (err) {
      console.error("No se pudieron guardar los parámetros", err);
      setFormError(withCode("No se pudo guardar. Probá de nuevo.", err));
    }
  };

  const t = result?.totals;
  // Sin ninguna tarifa de cobro cargada no hay facturación ni margen que mostrar: se explica en vez de mostrar ceros engañosos.
  const hasBilling = (result?.projects ?? []).some((p) => p.billable && p.hourlyRate > 0);
  const periodLabel = start === end ? monthLabel(start) : `${monthLabel(start)} a ${monthLabel(end)}`;

  return (
    <Page>
      <PageHeader
        eyebrow="Costos contra facturación"
        title="Rendimiento"
        subtitle={`${periodLabel}. Solo cuenta lo aprobado. El costo se calcula con el sueldo de cada persona (${model === "hourly" ? "valor hora" : "sueldo mensual ÷ horas del mes"}) y el recargo de las horas extra.`}
        actions={
          <>
            <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">Desde<input type="month" value={from} max={thisMonth} onChange={(e) => e.target.value && setFrom(e.target.value)} className="rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden" /></label>
            <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">Hasta<input type="month" value={to} max={thisMonth} onChange={(e) => e.target.value && setTo(e.target.value)} className="rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden" /></label>
            <button type="button" onClick={openCosting} className="flex items-center gap-2 rounded-xl bg-surface-container-high px-4 py-2.5 font-label-lg text-label-lg font-semibold text-on-surface hover:bg-surface-container-highest">
              <span className="material-symbols-outlined text-[20px]">tune</span>Parámetros de costos
            </button>
          </>
        }
      />

      {error || actionError ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{actionError ?? error}</p> : null}
      {result && result.warnings.length > 0 ? (
        <ul role="note" className="space-y-1 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 font-body-sm text-body-sm text-amber-200">
          {result.warnings.map((w) => <li key={w} className="flex gap-2"><span className="material-symbols-outlined text-[18px]">warning</span>{w}</li>)}
        </ul>
      ) : null}

      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        <Kpi label="Facturación" value={hasBilling ? formatArs(t?.revenue ?? 0) : "Sin cargar"} hint={hasBilling ? `${fmtH(t?.hours ?? 0)} h aprobadas` : `${fmtH(t?.hours ?? 0)} h aprobadas · cargá la tarifa de cobro de un proyecto`} />
        <Kpi label="Costo" value={formatArs(t?.cost ?? 0)} hint={data && data.costing.employerContributionsPct > 0 ? `Incluye ${data.costing.employerContributionsPct}% de cargas` : "Sin cargas adicionales"} />
        <Kpi label="Margen" value={hasBilling ? formatArs(t?.margin ?? 0) : "—"} color={hasBilling ? tone(t?.margin ?? 0) : "text-on-surface-variant"} hint={hasBilling ? undefined : "Hace falta la facturación para calcularlo"} />
        <Kpi label="Margen sobre facturación" value={!hasBilling || t?.marginPct === null || t === undefined ? "—" : `${t.marginPct.toLocaleString("es-AR")} %`} color={hasBilling ? tone(t?.margin ?? 0) : "text-on-surface-variant"} />
      </div>

      <div role="tablist" aria-label="Vistas" className="flex flex-wrap gap-2 rounded-xl bg-surface-container-low p-2">
        {([["projects", "Por proyecto"], ["people", "Por persona"], ["months", "Por mes"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-lg px-4 py-2 font-label-lg text-label-lg ${tab === id ? "bg-surface-container-high font-semibold text-primary" : "text-on-surface-variant hover:text-on-surface"}`}>{label}</button>
        ))}
      </div>

      <div className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
        <div className="overflow-x-auto">
          {tab === "projects" ? (
            <table className="w-full border-collapse text-left">
              <thead><tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">{["Proyecto", "Horas", "Tarifa de cobro", "Facturación", "Costo", "Margen", "%"].map((h) => <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {(result?.projects ?? []).map((p) => (
                  <tr key={p.code} className="align-middle hover:bg-surface-container">
                    <td className="px-space-md py-3"><p className="font-semibold">{p.code} {p.billable ? null : <Chip tone="muted">Interno</Chip>}</p><p className="font-body-sm text-body-sm text-on-surface-variant">{p.name}{p.client ? ` · ${p.client}` : ""}</p></td>
                    <td className="px-space-md py-3 tabular-nums">{fmtH(p.hours)}</td>
                    <td className="px-space-md py-3"><RateEditor key={`${p.code}-${p.hourlyRate}-${p.billable}`} project={p} onSave={(r) => saveRate(p.code, r)} /></td>
                    <td className="px-space-md py-3 tabular-nums">{formatArs(p.revenue)}</td>
                    <td className="px-space-md py-3 tabular-nums">{formatArs(p.cost)}</td>
                    <td className={`px-space-md py-3 font-semibold tabular-nums ${tone(p.margin)}`}>{formatArs(p.margin)}</td>
                    <td className={`px-space-md py-3 tabular-nums ${tone(p.margin)}`}>{p.marginPct === null ? "—" : `${p.marginPct.toLocaleString("es-AR")} %`}</td>
                  </tr>
                ))}
                {(result?.projects.length ?? 0) === 0 ? <tr><td colSpan={7} className="px-space-md py-10 text-center text-on-surface-variant">{loading && !data ? "Cargando…" : `No hay horas aprobadas en ${periodLabel}.`}</td></tr> : null}
              </tbody>
            </table>
          ) : tab === "people" ? (
            <table className="w-full border-collapse text-left">
              <thead><tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">{["Persona", "Horas", model === "hourly" ? "Valor hora vigente" : "Costo por hora vigente", "Costo del período"].map((h) => <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {(result?.people ?? []).map((p) => {
                  const rate = currentEntry(data?.pay.get(p.userId)?.rates ?? [], today);
                  return (
                    <tr key={p.userId} className="hover:bg-surface-container">
                      <td className="px-space-md py-3 font-semibold">{p.name} {p.missingPay ? <Chip tone="warn">Sin sueldo</Chip> : null}</td>
                      <td className="px-space-md py-3 tabular-nums">{fmtH(p.hours)}</td>
                      <td className="px-space-md py-3 tabular-nums">{rate ? formatArs(costPerHour(model, rate.amount, data?.costing.monthlyHours ?? 160), 2) : "—"}</td>
                      <td className="px-space-md py-3 tabular-nums">{formatArs(p.cost)}</td>
                    </tr>
                  );
                })}
                {(result?.people.length ?? 0) === 0 ? <tr><td colSpan={4} className="px-space-md py-10 text-center text-on-surface-variant">{loading && !data ? "Cargando…" : "Sin horas aprobadas en el período."}</td></tr> : null}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead><tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">{["Mes", "Horas", "Facturación", "Costo", "Margen"].map((h) => <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {(result?.months ?? []).map((m) => (
                  <tr key={m.month} className="hover:bg-surface-container"><td className="px-space-md py-3 font-semibold capitalize">{monthLabel(m.month)}</td><td className="px-space-md py-3 tabular-nums">{fmtH(m.hours)}</td><td className="px-space-md py-3 tabular-nums">{formatArs(m.revenue)}</td><td className="px-space-md py-3 tabular-nums">{formatArs(m.cost)}</td><td className={`px-space-md py-3 font-semibold tabular-nums ${tone(m.margin)}`}>{formatArs(m.margin)}</td></tr>
                ))}
                {(result?.months.length ?? 0) === 0 ? <tr><td colSpan={5} className="px-space-md py-10 text-center text-on-surface-variant">{loading && !data ? "Cargando…" : "Sin horas aprobadas en el período."}</td></tr> : null}
              </tbody>
            </table>
          )}
        </div>
        <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">
          El costo de cada registro usa el sueldo que regía en su fecha. Los proyectos marcados “Interno” tienen costo pero no ingreso. Las horas extra se valorizan con su recargo; la facturación se calcula con la tarifa por hora sin recargos.
        </p>
      </div>

      {costingOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setCostingOpen(false)} />
          <form role="dialog" aria-label="Parámetros de costos" onSubmit={(e) => void submitCosting(e)} className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
            <h2 className="font-headline-md text-headline-md text-on-surface">Parámetros de costos</h2>
            <label className="block font-label-lg text-label-lg text-on-surface">Cargas patronales y costo laboral adicional (%)<input required inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className={`mt-1.5 ${field}`} /><span className="mt-1 block font-body-sm text-body-sm font-normal text-on-surface-variant">Se suma al costo de cada hora. Si lo dejás en 0, el costo es solo lo que cobra la persona.</span></label>
            {model === "salary" ? <label className="block font-label-lg text-label-lg text-on-surface">Horas de un mes<input required inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} className={`mt-1.5 ${field}`} /><span className="mt-1 block font-body-sm text-body-sm font-normal text-on-surface-variant">Para pasar el sueldo mensual a costo por hora (por ejemplo 160 = 8 h × 20 días).</span></label> : null}
            {formError ? <p role="alert" className="font-body-sm text-body-sm text-error">{formError}</p> : null}
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setCostingOpen(false)} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button><button type="submit" className="rounded-lg bg-primary-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110">Guardar</button></div>
          </form>
        </div>
      ) : null}
    </Page>
  );
}
