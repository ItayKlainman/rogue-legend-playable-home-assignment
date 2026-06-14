#!/usr/bin/env node
// Guard against a recurring PIXI v8 bug across playables/ads:
//
//   import bgData from 'assets/UI/foo.webp';
//   const s = new Sprite(Texture.from(bgData));   // ← renders NOTHING (white/blank)
//
// In PIXI v8, `Texture.from(<an imported asset URL>)` returns an UN-LOADED texture
// (the image hasn't decoded), so the Sprite draws blank — only Text shows. The fix
// is always to `await Assets.load(url)` first and build the Sprite from the loaded
// Texture (see LoadBar.ts / BlackjackScene.ts, or any widget's `preload()`).
//
// This scans playable + shared source for `Texture.from(<binding>)` where <binding>
// is imported from an asset module (a .webp/.png/.jpg/.svg/.json file or an `assets/`
// path). `Texture.from(canvas)` / `Texture.from(someRuntimeSource)` are NOT flagged.
//
// Exit 1 (with file:line) if any offender is found; exit 0 if clean.
// Wired as `npm run check:textures`.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['src/playables', 'src/shared'];
const ASSET_IMPORT = /\.(webp|png|jpe?g|svg|gif|json)$/i;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full, out);
    } else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Collect `import <binding> from '<assetPath>'` bindings (default imports of asset modules).
function assetBindings(src) {
  const bindings = new Set();
  const re = /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const [, binding, source] = m;
    if (ASSET_IMPORT.test(source) || source.includes('assets/')) bindings.add(binding);
  }
  return bindings;
}

const offenders = [];
const files = [];
for (const d of SCAN_DIRS) {
  const abs = path.join(ROOT, d);
  if (fs.existsSync(abs)) walk(abs, files);
}

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('Texture.from')) continue;
  const bindings = assetBindings(src);
  if (bindings.size === 0) continue;
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    // strip line comments so the warning banners we add don't self-trip the guard
    const code = line.replace(/\/\/.*$/, '');
    for (const b of bindings) {
      // \bTexture\.from(... <binding> ...) — \b before Texture excludes SpineTexture.from
      const re = new RegExp(`\\bTexture\\.from\\s*\\([^)]*\\b${b}\\b`);
      if (re.test(code)) {
        offenders.push({ file: path.relative(ROOT, file), line: i + 1, binding: b, text: line.trim() });
      }
    }
  });
}

if (offenders.length) {
  console.error('✗ check:textures — Sprite built from an UN-LOADED asset via Texture.from(importedUrl).');
  console.error('  In PIXI v8 this renders blank/white. Await Assets.load(url) and build the Sprite');
  console.error('  from the loaded Texture instead (see any widget preload() or LoadBar.ts).\n');
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}  Texture.from(${o.binding})`);
    console.error(`      ${o.text}`);
  }
  console.error(`\n${offenders.length} offender(s).`);
  process.exit(1);
}

console.log(`✓ check:textures — scanned ${files.length} files, no Texture.from(<imported asset>) found.`);
process.exit(0);
