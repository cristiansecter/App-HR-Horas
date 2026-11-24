import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { tenantConfig } from "@/config/tenant.config";
import { CompanyMark } from "./CompanyMark";
import { CloseButton, Sidebar } from "./Sidebar";

/** Estructura de toda la app logueada: menú lateral en escritorio y menú desplegable en celular. */
export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-full bg-bg text-fg">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">
        <Sidebar />
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-border bg-surface shadow-xl">
            <div className="flex justify-end px-2 pt-2">
              <CloseButton onClick={() => setMenuOpen(false)} />
            </div>
            <div className="min-h-0 flex-1">
              <Sidebar onNavigate={() => setMenuOpen(false)} />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="rounded-lg p-2 text-muted hover:bg-surface-2"
            aria-label="Abrir menú"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <CompanyMark className="size-8" />
          <span className="truncate text-sm font-semibold">{tenantConfig.companyName}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
