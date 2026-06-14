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
  const allVocab = vocabValues(grammar);
  if (allVocab.includes(subtype)) return { conformant: false, reason: `subtype "${subtype}" collides with a vocabulary value` };

  const order = grammar.slotOrder;
  const parsed = { category, subtype };
  let si = 0;
  for (const tok of tokens.slice(2)) {
    let matched = false;
    while (si < order.length) {
      const slot = order[si];
      if (slotMatches(slot, tok, grammar)) {
        parsed[slot] = tok;
        si++;        // consume this slot
        matched = true;
        break;
      }
      si++;          // optional slot not present here — try the next
    }
    if (!matched) {
      // Free-label categories (no required slots) may carry extra descriptive tokens (e.g. Icon_Picto_Book).
      // Categories with required slots must have every token map to a known slot.
      if ((grammar.requiredSlots[category] || []).length > 0) {
        return { conformant: false, reason: `token "${tok}" fits no remaining slot` };
      }
      // else: allow free-form token for open categories
    }
  }

  for (const req of (grammar.requiredSlots[category] || [])) {
    if (!(req in parsed)) return { conformant: false, reason: `missing required slot ${req}` };
  }
  return { conformant: true, parsed };
}

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

module.exports = { loadGrammar, assertVocabDisjoint, validateName, vocabValues, proposeName, CHANGE_ORDER };
