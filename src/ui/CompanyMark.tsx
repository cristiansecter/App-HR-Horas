import { useState } from "react";
import { useCompany } from "@/company/CompanyContext";
import { companyInitials } from "@/config/theme";

/** Logo de la empresa cliente, o un monograma con sus iniciales si no cargó logo (o el logo no se puede mostrar). */
export function CompanyMark({ className = "size-10" }: { className?: string }) {
  const { companyName, logoUrl } = useCompany();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (logoUrl && failedUrl !== logoUrl) {
    return <img src={logoUrl} alt={companyName} onError={() => setFailedUrl(logoUrl)} className={`${className} flex-shrink-0 rounded-xl object-contain`} />;
  }
  return (
    <div
      role="img"
      aria-label={companyName}
      className={`${className} flex shrink-0 items-center justify-center rounded-xl bg-surface-container-high font-headline-sm text-headline-sm font-bold text-primary`}
    >
      {companyInitials(companyName)}
    </div>
  );
}
