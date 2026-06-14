const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadGrammar, assertVocabDisjoint, validateName } = require('./grammar');

const grammar = loadGrammar(path.join(__dirname, '..', '..', 'Components', '_index', 'grammar.json'));

test('grammar vocabularies are mutually disjoint', () => {
  assert.doesNotThrow(() => assertVocabDisjoint(grammar));
});

test('assertVocabDisjoint throws when a value appears in two slots', () => {
  const bad = { ...grammar, vocab: { ...grammar.vocab, Color: [...grammar.vocab.Color, '__TEST_DUPE__'], State: [...grammar.vocab.State, '__TEST_DUPE__'] } };
  assert.throws(() => assertVocabDisjoint(bad), /disjoint|collision|__TEST_DUPE__/i);
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

test('unrecognised mid-name token is rejected', () => {
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

const { proposeName } = require('./grammar');

test('proposeName fixes typo + expands abbreviations', () => {
  const r = proposeName('Button_01_Mian_l_Bg_Blue', 'Button', grammar);
  assert.equal(r.newName, 'Button_Main_01_Large_Background_Blue');
  assert.deepEqual(r.changeTypes, ['typo-fix', 'abbrev-expand']);
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
