import fontUrl from 'assets/Fonts/LilitaOne-Regular.ttf';

// Damage-number font: Lilita One (Google Fonts, OFL). Bundled inline (base64
// data URL) and registered via the FontFace API, exactly like the Titan One
// game font in gameFont.ts.
export const DAMAGE_FONT = 'Lilita One';
export const DAMAGE_FONT_STACK = `"${DAMAGE_FONT}", Arial, sans-serif`;

let loadPromise: Promise<void> | null = null;

/** Load + register the damage font. Idempotent. Await before rendering fight
 *  text so PIXI measures glyphs with the real font. */
export function loadDamageFont(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    if (typeof FontFace === 'undefined' || !document.fonts) return;
    try {
      const face = new FontFace(DAMAGE_FONT, `url(${fontUrl})`);
      await face.load();
      document.fonts.add(face);
    } catch (e) {
      if (__DEV__) console.warn('[damageFont] load failed', e);
    }
  })();
  return loadPromise;
}
