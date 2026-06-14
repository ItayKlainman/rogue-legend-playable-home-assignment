#!/usr/bin/env node

/**
 * Variant-aware build wrapper.
 *
 * Usage:
 *   node scripts/variant-build.js [--type <playable-type>] [variant] [dev|build] [...extra-args]
 *
 * Examples:
 *   node scripts/variant-build.js demo dev                          # board-fight (default), demo variant
 *   node scripts/variant-build.js --type board-fight demo build     # explicit type
 *   node scripts/variant-build.js --type carnival demo dev          # different playable type
 *
 * Environment:
 *   VARIANT=rogueVictory  — override default variant name
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

let type = 'board-fight';
const typeIdx = args.indexOf('--type');
if (typeIdx !== -1 && args[typeIdx + 1]) {
  type = args[typeIdx + 1];
  args.splice(typeIdx, 2);
}

const variant = process.env.VARIANT || args[0] || 'demo';
const mode = args[1] || 'dev';
const extraArgs = args.slice(2);

const root = path.resolve(__dirname, '..');
const isBoardFight = type === 'board-fight';

console.log(`[variant-build] type=${type} variant=${variant} mode=${mode}`);

const spineDir = path.join(root, 'assets', 'Spine');
const fullJson = path.join(spineDir, 'Main_Character.json');
const strippedJson = path.join(spineDir, 'Main_Character.stripped.json');
const buildJson = path.join(spineDir, 'Main_Character.build.json');

const codegenPath = path.join(root, 'src', 'playables', type, 'scripts', 'codegen.js');
const variantWatchDir = path.join(root, 'src', 'playables', type, 'variants');

if (isBoardFight) {
  if (mode === 'dev') {
    console.log('[variant-build] Running codegen for all variants...');
    execSync(`node "${codegenPath}" --all ${variant}`, { cwd: root, stdio: 'inherit' });
    fs.copyFileSync(fullJson, buildJson);
    console.log('[variant-build] Using full Main_Character.json for dev');
  } else {
    console.log(`[variant-build] Running codegen for ${variant}...`);
    execSync(`node "${codegenPath}" ${variant}`, { cwd: root, stdio: 'inherit' });
    execSync(`node scripts/strip-spine-skins.js ${variant}`, { cwd: root, stdio: 'inherit' });
    fs.copyFileSync(strippedJson, buildJson);
    console.log('[variant-build] Using stripped Main_Character.json for production');
    execSync(`node scripts/strip-spine-enemies.js ${variant}`, { cwd: root, stdio: 'inherit' });
  }
} else if (fs.existsSync(codegenPath)) {
  if (mode === 'dev') {
    execSync(`node "${codegenPath}" --all ${variant}`, { cwd: root, stdio: 'inherit' });
  } else {
    execSync(`node "${codegenPath}" ${variant}`, { cwd: root, stdio: 'inherit' });
  }
}

// Inject PLAYABLE_TYPE into build.json defines for the dev server.
// Also set `app` to the playable type so it appears at the start of build filenames
// (filename template uses `{app}_…`).
const buildJsonPath = path.join(root, 'build.json');
const buildConfig = JSON.parse(fs.readFileSync(buildJsonPath, 'utf8'));
const originalDefines = { ...buildConfig.defines };
const originalApp = buildConfig.app;
const originalName = buildConfig.name;
buildConfig.defines = buildConfig.defines || {};
buildConfig.defines.PLAYABLE_TYPE = JSON.stringify(type);
buildConfig.defines.PLAYABLE_VARIANT = JSON.stringify(variant);
buildConfig.app = type;
// Put the variant in the output filename so AppLovin creatives stay
// distinguishable per rig (filename template: {app}_{name}_{version}_…).
// Skip for board-fight which uses its own codegen-driven naming, and for the
// plain "demo" label which carries no rigging semantics.
if (!isBoardFight && variant !== 'demo') {
  // {name} is just the variant — dropping the "IdleShowcase_" prefix keeps
  // the produced filename under Google Ads' 50-character cap.
  buildConfig.name = variant;
}
// Short `app` alias for dice-blackjack so filenames fit ad-network limits
// (Google Ads HTML5 caps the filename at 50 chars). The runtime PLAYABLE_TYPE
// define above still uses the full `type` string — only the filename changes.
const FILENAME_APP_ALIAS = {
  'dice-blackjack': 'dice_bj',
};
if (FILENAME_APP_ALIAS[type]) {
  buildConfig.app = FILENAME_APP_ALIAS[type];
}
fs.writeFileSync(buildJsonPath, JSON.stringify(buildConfig, null, 2) + '\n', 'utf8');

function restoreBuildJson() {
  buildConfig.defines = originalDefines;
  buildConfig.app = originalApp;
  buildConfig.name = originalName;
  fs.writeFileSync(buildJsonPath, JSON.stringify(buildConfig, null, 2) + '\n', 'utf8');
}

if (mode === 'dev') {
  const children = [];

  if (isBoardFight) {
    const watcher = spawn('node', ['scripts/variant-watcher.js'], {
      cwd: root,
      stdio: 'inherit',
    });
    children.push(watcher);
  }

  const devServer = spawn('playable-scripts', ['dev'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  children.push(devServer);

  function cleanup(code) {
    restoreBuildJson();
    children.forEach(c => c.kill());
    process.exit(code ?? 0);
  }

  devServer.on('exit', cleanup);
  if (children.length > 1) {
    children[0].on('exit', cleanup);
  }
  process.on('SIGINT', () => cleanup(0));
  process.on('SIGTERM', () => cleanup(0));
} else {
  try {
    const cmd = `playable-scripts ${mode} ${extraArgs.join(' ')}`.trim();
    execSync(cmd, { cwd: root, stdio: 'inherit' });
  } finally {
    restoreBuildJson();
  }
}
