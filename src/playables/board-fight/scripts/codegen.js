#!/usr/bin/env node

/**
 * Codegen: variant config → generated TypeScript
 *
 * Usage: node src/playables/board-fight/scripts/codegen.js [variant-name]
 * Default variant: demo
 *
 * Reads:  src/playables/board-fight/variants/<name>.variant.js
 * Writes: src/playables/board-fight/variants/<name>.generated.ts
 */

const fs = require('fs');
const path = require('path');

// ── Registry: string IDs → catalog import paths + export names ───────────

const REGISTRY = {
  heroes: {
    hero: { importPath: '../catalog/heroes', exportName: 'heroBundle' },
    base:       { importPath: '../catalog/heroes/base',       exportName: 'BASE_HERO' },
    corvus:     { importPath: '../catalog/heroes/corvus',     exportName: 'CORVUS' },
    fireWizard: { importPath: '../catalog/heroes/fireWizard', exportName: 'FIRE_WIZARD' },
    kasumi:     { importPath: '../catalog/heroes/kasumi',     exportName: 'KASUMI' },
    lance:      { importPath: '../catalog/heroes/lance',      exportName: 'LANCE' },
    vlad:       { importPath: '../catalog/heroes/vlad',       exportName: 'VLAD' },
  },
  enemies: {
    // Stage 1
    skeleton:          { importPath: '../catalog/enemies/stage1/skeleton',        exportName: 'skeletonBundle' },
    skeletonKing:      { importPath: '../catalog/enemies/stage1/skeletonKing',    exportName: 'skeletonKingBundle' },
    slime:             { importPath: '../catalog/enemies/stage1/slime',           exportName: 'slimeBundle' },
    skeletonArcher:    { importPath: '../catalog/enemies/stage1/skeletonArcher',    exportName: 'skeletonArcherBundle' },
    skeletonCommander: { importPath: '../catalog/enemies/stage1/skeletonCommander', exportName: 'skeletonCommanderBundle' },
    skeletonMage:      { importPath: '../catalog/enemies/stage1/skeletonMage',      exportName: 'skeletonMageBundle' },
    wolf:              { importPath: '../catalog/enemies/stage1/wolf',              exportName: 'wolfBundle' },
    // Stage 2
    goblinBalista:     { importPath: '../catalog/enemies/stage2/goblinBalista',     exportName: 'goblinBalistaBundle' },
    goblinEngineer:    { importPath: '../catalog/enemies/stage2/goblinEngineer',    exportName: 'goblinEngineerBundle' },
    goblinGrunt:       { importPath: '../catalog/enemies/stage2/goblinGrunt',       exportName: 'goblinGruntBundle' },
    goblinHunter:      { importPath: '../catalog/enemies/stage2/goblinHunter',      exportName: 'goblinHunterBundle' },
    goblinMage:        { importPath: '../catalog/enemies/stage2/goblinMage',        exportName: 'goblinMageBundle' },
    goblinOgre:        { importPath: '../catalog/enemies/stage2/goblinOgre',        exportName: 'goblinOgreBundle' },
    // Stage 3
    caveSpider:        { importPath: '../catalog/enemies/stage3/caveSpider',        exportName: 'caveSpiderBundle' },
    redShroom:         { importPath: '../catalog/enemies/stage3/redShroom',         exportName: 'redShroomBundle' },
    stoneElemental:    { importPath: '../catalog/enemies/stage3/stoneElemental',    exportName: 'stoneElementalBundle' },
    ancientConstruct:  { importPath: '../catalog/enemies/stage3/ancientConstruct',  exportName: 'ancientConstructBundle' },
    redSlime:          { importPath: '../catalog/enemies/stage3/redSlime',          exportName: 'redSlimeBundle' },
    // Stage 4
    dragonBoss:        { importPath: '../catalog/enemies/stage4/dragonBoss',        exportName: 'dragonBossBundle' },
    snowSpider:        { importPath: '../catalog/enemies/stage4/snowSpider',        exportName: 'snowSpiderBundle' },
    trollCultist:      { importPath: '../catalog/enemies/stage4/trollCultist',      exportName: 'trollCultistBundle' },
    trollWarrior:      { importPath: '../catalog/enemies/stage4/trollWarrior',      exportName: 'trollWarriorBundle' },
    yeti:              { importPath: '../catalog/enemies/stage4/yeti',              exportName: 'yetiBundle' },
    // Stage 5
    anubis:            { importPath: '../catalog/enemies/stage5/anubis',            exportName: 'anubisBundle' },
    bastet:            { importPath: '../catalog/enemies/stage5/bastet',            exportName: 'bastetBundle' },
    desertHornet:      { importPath: '../catalog/enemies/stage5/desertHornet',      exportName: 'desertHornetBundle' },
    mummyGeneral:      { importPath: '../catalog/enemies/stage5/mummyGeneral',      exportName: 'mummyGeneralBundle' },
    mummyWarrior:      { importPath: '../catalog/enemies/stage5/mummyWarrior',      exportName: 'mummyWarriorBundle' },
    // Stage 6
    banshee:           { importPath: '../catalog/enemies/stage6/banshee',           exportName: 'bansheeBundle' },
    bossTree:          { importPath: '../catalog/enemies/stage6/bossTree',          exportName: 'bossTreeBundle' },
    ghostKnight:       { importPath: '../catalog/enemies/stage6/ghostKnight',       exportName: 'ghostKnightBundle' },
    livingTree:        { importPath: '../catalog/enemies/stage6/livingTree',        exportName: 'livingTreeBundle' },
    // Stage 7
    deadSailor:        { importPath: '../catalog/enemies/stage7/deadSailor',        exportName: 'deadSailorBundle' },
    fishMonster:       { importPath: '../catalog/enemies/stage7/fishMonster',       exportName: 'fishMonsterBundle' },
    kraken:            { importPath: '../catalog/enemies/stage7/kraken',            exportName: 'krakenBundle' },
    pirateCaptain:     { importPath: '../catalog/enemies/stage7/pirateCaptain',     exportName: 'pirateCaptainBundle' },
    siren:             { importPath: '../catalog/enemies/stage7/siren',             exportName: 'sirenBundle' },
  },
  weapons: {
    warriorBlade: {
      importPath: '../catalog/weapons/warriorBlade',
      exportName: 'WARRIORS_BLADE',
      displayName: 'WarriorBlade',
      uiExport: null,
    },
    ninjaKatana: {
      importPath: '../catalog/weapons/ninjaKatana',
      exportName: 'NINJA_KATANA',
      displayName: 'NinjaKatana',
      uiExport: 'ninjaKatanaUIData',
    },
    crystalHammer: {
      importPath: '../catalog/weapons/crystalHammer',
      exportName: 'CRYSTAL_HAMMER',
      displayName: 'CrystalHammer',
      uiExport: null,
    },
    deadeyeBlade: {
      importPath: '../catalog/weapons/deadeyeBlade',
      exportName: 'DEADEYES_BLADE',
      displayName: 'DeadeyeBlade',
      uiExport: null,
    },
    duelistSpear: {
      importPath: '../catalog/weapons/duelistSpear',
      exportName: 'DUELIST_SPEAR',
      displayName: 'DuelistSpear',
      uiExport: null,
    },
    emberStaff: {
      importPath: '../catalog/weapons/emberStaff',
      exportName: 'EMBER_STAFF',
      displayName: 'EmberStaff',
      uiExport: null,
    },
    glacialHammer: {
      importPath: '../catalog/weapons/glacialHammer',
      exportName: 'GLACIAL_HAMMER',
      displayName: 'GlacialHammer',
      uiExport: null,
    },
    natureStaff: {
      importPath: '../catalog/weapons/natureStaff',
      exportName: 'NATURE_STAFF',
      displayName: 'NatureStaff',
      uiExport: null,
    },
    plagueBlade: {
      importPath: '../catalog/weapons/plagueBlade',
      exportName: 'PLAGUE_BLADE',
      displayName: 'PlagueBlade',
      uiExport: null,
    },
    radiantHammer: {
      importPath: '../catalog/weapons/radiantHammer',
      exportName: 'RADIANT_HAMMER',
      displayName: 'RadiantHammer',
      uiExport: null,
    },
    serratedEdge: {
      importPath: '../catalog/weapons/serratedEdge',
      exportName: 'SERRATED_EDGE',
      displayName: 'SerratedEdge',
      uiExport: null,
    },
    stormStaff: {
      importPath: '../catalog/weapons/stormStaff',
      exportName: 'STORM_STAFF',
      displayName: 'StormStaff',
      uiExport: null,
    },
    vampiricEdge: {
      importPath: '../catalog/weapons/vampiricEdge',
      exportName: 'VAMPIRIC_EDGE',
      displayName: 'VampiricEdge',
      uiExport: null,
    },
  },
  skills: {
    chainLightning:   { importPath: '../catalog/skills/chainLightning',   exportName: 'CHAIN_LIGHTNING' },
    thunderstorm:     { importPath: '../catalog/skills/thunderstorm',     exportName: 'THUNDERSTORM' },
    thunderGod:       { importPath: '../catalog/skills/thunderGod',       exportName: 'THUNDER_GOD' },
    fireballBarrage:  { importPath: '../catalog/skills/fireballBarrage',  exportName: 'FIREBALL_BARRAGE' },
    flameStrike:      { importPath: '../catalog/skills/flameStrike',      exportName: 'FLAME_STRIKE' },
    meteorStorm:      { importPath: '../catalog/skills/meteorStorm',      exportName: 'METEOR_STORM' },
    shurikenFlurry:   { importPath: '../catalog/skills/shurikenFlurry',   exportName: 'SHURIKEN_FLURRY' },
    fumaShuriken:     { importPath: '../catalog/skills/fumaShuriken',     exportName: 'FUMA_SHURIKEN' },
    deadlyStars:      { importPath: '../catalog/skills/deadlyStars',      exportName: 'DEADLY_STARS' },
    berserk:          { importPath: '../catalog/skills/berserk',          exportName: 'BERSERK' },
  },
  battleBgs: {
    stage1: { importPath: '../catalog/battleBgs/stage1', exportName: 'default', alias: 'battleBgStage1' },
    stage2: { importPath: '../catalog/battleBgs/stage2', exportName: 'default', alias: 'battleBgStage2' },
    stage3: { importPath: '../catalog/battleBgs/stage3', exportName: 'default', alias: 'battleBgStage3' },
    stage4: { importPath: '../catalog/battleBgs/stage4', exportName: 'default', alias: 'battleBgStage4' },
    stage5: { importPath: '../catalog/battleBgs/stage5', exportName: 'default', alias: 'battleBgStage5' },
    stage6: { importPath: '../catalog/battleBgs/stage6', exportName: 'default', alias: 'battleBgStage6' },
    stage7: { importPath: '../catalog/battleBgs/stage7', exportName: 'default', alias: 'battleBgStage7' },
    stage7Island: { importPath: '../catalog/battleBgs/stage7Island', exportName: 'default', alias: 'battleBgStage7Island' },
  },
  boards: {
    board1: { importPath: '../board/board1', exportName: 'board1Config' },
    board1NoStatue: { importPath: '../board/board1NoStatue', exportName: 'board1NoStatueConfig' },
    board2: { importPath: '../board/board2', exportName: 'board2Config' },
    board2NoStatue: { importPath: '../board/board2NoStatue', exportName: 'board2NoStatueConfig' },
    board3: { importPath: '../board/board3', exportName: 'board3Config' },
    board3NoStatue: { importPath: '../board/board3NoStatue', exportName: 'board3NoStatueConfig' },
    board4: { importPath: '../board/board4', exportName: 'board4Config' },
    board5: { importPath: '../board/board5', exportName: 'board5Config' },
    board6: { importPath: '../board/board6', exportName: 'board6Config' },
    board7: { importPath: '../board/board7', exportName: 'board7Config' },
  },
  // Tile-decoration floats (per-variant, per-tile). Decoration ids are looked up here
  // first; if absent, codegen falls back to REGISTRY.enemies to render an idle-Spine
  // enemy decoration on the tile. Codegen hard-fails if an id appears in both (ambiguous)
  // or neither (unknown).
  tileFloats: {
    // Populate as decorations are added:
    // floatCoin:  { importPath: '../catalog/tileFloats/floatCoin',  exportName: 'floatCoin' },
    // floatSkull: { importPath: '../catalog/tileFloats/floatSkull', exportName: 'floatSkull' },
  },
};

