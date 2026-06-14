# Components Library Audit, Rename & Index — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify a ~1,250-file Unity-exported UI component library, give every file a descriptive name (review-then-apply), and produce a browsable index + a skill for reusing components — all from re-runnable Node scripts.

**Architecture:** A read-only **audit** entrypoint (`scripts/audit-components.js`) scans `Components/`, validates each PNG↔`.meta` pair, and emits artifacts into `Components/_index/` (two HTML pages, `manifest.json`, `audit-report.md`, `rename-map.csv`, counts files). A separate **apply** entrypoint (`scripts/rename-components.js`) performs the journal-backed, guarded renames from a reviewed CSV. Logic lives in focused modules under `scripts/components/`; the design spec is the contract.

**Tech Stack:** Node.js v26 (CommonJS), `sharp` (image probing — already a devDep), `js-yaml` (meta parsing — to be added), Node's built-in `node:test`/`node:assert` for tests. No build step; scripts run via `node`.

**Spec:** `docs/superpowers/specs/2026-05-24-components-library-audit-and-index-design.md` — read it before starting.

---

## File Structure

| File | Responsibility |
|---|---|
| `Components/_index/grammar.json` | Vocabulary source of truth (categories, slot vocabularies, required-slots, `grammarVersion`). Committed. |
| `scripts/components/grammar.js` | Load grammar; vocab-disjointness invariant; conformance validator; proposed-name generator. |
| `scripts/components/meta.js` | Parse a `.meta` (js-yaml), extract fields, normalized `metaHash`, Unity-border→object. |
| `scripts/components/scan.js` | Walk `Components/`, pair png↔meta, probe images, classify issues+severity, dedup, build records. |
| `scripts/components/csv.js` | Read/write `rename-map.csv`; canonical content hash. |
| `scripts/components/render.js` | Emit `names.html` and `gallery.html`. |
| `scripts/components/report.js` | Emit `manifest.json`, `audit-report.md`, counts files, `signoff.md`, generate README grammar section. |
| `scripts/components/journal.js` | Rename journal: write/read/resume contract. |
| `scripts/check-component-refs.js` | Code-scoped, case-sensitive reference scan (function + CLI). |
| `scripts/audit-components.js` | Audit entrypoint: orchestrate scan → emit. `npm run audit:components`. |
| `scripts/rename-components.js` | Apply entrypoint: guards + journal-backed pair rename. `npm run rename:components`. |
| `scripts/components-cli.js` | Skill helper: `lookup` / `use` commands; `grammarVersion` check. |
| `.claude/skills/components/SKILL.md` | The `components` skill (thin LLM layer over the CLI). |
| `Components/README.md` | Hand-authored taxonomy + workflow + sign-off; grammar section generated. |
| `scripts/components/*.test.js` | Unit tests, run with `node --test scripts/components/`. |

**Data shapes (used across tasks — keep names exact):**

```js
// Component record (scan.js output)
{
  id,            // repo-relative path under Components/, no ext, e.g. "Button/Button_01_Mian_l_Bg_Blue"
  category,      // top folder, e.g. "Button"
  subtype,       // parsed slot[1] when conformant, else null
  name,          // filename without ext
  size,          // "Original"|"512"|"256"|"128" for icon sets, else null
  file,          // png path relative to Components/, with real extension
  ext,           // actual extension as on disk, e.g. "png" or "Png"
  width, height, // numbers, or null if unprobeable
  effectiveAlpha,// bool: has alpha channel AND not fully opaque
  pngHash,       // sha256 of raw png bytes, or null
  metaHash,      // sha256 of normalized meta fields, or null
  guid,          // from meta, or null
  border,        // {left,bottom,right,top} or null
  pivot,         // {x,y} or null
  sliceable,     // border && not all zero
  issues,        // [{type, severity, detail}]
  severity,      // "blocking" | "advisory" | "ok" (worst present)
}

// Rename row (csv.js)
{ old_path, new_name, change_types, reason }  // old_path/new_name are id-style (no ext); paths derived per file
```

---

## Task 0: Project setup — deps, dirs, npm scripts, grammar.json

**Files:**
- Modify: `package.json`
- Create: `Components/_index/grammar.json`
- Modify: `.gitignore`

- [ ] **Step 1: Install dependencies**

`sharp` is declared but not installed; `js-yaml` must be added.

Run:
```bash
cd /Users/idohoresh/Desktop/pocket-playable
npm install
npm install --save-dev js-yaml@^4.1.0
```
Expected: `node_modules/sharp` and `node_modules/js-yaml` both exist. Verify:
```bash
node -e "require('sharp'); require('js-yaml'); console.log('deps ok')"
```
Expected output: `deps ok`

- [ ] **Step 2: Add npm scripts**

In `package.json`, add these three entries to the `"scripts"` object (keep existing entries):
```json
    "audit:components": "node scripts/audit-components.js",
    "rename:components": "node scripts/rename-components.js",
    "test:components": "node --test scripts/components/"
```

- [ ] **Step 3: Create the grammar source of truth**

Create `Components/_index/grammar.json`. **Vocabularies MUST be mutually disjoint** (the invariant enforced in Task 1) — note `Gradient` lives only in `Part`, never `Color`:

```json
{
  "grammarVersion": 1,
  "categories": ["Button", "Frame", "Slider", "Title", "Label", "Popup", "UI", "Icon"],
  "vocab": {
    "Size": ["Small", "Large"],
    "Part": ["Background", "Border", "InnerBorder", "Fill", "FocusGlow", "Line", "Gradient", "Level"],
    "Color": ["Blue", "Green", "Red", "Mint", "Navy", "White", "Yellow", "Pink", "Orange", "Gray", "Dark", "Brown", "Sky", "Purple", "Gold", "Silver", "Bronze"],
    "State": ["Focus", "Locked", "Open", "Light"]
  },
  "slotOrder": ["Style", "Size", "Part", "Color", "State", "Variant"],
  "requiredSlots": {
    "Button": ["Part"], "Frame": ["Part"], "Slider": ["Part"],
    "Popup": ["Part"], "Label": ["Part"],
    "Title": [], "Icon": [], "UI": []
  }
}
```

> **Expect many non-conformant names on the first audit — this is by design, not a bug.** The
> disjointness invariant (Task 1) means a Subtype can't equal a vocab value, so natural source
> names like `Button_Border_Circle_…` (where `Border` is also a `Part`) validate as
> non-conformant and get an *advisory* `naming` issue. `proposeName` won't auto-fix these
> (it leaves `old == new`, so they produce **no** rename row), so nothing bad is renamed. The
> intended resolution is human: during CSV review, either refine `grammar.json` (e.g. add a
> `BorderCircle` Subtype convention and bump `grammarVersion`) or assign names by hand. The seed
> vocabulary above is a **starting point**, not the final word.

- [ ] **Step 4: Add gitignore entries for transient artifacts**

Append to `.gitignore`:
```
# Components index — transient (regenerate with npm run audit:components)
Components/_index/proposed-counts.json
Components/_index/rename-journal.jsonl
Components/_index/*.done
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json Components/_index/grammar.json .gitignore
git commit -m "chore(components): add deps, npm scripts, grammar.json, gitignore"
```

---

## Task 1: Grammar module — disjointness invariant + conformance validator

**Files:**
- Create: `scripts/components/grammar.js`
- Test: `scripts/components/grammar.test.js`

- [ ] **Step 1: Write the failing tests**

