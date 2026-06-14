import { Assets, Container, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { sfx } from '../audio/sfx';
import { skillById } from '../roster';
import type { SkillId } from '../config';
import { GAME_FONT_STACK, ensureGameFontsLoaded } from '../fonts';
import { MergeBurst } from './MergeBurst';
import { RarityJuice } from './RarityJuice';
import { StarFillAnimGroup } from './StarFillAnim';

// PLAYER DECK view. As the player picks skills they appear here as small hex tiles —
// the same hexagonal frame art as the slots, keyed by tier (1=Blue, 2=Purple, 3=Yellow):
// a `_Bg` (dark body) nested inside a `_Border` (rim), scaled to a small tile, with the
// skill icon centered. Stackable (blue/purple, enemy target) skills MERGE on a duplicate
// pick — same tile, badge upgraded (stack 1=disabled star, 2=lit star, 3=diamond) and a
// tier-tinted burst plays. Non-stackable (yellow + heal) dedupe. Cap on UNIQUE entries.
import hexBlueBg from 'assets/UI/CardFrame_Hexagon_01_Blue_Bg.webp';
import hexBlueBorder from 'assets/UI/CardFrame_Hexagon_01_Blue_Border.webp';
import hexPurpleBg from 'assets/UI/CardFrame_Hexagon_01_Purple_Bg.webp';
import hexPurpleBorder from 'assets/UI/CardFrame_Hexagon_01_Purple_Border.webp';
import hexYellowBg from 'assets/UI/CardFrame_Hexagon_01_Yellow_Bg.webp';
import hexYellowBorder from 'assets/UI/CardFrame_Hexagon_01_Yellow_Border.webp';
// Skill icons (already on disk)
import shurikenData from 'assets/Skills/skill_Shuriken.webp';
import boltData from 'assets/Skills/skill_Bolt.webp';
import flameStrikeData from 'assets/Skills/skill_Flame_Strike.webp';
import lightningShotData from 'assets/Skills/skill_Lightning_Shot.webp';
import meteorData from 'assets/Skills/skill_Meteor.webp';
import thunderstormData from 'assets/Skills/skill_Thunderstorm.webp';
import deadlyFireballData from 'assets/Skills/skill_Deadly_Fireball.webp';
import healData from 'assets/UI/HP_Heal_Stat.webp';
// Upgrade-row stars. Row of 3 CUTOUTS (Star_Disable_2 — silver matching the gold Star_2)
// sits on the bottom of every tile and fills LEFT-TO-RIGHT with Star_2 sprites as the tile
// stacks: stack=1 → 0 stars, stack=2 → 1 star, stack=3 → 2 stars, stack=4 → 3 stars (MAX).
// The row is visible at every stack level so the player reads "this can still be upgraded."
// The two assets share an identical silhouette → cutout→filled reads as a clean recolor
// (plus the spin+burst transition juice from StarFillAnim.ts).
import starCutout from 'assets/UI/ItemIcon_Star_Disable_2.webp';
import star2 from 'assets/UI/ItemIcon_Star_2.webp';

// --- Layout constants ---
// Tile size bumped from 64→72 (user explicitly OK'd a bigger deck card if it stops the leak).
// The +8px of vertical headroom lets the upgrade row sit comfortably ABOVE the hex frame's
// curved/tapered bottom (the hex border PNG is full-width only down to ~y=231/272 ≈ 85% of
// the texture; below that the silhouette tapers diagonally to a point, so anything placed
// at the bottom of the bbox spills out beyond the visible hex edge). See trayGeom() probe.
const TILE_SIZE = 72;     // hex tile visual box height (border scaled to this)
const TILE_W = 58;        // per-tile column width (kept proportional to TILE_SIZE)
const TILE_GAP = 12;
const ICON_FIT = 38;      // skill icon target box (slightly tighter so it doesn't crowd the row)
const ICON_Y = -TILE_SIZE * 0.10; // lift the icon a touch up from center to make room for the row
const POP_DURATION = 260; // ms pulse-in
const POP_FROM = 0.4;
const MERGE_POP_DURATION = 280; // merge re-pop is a touch longer with overshoot
const DECK_CAP = 6;       // never show more than the deck size
const SLIDE_DURATION = 360; // ms — smooth re-layout of existing tiles when a new one is added
// ── Upgrade-row geometry (3 cutouts + up-to-3 filled stars on the deck tile).
//    Tuned so the row's BBox bottom sits at local y ≤ TILE_SIZE * 0.28 (i.e. native y ≤ 218
//    on a Blue 272-tall hex), where the hex silhouette is still effectively full-width and
//    well above the diagonal taper that begins around native y=244. Stars are smaller than
//    the slot card (12 vs 18) — the deck tile is a glance read, not the primary slot read. ──
const UPGRADE_STAR_FIT = 12;             // per-star icon size (cutout AND filled use same fit)
const UPGRADE_STAR_GAP = 1;              // gap between stars (px) — tight 3-wide row
const UPGRADE_ROW_Y = TILE_SIZE * 0.22;  // y of the upgrade row CENTER inside the hex
// ── Star-fill animation tuning (deck tile). Smaller than the slot card so we
//    use fewer sparkles at a smaller outer radius — keeps the read clean on
//    the tile without making the particles vanish at deck-tile scale. ──
const TILE_STAR_SPARKLE_COUNT = 6;
const TILE_STAR_SPARKLE_OUTER = 3;

// Native Border heights per tier (Blue 272, Purple 280, Yellow 288). Scale BOTH the Bg
// (180×232) and the Border by TILE_SIZE / BORDER_NATIVE_H[tier] so the Bg nests in it.
const BORDER_NATIVE_H: Record<1 | 2 | 3, number> = { 1: 272, 2: 280, 3: 288 };

// tier → cohesion tint (matches MergeBurst.TIER_TINT). Used for the border flash pulse.
const TIER_TINT: Record<1 | 2 | 3, number> = { 1: 0x6db4ff, 2: 0xc28bff, 3: 0xffc24a };
// Merge scale-punch peaks per celebration level (0 = normal, 1 = three-of-a-kind, 2 = cap).
// The cap punch (level 2) is the biggest so stack=4 visibly tops stack=3.
const MERGE_POP_PEAK_BY_LEVEL = [1.18, 1.34, 1.5];
const BORDER_FLASH_DUR = 360;     // rim flash pulse duration (ms)

const ICON_URLS: Record<string, string> = {
  shuriken: shurikenData,
  bolt: boltData,
  flameStrike: flameStrikeData,
  lightningShot: lightningShotData,
  meteor: meteorData,
  thunderstorm: thunderstormData,
  fireball: deadlyFireballData, // no plain fireball icon; fire-family stand-in
  heal: healData,
};

const HEX_URLS: Record<1 | 2 | 3, { bg: string; border: string }> = {
  1: { bg: hexBlueBg, border: hexBlueBorder },
  2: { bg: hexPurpleBg, border: hexPurpleBorder },
  3: { bg: hexYellowBg, border: hexYellowBorder },
};

// PIXI v8: build sprites from LOADED textures, never `Texture.from(importedUrl)`.
const ICON_TEX: Record<string, Texture> = {};
const HEX_TEX: Record<1 | 2 | 3, { bg: Texture; border: Texture }> = {} as Record<1 | 2 | 3, { bg: Texture; border: Texture }>;
const STAR_TEX: { cutout?: Texture; filled?: Texture } = {};

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}
// back-out: overshoots past 1 then settles — gives the merge re-pop a satisfying punch.
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

