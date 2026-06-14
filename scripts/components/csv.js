const fs = require('node:fs');
const crypto = require('node:crypto');

const COLUMNS = ['old_path', 'new_name', 'change_types', 'reason'];

function esc(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Hash over sorted (old_path \t new_name) pairs only — ignores change_types/reason and order.
function canonicalCsvHash(rows) {
  const lines = rows.map((r) => `${r.old_path}\t${r.new_name}`).sort();
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}

function writeRenameMap(filePath, rows) {
  const sorted = [...rows].sort((a, b) => (a.change_types || '').localeCompare(b.change_types || '') || a.old_path.localeCompare(b.old_path));
  const out = [
    `# csv-sha256: ${canonicalCsvHash(rows)}`,
    COLUMNS.join(','),
    ...sorted.map((r) => COLUMNS.map((c) => esc(r[c])).join(',')),
  ];
  fs.writeFileSync(filePath, out.join('\n') + '\n');
}

// Minimal RFC-4180-ish parser (handles quotes, escaped quotes, embedded commas).
function parseCsvLine(line) {
  const fields = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { fields.push(cur); cur = ''; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

function parseRenameMap(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  let headerHash = null;
  const rows = [];
  let sawColumns = false;
  for (const line of lines) {
    if (line === '') continue;
    if (line.startsWith('#')) {
      const m = line.match(/csv-sha256:\s*([0-9a-f]{64})/);
      if (m) headerHash = m[1];
      continue;
    }
    if (!sawColumns) { sawColumns = true; continue; } // skip column header
    const f = parseCsvLine(line);
    rows.push(Object.fromEntries(COLUMNS.map((c, i) => [c, f[i] ?? ''])));
  }
  return { rows, headerHash };
}

module.exports = { writeRenameMap, parseRenameMap, canonicalCsvHash, COLUMNS };
