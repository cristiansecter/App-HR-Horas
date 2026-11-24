import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Grilla modular: 1 columna en celular, 2 en tablet y 4 en escritorio. */
export function BentoGrid({ children }: { children: ReactNode }) {
  return <div className="grid auto-rows-[minmax(9rem,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

export type TileSize = "sm" | "wide" | "tall" | "hero";

// Clases completas y fijas para que Tailwind las detecte.
const SIZE_CLASSES: Record<TileSize, string> = {
  sm: "",
  wide: "sm:col-span-2",
  tall: "row-span-2",
  hero: "sm:col-span-2 row-span-2",
};

interface BentoTileProps {
  title: string;
  size?: TileSize;
  icon?: LucideIcon;
  /** Valor grande de la tarjeta (un KPI). */
  value?: string;
  children?: ReactNode;
}

export function BentoTile({ title, size = "sm", icon: Icon, value, children }: BentoTileProps) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm ${SIZE_CLASSES[size]}`}
      aria-label={title}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted">{title}</h2>
        {Icon ? <Icon className="size-4 text-primary" aria-hidden="true" /> : null}
      </header>
      {value !== undefined ? <p className="text-3xl font-semibold tracking-tight text-fg">{value}</p> : null}
      {children ? <div className="text-sm text-muted">{children}</div> : null}
    </section>
  );
}
