import { useCompany } from "@/company/CompanyContext";
import { AMOUNT_LABELS, currentEntry, formatArs } from "@/domain/compensation";
import { dateInBuenosAires } from "@/domain/dates";
import { listUsers } from "@/services/company";
import { listPayOfPeople, PAY_CHANGED } from "@/services/compensation";
import { useUser } from "@/session/SessionContext";
import { Chip, Page, PageHeader } from "@/ui/Page";
import { useAsync } from "@/ui/useAsync";

const dmy = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Sueldos del equipo, de solo lectura. Existe solo si el Configurador activó el permiso "los supervisores ven los sueldos
 * de su equipo". Cada supervisor ve a quienes lo tienen como supervisor; las reglas de Firestore lo exigen igual.
 */
export default function TeamPayView() {
  const actor = useUser();
  const { features } = useCompany();
  const model = features.payModel;
  const labels = AMOUNT_LABELS[model];
  const decimals = model === "hourly" ? 2 : 0;
  const today = dateInBuenosAires(new Date());

  const { data, loading, error } = useAsync(
    async () => {
      const users = await listUsers();
      const team = users.filter((u) => u.active && u.supervisorId === actor.uid && u.uid !== actor.uid);
      const pay = team.length > 0 ? await listPayOfPeople(team.map((u) => u.uid)) : new Map();
      return { team, pay };
    },
    [actor.uid],
    [PAY_CHANGED],
  );

  return (
    <Page>
      <PageHeader
        eyebrow="Supervisor · solo lectura"
        title="Sueldos del equipo"
        subtitle={`${labels.field} de las personas que tenés a cargo. Es información reservada: no la compartas. No se puede editar desde acá.`}
      />
      {error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{error}</p> : null}

      <div className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
        {(data?.team.length ?? 0) === 0 ? (
          <p className="px-space-md py-8 text-center text-on-surface-variant">{loading && !data ? "Cargando…" : "Todavía no tenés personas a cargo. El administrador te las asigna desde el organigrama."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="stack-table w-full border-collapse text-left" aria-label="Sueldos del equipo">
              <thead>
                <tr className="bg-surface-container-lowest/80 font-label-xs-mono text-label-xs-mono tracking-wider text-on-surface-variant uppercase">
                  {["Persona", `${labels.field} vigente`, "Rige desde", "Historial"].map((h) => <th key={h} className="px-space-md py-3.5 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {(data?.team ?? []).map((u) => {
                  const rates = data?.pay.get(u.uid)?.rates ?? [];
                  const current = currentEntry(rates, today);
                  const history = [...rates].sort((a, b) => b.from.localeCompare(a.from));
                  return (
                    <tr key={u.uid} className="align-top hover:bg-surface-container">
                      <td className="px-space-md py-3 font-semibold">{u.fullName}</td>
                      <td data-label={`${labels.field} vigente`} className="px-space-md py-3 tabular-nums">{current ? <>{formatArs(current.amount, decimals)} <span className="text-on-surface-variant">{labels.unit}</span></> : <Chip tone="muted">Sin cargar</Chip>}</td>
                      <td data-label="Rige desde" className="px-space-md py-3 tabular-nums">{current ? dmy(current.from) : "—"}</td>
                      <td data-label="Historial" className="px-space-md py-3">
                        {history.length > 1 ? (
                          <details>
                            <summary className="cursor-pointer font-label-md text-label-md text-primary">{history.length} vigencias</summary>
                            <ul className="mt-1 space-y-0.5 font-body-sm text-body-sm text-on-surface-variant">
                              {history.map((r) => <li key={r.from} className="tabular-nums">{dmy(r.from)} · {formatArs(r.amount, decimals)}</li>)}
                            </ul>
                          </details>
                        ) : <span className="text-on-surface-variant">{history.length === 1 ? "1 vigencia" : "—"}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Page>
  );
}
