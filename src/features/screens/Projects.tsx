import { useState, type FormEvent } from "react";
import { useCompany } from "@/company/CompanyContext";
import type { Project } from "@/domain/model";
import { listApprovedForProject } from "@/services/timeEntries";
import { saveProject, setProjectActive } from "@/services/company";
import { useSession } from "@/session/SessionContext";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useAsync } from "@/ui/useAsync";

// Horas acumuladas de ejemplo por proyecto (todo el proyecto, no solo el mes).
const LOADED: Record<string, number> = { "MNT-001": 212, "OBR-002": 188.5, "PRY-003": 296, "SOP-004": 152 };

const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
const field = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";

export default function Projects() {
  const { isReal } = useSession();
  return isReal ? <ProjectsLive /> : <ProjectsView />;
}

/** Con cuenta real: proyectos de Firestore, horas aprobadas por proyecto, alta y activación. */
function ProjectsLive() {
  const company = useCompany();
  const codes = company.projects.map((p) => p.code).join("|");
  const loaded = useAsync(
    async () => {
      const entries = await Promise.all(company.projects.map(async (p) => [p.code, (await listApprovedForProject(p.code)).reduce((sum, e) => sum + (e.hours ?? 0), 0)] as const));
      return Object.fromEntries(entries) as Record<string, number>;
    },
    [codes],
  );
  return (
    <ProjectsView
      projects={company.projects}
      loadedHours={loaded.data ?? {}}
      loading={company.loading}
      onCreate={async (p) => {
        await saveProject(p);
        company.reload();
      }}
      onToggle={async (code, value) => {
        await setProjectActive(code, value);
        company.reload();
      }}
    />
  );
}

interface ViewProps {
  projects?: Project[];
  loadedHours?: Record<string, number>;
  loading?: boolean;
  onCreate?: (project: Project) => Promise<void>;
  onToggle?: (code: string, active: boolean) => Promise<void>;
}

function ProjectsView({ projects: given, loadedHours, loading, onCreate, onToggle }: ViewProps) {
  const demo = useCompany().projects;
  const real = onCreate !== undefined;
  const projects = given ?? demo;
  const hoursOf = (code: string) => (real ? (loadedHours?.[code] ?? 0) : (LOADED[code] ?? 0));
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ code: "", name: "", client: "", budgetHours: "" });
  const [localActive, setLocalActive] = useState<Record<string, boolean>>({});
  const isActive = (p: Project) => (real ? p.active : (localActive[p.code] ?? p.active));

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 3500);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!real) {
      setOpen(false);
      flash("Proyecto guardado. En la demo no se conserva.");
      return;
    }
    try {
      await onCreate!({ code: draft.code, name: draft.name, client: draft.client, budgetHours: Number(draft.budgetHours) || 0, active: true });
    } catch (err) {
      setFormError(err instanceof Error && err.message.startsWith("El código") ? err.message : "No se pudo guardar el proyecto. Probá de nuevo.");
      return;
    }
    setOpen(false);
    setDraft({ code: "", name: "", client: "", budgetHours: "" });
    flash("Proyecto guardado.");
  };

  const toggle = async (p: Project, value: boolean) => {
    if (!real) {
      setLocalActive((a) => ({ ...a, [p.code]: value }));
      return;
    }
    try {
      await onToggle!(p.code, value);
    } catch {
      flash("No se pudo cambiar el estado del proyecto.");
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Proyectos y clientes"
        title="Proyectos"
        subtitle="Cada proyecto tiene un código, un cliente y las horas presupuestadas."
        actions={
          <button type="button" onClick={() => { setFormError(null); setOpen(true); }} className="flex items-center gap-2 rounded-xl bg-primary-container px-4 py-2.5 font-label-lg text-label-lg font-bold text-on-primary shadow-[0_0_24px_color-mix(in_srgb,var(--hz-primary)_30%,transparent)] hover:brightness-110">
            <span className="material-symbols-outlined text-[20px]">add</span>
            Nuevo proyecto
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
        {projects.map((p) => {
          const loaded = hoursOf(p.code);
          const pct = p.budgetHours > 0 ? Math.min(100, Math.round((loaded / p.budgetHours) * 100)) : 0;
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
                  {isActive(p) ? <Chip tone="ok">Activo</Chip> : <Chip tone="muted">Inactivo</Chip>}
                  <input type="checkbox" role="switch" aria-label={`Proyecto ${p.code} activo`} checked={isActive(p)} onChange={(e) => void toggle(p, e.target.checked)} className="size-4 accent-[var(--hz-primary)]" />
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

      {real && projects.length === 0 ? (
        <p className="rounded-xl bg-surface-container-low p-space-lg text-on-surface-variant">
          {loading ? "Cargando proyectos…" : "Todavía no hay proyectos. Creá el primero con “Nuevo proyecto”: sin proyectos nadie puede cargar horas."}
        </p>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <form onSubmit={(e) => void save(e)} role="dialog" aria-label="Nuevo proyecto" className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface-container-low p-space-lg shadow-2xl">
            <h2 className="font-headline-md text-headline-md text-on-surface">Nuevo proyecto</h2>
            <label className="block font-label-lg text-label-lg text-on-surface">Código<input required placeholder="Ej.: OBR-005" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className={`mt-1.5 ${field}`} /></label>
            <label className="block font-label-lg text-label-lg text-on-surface">Nombre<input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`mt-1.5 ${field}`} /></label>
            <label className="block font-label-lg text-label-lg text-on-surface">Cliente<input required value={draft.client} onChange={(e) => setDraft({ ...draft, client: e.target.value })} className={`mt-1.5 ${field}`} /></label>
            <label className="block font-label-lg text-label-lg text-on-surface">Horas presupuestadas<input type="number" min={0} value={draft.budgetHours} onChange={(e) => setDraft({ ...draft, budgetHours: e.target.value })} className={`mt-1.5 ${field}`} /></label>
            {formError ? <p role="alert" className="font-body-sm text-body-sm text-error">{formError}</p> : null}
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
          <span className="font-body-md text-body-md">{notice}</span>
        </div>
      ) : null}
    </Page>
  );
}
