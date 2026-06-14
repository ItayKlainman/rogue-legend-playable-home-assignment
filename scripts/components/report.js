const crypto = require('node:crypto');

function buildManifest(components, grammar) {
  return { grammarVersion: grammar.grammarVersion, generatedAt: new Date().toISOString(), components };
}

function buildCounts(components) {
  const counts = {};
  for (const c of components) counts[c.category] = (counts[c.category] || 0) + 1;
  return counts;
}

function buildReport(components) {
  const bySeverity = { blocking: [], advisory: [] };
  for (const c of components) for (const i of c.issues) if (bySeverity[i.severity]) bySeverity[i.severity].push({ name: c.name, ...i });
  const section = (label, list) => {
    const byType = {};
    for (const x of list) (byType[x.type] = byType[x.type] || []).push(x);
    let md = `## ${label} (${list.length})\n\n`;
    for (const [type, items] of Object.entries(byType)) {
      md += `### ${type} (${items.length})\n`;
      for (const it of items) md += `- ${it.name} — ${it.detail}\n`;
      md += '\n';
    }
    return md;
  };
  return `# Components Audit Report\n\nGenerated ${new Date().toISOString()}\n\n` +
    section('Blocking', bySeverity.blocking) + section('Advisory', bySeverity.advisory);
}

function categoryHash(components, category) {
  const rows = components.filter((c) => c.category === category)
    .map((c) => `${c.id}\t${c.severity}\t${(c.border ? JSON.stringify(c.border) : '')}`).sort();
  return crypto.createHash('sha256').update(rows.join('\n')).digest('hex');
}

// prevHashes: { category: hash }. Returns { category: {hash, stale} }.
function signoffFreshness(components, prevHashes = {}) {
  const out = {};
  for (const category of new Set(components.map((c) => c.category))) {
    const hash = categoryHash(components, category);
    out[category] = { hash, stale: prevHashes[category] !== hash };
  }
  return out;
}

function renderGrammarMarkdown(grammar) {
  let md = `<!-- generated from grammar.json — do not edit by hand -->\n## Naming grammar (v${grammar.grammarVersion})\n\n`;
  md += `**Categories:** ${grammar.categories.join(', ')}\n\n`;
  for (const [slot, values] of Object.entries(grammar.vocab)) md += `**${slot}:** ${values.join(', ')}\n\n`;
  md += `**Required slots:** ` + Object.entries(grammar.requiredSlots).map(([c, s]) => `${c}=[${s.join(',')}]`).join('; ') + `\n`;
  if (grammar.conformanceNote) md += `\n**Conformance:** ${grammar.conformanceNote}\n`;
  return md;
}

module.exports = { buildManifest, buildCounts, buildReport, categoryHash, signoffFreshness, renderGrammarMarkdown };
