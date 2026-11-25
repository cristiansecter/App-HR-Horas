import { useEffect, useRef, useState } from "react";
import { AlertList } from "./AlertList";
import { useAlerts } from "./AlertsContext";

/** Evento para abrir la campanita desde otro lugar (por ejemplo "Ver todos" en el Inicio). */
export const OPEN_ALERTS_EVENT = "horus:open-alerts";

/** Campanita del encabezado: muestra cuántos avisos hay y los lista al tocarla. */
export function NotificationsBell() {
  const { alerts, loading } = useAlerts();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const urgent = alerts.filter((a) => a.severity === "urgent").length;

  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener(OPEN_ALERTS_EVENT, openIt);
    return () => window.removeEventListener(OPEN_ALERTS_EVENT, openIt);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Avisos"
        aria-label={alerts.length === 0 ? "Avisos: no hay avisos" : `Avisos: ${alerts.length}${urgent > 0 ? `, ${urgent} urgentes` : ""}`}
        aria-expanded={open}
        className="relative flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
      >
        <span className="material-symbols-outlined text-[20px]">{alerts.length > 0 ? "notifications_active" : "notifications"}</span>
        {alerts.length > 0 ? (
          <span className={`absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full px-1 font-label-xs-mono text-[10px] font-bold ${urgent > 0 ? "bg-error text-on-error" : "bg-primary-container text-on-primary"}`}>{alerts.length > 99 ? "99+" : alerts.length}</span>
        ) : null}
      </button>
      {open ? (
        <div role="dialog" aria-label="Avisos" className="fixed inset-x-2 top-16 z-[80] max-h-[75vh] overflow-y-auto rounded-xl bg-surface-container-low p-space-md shadow-2xl ring-1 ring-white/10 lg:absolute lg:inset-x-auto lg:top-full lg:right-0 lg:mt-2 lg:w-[26rem]">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Avisos</h2>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 font-label-md text-label-md text-on-surface-variant hover:text-on-surface">Cerrar</button>
          </div>
          {alerts.length === 0 ? <p className="py-6 text-center text-on-surface-variant">{loading ? "Cargando…" : "No hay avisos por ahora."}</p> : <AlertList alerts={alerts} />}
        </div>
      ) : null}
    </div>
  );
}
