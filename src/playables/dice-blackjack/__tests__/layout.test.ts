import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLayout,
  REF_W,
  REF_H,
  BAR_W,
  BAR_H,
  OPPONENT_BAR_Y,
} from '../layout';

// Real-world device dimensions (logical pixels, portrait).
const DEVICES = {
  iphoneSE:           { width: 375,  height: 667  }, // 9:16 — closest to REF
  iphone14:           { width: 390,  height: 844  }, // 9:19.5 — tall narrow
  iphone14ProMax:     { width: 430,  height: 932  }, // 9:19.5 — wider tall
  pixel7:             { width: 412,  height: 915  }, // 9:20 — even taller
  galaxyFold:         { width: 280,  height: 653  }, // 9:21+ — extreme narrow
  ipadPortrait:       { width: 768,  height: 1024 }, // 4:5.33 — wider
  ipadMiniLandscape:  { width: 1024, height: 768  }, // landscape — wider than tall
  desktopWide:        { width: 1920, height: 1080 }, // landscape — extreme
};

test('computeLayout: opponent bar stays pinned at OPPONENT_BAR_Y across devices', () => {
  for (const [name, vp] of Object.entries(DEVICES)) {
    const L = computeLayout(vp.width, vp.height);
    assert.equal(L.opponentBar.y, OPPONENT_BAR_Y, `${name}: opponent bar Y drifted`);
    assert.equal(L.opponentBar.x, (REF_W - BAR_W) / 2, `${name}: opponent bar X drifted`);
  }
});

test('computeLayout: bottom-anchored UI hugs the bottom of the viewport', () => {
  for (const [name, vp] of Object.entries(DEVICES)) {
    const L = computeLayout(vp.width, vp.height);
    // Bottom of player bar should be near the bottom of the effective canvas.
    const playerBarBottom = L.playerBar.y + BAR_H;
    const distanceFromBottom = L.effectiveRefH - playerBarBottom;
    assert.ok(distanceFromBottom > 0, `${name}: player bar bottom (${playerBarBottom}) exceeds effective canvas (${L.effectiveRefH})`);
    assert.ok(distanceFromBottom < 320, `${name}: player bar too far from bottom (${distanceFromBottom}px)`);
    // Buttons should sit BELOW the player bar
    assert.ok(L.rollButton.y > L.playerBar.y, `${name}: roll button above player bar`);
    assert.ok(L.standButton.y > L.playerBar.y, `${name}: stand button above player bar`);
  }
});

test('computeLayout: stage stays clear of both bars on every device', () => {
  for (const [name, vp] of Object.entries(DEVICES)) {
    const L = computeLayout(vp.width, vp.height);
    // Stage anchor (center) must sit between the two bars.
    assert.ok(L.stage.y > OPPONENT_BAR_Y + BAR_H, `${name}: stage overlaps opponent bar`);
    assert.ok(L.stage.y < L.playerBar.y, `${name}: stage overlaps player bar`);
  }
});

test('computeLayout: every UI element stays within the safe REF X range', () => {
  // Math.min scaling guarantees REF_W of horizontal space is always visible.
  // Elements must be at REF X ∈ [0, REF_W].
  for (const [name, vp] of Object.entries(DEVICES)) {
    const L = computeLayout(vp.width, vp.height);
    const pts: Array<[string, { x: number; y: number }]> = [
      ['opponentBar', L.opponentBar],
      ['playerBar',   L.playerBar],
      ['rollButton',  L.rollButton],
      ['standButton', L.standButton],
      ['ftueHand',    L.ftueHand],
      ['stage',       L.stage],
      ['diceAnchor',  L.diceAnchor],
    ];
    for (const [label, p] of pts) {
      assert.ok(p.x >= 0 && p.x <= REF_W, `${name}: ${label} X (${p.x}) out of REF range`);
      assert.ok(p.y >= 0 && p.y <= L.effectiveRefH, `${name}: ${label} Y (${p.y}) out of effective range`);
    }
  }
});

