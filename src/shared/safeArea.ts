// Pure layout math for presenting a fixed phone DESIGN canvas on any viewport:
// scale it uniformly to fit (contain), centre it, and report the visible region
// in design space so backgrounds can fill the margins. This keeps the content
// pixel-identical to the phone layout (just scaled) on iPad/landscape/etc.
// NO imports → unit-testable under `node --test`.

/** Reference phone design size the scenes are authored against (≈ iPhone XR). */
export const DESIGN_W = 414;
export const DESIGN_H = 896;

export interface ViewportFit {
  /** Uniform scale applied to the design `world` container. */
  scale: number;
  /** World container position (centres the scaled design in the viewport). */
  offsetX: number;
  offsetY: number;
  /** Visible viewport, expressed in design-space coords, so a full-screen
   *  background drawn at `(fillX, fillY, fillW, fillH)` covers the margins. */
  fillX: number;
  fillY: number;
  fillW: number;
  fillH: number;
}

/** Fit the design canvas into the viewport (contain + centre). */
export function fitViewport(viewportW: number, viewportH: number, designW = DESIGN_W, designH = DESIGN_H): ViewportFit {
  const scale = Math.min(viewportW / designW, viewportH / designH);
  const offsetX = (viewportW - designW * scale) / 2;
  const offsetY = (viewportH - designH * scale) / 2;
  return {
    scale,
    offsetX,
    offsetY,
    fillX: -offsetX / scale,
    fillY: -offsetY / scale,
    fillW: viewportW / scale,
    fillH: viewportH / scale,
  };
}
