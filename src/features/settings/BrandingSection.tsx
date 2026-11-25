import { useState, type FormEvent } from "react";
import { useCompany } from "@/company/CompanyContext";
import { tenantConfig } from "@/config/tenant.config";
import { companyInitials, isHexColor, readableTextOn } from "@/config/theme";
import { withCode } from "@/services/errors";
import { saveBranding } from "@/services/settings";
import { useToast } from "@/ui/Toast";

const field = "w-full rounded-lg border border-white/10 bg-surface-container-lowest px-3 py-2.5 font-body-md text-body-md text-on-surface focus:border-primary-container focus:outline-hidden";

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const valid = isHexColor(value);
  return (
    <div>
      <label className="block font-label-lg text-label-lg text-on-surface">
        {label}
        <div className="mt-1.5 flex items-center gap-2">
          <input type="color" aria-label={`${label} (selector)`} value={valid ? value : "#000000"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1" />
          <input aria-label={`${label}: código hexadecimal`} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} spellCheck={false} maxLength={7} className={`${field} font-mono`} />
        </div>
      </label>
      {!valid ? <p role="alert" className="mt-1 font-body-sm text-body-sm text-error">Usá el formato #RRGGBB, por ejemplo #1ABEFB.</p> : null}
    </div>
  );
}

/** Nombre, logo y colores de la empresa. Lo que se guarda acá pisa a tenant.config.ts una vez dentro de la app. */
export default function BrandingSection() {
  const company = useCompany();
  const { notify } = useToast();
  const [name, setName] = useState(company.companyName);
  const [logoUrl, setLogoUrl] = useState(company.logoUrl ?? "");
  const [primary, setPrimary] = useState(company.colors.primary);
  const [secondary, setSecondary] = useState(company.colors.secondary);
  const [accent, setAccent] = useState(company.colors.accent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problems: string[] = [];
  if (!name.trim()) problems.push("Falta el nombre de la empresa.");
  if (logoUrl.trim() && !isHttpsUrl(logoUrl.trim())) problems.push("La dirección del logo tiene que empezar con https://");
  for (const [label, v] of [["principal", primary], ["secundario", secondary], ["de acento", accent]] as const) {
    if (!isHexColor(v)) problems.push(`El color ${label} no es válido.`);
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problems.length > 0) return setError("Revisá los datos marcados antes de guardar.");
    setSaving(true);
    setError(null);
    try {
      await saveBranding({ companyName: name, logoUrl, primaryColor: primary, secondaryColor: secondary, accentColor: accent });
      company.reload();
      notify("Guardaste la marca de la empresa.");
    } catch (err) {
      console.error("No se pudo guardar la marca", err);
      setError(withCode("No se pudo guardar. Probá de nuevo.", err));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setName(tenantConfig.companyName);
    setLogoUrl(tenantConfig.logoUrl ?? "");
    setPrimary(tenantConfig.colors.primary);
    setSecondary(tenantConfig.colors.secondary);
    setAccent(tenantConfig.colors.accent);
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-space-lg">
      <section className="rounded-xl bg-surface-container-low p-space-lg shadow-md">
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Marca de la empresa</h2>
        <p className="mt-1 mb-space-md font-body-sm text-body-sm text-on-surface-variant">El nombre aparece en el menú y en la planilla del contador. El logo y los colores cambian la apariencia para todo el equipo.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block font-label-lg text-label-lg text-on-surface">
            Nombre de la empresa
            <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={`mt-1.5 ${field}`} />
          </label>
          <label className="block font-label-lg text-label-lg text-on-surface">
            Logo <span className="font-label-xs-mono text-label-xs-mono text-on-surface-variant uppercase">Opcional</span>
            <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://tuempresa.com/logo.png" className={`mt-1.5 ${field}`} />
            <span className="mt-1 block font-body-sm text-body-sm font-normal text-on-surface-variant">Dirección de la imagen. Sin logo se muestran las iniciales.</span>
          </label>
          <ColorField label="Color principal" value={primary} onChange={setPrimary} />
          <ColorField label="Color secundario" value={secondary} onChange={setSecondary} />
          <ColorField label="Color de acento" value={accent} onChange={setAccent} />
        </div>

        <div className="mt-space-lg rounded-xl bg-surface-container p-4">
          <p className="mb-3 font-label-xs-mono text-label-xs-mono tracking-widest text-on-surface-variant uppercase">Vista previa</p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              {logoUrl.trim() && isHttpsUrl(logoUrl.trim()) ? <img src={logoUrl.trim()} alt="" className="size-10 rounded-xl object-contain" /> : (
                <div className="flex size-10 items-center justify-center rounded-xl bg-surface-container-high font-headline-sm font-bold" style={{ color: isHexColor(primary) ? primary : undefined }}>{companyInitials(name || "?")}</div>
              )}
              <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">{name || "Tu empresa"}</span>
            </div>
            <span className="rounded-lg px-4 py-2 font-label-lg text-label-lg font-bold" style={isHexColor(primary) ? { background: primary, color: readableTextOn(primary) } : undefined}>Botón principal</span>
            <span className="h-8 w-24 rounded-lg" style={isHexColor(secondary) && isHexColor(primary) ? { background: `linear-gradient(90deg, ${primary}, ${secondary})` } : undefined} />
            <span className="rounded px-2 py-1 font-label-md text-label-md font-semibold" style={isHexColor(accent) ? { background: accent, color: "#0B1020" } : undefined}>Acento</span>
          </div>
        </div>
      </section>

      {error || problems.length > 0 ? (
        <ul role="alert" className="space-y-1 rounded-lg bg-error/10 px-3 py-2 font-body-sm text-body-sm text-error">
          {error ? <li>{error}</li> : null}
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      ) : null}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={reset} className="px-4 py-2.5 font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface">Restablecer valores originales</button>
        <button type="submit" disabled={saving} className="rounded-xl bg-primary-container px-6 py-2.5 font-label-lg text-label-lg font-bold text-on-primary hover:brightness-110 disabled:opacity-50">{saving ? "Guardando…" : "Guardar marca"}</button>
      </div>
    </form>
  );
}