Create `scripts/components/grammar.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadGrammar, assertVocabDisjoint, validateName } = require('./grammar');

const grammar = loadGrammar(path.join(__dirname, '..', '..', 'Components', '_index', 'grammar.json'));

test('grammar vocabularies are mutually disjoint', () => {
  assert.doesNotThrow(() => assertVocabDisjoint(grammar));
});

test('assertVocabDisjoint throws when a value appears in two slots', () => {
  const bad = { ...grammar, vocab: { ...grammar.vocab, Color: [...grammar.vocab.Color, 'Gradient'] } };
  assert.throws(() => assertVocabDisjoint(bad), /disjoint|collision|Gradient/i);
});

test('a fully-formed name validates', () => {
  const r = validateName('Button_Main_01_Large_Background_Blue', grammar);
  assert.equal(r.conformant, true);
  assert.equal(r.parsed.category, 'Button');
  assert.equal(r.parsed.subtype, 'Main');
  assert.equal(r.parsed.Part, 'Background');
});

test('canonical-order violation is rejected (Size before Style)', () => {
  const r = validateName('Button_Main_Large_01_Background_Blue', grammar);
  assert.equal(r.conformant, false);
});

test('unknown later-slot token fails (the Frobnicate case)', () => {
  const r = validateName('Button_Main_Frobnicate_Background_Blue', grammar);
  assert.equal(r.conformant, false);
});

test('subtype colliding with a vocab value is rejected', () => {
  const r = validateName('Button_Focus_Background', grammar); // Focus is a State
  assert.equal(r.conformant, false);
});

test('required Part enforced for Button, optional for Icon', () => {
  assert.equal(validateName('Button_Main_01_Large_Blue', grammar).conformant, false); // no Part
  assert.equal(validateName('Icon_Picto_Book', grammar).conformant, true); // no Part needed
});

test('new color fails until vocabulary is extended (grammar-version path)', () => {
  assert.equal(validateName('Button_Main_Background_Teal', grammar).conformant, false);
  const extended = { ...grammar, vocab: { ...grammar.vocab, Color: [...grammar.vocab.Color, 'Teal'] } };
  assert.equal(validateName('Button_Main_Background_Teal', extended).conformant, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/components/grammar.test.js`
Expected: FAIL — `Cannot find module './grammar'`.

- [ ] **Step 3: Implement the grammar module**

Create `scripts/components/grammar.js`:
```js
const fs = require('node:fs');

function loadGrammar(grammarPath) {
  return JSON.parse(fs.readFileSync(grammarPath, 'utf8'));
}

// All closed-vocabulary values that a Subtype must NOT equal.
function vocabValues(grammar) {
  return Object.values(grammar.vocab).flat();
}

// Invariant: no value appears in more than one slot vocabulary.
function assertVocabDisjoint(grammar) {
  const seen = new Map();
  for (const [slot, values] of Object.entries(grammar.vocab)) {
    for (const v of values) {
      if (seen.has(v)) {
        throw new Error(`grammar.json vocabularies not disjoint: "${v}" in both ${seen.get(v)} and ${slot}`);
      }
      seen.set(v, slot);
    }
  }
}

function slotMatches(slot, token, grammar) {
  switch (slot) {
    case 'Style': return /^\d{2}$/.test(token);
    case 'Variant': return /^v\d+$/.test(token);
    default: return (grammar.vocab[slot] || []).includes(token);
  }
}

// Greedy left-to-right slot consumption. Works because slots are ordered
// and vocabularies are disjoint (enforced by assertVocabDisjoint).
function validateName(name, grammar) {
  const tokens = name.split('_');
  if (tokens.length < 2) return { conformant: false, reason: 'fewer than 2 tokens' };

  const category = tokens[0];
  if (!grammar.categories.includes(category)) return { conformant: false, reason: `unknown category "${category}"` };

  const subtype = tokens[1];
  if (!/^[A-Z][A-Za-z0-9]*$/.test(subtype)) return { conformant: false, reason: `bad subtype "${subtype}"` };
  if (vocabValues(grammar).includes(subtype)) return { conformant: false, reason: `subtype "${subtype}" collides with a vocabulary value` };

  const order = grammar.slotOrder;
  const parsed = { category, subtype };
  let si = 0;
  for (const tok of tokens.slice(2)) {
    let matched = false;
    while (si < order.length) {
      const slot = order[si];
      if (slotMatches(slot, tok, grammar)) { parsed[slot] = tok; si++; matched = true; break; }
      si++; // skip this optional slot and try the next
    }
    if (!matched) return { conformant: false, reason: `token "${tok}" fits no remaining slot` };
  }

  for (const req of (grammar.requiredSlots[category] || [])) {
    if (!(req in parsed)) return { conformant: false, reason: `missing required slot ${req}` };
  }
  return { conformant: true, parsed };
}

module.exports = { loadGrammar, assertVocabDisjoint, validateName, vocabValues };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/components/grammar.test.js`
Expected: PASS — 8 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add scripts/components/grammar.js scripts/components/grammar.test.js
git commit -m "feat(components): grammar validator + vocab-disjointness invariant"
```

---

## Task 2: Proposed-name generator (best-effort, for the rename CSV)

**Files:**
- Modify: `scripts/components/grammar.js`
- Modify: `scripts/components/grammar.test.js`

- [ ] **Step 1: Add failing tests**

Append to `scripts/components/grammar.test.js`:
```js
const { proposeName } = require('./grammar');

test('proposeName fixes typo + expands abbreviations', () => {
  const r = proposeName('Button_01_Mian_l_Bg_Blue', 'Button', grammar);
  assert.equal(r.newName, 'Button_Main_01_Large_Background_Blue');
  assert.deepEqual([...r.changeTypes].sort(), ['abbrev-expand', 'typo-fix']);
});

test('proposeName realigns icon prefixes', () => {
  assert.equal(proposeName('PictoIcon_Book', 'Icon_PictoIcons', grammar).newName, 'Icon_Picto_Book');
  assert.equal(proposeName('ItemIcon_Medal_Bronze_1', 'Icon_ItemIcons', grammar).newName, 'Icon_Item_Medal_Bronze_1');
});

test('proposeName fixes stray space', () => {
  const r = proposeName('FlagFrame_01_Bg_Green 1', 'Frame', grammar);
  assert.ok(r.changeTypes.includes('space-fix'));
  assert.ok(!/\s/.test(r.newName));
});

