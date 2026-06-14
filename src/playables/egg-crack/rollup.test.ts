import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CRACK_TIERS, rarityForTap, flickerSequence } from './rollup.ts';

test('there are exactly five crack tiers in ascending order', () => {
  assert.deepEqual(CRACK_TIERS, ['common', 'rare', 'epic', 'legendary', 'mythic']);
});

test('rarityForTap maps tap index to its tier, mythic at tap 5 (index 4)', () => {
  assert.equal(rarityForTap(0), 'common');
  assert.equal(rarityForTap(4), 'mythic');
  // monotonic up the ladder
  for (let i = 1; i < 5; i++) {
    assert.ok(CRACK_TIERS.indexOf(rarityForTap(i)) > CRACK_TIERS.indexOf(rarityForTap(i - 1)));
  }
});

test('flickerSequence is non-empty and always ends on the settled tier', () => {
  for (let i = 0; i < 5; i++) {
    const seq = flickerSequence(i);
    assert.ok(seq.length >= 1);
    assert.equal(seq[seq.length - 1], rarityForTap(i));
  }
});

test('flicker tiers never exceed the settled tier (upward suspense only)', () => {
  const seq = flickerSequence(2); // settles on epic
  const cap = CRACK_TIERS.indexOf('epic');
  for (const t of seq) assert.ok(CRACK_TIERS.indexOf(t) <= cap);
});
