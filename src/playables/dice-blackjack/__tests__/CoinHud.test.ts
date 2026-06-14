import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCoins } from '../CoinHud';

test('formatCoins: small numbers render without separators', () => {
  assert.equal(formatCoins(0), '0');
  assert.equal(formatCoins(7), '7');
  assert.equal(formatCoins(80), '80');
  assert.equal(formatCoins(160), '160');
  assert.equal(formatCoins(320), '320');
  assert.equal(formatCoins(999), '999');
});

test('formatCoins: 4+ digit numbers use thousand separators', () => {
  assert.equal(formatCoins(1000), '1,000');
  assert.equal(formatCoins(1234), '1,234');
  assert.equal(formatCoins(12345), '12,345');
});

test('formatCoins: floors fractional values', () => {
  assert.equal(formatCoins(80.7), '80');
  assert.equal(formatCoins(1234.99), '1,234');
});

test('formatCoins: negative values clamp to 0', () => {
  // Coin counter should never display a negative — the drain animation passes
  // floats that briefly cross 0 due to easing overshoot.
  assert.equal(formatCoins(-5), '0');
  assert.equal(formatCoins(-0.1), '0');
});
