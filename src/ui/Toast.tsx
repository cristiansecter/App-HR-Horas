import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

interface ToastValue {
  notify: (message: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

export const useToast = (): ToastValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>.");
  return ctx;
};

/** Aviso corto abajo a la derecha. En la demo se usa para avisar que los cambios no se conservan. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const notify = useCallback((text: string) => {
    setMessage(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 3500);
  }, []);
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? (
        <div role="status" className="fixed right-6 bottom-6 z-[90] flex max-w-sm items-center gap-3 rounded-xl bg-surface-container-high p-4 text-on-surface shadow-xl">
          <span className="material-symbols-outlined text-primary">task_alt</span>
          <span className="font-body-md text-body-md">{message}</span>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
};
