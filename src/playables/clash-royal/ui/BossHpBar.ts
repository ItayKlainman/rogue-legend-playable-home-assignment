// BossHpBar — a premium TOP-CENTER boss health readout, a default part of every clash-royal build.
//
// Composition (all from real Components art, 9-sliced where it has a border):
//   - a recessed dark TRACK  (Slider_Border_Rectangle_01_Bg,    tinted near-black crimson)
//   - a CHIP/ghost fill       (Slider_Border_Rectangle_01_Fill,  pale red — lags after a hit)
//   - the MAIN crimson FILL   (Slider_Border_Rectangle_01_Fill,  crimson→red, built-in gloss),
//     masked to the rounded inner track, with a soft top gloss highlight + segment ticks
//   - a gold themed RIM       (Slider_Border_Rectangle_01_Border, tinted bronze/gold)
//   - a circular BOSS BADGE overlapping the left cap: a dark convex disk
//     (BaseFrame_Convex_Circle_01) + the full-colour boss skull (ItemIcon_Skull_Boss) + a
//     gold ring (BaseFrame_Border_Circle_H106)
//   - a "BOSS" label above-left and the live numeric HP centred on the bar.
//
// Juice: setHp animates the displayed value toward the target (ease), the chip fill lags
// behind in a lighter shade (the AAA delayed-damage look), and a big hit triggers a brief
// white flash + horizontal shake. All animation is driven off wall-clock deltas inside
// setHp (CombatScene calls it every frame).
//
// Lives high on the screen so it never collides with the per-actor HP bars, which sit on
// the characters down at ~48% of screen height inside the battle viewport.
import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { makeNineSlice } from '@shared/nineSlice';
import { formatNumber } from '@shared/utils';
import { GAME_FONT_STACK } from '../fonts';
import trackBgData from 'assets/UI/CoinBar_Bg.webp';
import trackRimData from 'assets/UI/CoinBar_Border.webp';
import fillData from 'assets/UI/CoinBar_Fill.webp';
import badgeDiskData from 'assets/UI/BossBadge_Disk.webp';
import badgeRingData from 'assets/UI/BossBadge_Ring.webp';
import skullData from 'assets/UI/ItemIcon_Skull_Boss.webp';

// Unity 9-slice insets (from components-cli `use`). Track/rim share Rectangle_01's border.
const BAR_BORDER = { left: 15, top: 16, right: 15, bottom: 16 };
const FILL_BORDER = { left: 1, top: 13, right: 8, bottom: 13 };

// Palette.
const TRACK_TINT = 0x230a0e;  // near-black crimson recessed track
const RIM_TINT = 0xc8923c;    // warm bronze/gold themed rim
const DISK_TINT = 0x2a0d12;   // dark badge backing
const RING_TINT = 0xe0a94a;   // gold badge ring
const FILL_TINT = 0xd8222a;   // bright crimson main HP
const CHIP_TINT = 0xff9a8a;   // pale red lagging chip trail

// PIXI v8: build every Sprite/NineSlice from an Assets.load-ed Texture (Texture.from(url)
// renders blank). Populated by preload().
const TEX: {
  trackBg?: Texture; trackRim?: Texture; fill?: Texture;
  badgeDisk?: Texture; badgeRing?: Texture; skull?: Texture;
} = {};

export class BossHpBar {
  readonly container = new Container();

  /** Load this widget's textures. MUST be awaited before constructing BossHpBar. */
  static async preload(): Promise<void> {
    await Promise.all([
      Assets.load<Texture>(trackBgData).then((t) => { TEX.trackBg = t; }),
      Assets.load<Texture>(trackRimData).then((t) => { TEX.trackRim = t; }),
      Assets.load<Texture>(fillData).then((t) => { TEX.fill = t; }),
      Assets.load<Texture>(badgeDiskData).then((t) => { TEX.badgeDisk = t; }),
      Assets.load<Texture>(badgeRingData).then((t) => { TEX.badgeRing = t; }),
      Assets.load<Texture>(skullData).then((t) => { TEX.skull = t; }),
    ]);
  }

  private readonly maxHp: number;

  // Display state: the rendered value eases toward `target`; the chip lags behind both.
  private target: number;
  private display: number;
  private chip: number;
  private lastTickMs = 0;
  private flash = 0;          // 0..1 white-flash intensity, decays
  private shake = 0;          // px shake amplitude, decays
  private prevTarget: number; // to detect the size of an incoming hit

  // Sub-elements (built in constructor, positioned/sized in layout).
  private readonly shakeRoot = new Container();
  private readonly track: ReturnType<typeof makeNineSlice>;
  private readonly rim: ReturnType<typeof makeNineSlice>;
  private readonly chipFill: ReturnType<typeof makeNineSlice>;
  private readonly mainFill: ReturnType<typeof makeNineSlice>;
  private readonly fillMask = new Graphics();   // rounded inner track, clips both fills
  private readonly gloss = new Graphics();       // top highlight on the main fill
  private readonly ticks = new Graphics();       // segment dividers over the track
  private readonly flashG = new Graphics();      // white flash overlay
  private readonly badge = new Container();
  private readonly disk: Sprite;
  private readonly ring: Sprite;
  private readonly skull: Sprite;
  private readonly title: Text;
  private readonly hpLabel: Text;

