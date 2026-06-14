#!/usr/bin/env node

/**
 * Resize a Spine atlas texture and proportionally scale all atlas coordinates.
 *
 * Usage:
 *   node scripts/resize-spine-atlas.js <atlas-path> <scale-factor>
 *
 * Example:
 *   node scripts/resize-spine-atlas.js assets/Spine/Main_Character.atlas 0.75
 *
 * This will:
 *   1. Read the .atlas and find the texture filename (first line of each page)
 *   2. Resize the corresponding .webp (and .png if present) by the scale factor
 *   3. Scale all numeric coordinates in the atlas (size, bounds, offsets)
 *   4. Overwrite the atlas and texture files in-place
 *
 * The skeleton JSON does NOT need changes — bone transforms are in skeleton-space.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const atlasPath = process.argv[2];
  const scale = parseFloat(process.argv[3]);

  if (!atlasPath || !scale || scale <= 0 || scale >= 1) {
    console.error('Usage: node scripts/resize-spine-atlas.js <atlas-path> <scale (0..1)>');
    process.exit(1);
  }

  const atlasDir = path.dirname(atlasPath);
  const atlasText = fs.readFileSync(atlasPath, 'utf8');
  const lines = atlasText.split('\n');

  const newLines = [];
  const textureFiles = []; // texture filenames referenced in the atlas

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Page header: texture filename (line ending in .png or .webp, no colon before it)
    if (/\.(png|webp|jpg)$/i.test(line.trim()) && !line.includes(':')) {
      textureFiles.push(line.trim());
      newLines.push(line);
      continue;
    }

    // size:W,H
    const sizeMatch = line.match(/^(size:)\s*(\d+)\s*,\s*(\d+)/);
    if (sizeMatch) {
      const w = Math.round(parseInt(sizeMatch[2]) * scale);
      const h = Math.round(parseInt(sizeMatch[3]) * scale);
      newLines.push(`size:${w},${h}`);
      continue;
    }

    // scale:N (atlas export scale — multiply by our resize factor)
    const scaleMatch = line.match(/^(scale:)\s*([\d.]+)/);
    if (scaleMatch) {
      const newScale = parseFloat(scaleMatch[2]) * scale;
      newLines.push(`scale:${newScale}`);
      continue;
    }

    // bounds:x,y,w,h
    const boundsMatch = line.match(/^(\s*bounds:)\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (boundsMatch) {
      const x = Math.round(parseInt(boundsMatch[2]) * scale);
      const y = Math.round(parseInt(boundsMatch[3]) * scale);
      const w = Math.round(parseInt(boundsMatch[4]) * scale);
      const h = Math.round(parseInt(boundsMatch[5]) * scale);
      newLines.push(`${boundsMatch[1]}${x},${y},${w},${h}`);
      continue;
    }

    // offsets:x,y,origW,origH
    const offsetsMatch = line.match(/^(\s*offsets:)\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (offsetsMatch) {
      const x = Math.round(parseInt(offsetsMatch[2]) * scale);
      const y = Math.round(parseInt(offsetsMatch[3]) * scale);
      const ow = Math.round(parseInt(offsetsMatch[4]) * scale);
      const oh = Math.round(parseInt(offsetsMatch[5]) * scale);
      newLines.push(`${offsetsMatch[1]}${x},${y},${ow},${oh}`);
      continue;
    }

    // Everything else passes through unchanged
    newLines.push(line);
  }

  // Resize texture files
  for (const texFile of textureFiles) {
    const baseName = texFile.replace(/\.(png|webp|jpg)$/i, '');

    // Resize .webp if it exists (read into buffer first to avoid read/write conflict)
    const webpPath = path.join(atlasDir, baseName + '.webp');
    if (fs.existsSync(webpPath)) {
      const srcBuf = fs.readFileSync(webpPath);
      const meta = await sharp(srcBuf).metadata();
      const newW = Math.round(meta.width * scale);
      const buf = await sharp(srcBuf).resize(newW).webp({ quality: 80 }).toBuffer();
      fs.writeFileSync(webpPath, buf);
      console.log(`  ${path.relative('.', webpPath)}: ${meta.width}x${meta.height} -> ${newW}x${Math.round(meta.height * scale)} (${(buf.length / 1024).toFixed(1)} KB)`);
    }

    // Resize .png if it exists (read into buffer first)
    const pngPath = path.join(atlasDir, baseName + '.png');
    if (fs.existsSync(pngPath)) {
      const srcBuf = fs.readFileSync(pngPath);
      const meta = await sharp(srcBuf).metadata();
      const newW = Math.round(meta.width * scale);
      const buf = await sharp(srcBuf).resize(newW).png().toBuffer();
      fs.writeFileSync(pngPath, buf);
      console.log(`  ${path.relative('.', pngPath)}: ${meta.width}x${meta.height} -> ${newW}x${Math.round(meta.height * scale)} (${(buf.length / 1024).toFixed(1)} KB)`);
    }
  }

  // Write updated atlas
  fs.writeFileSync(atlasPath, newLines.join('\n'), 'utf8');
  console.log(`  ${path.relative('.', atlasPath)}: coordinates scaled by ${scale}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
