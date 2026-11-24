import { tenantConfig } from "@/config/tenant.config";
import { companyInitials } from "@/config/theme";

/** Logo de la empresa cliente, o un monograma con sus iniciales si no cargó logo. */
export function CompanyMark({ className = "size-10" }: { className?: string }) {
  if (tenantConfig.logoUrl) {
    return <img src={tenantConfig.logoUrl} alt={tenantConfig.companyName} className={`${className} flex-shrink-0 rounded-xl object-contain`} />;
  }
  return (
    <div
      role="img"
      aria-label={tenantConfig.companyName}
      className={`${className} flex shrink-0 items-center justify-center rounded-xl bg-surface-container-high font-headline-sm text-headline-sm font-bold text-primary`}
    >
      {companyInitials(tenantConfig.companyName)}
    </div>
  );
}
