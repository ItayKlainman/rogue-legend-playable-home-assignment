import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  damageNumberStyle, damageStackOffsetY, DAMAGE_BASE_SIZE, DAMAGE_CRIT_SCALE,
} from './damageNumberStyle.ts';

test('normal hit keeps the given colour, base size, scale 1', () => {
  const s = damageNumberStyle({ color: 0x44aaff });
  assert.equal(s.fontSize, DAMAGE_BASE_SIZE);
  assert.equal(s.fill, 0x44aaff);
  assert.equal(s.scale, 1);
});

test('crit recolours to gold, larger scale, thicker stroke', () => {
  const s = damageNumberStyle({ color: 0x44aaff, crit: true });
  assert.equal(s.scale, DAMAGE_CRIT_SCALE);
  assert.notEqual(s.fill, 0x44aaff);
  assert.ok(s.strokeWidth >= 6);
});

test('missing colour defaults to white', () => {
  assert.equal(damageNumberStyle({}).fill, 0xffffff);
});

test('stack offset rises with active count then caps at MAX_STACK', () => {
  const a = damageStackOffsetY(0);
  const b = damageStackOffsetY(1);
  assert.ok(b < a);
  assert.equal(damageStackOffsetY(5), damageStackOffsetY(2));
});