interface Tile {
  container: Container;
  icon: Sprite;
  // Additive tier-tinted COPY of the hex border, sitting on top of the real border.
  // Punched to full alpha on a merge then eased back to 0 — a quick rim flash pulse.
  borderFlash: Sprite;
  borderFlashT: number; // elapsed ms in the flash pulse (Infinity = inactive)
  borderFlashDur: number;
  tier: 1 | 2 | 3;
  stack: number;     // 1..MAX_STACK (4) — drives the upgrade row (filled stars = stack-1)
  // pop tween (covers initial pop + merge re-pop). When the tween is the merge pop the
  // peak overshoots beyond 1.0 then settles, so this drives both motions through one
  // ticker-less per-frame pump.
  popT: number;      // elapsed ms in the pop tween (Infinity = inactive)
  popDur: number;
  popFrom: number;
  popPeak: number;   // intermediate peak (used by merge); =1 means no overshoot
  popTo: number;     // final resting scale (always 1)
  // slide tween (used when a NEW unique tile joins; existing tiles glide to their new x).
  slideT: number;    // elapsed ms (Infinity = inactive)
  slideDur: number;
  slideFromX: number;
  slideToX: number;
  // Upgrade row — 3 cutouts + 3 filled-star overlays. `filled[k].visible` reflects whether
  // the k-th star is active (k < stack - 1). When a star is freshly lit (during merge), the
  // spin+burst transition fires via `starFx`, transforming the cutout into the filled gold
  // star with a particle sparkle burst (see StarFillAnim.ts). Cutouts always start visible.
  cutouts: Sprite[];
  filled: Sprite[];
  starCenters: { x: number; y: number }[]; // per-star row positions (for particle host coords)
  starBaseScale: number;
  starFx: StarFillAnimGroup;
  // ── Rarity juice — per-tile idle FX matched to the skill's tier. Tier-1 = null (inert);
  // tier-2 = soft purple glow breathe; tier-3 = glow + sparkles + shine sweep. Driven from
  // SkillQueue.render(deltaMS) — no Ticker.shared handler to leak.
  juice: RarityJuice | null;
}

