import { listUsers } from "@/services/company";
import { LEAVES_CHANGED, listPendingLeavesForReview } from "@/services/leaves";
import type { LeaveRequest, UserSummary } from "@/domain/model";
import type { SessionUser } from "@/domain/types";
import { useAsync } from "@/ui/useAsync";

export interface PendingLeavesData {
  leaves: LeaveRequest[];
  users: Map<string, UserSummary>;
  /** Personas que esta persona puede supervisar (todas las activas si es administrador). */
  reviewable: UserSummary[];
}

/** Licencias pendientes que `reviewer` puede resolver, con los perfiles para mostrar nombres. */
export function usePendingLeaves(reviewer: SessionUser) {
  return useAsync<PendingLeavesData>(
    async () => {
      const all = await listUsers();
      const users = new Map(all.map((u) => [u.uid, u]));
      const reviewable = all.filter((u) => u.active && u.uid !== reviewer.uid && (reviewer.role === "admin" || u.supervisorId === reviewer.uid));
      const teamIds = all.filter((u) => u.supervisorId === reviewer.uid && u.active && u.uid !== reviewer.uid).map((u) => u.uid);
      const leaves = reviewer.role === "admin" || teamIds.length > 0 ? await listPendingLeavesForReview(reviewer, teamIds) : [];
      return { leaves, users, reviewable };
    },
    [reviewer.uid, reviewer.role],
    [LEAVES_CHANGED],
  );
}
