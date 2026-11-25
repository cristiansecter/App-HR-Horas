import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { NAV_ITEMS, canAccess, type NavId } from "@/config/navigation";
import { LoadHoursProvider } from "@/features/hours/LoadHoursDrawer";
import { LoginScreen } from "@/features/login/LoginScreen";
import { CompanyProvider, useCompany } from "@/company/CompanyContext";
import ConfiguratorConsole from "@/features/configurator/ConfiguratorConsole";
import { useForcedDark } from "@/ui/colorMode";
import LeavesOnlyApprovals from "@/features/approvals/LeavesOnlyApprovals";
import AssignmentsView from "@/features/assignments/AssignmentsView";
import ProjectionView from "@/features/projection/ProjectionView";
import { AlertsProvider } from "@/features/alerts/AlertsContext";
import HomeAttendance from "@/features/home/HomeAttendance";
import MyAttendanceView from "@/features/attendance/MyAttendanceView";
import TeamAttendanceView from "@/features/attendance/TeamAttendanceView";
import DocumentsView from "@/features/documents/DocumentsView";
import TeamPayView from "@/features/teampay/TeamPayView";
import ApprovalsLive from "@/features/approvals/ApprovalsLive";
import HomeLive from "@/features/home/HomeLive";
import Approvals from "@/features/screens/Approvals";
import DirectoryLive from "@/features/directory/DirectoryLive";
import EmployeeFileLive from "@/features/directory/EmployeeFileLive";
import Directory from "@/features/screens/Directory";
import EmployeeFile from "@/features/screens/EmployeeFile";
import HomeAdmin from "@/features/screens/HomeAdmin";
import HomeEmployee from "@/features/screens/HomeEmployee";
import HomeSupervisor from "@/features/screens/HomeSupervisor";
import MyHours from "@/features/screens/MyHours";
import MyLeaveLive from "@/features/leave/MyLeaveLive";
import MyLeave from "@/features/screens/MyLeave";
import Projects from "@/features/screens/Projects";
import TeamCalendar from "@/features/screens/TeamCalendar";
import MyPayslipsView from "@/features/payroll/MyPayslipsView";
import PayrollView from "@/features/payroll/PayrollView";
import PerformanceView from "@/features/performance/PerformanceView";
import ReportsLive from "@/features/reports/ReportsLive";
import Reports from "@/features/screens/Reports";
import SettingsLive from "@/features/settings/SettingsLive";
import Settings from "@/features/screens/Settings";
import WeekGridLive from "@/features/week/WeekGridLive";
import WeekGrid from "@/features/screens/WeekGrid";
import type { Role } from "@/domain/types";
import { SessionProvider, useSession } from "@/session/SessionContext";
import { AppShell } from "@/ui/AppShell";
import { ToastProvider } from "@/ui/Toast";

/** Con cuenta real, el inicio y las aprobaciones leen Firestore; en la demo se ven las pantallas de ejemplo. */
function HomeRoute({ role }: { role: Role }) {
  const { isReal } = useSession();
  const { features, workModeKnown } = useCompany();
  // Sin saber el modo todavía no se arma el inicio (para no mostrar un instante el del otro modo).
  if (isReal && !workModeKnown) return null;
  if (isReal) return features.workMode === "attendance" ? <HomeAttendance /> : <HomeLive />;
  return role === "admin" ? <HomeAdmin /> : role === "supervisor" ? <HomeSupervisor /> : <HomeEmployee />;
}

function ApprovalsRoute() {
  const { isReal } = useSession();
  const { features } = useCompany();
  // Por asistencia no hay horas para aprobar: solo licencias.
  if (isReal && features.workMode === "attendance") return <LeavesOnlyApprovals />;
  return isReal ? <ApprovalsLive /> : <Approvals />;
}

function DirectoryRoute() {
  const { isReal } = useSession();
  return isReal ? <DirectoryLive /> : <Directory />;
}

function EmployeeFileRoute() {
  const { isReal } = useSession();
  return isReal ? <EmployeeFileLive /> : <EmployeeFile />;
}

function SettingsRoute() {
  const { isReal } = useSession();
  return isReal ? <SettingsLive /> : <Settings />;
}

function WeekRoute() {
  const { isReal } = useSession();
  return isReal ? <WeekGridLive /> : <WeekGrid />;
}

function LeaveRoute() {
  const { isReal } = useSession();
  return isReal ? <MyLeaveLive /> : <MyLeave />;
}

function ReportsRoute() {
  const { isReal } = useSession();
  return isReal ? <ReportsLive /> : <Reports />;
}

const PAGES: Partial<Record<NavId, () => ReactElement>> = {
  week: () => <WeekRoute />,
  hours: () => <MyHours />,
  team: () => <TeamCalendar />,
  projects: () => <Projects />,
  leave: () => <LeaveRoute />,
  approvals: () => <ApprovalsRoute />,
  assignments: () => <AssignmentsView />,
  projection: () => <ProjectionView />,
  teamPay: () => <TeamPayView />,
  documents: () => <DocumentsView />,
  myAttendance: () => <MyAttendanceView />,
  teamAttendance: () => <TeamAttendanceView />,
  directory: () => <DirectoryRoute />,
  reports: () => <ReportsRoute />,
  performance: () => <PerformanceView />,
  payroll: () => <PayrollView />,
  myPayslips: () => <MyPayslipsView />,
  settings: () => <SettingsRoute />,
};

/** Si el rol no puede ver la ruta, vuelve al inicio. Las reglas de Firestore son la barrera real. */
function Guard({ path, render }: { path: string; render: (role: Role) => ReactElement }) {
  const { user } = useSession();
  const { features, loading } = useCompany();
  // Mientras se leen los módulos activos no se decide: así un enlace directo a una pantalla de módulo no rebota de más.
  if (user && loading && !canAccess(user.role, path)) return null;
  if (!user || !canAccess(user.role, path, features)) return <Navigate to="/" replace />;
  return render(user.role);
}

function AuthGate() {
  const { user, configurator, loading } = useSession();
  // La entrada y la consola del Configurador son de la marca y se ven siempre oscuras; el modo elegido rige dentro de la app.
  useForcedDark(loading || Boolean(configurator) || !user);
  if (loading) {
    return (
      <div className="bg-sg-mesh flex min-h-screen items-center justify-center text-sm text-ink-300" role="status">
        Cargando…
      </div>
    );
  }
  if (configurator) return <ConfiguratorConsole configurator={configurator} />;
  if (!user) return <LoginScreen />;
  return (
    <ToastProvider>
    <CompanyProvider>
    <AlertsProvider>
    <LoadHoursProvider>
      <Routes>
        <Route element={<AppShell />}>
          {NAV_ITEMS.map((item) => (
            <Route
              key={item.id}
              path={item.path}
              element={<Guard path={item.path} render={(role) => (item.id === "home" ? <HomeRoute role={role} /> : (PAGES[item.id]?.() ?? <Navigate to="/" replace />))} />}
            />
          ))}
          <Route path="/directorio/ficha" element={<Guard path="/directorio/ficha" render={() => <EmployeeFileRoute />} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </LoadHoursProvider>
    </AlertsProvider>
    </CompanyProvider>
    </ToastProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <AuthGate />
      </SessionProvider>
    </BrowserRouter>
  );
}
