#!/usr/bin/env node

/**
 * Strip unused skins from Spine JSON files based on the active variant config.
 *
 * Usage: node scripts/strip-spine-skins.js [variant-name]
 * Default variant: demo
 *
 * Reads the variant config to determine which hero skins are actually used,
 * then strips all other skins (and their references in slots/animations)
 * from Main_Character.json. Also strips unused animations.
 * Creates a .stripped.json alongside the original.
 */

const fs = require('fs');
const path = require('path');

/**
 * Recursively round all float values to the given number of decimal places.
 * Reduces file size by trimming unnecessary precision.
 */
function truncateFloats(obj, decimals = 4) {
  const factor = Math.pow(10, decimals);
  return JSON.parse(JSON.stringify(obj), (_key, val) => {
    if (typeof val === 'number' && !Number.isInteger(val) && Number.isFinite(val)) {
      return Math.round(val * factor) / factor;
    }
    return val;
  });
}

/**
 * Animations whose usage depends on variant config. Each entry returns true
 * when the variant uses it. If none of the scanned variants use it, the
 * animation is stripped.
 */
const CONDITIONAL_ANIMATIONS = {
  // 'Run' is only played by RewardDiscoveryScene, which fires when a
  // weaponReward or heroReward event has `discovery: true`.
  Run: (config) => (config.events || []).some(
    e => (e.type === 'weaponReward' || e.type === 'heroReward') && e.discovery,
  ),
};

const HERO_REGISTRY = {
  base:       'Base',
  corvus:     'Corvus',
  fireWizard: 'Fire_Wizard',
  kasumi:     'Kasumi',
  lance:      'Lance',
  vlad:       'Vlad',
};

function collectUsedSkins(config) {
  const usedSkins = new Set();

  // Initial hero skin (defaults to 'Base')
  if (config.initialState.hero) {
    const skinName = HERO_REGISTRY[config.initialState.hero];
    if (skinName) usedSkins.add(skinName);
  } else {
    usedSkins.add('Base');
  }

  // heroReward events
  for (const event of config.events) {
    if (event.type === 'heroReward' && event.hero) {
      const skinName = HERO_REGISTRY[event.hero];
      if (skinName) usedSkins.add(skinName);
    }
  }

  // Also scan fight steps for mid-fight heroReward (future-proof)
  for (const fightCfg of Object.values(config.fights || {})) {
    for (const step of (fightCfg.steps || [])) {
      if (step.type === 'heroReward' && step.hero) {
        const skinName = HERO_REGISTRY[step.hero];
        if (skinName) usedSkins.add(skinName);
      }
    }
  }

  return usedSkins;
}

/** Check if an attachment name like "Fire_Wizard/tail" belongs to a removed skin */
function isRemovedSkinAttachment(attachmentName, removedSkins) {
  if (!attachmentName) return false;
  const skinPrefix = attachmentName.split('/')[0];
  return removedSkins.has(skinPrefix);
}

/** Collect all valid attachment names from kept skins */
function collectKeptAttachments(skins) {
  const valid = new Set();
  for (const skin of skins) {
    for (const [slotName, attachments] of Object.entries(skin.attachments || {})) {
      for (const attachName of Object.keys(attachments)) {
        valid.add(attachName);
        // Also add with skin prefix
        valid.add(skin.name + '/' + attachName);
      }
    }
  }
  return valid;
}

function stripAnimations(json, removeNames) {
  if (!json.animations) return [];
  const removed = [];
  for (const name of removeNames) {
    if (json.animations[name]) {
      delete json.animations[name];
      removed.push(name);
    }
  }
  return removed;
}

function stripJson(json, removedSkins) {
  // 1) Strip skin definitions
  json.skins = json.skins.filter(s => !removedSkins.has(s.name));

  // 2) Null out default attachment on slots that reference removed skins
  if (json.slots) {
    for (const slot of json.slots) {
      if (slot.attachment && isRemovedSkinAttachment(slot.attachment, removedSkins)) {
        slot.attachment = null;
      }
    }
  }

  // 3) Clean animations
  if (json.animations) {
    for (const animData of Object.values(json.animations)) {
      // 3a) Remove attachment timeline sections keyed by removed skin names
      if (animData.attachments) {
        for (const skinName of Object.keys(animData.attachments)) {
          if (removedSkins.has(skinName)) {
            delete animData.attachments[skinName];
          }
        }
        // Remove empty attachments object
        if (Object.keys(animData.attachments).length === 0) {
          delete animData.attachments;
        }
      }

      // 3b) Clean slot timelines that reference removed skin attachments
      if (animData.slots) {
        for (const [slotName, slotTimelines] of Object.entries(animData.slots)) {
          if (slotTimelines.attachment) {
            slotTimelines.attachment = slotTimelines.attachment.map(frame => {
              if (frame.name && isRemovedSkinAttachment(frame.name, removedSkins)) {
                return { ...frame, name: null };
              }
              return frame;
            });
          }
        }
      }

      // 3c) Clean deform sections keyed by removed skin names
      if (animData.deform) {
        for (const skinName of Object.keys(animData.deform)) {
          if (removedSkins.has(skinName)) {
            delete animData.deform[skinName];
          }
        }
        if (Object.keys(animData.deform).length === 0) {
          delete animData.deform;
        }
      }
    }
  }
}

