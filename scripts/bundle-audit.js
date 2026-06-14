#!/usr/bin/env node
// Match every base64 data: URI in a built bundle to a file on disk under
// assets/. Anything in the bundle that isn't actually consumed at runtime is
// dead weight worth gating.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const bundle = process.argv[2];
if (!bundle) {
  console.error('Usage: node scripts/bundle-audit.js <path-to-html>');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'assets');

// Hash every disk asset.
const assetMap = new Map();
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(p);
    } else if (/\.(webp|png|mp3|wav|webm|avif|jpg|jpeg|atlas|json)$/i.test(ent.name)) {
      const buf = fs.readFileSync(p);
      const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
      assetMap.set(hash, { path: path.relative(root, p), size: buf.length });
    }
  }
}
walk(assetsDir);

const html = fs.readFileSync(bundle, 'utf8');
const re = /data:([^;]+);base64,([A-Za-z0-9+/=]+)/g;
const matched = [];
const unmatched = [];
let m;
while ((m = re.exec(html)) !== null) {
  const buf = Buffer.from(m[2], 'base64');
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
  const a = assetMap.get(hash);
  if (a) {
    matched.push({ size: buf.length, path: a.path });
  } else {
    unmatched.push({ size: buf.length, mime: m[1] });
  }
}

console.log(`Bundle: ${bundle} (${(fs.statSync(bundle).size / 1048576).toFixed(2)} MB)`);
console.log(`Matched: ${matched.length}, Unmatched: ${unmatched.length}`);
console.log();
console.log('=== Matched assets (sorted by size) ===');
matched.sort((a, b) => b.size - a.size).forEach(r => {
  console.log(`  ${(r.size / 1024).toFixed(1).padStart(7)} KB  ${r.path}`);
});
console.log();
console.log('=== Unmatched (transformed/synthetic) ===');
unmatched.sort((a, b) => b.size - a.size).forEach(r => {
  console.log(`  ${(r.size / 1024).toFixed(1).padStart(7)} KB  ${r.mime}`);
});
