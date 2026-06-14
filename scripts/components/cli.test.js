const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lookup, useComponent, KNOWN_GRAMMAR_VERSION } = require('../components-cli');

function manifestFile(components, grammarVersion = KNOWN_GRAMMAR_VERSION) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ grammarVersion, generatedAt: 'now', components }));
  return path.join(dir, 'manifest.json');
}

const comps = [
  { id: 'Button/Button_Main_Background_Blue', name: 'Button_Main_Background_Blue', file: 'Button/Button_Main_Background_Blue.png', size: null, border: { left: 1, bottom: 2, right: 3, top: 4 }, severity: 'ok', issues: [] },
  { id: 'Icon/256/Icon_Picto_Book', name: 'Icon_Picto_Book', file: 'Icon/256/Icon_Picto_Book.png', size: '256', border: null, severity: 'ok', issues: [] },
  { id: 'Icon/512/Icon_Picto_Book', name: 'Icon_Picto_Book', file: 'Icon/512/Icon_Picto_Book.png', size: '512', border: null, severity: 'ok', issues: [] },
  { id: 'Button/Bad', name: 'Bad', file: 'Button/Bad.png', size: null, border: null, severity: 'blocking', issues: [{ type: 'missing-meta', severity: 'blocking', detail: 'x' }] },
];

test('lookup exact name returns the single match', () => {
  const r = lookup(manifestFile(comps), 'Button_Main_Background_Blue');
  assert.equal(r.status, 'ok');
  assert.equal(r.match.id, 'Button/Button_Main_Background_Blue');
});

test('lookup ambiguous (icon sizes) returns candidates, never guesses', () => {
  const r = lookup(manifestFile(comps), 'Icon_Picto_Book');
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.candidates.length, 2);
});

test('useComponent refuses a blocking component and cites the issue', () => {
  const r = useComponent(manifestFile(comps), 'Bad');
  assert.equal(r.status, 'refused');
  assert.match(r.reason, /missing-meta/);
});

test('lookup refuses a manifest with a newer grammarVersion', () => {
  const r = lookup(manifestFile(comps, KNOWN_GRAMMAR_VERSION + 1), 'Button_Main_Background_Blue');
  assert.equal(r.status, 'grammar-too-new');
});

test('useComponent returns a camelCased variableName', () => {
  const r = useComponent(manifestFile(comps), 'Button_Main_Background_Blue');
  assert.equal(r.status, 'ok');
  assert.equal(r.variableName, 'buttonMainBackgroundBlue');
  assert.equal(r.file, 'Button/Button_Main_Background_Blue.png');
  assert.deepEqual(r.border, { left: 1, bottom: 2, right: 3, top: 4 });
});

test('useComponent passes through ambiguous and not-found unchanged', () => {
  assert.equal(useComponent(manifestFile(comps), 'Icon_Picto_Book').status, 'ambiguous');
  assert.equal(useComponent(manifestFile(comps), 'NoSuchThing').status, 'not-found');
});
