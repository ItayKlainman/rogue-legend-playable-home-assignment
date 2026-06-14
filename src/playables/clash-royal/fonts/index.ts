// Font registration for the clash-royal playable. Mirrors dice-blackjack's
// pattern (BlackjackScene.ts:1769-1794 + `import './fonts/fonts.css'`):
//   1. The CSS import registers the @font-face (webpack inlines the woff2 as a
//      base64 data URI, keeping the playable a single self-contained HTML file).
//   2. ensureGameFontsLoaded() awaits document.fonts.load so the first PixiJS
//      Text isn't drawn (and glyph-atlas-cached) with the fallback font before
//      the woff2 has parsed — otherwise the real font never shows for the session.
import './fonts.css';

// The canonical clash-royal display stack. Luckiest Guy is the chunky impact
// face; the Impact / Arial Black tail is a graceful fallback if the woff2 fetch
// fails (e.g. CSP / offline) so a Text still renders something heavy.
export const GAME_FONT_STACK = '"Luckiest Guy", Impact, "Arial Black", sans-serif';

let fontsReady: Promise<void> | null = null;

/**
 * Resolve once the bundled Luckiest Guy webfont has been parsed by the browser.
 * Memoised (one fetch per session) and never throws: on a browser without the
 * FontFace API, or if the woff2 fetch fails, it resolves anyway and Pixi falls
 * through to the Impact/Arial-Black tail of GAME_FONT_STACK.
 */
export function ensureGameFontsLoaded(): Promise<void> {
  if (fontsReady) return fontsReady;
  if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) {
    fontsReady = Promise.resolve();
    return fontsReady;
  }
  fontsReady = document.fonts
    .load('40px "Luckiest Guy"')
    .then(() => undefined)
    .catch(() => undefined);
  return fontsReady;
}
