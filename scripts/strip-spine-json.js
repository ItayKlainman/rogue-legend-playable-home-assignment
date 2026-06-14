#!/usr/bin/env node
/**
 * strip-spine-json.js
 *
 * Strips unused animations and skins from Spine JSON files to reduce bundle size.
 * Only touches root-level files in assets/Spine/ (not Stage subdirectories).
 *
 * Usage: node scripts/strip-spine-json.js
 */

const fs = require('fs');
const path = require('path');

const SPINE_DIR = path.resolve(__dirname, '..', 'assets', 'Spine');

// Per-character config: which animations and skins to keep.
const STRIP_CONFIG = {
  'Main_Character.json': {
    keepAnimations: ['Idle', 'Run', 'Regular_Attack_Melee', 'Basic_Attack_Sword_1', 'Rage_Attack_Melee', 'TakeHit', 'Die'],
    keepSkins: null, // keep all — all enemies use Main_Character with different skins
  },
  'Skeleton_Warrior.json': {
    keepAnimations: ['Idle', 'Attack', 'Hit', 'Dead'],
    keepSkins: null, // keep all
  },
  'Slime.json': {
    keepAnimations: ['Idle', 'Attack', 'Hit', 'Dead'],
    keepSkins: null,
  },
  'Skeleton_King.json': {
    keepAnimations: ['Idle', 'Attack', 'Hit', 'Dead', 'Rage_Attack'],
    keepSkins: null,
  },
};

let totalBefore = 0;
let totalAfter = 0;

for (const [filename, config] of Object.entries(STRIP_CONFIG)) {
  const filepath = path.join(SPINE_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.log(`  SKIP  ${filename} — file not found`);
    continue;
  }

  const raw = fs.readFileSync(filepath, 'utf8');
  const sizeBefore = Buffer.byteLength(raw, 'utf8');
  const json = JSON.parse(raw);

  // Strip animations
  let animsRemoved = 0;
  if (json.animations && config.keepAnimations) {
    const keepSet = new Set(config.keepAnimations);
    for (const animName of Object.keys(json.animations)) {
      if (!keepSet.has(animName)) {
        delete json.animations[animName];
        animsRemoved++;
      }
    }
  }

  // Strip skins
  let skinsRemoved = 0;
  if (json.skins && config.keepSkins) {
    const keepSet = new Set(config.keepSkins);
    // Always keep 'default' skin if it exists (Spine requires it)
    keepSet.add('default');
    const before = json.skins.length;
    json.skins = json.skins.filter(skin => keepSet.has(skin.name));
    skinsRemoved = before - json.skins.length;
  }

  const output = JSON.stringify(json);
  const sizeAfter = Buffer.byteLength(output, 'utf8');

  fs.writeFileSync(filepath, output, 'utf8');

  totalBefore += sizeBefore;
  totalAfter += sizeAfter;

  const pct = ((1 - sizeAfter / sizeBefore) * 100).toFixed(1);
  console.log(
    `  ${filename}: ${(sizeBefore / 1024).toFixed(1)} KB → ${(sizeAfter / 1024).toFixed(1)} KB ` +
    `(−${pct}%) | removed ${animsRemoved} anims, ${skinsRemoved} skins`
  );
}

console.log();
console.log(
  `  TOTAL: ${(totalBefore / 1024).toFixed(1)} KB → ${(totalAfter / 1024).toFixed(1)} KB ` +
  `(−${((1 - totalAfter / totalBefore) * 100).toFixed(1)}%)`
);
