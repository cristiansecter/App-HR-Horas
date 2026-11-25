import { useMemo, useState, type FormEvent } from "react";
import { useCompany } from "@/company/CompanyContext";
import { costPerHour, currentEntry, formatArs } from "@/domain/compensation";
import { dateInBuenosAires } from "@/domain/dates";
import { monthRange } from "@/domain/export/payrollFromEntries";
import { buildPerformance, type Billing, type ProjectRate, type ProjectResult } from "@/domain/performance";
import { withCode } from "@/services/errors";
import type { UserSummary } from "@/domain/model";
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

const BILLING_LABELS: Record<Billing, string> = { hourly: "Por hora", fixed: "Precio cerrado", none: "Interno (no se factura)" };
const BILLING_HINTS: Record<Billing, string> = {
  hourly: "Se factura cada hora trabajada a una tarifa. Podés fijar una tarifa general y tarifas distintas para algunas personas.",
  fixed: "El cliente paga un valor total por el proyecto. El ingreso de cada mes es proporcional a las horas trabajadas y nunca pasa del valor total.",
  none: "Proyecto interno: tiene costo pero no genera ingreso.",
};
/** Texto corto con cómo se cobra un proyecto, para la tabla. */
const billingSummary = (p: ProjectResult): string => {
  if (p.billing === "none") return "Interno";
  if (p.billing === "fixed") return p.rate.totalValue > 0 && p.rate.estimatedHours > 0 ? `${formatArs(p.rate.totalValue)} por ${fmtH(p.rate.estimatedHours)} h` : "Sin cargar";
  const extra = Object.keys(p.rate.personRates).length;
  return p.rate.hourlyRate > 0 ? `${formatArs(p.rate.hourlyRate)}/h${extra ? ` + ${extra} por persona` : ""}` : extra ? `${extra} tarifa${extra > 1 ? "s" : ""} por persona` : "Sin cargar";
};
/** "12.500,50" o "12500.5" → número; vacío o inválido → 0. */
const parseNum = (text: string): number => {
  const clean = text.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Diálogo para definir cómo se factura un proyecto: por hora (con excepciones por persona), precio cerrado o interno. */
function BillingDialog({ project, users, onClose, onSave }: { project: ProjectResult; users: readonly UserSummary[]; onClose: () => void; onSave: (rate: ProjectRate) => Promise<string | null> }) {
  const [billing, setBilling] = useState<Billing>(project.billing);
  const [hourly, setHourly] = useState(project.rate.hourlyRate ? String(project.rate.hourlyRate) : "");
  const [total, setTotal] = useState(project.rate.totalValue ? String(project.rate.totalValue) : "");
  const [estimated, setEstimated] = useState(project.rate.estimatedHours ? String(project.rate.estimatedHours) : "");
  // Tarifas por persona como texto, para poder editarlas sin que se reformatee lo que se escribe.
  const [people, setPeople] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(project.rate.personRates).map(([uid, v]) => [uid, String(v)])));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameOf = (uid: string) => users.find((u) => u.uid === uid)?.fullName ?? "Persona dada de baja";
  const addable = users.filter((u) => u.active && !(u.uid in people));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const rate: ProjectRate = {
      billing,
      hourlyRate: parseNum(hourly),
      totalValue: parseNum(total),
      estimatedHours: parseNum(estimated),
      personRates: Object.fromEntries(Object.entries(people).map(([uid, v]) => [uid, parseNum(v)]).filter(([, v]) => (v as number) > 0)),
    };
    if (billing === "fixed" && (rate.totalValue <= 0 || rate.estimatedHours <= 0)) return setError("Para un precio cerrado hacen falta el valor total y las horas estimadas.");
    if (billing === "hourly" && rate.hourlyRate <= 0 && Object.keys(rate.personRates).length === 0) return setError("Cargá una tarifa general o al menos una por persona (o marcá el proyecto como interno).");
    setSaving(true);
    setError(await onSave(rate));
    setSaving(false);
  };
  const input = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 text-right font-body-md text-body-md text-on-surface tabular-nums focus:border-primary-container focus:outline-hidden";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <form role="dialog" aria-label={`Facturación de ${project.code}`} onSubmit={(e) => void submit(e)} className="relative flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-surface">Cómo se factura {project.code}</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">{project.name}{project.client ? ` · ${project.client}` : ""}</p>
        </div>
        <fieldset className="space-y-2">
          <legend className="sr-only">Tipo de facturación</legend>
          {(Object.keys(BILLING_LABELS) as Billing[]).map((id) => (
            <label key={id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 font-label-lg text-label-lg ${billing === id ? "border-primary-container bg-primary-container/10 text-on-surface" : "border-white/10 text-on-surface-variant"}`}>
              <input type="radio" name="billing" checked={billing === id} onChange={() => { setBilling(id); setError(null); }} className="accent-[var(--hz-primary)]" />{BILLING_LABELS[id]}
            </label>
          ))}
          <p className="font-body-sm text-body-sm text-on-surface-variant">{BILLING_HINTS[billing]}</p>
        </fieldset>

        {billing === "hourly" ? (
          <>
            <label className="block font-label-lg text-label-lg text-on-surface">Tarifa general por hora ($)<input aria-label="Tarifa general por hora" inputMode="decimal" value={hourly} placeholder="0" onChange={(e) => setHourly(e.target.value)} className={`mt-1.5 ${input}`} /></label>
            <div>
              <p className="font-label-lg text-label-lg text-on-surface">Tarifas por persona</p>
              <p className="mb-2 font-body-sm text-body-sm text-on-surface-variant">Reemplazan a la general solo para esa persona (por ejemplo, un consultor senior a otro valor).</p>
              <ul className="space-y-2">
                {Object.keys(people).map((uid) => (
                  <li key={uid} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-body-md text-body-md text-on-surface">{nameOf(uid)}</span>
                    <input aria-label={`Tarifa por hora de ${nameOf(uid)}`} inputMode="decimal" value={people[uid]} placeholder="0" onChange={(e) => setPeople({ ...people, [uid]: e.target.value })} className={`w-32 ${input} py-1.5`} />
                    <button type="button" aria-label={`Quitar la tarifa de ${nameOf(uid)}`} onClick={() => setPeople(Object.fromEntries(Object.entries(people).filter(([k]) => k !== uid)))} className="rounded-lg p-1.5 text-on-surface-variant hover:text-error"><span className="material-symbols-outlined text-[20px]">close</span></button>
                  </li>
                ))}
              </ul>
              {addable.length > 0 ? (
                <select aria-label="Agregar tarifa para una persona" value="" onChange={(e) => e.target.value && setPeople({ ...people, [e.target.value]: "" })} className="mt-2 w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden">
                  <option value="">+ Agregar una persona…</option>
                  {addable.map((u) => <option key={u.uid} value={u.uid}>{u.fullName}</option>)}
                </select>
              ) : null}
            </div>
          </>
        ) : null}

        {billing === "fixed" ? (
          <>
            <label className="block font-label-lg text-label-lg text-on-surface">Valor total del proyecto ($)<input aria-label="Valor total del proyecto" inputMode="decimal" value={total} placeholder="0" onChange={(e) => setTotal(e.target.value)} className={`mt-1.5 ${input}`} /></label>
            <label className="block font-label-lg text-label-lg text-on-surface">Horas estimadas del proyecto<input aria-label="Horas estimadas del proyecto" inputMode="decimal" value={estimated} placeholder="0" onChange={(e) => setEstimated(e.target.value)} className={`mt-1.5 ${input}`} /><span className="mt-1 block font-body-sm text-body-sm font-normal text-on-surface-variant">Cada hora aprobada reconoce {parseNum(total) > 0 && parseNum(estimated) > 0 ? formatArs(parseNum(total) / parseNum(estimated)) : "valor total ÷ horas estimadas"} de ingreso. Pasadas las horas estimadas ya no se reconoce más ingreso.</span></label>
          </>
        ) : null}

        {error ? <p role="alert" className="font-body-sm text-body-sm text-error">{error}</p> : null}
        <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button><button type="submit" disabled={saving} className="rounded-lg bg-primary-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-60">Guardar</button></div>
      </form>
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
  const [billingFor, setBillingFor] = useState<string | null>(null);
  // Con el módulo de facturación apagado solo hay costos (y las reglas ni dejan leer las tarifas).
  const billingOn = company.features.modules.projectBilling;

  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const range = useMemo(() => ({ from: monthRange(start).from, to: monthRange(end).to }), [start, end]);

  const { data, loading, error } = useAsync(
    async () => {
      const [users, pay, projectRates, costing] = await Promise.all([listUsers(), listEmployeePay(), billingOn ? listProjectRates() : Promise.resolve(new Map<string, ProjectRate>()), loadCosting()]);
      // Un precio cerrado necesita saber cuántas horas se trabajaron antes del período: en ese caso se trae todo el historial.
      const needsHistory = [...projectRates.values()].some((r) => r.billing === "fixed");
      const entries = await listApprovedBetween(needsHistory ? "2000-01-01" : range.from, range.to);
      return { entries, users, pay, projectRates, costing };
    },
    [range.from, range.to, billingOn],
    [ENTRIES_CHANGED, PAY_CHANGED, PERFORMANCE_CHANGED],
  );

  const result = useMemo(() => {
    if (!data) return null;
    return buildPerformance({
      entries: data.entries,
      range,
      billingEnabled: billingOn,
      payModel: model,
      ratesByUser: new Map([...data.pay].map(([uid, p]) => [uid, p.rates])),
      projectRates: data.projectRates,
      tiers: company.overtime.tiers,
      costing: data.costing,
      userNames: new Map(data.users.map((u) => [u.uid, u.fullName])),
      projectNames: new Map(company.projects.map((p) => [p.code, { name: p.name, client: p.client }])),
      seedProjects: company.projects.filter((p) => p.active).map((p) => p.code),
    });
  }, [data, model, range, billingOn, company.overtime.tiers, company.projects]);

  const today = dateInBuenosAires(new Date());
  /** Guarda cómo se factura un proyecto. Devuelve el mensaje de error, o null si salió bien. */
  const saveRate = async (code: string, rate: ProjectRate): Promise<string | null> => {
    try {
      await saveProjectRate(code, rate, actor.email);
      setBillingFor(null);
      notify(`Guardaste la facturación de ${code}.`);
      return null;
    } catch (e) {
      console.error("No se pudo guardar la facturación", e);
      return withCode("No se pudo guardar la facturación.", e);
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
  const hasBilling = billingOn && (result?.projects ?? []).some((p) => p.billable && !p.missingRate);
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

      {error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error}</p> : null}
      {result && result.warnings.length > 0 ? (
        <ul role="note" className="space-y-1 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 font-body-sm text-body-sm text-amber-200">
          {result.warnings.map((w) => <li key={w} className="flex gap-2"><span className="material-symbols-outlined text-[18px]">warning</span>{w}</li>)}
        </ul>
      ) : null}

      {billingOn ? (
        <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
          <Kpi label="Facturación" value={hasBilling ? formatArs(t?.revenue ?? 0) : "Sin cargar"} hint={hasBilling ? `${fmtH(t?.hours ?? 0)} h aprobadas` : `${fmtH(t?.hours ?? 0)} h aprobadas · definí cómo se factura un proyecto`} />
          <Kpi label="Costo" value={formatArs(t?.cost ?? 0)} hint={data && data.costing.employerContributionsPct > 0 ? `Incluye ${data.costing.employerContributionsPct}% de cargas` : "Sin cargas adicionales"} />
          <Kpi label="Margen" value={hasBilling ? formatArs(t?.margin ?? 0) : "—"} color={hasBilling ? tone(t?.margin ?? 0) : "text-on-surface-variant"} hint={hasBilling ? undefined : "Hace falta la facturación para calcularlo"} />
          <Kpi label="Margen sobre facturación" value={!hasBilling || t?.marginPct === null || t === undefined ? "—" : `${t.marginPct.toLocaleString("es-AR")} %`} color={hasBilling ? tone(t?.margin ?? 0) : "text-on-surface-variant"} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-gutter">
          <Kpi label="Horas aprobadas" value={fmtH(t?.hours ?? 0)} />
          <Kpi label="Costo" value={formatArs(t?.cost ?? 0)} hint={data && data.costing.employerContributionsPct > 0 ? `Incluye ${data.costing.employerContributionsPct}% de cargas` : "Sin cargas adicionales"} />
        </div>
      )}

      <div role="tablist" aria-label="Vistas" className="flex flex-wrap gap-2 rounded-xl bg-surface-container-low p-2">
        {([["projects", "Por proyecto"], ["people", "Por persona"], ["months", "Por mes"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-lg px-4 py-2 font-label-lg text-label-lg ${tab === id ? "bg-surface-container-high font-semibold text-primary" : "text-on-surface-variant hover:text-on-surface"}`}>{label}</button>
        ))}
      </div>

      <div className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
        <div className="overflow-x-auto">
          {tab === "projects" ? (
            <table className="w-full border-collapse text-left">
              <thead><tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">{(billingOn ? ["Proyecto", "Horas", "Cómo se factura", "Facturación", "Costo", "Margen", "%"] : ["Proyecto", "Horas", "Costo"]).map((h) => <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {(result?.projects ?? []).map((p) => (
                  <tr key={p.code} className="align-middle hover:bg-surface-container">
                    <td className="px-space-md py-3"><p className="font-semibold">{p.code} {billingOn && !p.billable ? <Chip tone="muted">Interno</Chip> : null}</p><p className="font-body-sm text-body-sm text-on-surface-variant">{p.name}{p.client ? ` · ${p.client}` : ""}</p></td>
                    <td className="px-space-md py-3 tabular-nums">{fmtH(p.hours)}</td>
                    {billingOn ? (
                      <>
                        <td className="px-space-md py-3">
                          <button type="button" aria-label={`Facturación de ${p.code}`} onClick={() => setBillingFor(p.code)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left font-body-sm text-body-sm text-on-surface hover:bg-surface-container-high">
                            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">edit</span>
                            <span><span className="block font-semibold">{BILLING_LABELS[p.billing].split(" (")[0]}</span><span className={p.missingRate ? "text-amber-300" : "text-on-surface-variant"}>{billingSummary(p)}</span></span>
                          </button>
                          {p.fixed ? <p className="px-2 font-body-sm text-body-sm text-on-surface-variant">{fmtH(p.fixed.cumulativeHours)} de {fmtH(p.fixed.estimatedHours)} h · reconocido {formatArs(p.fixed.recognizedToDate)}{p.fixed.overrunHours > 0 ? <span className="text-error"> · +{fmtH(p.fixed.overrunHours)} h de más</span> : null}</p> : null}
                        </td>
                        <td className="px-space-md py-3 tabular-nums">{formatArs(p.revenue)}</td>
                      </>
                    ) : null}
                    <td className="px-space-md py-3 tabular-nums">{formatArs(p.cost)}</td>
                    {billingOn ? (
                      <>
                        <td className={`px-space-md py-3 font-semibold tabular-nums ${tone(p.margin)}`}>{formatArs(p.margin)}</td>
                        <td className={`px-space-md py-3 tabular-nums ${tone(p.margin)}`}>{p.marginPct === null ? "—" : `${p.marginPct.toLocaleString("es-AR")} %`}</td>
                      </>
                    ) : null}
                  </tr>
                ))}
                {(result?.projects.length ?? 0) === 0 ? <tr><td colSpan={billingOn ? 7 : 3} className="px-space-md py-10 text-center text-on-surface-variant">{loading && !data ? "Cargando…" : `No hay horas aprobadas en ${periodLabel}.`}</td></tr> : null}
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
              <thead><tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">{(billingOn ? ["Mes", "Horas", "Facturación", "Costo", "Margen"] : ["Mes", "Horas", "Costo"]).map((h) => <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {(result?.months ?? []).map((m) => (
                  <tr key={m.month} className="hover:bg-surface-container"><td className="px-space-md py-3 font-semibold capitalize">{monthLabel(m.month)}</td><td className="px-space-md py-3 tabular-nums">{fmtH(m.hours)}</td>{billingOn ? <td className="px-space-md py-3 tabular-nums">{formatArs(m.revenue)}</td> : null}<td className="px-space-md py-3 tabular-nums">{formatArs(m.cost)}</td>{billingOn ? <td className={`px-space-md py-3 font-semibold tabular-nums ${tone(m.margin)}`}>{formatArs(m.margin)}</td> : null}</tr>
                ))}
                {(result?.months.length ?? 0) === 0 ? <tr><td colSpan={billingOn ? 5 : 3} className="px-space-md py-10 text-center text-on-surface-variant">{loading && !data ? "Cargando…" : "Sin horas aprobadas en el período."}</td></tr> : null}
              </tbody>
            </table>
          )}
        </div>
        <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">
          El costo de cada registro usa el sueldo que regía en su fecha, y las horas extra se valorizan con su recargo.{billingOn ? " Los proyectos “Interno” tienen costo pero no ingreso. La facturación por hora usa la tarifa sin recargos. En un precio cerrado, el ingreso de cada mes es proporcional a las horas trabajadas y no pasa del valor total." : ""}
        </p>
      </div>

      {billingFor && result?.projects.find((p) => p.code === billingFor) ? (
        <BillingDialog project={result.projects.find((p) => p.code === billingFor)!} users={data?.users ?? []} onClose={() => setBillingFor(null)} onSave={(rate) => saveRate(billingFor, rate)} />
      ) : null}

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
