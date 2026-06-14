import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import fs from 'node:fs';

// ── Path resolution (mirror dice-blackjack/__tests__/run.mjs ROOT derivation) ──
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../../..');
const CODEGEN = resolve(__dirname, '../scripts/codegen.js');
const VARIANTS_DIR = resolve(__dirname, '../variants');

const FIXTURE_NAME = '__cg_fixture';
const VARIANT_PATH = resolve(VARIANTS_DIR, `${FIXTURE_NAME}.variant.js`);
const GENERATED_PATH = resolve(VARIANTS_DIR, `${FIXTURE_NAME}.generated.ts`);

// Fixture variant config: exercises the new diceBlackjack + endCard event types
// and the Direction-B leadingEvents cold-open mechanism. fights: {} ensures the
// no-fights path doesn't crash codegen.
const FIXTURE_SOURCE = `module.exports = {
  initialState: { hp: 1000, maxHp: 1000, atk: 100, hero: 'base', weapon: 'warriorBlade', boardTileIndex: 14 },
  allSkills: ['chainLightning'],
  fights: {},
  board: 'board1',
  rolls: [{ hops: 3, major: true }],
  leadingEvents: [{ type: 'diceBlackjack', rig: 'winRigged', music: true }],
  events: [{ type: 'diceBlackjack', rig: 'winRigged' }, { type: 'endCard' }],
};
`;

// Cleanup ALWAYS runs (even if assertions throw), and never touches
// _active.generated.ts (codegen invoked with --skip-active).
after(() => {
  for (const p of [VARIANT_PATH, GENERATED_PATH]) {
    try {
      fs.rmSync(p, { force: true });
    } catch {
      /* ignore */
    }
  }
});

test('codegen emits diceBlackjack/endCard scenes + leadingEvents (subprocess)', () => {
  fs.writeFileSync(VARIANT_PATH, FIXTURE_SOURCE, 'utf8');

  const result = spawnSync('node', [CODEGEN, FIXTURE_NAME, '--skip-active'], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  // codegen process.exit(1)s on any error — exit 0 means it accepted the config.
  assert.equal(
    result.status,
    0,
    `codegen exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  assert.ok(fs.existsSync(GENERATED_PATH), 'generated file was not written');
  const out = fs.readFileSync(GENERATED_PATH, 'utf8');

  // 1. DiceBlackjackScene imported from the cross-folder path. Account for
  //    codegen possibly grouping/sorting names: find the import line for that
  //    path and assert DiceBlackjackScene is among the imported names.
  const diceImport = out
    .split('\n')
    .find(l => l.includes("from '../../dice-blackjack/BlackjackScene'"));
  assert.ok(diceImport, 'no import from ../../dice-blackjack/BlackjackScene');
  assert.match(diceImport!, /\bDiceBlackjackScene\b/);

  // 2. EndCardScene imported from the cross-folder path.
  const endImport = out
    .split('\n')
    .find(l => l.includes("from '../../end_card/EndCardScene'"));
  assert.ok(endImport, 'no import from ../../end_card/EndCardScene');
  assert.match(endImport!, /\bEndCardScene\b/);

  // 3. sceneClasses map registers both scenes.
  const sceneClassesBlock = out.slice(out.indexOf('sceneClasses:'));
  assert.match(sceneClassesBlock, /\bDiceBlackjackScene\b/, 'DiceBlackjackScene not in sceneClasses');
  assert.match(sceneClassesBlock, /\bEndCardScene\b/, 'EndCardScene not in sceneClasses');

  // 4. leadingEvents emitted with a diceBlackjack entry carrying rig: 'winRigged'.
  assert.match(out, /leadingEvents:/, 'leadingEvents not emitted');
  const leadingBlock = out.slice(out.indexOf('leadingEvents:'), out.indexOf('events:'));
  assert.match(leadingBlock, /type: 'diceBlackjack'/, 'leadingEvents missing diceBlackjack entry');
  assert.match(leadingBlock, /rig: 'winRigged'/, "leadingEvents missing rig: 'winRigged'");

  // 5. Coin HUD enabled (diceBlackjack is a coin-bearing event).
  assert.match(out, /import \{ CoinHud \} from/, 'CoinHud not imported');
  assert.match(sceneClassesBlock, /\bCoinHud\b/, 'CoinHud not in sceneClasses');

  // 6. Configurable start tile: initialState.boardTileIndex is emitted into the
  //    generated script (previously hardcoded to 0). Lets a variant move where
  //    the hero starts so scripted spins land on specific painted tiles.
  assert.match(out, /boardTileIndex: 14/, 'configured boardTileIndex not emitted (still hardcoded 0?)');
});

// ── initialState.skills passthrough (pre-loaded skill loadout) ──
// codegen historically hardcoded `skills: []`. Combo variants want a lightning
// build OWNED at fight start (no LevelUpScene pick), which means the authored
// `initialState.skills` must survive into the generated initialState — validated
// against REGISTRY.skills and required to be a subset of allSkills (else the
// skill bar, which renders state.skills ∩ allSkills, can't show the icon).

const SKILLS_FIXTURES = ['__cg_skills_ok', '__cg_skills_not_in_all', '__cg_skills_unknown'];

after(() => {
  for (const name of SKILLS_FIXTURES) {
    fs.rmSync(resolve(VARIANTS_DIR, `${name}.variant.js`), { force: true });
    fs.rmSync(resolve(VARIANTS_DIR, `${name}.generated.ts`), { force: true });
  }
});

function runCodegen(name: string, config: object) {
  const source = `module.exports = ${JSON.stringify(config, null, 2)};\n`;
  fs.writeFileSync(resolve(VARIANTS_DIR, `${name}.variant.js`), source, 'utf8');
  return spawnSync('node', [CODEGEN, name, '--skip-active'], { cwd: ROOT, encoding: 'utf8' });
}

const baseSkillsConfig = {
  initialState: { hp: 1000, maxHp: 1000, atk: 100, hero: 'base', weapon: 'warriorBlade' },
  allSkills: ['chainLightning'],
  fights: {},
  board: 'board1',
  rolls: [{ hops: 3, major: true }],
  events: [{ type: 'endCard' }],
};

test('codegen emits initialState.skills when authored (subprocess)', () => {
  const name = '__cg_skills_ok';
  const result = runCodegen(name, {
    ...baseSkillsConfig,
    initialState: { ...baseSkillsConfig.initialState, skills: ['chainLightning'] },
  });

  assert.equal(
    result.status,
    0,
    `codegen exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  const out = fs.readFileSync(resolve(VARIANTS_DIR, `${name}.generated.ts`), 'utf8');
  assert.match(out, /skills: \['chainLightning'\]/, "initialState.skills not emitted (still hardcoded [])");
});

test('codegen rejects initialState.skills not in allSkills (subprocess)', () => {
  // 'thunderstorm' is a valid REGISTRY skill but absent from allSkills → can't
  // render in the bar → must fail loud at codegen, not silently at runtime.
  const result = runCodegen('__cg_skills_not_in_all', {
    ...baseSkillsConfig,
    initialState: { ...baseSkillsConfig.initialState, skills: ['thunderstorm'] },
  });
  assert.notEqual(result.status, 0, 'codegen should reject initialState.skills not in allSkills');
});

test('codegen rejects unknown initialState.skills id (subprocess)', () => {
  const result = runCodegen('__cg_skills_unknown', {
    ...baseSkillsConfig,
    initialState: { ...baseSkillsConfig.initialState, skills: ['bogusSkill'] },
  });
  assert.notEqual(result.status, 0, 'codegen should reject an unregistered initialState.skills id');
});
