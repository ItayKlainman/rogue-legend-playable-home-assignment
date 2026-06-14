import fontUrl from 'assets/Fonts/TitanOne-Regular.ttf';

// The real PocketRoll UI font: Titan One (Assets/Graphics/Fonts/Titan_One).
// Bundled inline (base64 data URL) and registered via the FontFace API.
export const GAME_FONT = 'Titan One';
// Use with a fallback so text still renders if the face hasn't resolved yet.
export const GAME_FONT_STACK = `${GAME_FONT}, Arial, sans-serif`;

let loadPromise: Promise<void> | null = null;

/** Load + register the game font. Idempotent. Await before rendering text so
 *  PIXI measures glyphs with the real font (PIXI won't reflow text if the font
 *  arrives after the Text is built). */
export function loadGameFont(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    if (typeof FontFace === 'undefined' || !document.fonts) return;
    try {
      const face = new FontFace(GAME_FONT, `url(${fontUrl})`);
      await face.load();
      document.fonts.add(face);
    } catch (e) {
      if (__DEV__) console.warn('[gameFont] load failed', e);
    }
  })();
  return loadPromise;
}