test('proposeName returns same name + empty changeTypes for a conformant name', () => {
  const r = proposeName('Icon_Picto_Book', 'Icon_PictoIcons', grammar);
  assert.equal(r.newName, 'Icon_Picto_Book');
  assert.equal(r.changeTypes.length, 0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test scripts/components/grammar.test.js`
Expected: FAIL — `proposeName is not a function`.

- [ ] **Step 3: Implement proposeName**

Add to `scripts/components/grammar.js` (before `module.exports`), then add `proposeName` to the exports object:
```js
const CHANGE_ORDER = ['typo-fix', 'abbrev-expand', 'prefix-realign', 'ext-case', 'space-fix', 'variant'];
const TYPO_MAP = { Mian: 'Main', Gary: 'Gray' };
const ABBREV_MAP = { Bg: 'Background', l: 'Large', s: 'Small' };
// Source icon-folder prefix -> canonical "Icon_<X>" subtype prefix
const ICON_PREFIX = { PictoIcon: 'Icon_Picto', ItemIcon: 'Icon_Item', ShopItem: 'Icon_Shop' };

function orderedChangeTypes(set) {
  return CHANGE_ORDER.filter((c) => set.has(c));
}

// Best-effort proposal. The reviewed CSV is the safety net for cases this misses.
function proposeName(currentName, category, grammar) {
  const changes = new Set();
  let name = currentName;

  if (/\s/.test(name)) { name = name.replace(/\s+/g, '_'); changes.add('space-fix'); }

  // Icon prefix realignment (PictoIcon_Book -> Icon_Picto_Book)
  for (const [src, dst] of Object.entries(ICON_PREFIX)) {
    if (name.startsWith(src + '_')) { name = dst + name.slice(src.length); changes.add('prefix-realign'); break; }
  }

  let tokens = name.split('_').filter((t) => t.length > 0);
  tokens = tokens.map((tok) => {
    if (TYPO_MAP[tok]) { changes.add('typo-fix'); return TYPO_MAP[tok]; }
    if (ABBREV_MAP[tok]) { changes.add('abbrev-expand'); return ABBREV_MAP[tok]; }
    return tok;
  });

  // Reorder a leading two-digit style number to sit right after the subtype:
  // Button_01_Main_... -> Button_Main_01_...  (source puts the index before the family word)
  if (tokens.length >= 3 && /^\d{2}$/.test(tokens[1]) && /^[A-Z]/.test(tokens[2])) {
    const style = tokens.splice(1, 1)[0];
    tokens.splice(2, 0, style);
  }

  const newName = tokens.join('_');
  return { newName, changeTypes: orderedChangeTypes(changes) };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test scripts/components/grammar.test.js`
Expected: PASS — all tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/components/grammar.js scripts/components/grammar.test.js
git commit -m "feat(components): best-effort proposed-name generator"
```

---

## Task 3: Meta parser + normalized metaHash

**Files:**
- Create: `scripts/components/meta.js`
- Test: `scripts/components/meta.test.js`
- Test fixtures: `scripts/components/__fixtures__/good.png.meta`, `bad.png.meta`

- [ ] **Step 1: Create fixtures**

Create `scripts/components/__fixtures__/good.png.meta` (a trimmed but real-shaped texture meta):
```yaml
fileFormatVersion: 2
guid: 8495447710d7c403b9d4137aee9b7d49
TextureImporter:
  spriteMode: 1
  spriteBorder: {x: 34, y: 53, z: 34, w: 36}
  spritePivot: {x: 0.5, y: 0.5}
  textureType: 8
```

Create `scripts/components/__fixtures__/bad.png.meta` (unparseable — broken indentation/colon):
```yaml
fileFormatVersion: 2
guid: zzz
TextureImporter:
  spriteBorder: {x: 34 y 53
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/components/meta.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseMeta, metaHash, unityBorderToObj } = require('./meta');

const fx = (n) => path.join(__dirname, '__fixtures__', n);

test('parseMeta extracts fields from a texture meta', () => {
  const m = parseMeta(fx('good.png.meta'));
  assert.equal(m.ok, true);
  assert.equal(m.guid, '8495447710d7c403b9d4137aee9b7d49');
  assert.deepEqual(m.spriteBorder, { x: 34, y: 53, z: 34, w: 36 });
  assert.equal(m.spriteMode, 1);
});

test('unityBorderToObj maps x,y,z,w to left,bottom,right,top', () => {
  assert.deepEqual(unityBorderToObj({ x: 34, y: 53, z: 34, w: 36 }), { left: 34, bottom: 53, right: 34, top: 36 });
  assert.equal(unityBorderToObj(null), null);
});

test('parseMeta returns ok:false on unparseable meta (never throws)', () => {
  const m = parseMeta(fx('bad.png.meta'));
  assert.equal(m.ok, false);
  assert.ok(m.error);
});

test('metaHash is stable and excludes guid', () => {
  const m = parseMeta(fx('good.png.meta'));
  const h1 = metaHash(m);
  const h2 = metaHash({ ...m, guid: 'COMPLETELY-DIFFERENT-GUID' });
  assert.equal(h1, h2); // guid must not affect the hash
  assert.match(h1, /^[0-9a-f]{64}$/);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `node --test scripts/components/meta.test.js`
Expected: FAIL — `Cannot find module './meta'`.

- [ ] **Step 4: Implement meta.js**

Create `scripts/components/meta.js`:
```js
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
```

- [ ] **Step 5: Run to verify pass**

Run: `node --test scripts/components/meta.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/components/meta.js scripts/components/meta.test.js scripts/components/__fixtures__
git commit -m "feat(components): meta parser with normalized metaHash"
```

---

## Task 4: Scanner — walk, pair, probe, classify, dedup

**Files:**
- Create: `scripts/components/scan.js`
- Test: `scripts/components/scan.test.js`

- [ ] **Step 1: Write the failing test (uses a temp fixture tree)**

Create `scripts/components/scan.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { loadGrammar } = require('./grammar');
const { scanComponents } = require('./scan');

const grammar = loadGrammar(path.join(__dirname, '..', '..', 'Components', '_index', 'grammar.json'));

async function makePng(p, { opaque = false } = {}) {
  const alpha = opaque ? 255 : 0;
  await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 1, g: 2, b: 3, alpha } } })
    .png().toFile(p);
}
const META = (guid, border) =>
  `fileFormatVersion: 2\nguid: ${guid}\nTextureImporter:\n  spriteMode: 1\n  spriteBorder: {x: ${border}, y: ${border}, z: ${border}, w: ${border}}\n`;

test('scan pairs, probes, and classifies a small tree', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
  const cat = path.join(root, 'Button');
  fs.mkdirSync(cat, { recursive: true });

  // good png+meta with a border
  await makePng(path.join(cat, 'Button_Main_01_Large_Background_Blue.png'));
  fs.writeFileSync(path.join(cat, 'Button_Main_01_Large_Background_Blue.png.meta'), META('aaa', 10));

  // png missing its meta -> blocking
  await makePng(path.join(cat, 'Orphan.png'));

  // zero-byte png -> blocking
  fs.writeFileSync(path.join(cat, 'Empty.png'), '');
  fs.writeFileSync(path.join(cat, 'Empty.png.meta'), META('bbb', 0));

  const res = await scanComponents(root, grammar);
  const byName = Object.fromEntries(res.components.map((c) => [c.name, c]));

  assert.equal(byName['Button_Main_01_Large_Background_Blue'].severity, 'ok');
  assert.deepEqual(byName['Button_Main_01_Large_Background_Blue'].border, { left: 10, bottom: 10, right: 10, top: 10 });
  assert.equal(byName['Button_Main_01_Large_Background_Blue'].sliceable, true);

  assert.equal(byName['Orphan'].severity, 'blocking');
  assert.ok(byName['Orphan'].issues.some((i) => i.type === 'missing-meta'));

  assert.equal(byName['Empty'].severity, 'blocking');
  assert.ok(byName['Empty'].issues.some((i) => i.type === 'zero-byte'));
});

test('scan flags duplicate vs borders-differ via (pngHash, metaHash) tuple', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
  const cat = path.join(root, 'Icon');
  fs.mkdirSync(cat, { recursive: true });

  // identical png bytes, identical meta -> duplicate
  await makePng(path.join(cat, 'Icon_Picto_A.png'), { opaque: true });
  fs.copyFileSync(path.join(cat, 'Icon_Picto_A.png'), path.join(cat, 'Icon_Picto_B.png'));
  fs.writeFileSync(path.join(cat, 'Icon_Picto_A.png.meta'), META('g1', 5));
  fs.writeFileSync(path.join(cat, 'Icon_Picto_B.png.meta'), META('g2', 5)); // same border -> same metaHash

  // identical png to A, but different border -> borders-differ
  fs.copyFileSync(path.join(cat, 'Icon_Picto_A.png'), path.join(cat, 'Icon_Picto_C.png'));
  fs.writeFileSync(path.join(cat, 'Icon_Picto_C.png.meta'), META('g3', 9));

  const res = await scanComponents(root, grammar);
  const byName = Object.fromEntries(res.components.map((c) => [c.name, c]));
  const types = (n) => byName[n].issues.map((i) => i.type);

  assert.ok(types('Icon_Picto_A').includes('duplicate') || types('Icon_Picto_B').includes('duplicate'));
  assert.ok(types('Icon_Picto_C').includes('borders-differ'));
});

