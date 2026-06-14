const fs = require('node:fs');
const path = require('node:path');

// Threat = CODE references to the literal "Components/" (capital C). Doc prose is irrelevant.
const CODE_DIRS = ['src', 'scripts'];
const ROOT_FILES = ['build.json', 'package.json', 'tsconfig.json'];
const EXT = /\.(ts|js|json|html)$/;
const NEEDLE = 'Components/'; // case-sensitive

// These tooling files legitimately reference the `Components/` directory they operate on;
// they are not asset-import strings that a rename would break. The threat is references to
// specific renamed assets in playable/build code, not the tooling that manages the folder.
const EXCLUDE_FILES = new Set([
  'scripts/check-component-refs.js',
  'scripts/audit-components.js',
  'scripts/rename-components.js',
  'scripts/components-cli.js',
]);
const EXCLUDE_DIR_PREFIX = 'scripts/components/';

function isExcluded(relPath) {
  const rel = relPath.split(path.sep).join('/');
  return rel.startsWith(EXCLUDE_DIR_PREFIX) || EXCLUDE_FILES.has(rel);
}

function walkCode(dir, root, hits) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkCode(full, root, hits);
    else if (EXT.test(entry.name)) scanFile(full, root, hits);
  }
}

function scanFile(full, root, hits) {
  const rel = path.relative(root, full).split(path.sep).join('/');
  if (isExcluded(rel)) return;
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
  lines.forEach((text, i) => {
    if (text.includes(NEEDLE)) hits.push({ file: rel, line: i + 1, text: text.trim() });
  });
}

function findComponentRefs(repoRoot) {
  const hits = [];
  for (const d of CODE_DIRS) walkCode(path.join(repoRoot, d), repoRoot, hits);
  for (const f of ROOT_FILES) {
    const full = path.join(repoRoot, f);
    if (fs.existsSync(full)) scanFile(full, repoRoot, hits);
  }
  return hits;
}

module.exports = { findComponentRefs };

if (require.main === module) {
  const hits = findComponentRefs(path.resolve(__dirname, '..'));
  if (hits.length) {
    console.error(`Found ${hits.length} code reference(s) to Components/ — rename is unsafe:`);
    for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.text}`);
    process.exit(1);
  }
  console.log('No code references to Components/ — safe to rename.');
}
