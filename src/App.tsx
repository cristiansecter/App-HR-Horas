import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { NAV_ITEMS, canAccess, type NavItem } from "@/config/navigation";
import { LoginScreen } from "@/features/login/LoginScreen";
import { HomeScreen } from "@/features/home/HomeScreen";
import { PlaceholderPage } from "@/features/pages/PlaceholderPage";
import { SessionProvider, useSession } from "@/session/SessionContext";
import { AppShell } from "@/ui/AppShell";

/** Si el rol no puede ver la ruta, vuelve al inicio. Las reglas de Firestore son la barrera real. */
function RoleGuard({ item }: { item: NavItem }) {
  const { user } = useSession();
  if (!user || !canAccess(user.role, item.path)) return <Navigate to="/" replace />;
  return item.id === "home" ? <HomeScreen /> : <PlaceholderPage id={item.id} title={item.label} />;
}

function AuthGate() {
  const { user } = useSession();
  if (!user) return <LoginScreen />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        {NAV_ITEMS.map((item) => (
          <Route key={item.id} path={item.path} element={<RoleGuard item={item} />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
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
