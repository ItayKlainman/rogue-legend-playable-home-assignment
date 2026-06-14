const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseMeta, metaHash, unityBorderToObj } = require('./meta');

const fx = (n) => path.join(__dirname, '__fixtures__', n);

test('parseMeta extracts fields from a texture meta', () => {
  const m = parseMeta(fx('good.png.meta'));
  assert.equal(m.ok, true);
  assert.equal(m.guid, '8495447710d7c403b9d4137aee9b7d49');
  assert.deepEqual(m.spriteBorder, { x: 34, y: 53, z: 34, w: 36 });
  assert.equal(m.spriteMode, 1);
});

test('unityBorderToObj maps x,y,z,w to left,bottom,right,top', () => {
  assert.deepEqual(unityBorderToObj({ x: 34, y: 53, z: 34, w: 36 }), { left: 34, bottom: 53, right: 34, top: 36 });
  assert.equal(unityBorderToObj(null), null);
});

test('parseMeta returns ok:false on unparseable meta (never throws)', () => {
  const m = parseMeta(fx('bad.png.meta'));
  assert.equal(m.ok, false);
  assert.ok(m.error);
});

test('metaHash is stable and excludes guid', () => {
  const m = parseMeta(fx('good.png.meta'));
  const h1 = metaHash(m);
  const h2 = metaHash({ ...m, guid: 'COMPLETELY-DIFFERENT-GUID' });
  assert.equal(h1, h2); // guid must not affect the hash
  assert.match(h1, /^[0-9a-f]{64}$/);
});