function main() {
  const root = path.resolve(__dirname, '..');
  const srcDir = path.join(root, 'src', 'playables', 'board-fight', 'variants');
  const args = process.argv.slice(2);

  // Parse --out-dir flag
  let outDir = null;
  const outDirIdx = args.indexOf('--out-dir');
  if (outDirIdx !== -1) {
    outDir = path.resolve(args[outDirIdx + 1]);
    args.splice(outDirIdx, 2);
  }

  const arg = args[0];

  // Collect skins + conditional-animation usage from variant(s)
  const usedSkins = new Set();
  const usedConditionalAnims = new Set();
  let variantNames;

  if (arg === '--all' || !arg) {
    // Scan all variant files
    variantNames = fs.readdirSync(srcDir)
      .filter(f => f.endsWith('.variant.js'))
      .map(f => f.replace('.variant.js', ''));
  } else {
    variantNames = [arg];
  }

  for (const variantName of variantNames) {
    const variantPath = path.join(srcDir, `${variantName}.variant.js`);
    if (!fs.existsSync(variantPath)) {
      console.error(`ERROR: Variant config not found: ${variantPath}`);
      process.exit(1);
    }
    delete require.cache[require.resolve(variantPath)];
    const config = require(variantPath);
    for (const skin of collectUsedSkins(config)) usedSkins.add(skin);
    for (const [animName, predicate] of Object.entries(CONDITIONAL_ANIMATIONS)) {
      if (predicate(config)) usedConditionalAnims.add(animName);
    }
  }

  const removeAnimations = Object.keys(CONDITIONAL_ANIMATIONS)
    .filter(name => !usedConditionalAnims.has(name));

  console.log(`Variants scanned: ${variantNames.join(', ')}`);
  console.log(`Hero skins used across all variants: ${[...usedSkins].join(', ')}`);

  // Strip Main_Character.json
  const jsonPath = path.join(root, 'assets', 'Spine', 'Main_Character.json');
  const strippedPath = outDir
    ? path.join(outDir, 'Main_Character.stripped.json')
    : path.join(root, 'assets', 'Spine', 'Main_Character.stripped.json');

  if (!fs.existsSync(jsonPath)) {
    console.error(`ERROR: Spine JSON not found: ${jsonPath}`);
    process.exit(1);
  }

  const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const allSkinNames = (json.skins || []).map(s => s.name);
  const removedSkins = new Set(allSkinNames.filter(s => !usedSkins.has(s)));

  if (removedSkins.size === 0 && removeAnimations.length === 0) {
    console.log('No skins or animations to strip.');
    fs.copyFileSync(jsonPath, strippedPath);
    if (outDir) {
      fs.copyFileSync(jsonPath, path.join(outDir, 'Main_Character.build.json'));
    }
    return;
  }

  stripJson(json, removedSkins);
  const removedAnims = stripAnimations(json, removeAnimations);

  // Reduce float precision to save size
  const optimized = truncateFloats(json);

  const originalSize = fs.statSync(jsonPath).size;
  const strippedJson = JSON.stringify(optimized);
  fs.writeFileSync(strippedPath, strippedJson, 'utf8');
  if (outDir) {
    fs.writeFileSync(path.join(outDir, 'Main_Character.build.json'), strippedJson, 'utf8');
  }
  const newSize = fs.statSync(strippedPath).size;

  const keptNames = allSkinNames.filter(s => usedSkins.has(s));
  console.log(`Skins kept: ${keptNames.join(', ')}`);
  console.log(`Skins removed: ${[...removedSkins].join(', ')}`);
  if (removedAnims.length > 0) {
    console.log(`Animations removed: ${removedAnims.join(', ')}`);
  }
  console.log(`${(originalSize/1024).toFixed(1)} KB -> ${(newSize/1024).toFixed(1)} KB (saved ${((originalSize - newSize)/1024).toFixed(1)} KB)`);
}

main();
