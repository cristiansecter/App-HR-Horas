import { useMemo, useState } from "react";
import { useCompany } from "@/company/CompanyContext";
import { dateInBuenosAires } from "@/domain/dates";
import { buildPayrollData, monthRange } from "@/domain/export/payrollFromEntries";
import { loadPayrollRaw } from "@/services/payroll";
import { ENTRIES_CHANGED } from "@/services/timeEntries";
import { Page, PageHeader } from "@/ui/Page";
import { useAsync } from "@/ui/useAsync";

const fmt = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const dmy = (iso: string) => iso.split("-").reverse().join("/");
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function Card({ label, value, tone = "text-on-surface" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-5 shadow-md">
      <p className="font-label-md text-label-md font-semibold text-on-surface-variant">{label}</p>
      <p className={`mt-2 font-headline-lg text-headline-lg font-bold tabular-nums ${tone}`}>
        {value} <span className="font-headline-sm text-headline-sm font-normal text-on-surface-variant">h</span>
      </p>
    </div>
  );
}

/** Reportes con datos reales: la pre-liquidación del mes con las horas aprobadas, lista para el contador. */
export default function ReportsLive() {
  const company = useCompany();
  const [month, setMonth] = useState(dateInBuenosAires(new Date()).slice(0, 7));
  const [exporting, setExporting] = useState<"xlsx" | "csv" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const range = useMemo(() => monthRange(month), [month]);
  const { data: raw, loading, error } = useAsync(() => loadPayrollRaw(range.from, range.to), [range.from, range.to], [ENTRIES_CHANGED]);

  const payroll = useMemo(
    () =>
      raw
        ? buildPayrollData({
            approved: raw.approved,
            open: raw.open,
            users: raw.users,
            cuilByUid: raw.cuilByUid,
            holidays: company.holidays,
            tiers: company.overtime.tiers,
            projectNames: new Map(company.projects.map((p) => [p.code, p.name])),
            leaves: raw.leaves,
            range,
            scheduleFor: (uid) => raw.users.find((u) => u.uid === uid)?.workSchedule ?? company.defaultSchedule,
          })
        : null,
    [raw, range, company.holidays, company.overtime.tiers, company.projects, company.defaultSchedule],
  );

  const monthTitle = `${MONTHS[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`;
  const hasData = (payroll?.summary.length ?? 0) > 0;

  const exportAs = async (kind: "xlsx" | "csv") => {
    if (!payroll) return;
    setExportError(null);
    setExporting(kind);
    try {
      const { downloadWorkbook } = await import("@/features/export/downloadPayroll");
      await downloadWorkbook(
        {
          companyName: company.companyName,
          periodLabel: `${dmy(range.from)} al ${dmy(range.to)}`,
          generatedOn: dmy(dateInBuenosAires(new Date())),
          tiers: company.overtime.tiers,
          summary: payroll.summary,
          detail: payroll.detail,
          absences: payroll.absences,
        },
        kind,
        `horus-planilla-${month}`,
      );
    } catch (e) {
      console.error("No se pudo generar la planilla", e);
      setExportError("No se pudo generar la planilla. Probá de nuevo.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Pre-liquidación"
        title="Reportes"
        subtitle="Planilla del mes con las horas aprobadas, lista para el contador. Lo que no está aprobado no entra."
        actions={
          <>
            <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">
              Mes
              <input type="month" value={month} max={dateInBuenosAires(new Date()).slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden" />
            </label>
            <button type="button" disabled={!hasData || exporting !== null} onClick={() => void exportAs("xlsx")} className="flex items-center gap-2 rounded-xl bg-primary-container px-4 py-2.5 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-40">
              <span className="material-symbols-outlined text-[20px]">download</span>
              {exporting === "xlsx" ? "Generando…" : "Descargar Excel"}
            </button>
            <button type="button" disabled={!hasData || exporting !== null} onClick={() => void exportAs("csv")} className="rounded-xl bg-surface-container-high px-4 py-2.5 font-label-lg text-label-lg font-semibold text-on-surface hover:bg-surface-container-highest disabled:opacity-40">
              {exporting === "csv" ? "Generando…" : "CSV"}
            </button>
          </>
        }
      />

      {error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error}</p> : null}
      {exportError ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{exportError}</p> : null}

      {payroll && payroll.warnings.length > 0 ? (
        <ul role="note" className="space-y-1 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 font-body-sm text-body-sm text-amber-200">
          {payroll.warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <span className="material-symbols-outlined text-[18px]">warning</span>
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-2 gap-gutter lg:grid-cols-4">
        <Card label={`Total aprobado · ${monthTitle}`} value={fmt(payroll?.totals.hours ?? 0)} />
        <Card label="Horas normales" value={fmt(payroll?.totals.normal ?? 0)} tone="text-primary" />
        {company.overtime.tiers.slice(0, 2).map((t) => (
          <Card key={t.id} label={t.label} value={fmt(payroll?.totals.tiers[t.id] ?? 0)} tone={t.percent >= 100 ? "text-error" : "text-primary-fixed"} />
        ))}
      </div>

      <div className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">
                {["Persona", "Días", "Normales", ...company.overtime.tiers.map((t) => t.label), "Guardia", "Feriado", "Licencias", "Observaciones"].map((h) => (
                  <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {(payroll?.summary ?? []).map((r) => (
                <tr key={r.fullName} className="align-top transition-colors hover:bg-surface-container">
                  <td className="px-space-md py-3 font-semibold">{r.fullName}</td>
                  <td className="px-space-md py-3 tabular-nums">{r.daysWorked}</td>
                  <td className="px-space-md py-3 tabular-nums">{fmt(r.normalHours)}</td>
                  {company.overtime.tiers.map((t) => (
                    <td key={t.id} className="px-space-md py-3 tabular-nums">{fmt(r.tierHours[t.id] ?? 0)}</td>
                  ))}
                  <td className="px-space-md py-3 tabular-nums">{fmt(r.onCallHours)}</td>
                  <td className="px-space-md py-3 tabular-nums">{fmt(r.holidayHours)}</td>
                  <td className="px-space-md py-3 tabular-nums">{Object.values(r.leaveDays).reduce((a, b) => a + b, 0)}</td>
                  <td className="px-space-md py-3 font-body-sm text-body-sm text-on-surface-variant">{r.notes}</td>
                </tr>
              ))}
              {!payroll || payroll.summary.length === 0 ? (
                <tr>
                  <td colSpan={7 + company.overtime.tiers.length} className="px-space-md py-10 text-center text-on-surface-variant">
                    {loading && !raw ? "Cargando el período…" : `No hay horas ni licencias aprobadas en ${monthTitle}.`}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">
          Las licencias aprobadas se cuentan por tipo: vacaciones en días corridos y el resto en días hábiles de la jornada. “Días” y “Feriado” se calculan con la fecha de inicio de cada registro.
        </p>
      </div>
    </Page>
  );
}
