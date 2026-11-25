import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_FEATURES, type Features } from "@/domain/features";
import { tenantConfig, type TenantColors } from "@/config/tenant.config";
import { applyTenantTheme, isHexColor } from "@/config/theme";
import { DEMO_HOLIDAYS, DEMO_OVERTIME_CONFIG, DEMO_PROJECTS, DEMO_SCHEDULE } from "@/demo/demoData";
import type { HolidayRecord, Project } from "@/domain/model";
import type { OvertimeConfig, WorkSchedule } from "@/domain/overtime";
import { withCode } from "@/services/errors";
import { loadCompany } from "@/services/company";
import { useSession } from "@/session/SessionContext";

interface CompanyValue {
  projects: Project[];
  holidays: ReadonlyMap<string, HolidayRecord>;
  overtime: OvertimeConfig;
  /** Jornada de la empresa. Si la persona tiene una propia, se usa esa. */
  defaultSchedule: WorkSchedule;
  editWindowDays: number;
  /** Módulos activos y modelo de pago (los define el Configurador). En la demo, todo apagado. */
  features: Features;
  companyName: string;
  /** Logo de la empresa (URL https) o null para mostrar el monograma. */
  logoUrl: string | null;
  colors: TenantColors;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const DEMO_VALUE: CompanyValue = {
  projects: DEMO_PROJECTS.map((p) => ({ code: p.code, name: p.name, client: p.client, budgetHours: p.budgetHours, active: true })),
  holidays: DEMO_HOLIDAYS,
  overtime: DEMO_OVERTIME_CONFIG,
  defaultSchedule: DEMO_SCHEDULE,
  editWindowDays: 7,
  features: DEFAULT_FEATURES,
  companyName: tenantConfig.companyName,
  logoUrl: tenantConfig.logoUrl,
  colors: tenantConfig.colors,
  loading: false,
  error: null,
  reload: () => undefined,
};

const CompanyContext = createContext<CompanyValue>(DEMO_VALUE);

/** Datos de la empresa: de Firestore con una cuenta real, de ejemplo en la demo. */
export function CompanyProvider({ children }: { children: ReactNode }) {
  const { isReal } = useSession();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadCompany>> | null>(null);
  const [loading, setLoading] = useState(isReal);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const loadedOnce = useRef(false);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!isReal) return;
    let cancelled = false;
    // Solo la primera carga muestra "cargando": al recargar tras un cambio, las pantallas abiertas conservan su estado.
    if (!loadedOnce.current) setLoading(true);
    loadCompany()
      .then((d) => {
        if (cancelled) return;
        loadedOnce.current = true;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        console.error("Error al cargar la configuración", e);
        if (!cancelled) setError(withCode("No se pudo cargar la configuración de la empresa.", e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isReal, version]);

  const value = useMemo<CompanyValue>(() => {
    if (!isReal) return DEMO_VALUE;
    return {
      projects: data?.projects ?? [],
      holidays: data?.holidays ?? new Map(),
      overtime: data?.overtime ?? DEMO_OVERTIME_CONFIG,
      defaultSchedule: data?.defaultSchedule ?? DEMO_SCHEDULE,
      editWindowDays: data?.editWindowDays ?? 7,
      features: data?.features ?? DEFAULT_FEATURES,
      companyName: data?.companyName?.trim() || tenantConfig.companyName,
      logoUrl: data?.logoUrl?.trim() || tenantConfig.logoUrl,
      colors: {
        primary: data?.primaryColor && isHexColor(data.primaryColor) ? data.primaryColor : tenantConfig.colors.primary,
        secondary: data?.secondaryColor && isHexColor(data.secondaryColor) ? data.secondaryColor : tenantConfig.colors.secondary,
        accent: data?.accentColor && isHexColor(data.accentColor) ? data.accentColor : tenantConfig.colors.accent,
      },
      loading,
      error,
      reload,
    };
  }, [isReal, data, loading, error, reload]);

  // La marca que el administrador guardó en Configuración reemplaza a la de tenant.config.ts una vez dentro.
  useEffect(() => {
    applyTenantTheme({ ...tenantConfig, colors: value.colors });
  }, [value.colors]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export const useCompany = (): CompanyValue => useContext(CompanyContext);