  // Geometry cached from layout() for the per-tick redraws.
  private innerX = 0; private innerY = 0; private innerW = 0; private innerH = 0;
  private barCenterX = 0; private barTop = 0; private barH = 0;
  private lastHpText = '';

  constructor(bossMaxHp: number) {
    if (!TEX.trackBg || !TEX.trackRim || !TEX.fill || !TEX.badgeDisk || !TEX.badgeRing || !TEX.skull) {
      throw new Error('BossHpBar.preload() must be awaited before constructing BossHpBar');
    }
    this.maxHp = Math.max(1, bossMaxHp);
    this.target = this.maxHp;
    this.display = this.maxHp;
    this.chip = this.maxHp;
    this.prevTarget = this.maxHp;

    this.track = makeNineSlice({ texture: TEX.trackBg, border: BAR_BORDER, width: 10, height: 10 });
    this.track.tint = TRACK_TINT;
    this.chipFill = makeNineSlice({ texture: TEX.fill, border: FILL_BORDER, width: 10, height: 10 });
    this.chipFill.tint = CHIP_TINT;
    this.mainFill = makeNineSlice({ texture: TEX.fill, border: FILL_BORDER, width: 10, height: 10 });
    this.mainFill.tint = FILL_TINT;
    this.rim = makeNineSlice({ texture: TEX.trackRim, border: BAR_BORDER, width: 10, height: 10 });
    this.rim.tint = RIM_TINT;

    // Both fills are clipped to the rounded inner track so their corners stay inside the rim.
    const fillLayer = new Container();
    fillLayer.addChild(this.chipFill, this.mainFill, this.gloss, this.ticks);
    fillLayer.mask = this.fillMask;

    this.disk = new Sprite(TEX.badgeDisk); this.disk.anchor.set(0.5); this.disk.tint = DISK_TINT;
    this.skull = new Sprite(TEX.skull); this.skull.anchor.set(0.5);
    this.ring = new Sprite(TEX.badgeRing); this.ring.anchor.set(0.5); this.ring.tint = RING_TINT;
    this.badge.addChild(this.disk, this.skull, this.ring);

    this.title = new Text({ text: 'BOSS', style: {
      fontFamily: GAME_FONT_STACK, fontSize: 18, fill: 0xffe7c2, letterSpacing: 4,
      stroke: { color: 0x3a0606, width: 4, join: 'round' },
    } });
    this.title.anchor.set(0, 1); // bottom-left, sits just above the bar

    this.hpLabel = new Text({ text: formatNumber(this.maxHp), style: {
      fontFamily: GAME_FONT_STACK, fontSize: 15, fill: 0xffffff,
      stroke: { color: 0x000000, width: 3, join: 'round' },
    } });
    this.hpLabel.anchor.set(0.5);

    // z-order: track → fills(masked) → rim → flash → hp number → title → badge(on top).
    this.shakeRoot.addChild(this.track, fillLayer, this.rim, this.fillMask, this.flashG, this.hpLabel, this.title, this.badge);
    this.container.addChild(this.shakeRoot);
  }

  setHp(current: number): void {
    const clamped = Math.max(0, Math.min(current, this.maxHp));
    // A meaningful drop (>1.5% of max) triggers flash + shake.
    if (clamped < this.prevTarget - this.maxHp * 0.015) {
      this.flash = 1;
      this.shake = Math.min(6, this.shake + 4);
    }
    this.prevTarget = clamped;
    this.target = clamped;

    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const dt = this.lastTickMs ? Math.min(0.05, (now - this.lastTickMs) / 1000) : 0;
    this.lastTickMs = now;

    // Main display snaps fairly quickly toward target; chip lags well behind.
    this.display += (this.target - this.display) * Math.min(1, dt * 9);
    if (Math.abs(this.display - this.target) < this.maxHp * 0.001) this.display = this.target;
    this.chip += (this.display - this.chip) * Math.min(1, dt * 3);
    if (this.chip < this.display) this.chip = this.display;

    this.flash = Math.max(0, this.flash - dt * 3.2);
    this.shake = Math.max(0, this.shake - dt * 18);

    this.redraw();
  }