// ── Ref marker for serialization ─────────────────────────────────────────
// Values wrapped with ref() emit as bare identifiers instead of string literals.

const REF_PREFIX = '\0REF:';

function ref(name) {
  return REF_PREFIX + name;
}

function isRef(val) {
  return typeof val === 'string' && val.startsWith(REF_PREFIX);
}

function deref(val) {
  return val.slice(REF_PREFIX.length);
}

// ── Registry lookup with validation ──────────────────────────────────────

function lookup(category, id) {
  const entry = REGISTRY[category]?.[id];
  if (!entry) {
    console.error(`ERROR: Unknown ${category} ID: "${id}"`);
    console.error(`  Valid IDs: ${Object.keys(REGISTRY[category] || {}).join(', ')}`);
    process.exit(1);
  }
  return entry;
}

/** Resolve a tileFloat id. All ids must use the 'deco.' prefix; the stripped name
 *  is looked up in tileFloats first, then enemies. Hard-fails on missing prefix
 *  or unknown id. */
function lookupTileFloat(id) {
  if (!id.startsWith('deco.')) {
    console.error(`ERROR: tileFloat id "${id}" must start with "deco." (e.g. "deco.skeleton", "deco.coin").`);
    process.exit(1);
  }
  const stripped = id.slice('deco.'.length);
  const inDeco = REGISTRY.tileFloats[stripped];
  if (inDeco) return { kind: 'sprite', entry: inDeco };
  const inEnemy = REGISTRY.enemies[stripped];
  if (inEnemy) return { kind: 'spine', entry: inEnemy };
  const decoIds = Object.keys(REGISTRY.tileFloats);
  const enemyIds = Object.keys(REGISTRY.enemies);
  console.error(`ERROR: Unknown tileFloat id "${id}" (stripped: "${stripped}")`);
  console.error(`  Valid decoration IDs: ${decoIds.map(x => 'deco.' + x).join(', ') || '(none registered)'}`);
  console.error(`  Valid enemy IDs: ${enemyIds.map(x => 'deco.' + x).join(', ')}`);
  process.exit(1);
}

