import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barSegmentRects } from './rarityBarLayout.ts';

test('returns one rect per segment', () => {
  assert.equal(barSegmentRects(200, 16, 5, 4).length, 5);
});

test('segments are left-to-right, non-overlapping, inside the width', () => {
  const r = barSegmentRects(200, 16, 5, 4);
  assert.ok(r[0].x >= 0);
  for (let i = 1; i < r.length; i++) {
    assert.ok(r[i].x >= r[i - 1].x + r[i - 1].w); // no overlap, ascending
  }
  const last = r[r.length - 1];
  assert.ok(last.x + last.w <= 200 + 0.001);
});

test('all segments share width and height', () => {
  const r = barSegmentRects(200, 16, 5, 4);
  for (const s of r) { assert.ok(Math.abs(s.w - r[0].w) < 0.001); assert.equal(s.h, 16); }
});
