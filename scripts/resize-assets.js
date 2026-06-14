#!/usr/bin/env node
/**
 * resize-assets.js — Resize images to reduce bundle size.
 * For Spine atlases, also scales .atlas coordinates proportionally.
 * Originals are overwritten (originals exist in pocketroll/ Unity project).
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Disable sharp's internal cache to release file handles immediately (Windows)
sharp.cache(false);

const ASSETS = path.resolve(__dirname, '..', 'assets');

// [file, scaleFactor] — scale 0.5 = halve dimensions
const RESIZE_TARGETS = [
  // Backgrounds — board images are 3000x3000; 1500x1500 is plenty for mobile
  // NOTE: BoardConfig.ts tile coords and boardScale are calibrated for 1500x1500.
  //       If re-running from original JPGs, also update BoardConfig + Board.ts constants.
  ['Backgrounds/Board1Asset.webp', 0.5],          // 3000x3000 → 1500x1500
  ['Backgrounds/Board2Asset.webp', 0.5],          // 3000x3000 → 1500x1500
  ['Backgrounds/Board3Asset.webp', 0.5],          // 3000x3000 → 1500x1500
  ['Backgrounds/Board4Asset.webp', 0.4167],       // 6000x6000 → 2500x2500
  ['Backgrounds/Board5Asset.webp', 0.25],         // 6000x6000 → 1500x1500
  ['Backgrounds/Board6Asset.webp', 0.25],         // 6000x6000 → 1500x1500
  ['Backgrounds/Board7Asset.webp', 0.25],         // 6000x6000 → 1500x1500

  // Splash — fullscreen, stretched to fit
  ['Splash/splash screen 1.webp', 0.25],          // 2105x4677 → 526x1169
  // ['Splash/splash screen 2.webp', 0.25],       // already done: 526x1169

  // VFX spritesheets — rendered small on screen (already done)
  // ['VFX/LightningBurst_1.webp', 0.33],         // done: 1014x507
  // ['VFX/Flame_3_loop_SpriteSheet.webp', 0.5],  // done: 1024x512
  // ['VFX/Electricity_Splash_2_SpriteSheet.webp', 0.5], // done: 1024x512
  // ['VFX/lazer_yellow_SpriteSheet.webp', 0.5],  // done: 1024x1024
  // ['VFX/explosion_5_SpriteSheet.webp', 0.5],   // done: 1024x512
  // ['VFX/Hit_1_normal_SpriteSheet.webp', 0.5],  // done: 1024x512
  // ['VFX/Fireball_2_loop_SpriteSheet.webp', 0.5], // done: 512x512

  // UI — rendered at small sizes (already done)
  // ['UI/highlight_4.webp', 0.33],               // done: 480x455
  // ['UI/LOGO_rogue legend_.webp', 0.5],         // done: 909x440
];

// Spine atlas files that need coordinate scaling
const SPINE_ATLAS_SCALES = {
  'Spine/Skeleton_King.webp': 'Spine/Skeleton_King.atlas',
  'Spine/Slime.webp': 'Spine/Slime.atlas',
  'Spine/Skeleton_Warrior.webp': 'Spine/Skeleton_Warrior.atlas',
};

function scaleAtlas(atlasPath, scale) {
  const raw = fs.readFileSync(atlasPath, 'utf8');
  const lines = raw.split('\n');
  const out = [];

  for (const line of lines) {
    // size: width,height
    const sizeMatch = line.match(/^size:\s*(\d+)\s*,\s*(\d+)/);
    if (sizeMatch) {
      const w = Math.round(parseInt(sizeMatch[1]) * scale);
      const h = Math.round(parseInt(sizeMatch[2]) * scale);
      out.push(`size: ${w}, ${h}`);
      continue;
    }

    // xy: x, y
    const xyMatch = line.match(/^  xy:\s*(\d+)\s*,\s*(\d+)/);
    if (xyMatch) {
      const x = Math.round(parseInt(xyMatch[1]) * scale);
      const y = Math.round(parseInt(xyMatch[2]) * scale);
      out.push(`  xy: ${x}, ${y}`);
      continue;
    }

    // size: w, h (region size — indented)
    const regionSizeMatch = line.match(/^  size:\s*(\d+)\s*,\s*(\d+)/);
    if (regionSizeMatch) {
      const w = Math.round(parseInt(regionSizeMatch[1]) * scale);
      const h = Math.round(parseInt(regionSizeMatch[2]) * scale);
      out.push(`  size: ${w}, ${h}`);
      continue;
    }

    // orig: w, h
    const origMatch = line.match(/^  orig:\s*(\d+)\s*,\s*(\d+)/);
    if (origMatch) {
      const w = Math.round(parseInt(origMatch[1]) * scale);
      const h = Math.round(parseInt(origMatch[2]) * scale);
      out.push(`  orig: ${w}, ${h}`);
      continue;
    }

    // offset: x, y
    const offsetMatch = line.match(/^  offset:\s*(\d+)\s*,\s*(\d+)/);
    if (offsetMatch) {
      const x = Math.round(parseInt(offsetMatch[1]) * scale);
      const y = Math.round(parseInt(offsetMatch[2]) * scale);
      out.push(`  offset: ${x}, ${y}`);
      continue;
    }

    out.push(line);
  }

  fs.writeFileSync(atlasPath, out.join('\n'), 'utf8');
}

async function main() {
  let totalBefore = 0, totalAfter = 0;

  for (const [rel, scale] of RESIZE_TARGETS) {
    if (scale === 1) continue; // skip

    const filePath = path.join(ASSETS, rel);
    const before = fs.statSync(filePath).size;
    totalBefore += before;

    const meta = await sharp(filePath).metadata();
    const newW = Math.round(meta.width * scale);
    const newH = Math.round(meta.height * scale);

    // Write to temp file then rename — avoids Windows file-lock issues
    const tmpPath = filePath + '.tmp';
    const inputBuf = fs.readFileSync(filePath);
    await sharp(inputBuf)
      .resize(newW, newH)
      .webp({ quality: 80 })
      .toFile(tmpPath);
    fs.unlinkSync(filePath);
    fs.renameSync(tmpPath, filePath);
    const after = fs.statSync(filePath).size;
    totalAfter += after;

    // Scale atlas if this is a Spine texture
    const atlasRel = SPINE_ATLAS_SCALES[rel];
    if (atlasRel) {
      const atlasPath = path.join(ASSETS, atlasRel);
      scaleAtlas(atlasPath, scale);
      console.log(`✓ ${rel}: ${meta.width}x${meta.height} → ${newW}x${newH}  ${(before/1024).toFixed(0)}KB → ${(after/1024).toFixed(0)}KB  (atlas scaled)`);
    } else {
      console.log(`✓ ${rel}: ${meta.width}x${meta.height} → ${newW}x${newH}  ${(before/1024).toFixed(0)}KB → ${(after/1024).toFixed(0)}KB`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Before: ${(totalBefore/1024).toFixed(0)} KB`);
  console.log(`After:  ${(totalAfter/1024).toFixed(0)} KB`);
  console.log(`Saved:  ${((totalBefore-totalAfter)/1024).toFixed(0)} KB (${((1-totalAfter/totalBefore)*100).toFixed(1)}%)`);
}

main().catch(console.error);