// ── Serializer ───────────────────────────────────────────────────────────

function serializeValue(val) {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'boolean') return String(val);
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') {
    if (isRef(val)) return deref(val);
    return "'" + val.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  }
  return null; // complex type — caller handles
}

/** Try to produce a single-line representation. Returns null-length-guarded string. */
function inlineSerialize(val) {
  const prim = serializeValue(val);
  if (prim !== null) return prim;

  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    const items = val.map(v => inlineSerialize(v));
    return '[' + items.join(', ') + ']';
  }

  const entries = Object.entries(val);
  if (entries.length === 0) return '{}';
  return '{ ' + entries.map(([k, v]) => safeKey(k) + ': ' + inlineSerialize(v)).join(', ') + ' }';
}

/**
 * Serialize a value to TypeScript string.
 * Tries inline first; falls back to multi-line if inline exceeds threshold.
 */
function serialize(val, indent) {
  const prim = serializeValue(val);
  if (prim !== null) return prim;

  // Try inline
  const inline = inlineSerialize(val);
  if (inline.length <= 100) return inline;

  const pad = '  '.repeat(indent);
  const inner = '  '.repeat(indent + 1);

  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    const lines = val.map(v => inner + serialize(v, indent + 1) + ',');
    return '[\n' + lines.join('\n') + '\n' + pad + ']';
  }

  const entries = Object.entries(val);
  if (entries.length === 0) return '{}';
  const lines = entries.map(([k, v]) => inner + safeKey(k) + ': ' + serialize(v, indent + 1) + ',');
  return '{\n' + lines.join('\n') + '\n' + pad + '}';
}

function safeKey(k) {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : "'" + k + "'";
}

// ── Main ─────────────────────────────────────────────────────────────────

