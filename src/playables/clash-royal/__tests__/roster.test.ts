import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER, skillById } from '../roster';

test('every roster skill id resolves to a roster skill', () => {
  for (const s of ROSTER) {
    assert.ok(skillById(s.id), `no roster skill for ${s.id}`);
  }
});

test('heal is the only self-target skill', () => {
  const selfs = ROSTER.filter(s => s.target === 'self');
  assert.deepEqual(selfs.map(s => s.id), ['heal']);
});

test('each enemy skill maps to one of the 3 forked vfx ids', () => {
  const ok = new Set(['shurikenFlurry', 'fireballBarrage', 'chainLightning']);
  for (const s of ROSTER.filter(s => s.target === 'enemy')) {
    assert.ok(ok.has(s.vfxId), `${s.id} -> ${s.vfxId}`);
  }
});
