import { useMemo, useState } from "react";
import { useCompany } from "@/company/CompanyContext";
import type { TimeEntry } from "@/domain/model";
import { classifyEntry, type Category } from "@/domain/overtime";
import { approveEntry, observeEntry } from "@/services/timeEntries";
import { useUser } from "@/session/SessionContext";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useToast } from "@/ui/Toast";
import LeaveReviewSection from "./LeaveReviewSection";
import { usePending } from "./usePending";

const fmt = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const formatDate = (iso: string) => iso.split("-").reverse().join("/");
const selectClass = "min-w-0 rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";

/** Aprobaciones con datos reales: los registros enviados por el equipo, con las horas ya calculadas. */
export default function ApprovalsLive() {
  const reviewer = useUser();
  const company = useCompany();
  const { notify } = useToast();
  const { data, loading, error } = usePending(reviewer);
  const [employee, setEmployee] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [observing, setObserving] = useState<TimeEntry | null>(null);
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  const entries = useMemo(() => (data?.entries ?? []).filter((e) => employee === "all" || e.userId === employee), [data, employee]);
  const people = useMemo(() => {
    const ids = [...new Set((data?.entries ?? []).map((e) => e.userId))];
    return ids.map((id) => ({ id, name: data?.users.get(id)?.fullName ?? "Persona" })).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [data]);

  /** Cálculo con la jornada de esa persona. Si algo no cierra, la fila lo avisa y no se puede aprobar. */
  const calc = (e: TimeEntry) => {
    const person = data?.users.get(e.userId);
    try {
      return classifyEntry(
        { date: e.date, startTime: e.startTime, endTime: e.endTime, isOnCall: e.isOnCall },
        { schedule: person?.workSchedule ?? company.defaultSchedule, holidays: company.holidays, config: company.overtime },
      );
    } catch {
      return null;
    }
  };
  const tierLabel = (id: string) => (id === "normal" ? "Normal" : (company.overtime.tiers.find((t) => t.id === id)?.label ?? id));
  const tone = (id: Category) => (id === "normal" ? "normal" : id === "ot100" ? "ot100" : "ot50");

  const run = async (ids: string[], action: (e: TimeEntry) => Promise<void>, done: string) => {
    setFailure(null);
    setBusy((b) => new Set([...b, ...ids]));
    let ok = 0;
    for (const id of ids) {
      const entry = data?.entries.find((e) => e.id === id);
      if (!entry) continue;
      try {
        await action(entry);
        ok++;
      } catch {
        setFailure("No se pudo guardar alguno de los registros. Actualizá la pantalla y probá de nuevo.");
      }
    }
    setBusy(new Set());
    setSelected(new Set());
    if (ok > 0) notify(`${done} ${ok === 1 ? "1 registro" : `${ok} registros`}.`);
  };

  const approve = (ids: string[]) =>
    run(
      ids,
      async (e) => {
        const ctx = { schedule: data?.users.get(e.userId)?.workSchedule ?? company.defaultSchedule, holidays: company.holidays, config: company.overtime };
        await approveEntry(e, reviewer, ctx);
      },
      "Aprobaste",
    );

  const submitObservation = async () => {
    if (!observing) return;
    const entry = observing;
    try {
      await observeEntry(entry, reviewer, note);
    } catch (e) {
      setFailure(e instanceof Error && e.message.startsWith("Escribí") ? e.message : "No se pudo enviar la observación. Probá de nuevo.");
      return;
    }
    setObserving(null);
    setNote("");
    notify("Observación enviada. La persona la ve en su semana y corrige desde ahí.");
  };

  const allSelected = entries.length > 0 && entries.every((e) => selected.has(e.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(entries.filter((e) => calc(e)).map((e) => e.id)));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Page>
      <PageHeader
        eyebrow={reviewer.role === "admin" ? "Administrador" : "Supervisor"}
        title="Gestión de aprobaciones"
        subtitle="Revisá los registros de horas y las licencias de tu equipo. Al aprobar horas, se calculan y quedan congeladas."
        actions={
          <button
            type="button"
            disabled={selected.size === 0 || busy.size > 0}
            onClick={() => void approve([...selected])}
            className="flex items-center gap-2 rounded-xl bg-primary-container px-4 py-2.5 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[20px]">done_all</span>
            Aprobar seleccionados{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        }
      />

      <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-low p-space-md shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">
            Persona
            <select value={employee} onChange={(e) => setEmployee(e.target.value)} className={selectClass}>
              <option value="all">Todas</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <span className="ml-auto font-label-md text-label-md text-on-surface-variant">{entries.length === 1 ? "1 pendiente" : `${entries.length} pendientes`}</span>
        </div>

        {failure ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{failure}</p> : null}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">
                <th className="px-space-md py-3.5"><input type="checkbox" aria-label="Seleccionar todos" checked={allSelected} onChange={toggleAll} className="size-4 accent-[var(--hz-primary)]" /></th>
                {["Persona", "Fecha", "Proyecto", "Franja", "Horas", "Detalle", ""].map((h) => (
                  <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {entries.map((e) => {
                const c = calc(e);
                const working = busy.has(e.id);
                return (
                  <tr key={e.id} className="align-top transition-colors hover:bg-surface-container">
                    <td className="px-space-md py-3"><input type="checkbox" aria-label="Seleccionar registro" disabled={!c} checked={selected.has(e.id)} onChange={() => toggle(e.id)} className="size-4 accent-[var(--hz-primary)]" /></td>
                    <td className="px-space-md py-3 font-semibold">{data?.users.get(e.userId)?.fullName ?? "Persona"}{e.createdBy && e.createdBy !== e.userId ? <span className="mt-0.5 block font-body-sm text-body-sm font-normal text-on-surface-variant">Cargado por {data?.users.get(e.createdBy)?.fullName ?? "un superior"}</span> : null}</td>
                    <td className="px-space-md py-3 tabular-nums">{formatDate(e.date)}</td>
                    <td className="px-space-md py-3">
                      <span className="font-semibold">{e.projectId}</span>
                      {e.ticketRef ? <span className="ml-2 font-label-xs-mono text-label-xs-mono text-on-surface-variant">{e.ticketRef}</span> : null}
                    </td>
                    <td className="px-space-md py-3 tabular-nums">{e.startTime} a {e.endTime}</td>
                    <td className="px-space-md py-3 font-semibold tabular-nums">{c ? `${fmt(c.hours)} h` : "—"}</td>
                    <td className="px-space-md py-3">
                      {c ? (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(c.breakdown).map(([id, h]) => (
                            <Chip key={id} tone={tone(id)}>{tierLabel(id)} {fmt(h)} h</Chip>
                          ))}
                          {e.isOnCall ? <Chip tone="guard">Guardia</Chip> : null}
                        </div>
                      ) : (
                        <Chip tone="bad">No se pudo calcular</Chip>
                      )}
                      {e.notes ? <p className="mt-1.5 max-w-xs font-body-sm text-body-sm text-on-surface-variant italic">“{e.notes}”</p> : null}
                    </td>
                    <td className="px-space-md py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button type="button" disabled={!c || working} onClick={() => void approve([e.id])} className="rounded-lg bg-primary-container/20 px-3 py-1.5 font-label-md text-label-md font-semibold text-primary hover:bg-primary-container/30 disabled:opacity-40">Aprobar</button>
                        <button type="button" disabled={working} onClick={() => { setObserving(e); setNote(""); setFailure(null); }} className="rounded-lg bg-surface-container-high px-3 py-1.5 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-highest disabled:opacity-40">Observar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-space-md py-10 text-center text-on-surface-variant">
                    {loading && !data ? "Cargando registros…" : error ? error : "No hay registros pendientes de aprobación."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <LeaveReviewSection />

      {observing ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setObserving(null)} />
          <form
            role="dialog"
            aria-label="Observar registro"
            onSubmit={(ev) => { ev.preventDefault(); void submitObservation(); }}
            className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl"
          >
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface">Observar registro</h2>
              <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                {data?.users.get(observing.userId)?.fullName ?? "Persona"} · {formatDate(observing.date)} · {observing.startTime} a {observing.endTime}
              </p>
            </div>
            <label className="block font-label-lg text-label-lg text-on-surface">
              ¿Qué hay que corregir?
              <textarea required autoFocus rows={4} maxLength={250} value={note} onChange={(ev) => setNote(ev.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden" />
            </label>
            <p className="font-body-sm text-body-sm text-on-surface-variant">La persona ve la nota en sus registros, corrige y vuelve a enviar.</p>
            {failure ? <p role="alert" className="font-body-sm text-body-sm text-error">{failure}</p> : null}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setObserving(null)} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
              <button type="submit" className="rounded-lg bg-error-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-error-container hover:brightness-110">Enviar observación</button>
            </div>
          </form>
        </div>
      ) : null}
    </Page>
  );
}