test('effectiveAlpha is false for a fully-opaque RGBA png (no-alpha advisory)', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
  const cat = path.join(root, 'Icon');
  fs.mkdirSync(cat, { recursive: true });
  await makePng(path.join(cat, 'Icon_Picto_Opaque.png'), { opaque: true });
  fs.writeFileSync(path.join(cat, 'Icon_Picto_Opaque.png.meta'), META('g9', 0));
  const res = await scanComponents(root, grammar);
  const c = res.components.find((x) => x.name === 'Icon_Picto_Opaque');
  assert.equal(c.effectiveAlpha, false);
  assert.ok(c.issues.some((i) => i.type === 'no-alpha'));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test scripts/components/scan.test.js`
Expected: FAIL — `Cannot find module './scan'`.

- [ ] **Step 3: Implement scan.js**

Create `scripts/components/scan.js`:
```js
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { parseMeta, unityBorderToObj, metaHash } = require('./meta');
const { validateName } = require('./grammar');

const SIZE_FOLDERS = new Set(['Original', '512', '256', '128']);

// Recursively collect png files (any case) and meta files, skipping _-prefixed dirs.
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
    const ext = path.extname(rel).slice(1); // "png" or "Png"
    const idNoExt = rel.slice(0, -(ext.length + 1)); // strip ".png"
    const parts = rel.split(path.sep);
    const category = parts[0];
    const name = path.basename(idNoExt);
    const size = parts.find((p) => SIZE_FOLDERS.has(p)) || null;

    const issues = [];
    if (ext !== 'png') issues.push({ type: 'extension-case', severity: 'advisory', detail: `.${ext}` });
    if (/\s/.test(name)) issues.push({ type: 'naming', severity: 'advisory', detail: 'contains space' });

    // pair with meta (case-insensitive on the .png part)
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

// Tuple dedup: same png+same meta -> duplicate; same png+different meta -> borders-differ.
function dedup(components) {
  const byPng = new Map();
  for (const c of components) {
    if (!c.pngHash) continue;
    if (!byPng.has(c.pngHash)) byPng.set(c.pngHash, []);
    byPng.get(c.pngHash).push(c);
  }
  for (const group of byPng.values()) {
    if (group.length < 2) continue;
    const metaSet = new Set(group.map((c) => c.metaHash));
    for (const c of group) {
      if (metaSet.size === 1) c.issues.push({ type: 'duplicate', severity: 'advisory', detail: `same as ${group.filter((g) => g !== c).map((g) => g.name).join(', ')}` });
      else c.issues.push({ type: 'borders-differ', severity: 'advisory', detail: 'identical png, differing meta' });
    }
  }
}

module.exports = { scanComponents };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test scripts/components/scan.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/components/scan.js scripts/components/scan.test.js
git commit -m "feat(components): scanner — pair, probe, classify, tuple dedup"
```

---

## Task 5: Rename-map CSV — write, parse, canonical hash

**Files:**
- Create: `scripts/components/csv.js`
- Test: `scripts/components/csv.test.js`

- [ ] **Step 1: Write the failing tests**

Create `scripts/components/csv.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeRenameMap, parseRenameMap, canonicalCsvHash } = require('./csv');

const rows = [
  { old_path: 'Button/B_Old', new_name: 'Button_New', change_types: 'typo-fix', reason: 'Mian->Main' },
  { old_path: 'Icon/Aaa', new_name: 'Icon_Aaa', change_types: 'prefix-realign', reason: 'realign' },
];

test('write then parse round-trips rows and exposes the header hash', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'csv-')), 'rename-map.csv');
  writeRenameMap(f, rows);
  const { rows: got, headerHash } = parseRenameMap(f);
  assert.equal(got.length, 2);
  assert.equal(got[0].new_name, 'Button_New');
  assert.equal(headerHash, canonicalCsvHash(rows));
});

test('hash ignores reason text and row order, but not the mapping', () => {
  const reordered = [rows[1], { ...rows[0], reason: 'different note' }];
  assert.equal(canonicalCsvHash(reordered), canonicalCsvHash(rows));
  const changed = [{ ...rows[0], new_name: 'Button_Changed' }, rows[1]];
  assert.notEqual(canonicalCsvHash(changed), canonicalCsvHash(rows));
});

test('commas/quotes in fields survive round-trip', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'csv-')), 'm.csv');
  const tricky = [{ old_path: 'X/a', new_name: 'X_a', change_types: 'variant', reason: 'has, comma and "quote"' }];
  writeRenameMap(f, tricky);
  assert.equal(parseRenameMap(f).rows[0].reason, 'has, comma and "quote"');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test scripts/components/csv.test.js`
Expected: FAIL — `Cannot find module './csv'`.

- [ ] **Step 3: Implement csv.js**

Create `scripts/components/csv.js`:
```js
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
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test scripts/components/csv.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/components/csv.js scripts/components/csv.test.js
git commit -m "feat(components): rename-map CSV read/write + canonical hash"
```

---

## Task 6: Reference scan — code-scoped, case-sensitive

**Files:**
- Create: `scripts/check-component-refs.js`
- Test: `scripts/components/refs.test.js`

- [ ] **Step 1: Write the failing test**

Create `scripts/components/refs.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findComponentRefs } = require('../check-component-refs');

test('finds a planted code reference; ignores docs and lowercase', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'import x from "Components/Button/Foo.png";\n');
  fs.writeFileSync(path.join(root, 'src', 'b.ts'), 'const p = "react-components/widget";\n'); // lowercase -> ignore
  fs.writeFileSync(path.join(root, 'docs', 'd.md'), 'see Components/ here\n'); // docs -> ignore

  const hits = findComponentRefs(root);
  assert.equal(hits.length, 1);
  assert.match(hits[0].file, /src[\\/]a\.ts$/);
});

test('clean tree returns no hits', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'const ok = 1;\n');
  assert.deepEqual(findComponentRefs(root), []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test scripts/components/refs.test.js`
Expected: FAIL — `Cannot find module '../check-component-refs'`.

- [ ] **Step 3: Implement check-component-refs.js**

Create `scripts/check-component-refs.js`:
```js
const fs = require('node:fs');
const path = require('node:path');

// Threat = CODE references to the literal "Components/" (capital C). Doc prose is irrelevant.
const CODE_DIRS = ['src', 'scripts'];
const ROOT_FILES = ['build.json', 'package.json', 'tsconfig.json'];
const EXT = /\.(ts|js|json|html)$/;
const NEEDLE = 'Components/'; // case-sensitive

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
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
  lines.forEach((text, i) => {
    if (text.includes(NEEDLE)) hits.push({ file: path.relative(root, full), line: i + 1, text: text.trim() });
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
```

- [ ] **Step 4: Run to verify pass + verify the real repo is clean**

Run: `node --test scripts/components/refs.test.js`
Expected: PASS — 2 tests.

Run: `node scripts/check-component-refs.js`
Expected: `No code references to Components/ — safe to rename.` (exit 0)

- [ ] **Step 5: Commit**

```bash
git add scripts/check-component-refs.js scripts/components/refs.test.js
git commit -m "feat(components): code-scoped, case-sensitive reference scan"
```

---

## Task 7: Rename journal — write/read/resume contract

**Files:**
- Create: `scripts/components/journal.js`
- Test: `scripts/components/journal.test.js`

- [ ] **Step 1: Write the failing tests**

Create `scripts/components/journal.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openJournal, planResume } = require('./journal');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'jrnl-')); }

test('a fresh journal records the header and marks pairs complete', () => {
  const dir = tmp();
  const j = openJournal(path.join(dir, 'rename-journal.jsonl'), { csvSha256: 'abc', confirmCount: 1 });
  j.start('Old');
  j.pngDone('Old');
  j.complete('Old');
  j.close();
  const lines = fs.readFileSync(path.join(dir, 'rename-journal.jsonl'), 'utf8').trim().split('\n');
  assert.deepEqual(JSON.parse(lines[0]), { csvSha256: 'abc', confirmCount: 1, type: 'header' });
});

test('resume aborts when the CSV hash changed since the journal started', () => {
  const dir = tmp();
  const p = path.join(dir, 'rename-journal.jsonl');
  fs.writeFileSync(p, JSON.stringify({ type: 'header', csvSha256: 'OLD', confirmCount: 1 }) + '\n');
  assert.throws(() => planResume(p, 'NEW'), /csv.*changed|hash/i);
});

