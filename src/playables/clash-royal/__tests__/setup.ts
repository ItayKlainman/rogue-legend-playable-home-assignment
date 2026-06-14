// Test setup: PixiJS's Ticker uses requestAnimationFrame, which Node doesn't
// provide. Install a setTimeout-based polyfill on globalThis so Ticker works.
// Imported via --import flag in run.mjs so it loads before any test file.

const g = globalThis as unknown as {
  requestAnimationFrame?: (cb: (t: number) => void) => number;
  cancelAnimationFrame?: (id: number) => void;
};

if (typeof g.requestAnimationFrame !== 'function') {
  g.requestAnimationFrame = (cb: (t: number) => void): number => {
    const id = setTimeout(() => cb(performance.now()), 16);
    return id as unknown as number;
  };
}

if (typeof g.cancelAnimationFrame !== 'function') {
  g.cancelAnimationFrame = (id: number): void => {
    clearTimeout(id as unknown as NodeJS.Timeout);
  };
}

// `__DEV__` is a webpack DefinePlugin global (declared in src/declarations.d.ts as a
// runtime constant). In the bare Node test runner it has no binding — referencing it
// throws ReferenceError. Mission I-v2 introduces __DEV__-gated runtime logs in
// CombatController/CombatFx; declare it false here so the logs are tree-shaken-out
// at test time (matching production behaviour). Tests never assert on the logs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (g as any).__DEV__ === 'undefined') (g as any).__DEV__ = false;

// sfx.ts imports binary MP3 assets (which webpack turns into data-URL strings)
// and @smoud/playable-sdk (which accesses window/document at module-init time).
// Neither is compatible with the bare Node test runner. Inject a no-op mock into
// the CJS module cache BEFORE any test file loads so all `import { sfx } from
// '.../audio/sfx'` transitive chains resolve to an inert stub. All sfx calls are
// silently swallowed — the `userHasInteracted` gate would already silence them
// in a real browser, so no test observable behaviour changes.
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sfxAbsPath = resolve(__dirname, '../audio/sfx.ts');

// Build a no-op sfx proxy: every property of `sfx` is a no-op function.
const noop = () => {};
const sfxMock = new Proxy({}, { get: () => noop });

// Inject into the CJS module cache under the resolved path. tsx registers the
// .ts extension so the same path key is used for both `.ts` and the compiled
// output — injecting here intercepts the require() call before tsx can try to
// load+compile the file (which would trigger the binary MP3 import).
const req = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache: Record<string, any> = (req as any).cache ?? {};
if (!cache[sfxAbsPath]) {
  cache[sfxAbsPath] = {
    id: sfxAbsPath,
    filename: sfxAbsPath,
    loaded: true,
    exports: { sfx: sfxMock },
    children: [],
    paths: [],
    require: req,
    parent: null,
    path: dirname(sfxAbsPath),
    isPreloading: false,
  };
}
