const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { parseMeta, unityBorderToObj, metaHash } = require('./meta');
const { validateName } = require('./grammar');

const SIZE_FOLDERS = new Set(['Original', '512', '256', '128']);

function walk(dir, root, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_')) continue;
      walk(path.join(dir, entry.name), root, acc);
    } else {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (/\.png$/i.test(entry.name) && !/\.meta$/i.test(entry.name)) acc.pngs.push(rel);
      else if (/\.meta$/i.test(entry.name)) acc.metas.add(rel);
    }
  }
  return acc;
}

function severityOf(issues) {
  if (issues.some((i) => i.severity === 'blocking')) return 'blocking';
  if (issues.some((i) => i.severity === 'advisory')) return 'advisory';
  return 'ok';
}

async function probe(absPath) {
  const stat = fs.statSync(absPath);
  if (stat.size === 0) return { zeroByte: true };
  try {
    const img = sharp(absPath);
    const meta = await img.metadata();
    const stats = await img.stats();
    const alphaCh = (meta.channels || 0) >= 4 || meta.hasAlpha;
    const alphaStat = stats.channels[stats.channels.length - 1];
    const effectiveAlpha = !!alphaCh && alphaStat && alphaStat.min < 255;
    return { width: meta.width, height: meta.height, effectiveAlpha: !!effectiveAlpha };
  } catch (err) {
    return { corrupt: true, error: err.message };
  }
}

async function scanComponents(componentsDir, grammar) {
  const acc = walk(componentsDir, componentsDir, { pngs: [], metas: new Set() });
  const components = [];

  for (const rel of acc.pngs) {
    const abs = path.join(componentsDir, rel);
    const ext = path.extname(rel).slice(1);
    const idNoExt = rel.slice(0, -(ext.length + 1));
    const parts = rel.split(path.sep);
    const category = parts[0];
    const name = path.basename(idNoExt);
    const size = parts.find((p) => SIZE_FOLDERS.has(p)) || null;

    const issues = [];
    if (ext !== 'png') issues.push({ type: 'extension-case', severity: 'advisory', detail: `.${ext}` });

    const metaRel = rel + '.meta';
    const hasMeta = [...acc.metas].some((m) => m.toLowerCase() === metaRel.toLowerCase());
    let meta = { ok: false }, border = null, pivot = null, mHash = null;
    if (!hasMeta) {
      issues.push({ type: 'missing-meta', severity: 'blocking', detail: 'no .meta' });
    } else {
      meta = parseMeta(abs + '.meta');
      if (!meta.ok) issues.push({ type: 'corrupt', severity: 'blocking', detail: `meta: ${meta.error}` });
      else { border = unityBorderToObj(meta.spriteBorder); pivot = meta.spritePivot || null; mHash = metaHash(meta); }
    }

    const p = await probe(abs);
    let pngHash = null;
    if (p.zeroByte) issues.push({ type: 'zero-byte', severity: 'blocking', detail: '0 bytes' });
    else if (p.corrupt) issues.push({ type: 'corrupt', severity: 'blocking', detail: p.error });
    else pngHash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');

    if (p.width != null && p.effectiveAlpha === false) issues.push({ type: 'no-alpha', severity: 'advisory', detail: 'opaque / no alpha' });

    const conf = validateName(name, grammar);
    if (!conf.conformant) issues.push({ type: 'naming', severity: 'advisory', detail: conf.reason });

    const sliceable = !!border && !(border.left === 0 && border.bottom === 0 && border.right === 0 && border.top === 0);

    components.push({
      id: idNoExt, category, subtype: conf.conformant ? conf.parsed.subtype : null, name, size,
      file: rel, ext, width: p.width ?? null, height: p.height ?? null,
      effectiveAlpha: p.effectiveAlpha ?? null, pngHash, metaHash: mHash, guid: meta.guid || null,
      border, pivot, sliceable, issues, severity: severityOf(issues),
    });
  }

  dedup(components);
  for (const c of components) c.severity = severityOf(c.issues);
  return { components };
}

function dedup(components) {
  // Group by pngHash; skip components that have no pngHash or no metaHash
  // (missing-meta components already carry a blocking issue and should not participate).
  const byPng = new Map();
  for (const c of components) {
    if (!c.pngHash || !c.metaHash) continue;
    if (!byPng.has(c.pngHash)) byPng.set(c.pngHash, []);
    byPng.get(c.pngHash).push(c);
  }
  for (const group of byPng.values()) {
    if (group.length < 2) continue;
    // Sub-group by metaHash to distinguish exact duplicates from border-differ pairs.
    const byMeta = new Map();
    for (const c of group) {
      if (!byMeta.has(c.metaHash)) byMeta.set(c.metaHash, []);
      byMeta.get(c.metaHash).push(c);
    }
    const distinctMetas = byMeta.size; // how many distinct meta variants share this png
    for (const [, metaGroup] of byMeta) {
      if (metaGroup.length >= 2) {
        // Same png AND same meta: true duplicates
        for (const c of metaGroup) {
          const others = metaGroup.filter((g) => g !== c).map((g) => g.name).join(', ');
          c.issues.push({ type: 'duplicate', severity: 'advisory', detail: `same as ${others}` });
        }
      }
      if (distinctMetas > 1) {
        // Same png but this metaHash group differs from at least one other meta variant
        for (const c of metaGroup) {
          c.issues.push({ type: 'borders-differ', severity: 'advisory', detail: 'identical png, differing meta' });
        }
      }
    }
  }
}

module.exports = { scanComponents };
