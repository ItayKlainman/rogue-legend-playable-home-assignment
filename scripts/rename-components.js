const fs = require('node:fs');
const path = require('node:path');
const { parseRenameMap, canonicalCsvHash } = require('./components/csv');
const { openJournal, planResume } = require('./components/journal');
const { findComponentRefs } = require('./check-component-refs');

// Find the on-disk meta for a base name, returning its REAL-cased path so a case-only
// rename of the meta is a real fs.renameSync (not a string no-op on case-insensitive FS).
function findOldMeta(dir, base) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir)) {
    if (!/\.meta$/i.test(entry)) continue;
    const stem = entry.slice(0, entry.length - 5); // strip ".meta"
    if (/\.png$/i.test(stem) && stem.slice(0, stem.length - 4) === base) return path.join(dir, entry);
  }
  return null;
}

// Resolve the actual on-disk png for an id (old_path is id-style: "Category/.../Name").
// Returns the REAL-cased path (e.g. ".../Foo.Png") so a case-only rename isn't a string no-op.
function pngPathFor(componentsDir, idLike) {
  const abs = path.join(componentsDir, idLike);
  const dir = path.dirname(abs);
  const base = path.basename(abs);
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir)) {
      if (!/\.png$/i.test(entry) || /\.meta$/i.test(entry)) continue;
      if (entry.slice(0, entry.length - 4) === base) return path.join(dir, entry); // exact name-part, real ext case
    }
  }
  return path.join(componentsDir, idLike + '.png'); // fallback (won't exist -> renameSync throws loudly)
}

function applyRenames({ componentsDir, rows, csvSha256, confirmCount }) {
  if (rows.length !== confirmCount) {
    throw new Error(`--confirm-count mismatch: CSV has ${rows.length} row(s), you passed ${confirmCount}`);
  }
  // Case-insensitive target collision check.
  const lowerTargets = new Map();
  for (const r of rows) {
    const key = path.join(path.dirname(r.old_path), r.new_name).toLowerCase();
    if (lowerTargets.has(key)) throw new Error(`case-insensitive collision: "${r.new_name}" collides with "${lowerTargets.get(key)}"`);
    lowerTargets.set(key, r.new_name);
  }
  // Refuse to overwrite a DIFFERENT existing file. Allow a case-only rename of the same
  // file (macOS/Windows case-insensitive FS: e.g. Foo.Png -> Foo.png is the same inode).
  for (const r of rows) {
    const srcPng = pngPathFor(componentsDir, r.old_path);
    const target = path.join(componentsDir, path.dirname(r.old_path), r.new_name + '.png');
    if (fs.existsSync(target)) {
      const sameFile = fs.existsSync(srcPng) && fs.statSync(target).ino === fs.statSync(srcPng).ino;
      if (!sameFile) throw new Error(`target already exists, refusing to overwrite: ${target}`);
    }
  }

  const indexDir = path.join(componentsDir, '_index');
  fs.mkdirSync(indexDir, { recursive: true });
  const journal = openJournal(path.join(indexDir, 'rename-journal.jsonl'), { csvSha256, confirmCount });

  for (const r of rows) {
    journal.start(r.old_path);
    const srcPng = pngPathFor(componentsDir, r.old_path);
    const dir = path.dirname(srcPng);
    const dstPng = path.join(dir, r.new_name + '.png'); // normalize extension case to .png
    fs.renameSync(srcPng, dstPng);
    journal.pngDone(r.old_path);
    const oldMeta = findOldMeta(dir, path.basename(srcPng, path.extname(srcPng))); // real base name
    if (oldMeta) fs.renameSync(oldMeta, dstPng + '.meta');
    journal.complete(r.old_path);
  }
  return journal.close();
}

// Resume an interrupted run from an existing journal, honoring the contract in journal.js.
function resumeFromJournal(componentsDir, journalPath, liveHash, rows) {
  const newNameById = new Map(rows.map((r) => [r.old_path, r.new_name]));
  const plan = planResume(journalPath, liveHash, {
    oldExists: (id) => fs.existsSync(pngPathFor(componentsDir, id)),
    newExists: (id) => fs.existsSync(path.join(componentsDir, path.dirname(id), newNameById.get(id) + '.png')),
  });
  for (const step of plan) {
    if (step.action === 'abort') throw new Error(`pair "${step.id}" lost mid-crash (old gone, new absent) — investigate before retrying`);
    if (step.action === 'do-pair') {
      const src = pngPathFor(componentsDir, step.id);
      const dst = path.join(path.dirname(src), newNameById.get(step.id) + '.png');
      fs.renameSync(src, dst);
    }
    // For finish-meta, skip-complete, AND do-pair: the png is now at the new name;
    // ensure the meta is moved too. Idempotent — no-op if already moved.
    if (step.action === 'finish-meta' || step.action === 'skip-complete' || step.action === 'do-pair') {
      const dir = path.join(componentsDir, path.dirname(step.id));
      const oldMeta = findOldMeta(dir, path.basename(step.id));
      if (oldMeta) fs.renameSync(oldMeta, path.join(dir, newNameById.get(step.id) + '.png.meta'));
    }
  }
  const done = journalPath.replace(/\.jsonl$/, `-${Date.now()}.done`);
  fs.renameSync(journalPath, done);
  return done;
}

module.exports = { applyRenames, resumeFromJournal };

if (require.main === module) {
  const ROOT = path.resolve(__dirname, '..');
  const COMPONENTS = path.join(ROOT, 'Components');
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));

  // Gate 1: no code references to Components/.
  const refs = findComponentRefs(ROOT);
  if (refs.length) { console.error(`Aborting: ${refs.length} code reference(s) to Components/ exist.`); refs.forEach((h) => console.error(`  ${h.file}:${h.line}`)); process.exit(1); }

  const { rows, headerHash } = parseRenameMap(path.join(COMPONENTS, '_index', 'rename-map.csv'));
  const liveHash = canonicalCsvHash(rows);
  if (headerHash && headerHash !== liveHash) { console.error('Aborting: CSV body no longer matches its header hash (was it regenerated?).'); process.exit(1); }
  if (args['expect-csv-sha256'] && args['expect-csv-sha256'] !== liveHash) { console.error('Aborting: --expect-csv-sha256 does not match the CSV.'); process.exit(1); }
  if (args['confirm-count'] == null) { console.error('Refusing: pass --confirm-count=N (N = number of rows you reviewed).'); process.exit(1); }
  const confirmCount = Number(args['confirm-count']);
  if (!Number.isInteger(confirmCount)) { console.error('Refusing: --confirm-count must be an integer (e.g. --confirm-count=861).'); process.exit(1); }

  try {
    const journalPath = path.join(COMPONENTS, '_index', 'rename-journal.jsonl');
    let done;
    if (fs.existsSync(journalPath)) {
      console.log('Found an unfinished journal — resuming the interrupted run.');
      done = resumeFromJournal(COMPONENTS, journalPath, liveHash, rows);
    } else {
      done = applyRenames({ componentsDir: COMPONENTS, rows, csvSha256: liveHash, confirmCount });
    }
    console.log(`Renamed ${rows.length} file pair(s). Journal: ${path.basename(done)}`);
  } catch (err) { console.error(`Aborted: ${err.message}`); process.exit(1); }
}
