import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCompany } from "@/company/CompanyContext";
import { availableHours, DEFAULT_ALLOCATION_PCT, deviation, distributeHours, expectedHours, MAX_PROJECTED_HOURS } from "@/domain/allocation";
import { dateInBuenosAires } from "@/domain/dates";
import { monthRange } from "@/domain/export/payrollFromEntries";
import { ASSIGNMENTS_CHANGED, listAssignmentsForReview } from "@/services/assignments";
import { listUsers } from "@/services/company";
import { withCode } from "@/services/errors";
import { LEAVES_CHANGED, listApprovedLeavesForReview } from "@/services/leaves";
import { listProjections, PROJECTIONS_CHANGED, saveProjections } from "@/services/projections";
import { ENTRIES_CHANGED, listApprovedForReview } from "@/services/timeEntries";
import { useUser } from "@/session/SessionContext";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useToast } from "@/ui/Toast";
import { useAsync } from "@/ui/useAsync";

const fmtH = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
const monthLabel = (m: string) => {
  const text = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1);
};
/** "80", "80,5" o "80.5" → número; vacío o inválido → null. */
const parseHours = (text: string | undefined): number | null => {
  if (text === undefined || text.trim() === "") return null;
  const n = Number(text.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= MAX_PROJECTED_HOURS ? Math.round(n * 100) / 100 : null;
};
const input = "rounded-lg border border-white/10 bg-surface-container-lowest px-2 py-1.5 text-right font-body-md text-body-md text-on-surface tabular-nums focus:border-primary-container focus:outline-hidden";

/**
 * Proyección: el administrador (toda la empresa) y el supervisor (su equipo) reparten las horas del mes de cada proyecto
 * entre las personas asignadas. Muestra el porcentaje de dedicación, las horas disponibles (jornada menos feriados y
 * licencias), lo proyectado y lo realmente trabajado (aprobado). No tiene importes.
 */
export default function ProjectionView() {
  const actor = useUser();
  const company = useCompany();
  const { notify } = useToast();
  const thisMonth = dateInBuenosAires(new Date()).slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pool, setPool] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<Record<string, string>>({});

  const { data, loading, error: loadError } = useAsync(
    async () => {
      const users = await listUsers();
      // Administrador: toda la empresa. Supervisor: solo quienes lo tienen como supervisor (las reglas lo exigen igual).
      const team = users.filter((u) => u.active && (actor.role === "admin" || (u.supervisorId === actor.uid && u.uid !== actor.uid)));
      if (team.length === 0) return { team, assignments: [], projections: [], entries: [], leaves: [] };
      const ids = team.map((u) => u.uid);
      const [assignments, projections, entries, leaves] = await Promise.all([
        listAssignmentsForReview(actor, ids),
        listProjections(actor, ids, month),
        listApprovedForReview(actor, ids, monthRange(month)),
        listApprovedLeavesForReview(actor, ids),
      ]);
      return { team, assignments, projections, entries, leaves };
    },
    [actor.uid, actor.role, month],
    [ASSIGNMENTS_CHANGED, PROJECTIONS_CHANGED, ENTRIES_CHANGED, LEAVES_CHANGED],
  );
  // Al cambiar de mes o llegar datos nuevos se descartan los borradores (lo guardado manda).
  useEffect(() => { setDrafts({}); setHint({}); }, [data, month]);

  const model = useMemo(() => {
    const team = data?.team ?? [];
    const teamIds = new Set(team.map((u) => u.uid));
    const assignments = (data?.assignments ?? []).filter((a) => teamIds.has(a.userId));
    const saved = new Map((data?.projections ?? []).map((p) => [`${p.projectId}|${p.userId}`, p.hours]));
    const worked = new Map<string, number>();
    for (const e of data?.entries ?? []) worked.set(`${e.projectId}|${e.userId}`, (worked.get(`${e.projectId}|${e.userId}`) ?? 0) + (e.hours ?? 0));
    const available = new Map(team.map((u) => [u.uid, availableHours({ month, schedule: u.workSchedule ?? company.defaultSchedule, holidays: company.holidays, leaves: (data?.leaves ?? []).filter((l) => l.userId === u.uid) })]));
    const byProject = company.projects
      .filter((p) => p.active)
      .map((p) => ({ project: p, rows: assignments.filter((a) => a.projectId === p.code).map((a) => ({ user: team.find((u) => u.uid === a.userId)!, pct: a.allocationPct ?? DEFAULT_ALLOCATION_PCT })) }))
      .filter((g) => g.rows.length > 0)
      .map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.user.fullName.localeCompare(b.user.fullName, "es")) }));
    return { team, saved, worked, available, byProject };
  }, [data, month, company.projects, company.holidays, company.defaultSchedule]);

  const keyOf = (code: string, uid: string) => `${code}|${uid}`;
  /** Horas proyectadas que se ven ahora: el borrador si lo hay, o lo guardado. */
  const projectedOf = (code: string, uid: string): number | null => {
    const k = keyOf(code, uid);
    return k in drafts ? parseHours(drafts[k]) : (model.saved.get(k) ?? null);
  };
  const setDraft = (code: string, uid: string, value: string) => setDrafts((d) => ({ ...d, [keyOf(code, uid)]: value }));
  const setMany = (code: string, hours: Map<string, number>) => setDrafts((d) => ({ ...d, ...Object.fromEntries([...hours].map(([uid, h]) => [keyOf(code, uid), String(h)])) }));

  const fillSuggested = (g: (typeof model.byProject)[number]) => {
    setMany(g.project.code, new Map(g.rows.map((r) => [r.user.uid, expectedHours(model.available.get(r.user.uid) ?? 0, r.pct)])));
    setHint((h) => ({ ...h, [g.project.code]: "" }));
  };
  const fillFromPool = (g: (typeof model.byProject)[number], equal: boolean) => {
    const total = parseHours(pool[g.project.code]);
    if (total === null || total <= 0) return setHint((h) => ({ ...h, [g.project.code]: "Escribí primero cuántas horas querés repartir." }));
    setMany(g.project.code, distributeHours(total, g.rows.map((r) => ({ id: r.user.uid, weight: equal ? 1 : r.pct }))));
    setHint((h) => ({ ...h, [g.project.code]: "" }));
  };

  const save = async (g: (typeof model.byProject)[number]) => {
    const code = g.project.code;
    const items = g.rows.flatMap((r) => {
      const k = keyOf(code, r.user.uid);
      if (!(k in drafts)) return [];
      const hours = parseHours(drafts[k]);
      return hours === null || hours === model.saved.get(k) ? [] : [{ projectId: code, userId: r.user.uid, month, hours }];
    });
    const invalid = g.rows.filter((r) => keyOf(code, r.user.uid) in drafts && drafts[keyOf(code, r.user.uid)]!.trim() !== "" && parseHours(drafts[keyOf(code, r.user.uid)]) === null);
    if (invalid.length) return setError(`Revisá las horas de ${invalid.map((r) => r.user.fullName).join(", ")}: tienen que ser un número de 0 a ${MAX_PROJECTED_HOURS}.`);
    if (items.length === 0) return setError("No hay cambios para guardar.");
    setSaving(code);
    setError(null);
    try {
      await saveProjections(items, actor.uid);
      notify(`Guardaste la proyección de ${code} para ${monthLabel(month).toLowerCase()}.`);
    } catch (e) {
      console.error("No se pudo guardar la proyección", e);
      setError(withCode("No se pudo guardar la proyección. Probá de nuevo.", e));
    } finally {
      setSaving(null);
    }
  };

  // Resumen por persona: todo lo proyectado en todos los proyectos contra lo que tiene disponible.
  const people = model.team.map((u) => {
    const rows = model.byProject.flatMap((g) => g.rows.filter((r) => r.user.uid === u.uid).map(() => g.project.code));
    return {
      user: u,
      available: model.available.get(u.uid) ?? 0,
      projected: rows.reduce((s, code) => s + (projectedOf(code, u.uid) ?? 0), 0),
      worked: rows.reduce((s, code) => s + (model.worked.get(keyOf(code, u.uid)) ?? 0), 0),
      projects: rows.length,
    };
  }).filter((p) => p.projects > 0);

  return (
    <Page>
      <PageHeader
        eyebrow={actor.role === "admin" ? "Administrador" : "Supervisor"}
        title="Proyección"
        subtitle={`${monthLabel(month)}. Repartí las horas de cada proyecto entre las personas asignadas y compará con lo que realmente se trabajó (solo horas aprobadas).`}
        actions={<label className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">Mes<input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden" /></label>}
      />

      {loadError || error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error ?? loadError}</p> : null}

      {model.byProject.length === 0 ? (
        <div className="rounded-xl bg-surface-container-low p-space-lg text-center text-on-surface-variant shadow-sm">
          {loading && !data ? "Cargando…" : model.team.length === 0
            ? actor.role === "admin" ? "No hay personas activas." : "Todavía no tenés personas a cargo. El administrador te las asigna desde el organigrama."
            : <>Ninguna de las personas a cargo tiene proyectos asignados. Asignalos en <Link to="/asignaciones" className="font-semibold text-primary underline">Asignar proyectos</Link> y vas a poder repartir las horas acá.</>}
        </div>
      ) : null}

      {model.byProject.map((g) => {
        const code = g.project.code;
        const total = g.rows.reduce((s, r) => s + (projectedOf(code, r.user.uid) ?? 0), 0);
        const workedTotal = g.rows.reduce((s, r) => s + (model.worked.get(keyOf(code, r.user.uid)) ?? 0), 0);
        const poolHours = parseHours(pool[code]);
        const left = poolHours === null ? null : Math.round((poolHours - total) * 100) / 100;
        const dirty = g.rows.some((r) => keyOf(code, r.user.uid) in drafts && parseHours(drafts[keyOf(code, r.user.uid)]) !== (model.saved.get(keyOf(code, r.user.uid)) ?? null));
        return (
          <section key={code} aria-label={`Proyección de ${code}`} className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3 px-space-md pb-3">
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface">{code}</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{g.project.name}{g.project.client ? ` · ${g.project.client}` : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">Horas a repartir
                  <input aria-label={`Horas a repartir de ${code}`} inputMode="decimal" value={pool[code] ?? ""} placeholder="0" onChange={(e) => setPool((p) => ({ ...p, [code]: e.target.value }))} className={`w-24 ${input}`} />
                </label>
                <button type="button" onClick={() => fillFromPool(g, false)} className="rounded-lg bg-surface-container-high px-3 py-2 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-highest">Repartir según %</button>
                <button type="button" onClick={() => fillFromPool(g, true)} className="rounded-lg bg-surface-container-high px-3 py-2 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-highest">Partes iguales</button>
                <button type="button" onClick={() => fillSuggested(g)} className="rounded-lg bg-surface-container-high px-3 py-2 font-label-md text-label-md font-semibold text-on-surface hover:bg-surface-container-highest">Sugerir por disponibilidad</button>
              </div>
            </div>
            {hint[code] ? <p role="note" className="px-space-md pb-2 font-body-sm text-body-sm text-amber-200">{hint[code]}</p> : null}
            {left !== null ? (
              <p aria-label={`Estado del reparto de ${code}`} className={`px-space-md pb-2 font-body-sm text-body-sm ${left < 0 ? "text-error" : left === 0 ? "text-emerald-400" : "text-on-surface-variant"}`}>
                Repartido {fmtH(total)} de {fmtH(poolHours ?? 0)} h · {left === 0 ? "reparto completo" : left > 0 ? `faltan ${fmtH(left)} h` : `te pasaste por ${fmtH(-left)} h`}
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="stack-table w-full border-collapse text-left">
                <thead><tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">{["Persona", "% asignado", "Horas disponibles", "Horas proyectadas", "Horas trabajadas", "Desvío"].map((h) => <th key={h} className="px-space-md py-3 font-semibold">{h}</th>)}</tr></thead>
                <tbody className="font-body-md text-body-md text-on-surface">
                  {g.rows.map((r) => {
                    const k = keyOf(code, r.user.uid);
                    const projected = projectedOf(code, r.user.uid);
                    const worked = model.worked.get(k) ?? 0;
                    const dev = projected === null ? null : deviation(worked, projected);
                    const suggested = expectedHours(model.available.get(r.user.uid) ?? 0, r.pct);
                    return (
                      <tr key={r.user.uid} className="align-middle hover:bg-surface-container">
                        <td className="px-space-md py-2.5 font-semibold">{r.user.fullName}</td>
                        <td data-label="% asignado" className="px-space-md py-2.5 tabular-nums">{r.pct} %</td>
                        <td data-label="Horas disponibles" className="px-space-md py-2.5 tabular-nums">{fmtH(model.available.get(r.user.uid) ?? 0)}</td>
                        <td data-label="Horas proyectadas" className="px-space-md py-2.5"><input aria-label={`Horas proyectadas de ${r.user.fullName} en ${code}`} inputMode="decimal" value={k in drafts ? drafts[k] : model.saved.has(k) ? String(model.saved.get(k)) : ""} placeholder={fmtH(suggested)} onChange={(e) => setDraft(code, r.user.uid, e.target.value)} className={`w-24 ${input}`} /></td>
                        <td data-label="Horas trabajadas" className="px-space-md py-2.5 tabular-nums">{fmtH(worked)}</td>
                        <td data-label="Desvío" className={`px-space-md py-2.5 tabular-nums ${dev !== null && dev > 0 ? "text-amber-300" : ""}`}>{dev === null ? "—" : `${dev > 0 ? "+" : ""}${fmtH(dev)} h`}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr className="font-semibold text-on-surface"><td className="px-space-md py-3" colSpan={3}>Total del proyecto</td><td data-label="Proyectadas" className="px-space-md py-3 tabular-nums">{fmtH(total)} h</td><td data-label="Trabajadas" className="px-space-md py-3 tabular-nums">{fmtH(workedTotal)} h</td><td data-label="Desvío" className="px-space-md py-3 tabular-nums">{fmtH(deviation(workedTotal, total))} h</td></tr></tfoot>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 px-space-md pt-3">
              <p className="font-body-sm text-body-sm text-on-surface-variant">El número gris es la sugerencia: porcentaje × horas disponibles del mes. Una celda vacía es “sin proyectar”.</p>
              <button type="button" disabled={!dirty || saving !== null} onClick={() => void save(g)} className="shrink-0 rounded-lg bg-primary-container px-5 py-2 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-50">{saving === code ? "Guardando…" : "Guardar proyección"}</button>
            </div>
          </section>
        );
      })}

      {people.length > 0 ? (
        <section aria-label="Resumen por persona" className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
          <h2 className="px-space-md pb-3 font-headline-md text-headline-md text-on-surface">Resumen por persona</h2>
          <div className="overflow-x-auto">
            <table className="stack-table w-full border-collapse text-left">
              <thead><tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">{["Persona", "Proyectos", "Horas disponibles", "Proyectadas (todos)", "Trabajadas (todos)"].map((h) => <th key={h} className="px-space-md py-3 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {people.map((p) => (
                  <tr key={p.user.uid} className="hover:bg-surface-container">
                    <td className="px-space-md py-2.5 font-semibold">{p.user.fullName}</td>
                    <td data-label="Proyectos" className="px-space-md py-2.5 tabular-nums">{p.projects}</td>
                    <td data-label="Horas disponibles" className="px-space-md py-2.5 tabular-nums">{fmtH(p.available)}</td>
                    <td data-label="Proyectadas (todos)" className="px-space-md py-2.5 tabular-nums">{fmtH(p.projected)} {p.projected > p.available + 0.01 ? <Chip tone="warn">{`Supera lo disponible en ${fmtH(p.projected - p.available)} h`}</Chip> : null}</td>
                    <td data-label="Trabajadas (todos)" className="px-space-md py-2.5 tabular-nums">{fmtH(p.worked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </Page>
  );
}
