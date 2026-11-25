import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { navigationFor } from "@/config/navigation";
import { horusBrand } from "@/config/horus.brand";
import { useCompany } from "@/company/CompanyContext";
import { usePending } from "@/features/approvals/usePending";
import { usePendingLeaves } from "@/features/approvals/usePendingLeaves";
import { DEMO_PENDING_APPROVALS, DEMO_SUPERVISOR_OF } from "@/demo/demoUsers";
import { ROLE_LABELS } from "@/domain/types";
import { useSession, useUser } from "@/session/SessionContext";
import { CompanyMark } from "./CompanyMark";

const initialsOf = (fullName: string): string =>
  fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

function BadgePill({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="rounded-full bg-error-container px-2 py-0.5 font-label-xs-mono text-label-xs-mono font-bold text-on-error-container">{count}</span>;
}

/** Cantidad real de registros esperando aprobación. */
function PendingBadge() {
  const user = useUser();
  const hours = usePending(user);
  const leaves = usePendingLeaves(user);
  return <BadgePill count={(hours.data?.entries.length ?? 0) + (leaves.data?.leaves.length ?? 0)} />;
}

/** Contenido del menú lateral. Se usa fijo en escritorio y dentro del panel en celular. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useUser();
  const { signOut, isReal } = useSession();
  const { companyName } = useCompany();
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return navigationFor(user.role).filter((i) => !q || i.label.toLowerCase().includes(q));
  }, [user.role, query]);

  const main = items.filter((i) => i.group === "main");
  const management = items.filter((i) => i.group === "management");
  const supervisorName = isReal ? undefined : DEMO_SUPERVISOR_OF[user.role];

  const renderItem = (item: (typeof items)[number]) => {
    const badge = item.id === "approvals" ? isReal ? <PendingBadge /> : <BadgePill count={DEMO_PENDING_APPROVALS} /> : null;
    return (
      <NavLink
        key={item.id}
        to={item.path}
        end={item.path === "/"}
        onClick={onNavigate}
        className={({ isActive }) =>
          `group flex items-center justify-between rounded-lg px-space-md py-2.5 font-body-md text-body-md transition-all ${
            isActive ? "bg-surface-container-high font-semibold text-primary shadow-inner" : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          }`
        }
      >
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] transition-transform group-hover:scale-110">{item.icon}</span>
          <span>{item.label}</span>
        </div>
        {badge}
      </NavLink>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-space-sm p-space-lg">
        <CompanyMark />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-headline-sm text-headline-sm font-semibold text-on-surface">{companyName}</span>
          <span className="flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant">
            <span className="size-1.5 animate-pulse rounded-full bg-primary-container" />
            {ROLE_LABELS[user.role]}
            {!isReal ? <span title="Sesión de demostración: lo que cargues no se guarda" className="rounded bg-amber-500/20 px-1.5 py-0.5 font-label-xs-mono text-label-xs-mono font-bold text-amber-300">DEMO · NO SE GUARDA</span> : null}
          </span>
        </div>
      </div>

      <div className="px-space-md py-space-xs">
        <div className="relative flex items-center">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 text-[18px] text-on-surface-variant">search</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar en el menú"
            placeholder="Buscar en el menú..."
            className="w-full rounded-lg bg-surface-container-lowest py-1.5 pr-3 pl-9 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-hidden"
          />
        </div>
      </div>

      <nav aria-label="Principal" className="flex-1 space-y-1 overflow-y-auto px-space-md py-space-sm">
        {main.map(renderItem)}
        {management.length > 0 ? (
          <>
            <div className="pt-space-sm pb-space-xs">
              <div className="px-space-md font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">Gestión</div>
            </div>
            {management.map(renderItem)}
          </>
        ) : null}
        {items.length === 0 ? <p className="px-space-md py-space-sm text-body-sm text-on-surface-variant">No hay resultados.</p> : null}
      </nav>

      <div className="flex flex-col gap-space-sm bg-surface-container-lowest p-space-md">
        <div className="flex items-center justify-between gap-space-sm">
          <div className="flex min-w-0 items-center gap-space-sm">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary-container font-headline-sm text-headline-sm font-semibold text-on-secondary-container">
              {initialsOf(user.fullName)}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-body-md text-body-md font-semibold text-on-surface">{user.fullName}</span>
              <span className="truncate font-body-sm text-body-sm text-on-surface-variant">{supervisorName ? `Supervisa: ${supervisorName}` : ROLE_LABELS[user.role]}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="flex items-center justify-center rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
        <div className="flex items-center justify-center gap-1.5 pt-space-xs opacity-70 transition-opacity hover:opacity-100">
          <span className="font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">Powered by</span>
          <img alt="" src={horusBrand.iconUrl} className="size-4 rounded" />
          <span className="font-headline-sm text-[12px] font-bold tracking-tight text-primary">HORUS</span>
        </div>
        <p className="pt-1 text-center font-label-xs-mono text-[10px] text-on-surface-variant/60" title="Versión publicada">v {__BUILD_ID__}</p>
      </div>
    </div>
  );
}
