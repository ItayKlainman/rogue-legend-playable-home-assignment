#!/usr/bin/env node

/**
 * Strip unused animations from enemy Spine JSON files based on variant config.
 *
 * Reads the variant config to determine which enemies are used and whether they
 * perform rage attacks. Enemies with rage keep ALL animations (their rage anim
 * might be named Ultimate_Attack, Special_Attack, etc.). Enemies without rage
 * get "special" animations stripped.
 *
 * Usage: node scripts/strip-spine-enemies.js [variant-name]
 * Default variant: demo
 */

const fs = require('fs');
const path = require('path');

// ── Animation allowlists ──────────────────────────────────────────────────

// Base animations every enemy needs (FightEngine fallback chains).
const BASE_ANIMS = new Set([
  // Idle
  'Idle', 'Idle_Full', 'Idle_Loop',
  // Movement (ANIM_WALK)
  'Walk', 'Run',
  // Basic/combo/counter attacks
  'Regular_Attack_Melee', 'Basic_Attack_Sword_1', 'Basic_Attack', 'Basic_Attck', 'Attack',
  // Hit reactions
  'TakeHit', 'Take_Hit', 'Hit', 'Hurt', 'Damaged', 'Get_Hit', 'Got_Hit', 'Got_Hit_By_Attack',
  // Death
  'Dead', 'Death', 'Die', 'Dying',
]);

// Rage/ultimate attack animations — kept only for enemies that perform rage attacks.
const RAGE_ANIMS = new Set([
  'Rage_Attack_Melee', 'Rage_Attack',
  'Ultimate_Attack', 'UltimateAttack',
  'Ultimate_Attack_Arm', 'Ultimate_Attack_Body', 'Ultimate_Attack_Demo',
  'Special_Attack', 'Ultimate',
]);

// ── Enemy ID → Spine JSON path mapping ────────────────────────────────────
// Derived from catalog modules in src/catalog/enemies/

const ENEMY_JSON_MAP = {
  skeleton:          'Spine/Skeleton_Warrior.json',
  skeletonKing:      'Spine/Skeleton_King.json',
  slime:             'Spine/Slime.json',
  skeletonArcher:    'Spine/Stage1/Skeleton_Archer.json',
  skeletonCommander: 'Spine/Stage1/Skeleton_Commander.json',
  skeletonMage:      'Spine/Stage1/Skeleton_Mage.json',
  wolf:              'Spine/Stage1/Wolf.json',
  goblinBalista:     'Spine/Stage2/Goblin_Balista.json',
  goblinEngineer:    'Spine/Stage2/Goblin_Engeneer.json',
  goblinGrunt:       'Spine/Stage2/Goblin_Grunt.json',
  goblinHunter:      'Spine/Stage2/Goblin_Hunter.json',
  goblinMage:        'Spine/Stage2/Goblin_Mage.json',
  caveSpider:        'Spine/Stage3/Cave_Spider.json',
  redShroom:         'Spine/Stage3/Red_Shroom.json',
  stoneElemental:    'Spine/Stage3/Stone_Elemental.json',
  dragonBoss:        'Spine/Stage4/Dragon_Boss.json',
  snowSpider:        'Spine/Stage4/Snow_Spider.json',
  trollCultist:      'Spine/Stage4/Troll_Cultist.json',
  trollWarrior:      'Spine/Stage4/Troll_Warrior.json',
  yeti:              'Spine/Stage4/Yeti.json',
  anubis:            'Spine/Stage5/Anubis.json',
  bastet:            'Spine/Stage5/Bastet.json',
  desertHornet:      'Spine/Stage5/Desert_Hornet.json',
  mummyGeneral:      'Spine/Stage5/Mummy_General.json',
  mummyWarrior:      'Spine/Stage5/Mumy_Warrior.json',
  banshee:           'Spine/Stage6/Banshee.json',
  bossTree:          'Spine/Stage6/Boss_Tree.json',
  ghostKnight:       'Spine/Stage6/Ghost_Knight.json',
  livingTree:        'Spine/Stage6/Living_Tree.json',
  goblinOgre:        'Spine/Stage2/Goblin_Ogre.json',
  ancientConstruct:  'Spine/Stage3/Ancient_Construct.json',
  redSlime:          'Spine/Stage3/Red_Slime.json',
  deadSailor:        'Spine/Stage7/Dead_Sailor.json',
  fishMonster:       'Spine/Stage7/Fish_Monster.json',
  kraken:            'Spine/Stage7/Kraken.json',
  pirateCaptain:     'Spine/Stage7/Pirate_Captain.json',
  siren:             'Spine/Stage7/Siren.json',
};

// ── Variant analysis ──────────────────────────────────────────────────────

/**
 * Analyze the variant config to determine which enemies use rage.
 * Returns a Map<enemyId, { hasRage: boolean }>.
 */
