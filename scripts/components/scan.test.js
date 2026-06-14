const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { loadGrammar } = require('./grammar');
const { scanComponents } = require('./scan');

const grammar = loadGrammar(path.join(__dirname, '..', '..', 'Components', '_index', 'grammar.json'));

async function makePng(p, { opaque = false } = {}) {
  const alpha = opaque ? 255 : 0;
  await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 1, g: 2, b: 3, alpha } } })
    .png().toFile(p);
}
const META = (guid, border) =>
  `fileFormatVersion: 2\nguid: ${guid}\nTextureImporter:\n  spriteMode: 1\n  spriteBorder: {x: ${border}, y: ${border}, z: ${border}, w: ${border}}\n`;

test('scan pairs, probes, and classifies a small tree', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
  const cat = path.join(root, 'Button');
  fs.mkdirSync(cat, { recursive: true });

  await makePng(path.join(cat, 'Button_Main_01_Large_Background_Blue.png'));
  fs.writeFileSync(path.join(cat, 'Button_Main_01_Large_Background_Blue.png.meta'), META('aaa', 10));

  await makePng(path.join(cat, 'Orphan.png'));

  fs.writeFileSync(path.join(cat, 'Empty.png'), '');
  fs.writeFileSync(path.join(cat, 'Empty.png.meta'), META('bbb', 0));

  const res = await scanComponents(root, grammar);
  const byName = Object.fromEntries(res.components.map((c) => [c.name, c]));

  assert.equal(byName['Button_Main_01_Large_Background_Blue'].severity, 'ok');
  assert.deepEqual(byName['Button_Main_01_Large_Background_Blue'].border, { left: 10, bottom: 10, right: 10, top: 10 });
  assert.equal(byName['Button_Main_01_Large_Background_Blue'].sliceable, true);

  assert.equal(byName['Orphan'].severity, 'blocking');
  assert.ok(byName['Orphan'].issues.some((i) => i.type === 'missing-meta'));

  assert.equal(byName['Empty'].severity, 'blocking');
  assert.ok(byName['Empty'].issues.some((i) => i.type === 'zero-byte'));
});

test('scan flags duplicate vs borders-differ via (pngHash, metaHash) tuple', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
  const cat = path.join(root, 'Icon');
  fs.mkdirSync(cat, { recursive: true });

  await makePng(path.join(cat, 'Icon_Picto_A.png'), { opaque: true });
  fs.copyFileSync(path.join(cat, 'Icon_Picto_A.png'), path.join(cat, 'Icon_Picto_B.png'));
  fs.writeFileSync(path.join(cat, 'Icon_Picto_A.png.meta'), META('g1', 5));
  fs.writeFileSync(path.join(cat, 'Icon_Picto_B.png.meta'), META('g2', 5));

  fs.copyFileSync(path.join(cat, 'Icon_Picto_A.png'), path.join(cat, 'Icon_Picto_C.png'));
  fs.writeFileSync(path.join(cat, 'Icon_Picto_C.png.meta'), META('g3', 9));

  const res = await scanComponents(root, grammar);
  const byName = Object.fromEntries(res.components.map((c) => [c.name, c]));
  const types = (n) => byName[n].issues.map((i) => i.type);

  assert.ok(types('Icon_Picto_A').includes('duplicate'));
  assert.ok(types('Icon_Picto_B').includes('duplicate'));
  assert.ok(types('Icon_Picto_A').includes('borders-differ'));
  assert.ok(types('Icon_Picto_B').includes('borders-differ'));
  assert.ok(types('Icon_Picto_C').includes('borders-differ'));
  assert.ok(!types('Icon_Picto_C').includes('duplicate'));
});

test('effectiveAlpha is false for a fully-opaque RGBA png (no-alpha advisory)', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
  const cat = path.join(root, 'Icon');
  fs.mkdirSync(cat, { recursive: true });
  await makePng(path.join(cat, 'Icon_Picto_Opaque.png'), { opaque: true });
  fs.writeFileSync(path.join(cat, 'Icon_Picto_Opaque.png.meta'), META('g9', 0));
  const res = await scanComponents(root, grammar);
  const c = res.components.find((x) => x.name === 'Icon_Picto_Opaque');
  assert.equal(c.effectiveAlpha, false);
  assert.ok(c.issues.some((i) => i.type === 'no-alpha'));
});
