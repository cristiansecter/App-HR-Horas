import { Link } from "react-router-dom";
import type { Alert, AlertKind } from "@/domain/alerts";
import { SEVERITY_LABELS } from "@/domain/alerts";
import { Chip } from "@/ui/Page";
import { useUser } from "@/session/SessionContext";

const ICONS: Record<AlertKind, string> = {
  vacation_soon: "beach_access",
  leave_ending: "event_repeat",
  new_hire: "person_add",
  expiration: "event_busy",
  vacation_overlap: "group_off",
  vacation_balance: "event_available",
};
const TONE = { urgent: "bad", warn: "warn", info: "info" } as const;

/** Lista de avisos. Para el administrador, los de una persona llevan a su ficha. */
export function AlertList({ alerts, limit }: { alerts: readonly Alert[]; limit?: number }) {
  const user = useUser();
  const shown = limit ? alerts.slice(0, limit) : alerts;
  return (
    <ul className="divide-y divide-white/5" aria-label="Avisos">
      {shown.map((a) => {
        const link = user.role === "admin" && a.userId && (a.kind === "expiration" || a.kind === "new_hire" || a.kind === "vacation_balance") ? `/directorio/ficha?uid=${a.userId}` : null;
        const body = (
          <>
            <span className="material-symbols-outlined mt-0.5 text-[20px] text-on-surface-variant">{ICONS[a.kind]}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 font-body-md text-body-md font-semibold text-on-surface">{a.title}<Chip tone={TONE[a.severity]}>{SEVERITY_LABELS[a.severity]}</Chip></span>
              <span className="block font-body-sm text-body-sm text-on-surface-variant">{a.detail}</span>
            </span>
          </>
        );
        return (
          <li key={a.id}>
            {link ? <Link to={link} className="flex items-start gap-3 py-2.5 hover:bg-surface-container">{body}</Link> : <div className="flex items-start gap-3 py-2.5">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}
