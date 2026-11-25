import { nextPref, PREF_ICONS, PREF_LABELS, useColorPref } from "./colorMode";

/** Botón del encabezado: cambia entre automático, claro y oscuro. */
export function ColorModeButton() {
  const [pref, setPref] = useColorPref();
  const next = nextPref(pref);
  return (
    <button
      type="button"
      onClick={() => setPref(next)}
      title={`Modo de color: ${PREF_LABELS[pref].toLowerCase()}. Tocá para pasar a ${PREF_LABELS[next].toLowerCase()}.`}
      aria-label={`Modo de color: ${PREF_LABELS[pref].toLowerCase()}. Cambiar a ${PREF_LABELS[next].toLowerCase()}`}
      className="flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
    >
      <span className="material-symbols-outlined text-[20px]">{PREF_ICONS[pref]}</span>
    </button>
  );
}
