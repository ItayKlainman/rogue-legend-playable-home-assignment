import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../rng';

test('mulberry32 is deterministic for a given seed', () => {
  const a = mulberry32(123);
  const b = mulberry32(123);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test('mulberry32 returns floats in [0, 1)', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 100; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test('different seeds produce different sequences', () => {
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});