  /** Anchor + size the widget at the top-center of a `width`×`height` screen. The bar is
   *  width-capped so it reads as the dominant boss readout yet stays elegant on wide screens
   *  and fits narrow ones. Everything sits in the top band, clear of the actor HP bars.
   *  `safeTop` is the device top safe-area inset (notch / Dynamic Island / status bar, CSS px);
   *  the bar's title is pushed below it so nothing sits under the camera island (0 ⇒ no notch). */
  layout(screenW: number, screenH: number, safeTop = 0): void {
    const barW = Math.min(screenW * 0.86, 560);
    const barH = Math.max(22, Math.min(34, Math.round(screenW * 0.05)));
    // The "BOSS" title rides ABOVE the bar; reserve room for it (+ a safe-area margin) so
    // neither the title nor the skull badge (1.7x bar height, vertically centered) clips the
    // top screen edge on tall bars / wide screens. The title's TOP must also clear the device
    // safe-area inset, so push the whole widget down by at least `safeTop + 8px` of title-top.
    const titleH = Math.max(14, Math.round(barH * 0.62));
    const topMargin = Math.max(16 + titleH, screenH * 0.03 + titleH, safeTop + 8 + titleH);
    const left = (screenW - barW) / 2;

    this.barCenterX = screenW / 2;
    this.barTop = topMargin;
    this.barH = barH;

    this.track.position.set(left, topMargin);
    this.track.width = barW; this.track.height = barH;
    this.rim.position.set(left, topMargin);
    this.rim.width = barW; this.rim.height = barH;

    // Inner track (where the fill lives), inset from the rim.
    const padX = Math.max(4, barH * 0.18);
    const padY = Math.max(3, barH * 0.16);
    this.innerX = left + padX;
    this.innerY = topMargin + padY;
    this.innerW = barW - padX * 2;
    this.innerH = barH - padY * 2;

    // Badge: a disk ~1.7x bar height, centered on the bar's left cap, hanging slightly left.
    const badgeD = barH * 1.7;
    this.disk.width = badgeD; this.disk.height = badgeD;
    this.ring.width = badgeD; this.ring.height = badgeD;
    this.skull.width = badgeD * 0.62; this.skull.height = badgeD * 0.62;
    this.badge.position.set(left + barH * 0.18, topMargin + barH / 2);

    // "BOSS" title above the bar, aligned just right of the badge.
    this.title.style.fontSize = Math.max(14, Math.round(barH * 0.62));
    this.title.position.set(left + badgeD * 0.7, topMargin - Math.max(3, barH * 0.16));

    // HP number centered on the bar (biased right of the badge).
    this.hpLabel.style.fontSize = Math.max(12, Math.round(barH * 0.5));
    this.hpLabel.position.set(this.barCenterX + badgeD * 0.18, topMargin + barH / 2);

    this.redraw();
  }

  private redraw(): void {
    const ratio = (v: number) => Math.max(0, Math.min(1, v / this.maxHp));
    const r = Math.max(0, this.innerH * 0.5);

    // Rounded inner-track mask (clips both fills to the recessed channel).
    this.fillMask.clear();
    this.fillMask.roundRect(this.innerX, this.innerY, this.innerW, this.innerH, r).fill(0xffffff);

    // Chip (ghost) fill — wider, lighter, behind the main fill.
    const chipW = Math.max(0, this.innerW * ratio(this.chip));
    this.chipFill.position.set(this.innerX, this.innerY);
    this.chipFill.width = Math.max(0.001, chipW);
    this.chipFill.height = this.innerH;
    this.chipFill.visible = chipW > 0.5;

    // Main crimson fill.
    const fillW = Math.max(0, this.innerW * ratio(this.display));
    this.mainFill.position.set(this.innerX, this.innerY);
    this.mainFill.width = Math.max(0.001, fillW);
    this.mainFill.height = this.innerH;
    this.mainFill.visible = fillW > 0.5;

    // Top gloss highlight on the upper third of the main fill.
    this.gloss.clear();
    if (fillW > 1) {
      this.gloss.roundRect(this.innerX, this.innerY + this.innerH * 0.08, fillW, this.innerH * 0.34, r * 0.6)
        .fill({ color: 0xffffff, alpha: 0.22 });
    }

    // Segment ticks: thin dark dividers across the full inner track (boss-fight feel).
    this.ticks.clear();
    const segs = 10;
    for (let i = 1; i < segs; i++) {
      const x = this.innerX + (this.innerW * i) / segs;
      this.ticks.rect(x - 0.75, this.innerY, 1.5, this.innerH).fill({ color: 0x000000, alpha: 0.28 });
    }

    // White flash overlay over the bar interior.
    this.flashG.clear();
    if (this.flash > 0.01) {
      this.flashG.roundRect(this.innerX, this.innerY, this.innerW, this.innerH, r)
        .fill({ color: 0xffffff, alpha: this.flash * 0.5 });
    }

    // HP number.
    const hpText = formatNumber(Math.round(this.display));
    if (hpText !== this.lastHpText) { this.hpLabel.text = hpText; this.lastHpText = hpText; }

    // Shake: small horizontal jitter on the whole bar root.
    this.shakeRoot.x = this.shake > 0.05 ? (Math.random() - 0.5) * this.shake * 2 : 0;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
