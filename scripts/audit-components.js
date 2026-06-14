const fs = require('node:fs');
const path = require('node:path');
const { loadGrammar, assertVocabDisjoint, validateName, proposeName, CHANGE_ORDER } = require('./components/grammar');
const { scanComponents } = require('./components/scan');
const { renderNames, renderGallery } = require('./components/render');
const { buildManifest, buildCounts, buildReport, signoffFreshness, renderGrammarMarkdown } = require('./components/report');
const { writeRenameMap } = require('./components/csv');

const ROOT = path.resolve(__dirname, '..');
const COMPONENTS = path.join(ROOT, 'Components');
const INDEX = path.join(COMPONENTS, '_index');

async function main() {
  fs.mkdirSync(INDEX, { recursive: true });
  const grammar = loadGrammar(path.join(INDEX, 'grammar.json'));
  assertVocabDisjoint(grammar); // fail loud if grammar.json is internally inconsistent

  console.log('Scanning Components/ …');
  const { components } = await scanComponents(COMPONENTS, grammar);
  console.log(`  ${components.length} images.`);

  // Artifacts
  fs.writeFileSync(path.join(INDEX, 'manifest.json'), JSON.stringify(buildManifest(components, grammar), null, 2));
  fs.writeFileSync(path.join(INDEX, 'names.html'), renderNames(components));
  fs.writeFileSync(path.join(INDEX, 'gallery.html'), renderGallery(components));
  fs.writeFileSync(path.join(INDEX, 'audit-report.md'), buildReport(components));

  // Rename map: a row when the NAME is non-conformant OR the extension isn't lowercase 'png'.
  const rows = [];
  for (const c of components) {
    const conformant = validateName(c.name, grammar).conformant;
    const needsExtFix = c.ext !== 'png';            // e.g. ".Png" / ".PNG"
    if (conformant && !needsExtFix) continue;        // nothing to do
    const { newName, changeTypes } = proposeName(c.name, c.category, grammar);
    const changes = new Set(changeTypes);
    if (needsExtFix) changes.add('ext-case');
    if (newName === c.name && !needsExtFix) continue; // proposeName couldn't improve the name and no ext fix needed
    const ordered = CHANGE_ORDER.filter((x) => changes.has(x));
    rows.push({ old_path: c.id, new_name: newName, change_types: ordered.join('+'), reason: ordered.join(', ') || 'normalize' });
  }
  writeRenameMap(path.join(INDEX, 'rename-map.csv'), rows);
  console.log(`  rename-map.csv: ${rows.length} proposed rename(s).`);

  // Counts: proposed always; expected baseline on first run.
  const counts = buildCounts(components);
  fs.writeFileSync(path.join(INDEX, 'proposed-counts.json'), JSON.stringify(counts, null, 2));
  const expectedPath = path.join(INDEX, 'expected-counts.json');
  if (!fs.existsSync(expectedPath)) {
    fs.writeFileSync(expectedPath, JSON.stringify(counts, null, 2));
    console.log('  expected-counts.json: created initial baseline.');
  } else {
    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
    for (const cat of new Set([...Object.keys(counts), ...Object.keys(expected)])) {
      if (counts[cat] !== expected[cat]) console.warn(`  COUNT DRIFT ${cat}: expected ${expected[cat] ?? 0}, got ${counts[cat] ?? 0}`);
    }
  }

  // Sign-off freshness (reads previous hashes from a sidecar if present).
  const signoffJson = path.join(INDEX, 'signoff.hashes.json');
  const prev = fs.existsSync(signoffJson) ? JSON.parse(fs.readFileSync(signoffJson, 'utf8')) : {};
  const fresh = signoffFreshness(components, prev);
  fs.writeFileSync(signoffJson, JSON.stringify(Object.fromEntries(Object.entries(fresh).map(([k, v]) => [k, v.hash])), null, 2));
  const stale = Object.entries(fresh).filter(([, v]) => v.stale).map(([k]) => k);
  if (stale.length) console.log(`  sign-off stale for: ${stale.join(', ')} (re-review in gallery.html)`);

  // Regenerate the grammar section reference file (README author pastes/links this).
  fs.writeFileSync(path.join(INDEX, 'grammar.generated.md'), renderGrammarMarkdown(grammar));

  console.log('Done. Open Components/_index/gallery.html');
}

main().catch((err) => { console.error(err); process.exit(1); });
