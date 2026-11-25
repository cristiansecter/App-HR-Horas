import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCompany } from "@/company/CompanyContext";
import { buildAlerts, type Alert, type AlertLeave, type AlertPerson } from "@/domain/alerts";
import { dateInBuenosAires } from "@/domain/dates";
import { listUsers } from "@/services/company";
import { DIRECTORY_CHANGED } from "@/services/directory";
import { EXPIRATIONS_CHANGED, listExpirationsForReview } from "@/services/expirations";
import { LEAVES_CHANGED, listApprovedLeavesForReview, listMyLeaves, listPendingLeavesForReview } from "@/services/leaves";
import { ASSIGNMENTS_CHANGED } from "@/services/assignments";
import { useSession, useUser } from "@/session/SessionContext";
import { useAsync } from "@/ui/useAsync";

interface AlertsValue {
  alerts: Alert[];
  loading: boolean;
}

const AlertsContext = createContext<AlertsValue>({ alerts: [], loading: false });

/**
 * Carga una sola vez los avisos de quien está mirando (la campanita y el Inicio los comparten):
 * un empleado ve los suyos; un supervisor, los de su equipo; el administrador, los de toda la empresa.
 * Con la demo no hay avisos.
 */
export function AlertsProvider({ children }: { children: ReactNode }) {
  const { isReal } = useSession();
  const user = useUser();
  const company = useCompany();
  const today = dateInBuenosAires(new Date());

  const { data, loading } = useAsync(
    async () => {
      if (!isReal) return null;
      const users = await listUsers();
      const toPerson = (u: (typeof users)[number]): AlertPerson => ({ uid: u.uid, fullName: u.fullName, active: u.active, hireDate: u.hireDate, supervisorId: u.supervisorId, role: u.role });
      if (user.role === "employee") {
        const mine = users.find((u) => u.uid === user.uid);
        const leaves = await listMyLeaves(user.uid);
        return { people: mine ? [toPerson(mine)] : [], leaves: leaves as AlertLeave[], expirations: [] };
      }
      // Administrador: toda la empresa (menos él). Supervisor: su equipo y él mismo (sus propias licencias).
      const team = users.filter((u) => u.active && u.uid !== user.uid && (user.role === "admin" || u.supervisorId === user.uid));
      const ids = team.map((u) => u.uid);
      if (ids.length === 0 && user.role === "supervisor") {
        const own = users.find((u) => u.uid === user.uid);
        return { people: own ? [toPerson(own)] : [], leaves: (await listMyLeaves(user.uid)) as AlertLeave[], expirations: [] };
      }
      const [approved, pending, expirations] = await Promise.all([listApprovedLeavesForReview(user, ids), listPendingLeavesForReview(user, ids), listExpirationsForReview(user, ids)]);
      return { people: team.map(toPerson), leaves: [...approved, ...pending] as AlertLeave[], expirations };
    },
    [isReal, user.uid, user.role, today],
    [LEAVES_CHANGED, EXPIRATIONS_CHANGED, DIRECTORY_CHANGED, ASSIGNMENTS_CHANGED],
  );

  const alerts = useMemo(
    () => (data ? buildAlerts({ today, viewer: { uid: user.uid, role: user.role }, people: data.people, leaves: data.leaves, expirations: data.expirations, overlapPct: company.vacationOverlapPct }) : []),
    [data, today, user.uid, user.role, company.vacationOverlapPct],
  );

  return <AlertsContext.Provider value={{ alerts, loading }}>{children}</AlertsContext.Provider>;
}

export const useAlerts = (): AlertsValue => useContext(AlertsContext);
