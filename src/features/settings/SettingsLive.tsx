import { useState } from "react";
import { useCompany } from "@/company/CompanyContext";
import { Page, PageHeader } from "@/ui/Page";
import BrandingSection from "./BrandingSection";
import HolidaysSection from "./HolidaysSection";
import OrgChartSection from "./OrgChartSection";
import WorkRulesSection from "./WorkRulesSection";

const TABS = [
  ["company", "Empresa", "business"],
  ["rules", "Jornada y horas extra", "schedule"],
  ["org", "Organigrama", "account_tree"],
  ["holidays", "Feriados", "flag"],
] as const;

type Tab = (typeof TABS)[number][0];

/** Configuración con datos reales. Solo la ve el administrador. */
export default function SettingsLive() {
  const company = useCompany();
  const [tab, setTab] = useState<Tab>("company");

  return (
    <Page>
      <PageHeader eyebrow="Administrador" title="Configuración" subtitle="Marca, jornada, reglas de horas extra y feriados de tu empresa." />

      <div role="tablist" aria-label="Secciones de configuración" className="flex flex-wrap gap-2 rounded-xl bg-surface-container-low p-2">
        {TABS.map(([id, label, icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex items-center gap-2 rounded-lg px-4 py-2 font-label-lg text-label-lg transition-colors ${tab === id ? "bg-surface-container-high font-semibold text-primary" : "text-on-surface-variant hover:text-on-surface"}`}>
            <span className="material-symbols-outlined text-[18px]">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {company.error ? <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">{company.error}</p> : null}
      {company.loading ? (
        <p className="text-on-surface-variant">Cargando la configuración…</p>
      ) : tab === "company" ? (
        <BrandingSection />
      ) : tab === "org" ? (
        <OrgChartSection />
      ) : tab === "rules" ? (
        <WorkRulesSection />
      ) : (
        <HolidaysSection />
      )}
    </Page>
  );
}
