#!/usr/bin/env node

/**
 * Watches src/variants/*.variant.js for changes and re-runs codegen.
 * Webpack HMR then picks up the regenerated .generated.ts files.
 */

const fs = require('fs');
const chokidar = require('chokidar');
const { execSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const watchGlob = path.join(root, 'src', 'playables', 'board-fight', 'variants', '*.variant.js');
const codegenPath = path.join(root, 'src', 'playables', 'board-fight', 'scripts', 'codegen.js');

console.log('[variant-watcher] Watching for .variant.js changes...');

const watcher = chokidar.watch(watchGlob, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 200 },
});

watcher.on('change', (filePath) => {
  const name = path.basename(filePath, '.variant.js');
  console.log(`[variant-watcher] ${name}.variant.js changed — re-running codegen`);
  try {
    execSync(`node "${codegenPath}" ${name}`, { cwd: root, stdio: 'inherit' });
  } catch (e) {
    console.error(`[variant-watcher] codegen failed for ${name}`);
  }
  // Re-codegen promo wrappers that depend on this base variant
  if (!name.endsWith('_promo') && !name.endsWith('_promoCounter')) {
    for (const suffix of ['_promo', '_promoCounter']) {
      const depName = `${name}${suffix}`;
      const depPath = path.join(root, 'src', 'playables', 'board-fight', 'variants', `${depName}.variant.js`);
      if (fs.existsSync(depPath)) {
        console.log(`[variant-watcher] Re-codegenning dependent ${depName}`);
        try {
          execSync(`node "${codegenPath}" ${depName}`, { cwd: root, stdio: 'inherit' });
        } catch (e) {
          console.error(`[variant-watcher] codegen failed for ${depName}`);
        }
      }
    }
  }
});

watcher.on('add', (filePath) => {
  const name = path.basename(filePath, '.variant.js');
  console.log(`[variant-watcher] New variant ${name}.variant.js detected — running codegen`);
  try {
    execSync(`node "${codegenPath}" ${name}`, { cwd: root, stdio: 'inherit' });
  } catch (e) {
    console.error(`[variant-watcher] codegen failed for ${name}`);
  }
});
