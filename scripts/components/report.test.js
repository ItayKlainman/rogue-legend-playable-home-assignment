const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildManifest, buildReport, buildCounts, signoffFreshness, renderGrammarMarkdown } = require('./report');

const grammar = { grammarVersion: 1, categories: ['Button', 'Icon'], vocab: { Size: ['Small', 'Large'], Part: ['Background'], Color: ['Blue'], State: ['Focus'] }, slotOrder: ['Style', 'Size', 'Part', 'Color', 'State', 'Variant'], requiredSlots: { Button: ['Part'], Icon: [] } };
const components = [
  { id: 'Button/A', category: 'Button', name: 'A', size: null, issues: [], severity: 'ok' },
  { id: 'Button/B', category: 'Button', name: 'B', size: null, issues: [{ type: 'missing-meta', severity: 'blocking', detail: 'x' }], severity: 'blocking' },
  { id: 'Icon/C', category: 'Icon', name: 'C', size: '256', issues: [{ type: 'naming', severity: 'advisory', detail: 'y' }], severity: 'advisory' },
];

test('manifest stamps grammarVersion and includes components', () => {
  const m = buildManifest(components, grammar);
  assert.equal(m.grammarVersion, 1);
  assert.equal(m.components.length, 3);
});

test('counts are per-category totals', () => {
  assert.deepEqual(buildCounts(components), { Button: 2, Icon: 1 });
});

test('report groups by severity with counts', () => {
  const md = buildReport(components);
  assert.match(md, /blocking/i);
  assert.match(md, /missing-meta/);
});

test('signoffFreshness marks a category stale when its hash changes', () => {
  const prev = { Button: 'oldhash' };
  const fresh = signoffFreshness(components, prev);
  assert.equal(fresh.Button.stale, true); // hash differs from "oldhash"
  assert.ok(fresh.Button.hash);
});

test('renderGrammarMarkdown lists categories and vocab from grammar', () => {
  const md = renderGrammarMarkdown(grammar);
  assert.match(md, /Button/);
  assert.match(md, /Background/);
});
