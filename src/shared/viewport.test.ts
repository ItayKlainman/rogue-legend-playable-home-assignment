import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readViewport, installViewportListener } from './viewport.ts';

function withWindow(win: unknown, fn: () => void): void {
  const g = globalThis as { window?: unknown };
  const prev = g.window;
  g.window = win;
  try { fn(); } finally { g.window = prev; }
}

test('readViewport prefers visualViewport (rounded)', () => {
  withWindow({ innerWidth: 999, innerHeight: 999, visualViewport: { width: 410.6, height: 880.2 } }, () => {
    assert.deepEqual(readViewport(), { width: 411, height: 880 });
  });
});

test('readViewport falls back to innerWidth/innerHeight when no visualViewport', () => {
  withWindow({ innerWidth: 414, innerHeight: 896, visualViewport: undefined }, () => {
    assert.deepEqual(readViewport(), { width: 414, height: 896 });
  });
});

test('readViewport returns zeros outside the DOM', () => {
  withWindow(undefined, () => {
    assert.deepEqual(readViewport(), { width: 0, height: 0 });
  });
});

test('installViewportListener registers, fires onChange, and cleans up', () => {
  const events: Record<string, Array<() => void>> = {};
  const win = {
    innerWidth: 800, innerHeight: 400, visualViewport: undefined,
    addEventListener: (t: string, h: () => void) => { (events[t] ||= []).push(h); },
    removeEventListener: (t: string, h: () => void) => { events[t] = (events[t] || []).filter((x) => x !== h); },
  };
  withWindow(win, () => {
    let got: { w: number; h: number } | null = null;
    const cleanup = installViewportListener((w, h) => { got = { w, h }; });
    assert.equal(events['resize']?.length, 1);
    assert.equal(events['orientationchange']?.length, 1);
    events['resize'][0]();                         // simulate a resize event
    assert.deepEqual(got, { w: 800, h: 400 });
    cleanup();
    assert.equal(events['resize'].length, 0);
    assert.equal(events['orientationchange'].length, 0);
  });
});
