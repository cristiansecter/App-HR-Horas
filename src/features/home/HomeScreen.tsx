import { AlertTriangle, CalendarClock, CheckCheck, Clock, PieChart, Users } from "lucide-react";
import { ROLE_LABELS } from "@/domain/types";
import { useUser } from "@/session/SessionContext";
import { BentoGrid, BentoTile } from "@/ui/BentoGrid";

const NO_DATA = "Todavía sin datos.";

function AdminHome() {
  return (
    <BentoGrid>
      <BentoTile title="Horas cargadas este mes" value="—" icon={Clock}>{NO_DATA}</BentoTile>
      <BentoTile title="Pendientes de aprobación" value="—" icon={CheckCheck}>{NO_DATA}</BentoTile>
      <BentoTile title="Empleados activos" value="—" icon={Users}>{NO_DATA}</BentoTile>
      <BentoTile title="Licencias vigentes hoy" value="—" icon={CalendarClock}>{NO_DATA}</BentoTile>
      <BentoTile title="Horas por proyecto" size="hero" icon={PieChart}>El gráfico aparece cuando haya horas cargadas.</BentoTile>
      <BentoTile title="Alertas" size="wide" icon={AlertTriangle}>Licencias por revisar y semanas con carga incompleta.</BentoTile>
    </BentoGrid>
  );
}

function SupervisorHome() {
  return (
    <BentoGrid>
      <BentoTile title="Horas por aprobar" value="—" icon={CheckCheck}>{NO_DATA}</BentoTile>
      <BentoTile title="Licencias por revisar" value="—" icon={CalendarClock}>{NO_DATA}</BentoTile>
      <BentoTile title="Mi equipo" size="hero" icon={Users}>Quién cargó su semana y quién está ausente.</BentoTile>
      <BentoTile title="Mis horas de la semana" value="—" icon={Clock}>{NO_DATA}</BentoTile>
    </BentoGrid>
  );
}

function EmployeeHome() {
  return (
    <BentoGrid>
      <BentoTile title="Mis horas de la semana" value="—" icon={Clock}>{NO_DATA}</BentoTile>
      <BentoTile title="Registros observados" value="—" icon={AlertTriangle}>Los que tu supervisor te devolvió para corregir.</BentoTile>
      <BentoTile title="Mi semana" size="hero" icon={CalendarClock}>La grilla de carga rápida de lunes a domingo.</BentoTile>
      <BentoTile title="Mis licencias" value="—" icon={CalendarClock}>{NO_DATA}</BentoTile>
    </BentoGrid>
  );
}

export function HomeScreen() {
  const user = useUser();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {user.fullName.split(" ")[0]}</h1>
        <p className="text-sm text-muted">Vista de {ROLE_LABELS[user.role].toLowerCase()}</p>
      </div>
      {user.role === "admin" ? <AdminHome /> : user.role === "supervisor" ? <SupervisorHome /> : <EmployeeHome />}
    </div>
  );
}
