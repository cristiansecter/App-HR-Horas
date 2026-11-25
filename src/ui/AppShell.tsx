import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { NAV_ITEMS } from "@/config/navigation";
import { useCompany } from "@/company/CompanyContext";
import { BUENOS_AIRES_TZ } from "@/domain/dates";
import { useLoadHours } from "@/features/hours/LoadHoursDrawer";
import { NotificationsBell } from "@/features/alerts/NotificationsBell";
import { ColorModeButton } from "./ColorModeButton";
import { CompanyMark } from "./CompanyMark";
import { SidebarContent } from "./Sidebar";

const currentPeriod = (): string => {
  const text = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: BUENOS_AIRES_TZ }).format(new Date());
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const pageLabel = (pathname: string): string => {
  if (pathname.startsWith("/directorio/ficha")) return "Ficha de empleado";
  return NAV_ITEMS.find((i) => i.path === pathname)?.label ?? "";
};

/** Estructura de toda la app con sesión: menú lateral fijo en escritorio y panel desplegable en celular. */
export function AppShell() {
  const { pathname } = useLocation();
  const { openDrawer } = useLoadHours();
  const { companyName, features } = useCompany();
  const [menuOpen, setMenuOpen] = useState(false);
  // Todos pueden abrir el cajón: el empleado carga lo suyo; el supervisor lo suyo y lo de su equipo; el administrador lo de cualquiera.
  // Por asistencia no hay carga de horas.
  const canLoadHours = features.workMode === "projects";

  const loadButton = (
    <button
      type="button"
      onClick={openDrawer}
      className="flex items-center gap-2 rounded-lg bg-primary-container px-3.5 py-1.5 font-label-lg text-label-lg font-semibold text-on-primary transition-all hover:brightness-110 shadow-[0_0_16px_color-mix(in_srgb,var(--hz-primary)_25%,transparent)]"
    >
      <span className="material-symbols-outlined text-[18px]">add_circle</span>
      <span>Cargar horas</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <aside className="fixed top-0 left-0 z-50 hidden h-screen w-64 bg-surface-container-low shadow-[0_1px_8px_rgba(0,0,0,0.04)] lg:block">
        <SidebarContent />
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-surface-container-low shadow-xl">
            <SidebarContent onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="fixed top-0 right-0 left-0 z-40 hidden h-16 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] lg:left-64 lg:block">
          <div className="flex h-16 w-full items-center justify-between px-space-lg">
            <div className="flex items-center gap-space-md">
              <div className="flex items-center gap-2 font-body-sm text-body-sm">
                <span className="text-on-surface-variant">{companyName}</span>
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">chevron_right</span>
                <span className="font-semibold text-on-surface">{pageLabel(pathname)}</span>
              </div>
              <div className="hidden items-center gap-2 rounded-full bg-surface-container-high px-3 py-1 font-label-md text-label-md text-on-surface-variant xl:flex">
                <span className="material-symbols-outlined text-[16px] text-primary">date_range</span>
                <span>
                  Período: <strong className="font-semibold text-on-surface">{currentPeriod()}</strong>
                </span>
                <span className="ml-1 rounded bg-primary-container px-1.5 py-0.5 font-label-xs-mono text-label-xs-mono font-bold text-on-primary">EN CURSO</span>
              </div>
            </div>
            <div className="flex items-center gap-space-md">
              <div className="flex items-center gap-1">
                <ColorModeButton />
                <NotificationsBell />
                <button type="button" title="Ayuda" aria-label="Ayuda" className="flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface">
                  <span className="material-symbols-outlined text-[20px]">help_outline</span>
                </button>
              </div>
              {canLoadHours ? loadButton : null}
            </div>
          </div>
        </header>

        <header className="sticky top-0 z-40 flex items-center gap-3 bg-surface-container-low px-4 py-3 lg:hidden">
          <button type="button" onClick={() => setMenuOpen(true)} className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high" aria-label="Abrir menú">
            <span className="material-symbols-outlined">menu</span>
          </button>
          <CompanyMark className="size-8" />
          <span className="min-w-0 flex-1 truncate font-headline-sm text-[15px] font-semibold">{companyName}</span>
          <ColorModeButton />
          <NotificationsBell />
          {canLoadHours ? (
            <button type="button" onClick={openDrawer} aria-label="Cargar horas" className="flex size-9 items-center justify-center rounded-lg bg-primary-container text-on-primary">
              <span className="material-symbols-outlined text-[20px]">add</span>
            </button>
          ) : null}
        </header>

        <main className="relative min-h-screen bg-surface lg:pt-16">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
