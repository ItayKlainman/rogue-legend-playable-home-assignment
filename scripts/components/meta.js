const fs = require('node:fs');
const crypto = require('node:crypto');
const yaml = require('js-yaml');

function parseMeta(metaPath) {
  let doc;
  try {
    doc = yaml.load(fs.readFileSync(metaPath, 'utf8'));
  } catch (err) {
    return { ok: false, error: `yaml parse failed: ${err.message}` };
  }
  if (!doc || typeof doc !== 'object') return { ok: false, error: 'meta is not a mapping' };
  const ti = doc.TextureImporter || {};
  return {
    ok: true,
    guid: doc.guid != null ? String(doc.guid) : null,
    folderAsset: doc.folderAsset === true || doc.folderAsset === 'yes',
    spriteBorder: ti.spriteBorder || null,
    spritePivot: ti.spritePivot || null,
    spriteMode: ti.spriteMode != null ? ti.spriteMode : null,
    textureType: ti.textureType != null ? ti.textureType : null,
  };
}

function unityBorderToObj(b) {
  if (!b) return null;
  return { left: b.x, bottom: b.y, right: b.z, top: b.w };
}

// Hash ONLY the semantic fields, in a fixed key order. Excludes guid by design
// (guids are unique per asset; including one would defeat dedup).
function metaHash(m) {
  const norm = {
    spriteBorder: m.spriteBorder || null,
    spritePivot: m.spritePivot || null,
    spriteMode: m.spriteMode ?? null,
    textureType: m.textureType ?? null,
  };
  return crypto.createHash('sha256').update(JSON.stringify(norm)).digest('hex');
}

module.exports = { parseMeta, unityBorderToObj, metaHash };
