const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyRenames, resumeFromJournal } = require('../rename-components');
const { openJournal } = require('./journal');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-'));
  const cat = path.join(root, 'Button');
  fs.mkdirSync(cat, { recursive: true });
  fs.writeFileSync(path.join(cat, 'Old.png'), 'PNGDATA');
  fs.writeFileSync(path.join(cat, 'Old.png.meta'), 'guid: 1');
  return { root, cat };
}

test('renames png+meta as a pair and writes a .done journal', () => {
  const { root, cat } = setup();
  const rows = [{ old_path: 'Button/Old', new_name: 'Button_New', change_types: 'typo-fix', reason: 'x' }];
  applyRenames({ componentsDir: root, rows, csvSha256: 'H', confirmCount: 1 });
  assert.ok(fs.existsSync(path.join(cat, 'Button_New.png')));
  assert.ok(fs.existsSync(path.join(cat, 'Button_New.png.meta')));
  assert.ok(!fs.existsSync(path.join(cat, 'Old.png')));
  assert.ok(fs.readdirSync(path.join(root, '_index')).some((f) => f.endsWith('.done')));
});

test('confirm-count mismatch aborts before moving anything', () => {
  const { root, cat } = setup();
  const rows = [{ old_path: 'Button/Old', new_name: 'Button_New', change_types: '', reason: '' }];
  assert.throws(() => applyRenames({ componentsDir: root, rows, csvSha256: 'H', confirmCount: 99 }), /confirm-count|count/i);
  assert.ok(fs.existsSync(path.join(cat, 'Old.png'))); // untouched
});

test('case-insensitive collision in targets aborts', () => {
  const { root } = setup();
  const rows = [
    { old_path: 'Button/Old', new_name: 'Button_Dup', change_types: '', reason: '' },
    { old_path: 'Button/Old', new_name: 'button_dup', change_types: '', reason: '' },
  ];
  assert.throws(() => applyRenames({ componentsDir: root, rows, csvSha256: 'H', confirmCount: 2 }), /collision|case/i);
});

test('refuses to overwrite an existing target', () => {
  const { root, cat } = setup();
  fs.writeFileSync(path.join(cat, 'Button_New.png'), 'EXISTING');
  const rows = [{ old_path: 'Button/Old', new_name: 'Button_New', change_types: '', reason: '' }];
  assert.throws(() => applyRenames({ componentsDir: root, rows, csvSha256: 'H', confirmCount: 1 }), /exists|overwrite/i);
});

test('allows a case-only rename of the same file (does not false-trip overwrite guard)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-'));
  const cat = path.join(root, 'Button');
  fs.mkdirSync(cat, { recursive: true });
  fs.writeFileSync(path.join(cat, 'Foo.png'), 'PNGDATA');
  fs.writeFileSync(path.join(cat, 'Foo.png.meta'), 'guid: 1');
  // new_name === existing base name: target resolves to the same file -> must be allowed, not an overwrite error
  const rows = [{ old_path: 'Button/Foo', new_name: 'Foo', change_types: 'ext-case', reason: 'x' }];
  assert.doesNotThrow(() => applyRenames({ componentsDir: root, rows, csvSha256: 'H', confirmCount: 1 }));
  assert.ok(fs.existsSync(path.join(cat, 'Foo.png')));
  assert.ok(fs.existsSync(path.join(cat, 'Foo.png.meta')));
});

test('resumeFromJournal: skip-complete recovers an orphaned meta (png moved, meta not)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-'));
  const cat = path.join(root, 'Button');
  fs.mkdirSync(path.join(root, '_index'), { recursive: true });
  fs.mkdirSync(cat, { recursive: true });
  // window #2 state: png already at NEW name, meta still at OLD name
  fs.writeFileSync(path.join(cat, 'Button_New.png'), 'PNGDATA');
  fs.writeFileSync(path.join(cat, 'Old.png.meta'), 'guid: 1');
  const jp = path.join(root, '_index', 'rename-journal.jsonl');
  fs.writeFileSync(jp, JSON.stringify({ type: 'header', csvSha256: 'H', confirmCount: 1 }) + '\n' + JSON.stringify({ type: 'pair', id: 'Button/Old', state: 'pending' }) + '\n');

  const rows = [{ old_path: 'Button/Old', new_name: 'Button_New', change_types: '', reason: '' }];
  resumeFromJournal(root, jp, 'H', rows);

  assert.ok(fs.existsSync(path.join(cat, 'Button_New.png.meta')), 'orphaned meta should be moved to new name');
  assert.ok(!fs.existsSync(path.join(cat, 'Old.png.meta')), 'old meta should be gone');
  assert.ok(fs.readdirSync(path.join(root, '_index')).some((f) => f.endsWith('.done')));
});

test('resumeFromJournal: finish-meta moves the meta after a png-done crash', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-'));
  const cat = path.join(root, 'Button');
  fs.mkdirSync(path.join(root, '_index'), { recursive: true });
  fs.mkdirSync(cat, { recursive: true });
  fs.writeFileSync(path.join(cat, 'Button_New.png'), 'PNGDATA'); // png already moved
  fs.writeFileSync(path.join(cat, 'Old.png.meta'), 'guid: 1');     // meta not yet moved
  const jp = path.join(root, '_index', 'rename-journal.jsonl');
  fs.writeFileSync(jp, JSON.stringify({ type: 'header', csvSha256: 'H', confirmCount: 1 }) + '\n' + JSON.stringify({ type: 'pair', id: 'Button/Old', state: 'png-done' }) + '\n');
  const rows = [{ old_path: 'Button/Old', new_name: 'Button_New', change_types: '', reason: '' }];
  resumeFromJournal(root, jp, 'H', rows);
  assert.ok(fs.existsSync(path.join(cat, 'Button_New.png.meta')));
});

test('resumeFromJournal throws when a pair is lost (old gone, new absent)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-'));
  fs.mkdirSync(path.join(root, '_index'), { recursive: true });
  const jp = path.join(root, '_index', 'rename-journal.jsonl');
  // neither old nor new png exists on disk
  fs.writeFileSync(jp, JSON.stringify({ type: 'header', csvSha256: 'H', confirmCount: 1 }) + '\n' + JSON.stringify({ type: 'pair', id: 'Button/Lost', state: 'pending' }) + '\n');
  const rows = [{ old_path: 'Button/Lost', new_name: 'Button_Lost2', change_types: '', reason: '' }];
  assert.throws(() => resumeFromJournal(root, jp, 'H', rows), /lost mid-crash|investigate/i);
});
