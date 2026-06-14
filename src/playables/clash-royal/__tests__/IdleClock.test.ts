import { test } from 'node:test'; import assert from 'node:assert/strict';
import { IdleClock } from '../combat/IdleClock';
test('does not fire before begin()', () => {
  const c = new IdleClock({ idleMs: 7000 }); assert.equal(c.step(10000, true), false);
});
test('fires once idleMs elapse after begin, only when a pick is available', () => {
  const c = new IdleClock({ idleMs: 7000 }); c.begin();
  assert.equal(c.step(6999, true), false);
  assert.equal(c.step(1, false), false);
  assert.equal(c.step(1, true), true);
});
test('resets on notePick and re-arms', () => {
  const c = new IdleClock({ idleMs: 7000 }); c.begin();
  c.step(5000, true); c.notePick();
  assert.equal(c.step(6999, true), false);
  assert.equal(c.step(1, true), true);
});
