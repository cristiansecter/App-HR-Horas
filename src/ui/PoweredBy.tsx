import { horusBrand } from "@/config/horus.brand";

export function PoweredBy() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <img src={horusBrand.iconUrl} alt="" className="size-5 rounded-md" />
      <span>{horusBrand.poweredByLabel}</span>
    </div>
  );
}