/** Write _active.generated.ts that re-exports the given variant script */
function writeActiveReexport(srcDir, variantName) {
  const activePath = path.join(srcDir, '_active.generated.ts');
  const content = [
    `// @generated — do not edit. Written by codegen.js.`,
    `export { ${variantName}Script as activeScript } from './${variantName}.generated';`,
    '',
  ].join('\n');
  fs.writeFileSync(activePath, content, 'utf8');
}

/** Run codegen for every .variant.js file in srcDir */
function codegenAll(srcDir) {
  // `__`-prefixed files are test fixtures (e.g. __cg_fixture); skipped by --all.
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.variant.js') && !f.startsWith('__'));
  for (const file of files) {
    const name = file.replace('.variant.js', '');
    codegenVariant(name);
  }
}

function main() {
  const args = process.argv.slice(2);
  const skipActive = args.includes('--skip-active');
  const filteredArgs = args.filter(a => a !== '--skip-active');
  const arg = filteredArgs[0];

  // --all flag: codegen every variant
  if (arg === '--all') {
    const srcDir = path.resolve(__dirname, '..', 'variants');
    codegenAll(srcDir);
    if (!skipActive) {
      const activeVariant = filteredArgs[1] || 'demo';
      writeActiveReexport(srcDir, activeVariant);
    }
    return;
  }

  const variantName = arg || 'demo';
  codegenVariant(variantName);

  if (!skipActive) {
    const srcDir = path.resolve(__dirname, '..', 'variants');
    writeActiveReexport(srcDir, variantName);
  }
}

