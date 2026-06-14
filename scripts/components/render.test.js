const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderNames, renderGallery } = require('./render');

const components = [
  { id: 'Button/Button_Main_Background_Blue', category: 'Button', name: 'Button_Main_Background_Blue', file: 'Button/Button_Main_Background_Blue.png', size: null, width: 320, height: 96, border: { left: 34, bottom: 53, right: 34, top: 36 }, issues: [], severity: 'ok' },
  { id: 'Button/Bad', category: 'Button', name: 'Bad', file: 'Button/Bad.png', size: null, width: null, height: null, border: null, issues: [{ type: 'missing-meta', severity: 'blocking', detail: 'no .meta' }], severity: 'blocking' },
  { id: 'Frame/Adv', category: 'Frame', name: 'Adv', file: 'Frame/Adv.png', size: null, width: 10, height: 10, border: null, issues: [{ type: 'naming', severity: 'advisory', detail: 'z' }], severity: 'advisory' },
];

test('names.html lists name + image and nothing heavy', () => {
  const html = renderNames(components);
  assert.match(html, /Button_Main_Background_Blue/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /\.\.\/Button\/Button_Main_Background_Blue\.png/); // relative path up from _index/
  assert.doesNotMatch(html, /spriteBorder|9-slice/i); // no QA clutter
});

test('gallery.html shows border snippet and flags blocking items', () => {
  const html = renderGallery(components);
  assert.match(html, /left: 34/);
  assert.match(html, /missing-meta/);
  assert.match(html, /data-severity="blocking"/);
  assert.match(html, /class="sev-blocking"/);   // red-outline indicator
  assert.match(html, /loading="lazy"/);          // gallery also lazy-loads
  assert.match(html, /320×96/);                  // dimensions shown
  assert.match(html, /class="sev-advisory"/);   // orange-outline advisory indicator
});
