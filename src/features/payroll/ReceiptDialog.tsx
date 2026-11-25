import { useEffect } from "react";
import { createPortal } from "react-dom";
import { formatArs } from "@/domain/compensation";
import type { PayslipLine, PayslipResult } from "@/domain/payroll/engine";

export interface ReceiptData {
  companyName: string;
  periodLabel: string;
  fullName: string;
  cuil: string;
  legajo: string;
  hireDate: string;
  position: string;
  department: string;
  convenio: boolean;
  result: PayslipResult;
}

const dmy = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");

function Block({ title, lines, total, sign }: { title: string; lines: readonly PayslipLine[]; total: number; sign?: "-" }) {
  return (
    <section className="mt-5">
      <h3 className="border-b border-slate-400 pb-1 text-xs font-bold tracking-wider text-slate-600 uppercase">{title}</h3>
      <table className="mt-1 w-full text-sm">
        <tbody>
          {lines.length === 0 ? <tr><td className="py-1 text-slate-500 italic">Sin conceptos</td><td /></tr> : null}
          {lines.map((l, i) => (
            <tr key={i} className={l.muted ? "text-slate-400 italic" : ""}>
              <td className="py-0.5 pr-4">{l.label}</td>
              <td className="py-0.5 text-right font-mono tabular-nums">{l.muted ? "—" : formatArs(l.amount, 2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-300 font-semibold">
            <td className="pt-1">Total {title.toLowerCase()}</td>
            <td className="pt-1 text-right font-mono tabular-nums">{sign}{formatArs(total, 2)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

/**
 * Recibo de sueldo para ver e imprimir. Siempre en colores claros (aunque la app esté en modo oscuro), porque se imprime
 * o se guarda como PDF con el botón de imprimir del navegador. Los descuentos van con signo menos; el neto, en tinta.
 */
export default function ReceiptDialog({ data, onClose }: { data: ReceiptData; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const r = data.result;

  // Se dibuja directamente en <body>, fuera del resto de la app: al imprimir se oculta todo lo demás y queda solo el recibo.
  return createPortal(
    <div className="receipt-portal fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto p-4 print:static print:block print:overflow-visible print:p-0">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm print:hidden" onClick={onClose} />
      <div role="dialog" aria-label={`Recibo de ${data.fullName}`} className="relative my-6 w-full max-w-2xl print:my-0 print:max-w-none">
        <div className="mb-3 flex justify-end gap-3 print:hidden">
          <button type="button" onClick={onClose} className="rounded-lg bg-surface-container-high px-4 py-2 font-label-lg text-label-lg text-on-surface hover:bg-surface-container-highest">Cerrar</button>
          <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110">
            <span className="material-symbols-outlined text-[18px]">print</span>Imprimir / guardar como PDF
          </button>
        </div>

        <article id="receipt-print" className="rounded-xl bg-white p-8 text-slate-900 shadow-2xl print:rounded-none print:p-0 print:shadow-none">
          <header className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
            <div>
              <h2 className="text-lg font-extrabold">{data.companyName}</h2>
              <p className="text-xs text-slate-600">Recibo de sueldo · {data.periodLabel}</p>
            </div>
            <p className="rounded border border-slate-400 px-2 py-1 text-[10px] font-bold tracking-wider text-slate-600 uppercase">Liquidación asistida</p>
          </header>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div><dt className="inline text-slate-500">Apellido y nombre: </dt><dd className="inline font-semibold">{data.fullName}</dd></div>
            <div><dt className="inline text-slate-500">Legajo: </dt><dd className="inline font-semibold">{data.legajo || "—"}</dd></div>
            <div><dt className="inline text-slate-500">CUIL: </dt><dd className="inline font-mono">{data.cuil || "—"}</dd></div>
            <div><dt className="inline text-slate-500">Ingreso: </dt><dd className="inline">{dmy(data.hireDate)} ({r.aniosServicio} año{r.aniosServicio === 1 ? "" : "s"})</dd></div>
            <div><dt className="inline text-slate-500">Puesto: </dt><dd className="inline">{data.position || "—"}</dd></div>
            <div><dt className="inline text-slate-500">Condición: </dt><dd className="inline">{data.convenio ? "Dentro de convenio" : "Fuera de convenio"}</dd></div>
          </dl>

          <Block title="Haberes remunerativos" lines={r.remunerativos} total={r.totalRemunerativo} />
          <Block title="Haberes no remunerativos" lines={r.noRemunerativos} total={r.totalNoRemunerativo} />
          <Block title="Deducciones" lines={r.deducciones} total={r.totalDeducciones} sign="-" />

          <div className="mt-6 flex items-center justify-between rounded-lg border-2 border-slate-800 px-4 py-3">
            <span className="text-sm font-bold tracking-wider uppercase">Neto a cobrar</span>
            <span className="font-mono text-2xl font-extrabold tabular-nums">{formatArs(r.neto, 2)}</span>
          </div>

          <footer className="mt-8 grid grid-cols-2 gap-10 text-center text-xs text-slate-500">
            <p className="border-t border-slate-400 pt-1">Firma del empleador</p>
            <p className="border-t border-slate-400 pt-1">Firma del empleado</p>
          </footer>
          <p className="mt-4 text-[10px] leading-snug text-slate-500">Liquidación asistida: el Impuesto a las Ganancias es una versión simplificada y cada convenio puede requerir reglas propias. Revisá este recibo con tu contador antes de emitirlo.</p>
        </article>
      </div>
    </div>,
    document.body,
  );
}
