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
  return useProjectsFor(useUser().uid);
}

/** Lo mismo para otra persona (un supervisor o el administrador que le carga horas): sus proyectos, no los de quien carga. */
export function useProjectsFor(uid: string): { projects: Project[]; restricted: boolean; loading: boolean } {
  const { isReal } = useSession();
  const company = useCompany();
  const restricted = isReal && company.projectAccess === "assigned";
  const assigned = useAsync(() => (restricted ? listMyAssignedProjects(uid) : Promise.resolve(new Set<string>())), [restricted, uid], [ASSIGNMENTS_CHANGED]);

  const projects = useMemo(() => {
    const active = company.projects.filter((p) => p.active);
    return restricted ? active.filter((p) => assigned.data?.has(p.code)) : active;
  }, [company.projects, restricted, assigned.data]);

  return { projects, restricted, loading: restricted && assigned.loading && assigned.data === null };
}
