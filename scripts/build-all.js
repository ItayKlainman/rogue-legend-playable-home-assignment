#!/usr/bin/env node
/**
 * build-all.js — Parallel build of all playable types and their variants.
 *
 * Usage:
 *   node scripts/build-all.js [--type <type>] [--concurrency N] [--filter <prefix>] [--network <name>]
 *
 * Without --type:    builds ALL playable types (board-fight, end_card, etc.)
 * With --type:       builds only that type's variants
 * With --network:    builds only that ad network (applovin|unity|google|moloco);
 *                    omitting it builds all four.
 *
 * Outputs:
 *   dist/AppLovin/<variant>.html
 *   dist/Unity/<variant>.html
 *   dist/Google/<variant>.html
 *   dist/Moloco/<variant>.html
 *   --network <name> restricts output to that network's tree only.
 */

const { execSync } = require('child_process');
const { fork } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname, '..');
const spineDir = path.join(root, 'assets', 'Spine');
const tempDir = path.join(root, 'temp');

// ── Parse CLI args ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let concurrency = Math.min(os.cpus().length, 10);
const concIdx = args.indexOf('--concurrency');
if (concIdx !== -1) {
  concurrency = parseInt(args[concIdx + 1], 10);
}

let filterPrefix = null;
const filterIdx = args.indexOf('--filter');
if (filterIdx !== -1) {
  filterPrefix = args[filterIdx + 1];
}

let singleType = null;
const typeIdx = args.indexOf('--type');
if (typeIdx !== -1 && args[typeIdx + 1]) {
  singleType = args[typeIdx + 1];
}

let networkFilter = null;
const networkIdx = args.indexOf('--network');
if (networkIdx !== -1 && args[networkIdx + 1]) {
  networkFilter = args[networkIdx + 1];
}

// ── Discover playable types ─────────────────────────────────────────────────

const playablesDir = path.join(root, 'src', 'playables');

function discoverTypes() {
  if (singleType) {
    return [singleType];
  }
  return fs.readdirSync(playablesDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== '_template')
    .filter(d => fs.existsSync(path.join(playablesDir, d.name, 'index.ts')))
    .map(d => d.name)
    .sort();
}

function discoverVariants(type) {
  const variantDir = path.join(playablesDir, type, 'variants');
  if (!fs.existsSync(variantDir)) {
    return ['demo'];
  }
  const variants = fs.readdirSync(variantDir)
    .filter(f => f.endsWith('.variant.js') && f !== 'demo.variant.js')
    .filter(f => !f.startsWith('__')) // skip __-prefixed test fixtures
    .filter(f => type === 'board-fight' ? !f.includes('_fight_') : true)
    .filter(f => !filterPrefix || f.startsWith(filterPrefix))
    .map(f => f.replace('.variant.js', ''))
    .sort();
  return variants.length > 0 ? variants : ['demo'];
}

const TYPES = discoverTypes();

// One output dir per network — iOS and Android bundles are byte-identical, no split needed.
const ALL_TARGETS = [
  { network: 'applovin', outDir: 'dist/AppLovin' },
  { network: 'unity',    outDir: 'dist/Unity' },
  { network: 'google',   outDir: 'dist/Google' },
  { network: 'moloco',   outDir: 'dist/Moloco' },
];

const UNIQUE_TARGETS = networkFilter
  ? ALL_TARGETS.filter(t => t.network === networkFilter)
  : ALL_TARGETS;

if (networkFilter && UNIQUE_TARGETS.length === 0) {
  console.error(`Unknown --network "${networkFilter}". Valid: ${ALL_TARGETS.map(t => t.network).join(', ')}`);
  process.exit(1);
}

