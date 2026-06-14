const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeRenameMap, parseRenameMap, canonicalCsvHash } = require('./csv');

const rows = [
  { old_path: 'Button/B_Old', new_name: 'Button_New', change_types: 'typo-fix', reason: 'Mian->Main' },
  { old_path: 'Icon/Aaa', new_name: 'Icon_Aaa', change_types: 'prefix-realign', reason: 'realign' },
];

test('write then parse round-trips rows and exposes the header hash', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'csv-')), 'rename-map.csv');
  writeRenameMap(f, rows);
  const { rows: got, headerHash } = parseRenameMap(f);
  assert.equal(got.length, 2);
  const byOld = Object.fromEntries(got.map((r) => [r.old_path, r]));
  assert.equal(byOld['Button/B_Old'].new_name, 'Button_New');
  assert.equal(byOld['Icon/Aaa'].new_name, 'Icon_Aaa');
  assert.equal(headerHash, canonicalCsvHash(rows));
});

test('hash ignores reason text and row order, but not the mapping', () => {
  const reordered = [rows[1], { ...rows[0], reason: 'different note' }];
  assert.equal(canonicalCsvHash(reordered), canonicalCsvHash(rows));
  const changed = [{ ...rows[0], new_name: 'Button_Changed' }, rows[1]];
  assert.notEqual(canonicalCsvHash(changed), canonicalCsvHash(rows));
});

test('commas/quotes in fields survive round-trip', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'csv-')), 'm.csv');
  const tricky = [{ old_path: 'X/a', new_name: 'X_a', change_types: 'variant', reason: 'has, comma and "quote"' }];
  writeRenameMap(f, tricky);
  assert.equal(parseRenameMap(f).rows[0].reason, 'has, comma and "quote"');
});

// Guards against a regen that rewrites the rows but forgets to recompute the header hash —
// the rename apply path aborts on a header/body mismatch, so a stale committed file would
// silently break every future rename run.
test('committed rename-map.csv header hash matches its body', () => {
  const committed = path.join(__dirname, '..', '..', 'Components', '_index', 'rename-map.csv');
  if (!fs.existsSync(committed)) return; // not generated yet (fresh checkout) — nothing to verify
  const { rows: got, headerHash } = parseRenameMap(committed);
  assert.equal(headerHash, canonicalCsvHash(got), 'rename-map.csv header hash is stale — re-run npm run audit:components');
});
