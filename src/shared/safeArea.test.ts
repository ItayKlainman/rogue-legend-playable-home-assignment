import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitViewport, DESIGN_W, DESIGN_H } from './safeArea.ts';

test('design-size viewport: scale 1, no offset, fill = design', () => {
  const f = fitViewport(DESIGN_W, DESIGN_H);
  assert.equal(f.scale, 1);
  assert.ok(Math.abs(f.offsetX) < 0.001);
  assert.ok(Math.abs(f.offsetY) < 0.001);
  assert.ok(Math.abs(f.fillX) < 0.001);
  assert.ok(Math.abs(f.fillY) < 0.001);
  assert.ok(Math.abs(f.fillW - DESIGN_W) < 0.001);
  assert.ok(Math.abs(f.fillH - DESIGN_H) < 0.001);
});

test('same-aspect phone scales uniformly with no margins', () => {
  const f = fitViewport(207, 448);                 // exactly half of 414x896
  assert.ok(Math.abs(f.scale - 0.5) < 0.001);
  assert.ok(Math.abs(f.offsetX) < 0.001);
  assert.ok(Math.abs(f.offsetY) < 0.001);
});

test('iPad-pro-ish (wider than phone) is height-limited: horizontal margins, none vertical', () => {
  const f = fitViewport(1024, 1366);               // 0.75 > design 0.46 → height-limited
  assert.ok(Math.abs(f.scale - 1366 / DESIGN_H) < 0.001);
  assert.ok(f.offsetX > 0);                         // centred with side margins
  assert.ok(Math.abs(f.offsetY) < 0.001);           // no vertical margin
  assert.ok(f.fillX < 0);
  assert.ok(f.fillW > DESIGN_W);
  assert.ok(Math.abs(f.fillH - DESIGN_H) < 0.001);
});

test('landscape is height-limited with a large horizontal fill', () => {
  const f = fitViewport(1280, 720);
  assert.ok(Math.abs(f.scale - 720 / DESIGN_H) < 0.001);
  assert.ok(f.fillW > DESIGN_W * 2);
  assert.ok(f.fillX < -DESIGN_W * 0.5);
});
