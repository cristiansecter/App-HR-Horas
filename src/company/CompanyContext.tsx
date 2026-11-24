import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEMO_HOLIDAYS, DEMO_OVERTIME_CONFIG, DEMO_PROJECTS, DEMO_SCHEDULE } from "@/demo/demoData";
import type { Project } from "@/domain/model";
import type { Holiday, OvertimeConfig, WorkSchedule } from "@/domain/overtime";
import { loadCompany } from "@/services/company";
import { useSession } from "@/session/SessionContext";

interface CompanyValue {
  projects: Project[];
  holidays: ReadonlyMap<string, Holiday>;
  overtime: OvertimeConfig;
  /** Jornada de la empresa. Si la persona tiene una propia, se usa esa. */
  defaultSchedule: WorkSchedule;
  editWindowDays: number;
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
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!isReal) return;
    let cancelled = false;
    setLoading(true);
    loadCompany()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch(() => !cancelled && setError("No se pudo cargar la configuración de la empresa."))
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
      loading,
      error,
      reload,
    };
  }, [isReal, data, loading, error, reload]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export const useCompany = (): CompanyValue => useContext(CompanyContext);
