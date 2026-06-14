import { Assets, Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import { sfx } from '../audio/sfx';
import { skillById } from '../roster';
import { GAME_FONT_STACK } from '../fonts';
import type { SkillId } from '../config';
import type { SlotEntry } from '../combat/SlotModel';
import { UnlockBurst } from './UnlockBurst';
import { RarityJuice } from './RarityJuice';
import { StarFillAnimGroup } from './StarFillAnim';
// 3 large skill SLOT cards. Each card = a real hexagonal CARD frame keyed by tier:
// tier1→Blue, tier2→Purple, tier3→Yellow. The frame is two concentric sprites — a
// `_Bg` (dark body) nested inside a `_Border` (rim) — drawn at full color on a LIT
// layer that fills BOTTOM-UP as the slot charges, over a DIM base layer that is always
// visible. A skill icon sits centered; a COST BADGE (gold coin + bold number) hangs
// below. When a slot finishes charging it fires a celebratory hex-shape-true particle
// burst (see UnlockBurst) — radial gold/tier sparks + an expanding hex-border ring pulse
// + a soft round glow. (Replaced the old additive white rounded-RECT flash.)
import hexBlueBg from 'assets/UI/CardFrame_Hexagon_01_Blue_Bg.webp';
import hexBlueBorder from 'assets/UI/CardFrame_Hexagon_01_Blue_Border.webp';
import hexPurpleBg from 'assets/UI/CardFrame_Hexagon_01_Purple_Bg.webp';
import hexPurpleBorder from 'assets/UI/CardFrame_Hexagon_01_Purple_Border.webp';
import hexYellowBg from 'assets/UI/CardFrame_Hexagon_01_Yellow_Bg.webp';
import hexYellowBorder from 'assets/UI/CardFrame_Hexagon_01_Yellow_Border.webp';
// Cost coin icon — the gold resource-bar coin (matches the coin-bar disk for a
// consistent gold currency look; the flat Coin.webp reads blue/teal).
import coinData from 'assets/UI/ResourceBar_01_Coin.webp';
// Upgrade-row stars — 3 cutouts + up-to-3 filled overlays on the bottom of every slot
// card. Tells the player how upgraded the OFFERED skill currently is (stack-1 = filled
// stars), so a maxed offer reads as "this one's at apex" before tapping. Mirrors the
// row that lives on every deck tile in SkillQueue. Uses the matching-pair Star_Disable_2
// (silver) → Star_2 (gold) — same silhouette so the cutout→filled transition reads as a
// pure recolor + sparkle, not a shape morph.
import starCutoutData from 'assets/UI/ItemIcon_Star_Disable_2.webp';
import starFilledData from 'assets/UI/ItemIcon_Star_2.webp';
// Skill icons (already on disk)
import shurikenData from 'assets/Skills/skill_Shuriken.webp';
import boltData from 'assets/Skills/skill_Bolt.webp';
import flameStrikeData from 'assets/Skills/skill_Flame_Strike.webp';
import lightningShotData from 'assets/Skills/skill_Lightning_Shot.webp';
import meteorData from 'assets/Skills/skill_Meteor.webp';
import thunderstormData from 'assets/Skills/skill_Thunderstorm.webp';
import deadlyFireballData from 'assets/Skills/skill_Deadly_Fireball.webp';
import healData from 'assets/UI/HP_Heal_Stat.webp';

// --- Layout constants (internal pixel layout; the row's screen transform is CombatScene's job) ---
// The hex Border is the tallest sprite, so the slot's visual box height = SLOT_BOX_H and
// each tier's frame is scaled by SLOT_BOX_H / BORDER_NATIVE_H[tier] (Bg + Border by the
// SAME factor so the Bg stays concentrically nested in the Border).
export const SLOT_BOX_H = 150; // slot visual box height (drives the fill height too)
// Border at SLOT_BOX_H is ~204*(150/272)≈112.5 wide for Blue; use the widest-ish for
// row spacing. Native border width is 204 for all tiers; pick a slot column width that
// comfortably holds the scaled frame + a little air.
const SLOT_W = 116;  // per-slot column width (for row layout + slotCenter spacing)
const SLOT_GAP = 26; // gap between slot columns
const ICON_FIT = 70; // skill icon target box inside the hex
const COIN_SIZE = 30; // cost-badge coin diameter
const BADGE_GAP = 10; // vertical gap from box bottom to the cost badge center
// ── Upgrade-row geometry (3 cutouts on the bottom of the slot card). Sized to fit
//    comfortably across the hex bottom — narrower than SLOT_W so it doesn't crowd the
//    hex rim. The row sits in the lower interior of the hex above the cost badge. ──
const UPGRADE_STAR_FIT = 18;            // per-star icon size
const UPGRADE_STAR_GAP = 4;             // gap between stars (px)
const UPGRADE_ROW_Y = SLOT_BOX_H * 0.30; // y of the upgrade row inside the hex
// ── Star-fill animation tuning (slot card). Replaces the old easeOutBack snap-in
//    with a richer spin + burst transition (see StarFillAnim.ts). The slot card is
//    the larger surface — afford 8 sparkles at ~5px outer radius. ──
const SLOT_STAR_SPARKLE_COUNT = 8;
const SLOT_STAR_SPARKLE_OUTER = 5;

// Native Border heights per tier (measured): Blue 272, Purple 280, Yellow 288.
// All Bg sprites are 180×232. Scale BOTH sprites by SLOT_BOX_H / BORDER_NATIVE_H[tier].
const BORDER_NATIVE_H: Record<1 | 2 | 3, number> = { 1: 272, 2: 280, 3: 288 };

// tier -> hex frame URLs (Bg + Border). 1=Blue, 2=Purple, 3=Yellow.
const HEX_URLS: Record<1 | 2 | 3, { bg: string; border: string }> = {
  1: { bg: hexBlueBg, border: hexBlueBorder },
  2: { bg: hexPurpleBg, border: hexPurpleBorder },
  3: { bg: hexYellowBg, border: hexYellowBorder },
};

// skillId -> icon webp URL (used only to preload)
const ICON_URLS: Record<string, string> = {
  shuriken: shurikenData,
  bolt: boltData,
  flameStrike: flameStrikeData,
  lightningShot: lightningShotData,
  meteor: meteorData,
  thunderstorm: thunderstormData,
  fireball: deadlyFireballData, // no plain fireball icon; fire-family stand-in
  heal: healData,               // HP_Heal_Stat from assets/UI
};

// PIXI v8: build sprites from LOADED textures, never `Texture.from(importedUrl)`.
const ICON_TEX: Record<string, Texture> = {};
const HEX_TEX: Record<1 | 2 | 3, { bg: Texture; border: Texture }> = {} as Record<1 | 2 | 3, { bg: Texture; border: Texture }>;
const TEX: { coin?: Texture; starCutout?: Texture; starFilled?: Texture } = {};

const DIM_TINT = 0x6a6a6a;
const DIM_ALPHA = 0.85;
// The icon (and thus the card's visual center) sits slightly above the box center.
const CARD_CENTER_Y = -SLOT_BOX_H * 0.02;

// ── button-press feel ──
const PRESS_SCALE = 0.90;     // depressed scale of the slot root
const PRESS_NUDGE_Y = 3;      // tiny downward y-nudge while held (px)
const PRESS_DOWN_MS = 80;     // snap-down duration (ease-out)
const PRESS_UP_MS = 200;      // spring-back duration (back/overshoot ease)

function easeOutQuad(t: number): number {
  const u = 1 - t;
  return 1 - u * u;
}
// back-out: overshoots past 1 then settles — gives the release a satisfying pop.
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

/** One renderable hex frame (Bg nested in Border) sized for `tier`, centered at origin. */
function buildHexFrame(tier: 1 | 2 | 3): { container: Container; bg: Sprite; border: Sprite } {
  const container = new Container();
  const s = SLOT_BOX_H / BORDER_NATIVE_H[tier];
  const bg = new Sprite(HEX_TEX[tier].bg);
  bg.anchor.set(0.5);
  bg.scale.set(s);
  const border = new Sprite(HEX_TEX[tier].border);
  border.anchor.set(0.5);
  border.scale.set(s);
  // Bg under Border so the rim draws on top of the body.
  container.addChild(bg, border);
  return { container, bg, border };
}

interface Slot {
  root: Container;          // whole slot (animated children live under here)
  dimFrame: { container: Container; bg: Sprite; border: Sprite };
  dimIcon: Sprite;
  litLayer: Container;      // lit frame + lit icon, masked bottom-up
  litFrame: { container: Container; bg: Sprite; border: Sprite };
  litIcon: Sprite;
  mask: Graphics;
  burst: UnlockBurst;       // celebratory particle/ring unlock pop (hex-shape-true)
  costLabel: Text;
  badge: Container;
  centerX: number;
  centerY: number;
  currentId: string | null;
  currentTier: 1 | 2 | 3;
  wasUnlocked: boolean;
  // ── button-press feedback (owns root.scale). press: quick scale-DOWN on
  // pointerdown; release: spring back to 1 with a slight overshoot on tap/up.
  // Advanced from render(deltaMS) — NO extra Ticker.shared handler to leak.
  pressPhase: 'idle' | 'down' | 'up';
  pressT: number;          // elapsed ms within the current phase
  pressFrom: number;       // root.scale at the moment the phase started
  // ── Upgrade row: 3 cutouts (always visible) + 3 filled-star overlays sized + parented
  // to the slot root, sitting on the bottom edge of the hex. `lastShownStack` lets
  // render() detect a fresh light-up (stack just advanced) and fire the spin+burst
  // transition on the freshly-earned star. The animations themselves live in `starFx`
  // (one group shared across all 3 slots' upgrade rows on this card).
  cutouts: Sprite[];
  filled: Sprite[];
  starCenters: { x: number; y: number }[]; // per-star row positions (for particle host coords)
  starBaseScale: number;
  lastShownStack: number;  // last `slotStacks[i]` we rendered (0 if untracked)
  starFx: StarFillAnimGroup;
  // ── Rarity juice — per-slot idle FX matched to the OFFERED skill's tier. Re-mounted
  // (destroyed + rebuilt) whenever the slot's tier changes via retier(). Driven from
  // render(deltaMS) — no Ticker.shared handler to leak.
  juice: RarityJuice | null;
}

export class SkillSlots extends Container {
  /** Load this widget's textures. MUST be awaited before the constructor runs. */
  static async preload(): Promise<void> {
    await Promise.all([
      ...Object.entries(ICON_URLS).map(async ([id, url]) => { ICON_TEX[id] = await Assets.load<Texture>(url); }),
      ...([1, 2, 3] as const).map(async (tier) => {
        const [bg, border] = await Promise.all([
          Assets.load<Texture>(HEX_URLS[tier].bg),
          Assets.load<Texture>(HEX_URLS[tier].border),
        ]);
        HEX_TEX[tier] = { bg, border };
      }),
      Assets.load<Texture>(coinData).then((t) => { TEX.coin = t; }),
      Assets.load<Texture>(starCutoutData).then((t) => { TEX.starCutout = t; }),
      Assets.load<Texture>(starFilledData).then((t) => { TEX.starFilled = t; }),
    ]);
  }

  private readonly slots: Slot[] = [];

  constructor(private readonly onTap: (i: number) => void) {
    super();
    if (!HEX_TEX[1] || !HEX_TEX[2] || !HEX_TEX[3] || !TEX.coin) {
      throw new Error('SkillSlots.preload() must be awaited before constructing SkillSlots');
    }

    const rowW = 3 * SLOT_W + 2 * SLOT_GAP;
    const startX = -rowW / 2 + SLOT_W / 2; // row centered on the container origin

    for (let i = 0; i < 3; i++) {
      const cx = startX + i * (SLOT_W + SLOT_GAP);
      const cy = 0;

      const root = new Container();
      root.x = cx;
      root.y = cy;

      // ── DIM BASE LAYER: hex frame + icon, dimmed. Always visible. ──
      const dimLayer = new Container();
      const dimFrame = buildHexFrame(1);
      const dimIcon = new Sprite(Texture.EMPTY);
      dimIcon.anchor.set(0.5);
      dimIcon.y = -SLOT_BOX_H * 0.02; // sit slightly above center inside the hex
      // dim the whole layer
      dimFrame.bg.tint = DIM_TINT;
      dimFrame.border.tint = DIM_TINT;
      dimIcon.tint = DIM_TINT;
      dimLayer.alpha = DIM_ALPHA;
      dimLayer.addChild(dimFrame.container, dimIcon);
      root.addChild(dimLayer);

      // ── LIT LAYER: identical frame + icon at full color, masked bottom-up. ──
      const litLayer = new Container();
      const litFrame = buildHexFrame(1);
      const litIcon = new Sprite(Texture.EMPTY);
      litIcon.anchor.set(0.5);
      litIcon.y = -SLOT_BOX_H * 0.02;
      litLayer.addChild(litFrame.container, litIcon);

      // mask: a slot-local rect revealing the lit layer bottom-up. Geometry set in render().
      const mask = new Graphics();
      litLayer.addChild(mask);
      litLayer.mask = mask;
      root.addChild(litLayer);

      // ── celebratory unlock burst (hex-shape-true: tier sparks + expanding hex-border
      // ring + soft round glow). Sits ABOVE the lit card; play() re-centers it on the
      // card's visual center each fire (see CARD_CENTER_Y).
      const burst = new UnlockBurst();
      root.addChild(burst);

      // ── COST BADGE below the box — gold coin + bold number, centered. ──
      const badge = new Container();
      badge.y = SLOT_BOX_H / 2 + BADGE_GAP + COIN_SIZE / 2;
      const coin = new Sprite(TEX.coin);
      coin.anchor.set(0.5);
      coin.width = COIN_SIZE;
      coin.height = COIN_SIZE;
      badge.addChild(coin);

      const costLabel = new Text({
        text: '0',
        style: {
          fontFamily: GAME_FONT_STACK,
          fontSize: 26,
          fill: 0xffffff,
          stroke: { color: 0x3a2a05, width: 5, join: 'round' },
        },
      });
      costLabel.anchor.set(0, 0.5);
      badge.addChild(costLabel);
      root.addChild(badge);

      // ── upgrade row (3 cutouts + 3 filled stars on the bottom of the slot card). The
      // filled stars are hidden at stack=1 and progressively lit (with a pop) as the deck
      // stack of the offered skill advances. Always rendered (even at stack=1) so the
      // player reads "this can be upgraded." ──
      const { cutouts, filled, centers, baseScale } = this.buildUpgradeRow(root);

      // interaction — controller gates affordability + castInFlight, so any tap is fine to forward.
      root.eventMode = 'static';
      root.cursor = 'pointer';
      const idx = i;
      // press feedback fires on ANY tap (affordable or not — purely tactile). The
      // pick logic is unchanged: onTap(idx) still fires exactly on pointertap.
      root.on('pointerdown', () => this.startPress(idx));
      root.on('pointertap', () => { this.releasePress(idx); sfx.cardPick(); this.onTap(idx); });
      root.on('pointerup', () => this.releasePress(idx));
      root.on('pointerupoutside', () => this.releasePress(idx));

      this.addChild(root);
      this.slots.push({
        root, dimFrame, dimIcon, litLayer, litFrame, litIcon, mask, burst,
        costLabel, badge, centerX: cx, centerY: cy,
        currentId: null, currentTier: 1, wasUnlocked: false,
        pressPhase: 'idle', pressT: 0, pressFrom: 1,
        cutouts, filled,
        starCenters: centers,
        starBaseScale: baseScale,
        lastShownStack: 0,
        juice: null,
        starFx: new StarFillAnimGroup(),
      });
      this.recenterBadge(this.slots[i]);
    }
  }

  /** Mount (or remount) the per-slot rarity juice layer for the given tier. Destroys any
   *  existing juice first. Tier-1 is inert — no juice layer is created (and update is a
   *  no-op everywhere). The juice is split across two z-layers:
   *    - GLOW: inserted at index 0 (behind the dim base) → bloom appears as a halo
   *      around the card rim (the hex body occludes the center, which is what we want).
   *    - SPARKLES + SHINE: inserted ABOVE the lit layer + burst → sparkles drift visibly
   *      around the card; shine streak passes over the icon, masked by the hex border.
   *  We achieve this with TWO RarityJuice instances mounted at different z's: a "glow-
   *  only" one (tier ≥ 2) at z=0, and a "sparkles+shine" one (tier 3 only) at the top. */
  private mountJuice(slot: Slot, tier: 1 | 2 | 3): void {
    if (slot.juice) {
      // Remove from parent + destroy old children.
      slot.root.removeChild(slot.juice);
      slot.juice.destroy({ children: true });
      slot.juice = null;
    }
    if (tier === 1) return; // tier-1 is inert — skip the layer entirely
    const litBorder = slot.litFrame.border;
    const juice = new RarityJuice(tier, {
      centerY: CARD_CENTER_Y,
      halfHeight: SLOT_BOX_H / 2,
      halfWidth: SLOT_W / 2,
      borderTex: litBorder.texture,
      borderScale: litBorder.scale.x,
      // Slot card is the larger surface — afford the full 3 sparkles on tier-3.
      sparkleCount: 3,
    });
    // Insert ABOVE the lit layer + burst so the sparkles + shine are visibly on top of
    // the card. The glow inside this RarityJuice is at THIS container's z=0, which is
    // still in front of the card body — but its low alpha + add blend reads as a halo,
    // not an occluder. (Splitting glow-behind / sparkles-front into two RarityJuice
    // instances is possible but pricey for marginal visual benefit.)
    slot.root.addChild(juice);
    slot.juice = juice;
  }

  /** Build the row of 3 star cutouts + 3 filled-star overlays on the bottom of a slot card.
   *  Cutouts are always visible. Filled stars start hidden; render() lights them per slotStacks. */
  private buildUpgradeRow(root: Container): {
    cutouts: Sprite[];
    filled: Sprite[];
    centers: { x: number; y: number }[];
    baseScale: number;
  } {
    const cutoutTex = TEX.starCutout!;
    const filledTex = TEX.starFilled!;
    const baseScale = UPGRADE_STAR_FIT / Math.max(cutoutTex.width, cutoutTex.height);
    const stepX = UPGRADE_STAR_FIT + UPGRADE_STAR_GAP;
    const startX = -(stepX * 2) / 2; // 3 stars → centers at -stepX, 0, +stepX
    const cutouts: Sprite[] = [];
    const filled: Sprite[] = [];
    const centers: { x: number; y: number }[] = [];
    for (let k = 0; k < 3; k++) {
      const cx = startX + k * stepX;
      const cut = new Sprite(cutoutTex);
      cut.anchor.set(0.5);
      cut.scale.set(baseScale);
      cut.position.set(cx, UPGRADE_ROW_Y);
      root.addChild(cut);
      cutouts.push(cut);

      const fill = new Sprite(filledTex);
      fill.anchor.set(0.5);
      fill.scale.set(baseScale);
      fill.position.set(cx, UPGRADE_ROW_Y);
      fill.visible = false;
      root.addChild(fill);
      filled.push(fill);

      centers.push({ x: cx, y: UPGRADE_ROW_Y });
    }
    return { cutouts, filled, centers, baseScale };
  }

  /**
   * @param slots       per-slot entry (or null to hide)
   * @param charges     per-slot fill ratio 0..1 (coins/cost), drives bottom-up reveal + unlock pop
   * @param deltaMS     frame time, drives the unlock burst animation (defaults to ~one frame)
   * @param slotStacks  per-slot current deck-stack of the OFFERED skill (0 if not in the
   *                    player's deck). Drives the bottom upgrade row: filled stars = stack-1.
   *                    Optional for back-compat (defaults to all zeros = 0 stars filled).
   */
  render(slots: (SlotEntry | null)[], charges: number[], deltaMS = 16.7, slotStacks: number[] = []): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const entry = slots[i] ?? null;

      // Always advance any in-flight burst (even on a hidden/cleared slot, so it
      // settles cleanly rather than freezing mid-animation).
      if (slot.burst.isPlaying) slot.burst.update(deltaMS);

      // Advance idle rarity-juice (tier-2 glow breathe; tier-3 sparkles + shine).
      // Driven here so we never spawn a leaky Ticker.shared handler.
      if (slot.juice) slot.juice.update(deltaMS);

      // Advance the button-press tween (owns root.scale + a tiny y-nudge). Driven
      // here — NOT a Ticker.shared handler — so nothing to leak; render() never
      // sets root.scale itself, so this won't be overwritten per frame.
      this.advancePress(slot, deltaMS);

      // Advance any in-flight star-fill animations (spin + burst transitions).
      slot.starFx.update(deltaMS);

      if (!entry) {
        slot.root.visible = false;
        slot.currentId = null;
        slot.wasUnlocked = false;
        // Reset the upgrade-row state when the slot hides (so a future fill starts clean).
        // Cancel any in-flight transitions so the row settles cleanly to a hidden state.
        slot.starFx.cancelAll();
        for (let k = 0; k < slot.filled.length; k++) {
          slot.filled[k].visible = false;
          slot.cutouts[k].visible = true;
          slot.cutouts[k].alpha = 1;
          slot.cutouts[k].rotation = 0;
          slot.cutouts[k].scale.set(slot.starBaseScale);
        }
        slot.lastShownStack = 0;
        continue;
      }
      slot.root.visible = true;

      const id = entry.skill.id;
      const tier = (skillById(id as SkillId)?.tier ?? 1) as 1 | 2 | 3;

      if (slot.currentId !== id) {
        // re-tier the frames if the tier changed (rebuild the hex sprite scales/textures).
        if (slot.currentTier !== tier) {
          this.retier(slot, tier);
          slot.currentTier = tier;
        }
        const iconTex = ICON_TEX[id];
        if (iconTex) {
          slot.dimIcon.texture = iconTex;
          slot.litIcon.texture = iconTex;
          this.fitIcon(slot.dimIcon);
          this.fitIcon(slot.litIcon);
          slot.dimIcon.tint = DIM_TINT;
          slot.litIcon.tint = 0xffffff;
        }
        slot.currentId = id;
        // a freshly drawn slot starts un-charged; reset the unlock latch.
        slot.wasUnlocked = false;
        // Id change: reset the upgrade row so the new id's stack is freshly rendered below.
        // Cancel any in-flight spin/burst transitions tied to the old id so the row
        // settles cleanly to a baseline before re-evaluating against the new stack.
        slot.starFx.cancelAll();
        for (let k = 0; k < slot.filled.length; k++) {
          slot.filled[k].visible = false;
          slot.cutouts[k].visible = true;
          slot.cutouts[k].alpha = 1;
          slot.cutouts[k].rotation = 0;
          slot.cutouts[k].scale.set(slot.starBaseScale);
        }
        slot.lastShownStack = 0;
      }

      slot.costLabel.text = String(entry.skill.cost);
      this.recenterBadge(slot);

      // bottom-up fill: reveal a rect from (top of fill) down to the box bottom.
      const charge = Math.max(0, Math.min(1, charges[i] ?? 0));
      const fillH = charge * SLOT_BOX_H;
      const topY = SLOT_BOX_H / 2 - fillH;
      slot.mask.clear();
      if (fillH > 0) {
        slot.mask.rect(-SLOT_W / 2 - 6, topY, SLOT_W + 12, fillH).fill({ color: 0xffffff });
      }

      // unlock pop: fire the celebratory burst once when charge crosses <1 -> >=1.
      // The ring is a shape-true expanding COPY of THIS slot's live tier border, so it
      // matches the hex silhouette exactly (no rectangle, no flat white flash).
      if (charge >= 1 && !slot.wasUnlocked) {
        slot.wasUnlocked = true;
        sfx.slotUnlock();
        // center the burst on the card's visual center (matches the icon's slight rise).
        slot.burst.play(0, CARD_CENTER_Y, tier, slot.litFrame.border.texture, slot.litFrame.border.scale.x);
      } else if (charge < 1) {
        slot.wasUnlocked = false;
      }

      // Upgrade row: filled stars = max(0, deckStack - 1), clamped to 3. If stack went up
      // since the last render, fire the spin+burst transition on the freshly-earned star(s).
      const deckStack = slotStacks[i] ?? 0;
      const filledNow = Math.max(0, Math.min(3, deckStack - 1));
      const prevFilled = Math.max(0, Math.min(3, slot.lastShownStack - 1));
      // Update visibility for ALL 3 stars (the id may have changed → reset the row state).
      for (let k = 0; k < slot.filled.length; k++) {
        const shouldBeLit = k < filledNow;
        if (shouldBeLit && !slot.filled[k].visible) {
          // If this star is FRESHLY lit (advanced past prevFilled), play the spin+burst
          // transition. The animation will hide the cutout, reveal the filled, and spawn
          // the particle burst — all driven from starFx.update(deltaMS) above.
          if (k >= prevFilled) {
            slot.starFx.start({
              cutout: slot.cutouts[k],
              filled: slot.filled[k],
              baseScale: slot.starBaseScale,
              centerX: slot.starCenters[k].x,
              centerY: slot.starCenters[k].y,
              host: slot.root,
              sparkleCount: SLOT_STAR_SPARKLE_COUNT,
              sparkleOuter: SLOT_STAR_SPARKLE_OUTER,
            });
          } else {
            // Was already lit per the deck but the sprite was reset (id change) — snap to settled.
            slot.filled[k].visible = true;
            slot.filled[k].alpha = 1;
            slot.filled[k].rotation = 0;
            slot.filled[k].scale.set(slot.starBaseScale);
            slot.cutouts[k].visible = false;
          }
        } else if (!shouldBeLit && slot.filled[k].visible) {
          // Demotion (e.g. id changed to a less-stacked skill) — hide filled, restore cutout.
          slot.filled[k].visible = false;
          slot.cutouts[k].visible = true;
          slot.cutouts[k].alpha = 1;
          slot.cutouts[k].rotation = 0;
          slot.cutouts[k].scale.set(slot.starBaseScale);
        }
      }
      slot.lastShownStack = deckStack;
    }
  }

  /** A standalone, full-color hex card (Bg+Border+icon) for the onboarding spotlight clone.
   *  Centered at (0,0), same per-tier scale + icon fit as the live slots. */
  buildSpotlightCard(skillId: string): Container {
    const tier = (skillById(skillId as SkillId)?.tier ?? 1) as 1 | 2 | 3;
    const tex = HEX_TEX[tier] ?? HEX_TEX[1];
    const c = new Container();
    const s = SLOT_BOX_H / BORDER_NATIVE_H[tier];
    const bg = new Sprite(tex.bg); bg.anchor.set(0.5); bg.scale.set(s);
    const border = new Sprite(tex.border); border.anchor.set(0.5); border.scale.set(s);
    const icon = new Sprite(ICON_TEX[skillId] ?? Texture.EMPTY); icon.anchor.set(0.5);
    icon.y = -SLOT_BOX_H * 0.02; // match the live slots' icon offset inside the hex
    const iw = icon.texture.width || ICON_FIT, ih = icon.texture.height || ICON_FIT;
    icon.scale.set(Math.min(ICON_FIT / iw, ICON_FIT / ih));
    // Layer order matches the live slot: bg → icon → border (rim draws on top).
    c.addChild(bg, icon, border);
    return c;
  }

  /** Slot center in SkillSlots-local coordinates (for the coach hand + E2E tap coords). */
  slotCenter(i: number): { x: number; y: number } {
    const slot = this.slots[i];
    if (!slot) return { x: 0, y: 0 };
    return { x: slot.centerX, y: slot.centerY };
  }

  /** Swap both frame layers to a new tier's hex art (re-scale Bg+Border by that tier).
   *  Also re-mounts the rarity-juice layer for the new tier (so its glow/shine match). */
  private retier(slot: Slot, tier: 1 | 2 | 3): void {
    const s = SLOT_BOX_H / BORDER_NATIVE_H[tier];
    slot.dimFrame.bg.texture = HEX_TEX[tier].bg;
    slot.dimFrame.border.texture = HEX_TEX[tier].border;
    slot.dimFrame.bg.scale.set(s);
    slot.dimFrame.border.scale.set(s);
    slot.litFrame.bg.texture = HEX_TEX[tier].bg;
    slot.litFrame.border.texture = HEX_TEX[tier].border;
    slot.litFrame.bg.scale.set(s);
    slot.litFrame.border.scale.set(s);
    // tints survive a texture swap on the SAME sprite, but re-assert for safety.
    slot.dimFrame.bg.tint = DIM_TINT;
    slot.dimFrame.border.tint = DIM_TINT;
    slot.litFrame.bg.tint = 0xffffff;
    slot.litFrame.border.tint = 0xffffff;
    // Rebuild the rarity-juice layer for the new tier (tier-1 = no layer).
    this.mountJuice(slot, tier);
  }

  private fitIcon(icon: Sprite): void {
    const tex = icon.texture;
    const w = tex.width || ICON_FIT;
    const h = tex.height || ICON_FIT;
    const scale = Math.min(ICON_FIT / w, ICON_FIT / h);
    icon.scale.set(scale);
  }

  /** Tear down. The press tween is advanced from render(deltaMS) — there is NO
   *  Ticker.shared handler to remove. We just drop each slot root's listeners and
   *  let the base Container.destroy({children:true}) free the sprites/bursts. The
   *  rarity-juice instances are children of slot.root → freed by the cascade too. */
  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i].root.removeAllListeners();
      // Cancel any in-flight star transitions + drop their particle children so the
      // base Container.destroy({children:true}) cascade has nothing to chase.
      this.slots[i].starFx.cancelAll();
    }
    super.destroy(options);
  }

  /** pointerdown: begin the snap-DOWN press from wherever root.scale currently is. */
  private startPress(i: number): void {
    const slot = this.slots[i];
    if (!slot) return;
    slot.pressPhase = 'down';
    slot.pressT = 0;
    slot.pressFrom = slot.root.scale.x;
  }

  /** pointertap/up/upoutside: begin the spring-BACK (overshoot) from current scale.
   *  Idempotent within a release (tap + up can both fire) — only (re)starts from a
   *  non-'up' phase so we don't restart the overshoot mid-spring. */
  private releasePress(i: number): void {
    const slot = this.slots[i];
    if (!slot || slot.pressPhase === 'up') return;
    slot.pressPhase = 'up';
    slot.pressT = 0;
    slot.pressFrom = slot.root.scale.x;
  }

  /** Advance one press tween. down → ease to PRESS_SCALE; up → spring to 1 with a
   *  back-out overshoot. Settles to exactly scale=1 / y-nudge=0 when 'up' completes. */
  private advancePress(slot: Slot, deltaMS: number): void {
    if (slot.pressPhase === 'idle') return;
    slot.pressT += deltaMS;

    if (slot.pressPhase === 'down') {
      const t = Math.min(1, slot.pressT / PRESS_DOWN_MS);
      const k = easeOutQuad(t);
      const s = slot.pressFrom + (PRESS_SCALE - slot.pressFrom) * k;
      slot.root.scale.set(s);
      slot.root.y = slot.centerY + PRESS_NUDGE_Y * k;
      // hold at PRESS_SCALE until release (don't auto-flip to 'up' — wait for the event).
      return;
    }

    // 'up' — spring back to 1.0 with overshoot. easeOutBack on the [from -> 1] span
    // briefly carries scale past 1.0 (the "pop") before settling.
    const t = Math.min(1, slot.pressT / PRESS_UP_MS);
    const k = easeOutBack(t);
    const s = slot.pressFrom + (1 - slot.pressFrom) * k;
    slot.root.scale.set(s);
    // unwind the y-nudge linearly back to rest over the same span.
    slot.root.y = slot.centerY + PRESS_NUDGE_Y * (1 - easeOutQuad(t));
    if (t >= 1) {
      slot.root.scale.set(1);
      slot.root.y = slot.centerY;
      slot.pressPhase = 'idle';
      slot.pressT = 0;
    }
  }

  /** Re-center the cost coin + number under the box after the label width changes. */
  private recenterBadge(slot: Slot): void {
    const coin = slot.badge.getChildAt(0) as Sprite;
    const badgeW = COIN_SIZE / 2 + 6 + slot.costLabel.width;
    coin.x = -badgeW / 2 + COIN_SIZE / 2;
    slot.costLabel.x = coin.x + COIN_SIZE / 2 + 6;
  }
}
