import { useMemo } from "react";
import { useCompany } from "@/company/CompanyContext";
import type { Project } from "@/domain/model";
import { ASSIGNMENTS_CHANGED, listMyAssignedProjects } from "@/services/assignments";
import { useSession, useUser } from "@/session/SessionContext";
import { useAsync } from "@/ui/useAsync";

/**
 * Proyectos en los que esta persona puede cargar horas: los activos y, si la empresa pide asignación,
 * solo los que su supervisor o el administrador le asignaron (las reglas de Firestore lo exigen igual).
 */
export function useMyProjects(): { projects: Project[]; restricted: boolean; loading: boolean } {
  const user = useUser();
  const { isReal } = useSession();
  const company = useCompany();
  const restricted = isReal && company.projectAccess === "assigned";
  const assigned = useAsync(() => (restricted ? listMyAssignedProjects(user.uid) : Promise.resolve(new Set<string>())), [restricted, user.uid], [ASSIGNMENTS_CHANGED]);

  const projects = useMemo(() => {
    const active = company.projects.filter((p) => p.active);
    return restricted ? active.filter((p) => assigned.data?.has(p.code)) : active;
  }, [company.projects, restricted, assigned.data]);

  return { projects, restricted, loading: restricted && assigned.loading && assigned.data === null };
}
