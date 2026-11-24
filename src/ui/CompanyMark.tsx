import { tenantConfig } from "@/config/tenant.config";
import { companyInitials } from "@/config/theme";

/** Logo de la empresa cliente, o un monograma con sus iniciales si no cargó logo. */
export function CompanyMark({ className = "size-10" }: { className?: string }) {
  if (tenantConfig.logoUrl) {
    return <img src={tenantConfig.logoUrl} alt={tenantConfig.companyName} className={`${className} rounded-xl object-contain`} />;
  }
  return (
    <span
      className={`${className} inline-flex items-center justify-center rounded-xl bg-primary text-sm font-bold text-on-primary`}
      aria-label={tenantConfig.companyName}
      role="img"
    >
      {companyInitials(tenantConfig.companyName)}
    </span>
  );
}
