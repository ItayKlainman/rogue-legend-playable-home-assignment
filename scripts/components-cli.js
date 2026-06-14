const fs = require('node:fs');
const path = require('node:path');

const KNOWN_GRAMMAR_VERSION = 1; // bump when this CLI learns a newer grammar

function loadManifest(manifestPath) {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function checkGrammar(manifest) {
  if (manifest.grammarVersion > KNOWN_GRAMMAR_VERSION) {
    return { status: 'grammar-too-new', reason: `manifest grammarVersion ${manifest.grammarVersion} > CLI ${KNOWN_GRAMMAR_VERSION}; update the tooling` };
  }
  return null;
}

function lookup(manifestPath, name) {
  const manifest = loadManifest(manifestPath);
  const tooNew = checkGrammar(manifest); if (tooNew) return tooNew;
  const matches = manifest.components.filter((c) => c.name === name);
  if (matches.length === 0) return { status: 'not-found' };
  if (matches.length > 1) return { status: 'ambiguous', candidates: matches.map((c) => ({ id: c.id, size: c.size })) };
  return { status: 'ok', match: matches[0] };
}

// Returns what the skill needs to wire the component (copy target + border),
// or a refusal naming the blocking issue. Does NOT write code.
function useComponent(manifestPath, name) {
  const r = lookup(manifestPath, name);
  if (r.status !== 'ok') return r;
  const c = r.match;
  if (c.severity === 'blocking') {
    const why = (c.issues || []).filter((i) => i.severity === 'blocking').map((i) => i.type).join(', ');
    return { status: 'refused', reason: `blocking issue(s): ${why}` };
  }
  return { status: 'ok', id: c.id, file: c.file, border: c.border, variableName: camel(c.name) };
}

function camel(name) {
  const tokens = name.split('_').filter(Boolean);
  if (tokens.length === 0) return name;
  return tokens
    .map((t, i) => (i === 0 ? t[0].toLowerCase() + t.slice(1) : t[0].toUpperCase() + t.slice(1)))
    .join('');
}

module.exports = { lookup, useComponent, KNOWN_GRAMMAR_VERSION };

if (require.main === module) {
  const [cmd, name] = process.argv.slice(2);
  const manifestPath = path.resolve(__dirname, '..', 'Components', '_index', 'manifest.json');
  if ((cmd !== 'lookup' && cmd !== 'use') || !name) {
    console.error('Usage: node scripts/components-cli.js <lookup|use> "<ExactComponentName>"');
    process.exit(2);
  }
  const fn = cmd === 'use' ? useComponent : lookup;
  console.log(JSON.stringify(fn(manifestPath, name), null, 2));
}
