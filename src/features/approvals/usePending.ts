import { listUsers } from "@/services/company";
import { ENTRIES_CHANGED, listPendingForReview } from "@/services/timeEntries";
import type { TimeEntry, UserSummary } from "@/domain/model";
import type { SessionUser } from "@/domain/types";
import { useAsync } from "@/ui/useAsync";

export interface PendingData {
  entries: TimeEntry[];
  users: Map<string, UserSummary>;
}

/** Registros enviados que `reviewer` puede aprobar, con los perfiles para mostrar nombres. */
export function usePending(reviewer: SessionUser) {
  return useAsync<PendingData>(
    async () => {
      const all = await listUsers();
      const users = new Map(all.map((u) => [u.uid, u]));
      const teamIds = all.filter((u) => u.supervisorId === reviewer.uid && u.active && u.uid !== reviewer.uid).map((u) => u.uid);
      // Un supervisor sin equipo no tiene nada que aprobar (y un "in" vacío no es una consulta válida).
      const entries = reviewer.role === "admin" || teamIds.length > 0 ? await listPendingForReview(reviewer, teamIds) : [];
      return { entries, users };
    },
    [reviewer.uid, reviewer.role],
    [ENTRIES_CHANGED],
  );
}
