import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { NAV_ITEMS, canAccess, type NavId } from "@/config/navigation";
import { LoadHoursProvider } from "@/features/hours/LoadHoursDrawer";
import { LoginScreen } from "@/features/login/LoginScreen";
import Approvals from "@/features/screens/Approvals";
import Directory from "@/features/screens/Directory";
import EmployeeFile from "@/features/screens/EmployeeFile";
import HomeAdmin from "@/features/screens/HomeAdmin";
import HomeEmployee from "@/features/screens/HomeEmployee";
import HomeSupervisor from "@/features/screens/HomeSupervisor";
import MyHours from "@/features/screens/MyHours";
import MyLeave from "@/features/screens/MyLeave";
import Projects from "@/features/screens/Projects";
import TeamCalendar from "@/features/screens/TeamCalendar";
import Reports from "@/features/screens/Reports";
import Settings from "@/features/screens/Settings";
import WeekGrid from "@/features/screens/WeekGrid";
import type { Role } from "@/domain/types";
import { SessionProvider, useSession } from "@/session/SessionContext";
import { AppShell } from "@/ui/AppShell";
import { ToastProvider } from "@/ui/Toast";

const HOME: Record<Role, () => ReactElement> = {
  admin: () => <HomeAdmin />,
  supervisor: () => <HomeSupervisor />,
  employee: () => <HomeEmployee />,
};

const PAGES: Partial<Record<NavId, () => ReactElement>> = {
  week: () => <WeekGrid />,
  hours: () => <MyHours />,
  team: () => <TeamCalendar />,
  projects: () => <Projects />,
  leave: () => <MyLeave />,
  approvals: () => <Approvals />,
  directory: () => <Directory />,
  reports: () => <Reports />,
  settings: () => <Settings />,
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
    <LoadHoursProvider>
      <Routes>
        <Route element={<AppShell />}>
          {NAV_ITEMS.map((item) => (
            <Route
              key={item.id}
              path={item.path}
              element={<Guard path={item.path} render={(role) => (item.id === "home" ? HOME[role]() : (PAGES[item.id]?.() ?? <Navigate to="/" replace />))} />}
            />
          ))}
          <Route path="/directorio/ficha" element={<Guard path="/directorio/ficha" render={() => <EmployeeFile />} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </LoadHoursProvider>
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