// Ensure node_modules/.bin is on PATH
const binPath = path.join(root, 'node_modules', '.bin');
process.env.PATH = `${binPath}${path.delimiter}${process.env.PATH}`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function hardlinkSpineFiles(variant) {
  const destDir = path.join(tempDir, variant, 'Spine');

  function walkAndLink(srcSubDir, destSubDir) {
    fs.mkdirSync(destSubDir, { recursive: true });
    for (const entry of fs.readdirSync(srcSubDir, { withFileTypes: true })) {
      const srcPath = path.join(srcSubDir, entry.name);
      const destPath = path.join(destSubDir, entry.name);
      if (entry.isDirectory()) {
        walkAndLink(srcPath, destPath);
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.stripped.json') || entry.name === 'Main_Character.build.json') {
          continue;
        }
        try {
          fs.linkSync(srcPath, destPath);
        } catch (err) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
  }

  walkAndLink(spineDir, destDir);
  return destDir;
}

function prepareBoardFightVariant(variant) {
  const tempSpineDir = path.join(tempDir, variant, 'Spine');

  hardlinkSpineFiles(variant);

  const codegenPath = path.join(root, 'src', 'playables', 'board-fight', 'scripts', 'codegen.js');
  execSync(`node "${codegenPath}" ${variant} --skip-active`, { cwd: root, stdio: 'pipe' });

  execSync(`node scripts/strip-spine-skins.js ${variant} --out-dir "${tempSpineDir}"`, { cwd: root, stdio: 'pipe' });
  execSync(`node scripts/strip-spine-enemies.js ${variant} --out-dir "${tempSpineDir}"`, { cwd: root, stdio: 'pipe' });

  return tempSpineDir;
}

function prepareGenericVariant(type, variant) {
  const typeCodegenPath = path.join(root, 'src', 'playables', type, 'scripts', 'codegen.js');
  if (fs.existsSync(typeCodegenPath)) {
    execSync(`node "${typeCodegenPath}" ${variant} --skip-active`, { cwd: root, stdio: 'pipe' });
  }
  return null;
}

// ── Worker pool ─────────────────────────────────────────────────────────────

function runWorkerPool(jobs, concurrency) {
  return new Promise((resolve) => {
    let nextJob = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;
    const errors = [];
    const total = jobs.length;

    if (total === 0) {
      resolve({ completed: 0, failed: 0, errors: [] });
      return;
    }

    function startNext() {
      while (running < concurrency && nextJob < total) {
        const job = jobs[nextJob++];
        running++;

        const worker = fork(path.join(__dirname, 'build-parallel-worker.js'), [], {
          cwd: root,
          silent: true,
        });

        worker.send(job);

        worker.on('message', (msg) => {
          if (msg.status === 'ok') {
            completed++;
            const label = msg.type ? `${msg.type}/${msg.variant}` : msg.variant;
            console.log(`  ✓ [${completed + failed}/${total}] ${label} (${msg.network})`);
          } else {
            failed++;
            const label = msg.type ? `${msg.type}/${msg.variant}` : msg.variant;
            errors.push(`${label} (${msg.network}): ${msg.error}`);
            console.error(`  ✗ [${completed + failed}/${total}] ${label} (${msg.network}) FAILED`);
          }
        });

        worker.on('exit', () => {
          running--;
          if (completed + failed === total) {
            resolve({ completed, failed, errors });
          } else {
            startNext();
          }
        });
      }
    }

    startNext();
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  // Collect all type→variants
  const typeVariants = [];
  let totalVariants = 0;
  for (const type of TYPES) {
    const variants = discoverVariants(type);
    typeVariants.push({ type, variants });
    totalVariants += variants.length;
  }

  const totalJobs = totalVariants * UNIQUE_TARGETS.length;

  console.log(`${'='.repeat(60)}`);
  console.log(`Parallel build: ${TYPES.length} types, ${totalVariants} variants, ${totalJobs} jobs`);
  for (const { type, variants } of typeVariants) {
    console.log(`  ${type}: ${variants.length} variant${variants.length === 1 ? '' : 's'}`);
  }
  console.log(`Concurrency: ${concurrency} workers`);
  console.log('='.repeat(60));

  for (const { outDir } of UNIQUE_TARGETS) {
    fs.mkdirSync(path.join(root, outDir), { recursive: true });
  }

  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // ── Phase 1: Prepare variants ──────────────────────────────────────────

  console.log(`\nPhase 1: Preparing ${totalVariants} variants...`);
  const phase1Start = Date.now();

  const prepBatchSize = concurrency * 2;
  for (const { type, variants } of typeVariants) {
    for (let i = 0; i < variants.length; i += prepBatchSize) {
      const batch = variants.slice(i, i + prepBatchSize);
      await Promise.all(batch.map(variant => {
        return new Promise((resolve, reject) => {
          try {
            if (type === 'board-fight') {
              prepareBoardFightVariant(variant);
            } else {
              prepareGenericVariant(type, variant);
            }
            resolve();
          } catch (err) {
            console.error(`  ✗ Prep failed for ${type}/${variant}: ${err.message}`);
            reject(err);
          }
        });
      }));
    }
  }

  const phase1Sec = ((Date.now() - phase1Start) / 1000).toFixed(1);
  console.log(`Phase 1 complete (${phase1Sec}s)`);

  // ── Phase 2: Webpack builds (worker pool) ───────────────────────────────

  console.log(`\nPhase 2: Building ${totalJobs} bundles (${concurrency} workers)...`);
  const phase2Start = Date.now();

  const jobs = [];
  for (const { type, variants } of typeVariants) {
    const isBoardFight = type === 'board-fight';
    for (const { network, outDir } of UNIQUE_TARGETS) {
      for (const variant of variants) {
        jobs.push({
          type,
          variant,
          network,
          outDir: path.join(root, outDir, type),
          tempSpineDir: isBoardFight ? path.join(tempDir, variant, 'Spine') : null,
        });
      }
    }
  }

  const results = await runWorkerPool(jobs, concurrency);

  const phase2Sec = ((Date.now() - phase2Start) / 1000).toFixed(1);
  console.log(`Phase 2 complete (${phase2Sec}s)`);

  // ── Phase 3: Cleanup ────────────────────────────────────────────────────

  if (fs.existsSync(tempDir)) {
    console.log('\nPhase 3: Cleaning up temp dirs...');
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // ── Summary ─────────────────────────────────────────────────────────────

  const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Build complete: ${results.completed} succeeded, ${results.failed} failed (${totalSec}s)`);
  if (results.errors.length) {
    console.error('\nFailed builds:');
    results.errors.forEach(e => console.error(`  • ${e}`));
  }
  console.log('='.repeat(60));

  if (results.failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
