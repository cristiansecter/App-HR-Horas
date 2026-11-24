import { NavLink } from "react-router-dom";
import { LogOut, X } from "lucide-react";
import { navigationFor } from "@/config/navigation";
import { tenantConfig } from "@/config/tenant.config";
import { ROLE_LABELS } from "@/domain/types";
import { useSession, useUser } from "@/session/SessionContext";
import { CompanyMark } from "./CompanyMark";
import { NAV_ICONS } from "./navIcons";
import { PoweredBy } from "./PoweredBy";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useUser();
  const { signOut } = useSession();
  const items = navigationFor(user.role);

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-3">
        <CompanyMark />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">{tenantConfig.companyName}</p>
          <p className="text-xs text-muted">{ROLE_LABELS[user.role]}</p>
        </div>
      </div>

      <nav aria-label="Principal" className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {items.map((item) => {
          const Icon = NAV_ICONS[item.id];
          return (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === "/"}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  isActive ? "bg-primary text-on-primary font-medium" : "text-muted hover:bg-surface-2 hover:text-fg"
                }`
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-fg">{user.fullName}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Cerrar sesión"
          >
            <LogOut className="size-4" aria-hidden="true" />
          </button>
        </div>
        <PoweredBy />
      </div>
    </div>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Cerrar menú">
      <X className="size-5" aria-hidden="true" />
    </button>
  );
}
