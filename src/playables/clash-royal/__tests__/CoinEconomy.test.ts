import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoinEconomy } from '../combat/CoinEconomy';

const cfg = { start: 1, regen: 2.0, max: 24 };

test('starts at start coins', () => {
  const e = new CoinEconomy(cfg);
  assert.equal(Math.floor(e.coins), 1);
});

test('tick adds regenRate * dt seconds', () => {
  const e = new CoinEconomy(cfg);
  e.tick(1000); // 1s @ 2/s
  assert.equal(Math.round(e.coins), 3); // 1 + 2
});

test('coins clamp at max', () => {
  const e = new CoinEconomy(cfg);
  e.tick(100000);
  assert.equal(e.coins, 24);
});

test('canAfford and spend', () => {
  const e = new CoinEconomy(cfg);
  e.tick(2000); // ~5 coins
  assert.equal(e.canAfford(5), true);
  assert.equal(e.spend(5), true);
  assert.ok(e.coins < 1.0);
  assert.equal(e.canAfford(5), false);
  assert.equal(e.spend(5), false); // rejected, never negative
  assert.ok(e.coins >= 0);
});

test('setRegenRate changes the ramp', () => {
  const e = new CoinEconomy(cfg);
  e.setRegenRate(4.0);
  e.tick(1000);
  assert.equal(Math.round(e.coins), 5); // 1 + 4
});

test('emits change on tick and spend', () => {
  const seen: number[] = [];
  const e = new CoinEconomy(cfg, (coins) => seen.push(coins));
  e.tick(1000);
  e.spend(2);
  assert.ok(seen.length >= 2);
});
