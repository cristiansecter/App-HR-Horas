import { withCode } from "@/services/errors";
import { useCallback, useEffect, useState, type DependencyList } from "react";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Carga datos asíncronos y los vuelve a pedir cuando cambian las dependencias, cuando se llama a `reload`
 * o cuando se dispara alguno de los eventos indicados (por ejemplo, "se cargaron o aprobaron horas").
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList, events: string[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const eventKey = events.join("|");

  useEffect(() => {
    const names = eventKey ? eventKey.split("|") : [];
    names.forEach((n) => window.addEventListener(n, reload));
    return () => names.forEach((n) => window.removeEventListener(n, reload));
  }, [eventKey, reload]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        console.error("Error al cargar datos", e);
        if (!cancelled) setError(withCode("No se pudieron cargar los datos. Probá de nuevo en unos minutos.", e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return { data, loading, error, reload };
}
