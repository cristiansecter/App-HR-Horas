import { Hammer } from "lucide-react";
import type { NavId } from "@/config/navigation";
import { BentoGrid, BentoTile } from "@/ui/BentoGrid";

const DESCRIPTIONS: Record<NavId, string> = {
  home: "",
  week: "Grilla semanal de lunes a domingo para cargar hora desde y hora hasta de cada día.",
  hours: "Historial de tus registros con su estado: borrador, enviado, aprobado u observado.",
  leave: "Solicitud de vacaciones y licencias, con adjunto opcional, y su estado.",
  team: "Quién está ausente en el equipo. Muestra solo \"ausente\", sin el tipo de licencia.",
  approvals: "Horas y licencias pendientes de revisión: aprobar, observar con comentario o rechazar.",
  directory: "Fichas de empleados: datos del perfil, jornada laboral y datos sensibles solo para el Admin.",
  projects: "Alta y baja de proyectos y clientes, con código y horas presupuestadas.",
  reports: "Filtros por período, empleado, sector o proyecto, y descarga de la planilla Excel para el contador.",
  settings: "Jornadas, reglas de horas extra, modo del sábado, feriados y datos de la empresa.",
};

export function PlaceholderPage({ id, title }: { id: NavId; title: string }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <BentoGrid>
        <BentoTile title="En construcción" size="wide" icon={Hammer}>
          {DESCRIPTIONS[id]}
        </BentoTile>
      </BentoGrid>
    </div>
  );
}