export class SkillQueue extends Container {
  /** Load this widget's textures. MUST be awaited before `addToDeck()` is called. */
  static async preload(): Promise<void> {
    void ensureGameFontsLoaded(); // warm the display font for the floating merge badge
    await Promise.all([
      ...Object.entries(ICON_URLS).map(async ([id, url]) => { ICON_TEX[id] = await Assets.load<Texture>(url); }),
      ...([1, 2, 3] as const).map(async (tier) => {
        const [bg, border] = await Promise.all([
          Assets.load<Texture>(HEX_URLS[tier].bg),
          Assets.load<Texture>(HEX_URLS[tier].border),
        ]);
        HEX_TEX[tier] = { bg, border };
      }),
      Assets.load<Texture>(starCutout).then((t) => { STAR_TEX.cutout = t; }),
      Assets.load<Texture>(star2).then((t) => { STAR_TEX.filled = t; }),
    ]);
  }

  private readonly tiles: Tile[] = [];
  private readonly deckIds: string[] = [];
  // Active merge bursts — pooled per-tile but multiple may be in-flight if a player merges
  // two different stackables in quick succession. Each burst is parented to `this` (not the
  // tile) so it can outlive a tile destroy if needed and so it renders ABOVE the tiles.
  private readonly bursts: MergeBurst[] = [];
  // Floating celebration badges ("TRIPLE!" / "MAX!") rising + fading above a merged tile.
  // Each carries its own tween clock; advanced from render(deltaMS) so there's no leak.
  private readonly floatLabels: { text: Text; t: number; dur: number; x: number; y0: number }[] = [];

