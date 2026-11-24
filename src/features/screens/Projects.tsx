import { useState } from "react";
import { DEMO_PROJECTS } from "@/demo/demoData";
import { Chip, Page, PageHeader } from "@/ui/Page";

// Horas acumuladas de ejemplo por proyecto (todo el proyecto, no solo el mes).
const LOADED: Record<string, number> = { "MNT-001": 212, "OBR-002": 188.5, "PRY-003": 296, "SOP-004": 152 };

const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
const field = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";

export default function Projects() {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(false);
  const [active, setActive] = useState<Record<string, boolean>>(() => Object.fromEntries(DEMO_PROJECTS.map((p) => [p.code, true])));

  const save = () => {
    setOpen(false);
    setNotice(true);
    window.setTimeout(() => setNotice(false), 3500);
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Proyectos y clientes"
        title="Proyectos"
        subtitle="Cada proyecto tiene un código, un cliente y las horas presupuestadas."
        actions={
          <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl bg-primary-container px-4 py-2.5 font-label-lg text-label-lg font-bold text-on-primary shadow-[0_0_24px_color-mix(in_srgb,var(--hz-primary)_30%,transparent)] hover:brightness-110">
            <span className="material-symbols-outlined text-[20px]">add</span>
            Nuevo proyecto
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
        {DEMO_PROJECTS.map((p) => {
          const loaded = LOADED[p.code] ?? 0;
          const pct = Math.min(100, Math.round((loaded / p.budgetHours) * 100));
          const warn = pct >= 90;
          return (
            <article key={p.code} className="flex flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-md">
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="rounded bg-surface-container-high px-2 py-0.5 font-label-xs-mono text-label-xs-mono font-semibold text-primary">{p.code}</span>
                  <h2 className="mt-2 truncate font-headline-sm text-headline-sm font-semibold text-on-surface">{p.name}</h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{p.client}</p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 font-label-md text-label-md text-on-surface-variant">
                  {active[p.code] ? <Chip tone="ok">Activo</Chip> : <Chip tone="muted">Inactivo</Chip>}
                  <input type="checkbox" role="switch" aria-label={`Proyecto ${p.code} activo`} checked={active[p.code]} onChange={(e) => setActive((a) => ({ ...a, [p.code]: e.target.checked }))} className="size-4 accent-[var(--hz-primary)]" />
                </label>
              </header>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between font-label-md text-label-md">
                  <span className="text-on-surface-variant">Horas cargadas</span>
                  <span className="font-semibold text-on-surface tabular-nums">
                    {fmt(loaded)} <span className="font-normal text-on-surface-variant">de {fmt(p.budgetHours)} h</span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-highest" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Horas cargadas sobre las presupuestadas">
                  <div className={`h-full rounded-full ${warn ? "bg-error" : "bg-primary-container"}`} style={{ width: `${pct}%` }} />
                </div>
                <p className={`mt-1.5 font-label-xs-mono text-label-xs-mono ${warn ? "text-error" : "text-on-surface-variant"}`}>{pct}% del presupuesto{warn ? " · cerca del límite" : ""}</p>
              </div>
            </article>
          );
        })}
      </div>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <form onSubmit={(e) => { e.preventDefault(); save(); }} role="dialog" aria-label="Nuevo proyecto" className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
            <h2 className="font-headline-md text-headline-md text-on-surface">Nuevo proyecto</h2>
            <label className="block font-label-lg text-label-lg text-on-surface">Código<input required placeholder="Ej.: OBR-005" className={`mt-1.5 ${field}`} /></label>
            <label className="block font-label-lg text-label-lg text-on-surface">Nombre<input required className={`mt-1.5 ${field}`} /></label>
            <label className="block font-label-lg text-label-lg text-on-surface">Cliente<input required className={`mt-1.5 ${field}`} /></label>
            <label className="block font-label-lg text-label-lg text-on-surface">Horas presupuestadas<input type="number" min={0} className={`mt-1.5 ${field}`} /></label>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Cancelar</button>
              <button type="submit" className="rounded-lg bg-primary-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110">Guardar</button>
            </div>
          </form>
        </div>
      ) : null}

      {notice ? (
        <div role="status" className="fixed right-6 bottom-6 z-[80] flex items-center gap-3 rounded-xl bg-surface-container-high p-4 text-on-surface shadow-xl">
          <span className="material-symbols-outlined text-primary">task_alt</span>
          <span className="font-body-md text-body-md">Proyecto guardado. En la demo no se conserva.</span>
        </div>
      ) : null}
    </Page>
  );
}
