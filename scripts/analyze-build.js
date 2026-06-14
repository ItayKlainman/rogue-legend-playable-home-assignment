#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Find latest build
const dist = path.resolve(__dirname, '..', 'dist');
const files = fs.readdirSync(dist).filter(f => f.endsWith('.html')).sort();
const latest = files[files.length - 1];
const html = fs.readFileSync(path.join(dist, latest), 'utf8');
const totalHTML = Buffer.byteLength(html, 'utf8');

console.log(`Build: ${latest} (${(totalHTML / 1048576).toFixed(2)} MB)\n`);

// Find all base64 data URIs
const re = /data:([^;]+);base64,([A-Za-z0-9+/=]+)/g;
const byType = {};
let m;
while ((m = re.exec(html)) !== null) {
  const mime = m[1];
  const b64Len = m[2].length;
  const rawBytes = Math.floor(b64Len * 3 / 4);
  if (!byType[mime]) byType[mime] = { count: 0, rawBytes: 0, b64Bytes: 0 };
  byType[mime].count++;
  byType[mime].rawBytes += rawBytes;
  byType[mime].b64Bytes += b64Len;
}

const entries = Object.entries(byType).sort((a, b) => b[1].b64Bytes - a[1].b64Bytes);
let totalB64 = 0;

console.log('| Category | In-Build KB | % | Files |');
console.log('|---|---|---|---|');
for (const [mime, info] of entries) {
  const inBuildKB = (info.b64Bytes / 1024).toFixed(0);
  const pct = (info.b64Bytes / totalHTML * 100).toFixed(1);
  totalB64 += info.b64Bytes;
  console.log(`| ${mime} | ${inBuildKB} | ${pct}% | ${info.count} |`);
}
const codeBytes = totalHTML - totalB64;
console.log(`| Code + libs | ${(codeBytes / 1024).toFixed(0)} | ${(codeBytes / totalHTML * 100).toFixed(1)}% | - |`);
console.log(`| **TOTAL** | **${(totalHTML / 1024).toFixed(0)}** | **100%** | - |`);
