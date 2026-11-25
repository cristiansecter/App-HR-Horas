import { useMemo, useState, type FormEvent } from "react";
import { useCompany } from "@/company/CompanyContext";
import { dateInBuenosAires, isValidIsoDate } from "@/domain/dates";
import { ARGENTINA_HOLIDAYS } from "@/domain/holidays/argentina";
import type { HolidayRecord } from "@/domain/model";
import { withCode } from "@/services/errors";
import { addHolidays, deleteHoliday, saveHoliday } from "@/services/settings";
import { Chip } from "@/ui/Page";
import { useToast } from "@/ui/Toast";

const field = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";
const dmy = (iso: string) => iso.split("-").reverse().join("/");
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]!;
const TYPE_LABEL = { national: "Nacional", optional: "Día no laborable", custom: "Propio" } as const;

interface Draft {
  date: string;
  name: string;
  type: HolidayRecord["type"];
  countsAsHoliday: boolean;
  /** Fecha original, cuando se está editando uno existente. */
  previousDate?: string;
  confirmation?: HolidayRecord["confirmation"];
}

/** Calendario de feriados de la empresa: carga de los nacionales, feriados propios y qué días cuentan como feriado. */
export default function HolidaysSection() {
  const company = useCompany();
  const { notify } = useToast();
  const thisYear = Number(dateInBuenosAires(new Date()).slice(0, 4));
  const all = useMemo(() => [...company.holidays.values()].sort((a, b) => a.date.localeCompare(b.date)), [company.holidays]);
  const years = useMemo(() => [...new Set([thisYear, thisYear + 1, ...all.map((h) => Number(h.date.slice(0, 4)))])].sort(), [all, thisYear]);
  const [year, setYear] = useState(thisYear);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = all.filter((h) => h.date.startsWith(`${year}-`));
  const seedable = ARGENTINA_HOLIDAYS.filter((h) => h.date.startsWith(`${year}-`));
  const missingSeed = seedable.filter((h) => !company.holidays.has(h.date));

  /** Si `action` devuelve un texto, ese es el aviso de éxito; si no, se usa `success`. */
  const run = async (action: () => Promise<string | void>, success: string) => {
    setBusy(true);
    setError(null);
    try {
      const message = await action();
      company.reload();
      notify(message || success);
    } catch (err) {
      console.error("No se pudo actualizar el calendario", err);
      setError(withCode("No se pudo guardar el cambio. Probá de nuevo.", err));
    } finally {
      setBusy(false);
    }
  };

  const loadNational = () =>
    run(async () => {
      const added = await addHolidays(missingSeed);
      return added === 1 ? "Se agregó 1 feriado." : `Se agregaron ${added} feriados.`;
    }, `Feriados nacionales de ${year} cargados.`);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!isValidIsoDate(draft.date)) return setFormError("Elegí una fecha válida.");
    if (!draft.name.trim()) return setFormError("Falta el nombre del feriado.");
    if (draft.date !== draft.previousDate && company.holidays.has(draft.date)) return setFormError(`Ya hay un feriado el ${dmy(draft.date)}.`);
    setFormError(null);
    const current = draft;
    setDraft(null);
    await run(
      () => saveHoliday({ date: current.date, name: current.name, type: current.type, countsAsHoliday: current.countsAsHoliday, ...(current.confirmation ? { confirmation: current.confirmation } : {}) }, current.previousDate),
      "Guardaste el feriado.",
    );
    setYear(Number(current.date.slice(0, 4)));
  };

  const edit = (h: HolidayRecord) => {
    setFormError(null);
    setDraft({ date: h.date, name: h.name, type: h.type, countsAsHoliday: h.countsAsHoliday, previousDate: h.date, confirmation: h.confirmation });
  };

  return (
    <div className="flex flex-col gap-space-lg">
      <section className="rounded-xl bg-surface-container-low p-space-lg shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Feriados</h2>
            <p className="mt-1 max-w-2xl font-body-sm text-body-sm text-on-surface-variant">
              Un día que cuenta como feriado no tiene jornada: todo lo trabajado ese día es hora extra al tramo de feriado. Los días no laborables con fines turísticos son optativos para el empleador: arrancan sin contar como feriado, y vos decidís si los activás.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">
              Año
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <button type="button" disabled={busy} onClick={() => { setFormError(null); setDraft({ date: `${year}-01-01`, name: "", type: "custom", countsAsHoliday: true }); }} className="flex items-center gap-1.5 rounded-xl bg-primary-container px-4 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-50">
              <span className="material-symbols-outlined text-[18px]">add</span>Agregar feriado
            </button>
          </div>
        </div>

        {seedable.length > 0 && missingSeed.length > 0 ? (
          <div className="mt-space-md flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-400/30 bg-amber-500/10 p-4">
            <p className="font-body-sm text-body-sm text-amber-200">Faltan {missingSeed.length} feriados nacionales de {year}. Podés cargarlos de una vez; los que ya tengas no se pisan.</p>
            <button type="button" disabled={busy} onClick={() => void loadNational()} className="rounded-lg bg-amber-400/20 px-4 py-2 font-label-lg text-label-lg font-semibold text-amber-100 hover:bg-amber-400/30 disabled:opacity-50">Cargar feriados nacionales de {year}</button>
          </div>
        ) : null}
        {seedable.length === 0 && rows.length === 0 ? (
          <p className="mt-space-md rounded-lg bg-surface-container px-4 py-3 font-body-sm text-body-sm text-on-surface-variant">Todavía no tenemos la lista oficial de {year}. Podés agregar los feriados a mano.</p>
        ) : null}

        {error ? <p role="alert" className="mt-space-md rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error}</p> : null}

        <div className="mt-space-md overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">
                {["Fecha", "Feriado", "Tipo", "Cuenta como feriado", ""].map((h) => <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {rows.map((h) => (
                <tr key={h.date} className="align-middle transition-colors hover:bg-surface-container">
                  <td className="px-space-md py-3 tabular-nums">{dmy(h.date)} <span className="font-body-sm text-body-sm text-on-surface-variant">{weekday(h.date)}</span></td>
                  <td className="px-space-md py-3">
                    {h.name}
                    {h.confirmation === "to_confirm" ? <span className="ml-2"><Chip tone="warn">A confirmar</Chip></span> : null}
                  </td>
                  <td className="px-space-md py-3"><Chip tone={h.type === "national" ? "info" : h.type === "optional" ? "muted" : "guard"}>{TYPE_LABEL[h.type]}</Chip></td>
                  <td className="px-space-md py-3">
                    <input type="checkbox" role="switch" aria-label={`${h.name}: cuenta como feriado`} checked={h.countsAsHoliday} disabled={busy} onChange={(e) => void run(() => saveHoliday({ ...h, countsAsHoliday: e.target.checked }), "Actualizaste el feriado.")} className="size-5 accent-[var(--hz-primary)]" />
                  </td>
                  <td className="px-space-md py-3 text-right">
                    <div className="inline-flex gap-1">
                      {h.confirmation === "to_confirm" ? <button type="button" disabled={busy} onClick={() => void run(() => saveHoliday({ ...h, confirmation: "confirmed" }), "Marcaste la fecha como confirmada.")} className="rounded-lg px-3 py-1.5 font-label-md text-label-md font-semibold text-primary hover:bg-primary-container/15">Confirmar fecha</button> : null}
                      <button type="button" disabled={busy} onClick={() => edit(h)} className="rounded-lg px-3 py-1.5 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-high">Editar</button>
                      <button type="button" disabled={busy} aria-label={`Borrar ${h.name}`} onClick={() => { if (window.confirm(`¿Borrar el feriado “${h.name}” del ${dmy(h.date)}?`)) void run(() => deleteHoliday(h.date), "Borraste el feriado."); }} className="rounded-lg px-3 py-1.5 font-label-md text-label-md font-semibold text-error hover:bg-error/10">Borrar</button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={5} className="px-space-md py-8 text-center text-on-surface-variant">No hay feriados cargados en {year}.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">
          Las horas ya aprobadas no cambian. Un feriado nuevo afecta a lo que se cargue y apruebe de ahora en más, y al conteo de “Hs en feriado” de la planilla.
        </p>
      </section>

      {draft ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setDraft(null)} />
          <form role="dialog" aria-label={draft.previousDate ? "Editar feriado" : "Agregar feriado"} onSubmit={(e) => void submit(e)} className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
            <h2 className="font-headline-md text-headline-md text-on-surface">{draft.previousDate ? "Editar feriado" : "Agregar feriado"}</h2>
            <label className="block font-label-lg text-label-lg text-on-surface">Fecha<input type="date" required value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value, confirmation: draft.confirmation === "to_confirm" && e.target.value !== draft.previousDate ? "confirmed" : draft.confirmation })} className={`mt-1.5 ${field}`} /></label>
            <label className="block font-label-lg text-label-lg text-on-surface">Nombre<input required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`mt-1.5 ${field}`} /></label>
            <label className="block font-label-lg text-label-lg text-on-surface">
              Tipo
              <select value={draft.type} onChange={(e) => { const type = e.target.value as HolidayRecord["type"]; setDraft({ ...draft, type, countsAsHoliday: type !== "optional" }); }} className={`mt-1.5 ${field}`}>
                {(Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg bg-surface-container p-3 font-label-lg text-label-lg text-on-surface">
              Cuenta como feriado
              <input type="checkbox" role="switch" checked={draft.countsAsHoliday} onChange={(e) => setDraft({ ...draft, countsAsHoliday: e.target.checked })} className="size-5 accent-[var(--hz-primary)]" />
            </label>
            {formError ? <p role="alert" className="font-body-sm text-body-sm text-error">{formError}</p> : null}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDraft(null)} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
              <button type="submit" className="rounded-lg bg-primary-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110">Guardar</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