test('resume: png-done -> finish meta; pending+oldGone+newPresent -> complete; pending+bothGone -> abort', () => {
  const dir = tmp();
  const p = path.join(dir, 'rename-journal.jsonl');
  const entries = [
    { type: 'header', csvSha256: 'H', confirmCount: 3 },
    { type: 'pair', id: 'A', state: 'png-done' },
    { type: 'pair', id: 'B', state: 'pending' },
    { type: 'pair', id: 'C', state: 'pending' },
  ];
  fs.writeFileSync(p, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');

  const plan = planResume(p, 'H', {
    oldExists: (id) => id === 'B' ? false : id === 'C' ? false : true,
    newExists: (id) => id === 'B' ? true : false,
  });
  assert.equal(plan.find((x) => x.id === 'A').action, 'finish-meta');
  assert.equal(plan.find((x) => x.id === 'B').action, 'skip-complete');
  assert.equal(plan.find((x) => x.id === 'C').action, 'abort');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test scripts/components/journal.test.js`
Expected: FAIL — `Cannot find module './journal'`.

- [ ] **Step 3: Implement journal.js**

Create `scripts/components/journal.js`:
```js
const fs = require('node:fs');

function openJournal(journalPath, { csvSha256, confirmCount }) {
  fs.writeFileSync(journalPath, JSON.stringify({ type: 'header', csvSha256, confirmCount }) + '\n');
  const append = (obj) => fs.appendFileSync(journalPath, JSON.stringify(obj) + '\n');
  return {
    start: (id) => append({ type: 'pair', id, state: 'pending' }),
    pngDone: (id) => append({ type: 'pair', id, state: 'png-done' }),
    complete: (id) => append({ type: 'pair', id, state: 'complete' }),
    close: () => {
      const done = journalPath.replace(/\.jsonl$/, `-${Date.now()}.done`);
      fs.renameSync(journalPath, done);
      return done;
    },
  };
}

function readJournal(journalPath) {
  const lines = fs.readFileSync(journalPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const header = lines.find((l) => l.type === 'header');
  const latest = new Map();
  for (const l of lines) if (l.type === 'pair') latest.set(l.id, l.state);
  return { header, latest };
}

// Returns a plan [{id, action}] for resuming; throws on CSV-hash mismatch or a lost file.
function planResume(journalPath, currentCsvSha256, fsProbe = {}) {
  const { header, latest } = readJournal(journalPath);
  if (!header || header.csvSha256 !== currentCsvSha256) {
    throw new Error(`rename-map CSV changed since journal started (hash mismatch) — aborting to avoid a half-merged result`);
  }
  const oldExists = fsProbe.oldExists || (() => true);
  const newExists = fsProbe.newExists || (() => false);
  const plan = [];
  for (const [id, state] of latest) {
    if (state === 'complete') continue;
    if (state === 'png-done') { plan.push({ id, action: 'finish-meta' }); continue; }
    // pending
    if (oldExists(id)) plan.push({ id, action: 'do-pair' });
    else if (newExists(id)) plan.push({ id, action: 'skip-complete' });
    else plan.push({ id, action: 'abort' });
  }
  return plan;
}

module.exports = { openJournal, readJournal, planResume };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test scripts/components/journal.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/components/journal.js scripts/components/journal.test.js
git commit -m "feat(components): rename journal with resume contract"
```

---

## Task 8: Renderers — names.html and gallery.html

**Files:**
- Create: `scripts/components/render.js`
- Test: `scripts/components/render.test.js`

- [ ] **Step 1: Write the failing test**

Create `scripts/components/render.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderNames, renderGallery } = require('./render');

const components = [
  { id: 'Button/Button_Main_Background_Blue', category: 'Button', name: 'Button_Main_Background_Blue', file: 'Button/Button_Main_Background_Blue.png', size: null, width: 320, height: 96, border: { left: 34, bottom: 53, right: 34, top: 36 }, issues: [], severity: 'ok' },
  { id: 'Button/Bad', category: 'Button', name: 'Bad', file: 'Button/Bad.png', size: null, width: null, height: null, border: null, issues: [{ type: 'missing-meta', severity: 'blocking', detail: 'no .meta' }], severity: 'blocking' },
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
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test scripts/components/render.test.js`
Expected: FAIL — `Cannot find module './render'`.

- [ ] **Step 3: Implement render.js**

Create `scripts/components/render.js`. Pages live in `Components/_index/`, so image paths are `../<file>`:
```js
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function groupByCategory(components) {
  const m = new Map();
  for (const c of components) { if (!m.has(c.category)) m.set(c.category, []); m.get(c.category).push(c); }
  for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return m;
}
const FILTER_JS = `
<script>
const q=document.getElementById('q');
q.addEventListener('input',()=>{const t=q.value.toLowerCase();
document.querySelectorAll('[data-name]').forEach(e=>{e.style.display=e.dataset.name.includes(t)?'':'none';});});
document.querySelectorAll('details>summary').forEach(s=>s.addEventListener('click',()=>{}));
</script>`;

function renderNames(components) {
  const groups = groupByCategory(components);
  let body = '';
  for (const [cat, list] of groups) {
    body += `<details open><summary>${esc(cat)} (${list.length})</summary><div class="grid">`;
    for (const c of list) {
      body += `<figure data-name="${esc(c.name.toLowerCase())}"><img loading="lazy" src="../${esc(c.file)}" alt="${esc(c.name)}"><figcaption>${esc(c.name)}</figcaption></figure>`;
    }
    body += `</div></details>`;
  }
  return `<!doctype html><meta charset="utf-8"><title>Components — Names</title>
<style>body{font-family:sans-serif;margin:1rem}.grid{display:flex;flex-wrap:wrap;gap:12px}
figure{width:140px;margin:0;text-align:center}img{max-width:128px;max-height:128px;background:#eee}
figcaption{font-size:11px;word-break:break-all}#q{padding:6px;width:300px;margin-bottom:1rem}</style>
<input id="q" placeholder="filter by name…"><div>${body}</div>${FILTER_JS}`;
}

function renderGallery(components) {
  const groups = groupByCategory(components);
  const blocking = components.filter((c) => c.severity === 'blocking');
  let body = `<section class="issues"><h2>Blocking issues (${blocking.length})</h2><ul>` +
    blocking.map((c) => `<li>${esc(c.name)} — ${esc(c.issues.filter(i=>i.severity==='blocking').map(i=>i.type).join(', '))}</li>`).join('') + `</ul></section>`;
  for (const [cat, list] of groups) {
    body += `<details><summary>${esc(cat)} (${list.length})</summary><div class="grid">`;
    for (const c of list) {
      const snippet = c.border ? `{ left: ${c.border.left}, bottom: ${c.border.bottom}, right: ${c.border.right}, top: ${c.border.top} }` : '(no border)';
      const issues = c.issues.map((i) => `${i.type}`).join(', ') || 'ok';
      body += `<figure data-name="${esc(c.name.toLowerCase())}" data-severity="${esc(c.severity)}" class="sev-${esc(c.severity)}">
<img loading="lazy" src="../${esc(c.file)}" alt="${esc(c.name)}">
<figcaption>${esc(c.name)}<br><small>${esc(c.width ?? '?')}×${esc(c.height ?? '?')}</small>
<br><code>${esc(snippet)}</code><br><em>${esc(issues)}</em></figcaption></figure>`;
    }
    body += `</div></details>`;
  }
  return `<!doctype html><meta charset="utf-8"><title>Components — Gallery</title>
<style>body{font-family:sans-serif;margin:1rem}.grid{display:flex;flex-wrap:wrap;gap:12px}
figure{width:160px;margin:0;text-align:center}img{max-width:128px;max-height:128px;background:#eee}
figcaption{font-size:11px;word-break:break-all}code{font-size:10px}
.sev-blocking{outline:2px solid red}#q{padding:6px;width:300px;margin-bottom:1rem}.issues{background:#fee;padding:8px}</style>
<input id="q" placeholder="filter by name…"><div>${body}</div>${FILTER_JS}`;
}

module.exports = { renderNames, renderGallery };
```

> Note: the spec calls for collapsed-by-default categories with thumbnails built on expand and on-demand border overlays. This implementation collapses categories (`<details>` without `open` in the gallery) so the browser still parses all nodes; if the real 1,249-item page feels heavy when run in Task 11, add per-category lazy node construction then. Ship the simpler version first.

- [ ] **Step 4: Run to verify pass**

Run: `node --test scripts/components/render.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/components/render.js scripts/components/render.test.js
git commit -m "feat(components): names.html and gallery.html renderers"
```

---

## Task 9: Reports — manifest, audit-report, counts, signoff, README grammar

**Files:**
- Create: `scripts/components/report.js`
- Test: `scripts/components/report.test.js`

- [ ] **Step 1: Write the failing tests**

Create `scripts/components/report.test.js`:
```js
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
  const cur = buildCounts(components); // not used for hash; freshness uses category hashes
  const fresh = signoffFreshness(components, prev);
  assert.equal(fresh.Button.stale, true); // hash differs from "oldhash"
  assert.ok(fresh.Button.hash);
});

test('renderGrammarMarkdown lists categories and vocab from grammar', () => {
  const md = renderGrammarMarkdown(grammar);
  assert.match(md, /Button/);
  assert.match(md, /Background/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test scripts/components/report.test.js`
Expected: FAIL — `Cannot find module './report'`.

- [ ] **Step 3: Implement report.js**

Create `scripts/components/report.js`:
```js
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
  return md;
}

module.exports = { buildManifest, buildCounts, buildReport, categoryHash, signoffFreshness, renderGrammarMarkdown };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test scripts/components/report.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/components/report.js scripts/components/report.test.js
git commit -m "feat(components): manifest/report/counts/signoff/grammar-md builders"
```

---

## Task 10: Audit entrypoint

**Files:**
- Create: `scripts/audit-components.js`

- [ ] **Step 1: Implement the entrypoint**

Create `scripts/audit-components.js`:
```js
const fs = require('node:fs');
const path = require('node:path');
const { loadGrammar, assertVocabDisjoint, validateName, proposeName } = require('./components/grammar');
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

  // Rename map: only non-conformant names produce a row (old != new).
  const rows = [];
  for (const c of components) {
    if (validateName(c.name, grammar).conformant) continue;
    const { newName, changeTypes } = proposeName(c.name, c.category, grammar);
    if (newName === c.name) continue;
    rows.push({ old_path: c.id, new_name: newName, change_types: changeTypes.join('+'), reason: changeTypes.join(', ') || 'normalize' });
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

  // Sign-off freshness (reads previous hashes from signoff.json sidecar if present).
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
```

- [ ] **Step 2: Run the audit on the real corpus**

Run: `npm run audit:components`
Expected: prints `~1249 images`, a rename-map count, creates the initial `expected-counts.json`, and writes all artifacts. Verify:
```bash
ls Components/_index/
node -e "JSON.parse(require('fs').readFileSync('Components/_index/manifest.json','utf8')); console.log('manifest valid json')"
```
Expected: lists `gallery.html names.html manifest.json audit-report.md rename-map.csv expected-counts.json proposed-counts.json signoff.hashes.json grammar.generated.md grammar.json`, then `manifest valid json`.

- [ ] **Step 3: Sanity-check the gallery in a browser**

Run: `open Components/_index/gallery.html` (macOS)
Expected: page opens; categories expand to show thumbnails; the filter box narrows by name; blocking items appear in the top "Issues" list with red outlines. If the page is sluggish, note it for the render follow-up mentioned in Task 8.

- [ ] **Step 4: Commit (artifacts + entrypoint)**

```bash
git add scripts/audit-components.js Components/_index/manifest.json Components/_index/audit-report.md \
  Components/_index/expected-counts.json Components/_index/names.html Components/_index/gallery.html \
  Components/_index/grammar.generated.md Components/_index/signoff.hashes.json
git commit -m "feat(components): audit entrypoint + first generated index"
```

---

## Task 11: Apply entrypoint — guarded, journal-backed rename

**Files:**
- Create: `scripts/rename-components.js`
- Test: `scripts/components/rename.test.js`

- [ ] **Step 1: Write the failing test (drives the core applyRenames function)**

Create `scripts/components/rename.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyRenames } = require('../rename-components');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-'));
  const cat = path.join(root, 'Button');
  fs.mkdirSync(cat, { recursive: true });
  fs.writeFileSync(path.join(cat, 'Old.png'), 'PNGDATA');
  fs.writeFileSync(path.join(cat, 'Old.png.meta'), 'guid: 1');
  return { root, cat };
}

test('renames png+meta as a pair and writes a .done journal', () => {
  const { root, cat } = setup();
  const rows = [{ old_path: 'Button/Old', new_name: 'Button_New', change_types: 'typo-fix', reason: 'x' }];
  applyRenames({ componentsDir: root, rows, csvSha256: 'H', confirmCount: 1 });
  assert.ok(fs.existsSync(path.join(cat, 'Button_New.png')));
  assert.ok(fs.existsSync(path.join(cat, 'Button_New.png.meta')));
  assert.ok(!fs.existsSync(path.join(cat, 'Old.png')));
  assert.ok(fs.readdirSync(path.join(root, '_index')).some((f) => f.endsWith('.done')));
});

test('confirm-count mismatch aborts before moving anything', () => {
  const { root, cat } = setup();
  const rows = [{ old_path: 'Button/Old', new_name: 'Button_New', change_types: '', reason: '' }];
  assert.throws(() => applyRenames({ componentsDir: root, rows, csvSha256: 'H', confirmCount: 99 }), /confirm-count|count/i);
  assert.ok(fs.existsSync(path.join(cat, 'Old.png'))); // untouched
});

test('case-insensitive collision in targets aborts', () => {
  const { root } = setup();
  const rows = [
    { old_path: 'Button/Old', new_name: 'Button_Dup', change_types: '', reason: '' },
    { old_path: 'Button/Old', new_name: 'button_dup', change_types: '', reason: '' },
  ];
  assert.throws(() => applyRenames({ componentsDir: root, rows, csvSha256: 'H', confirmCount: 2 }), /collision|case/i);
});

test('refuses to overwrite an existing target', () => {
  const { root, cat } = setup();
  fs.writeFileSync(path.join(cat, 'Button_New.png'), 'EXISTING');
  const rows = [{ old_path: 'Button/Old', new_name: 'Button_New', change_types: '', reason: '' }];
  assert.throws(() => applyRenames({ componentsDir: root, rows, csvSha256: 'H', confirmCount: 1 }), /exists|overwrite/i);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test scripts/components/rename.test.js`
Expected: FAIL — `applyRenames is not a function`.

- [ ] **Step 3: Implement rename-components.js**

Create `scripts/rename-components.js`:
```js
const fs = require('node:fs');
const path = require('node:path');
const { parseRenameMap, canonicalCsvHash } = require('./components/csv');
const { openJournal, planResume } = require('./components/journal');
const { findComponentRefs } = require('./check-component-refs');

// Resolve a row's on-disk png path from its id (old_path is id-style: "Category/Name").
function pngPathFor(componentsDir, idLike) {
  // Find the actual png (preserve subfolders); idLike already includes category/subdirs.
  const guesses = [idLike + '.png', idLike + '.Png'];
  for (const g of guesses) {
    const abs = path.join(componentsDir, g);
    if (fs.existsSync(abs)) return abs;
  }
  return path.join(componentsDir, idLike + '.png');
}

function applyRenames({ componentsDir, rows, csvSha256, confirmCount }) {
  if (rows.length !== confirmCount) {
    throw new Error(`--confirm-count mismatch: CSV has ${rows.length} row(s), you passed ${confirmCount}`);
  }
  // Case-insensitive target collision check.
  const lowerTargets = new Map();
  for (const r of rows) {
    const key = path.join(path.dirname(r.old_path), r.new_name).toLowerCase();
    if (lowerTargets.has(key)) throw new Error(`case-insensitive collision: "${r.new_name}" collides with "${lowerTargets.get(key)}"`);
    lowerTargets.set(key, r.new_name);
  }
  // Refuse to overwrite existing targets.
  for (const r of rows) {
    const target = path.join(componentsDir, path.dirname(r.old_path), r.new_name + '.png');
    if (fs.existsSync(target)) throw new Error(`target already exists, refusing to overwrite: ${target}`);
  }

  const indexDir = path.join(componentsDir, '_index');
  fs.mkdirSync(indexDir, { recursive: true });
  const journal = openJournal(path.join(indexDir, 'rename-journal.jsonl'), { csvSha256, confirmCount });

  for (const r of rows) {
    journal.start(r.old_path);
    const srcPng = pngPathFor(componentsDir, r.old_path);
    const ext = path.extname(srcPng); // ".png" or ".Png"
    const dir = path.dirname(srcPng);
    const dstPng = path.join(dir, r.new_name + '.png'); // normalize extension case to .png
    fs.renameSync(srcPng, dstPng);
    journal.pngDone(r.old_path);
    if (fs.existsSync(srcPng + '.meta')) fs.renameSync(srcPng + '.meta', dstPng + '.meta');
    journal.complete(r.old_path);
  }
  return journal.close();
}

// Resume an interrupted run from an existing journal, honoring the contract in journal.js.
function resumeFromJournal(componentsDir, journalPath, liveHash, rows) {
  const newNameById = new Map(rows.map((r) => [r.old_path, r.new_name]));
  const plan = planResume(journalPath, liveHash, {
    oldExists: (id) => fs.existsSync(pngPathFor(componentsDir, id)),
    newExists: (id) => fs.existsSync(path.join(componentsDir, path.dirname(id), newNameById.get(id) + '.png')),
  });
  for (const step of plan) {
    if (step.action === 'abort') throw new Error(`pair "${step.id}" lost mid-crash (old gone, new absent) — investigate before retrying`);
    if (step.action === 'finish-meta') {
      const dir = path.join(componentsDir, path.dirname(step.id));
      const oldMeta = path.join(dir, path.basename(step.id) + '.png.meta');
      const newMeta = path.join(dir, newNameById.get(step.id) + '.png.meta');
      if (fs.existsSync(oldMeta)) fs.renameSync(oldMeta, newMeta);
    }
    if (step.action === 'do-pair') {
      const src = pngPathFor(componentsDir, step.id);
      const dst = path.join(path.dirname(src), newNameById.get(step.id) + '.png');
      fs.renameSync(src, dst);
      if (fs.existsSync(src + '.meta')) fs.renameSync(src + '.meta', dst + '.meta');
    }
    // 'skip-complete' → nothing to do
  }
  const done = journalPath.replace(/\.jsonl$/, `-${Date.now()}.done`);
  fs.renameSync(journalPath, done);
  return done;
}

module.exports = { applyRenames, resumeFromJournal };

if (require.main === module) {
  const ROOT = path.resolve(__dirname, '..');
  const COMPONENTS = path.join(ROOT, 'Components');
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));

  // Gate 1: no code references to Components/.
  const refs = findComponentRefs(ROOT);
  if (refs.length) { console.error(`Aborting: ${refs.length} code reference(s) to Components/ exist.`); refs.forEach((h) => console.error(`  ${h.file}:${h.line}`)); process.exit(1); }

  const { rows, headerHash } = parseRenameMap(path.join(COMPONENTS, '_index', 'rename-map.csv'));
  const liveHash = canonicalCsvHash(rows);
  if (headerHash && headerHash !== liveHash) { console.error('Aborting: CSV body no longer matches its header hash (was it regenerated?).'); process.exit(1); }
  if (args['expect-csv-sha256'] && args['expect-csv-sha256'] !== liveHash) { console.error('Aborting: --expect-csv-sha256 does not match the CSV.'); process.exit(1); }
  if (args['confirm-count'] == null) { console.error('Refusing: pass --confirm-count=N (N = number of rows you reviewed).'); process.exit(1); }

  try {
    const journalPath = path.join(COMPONENTS, '_index', 'rename-journal.jsonl');
    let done;
    if (fs.existsSync(journalPath)) {
      console.log('Found an unfinished journal — resuming the interrupted run.');
      done = resumeFromJournal(COMPONENTS, journalPath, liveHash, rows); // throws on hash mismatch / lost pair
    } else {
      done = applyRenames({ componentsDir: COMPONENTS, rows, csvSha256: liveHash, confirmCount: Number(args['confirm-count']) });
    }
    console.log(`Renamed ${rows.length} file pair(s). Journal: ${path.basename(done)}`);
  } catch (err) { console.error(`Aborted: ${err.message}`); process.exit(1); }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test scripts/components/rename.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Run the full component test suite**

Run: `npm run test:components`
Expected: all tests across grammar/meta/scan/csv/refs/journal/render/report/rename PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/rename-components.js scripts/components/rename.test.js
git commit -m "feat(components): guarded, journal-backed rename apply"
```

---

## Task 12: 9-slice round-trip test (guards the border-order contract)

**Files:**
- Create: `scripts/components/nineslice.test.js`

- [ ] **Step 1: Write the test**

This asserts the manifest's border maps to PIXI edge widths exactly as `makeNineSlice` intends, without importing PIXI (which needs a browser/WebGL). It pins the documented mapping `{x→left, y→bottom, z→right, w→top}` and the wrapper's `(leftWidth, topHeight, rightWidth, bottomHeight)` order.

Create `scripts/components/nineslice.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { unityBorderToObj } = require('./meta');

// Mirror of src/shared/nineSlice.ts makeNineSlice's border mapping (keep in sync).
function pixiEdges(border) {
  return { leftWidth: border.left, topHeight: border.top, rightWidth: border.right, bottomHeight: border.bottom };
}

test('Unity spriteBorder {x,y,z,w} round-trips to PIXI edge widths', () => {
  const unity = { x: 34, y: 53, z: 30, w: 36 }; // x=left,y=bottom,z=right,w=top
  const border = unityBorderToObj(unity);
  assert.deepEqual(border, { left: 34, bottom: 53, right: 30, top: 36 });
  assert.deepEqual(pixiEdges(border), { leftWidth: 34, topHeight: 36, rightWidth: 30, bottomHeight: 53 });
});
```

- [ ] **Step 2: Run to verify pass**

Run: `node --test scripts/components/nineslice.test.js`
Expected: PASS — 1 test.

- [ ] **Step 3: Commit**

```bash
git add scripts/components/nineslice.test.js
git commit -m "test(components): 9-slice border-order round-trip"
```

---

## Task 13: Skill helper CLI

**Files:**
- Create: `scripts/components-cli.js`
- Test: `scripts/components/cli.test.js`

- [ ] **Step 1: Write the failing test**

Create `scripts/components/cli.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test scripts/components/cli.test.js`
Expected: FAIL — `Cannot find module '../components-cli'`.

- [ ] **Step 3: Implement components-cli.js**

Create `scripts/components-cli.js`:
```js
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
    const why = c.issues.filter((i) => i.severity === 'blocking').map((i) => i.type).join(', ');
    return { status: 'refused', reason: `blocking issue(s): ${why}` };
  }
  return { status: 'ok', id: c.id, file: c.file, border: c.border, variableName: camel(c.name) };
}

function camel(name) {
  return name.split('_').map((t, i) => (i === 0 ? t[0].toLowerCase() + t.slice(1) : t)).join('');
}

module.exports = { lookup, useComponent, KNOWN_GRAMMAR_VERSION };

if (require.main === module) {
  const [cmd, name] = process.argv.slice(2);
  const manifestPath = path.resolve(__dirname, '..', 'Components', '_index', 'manifest.json');
  const fn = cmd === 'use' ? useComponent : lookup;
  console.log(JSON.stringify(fn(manifestPath, name), null, 2));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test scripts/components/cli.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/components-cli.js scripts/components/cli.test.js
git commit -m "feat(components): deterministic skill helper CLI"
```

---

## Task 14: The `components` skill

**Files:**
- Create: `.claude/skills/components/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `.claude/skills/components/SKILL.md`:
```markdown
---
name: components
description: Use when adding a UI component (button, frame, slider, label, popup, title, icon) from the Components/ library into a playable — finds it, copies the PNG into assets/, and wires up the PIXI sprite/9-slice from the Unity meta border.
---

# Using the Components library

This skill turns "add the green main button to my scene" into the right deterministic steps.
The mechanical work is done by `scripts/components-cli.js`; you only resolve intent and place code.

## Steps

1. **Refresh the index if needed.** If `Components/_index/manifest.json` is missing or the user
   just added art, run `npm run audit:components`.

2. **Resolve the exact name.** Run `node scripts/components-cli.js lookup "<Name>"`.
   - `status: "ok"` → use `match`.
   - `status: "ambiguous"` → the name exists at multiple icon sizes. **Show the candidates and
     ask which size** (e.g. 256 vs 512). Never pick silently.
   - `status: "not-found"` → ask the user to confirm the name or open `Components/_index/names.html`.
   - `status: "grammar-too-new"` → tell the user to update the tooling; stop.

3. **Get wiring data.** Run `node scripts/components-cli.js use "<ExactName>"`.
   - `status: "refused"` → **do not wire it.** Tell the user the cited blocking issue and which
     part is bad. For a multi-part widget, if ANY part is refused, refuse the whole assembly.
   - `status: "ok"` → you get `{ id, file, border, variableName }`.

4. **Copy the PNG into assets/.** Copy `Components/<file>` into the appropriate `assets/UI/`
   subfolder (the build converts PNG→WebP automatically).

5. **Write the code.** Import the asset and bind it to the **canonical variable name**
   (`variableName` from the CLI) on the import line; use a **short local alias** at the usage
   site for readability (e.g. `bg`, `border`, `innerBorder`, `focusGlow`). If `border` is
   non-null, wire a 9-slice:
   ```ts
   import bgData from 'assets/UI/<file>.webp';
   const bg = makeNineSlice({ texture: Texture.from(bgData), border: <border>, width, height });
   container.addChild(bg); // container = the scene's `ui` container
   ```
   If `border` is null, use a plain `Sprite`. Add to the scene's designated `ui` container.
   **If the target scene or container is ambiguous, ask** rather than guessing.

## Scope

UI components only. Backgrounds, boards, and characters (Spine) are sourced the way existing
playables already do them — out of scope here.
```

- [ ] **Step 2: Verify the skill is discoverable**

Run: `cat .claude/skills/components/SKILL.md | head -5`
Expected: shows the frontmatter with `name: components`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/components/SKILL.md
git commit -m "feat(components): add components skill"
```

---

## Task 15: README + final integration pass

**Files:**
- Create: `Components/README.md`

- [ ] **Step 1: Author the README (workflow + sign-off), embedding the generated grammar**

Create `Components/README.md`:
```markdown
# Components — UI Asset Library

The source library for UI art (buttons, frames, sliders, labels, popups, titles, icons).
Not loaded at runtime directly — components are copied into `assets/` per playable.

## Quick use

1. Run `npm run audit:components` (regenerates the index).
2. Open `Components/_index/names.html` to find the component name, or `gallery.html` for full QA.
3. Use the `components` skill, or `node scripts/components-cli.js lookup "<Name>"`.
4. Copy the PNG into `assets/UI/`; the build converts to WebP.
5. Wire it with `makeNineSlice` (see `src/shared/nineSlice.ts`) using the meta border.

## Naming

Canonical ID = the file's path under `Components/` without extension. Names follow the grammar
below. To rename: `npm run audit:components` writes `_index/rename-map.csv`; review/edit it, then
`npm run rename:components --confirm-count=<rows> --expect-csv-sha256=<hash from the file header>`.
Renaming is safe only while no code references `Components/` (the apply step enforces this).

<!-- Paste the contents of _index/grammar.generated.md below; regenerate when grammar.json changes. -->

## Visual sign-off

Track verification in `_index/signoff.md`: one row per category. Open `gallery.html`, spot-check
the deterministic sample (10 evenly-spaced items) plus every blocking-issue item, and sign with
name + date. A category re-needs signing when `npm run audit:components` reports its hash changed.
```

- [ ] **Step 2: Paste the generated grammar section into the README**

Run:
```bash
cd /Users/idohoresh/Desktop/pocket-playable
node -e "const fs=require('fs');const md=fs.readFileSync('Components/_index/grammar.generated.md','utf8');const r=fs.readFileSync('Components/README.md','utf8').replace('<!-- Paste the contents of _index/grammar.generated.md below; regenerate when grammar.json changes. -->', md);fs.writeFileSync('Components/README.md', r);"
```
Expected: the README now contains the categories + vocab from `grammar.json`. Verify with `grep -c "Categories:" Components/README.md` → `1`.

- [ ] **Step 3: Create the sign-off checklist scaffold**

Create `Components/_index/signoff.md`:
```markdown
# Visual sign-off

Open `gallery.html`. For each category, spot-check the sample + all blocking items, then sign.
A row goes stale when `npm run audit:components` reports the category hash changed.

| Category | Reviewer | Date | Notes |
|---|---|---|---|
| Button | | | |
| Frame | | | |
| Slider | | | |
| Title | | | |
| Label | | | |
| Popup | | | |
| UI_Etc | | | |
| Icon_Chest | | | |
| Icon_ItemIcons | | | |
| Icon_PictoIcons | | | |
| Icon_ShopItem | | | |
```

- [ ] **Step 4: Run the full suite one more time**

Run: `npm run test:components && node scripts/check-component-refs.js`
Expected: all tests PASS; `No code references to Components/ — safe to rename.`

- [ ] **Step 5: Commit**

```bash
git add Components/README.md Components/_index/signoff.md
git commit -m "docs(components): README workflow + grammar + sign-off scaffold"
```

---

## Task 16: Dry-run the rename on a copy, then decide

**Files:** none (verification task)

- [ ] **Step 1: Inspect the proposed rename map**

Run:
```bash
cd /Users/idohoresh/Desktop/pocket-playable
head -20 Components/_index/rename-map.csv
wc -l Components/_index/rename-map.csv
```
Expected: a `# csv-sha256:` header, a column header, then `old_path,new_name,change_types,reason` rows — only for non-conformant names. Note the row count.

- [ ] **Step 2: Dry-run apply on a throwaway copy (never the real folder first)**

Run:
```bash
cp -R Components /tmp/Components_dryrun
ROWS=$(grep -vc '^#\|^old_path' Components/_index/rename-map.csv)
HASH=$(grep -m1 'csv-sha256' Components/_index/rename-map.csv | sed 's/.*: //')
node -e "
const {applyRenames}=require('./scripts/rename-components.js');
const {parseRenameMap,canonicalCsvHash}=require('./scripts/components/csv.js');
const {rows}=parseRenameMap('Components/_index/rename-map.csv');
applyRenames({componentsDir:'/tmp/Components_dryrun', rows, csvSha256:canonicalCsvHash(rows), confirmCount:rows.length});
console.log('dry-run renamed', rows.length, 'pairs');
"
```
Expected: prints the count; `/tmp/Components_dryrun` has the renamed pairs and a `.done` journal in its `_index/`. Spot-check a few:
```bash
ls /tmp/Components_dryrun/Button | head
```

- [ ] **Step 3: Re-audit the dry-run copy to confirm fewer naming issues**

Run:
```bash
node -e "
const {scanComponents}=require('./scripts/components/scan.js');
const {loadGrammar}=require('./scripts/components/grammar.js');
const g=loadGrammar('Components/_index/grammar.json');
scanComponents('/tmp/Components_dryrun', g).then(r=>{
  const naming=r.components.filter(c=>c.issues.some(i=>i.type==='naming')).length;
  console.log('naming issues after rename:', naming, '/', r.components.length);
});
"
rm -rf /tmp/Components_dryrun
```
Expected: naming-issue count is substantially lower than before. (It won't be zero — `proposeName` is best-effort; the CSV review is where the rest gets fixed.)

- [ ] **Step 4: Hand off the rename decision to the user**

The actual rename of the real `Components/` folder is a **human-reviewed** action: the user edits `rename-map.csv`, then runs
`npm run rename:components --confirm-count=<ROWS> --expect-csv-sha256=<HASH>`.
Do **not** run this against the real folder automatically — surface the command and let the user run it after reviewing the CSV.

- [ ] **Step 5: Final commit (any remaining generated artifacts)**

```bash
git add -A Components/_index/
git commit -m "chore(components): refresh generated index artifacts" || echo "nothing to commit"
```
