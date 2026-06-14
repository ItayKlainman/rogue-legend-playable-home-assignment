#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dist = path.resolve(__dirname, '..', 'dist');
const files = fs.readdirSync(dist).filter(f => f.endsWith('.html')).sort();
const latest = files[files.length - 1];
const html = fs.readFileSync(path.join(dist, latest), 'utf8');

// Find all base64 data URIs with surrounding context to identify the asset
const re = /data:(image\/[^;]+);base64,([A-Za-z0-9+/=]+)/g;
const assets = [];
let m;
while ((m = re.exec(html)) !== null) {
  const mime = m[1];
  const b64Len = m[2].length;
  const inBuildKB = b64Len / 1024;
  // Try to find a nearby filename hint
  const contextStart = Math.max(0, m.index - 200);
  const context = html.substring(contextStart, m.index);
  // Look for webpack module comment or variable name
  const nameMatch = context.match(/\/\*!?\s*([^\*]+)\*\//) || context.match(/["']([^"']+\.(?:webp|png|jpg|avif))["']/);
  const name = nameMatch ? nameMatch[1].trim() : '(unknown)';
  assets.push({ name, mime, inBuildKB });
}

assets.sort((a, b) => b.inBuildKB - a.inBuildKB);

console.log('| # | Asset | KB (in build) |');
console.log('|---|---|---|');
assets.forEach((a, i) => {
  console.log(`| ${i + 1} | ${a.name} | ${a.inBuildKB.toFixed(0)} |`);
});
