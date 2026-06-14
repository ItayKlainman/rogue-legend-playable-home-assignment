// Shared viewport helper. Reads the TRUE viewport (visualViewport-aware, so we don't
// render behind iOS browser chrome) and reacts to orientation / chrome changes the
// SDK resize can miss. Lifted from clash-royal's CombatDirector pattern so board-fight
// and clash-royal share one responsive logic. readViewport() reads globals only (no
// asset imports) → unit-testable under `node --test`.

export interface Viewport { width: number; height: number; }

/** True viewport size; prefers visualViewport, falls back to innerWidth/Height.
 *  Returns zeros in non-DOM (test/SSR) contexts. */
export function readViewport(): Viewport {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  const vv = window.visualViewport;
  return {
    width: vv ? Math.round(vv.width) : window.innerWidth,
    height: vv ? Math.round(vv.height) : window.innerHeight,
  };
}

/** Call `onChange(width, height)` on resize / orientationchange / visualViewport resize.
 *  Returns a cleanup that removes every listener. No-op outside the DOM. */
export function installViewportListener(onChange: (width: number, height: number) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (): void => { const { width, height } = readViewport(); onChange(width, height); };
  window.addEventListener('resize', handler);
  window.addEventListener('orientationchange', handler);
  window.visualViewport?.addEventListener('resize', handler);
  return () => {
    window.removeEventListener('resize', handler);
    window.removeEventListener('orientationchange', handler);
    window.visualViewport?.removeEventListener('resize', handler);
  };
}
