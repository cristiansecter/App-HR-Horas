import { AlertList } from "./AlertList";
import { useAlerts } from "./AlertsContext";
import { OPEN_ALERTS_EVENT } from "./NotificationsBell";

/** Tarjeta de avisos para el Inicio: los más importantes y un enlace a todos. No aparece si no hay avisos. */
export function AlertsCard() {
  const { alerts } = useAlerts();
  if (alerts.length === 0) return null;
  const rest = alerts.length - 5;
  return (
    <section aria-label="Avisos del inicio" className="rounded-xl bg-surface-container-low p-space-lg shadow-md">
      <div className="mb-space-sm flex items-center justify-between gap-3">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Avisos</h2>
        {rest > 0 ? <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_ALERTS_EVENT))} className="font-label-lg text-label-lg font-semibold text-primary hover:underline">Ver todos ({alerts.length})</button> : null}
      </div>
      <AlertList alerts={alerts} limit={5} />
    </section>
  );
}
