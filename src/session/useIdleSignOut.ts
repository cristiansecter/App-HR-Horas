import { useEffect } from "react";

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const;

/**
 * Llama a `onIdle` cuando pasan `minutes` minutos sin que la persona toque el mouse, el teclado o la pantalla.
 * Compara contra la hora real, así que si la computadora estuvo suspendida también se dispara al volver.
 */
export function useIdleSignOut(active: boolean, minutes: number, onIdle: () => void): void {
  useEffect(() => {
    if (!active) return;
    let last = Date.now();
    const mark = () => {
      last = Date.now();
    };
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, mark, { passive: true });
    const timer = window.setInterval(() => {
      if (Date.now() - last >= minutes * 60_000) onIdle();
    }, 15_000);
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, mark);
      window.clearInterval(timer);
    };
  }, [active, minutes, onIdle]);
}