test('computeLayout: FTUE hand sits ABOVE the roll button', () => {
  for (const [name, vp] of Object.entries(DEVICES)) {
    const L = computeLayout(vp.width, vp.height);
    assert.ok(L.ftueHand.y < L.rollButton.y, `${name}: ftue hand not above roll button`);
    assert.equal(L.ftueHand.x, L.rollButton.x, `${name}: ftue hand x mismatch with roll button`);
  }
});

test('computeLayout: ROLL is to the RIGHT of STAND', () => {
  for (const [name, vp] of Object.entries(DEVICES)) {
    const L = computeLayout(vp.width, vp.height);
    assert.ok(L.rollButton.x > L.standButton.x, `${name}: ROLL not right of STAND`);
    // Same Y
    assert.equal(L.rollButton.y, L.standButton.y, `${name}: button Y mismatch`);
  }
});

test('computeLayout: uiOffset.x centers UI horizontally; uiOffset.y is 0', () => {
  for (const [name, vp] of Object.entries(DEVICES)) {
    const L = computeLayout(vp.width, vp.height);
    const refScreenW = REF_W * L.uiScale;
    const expectedOffsetX = (vp.width - refScreenW) / 2;
    assert.ok(Math.abs(L.uiOffset.x - expectedOffsetX) < 0.5, `${name}: uiOffset.x not centered`);
    assert.equal(L.uiOffset.y, 0, `${name}: uiOffset.y should be 0 (top-pinned)`);
  }
});

test('computeLayout: background aspect-FILLS the viewport on every device', () => {
  const TEX_W = 1024;
  const TEX_H = 1536;
  for (const [name, vp] of Object.entries(DEVICES)) {
    const L = computeLayout(vp.width, vp.height);
    const bg = L.background(TEX_W, TEX_H);
    const renderedW = TEX_W * bg.scale;
    const renderedH = TEX_H * bg.scale;
    // Background must COVER both axes — every viewport pixel has bg pixels.
    assert.ok(renderedW >= vp.width - 0.5, `${name}: bg width ${renderedW} < viewport ${vp.width}`);
    assert.ok(renderedH >= vp.height - 0.5, `${name}: bg height ${renderedH} < viewport ${vp.height}`);
    assert.equal(bg.center.x, vp.width / 2);
    assert.equal(bg.center.y, vp.height / 2);
  }
});

test('computeLayout: effective REF height grows with viewport height (tall phones use the extra space)', () => {
  const seLayout = computeLayout(DEVICES.iphoneSE.width, DEVICES.iphoneSE.height);
  const tallLayout = computeLayout(DEVICES.pixel7.width, DEVICES.pixel7.height);
  // SE is closer to REF (9:16), so effectiveRefH should be ≈ REF_H
  assert.ok(Math.abs(seLayout.effectiveRefH - REF_H) < 100, 'SE effectiveRefH too far from REF_H');
  // Tall phone should expand effectiveRefH significantly
  assert.ok(tallLayout.effectiveRefH > REF_H + 100, `Tall phone effectiveRefH (${tallLayout.effectiveRefH}) didn't expand`);
});

test('computeLayout: very narrow viewport (320px wide) still produces valid layout', () => {
  // iPhone 5 / small portrait
  const L = computeLayout(320, 568);
  assert.ok(L.uiScale > 0, 'uiScale must be positive');
  assert.ok(L.rollButton.x > 0 && L.rollButton.x < REF_W, 'roll button still in REF range');
  assert.ok(L.playerBar.y < L.effectiveRefH, 'player bar in bounds');
});

test('computeLayout: extreme landscape (desktop 1920x1080) still produces valid layout', () => {
  const L = computeLayout(1920, 1080);
  assert.ok(L.uiScale > 0);
  assert.ok(L.effectiveRefH >= REF_H, 'effectiveRefH never below REF_H');
  // On landscape the REF doesn't fill the screen width, so uiOffset.x > 0
  assert.ok(L.uiOffset.x > 0, 'wide screen should have horizontal padding');
});
