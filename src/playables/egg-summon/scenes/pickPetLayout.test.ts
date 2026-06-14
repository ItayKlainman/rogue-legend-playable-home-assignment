import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPetTilePositions, pickPetTileSize, dimTargets } from './pickPetLayout.ts';

test('tile size is positive and scales down on narrow screens', () => {
  const wide = pickPetTileSize(1200, 2);
  const narrow = pickPetTileSize(360, 2);
  assert.ok(narrow > 0);
  assert.ok(narrow < wide);
});

test('two tiles are centred horizontally and share a y', () => {
  const pos = pickPetTilePositions(2, 400, 800);
  assert.equal(pos.length, 2);
  assert.ok(Math.abs((pos[0].x + pos[1].x) / 2 - 200) < 0.001);
  assert.ok(pos[0].x < pos[1].x);
  assert.equal(pos[0].y, pos[1].y);
});

test('dimTargets returns every index except the chosen one', () => {
  assert.deepEqual(dimTargets(0, 2), [1]);
  assert.deepEqual(dimTargets(1, 2), [0]);
});
