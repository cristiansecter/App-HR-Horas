import { useState } from "react";
import { useCompany } from "@/company/CompanyContext";
import { formatArs } from "@/domain/compensation";
import { listMyPayslips, PAYROLL_CHANGED, type StoredPayslip } from "@/services/liquidation";
import { useUser } from "@/session/SessionContext";
import { Page, PageHeader } from "@/ui/Page";
import { useAsync } from "@/ui/useAsync";
import ReceiptDialog, { type ReceiptData } from "./ReceiptDialog";

const monthLabel = (period: string) => {
  const t = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-15T12:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * Mis liquidaciones: cada persona ve el detalle de las suyas que el administrador publicó.
 * Las reglas de Firestore solo dejan leer las propias y publicadas.
 */
export default function MyPayslipsView() {
  const user = useUser();
  const { companyName } = useCompany();
  const { data, loading, error } = useAsync(() => listMyPayslips(user.uid), [user.uid], [PAYROLL_CHANGED]);
  const [open, setOpen] = useState<ReceiptData | null>(null);

  const show = (s: StoredPayslip) =>
    setOpen({
      companyName,
      periodLabel: monthLabel(s.period),
      fullName: s.snapshot.fullName,
      cuil: s.snapshot.cuil,
      legajo: s.snapshot.legajo,
      hireDate: s.snapshot.hireDate,
      position: s.snapshot.position,
      department: s.snapshot.department,
      convenio: s.snapshot.convenio,
      result: s.result,
    });

  const list = data ?? [];
  return (
    <Page>
      <PageHeader eyebrow="Autogestión" title="Mis liquidaciones" subtitle="El detalle de tus liquidaciones, cuando tu empresa las publica. Es una constancia para que lleves y veas tus números: no reemplaza el recibo oficial." />

      {error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error}</p> : null}

      <div className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">
                {["Período", "Remunerativo", "No remunerativo", "Deducciones", "Neto", ""].map((h) => <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {list.map((s) => (
                <tr key={s.period} className="align-middle hover:bg-surface-container">
                  <td className="px-space-md py-3 font-semibold">{monthLabel(s.period)}</td>
                  <td className="px-space-md py-3 tabular-nums">{formatArs(s.result.totalRemunerativo, 2)}</td>
                  <td className="px-space-md py-3 tabular-nums">{formatArs(s.result.totalNoRemunerativo, 2)}</td>
                  <td className="px-space-md py-3 tabular-nums text-error">{formatArs(s.result.totalDeducciones, 2)}</td>
                  <td className="px-space-md py-3 font-bold tabular-nums">{formatArs(s.result.neto, 2)}</td>
                  <td className="px-space-md py-3 text-right"><button type="button" onClick={() => show(s)} className="rounded-lg px-3 py-1.5 font-label-md text-label-md font-semibold text-primary hover:bg-primary-container/15">Ver detalle</button></td>
                </tr>
              ))}
              {list.length === 0 ? <tr><td colSpan={6} className="px-space-md py-10 text-center text-on-surface-variant">{loading && !data ? "Cargando…" : "Todavía no hay liquidaciones publicadas."}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      {open ? <ReceiptDialog data={open} onClose={() => setOpen(null)} /> : null}
    </Page>
  );
}