function codegenVariant(variantName) {
  const srcDir = path.resolve(__dirname, '..', 'variants');
  const inputPath = path.join(srcDir, `${variantName}.variant.js`);
  const outputPath = path.join(srcDir, `${variantName}.generated.ts`);

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: Variant config not found: ${inputPath}`);
    process.exit(1);
  }

  // Clear require cache (for watch mode)
  delete require.cache[require.resolve(inputPath)];
  const config = require(inputPath);

  // ── Validate promoCode config ──
  if (config.promoCode) {
    if (config.promoCode.mode === 'countdown') {
      if (typeof config.promoCode.countdownSec !== 'number' || config.promoCode.countdownSec < 1) {
        console.error(`ERROR: promoCode.mode='countdown' requires countdownSec >= 1`);
        process.exit(1);
      }
      if (typeof config.promoCode.rewardName !== 'string' || !config.promoCode.rewardName) {
        console.error(`ERROR: promoCode.mode='countdown' requires rewardName (string)`);
        process.exit(1);
      }
    }
  }

  // ── Collect imports ──

  /** @type {Map<string, Set<string>>} importPath → Set<exportName> */
  const imports = new Map();

  function addImport(importPath, exportName) {
    if (!imports.has(importPath)) imports.set(importPath, new Set());
    imports.get(importPath).add(exportName);
  }

  // Always need hero
  const heroEntry = REGISTRY.heroes.hero;
  addImport(heroEntry.importPath, heroEntry.exportName);

  // Board — auto-select NoStatue variant when centerEnemy is present and one exists.
  let boardExport = null;
  if (config.board) {
    let boardId = config.board;
    if (config.centerEnemy && REGISTRY.boards[boardId + 'NoStatue']) {
      boardId = boardId + 'NoStatue';
    }
    const boardEntry = lookup('boards', boardId);
    addImport(boardEntry.importPath, boardEntry.exportName);
    boardExport = boardEntry.exportName;
  }

  // Center boss (optional): resolved like a tileFloat id, rendered as a singleton
  // actor at board center by BoardScene. Requires `board:` to be set.
  // Shorthand: `centerEnemy: 'deco.X'` — default scale + position from boardCenter.
  // Explicit:  `centerEnemy: { id: 'deco.X', scale?: 0.3, position?: { x, y } }`
  //   - `position` is in source-image coords, same space as `boardCenter` and tiles.
  let centerEnemyExport = null;
  let centerEnemyScale = null;
  let centerEnemyPosition = null;
  if (config.centerEnemy) {
    if (!config.board) {
      const idForMsg = typeof config.centerEnemy === 'string' ? config.centerEnemy : config.centerEnemy.id;
      console.error(`ERROR: centerEnemy "${idForMsg}" requires a board — set "board:" in the variant config.`);
      process.exit(1);
    }
    let id;
    if (typeof config.centerEnemy === 'string') {
      id = config.centerEnemy;
    } else {
      id = config.centerEnemy.id;
      if (typeof config.centerEnemy.scale === 'number') {
        centerEnemyScale = config.centerEnemy.scale;
      }
      if (config.centerEnemy.position) {
        const p = config.centerEnemy.position;
        if (typeof p.x !== 'number' || typeof p.y !== 'number') {
          console.error(`ERROR: centerEnemy.position must be { x: number, y: number }`);
          process.exit(1);
        }
        centerEnemyPosition = { x: p.x, y: p.y };
      }
    }
    const resolved = lookupTileFloat(id);
    addImport(resolved.entry.importPath, resolved.entry.exportName);
    centerEnemyExport = resolved.entry.exportName;
  }

  // Initial hero (optional — defaults to 'Base' skin)
  let initialHeroEntry = null;
  let initialHeroSkin = 'Base';
  if (config.initialState.hero) {
    initialHeroEntry = lookup('heroes', config.initialState.hero);
    addImport(initialHeroEntry.importPath, initialHeroEntry.exportName);
  }

  // Initial weapon
  const initialWeapon = lookup('weapons', config.initialState.weapon);
  addImport(initialWeapon.importPath, initialWeapon.exportName);

  // All skills
  const skillExports = [];
  for (const skillId of config.allSkills) {
    const entry = lookup('skills', skillId);
    addImport(entry.importPath, entry.exportName);
    skillExports.push(entry.exportName);
  }

  // Battle backgrounds (default imports tracked separately)
  /** @type {Map<string, string>} importPath → alias */
  const defaultImports = new Map();

  // Fights — scan enemies, backgrounds, and mid-fight steps
  for (const fightConfig of Object.values(config.fights || {})) {
    {
      const bgName = fightConfig.background || 'stage1';
      const bgEntry = lookup('battleBgs', bgName);
      defaultImports.set(bgEntry.importPath, bgEntry.alias);
    }
    for (const enemy of fightConfig.enemies) {
      const entry = lookup('enemies', enemy.enemy);
      addImport(entry.importPath, entry.exportName);
    }
    // Scan steps for mid-fight levelup/weaponReward imports
    for (const step of (fightConfig.steps || [])) {
      if (step.type === 'levelup' && step.skills) {
        const rounds = Array.isArray(step.skills[0]) ? step.skills : [step.skills];
        for (const round of rounds) {
          for (const skillId of round) {
            const entry = lookup('skills', skillId);
            addImport(entry.importPath, entry.exportName);
          }
        }
      }
      if (step.type === 'weaponReward' && step.weapon) {
        const entry = lookup('weapons', step.weapon);
        addImport(entry.importPath, entry.exportName);
        if (entry.uiExport) addImport(entry.importPath, entry.uiExport);
      }
    }
  }

  // Game end images — collect unique image imports
  /** @type {Map<string, string>} filename → import alias */
  const gameEndImageImports = new Map();

  // Events — scan weapon rewards, level-up skills, and game end images
  for (const event of config.events) {
    if (event.type === 'gameEnd' && event.image) {
      if (!gameEndImageImports.has(event.image)) {
        const alias = 'gameEndImage' + (gameEndImageImports.size || '');
        gameEndImageImports.set(event.image, alias);
      }
    }
    if (event.type === 'nextChapter' && event.image) {
      if (!gameEndImageImports.has(event.image)) {
        const alias = 'gameEndImage' + (gameEndImageImports.size || '');
        gameEndImageImports.set(event.image, alias);
      }
    }
    if (event.type === 'weaponReward') {
      const entry = lookup('weapons', event.weapon);
      addImport(entry.importPath, entry.exportName);
      if (entry.uiExport) {
        addImport(entry.importPath, entry.uiExport);
      }
    }
    if (event.type === 'heroReward') {
      const entry = lookup('heroes', event.hero);
      addImport(entry.importPath, entry.exportName);
    }
    if (event.type === 'levelup' && event.skills) {
      const rounds = Array.isArray(event.skills[0]) ? event.skills : [event.skills];
      for (const round of rounds) {
        for (const skillId of round) {
          const entry = lookup('skills', skillId);
          addImport(entry.importPath, entry.exportName);
        }
      }
    }
  }

  // Tile floats — per-tile decorative floats (sprite-bob or idle-Spine enemy)
  // Value may be a string id ('deco.foo') or an object { id, scale } — scale only
  // applies to 'spine' (enemy decoration) floats.
  const tileFloatConfigs = [];
  if (config.tileFloats) {
    for (const [tileIndex, raw] of Object.entries(config.tileFloats)) {
      const id = typeof raw === 'string' ? raw : raw.id;
      const scaleOverride = typeof raw === 'string' ? undefined : raw.scale;
      const resolved = lookupTileFloat(id);
      addImport(resolved.entry.importPath, resolved.entry.exportName);
      if (resolved.kind === 'sprite') {
        tileFloatConfigs.push({
          type: 'sprite',
          tileIndex: Number(tileIndex),
          def: ref(resolved.entry.exportName),
        });
      } else {
        const entry = {
          type: 'spine',
          tileIndex: Number(tileIndex),
          spineBundle: ref(resolved.entry.exportName),
          lifecycle: 'onPass',
        };
        if (scaleOverride !== undefined) entry.scale = scaleOverride;
        tileFloatConfigs.push(entry);
      }
    }
  }

  // ── Generate output ──

  const lines = [];

  // Header
  lines.push(`// @generated — do not edit by hand. Edit ${variantName}.variant.js instead.`);
  lines.push('');

  // Type imports
  lines.push("import type { PlayableScript } from '../PlayableDirector';");
  lines.push("import type { FightSceneConfig } from '../fight/FightStep';");
  if (config.promoCode) {
    lines.push("import { createPromoOverlay } from '@shared/ui/PromoOverlay';");
  } else if (config.logoOverlay) {
    lines.push("import { createLogoOverlay } from '@shared/ui/LogoOverlay';");
  }
  lines.push('');

  // ── Scene-class set: which scenes does this variant actually use? ──
  // Walk events to determine the minimum scene classes the variant needs.
  // Codegen emits imports + a `sceneClasses` map for only this set, so unused
  // scenes (and their statically-imported assets — webps, atlases) drop out
  // of the bundle. PlayableDirector throws at runtime if it tries to
  // instantiate a scene not present in the map.
  const usedSceneClasses = new Set();
  // Also collect mid-fight step events (some fight steps embed full PlayableEvents
  // like inline levelups) so we don't miss scene classes referenced from those.
  const eventsToScan = [...config.events, ...(config.leadingEvents || [])];
  for (const fightCfg of Object.values(config.fights || {})) {
    for (const step of fightCfg.steps || []) {
      if (step.type === 'levelup' || step.type === 'weaponReward' || step.type === 'heroReward') {
        eventsToScan.push(step);
      }
    }
  }
  for (const event of eventsToScan) {
    switch (event.type) {
      case 'fight':         usedSceneClasses.add('FightScene'); break;
      case 'levelup':       usedSceneClasses.add('LevelUpScene'); break;
      case 'gameEnd':       usedSceneClasses.add('GameEndScene'); break;
      case 'nextChapter':   usedSceneClasses.add('NextChapterScene'); break;
      case 'treasure':      usedSceneClasses.add('TreasureChestScene'); break;
      case 'dialogue':      usedSceneClasses.add('DialogueScene'); break;
      case 'luckyWheel':    usedSceneClasses.add('LuckyWheelScene'); break;
      case 'slotReels':     usedSceneClasses.add('SlotReelsScene'); break;
      case 'blackjack':     usedSceneClasses.add('BlackjackScene'); break;
      case 'diceBlackjack': usedSceneClasses.add('DiceBlackjackScene'); break;
      case 'endCard':       usedSceneClasses.add('EndCardScene'); break;
      case 'shop':          usedSceneClasses.add('ShopScene'); break;
      case 'weaponReward':
        // Always include WeaponRewardScene as the no-prior-fight fallback,
        // even when discovery: true (lastFightBg may be null at runtime).
        usedSceneClasses.add('WeaponRewardScene');
        if (event.discovery) usedSceneClasses.add('RewardDiscoveryScene');
        break;
      case 'heroReward':
        usedSceneClasses.add('HeroRewardScene');
        if (event.discovery) usedSceneClasses.add('RewardDiscoveryScene');
        break;
      // tilePopup/loot are handled by BoardScene overlays — they each pull in
      // their own popup class (with statically imported webp/audio).
      case 'tilePopup':    usedSceneClasses.add('StatChangePopup'); break;
      case 'loot':         usedSceneClasses.add('LootToast'); break;
    }
  }

  // FightProgressBarH is no-board-only; gate it so board variants drop it.
  if (config.showFightProgress) {
    usedSceneClasses.add('FightProgressBarH');
  }

  // HUDs — each owns its own asset import. Include only the HUDs the variant
  // actually renders so unused HUD modules (and their webp imports) drop out.
  // Detection mirrors PlayableDirector's hasCoinEvents check + stats flags.
  const hasCoinEventsForHud = [...config.events, ...(config.leadingEvents || [])].some(e =>
    e.type === 'treasure' || e.type === 'loot'
    || e.type === 'shop' || e.type === 'blackjack' || e.type === 'diceBlackjack',
  );
  if (config.stats && config.stats.showXp) {
    usedSceneClasses.add('XpHud');
  }
  if (config.stats && config.stats.atkDisplay === 'bar') {
    usedSceneClasses.add('AtkHud');
  }
  if ((config.stats && config.stats.showCoins) || hasCoinEventsForHud) {
    usedSceneClasses.add('CoinHud');
  }

  // Per-variant scene class imports (only the scenes/popups/HUDs referenced
  // by this variant's events + feature flags). These are static imports so
  // webpack treats unused ones — and their statically-imported assets — as
  // dead code. Each entry maps to the import path for that class.
  const SCENE_CLASS_PATHS = {
    StatChangePopup:   '../board/popups/StatChangePopup',
    LootToast:         '../board/popups/LootToast',
    FightProgressBarH: '../FightProgressBarH',
    XpHud:             '../hud/XpHud',
    AtkHud:            '../hud/AtkHud',
    CoinHud:           '../hud/CoinHud',
    // Cross-folder scenes (live outside board-fight's scenes/ dir). The default
    // ../scenes/<Name> would be wrong for these, so they need explicit paths.
    // BlackjackScene.ts re-exports the `DiceBlackjackScene` alias, so the
    // emitted `import { DiceBlackjackScene } from '...'` resolves correctly.
    DiceBlackjackScene: '../../dice-blackjack/BlackjackScene',
    EndCardScene:       '../../end_card/EndCardScene',
    // Default for everything else: scenes/<Name>
  };
  for (const name of [...usedSceneClasses].sort()) {
    const path = SCENE_CLASS_PATHS[name] ?? `../scenes/${name}`;
    lines.push(`import { ${name} } from '${path}';`);
  }

  // Catalog imports (sorted by path for deterministic output)
  const sortedImports = [...imports.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [importPath, exportNames] of sortedImports) {
    const names = [...exportNames].sort().join(', ');
    lines.push(`import { ${names} } from '${importPath}';`);
  }

  // Default imports (battle backgrounds etc.)
  for (const [importPath, alias] of defaultImports) {
    lines.push(`import ${alias} from '${importPath}';`);
  }

  // Game end image imports (exported so debug.ts can reuse without duplicating)
  for (const [filename, alias] of gameEndImageImports) {
    lines.push(`import ${alias} from 'assets/Splash/${filename}';`);
  }
  if (gameEndImageImports.size > 0) {
    const aliases = [...gameEndImageImports.values()].join(', ');
    lines.push(`export { ${aliases} };`);
  }
  lines.push('');

  // Promo overlay wrapper (binds config into zero-arg factory matching PlayableScript)
  if (config.promoCode) {
    // rewardImage needs a webpack import, not a string literal
    let rewardImageImportAlias = null;
    if (config.promoCode.rewardImage) {
      rewardImageImportAlias = 'rewardImageData';
      lines.push(`import ${rewardImageImportAlias} from 'assets/UI/${config.promoCode.rewardImage}';`);
    }
    const promoObj = { ...config.promoCode };
    delete promoObj.rewardImage;
    let promoStr = serialize(promoObj, 0);
    if (rewardImageImportAlias) {
      // Insert rewardImage property referencing the import variable
      promoStr = promoStr.replace(/\}$/, `, rewardImage: ${rewardImageImportAlias} }`);
    }
    lines.push(`const createLogoOverlay = () => createPromoOverlay(${promoStr});`);
    lines.push('');
  }

  // ALL_SKILLS
  lines.push('// ── All skills (tree-shaking boundary) ──');
  lines.push('');
  lines.push('export const ALL_SKILLS = [');
  for (let i = 0; i < skillExports.length; i += 3) {
    const chunk = skillExports.slice(i, i + 3);
    lines.push('  ' + chunk.join(', ') + ',');
  }
  lines.push('];');
  lines.push('');

  // Fight configs
  lines.push('// ── Fight Configs ──');
  lines.push('');

  const { hp, maxHp } = config.initialState;
  // Resolve hero skin: if hero config specifies a hero, use ref to its skinName; else default 'Base'
  const playerSkin = initialHeroEntry
    ? ref(initialHeroEntry.exportName + '.skinName')
    : 'Base';
  const playerActor = {
    spine: ref(heroEntry.exportName),
    skin: playerSkin,
    maxHp,
    hp,
    maxRage: 100,
    melee: true,
  };

  for (const [fightName, fightCfg] of Object.entries(config.fights || {})) {
    const resolved = {};

    // Top-level fight fields
    if (fightCfg.bossFight) resolved.bossFight = true;
    if (fightCfg.eliteFight) resolved.eliteFight = true;
    if (fightCfg.characterScale != null) resolved.characterScale = fightCfg.characterScale;
    {
      const bgName = fightCfg.background || 'stage1';
      const bgEntry = lookup('battleBgs', bgName);
      resolved.background = ref(bgEntry.alias);
    }

    // Players (auto-generated from initialState)
    resolved.players = [playerActor];

    // Enemies (resolve string IDs to spine refs)
    resolved.enemies = fightCfg.enemies.map(e => {
      const enemyEntry = REGISTRY.enemies[e.enemy];
      const { enemy, ...rest } = e;
      return { spine: ref(enemyEntry.exportName), ...rest };
    });

    // Steps (resolve mid-fight levelup/weaponReward IDs)
    resolved.steps = fightCfg.steps.map(step => {
      if (step.type === 'levelup' && step.skills) {
        const rounds = Array.isArray(step.skills[0]) ? step.skills : [step.skills];
        return {
          type: 'levelup',
          config: {
            skills: rounds.map(round =>
              round.map(id => ref(lookup('skills', id).exportName))
            ),
          },
        };
      }
      if (step.type === 'weaponReward') {
        const entry = lookup('weapons', step.weapon);
        addImport(entry.importPath, entry.exportName);
        if (entry.uiExport) addImport(entry.importPath, entry.uiExport);
        const result = {
          type: 'weaponReward',
          config: {
            displaySprite: entry.uiExport ? ref(entry.uiExport) : ref(entry.exportName + '.spriteData'),
            weaponConfig: ref(entry.exportName),
            weaponId: entry.displayName,
          },
        };
        if (step.atkBoost != null) result.atkBoost = step.atkBoost;
        return result;
      }
      return step;
    });

    // onVictory
    if (fightCfg.onVictory) resolved.onVictory = fightCfg.onVictory;

    lines.push(`const ${fightName}Fight: FightSceneConfig = ${serialize(resolved, 0)};`);
    lines.push('');
  }

  // Main script export
  lines.push('// ── Playable Script ──');
  lines.push('');

  const heroSkinValue = initialHeroEntry
    ? ref(initialHeroEntry.exportName + '.skinName')
    : 'Base';
  // Pre-loaded skill loadout (default none). Each id must be a registered skill
  // AND present in allSkills — the in-fight skill bar renders state.skills ∩
  // allSkills, so a loaded id missing from allSkills would silently not show.
  const initialSkills = (config.initialState.skills ?? []).map((id) => {
    lookup('skills', id); // hard-fails on unknown id
    if (!(config.allSkills ?? []).includes(id)) {
      console.error(`ERROR: initialState.skills "${id}" is not in allSkills (won't render in the skill bar)`);
      process.exit(1);
    }
    return id;
  });
  const initialStateData = {
    hp: config.initialState.hp,
    maxHp: config.initialState.maxHp,
    atk: config.initialState.atk,
    skills: initialSkills,
    weapon: initialWeapon.displayName,
    weaponConfig: ref(initialWeapon.exportName),
    heroSkin: heroSkinValue,
    // Configurable start tile (default 0). Lets a variant move where the hero
    // starts so scripted spins land on specific painted tiles.
    boardTileIndex: config.initialState.boardTileIndex ?? 0,
  };

  // Build events data with refs. Nested so it closes over gameEndImageImports,
  // REGISTRY, heroEntry, ref(), etc. Used for both config.events and the
  // Direction-B config.leadingEvents (pass-through events fall through the
  // final `return event;` and serialize as plain object literals).
  function transformEvent(event) {
    if (event.type === 'fight') {
      const { type, fight, ...rest } = event;
      return { type: 'fight', config: ref(`${fight}Fight`), ...rest };
    }
    if (event.type === 'weaponReward') {
      const entry = REGISTRY.weapons[event.weapon];
      const { type, weapon, ...rest } = event;
      return {
        type: 'weaponReward',
        config: {
          displaySprite: entry.uiExport ? ref(entry.uiExport) : ref(entry.exportName + '.spriteData'),
          weaponConfig: ref(entry.exportName),
          weaponId: entry.displayName,
        },
        ...rest,
      };
    }
    if (event.type === 'heroReward') {
      const entry = REGISTRY.heroes[event.hero];
      const { type, hero, ...rest } = event;
      return {
        type: 'heroReward',
        config: {
          heroConfig: ref(entry.exportName),
          heroBundle: ref(heroEntry.exportName),
        },
        ...rest,
      };
    }
    if (event.type === 'levelup') {
      if (!event.skills) {
        // Dynamic level-up — skills computed at runtime
        const result = { type: 'levelup' };
        if (event.layout) result.config = { layout: event.layout };
        if (event.atkBoost != null) result.atkBoost = event.atkBoost;
        return result;
      }
      const rounds = Array.isArray(event.skills[0]) ? event.skills : [event.skills];
      const config = {
        skills: rounds.map(round =>
          round.map(id => ref(REGISTRY.skills[id].exportName))
        ),
      };
      if (event.layout) config.layout = event.layout;
      const result = { type: 'levelup', config };
      if (event.atkBoost != null) result.atkBoost = event.atkBoost;
      return result;
    }
    if (event.type === 'gameEnd') {
      const alias = gameEndImageImports.get(event.image);
      return {
        type: 'gameEnd',
        config: {
          displayImage: ref(alias),
        },
      };
    }
    if (event.type === 'nextChapter') {
      const alias = gameEndImageImports.get(event.image);
      const config = {
        bannerImage: ref(alias),
      };
      if (event.victoryText) config.victoryText = event.victoryText;
      if (event.buttonText) config.buttonText = event.buttonText;
      if (event.buttonColor != null) config.buttonColor = event.buttonColor;
      return {
        type: 'nextChapter',
        config,
      };
    }
    return event;
  }

  const eventsData = config.events.map(transformEvent);
  const leadingEventsData = (config.leadingEvents || []).map(transformEvent);

  lines.push(`export const ${variantName}Script: PlayableScript = {`);
  lines.push(`  initialState: ${serialize(initialStateData, 1)},`);
  if (boardExport) {
    lines.push(`  board: ${boardExport},`);
  }
  if (centerEnemyExport) {
    lines.push(`  centerEnemy: ${centerEnemyExport},`);
  }
  if (centerEnemyScale !== null) {
    lines.push(`  centerEnemyScale: ${centerEnemyScale},`);
  }
  if (centerEnemyPosition !== null) {
    lines.push(`  centerEnemyPosition: ${serialize(centerEnemyPosition, 1)},`);
  }
  if (config.rolls) {
    const allNull = config.rolls.every(r => r === null);
    if (allNull) {
      lines.push(`  rolls: Array(${config.rolls.length}).fill(null),`);
    } else {
      lines.push(`  rolls: ${serialize(config.rolls, 1)},`);
    }
  }
  if (config.stats) {
    lines.push(`  stats: ${serialize(config.stats, 1)},`);
  }
  if (config.dynamicLevelUp) {
    lines.push('  dynamicLevelUp: true,');
  }
  if (config.showFightProgress) {
    lines.push('  showFightProgress: true,');
  }
  if (config.use3dDice) {
    lines.push('  use3dDice: true,');
  }
  if (config.pulseRollButton) {
    lines.push('  pulseRollButton: true,');
  }
  if (config.hitsCounter) {
    lines.push('  hitsCounter: true,');
  }
  if (config.xpFlyAfterFights) {
    lines.push('  xpFlyAfterFights: true,');
  }
  if (config.promoCode || config.logoOverlay) {
    lines.push('  createLogoOverlay,');
  }
  if (tileFloatConfigs.length > 0) {
    lines.push(`  tileFloats: ${serialize(tileFloatConfigs, 1)},`);
  }
  if (Array.isArray(config.ctaTriggers) && config.ctaTriggers.length > 0) {
    lines.push(`  ctaTriggers: ${serialize(config.ctaTriggers, 1)},`);
  }
  lines.push('  allSkills: ALL_SKILLS,');
  // sceneClasses: per-variant scene constructor map. Only the scenes used
  // by this variant's events are listed here — unused ones (and their
  // assets) get tree-shaken out of the bundle.
  if (usedSceneClasses.size > 0) {
    const sceneClassNames = [...usedSceneClasses].sort();
    lines.push('  sceneClasses: {');
    for (const name of sceneClassNames) {
      lines.push(`    ${name},`);
    }
    lines.push('  },');
  } else {
    lines.push('  sceneClasses: {},');
  }
  // Direction-B cold-open: full-screen events that play BEFORE the board mounts.
  if (config.leadingEvents && config.leadingEvents.length > 0) {
    lines.push(`  leadingEvents: ${serialize(leadingEventsData, 1)},`);
  }
  lines.push(`  events: ${serialize(eventsData, 1)},`);
  lines.push('};');
  lines.push('');

  // Write output
  const output = lines.join('\n');
  fs.writeFileSync(outputPath, output, 'utf8');
  console.log(`Generated: ${path.relative(process.cwd(), outputPath)}`);
}

main();
