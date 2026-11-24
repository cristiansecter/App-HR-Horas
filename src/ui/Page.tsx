import type { ReactNode } from "react";

/** Contenedor de una pantalla: mismo margen y separación que las pantallas diseñadas. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="flex w-full flex-col gap-space-lg px-space-lg py-space-lg">{children}</div>;
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-space-md rounded-xl bg-surface-container-low p-space-lg shadow-xl shadow-surface-container-lowest/50 lg:flex-row lg:items-center">
      <div className="flex flex-col gap-1.5">
        {eyebrow ? <span className="w-fit rounded bg-surface-container-high px-2 py-0.5 font-label-xs-mono text-label-xs-mono tracking-widest text-primary-container uppercase">{eyebrow}</span> : null}
        <h1 className="font-headline-lg text-headline-lg font-bold tracking-tight text-on-surface">{title}</h1>
        {subtitle ? <p className="font-body-md text-body-md text-on-surface-variant">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function Chip({ tone, children }: { tone: "normal" | "ot50" | "ot100" | "guard" | "ok" | "warn" | "info" | "muted" | "bad"; children: ReactNode }) {
  const cls: Record<string, string> = {
    normal: "bg-primary-container/15 text-primary",
    ot50: "bg-primary/15 text-primary-fixed",
    ot100: "bg-error/15 text-error",
    guard: "bg-secondary-container/40 text-secondary",
    ok: "bg-emerald-500/10 text-emerald-400",
    warn: "bg-amber-500/15 text-amber-300",
    info: "bg-primary-container/10 text-primary",
    muted: "bg-surface-container-high text-on-surface-variant",
    bad: "bg-rose-500/15 text-rose-300",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-label-xs-mono text-label-xs-mono font-semibold ${cls[tone]}`}>{children}</span>;
}