function analyzeVariant(config) {
  /** @type {Map<string, { hasRage: boolean }>} */
  const enemyInfo = new Map();

  for (const [fightName, fightCfg] of Object.entries(config.fights || {})) {
    // Collect enemies with their actor indices
    for (let i = 0; i < fightCfg.enemies.length; i++) {
      const e = fightCfg.enemies[i];
      if (!enemyInfo.has(e.enemy)) {
        enemyInfo.set(e.enemy, { hasRage: false });
      }
      // Enemy has maxRage → it can do rage attacks
      if (e.maxRage && e.maxRage > 0) {
        enemyInfo.get(e.enemy).hasRage = true;
      }
    }

    // Check fight steps for rage-category attacks from enemies
    for (const step of (fightCfg.steps || [])) {
      if (step.type !== 'attack') continue;
      if (step.side !== 'enemy') continue;
      if (step.category === 'rage') {
        const enemyCfg = fightCfg.enemies[step.actor];
        if (enemyCfg) {
          const info = enemyInfo.get(enemyCfg.enemy);
          if (info) info.hasRage = true;
        }
      }
    }
  }

  return enemyInfo;
}

// ── Stripping logic ───────────────────────────────────────────────────────

/**
 * Recursively round all float values in a JSON-serializable object to the
 * given number of decimal places. Reduces file size by trimming unnecessary
 * precision from bone positions, animation curves, mesh vertices, etc.
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

function stripEnemyJson(jsonPath, keepRageAnims, outPath) {
  const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const removed = [];

  if (json.animations) {
    const allAnims = Object.keys(json.animations);
    for (const name of allAnims) {
      if (BASE_ANIMS.has(name)) continue;
      if (keepRageAnims && RAGE_ANIMS.has(name)) continue;
      // Not in any allowlist → strip it
      delete json.animations[name];
      removed.push(name);
    }
  }

  // Reduce float precision to save size
  const optimized = truncateFloats(json);

  const strippedPath = outPath || jsonPath.replace(/\.json$/, '.stripped.json');
  fs.writeFileSync(strippedPath, JSON.stringify(optimized), 'utf8');
  return { removed, strippedPath };
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  // Parse --out-dir flag
  let outDir = null;
  const outDirIdx = args.indexOf('--out-dir');
  if (outDirIdx !== -1) {
    outDir = path.resolve(args[outDirIdx + 1]);
    args.splice(outDirIdx, 2);
  }

  const variantName = args[0] || 'demo';
  const root = path.resolve(__dirname, '..');
  const assetsDir = path.join(root, 'assets');
  const spineDir = path.join(assetsDir, 'Spine');

  // Load variant config
  const variantPath = path.join(root, 'src', 'playables', 'board-fight', 'variants', `${variantName}.variant.js`);
  if (!fs.existsSync(variantPath)) {
    console.error(`ERROR: Variant config not found: ${variantPath}`);
    process.exit(1);
  }
  delete require.cache[require.resolve(variantPath)];
  const config = require(variantPath);

  // Analyze which enemies have rage
  const enemyInfo = analyzeVariant(config);

  console.log(`Variant "${variantName}" — enemy rage analysis:`);
  for (const [id, info] of enemyInfo) {
    console.log(`  ${id}: ${info.hasRage ? 'HAS RAGE (keep rage/ultimate anims)' : 'no rage (strip specials)'}`);
  }
  console.log('');

  // Process all enemy JSONs
  let totalOriginal = 0;
  let totalStripped = 0;
  let filesProcessed = 0;

  for (const [enemyId, relJsonPath] of Object.entries(ENEMY_JSON_MAP)) {
    const jsonPath = path.join(assetsDir, relJsonPath);
    if (!fs.existsSync(jsonPath)) continue;

    // Compute output path: if --out-dir, mirror subdirectory structure
    let outPath = null;
    if (outDir) {
      const relFromSpine = path.relative(spineDir, jsonPath);
      outPath = path.join(outDir, relFromSpine.replace(/\.json$/, '.stripped.json'));
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
    }

    const originalSize = fs.statSync(jsonPath).size;
    const info = enemyInfo.get(enemyId);
    const keepRage = info ? info.hasRage : false;

    const result = stripEnemyJson(jsonPath, keepRage, outPath);
    const newSize = fs.statSync(result.strippedPath).size;
    const label = path.relative(root, jsonPath);
    const removedStr = result.removed.length > 0 ? `removed: ${result.removed.join(', ')}` : 'no unused animations';
    console.log(`${label}: ${(originalSize / 1024).toFixed(1)} KB -> ${(newSize / 1024).toFixed(1)} KB (${removedStr})`);
    totalOriginal += originalSize;
    totalStripped += newSize;
    filesProcessed++;
  }

  if (filesProcessed > 0) {
    console.log(`\n${filesProcessed} files stripped: ${(totalOriginal / 1024).toFixed(1)} KB -> ${(totalStripped / 1024).toFixed(1)} KB (saved ${((totalOriginal - totalStripped) / 1024).toFixed(1)} KB)`);
  } else {
    console.log('\nNo animations to strip.');
  }
}

main();
