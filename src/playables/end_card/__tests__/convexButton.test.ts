import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container, NineSliceSprite, Text, Texture } from 'pixi.js';
import {
  GAME_FONT_STACK,
  CONVEX_TINTS,
  convexLabelStyle,
  makeConvexSlice,
  createConvexButton,
  ensureGameFontLoaded,
} from '../convexButton';

// The convex button is the single shared "Layer Lab Convex Rectangle" CTA used by
// BOTH the dice-blackjack PostGame buttons and the end-card Play-Now button. These
// tests pin the shared contract WITHOUT importing the PNG asset (tsx can't resolve
// assets/*), so the texture + 9-slice border are passed in by the caller (the
// scene), exactly as production wires it.

const BORDER = { left: 20, top: 20, right: 20, bottom: 28 };

test('GAME_FONT_STACK leads with the Luckiest Guy display font', () => {
  assert.match(GAME_FONT_STACK, /^"Luckiest Guy"/);
});

test('CONVEX_TINTS exposes a green CTA face over a darker pocket', () => {
  assert.equal(typeof CONVEX_TINTS.cta.face, 'number');
  assert.equal(typeof CONVEX_TINTS.cta.pocket, 'number');
  assert.notEqual(CONVEX_TINTS.cta.face, CONVEX_TINTS.cta.pocket);
});

test('convexLabelStyle uses the game font stack at the requested size with an outline', () => {
  const style = convexLabelStyle(40);
  assert.equal(style.fontFamily, GAME_FONT_STACK);
  assert.equal(style.fontSize, 40);
  assert.ok(style.stroke, 'label should have a dark outline stroke');
});

test('makeConvexSlice builds a NineSliceSprite from the passed texture + border at the given size', () => {
  const s = makeConvexSlice(Texture.WHITE, BORDER, 260, 140);
  assert.ok(s instanceof NineSliceSprite);
  assert.equal(s.texture, Texture.WHITE);
  assert.equal(s.leftWidth, BORDER.left);
  assert.equal(s.topHeight, BORDER.top);
  assert.equal(s.rightWidth, BORDER.right);
  assert.equal(s.bottomHeight, BORDER.bottom);
  assert.equal(s.width, 260);
  assert.equal(s.height, 140);
});

test('createConvexButton assembles pocket + tinted face + Luckiest-Guy label from one texture', () => {
  const parts = createConvexButton({
    texture: Texture.WHITE,
    border: BORDER,
    width: 300,
    height: 120,
    label: 'Play Now!',
    fontSize: 44,
    tint: CONVEX_TINTS.cta,
  });

  // Structure: root holds the dark pocket recess + the face container on top.
  assert.ok(parts.root instanceof Container);
  assert.ok(parts.face instanceof Container);
  assert.ok(parts.label instanceof Text);
  assert.ok(parts.root.children.length >= 2, 'root should have a pocket + a face');

  // The face's sliced sprite is tinted with the CTA face color, from the SAME texture.
  const faceSprite = parts.face.children.find(c => c instanceof NineSliceSprite);
  assert.ok(faceSprite, 'face should contain a NineSliceSprite');
  assert.equal(faceSprite.texture, Texture.WHITE);
  assert.equal(faceSprite.tint, CONVEX_TINTS.cta.face);

  // The pocket sits under the face, tinted the recess color, from the SAME texture.
  const pocketSprite = parts.root.children.find(c => c instanceof NineSliceSprite);
  assert.ok(pocketSprite, 'root should contain a pocket NineSliceSprite');
  assert.equal(pocketSprite.tint, CONVEX_TINTS.cta.pocket);

  // The label is the centered Luckiest-Guy caption.
  assert.equal(parts.label.text, 'Play Now!');
  assert.equal(parts.label.style.fontFamily, GAME_FONT_STACK);
});

test('ensureGameFontLoaded resolves (and degrades gracefully without a DOM)', async () => {
  // In node there is no document.fonts — the helper must resolve rather than throw,
  // so callers can always `await` it. Calling twice returns the same cached promise.
  const p = ensureGameFontLoaded();
  assert.ok(typeof p.then === 'function', 'should return a promise');
  await p;
  assert.equal(ensureGameFontLoaded(), p, 'should cache the readiness promise');
});
