const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openJournal, planResume } = require('./journal');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'jrnl-')); }

test('a fresh journal records the header and renames to .done on close', () => {
  const dir = tmp();
  const jsonlPath = path.join(dir, 'rename-journal.jsonl');
  const j = openJournal(jsonlPath, { csvSha256: 'abc', confirmCount: 1 });
  j.start('Old');
  j.pngDone('Old');
  j.complete('Old');
  const donePath = j.close();
  assert.ok(donePath.endsWith('.done'));
  assert.ok(!fs.existsSync(jsonlPath), 'active .jsonl should be renamed away on close');
  const lines = fs.readFileSync(donePath, 'utf8').trim().split('\n');
  assert.deepEqual(JSON.parse(lines[0]), { csvSha256: 'abc', confirmCount: 1, type: 'header' });
  assert.deepEqual(JSON.parse(lines[3]), { type: 'pair', id: 'Old', state: 'complete' });
});

test('resume aborts when the CSV hash changed since the journal started', () => {
  const dir = tmp();
  const p = path.join(dir, 'rename-journal.jsonl');
  fs.writeFileSync(p, JSON.stringify({ type: 'header', csvSha256: 'OLD', confirmCount: 1 }) + '\n');
  assert.throws(() => planResume(p, 'NEW'), /csv.*changed|hash/i);
});

test('resume: png-done -> finish meta; pending+oldGone+newPresent -> complete; pending+bothGone -> abort', () => {
  const dir = tmp();
  const p = path.join(dir, 'rename-journal.jsonl');
  const entries = [
    { type: 'header', csvSha256: 'H', confirmCount: 3 },
    { type: 'pair', id: 'A', state: 'png-done' },
    { type: 'pair', id: 'B', state: 'pending' },
    { type: 'pair', id: 'C', state: 'pending' },
  ];
  fs.writeFileSync(p, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');

  const plan = planResume(p, 'H', {
    oldExists: (id) => id === 'B' ? false : id === 'C' ? false : true,
    newExists: (id) => id === 'B' ? true : false,
  });
  assert.equal(plan.find((x) => x.id === 'A').action, 'finish-meta');
  assert.equal(plan.find((x) => x.id === 'B').action, 'skip-complete');
  assert.equal(plan.find((x) => x.id === 'C').action, 'abort');
});
