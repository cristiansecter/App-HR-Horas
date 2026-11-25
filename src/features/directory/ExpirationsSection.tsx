import { useState, type FormEvent } from "react";
import { daysBetween } from "@/domain/vacations";
import { dateInBuenosAires } from "@/domain/dates";
import { EXPIRATION_KINDS, EXPIRATION_LABELS, expirationName, expirationProblems, type Expiration, type ExpirationKind } from "@/domain/expirations";
import { deleteExpiration, EXPIRATIONS_CHANGED, listExpirationsOf, saveExpiration } from "@/services/expirations";
import { withCode } from "@/services/errors";
import { useUser } from "@/session/SessionContext";
import { Chip } from "@/ui/Page";
import { useToast } from "@/ui/Toast";
import { useAsync } from "@/ui/useAsync";

const field = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";
const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** Vencimientos de una persona en su ficha: seguro, período de prueba, pasantía, plazo fijo u otro. Solo el administrador. */
export default function ExpirationsSection({ uid, fullName }: { uid: string; fullName: string }) {
  const actor = useUser();
  const { notify } = useToast();
  const today = dateInBuenosAires(new Date());
  const { data, loading, error } = useAsync(() => listExpirationsOf(uid), [uid], [EXPIRATIONS_CHANGED]);

  const [editing, setEditing] = useState<{ id?: string } | null>(null);
  const [kind, setKind] = useState<ExpirationKind>("insurance");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Expiration | null>(null);

  const start = (e?: Expiration) => {
    setEditing({ id: e?.id });
    setKind(e?.kind ?? "insurance");
    setTitle(e?.title ?? "");
    setDate(e?.date ?? today);
    setNote(e?.note ?? "");
    setFormError(null);
  };
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const problems = expirationProblems({ kind, title, date });
    if (problems.length > 0) return setFormError(problems[0]!);
    setSaving(true);
    setFormError(null);
    try {
      await saveExpiration(actor, { userId: uid, kind, title, date, note }, editing?.id);
      notify(editing?.id ? "Corregiste el vencimiento." : `Cargaste el vencimiento de ${fullName}.`);
      setEditing(null);
    } catch (err) {
      console.error("No se pudo guardar el vencimiento", err);
      setFormError(withCode("No se pudo guardar. Probá de nuevo.", err));
    } finally {
      setSaving(false);
    }
  };
  const confirmRemove = async () => {
    if (!removing) return;
    setSaving(true);
    try {
      await deleteExpiration(removing.id);
      notify("Borraste el vencimiento.");
      setRemoving(null);
    } catch (err) {
      console.error("No se pudo borrar el vencimiento", err);
      setFormError(withCode("No se pudo borrar. Probá de nuevo.", err));
    } finally {
      setSaving(false);
    }
  };

  const list = data ?? [];
  return (
    <section className="rounded-xl bg-surface-container-low p-space-lg shadow-md" aria-label="Vencimientos">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Vencimientos</h2>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Seguro, período de prueba, pasantía o lo que haya que no olvidar. El sistema avisa antes de la fecha al administrador y al supervisor de la persona.</p>
        </div>
        <button type="button" onClick={() => start()} className="flex items-center gap-1.5 rounded-xl bg-primary-container px-4 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110">
          <span className="material-symbols-outlined text-[18px]">add</span>Agregar vencimiento
        </button>
      </div>
      {error ? <p role="alert" className="mt-space-md rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error}</p> : null}
      {list.length === 0 ? (
        <p className="mt-space-md text-on-surface-variant">{loading && !data ? "Cargando…" : "Todavía no hay vencimientos cargados."}</p>
      ) : (
        <ul className="mt-space-md divide-y divide-white/5" aria-label="Lista de vencimientos">
          {list.map((e) => {
            const n = daysBetween(today, e.date);
            return (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-body-md text-body-md font-semibold text-on-surface">{expirationName(e)} <span className="font-normal text-on-surface-variant">· {EXPIRATION_LABELS[e.kind]}</span></p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant tabular-nums">{dmy(e.date)}{e.note ? ` · ${e.note}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Chip tone={n < 0 ? "bad" : n <= 7 ? "bad" : n <= 30 ? "warn" : "muted"}>{n < 0 ? `Venció hace ${-n} d` : n === 0 ? "Vence hoy" : `En ${n} d`}</Chip>
                  <button type="button" aria-label={`Editar ${expirationName(e)}`} onClick={() => start(e)} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-primary"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                  <button type="button" aria-label={`Borrar ${expirationName(e)}`} onClick={() => { setFormError(null); setRemoving(e); }} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-error"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setEditing(null)} />
          <form role="dialog" aria-label={editing.id ? "Editar vencimiento" : "Nuevo vencimiento"} onSubmit={(e) => void submit(e)} className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
            <h2 className="font-headline-md text-headline-md text-on-surface">{editing.id ? "Editar vencimiento" : "Nuevo vencimiento"}</h2>
            <label className="block font-label-lg text-label-lg text-on-surface">Tipo
              <select aria-label="Tipo de vencimiento" value={kind} onChange={(e) => setKind(e.target.value as ExpirationKind)} className={`mt-1.5 ${field}`}>
                {EXPIRATION_KINDS.map((k) => <option key={k} value={k}>{EXPIRATION_LABELS[k]}</option>)}
              </select>
            </label>
            <label className="block font-label-lg text-label-lg text-on-surface">{kind === "other" ? "De qué se trata" : "Detalle"} {kind === "other" ? null : <span className="font-label-xs-mono text-label-xs-mono text-on-surface-variant uppercase">Opcional</span>}
              <input aria-label="Detalle del vencimiento" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "insurance" ? "Seguro de vida" : kind === "other" ? "Carnet de conducir" : ""} className={`mt-1.5 ${field}`} />
            </label>
            <label className="block font-label-lg text-label-lg text-on-surface">Vence el
              <input type="date" required aria-label="Fecha de vencimiento" value={date} onChange={(e) => setDate(e.target.value)} className={`mt-1.5 ${field}`} />
            </label>
            <label className="block font-label-lg text-label-lg text-on-surface">Nota <span className="font-label-xs-mono text-label-xs-mono text-on-surface-variant uppercase">Opcional</span>
              <input aria-label="Nota del vencimiento" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className={`mt-1.5 ${field}`} />
            </label>
            {formError ? <p role="alert" className="font-body-sm text-body-sm text-error">{formError}</p> : null}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-primary-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-50">{saving ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {removing ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setRemoving(null)} />
          <div role="alertdialog" aria-label="Borrar vencimiento" className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
            <h2 className="font-headline-md text-headline-md text-on-surface">¿Borrar este vencimiento?</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Vas a borrar “{expirationName(removing)}” ({dmy(removing.date)}). Si ya lo resolviste, es lo correcto: deja de avisar.</p>
            {formError ? <p role="alert" className="font-body-sm text-body-sm text-error">{formError}</p> : null}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setRemoving(null)} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
              <button type="button" disabled={saving} onClick={() => void confirmRemove()} className="rounded-lg bg-error px-5 py-2 font-label-lg text-label-lg font-bold text-on-error hover:brightness-110 disabled:opacity-50">Borrar</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
