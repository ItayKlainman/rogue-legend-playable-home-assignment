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