  constructor() {
    super();
    // __DEV__-only debug surface for the m13 leak harness — exposes per-tile + per-star
    // bbox geometry in screen pixels so the screenshot driver can pixel-measure whether
    // the star row sits inside the hex frame. Tree-shaken from production by DefinePlugin.
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      (window as unknown as { __clashRoyalDebug?: { trayGeom(): unknown } }).__clashRoyalDebug = {
        trayGeom: () => this.trayGeom(),
      };
    }
  }

  /** __DEV__ geometry probe: returns screen-pixel bboxes of the tray, each tile, and each
   *  star (cutout + filled). Used by the m13 leak screenshot harness to assert that the
   *  lowest visible star pixel sits INSIDE the tile's visual frame. */
  private trayGeom(): {
    tray: { x: number; y: number; w: number; h: number; bottom: number };
    tiles: Array<{
      i: number; stack: number;
      tile: { x: number; y: number; w: number; h: number; bottom: number };
      cutouts: Array<{ x: number; y: number; w: number; h: number; bottom: number }>;
      filled: Array<{ x: number; y: number; w: number; h: number; bottom: number; visible: boolean }>;
    }>;
  } {
    const trayB = this.getBounds();
    const tiles = this.tiles.map((tile, i) => {
      const tb = tile.container.getBounds();
      const cuts = tile.cutouts.map((s) => {
        const b = s.getBounds();
        return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.y + b.height };
      });
      const fills = tile.filled.map((s) => {
        const b = s.getBounds();
        return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.y + b.height, visible: s.visible };
      });
      return {
        i,
        stack: tile.stack,
        tile: { x: tb.x, y: tb.y, w: tb.width, h: tb.height, bottom: tb.y + tb.height },
        cutouts: cuts,
        filled: fills,
      };
    });
    return {
      tray: { x: trayB.x, y: trayB.y, w: trayB.width, h: trayB.height, bottom: trayB.y + trayB.height },
      tiles,
    };
  }

  /** Pop a new hex deck tile (frame + icon + stack-1 badge) into the deck view and re-center
   *  the row with a SMOOTH SLIDE on the other tiles. Deduped (an id already in the deck is
   *  ignored — for those use `merge()`). Capped at DECK_CAP.
   *  When `deferPop` is true the tile is created + laid out (so its slot in the row + its
   *  tileCenter are correct) but starts INVISIBLE (alpha 0) and is NOT popped — the caller
   *  reveals it later via `popDeferred(skillId)` so a fly-in clone can land into it. */
  addToDeck(skillId: string, deferPop = false): void {
    if (this.deckIds.includes(skillId)) return; // already shown — caller should `merge()` for dupes
    if (this.deckIds.length >= DECK_CAP) return; // deck is full visually
    const iconTex = ICON_TEX[skillId];
    if (!iconTex) return; // defensive: unknown skill (or not preloaded) -> no-op

    const tile = this.buildTile(skillId);
    this.addChild(tile.container);
    this.tiles.push(tile);
    this.deckIds.push(skillId);

    // SMOOTH SLIDE: schedule a tween on each EXISTING tile from its current x to its new x.
    // The new tile is placed at its FINAL x (no slide needed) — it just pops in (or alpha 0
    // if deferred). The slide runs in lock-step with the fly so the read is "the deck makes
    // room for the new arrival."
    const positions = this.computeTilePositions(this.tiles.length);
    for (let i = 0; i < this.tiles.length - 1; i++) {
      const t = this.tiles[i];
      t.slideFromX = t.container.x;
      t.slideToX = positions[i];
      t.slideT = 0;
      t.slideDur = SLIDE_DURATION;
    }
    // Place the new tile at its final position immediately.
    tile.container.x = positions[positions.length - 1];
    tile.container.y = 0;

    if (deferPop) {
      tile.container.alpha = 0; // hidden until popDeferred reveals it
      // Don't arm the popT tween yet — popDeferred will arm it on landing.
      tile.popT = Infinity;
    } else {
      this.armPop(tile, POP_FROM, 1, POP_DURATION);
    }
  }

  /** Reveal + pop a tile that was added with `deferPop`. Called when the fly-in clone lands
   *  so it reads as "the flying card became the deck tile." No-op if already visible/unknown. */
  popDeferred(skillId: string): void {
    const i = this.deckIds.indexOf(skillId);
    if (i < 0) return;
    const tile = this.tiles[i];
    if (!tile || tile.container.alpha >= 1) return;
    tile.container.alpha = 1;
    this.armPop(tile, POP_FROM, 1, POP_DURATION);
  }

  /** MERGE animation on an existing tile: increments its stack, lights the next cutout in
   *  the upgrade row with a brief pop, plays an overshoot scale-up on the tile, and fires
   *  a tier-tinted burst centered on the tile. No layout/slide changes (deck size unchanged). */
  merge(skillId: string): void {
    const i = this.deckIds.indexOf(skillId);
    if (i < 0) return;
    const tile = this.tiles[i];
    if (!tile) return;
    if (tile.stack >= 4) return; // ceiling guard — MAX_STACK=4 (3 stars filled max)
    tile.stack += 1;
    // Light the cutout that corresponds to the new star: filled[stack-2] (zero-indexed).
    // e.g. stack 1→2 lights filled[0]; stack 3→4 lights filled[2]. Fires the spin+burst
    // transition: the cutout VISIBLY spins + scales out while the gold filled star spins
    // in with overshoot, accompanied by a particle sparkle burst around the star center.
    const k = tile.stack - 2;
    if (k >= 0 && k < tile.filled.length) {
      sfx.starFill();
      tile.starFx.start({
        cutout: tile.cutouts[k],
        filled: tile.filled[k],
        baseScale: tile.starBaseScale,
        centerX: tile.starCenters[k].x,
        centerY: tile.starCenters[k].y,
        host: tile.container,
        sparkleCount: TILE_STAR_SPARKLE_COUNT,
        sparkleOuter: TILE_STAR_SPARKLE_OUTER,
      });
    }
    // Celebration LEVEL drives every juice layer: 0 = normal 1→2, 1 = the 2→3
    // three-of-a-kind STEPPING-STONE, 2 = the 3→4 CAP (the biggest, decisive "maxed"
    // moment). Each layer ramps with level so stack=4 always tops stack=3.
    const level = tile.stack === 4 ? 2 : (tile.stack === 3 ? 1 : 0);

    // Overshoot pop on the whole tile — bigger punch on the celebration tiers.
    this.armPop(tile, 1, MERGE_POP_PEAK_BY_LEVEL[level], MERGE_POP_DURATION);

    // Rising chime on the three-of-a-kind (kept) — also fires on the cap so the
    // decisive merge still rings.
    if (level >= 1) sfx.tripleStack();

    if (level >= 1) {
      // Tier-tinted rim flash pulse on the tile border.
      tile.borderFlash.alpha = 1;
      tile.borderFlashT = 0;
      // Floating "TRIPLE!" / "MAX!" badge rising + fading above the tile.
      this.spawnFloatLabel(level === 2 ? 'MAX!' : 'TRIPLE!', tile.tier, tile.container.x, level);
    }

    // Spawn a tier-tinted burst at the tile center (the tile is at tile.container.x; the
    // burst is a child of `this` so its coords are tray-local).
    const burst = new MergeBurst();
    this.addChild(burst);
    burst.play(tile.container.x, tile.container.y, tile.tier, level);
    this.bursts.push(burst);
  }

  /** Spawn a chunky floating celebration badge above the tray, tinted by tier, that pops
   *  in then rises + fades. `level` 2 (cap) is bigger than level 1 (three-of-a-kind). */
  private spawnFloatLabel(label: string, tier: 1 | 2 | 3, x: number, level: number): void {
    const fontSize = level === 2 ? 34 : 26;
    const text = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: GAME_FONT_STACK,
        fontSize,
        fontWeight: '900',
        fill: 0xfff3c0,
        stroke: { color: 0x2a1400, width: Math.max(4, fontSize * 0.16), join: 'round' },
        letterSpacing: 1,
        align: 'center',
      }),
    });
    text.anchor.set(0.5);
    text.tint = TIER_TINT[tier];
    // Badge floats above the tile (tiles sit at y≈0; rise UP into negative y).
    const y0 = -TILE_SIZE * 0.55;
    text.position.set(x, y0);
    text.scale.set(0);
    this.addChild(text);
    this.floatLabels.push({ text, t: 0, dur: level === 2 ? 1100 : 900, x, y0 });
  }

  /** Deck-local center of the tile for `skillId` (for a fly-landing animation destination). */
  tileCenter(skillId: string): { x: number; y: number } {
    const i = this.deckIds.indexOf(skillId);
    if (i < 0) return { x: 0, y: 0 };
    // Use the live container.x (so a mid-slide tile still gives a reasonable target). For a
    // NEW tile that's not yet added, the caller should compute the would-be center themselves.
    return { x: this.tiles[i].container.x, y: this.tiles[i].container.y };
  }

  /** Per-frame pump — advances slide tweens, pop tweens, badge-swap pops, and any in-flight
   *  merge bursts. MUST be called from the scene's update() with deltaMS. */
  render(deltaMS: number): void {
    // 1) advance slide + pop + badge-pop tweens on every tile.
    for (let i = 0; i < this.tiles.length; i++) {
      const tile = this.tiles[i];

      // Slide
      if (tile.slideT !== Infinity) {
        tile.slideT += deltaMS;
        const u = Math.min(1, tile.slideT / tile.slideDur);
        const e = easeOutCubic(u);
        tile.container.x = tile.slideFromX + (tile.slideToX - tile.slideFromX) * e;
        if (u >= 1) tile.slideT = Infinity;
      }

      // Pop (initial OR merge overshoot)
      if (tile.popT !== Infinity) {
        tile.popT += deltaMS;
        const u = Math.min(1, tile.popT / tile.popDur);
        // If popPeak > popTo (merge overshoot), use easeOutBack for the full range
        // and dampen the apex; otherwise standard ease-out cubic from popFrom to popTo.
        let scale: number;
        if (tile.popPeak > tile.popTo) {
          // merge pop — rise to peak, settle to 1.0 with overshoot ease
          const k = easeOutBack(u);
          // k briefly exceeds 1 (overshoot). Map [from, to] but bias toward the peak when k>1.
          scale = tile.popFrom + (tile.popTo - tile.popFrom) * k;
          // bonus overshoot — add an extra (popPeak - popTo) * (1 - |k-1|*4) clamp
          const overshoot = Math.max(0, 1 - Math.abs(k - 1) * 3) * (tile.popPeak - tile.popTo);
          scale += overshoot;
        } else {
          const k = easeOutBack(u);
          scale = tile.popFrom + (tile.popTo - tile.popFrom) * k;
        }
        tile.container.scale.set(scale);
        if (u >= 1) {
          tile.container.scale.set(tile.popTo);
          tile.popT = Infinity;
        }
      }

      // Border rim-flash pulse — punch to full alpha on merge, ease back to 0.
      if (tile.borderFlashT !== Infinity) {
        tile.borderFlashT += deltaMS;
        const u = Math.min(1, tile.borderFlashT / tile.borderFlashDur);
        tile.borderFlash.alpha = 1 - easeOutCubic(u);
        if (u >= 1) { tile.borderFlash.alpha = 0; tile.borderFlashT = Infinity; }
      }

      // Spin+burst star-fill transitions — drives the cutout→filled transform
      // animation (spin + scale + alpha) and the particle sparkle burst spawned
      // around the freshly-earned star.
      tile.starFx.update(deltaMS);

      // Idle rarity juice (tier-2 glow breathe; tier-3 sparkles + shine).
      if (tile.juice) tile.juice.update(deltaMS);
    }

    // 2) advance any in-flight merge bursts; reap dead ones.
    for (let n = this.bursts.length - 1; n >= 0; n--) {
      const b = this.bursts[n];
      if (b.isPlaying) {
        b.update(deltaMS);
      } else {
        b.destroy({ children: true });
        this.bursts.splice(n, 1);
      }
    }

    // 3) advance floating celebration badges: pop-in (overshoot) → rise + fade → reap.
    for (let n = this.floatLabels.length - 1; n >= 0; n--) {
      const f = this.floatLabels[n];
      f.t += deltaMS;
      const u = Math.min(1, f.t / f.dur);
      // pop-in over first 22%: 0 → 1.15 → 1; hold after.
      let scale: number;
      if (u < 0.22) {
        const p = u / 0.22;
        scale = p < 0.6 ? (p / 0.6) * 1.15 : 1.15 - ((p - 0.6) / 0.4) * 0.15;
      } else scale = 1;
      f.text.scale.set(scale);
      f.text.y = f.y0 - easeOutCubic(u) * (TILE_SIZE * 0.7);
      f.text.alpha = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      if (u >= 1) {
        this.removeChild(f.text);
        f.text.destroy();
        this.floatLabels.splice(n, 1);
      }
    }
  }

  /** Read-only deck snapshot for tests + bridges. */
  ids(): string[] { return this.deckIds.slice(); }
  /** Current stack of a tile (0 if not in deck) — used by E2E + tests. */
  stackOf(skillId: string): number {
    const i = this.deckIds.indexOf(skillId);
    return i < 0 ? 0 : this.tiles[i].stack;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    for (const b of this.bursts) b.destroy({ children: true });
    this.bursts.length = 0;
    for (const f of this.floatLabels) { if (f.text.parent) f.text.parent.removeChild(f.text); f.text.destroy(); }
    this.floatLabels.length = 0;
    // Cancel any in-flight star transitions on every tile + drop their particle
    // children so the base Container.destroy({children:true}) cascade is clean.
    for (const t of this.tiles) t.starFx.cancelAll();
    super.destroy(options);
  }

  // ── internals ───────────────────────────────────────────────────────────

  /** Build a fresh tile (hex frame + icon + upgrade row of 3 cutouts) at scale 1, x/y unset. */
  private buildTile(skillId: string): Tile {
    const iconTex = ICON_TEX[skillId];
    const tier = (skillById(skillId as SkillId)?.tier ?? 1) as 1 | 2 | 3;
    const s = TILE_SIZE / BORDER_NATIVE_H[tier];
    const container = new Container();

    // hex frame
    const bg = new Sprite(HEX_TEX[tier].bg);
    bg.anchor.set(0.5);
    bg.scale.set(s);
    const border = new Sprite(HEX_TEX[tier].border);
    border.anchor.set(0.5);
    border.scale.set(s);
    container.addChild(bg, border);

    // Tier-tinted additive flash copy of the border — rim pulse on merge (alpha 0 at rest).
    const borderFlash = new Sprite(HEX_TEX[tier].border);
    borderFlash.anchor.set(0.5);
    borderFlash.scale.set(s);
    borderFlash.blendMode = 'add';
    borderFlash.tint = TIER_TINT[tier];
    borderFlash.alpha = 0;
    container.addChild(borderFlash);

    // skill icon — lifted by ICON_Y so the upgrade row at +UPGRADE_ROW_Y has clear space.
    const icon = new Sprite(iconTex);
    icon.anchor.set(0.5);
    const w = iconTex.width || ICON_FIT;
    const h = iconTex.height || ICON_FIT;
    icon.scale.set(Math.min(ICON_FIT / w, ICON_FIT / h));
    icon.position.set(0, ICON_Y);
    container.addChild(icon);

    // Upgrade row — 3 cutouts (always visible) + 3 filled stars (hidden at stack=1).
    const { cutouts, filled, centers, baseScale } = this.buildUpgradeRow(container);

    // Rarity juice — tier-1 = null (inert), tier-2 = subtle glow breathe, tier-3 = full
    // glow + sparkles + shine. Sparkle count is reduced on tier-3 here because the deck
    // tile is much smaller than the slot card (2 sparkles read clean, 3 would be noisy).
    let juice: RarityJuice | null = null;
    if (tier >= 2) {
      juice = new RarityJuice(tier, {
        centerY: 0,
        halfHeight: TILE_SIZE / 2,
        halfWidth: TILE_W / 2,
        borderTex: border.texture,
        borderScale: border.scale.x,
        sparkleCount: 2,
      });
      container.addChild(juice);
    }

    return {
      container, icon,
      borderFlash, borderFlashT: Infinity, borderFlashDur: BORDER_FLASH_DUR,
      tier, stack: 1,
      popT: Infinity, popDur: 0, popFrom: 1, popPeak: 1, popTo: 1,
      slideT: Infinity, slideDur: 0, slideFromX: 0, slideToX: 0,
      cutouts, filled,
      starCenters: centers,
      starBaseScale: baseScale,
      starFx: new StarFillAnimGroup(),
      juice,
    };
  }

  /** Build the row of 3 star cutouts + 3 filled-star overlays on the bottom of a tile.
   *  Cutouts are always visible. Filled stars start hidden; merge() lights them one-by-one. */
  private buildUpgradeRow(container: Container): {
    cutouts: Sprite[];
    filled: Sprite[];
    centers: { x: number; y: number }[];
    baseScale: number;
  } {
    const cutoutTex = STAR_TEX.cutout!;
    const filledTex = STAR_TEX.filled!;
    const baseScale = UPGRADE_STAR_FIT / Math.max(cutoutTex.width, cutoutTex.height);
    // 3 stars laid out horizontally, centered on x=0, sitting at UPGRADE_ROW_Y.
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
      container.addChild(cut);
      cutouts.push(cut);

      const fill = new Sprite(filledTex);
      fill.anchor.set(0.5);
      fill.scale.set(baseScale);
      fill.position.set(cx, UPGRADE_ROW_Y);
      fill.visible = false;
      container.addChild(fill);
      filled.push(fill);

      centers.push({ x: cx, y: UPGRADE_ROW_Y });
    }
    return { cutouts, filled, centers, baseScale };
  }

  /** Compute the centered row positions for `n` tiles (deck-local x; y is 0). */
  private computeTilePositions(n: number): number[] {
    const rowW = n * TILE_W + (n - 1) * TILE_GAP;
    const startX = -rowW / 2 + TILE_W / 2;
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(startX + i * (TILE_W + TILE_GAP));
    return out;
  }

  /** Arm a pop tween on a tile. `from`→`to` over `dur`. Peak >= to gives an overshoot apex. */
  private armPop(tile: Tile, from: number, peak: number, dur: number): void {
    tile.container.scale.set(from);
    tile.popT = 0;
    tile.popDur = dur;
    tile.popFrom = from;
    tile.popPeak = peak;
    tile.popTo = 1;
  }
}

