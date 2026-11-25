import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { NAV_ITEMS, canAccess, type NavId } from "@/config/navigation";
import { LoadHoursProvider } from "@/features/hours/LoadHoursDrawer";
import { LoginScreen } from "@/features/login/LoginScreen";
import { CompanyProvider } from "@/company/CompanyContext";
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
  if (isReal) return <HomeLive />;
  return role === "admin" ? <HomeAdmin /> : role === "supervisor" ? <HomeSupervisor /> : <HomeEmployee />;
}

function ApprovalsRoute() {
  const { isReal } = useSession();
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
  directory: () => <DirectoryRoute />,
  reports: () => <ReportsRoute />,
  settings: () => <SettingsRoute />,
};

/** Si el rol no puede ver la ruta, vuelve al inicio. Las reglas de Firestore son la barrera real. */
function Guard({ path, render }: { path: string; render: (role: Role) => ReactElement }) {
  const { user } = useSession();
  if (!user || !canAccess(user.role, path)) return <Navigate to="/" replace />;
  return render(user.role);
}

function AuthGate() {
  const { user, loading } = useSession();
  if (loading) {
    return (
      <div className="bg-horus-mesh flex min-h-screen items-center justify-center text-sm text-navy-300" role="status">
        Cargando…
      </div>
    );
  }
  if (!user) return <LoginScreen />;
  return (
    <ToastProvider>
    <CompanyProvider>
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
