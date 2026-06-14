import { Assets, Container, Graphics, NineSliceSprite, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { sdk } from '@smoud/playable-sdk';
import type { Scene } from '@shared/Scene';
import { alTrack } from '@shared/alAnalytics';
import { easeOutQuad } from '@shared/utils';
import { makeNineSlice } from '@shared/nineSlice';
import { buttons9slice } from '../../end_card/buttons9slice';
import { createConvexButton, CONVEX_TINTS, ensureGameFontLoaded } from '../../end_card/convexButton';
// Registers the @font-face for Luckiest Guy (the chunky display face). Side-effect
// import — the defeat overlay can mount before any blackjack/end-card scene has run,
// so it must register the font itself. webpack dedupes with the other importers.
import '../../dice-blackjack/fonts/fonts.css';
// Same 9-slice card body the SkillPanel uses (rounded panel + rim). Reusing the in-game
// idiom makes the defeat popup feel native instead of bolted-on.
import panelBg from 'assets/UI/PanelBox_Bg.webp';
import panelBorder from 'assets/UI/PanelBox_Border.webp';
// Boss-skull focal icon above the DEFEAT headline — sells the "you just lost to the boss"
// read inside the card (vs naked text). 256-px source asset (Components/Icon_ItemIcons),
// scaled to ~140 px tall in layoutScene so it sits as a focal element, not decoration.
import skullData from 'assets/UI/ItemIcon_Skull_Boss.webp';

// The two convex CTAs are built once at this design size (9-slice keeps the corners
// crisp + stretches the middle), then uniformly scaled to fit the viewport.
const BTN_DESIGN_W = 540;
const BTN_DESIGN_H = 144;
const BTN_FONT_SIZE = 52;
const BTN_PRESS_DEPTH = 9; // face dips this far (design px) into the pocket on press
const LABEL_Y_NUDGE = -8;  // pull the caps label up to optically center it in the convex face

const HEADLINE_DROP_MS = 420;   // "DEFEAT" slams down + scales in
const SUB_FADE_DELAY = 260;     // "SO CLOSE!" eases in after the headline lands
const SUB_FADE_MS = 280;
const BTN_APPEAR_DELAY = 420;   // buttons rise/fade after the text
const BTN_APPEAR_MS = 260;
const CARD_POP_MS = 280;        // card scale-in (0.85→1.0 back-out + fade)
const PULSE_PERIOD_MS = 1150;   // gentle breathe on the primary TRY AGAIN button
const PULSE_AMP = 0.035;        // ±3.5% scale

// 9-slice border insets shared with SkillPanel (from components-cli `use` on Popup_Box).
const PANEL_BORDER = { left: 65, top: 65, right: 63, bottom: 66 };

/** Overshoot ease for the headline slam-in + card pop-in (back-out: settles past 1 then eases back). */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// "DEFEAT" — blood-red caps with a heavy dark outline (clash-royal display stack).
const HEADLINE_STYLE = new TextStyle({
  fill: 0xff3b30,
  fontFamily: '"Luckiest Guy", Impact, "Arial Black", sans-serif',
  fontSize: 104,
  letterSpacing: 2,
  stroke: { color: 0x1a0404, width: 12, join: 'round' },
  dropShadow: { color: 0x000000, alpha: 0.55, blur: 6, distance: 5, angle: Math.PI / 2 },
});

// "SO CLOSE!" — warm amber subline that sells the near-miss reversal.
const SUB_STYLE = new TextStyle({
  fill: 0xffd66b,
  fontFamily: '"Luckiest Guy", Impact, "Arial Black", sans-serif',
  fontSize: 46,
  letterSpacing: 3,
  stroke: { color: 0x2a1402, width: 7, join: 'round' },
});

/**
 * Defeat / "SO CLOSE!" popup for the lose variant. Mounts over the frozen hero-death
 * frame as a CENTERED CARD (not a full-screen wash) so the death pose stays visible
 * behind a moderate scrim: dark-red 9-slice card containing the DEFEAT + SO CLOSE!
 * headline and the single convex TRY AGAIN CTA. The director drives retry/install via
 * the callback — this scene never resolves `done`.
 */
export class DefeatScene implements Scene {
  readonly container = new Container();
  // The director drives this scene entirely via opts.onTryAgain (which routes through the
  // CTA→store→win-on-return flow), NOT via `done`; so `done` intentionally never resolves.
  readonly done = new Promise<void>(() => {});

  private width: number;
  private height: number;
  private readonly opts: { onTryAgain: () => void };
  private ready = false;

  private scrim!: Graphics;
  private card!: Container;
  private cardBg!: NineSliceSprite;
  private cardBorder!: NineSliceSprite;
  // Focal boss-skull icon mounted ABOVE the DEFEAT headline INSIDE the card. Pops in with
  // the card (scale 0.85→1.0 + fade) so it animates as part of the same arrival beat.
  private skull!: Sprite;
  private headline!: Text;
  private sub!: Text;
  private tryAgainBtn!: Container;
  // Press-feedback face (dips into the pocket on pointerdown).
  private tryAgainFace!: Container;

  private elapsed = 0;
  private tryAgainBaseY = 0;
  private tryAgainScale = 1;
  // Releasers registered on enter() so exit() can tear listeners down cleanly.
  private readonly releasers: Array<() => void> = [];
  // SceneManager.push('replace') hides the previous (CombatScene) container so the death
  // frame would not be visible behind the card. We unhide it on enter() to expose the death
  // pose behind the popup (and restore the original visibility on exit() so retryAsWin's
  // explicit scene.exit() teardown isn't surprised). Captured per-mount.
  private prevSceneContainer: Container | null = null;
  private prevSceneWasVisible = true;

  constructor(width: number, height: number, opts: { onTryAgain: () => void }) {
    this.width = width;
    this.height = height;
    this.opts = opts;
  }

  async enter(): Promise<void> {
    // Terminal screen of the lose path. Marking finished here makes the TRY AGAIN tap's
    // sdk.install() open the store SYNCHRONOUSLY inside the user gesture (else the SDK
    // defers open() to a setTimeout that the popup blocker kills). Idempotent. We do NOT
    // call sdk.start() — the playable already started under the combat scene.
    sdk.finish();
    alTrack('ENDCARD_SHOWN');

    // Expose the death frame behind us. SceneManager.push('replace') (CombatDirector calls
    // this with mode='replace') hid the CombatScene container; unhide it so the frozen hero-
    // death pose reads through the scrim around the card. After my container is added to the
    // stage in push(), our sibling immediately below us in the stage's child list is the
    // CombatScene container. Walk back so retryAsWin's later scene.exit() teardown is clean.
    const parent = this.container.parent;
    if (parent) {
      const myIdx = parent.getChildIndex(this.container);
      if (myIdx > 0) {
        const below = parent.getChildAt(myIdx - 1);
        if (below) {
          this.prevSceneContainer = below as Container;
          this.prevSceneWasVisible = below.visible;
          below.visible = true;
        }
      }
    }

    // Moderate dark scrim — the frozen death frame must remain VISIBLE around the card,
    // unlike the previous near-opaque overlay that hid it. Eats stray taps outside the card.
    this.scrim = new Graphics();
    this.scrim.eventMode = 'static';
    this.container.addChild(this.scrim);

    // Load the card textures + button atlas + skull focal icon in parallel. Assets.load
    // (never Texture.from(importedUrl)) — repo lesson: Texture.from on a webpack-imported url
    // renders blank/white in PIXI v8 until check:textures catches it.
    const [bgTex, borderTex, btnTex, skullTex] = await Promise.all([
      Assets.load<Texture>(panelBg),
      Assets.load<Texture>(panelBorder),
      Assets.load<Texture>(buttons9slice.convex.url),
      Assets.load<Texture>(skullData),
    ]);
    await ensureGameFontLoaded();

    // Card container: pop-in transform pivots around this center. layoutScene() sizes its
    // bg/border 9-slices to fit the headline + buttons.
    this.card = new Container();
    this.cardBg = makeNineSlice({ texture: bgTex, border: PANEL_BORDER, width: 100, height: 100 });
    this.cardBg.tint = 0x36303f; // grey-purple body — matches the in-game SkillPanel card
    this.cardBorder = makeNineSlice({ texture: borderTex, border: PANEL_BORDER, width: 100, height: 100 });
    this.cardBorder.tint = 0x6b6478; // lighter purple-grey rim — matches SkillPanel
    this.card.addChild(this.cardBg);
    this.card.addChild(this.cardBorder);
    this.container.addChild(this.card);

    // Boss-skull focal icon ABOVE the DEFEAT headline INSIDE the card. Anchored centre so it
    // can be positioned by the layout (cx, headlineY - offset). Added to `this.card` so the
    // card's pop-in scale (0.85→1.0) + alpha fade in update() animates the skull as part of
    // the same arrival beat — no separate tween needed. layoutScene() sizes it to ~140 px
    // tall (proportional to card width, capped) so it reads as focal, not decorative.
    this.skull = new Sprite(skullTex);
    this.skull.anchor.set(0.5);
    this.card.addChild(this.skull);

    this.headline = new Text({ text: 'DEFEAT', style: HEADLINE_STYLE });
    this.headline.anchor.set(0.5);
    this.container.addChild(this.headline);

    this.sub = new Text({ text: 'SO CLOSE!', style: SUB_STYLE });
    this.sub.anchor.set(0.5);
    this.sub.alpha = 0;
    this.container.addChild(this.sub);

    // Sole CTA: TRY AGAIN — inviting green CTA (the satisfying winnable retry; routes through
    // the CTA→store→win-on-return flow).
    const tryAgain = createConvexButton({
      texture: btnTex,
      border: buttons9slice.convex.border,
      width: BTN_DESIGN_W,
      height: BTN_DESIGN_H,
      label: 'TRY AGAIN',
      fontSize: BTN_FONT_SIZE,
      tint: CONVEX_TINTS.cta,
    });
    tryAgain.label.y = LABEL_Y_NUDGE;
    this.tryAgainBtn = tryAgain.root;
    this.tryAgainFace = tryAgain.face;
    this.tryAgainBtn.alpha = 0;
    this.container.addChild(this.tryAgainBtn);

    this.wireButton(this.tryAgainBtn, this.tryAgainFace, this.opts.onTryAgain);

    this.layoutScene();
    this.elapsed = 0;
    this.ready = true;
  }

  /** Pointer wiring + press-feedback (face dips into the pocket on down, resets on up). */
  private wireButton(root: Container, face: Container, onTap: () => void): void {
    root.eventMode = 'static';
    root.cursor = 'pointer';
    const down = (): void => { face.y = BTN_PRESS_DEPTH; };
    const release = (): void => { face.y = 0; };
    const tap = (): void => { face.y = 0; onTap(); };
    root.on('pointerdown', down);
    root.on('pointerup', tap);
    root.on('pointerupoutside', release);
    root.on('pointercancel', release);
    this.releasers.push(() => {
      root.off('pointerdown', down);
      root.off('pointerup', tap);
      root.off('pointerupoutside', release);
      root.off('pointercancel', release);
    });
  }

  async exit(): Promise<void> {
    for (const off of this.releasers) off();
    this.releasers.length = 0;
    // Restore the prev scene's original visibility BEFORE its own exit() runs (retryAsWin
    // tears down the combat scene right after this; symmetry keeps the state predictable).
    if (this.prevSceneContainer) {
      this.prevSceneContainer.visible = this.prevSceneWasVisible;
      this.prevSceneContainer = null;
    }
    this.container.removeChildren().forEach(c => c.destroy({ children: true }));
    this.ready = false;
  }

  update(deltaMS: number): void {
    if (!this.ready) return;
    this.elapsed += deltaMS;

    // Card pops in (0.85→1.0 back-out + fade) so the popup lands instead of wiping the frame.
    const cT = Math.min(1, this.elapsed / CARD_POP_MS);
    const ce = easeOutBack(cT);
    this.card.scale.set(0.85 + 0.15 * ce);
    this.card.alpha = Math.min(1, cT * 1.4);

    // "DEFEAT" slams down + scales in with a slight overshoot.
    const hT = Math.min(1, this.elapsed / HEADLINE_DROP_MS);
    const he = easeOutBack(hT);
    this.headline.scale.set(0.6 + 0.4 * he);
    this.headline.alpha = Math.min(1, hT * 2);

    // "SO CLOSE!" eases in just after the headline lands.
    const sT = Math.min(1, Math.max(0, (this.elapsed - SUB_FADE_DELAY) / SUB_FADE_MS));
    this.sub.alpha = easeOutQuad(sT);

    // Button rises + fades in.
    const bT = Math.min(1, Math.max(0, (this.elapsed - BTN_APPEAR_DELAY) / BTN_APPEAR_MS));
    const be = easeOutQuad(bT);
    this.tryAgainBtn.alpha = be;
    const rise = 22 * (1 - be);
    this.tryAgainBtn.y = this.tryAgainBaseY + rise;

    // Gentle breathing pulse on the primary CTA once it's settled (multiply the laid-out
    // scale so resizes stay correct).
    if (bT >= 1) {
      const pulse = 1 + PULSE_AMP * Math.sin(this.elapsed * (2 * Math.PI / PULSE_PERIOD_MS));
      this.tryAgainBtn.scale.set(this.tryAgainScale * pulse);
    }
  }

  pause(): void {
    this.container.interactiveChildren = false;
  }

  resume(): void {
    this.container.interactiveChildren = true;
  }

  layout(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (!this.ready) return;
    this.layoutScene();
  }

  private layoutScene(): void {
    const W = this.width;
    const H = this.height;
    const cx = W / 2;

    // The card frames the skull + headline + the single TRY AGAIN button. Headline anchored
    // at H*0.42; the sole TRY AGAIN button sits below the subline.
    const headlineY = H * 0.42;
    const tryAgainY = H * 0.60;

    const desiredW = Math.min(W * 0.7, 560);
    const scale = desiredW / BTN_DESIGN_W;

    // Skull focal icon size — proportional to card width so it scales sensibly across viewports.
    // Tuned to read as a focal centrepiece (~140 px tall on the 414-wide phone, ~155 px max).
    // Aspect 1:1 (source is 256×256). Card width drives the proportion; height clamped so the
    // skull never crowds the headline.
    const cardW = Math.min(W * 0.82, 620);
    const skullSize = Math.min(155, Math.max(110, cardW * 0.30));
    const skullGap = 18; // breathing room between the skull's bottom and the headline top
    // Card sized to wrap skull + headline + the single TRY AGAIN button with comfortable
    // padding. The top moves UP by skull height + gap so the skull lives INSIDE the card
    // (above the headline). Width ~82% of viewport (capped), height spans from above the
    // skull to just under TRY AGAIN.
    const headlineFontScale = Math.max(0.7, Math.min(1, W / 560));
    const headlineHalfH = (104 * headlineFontScale) / 2; // half the headline's text height for padding
    const cardTop = headlineY - headlineHalfH - skullSize - skullGap - 16;
    const cardBottom = tryAgainY + (BTN_DESIGN_H * scale) / 2 + 24;
    const cardH = cardBottom - cardTop;
    // Position the card container at its CENTER so the pop-in scales around the middle.
    const cardCy = (cardTop + cardBottom) / 2;
    this.card.position.set(cx, cardCy);
    // Resize the 9-slice bg + border (anchored top-left at -cardW/2, -cardH/2 inside the card).
    this.resizeCard(cardW, cardH);

    // Skull lives INSIDE the card container — so its position is card-LOCAL (the card is
    // centred at (cx, cardCy), so the skull at local-x 0 lands on the card's vertical axis).
    // Place it above the headline: world-y headlineY - headlineHalfH - skullGap - skullSize/2
    // → local-y that minus cardCy. Sized via `width/height` so the loaded 256-px texture is
    // scaled down to the design size (Sprite keeps aspect when both are set).
    this.skull.width = skullSize;
    this.skull.height = skullSize;
    const skullCenterWorldY = headlineY - headlineHalfH - skullGap - skullSize / 2;
    this.skull.position.set(0, skullCenterWorldY - cardCy);

    // Moderate scrim: dark enough to push focus onto the card, light enough that the death
    // frame remains visible around it (the redesign brief). The card itself is the dominant
    // dark mass; the scrim is a light wash over the rest of the viewport.
    this.scrim.clear();
    this.scrim.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.55 });

    // Headline + subline inside the card.
    const headlineScale = Math.min(1, W / 560);
    this.headline.style.fontSize = 104 * Math.max(0.7, headlineScale);
    this.headline.position.set(cx, headlineY);
    this.sub.style.fontSize = 46 * Math.max(0.7, headlineScale);
    this.sub.position.set(cx, headlineY + this.headline.height * 0.6 + 14);

    // Button: laid out at the centered position. update() owns the appear-rise/pulse.
    this.tryAgainScale = scale;
    this.tryAgainBtn.scale.set(scale);
    this.tryAgainBaseY = tryAgainY;
    this.tryAgainBtn.position.set(cx, this.tryAgainBaseY);
  }

  /** Resize the 9-slice card bg + border so their top-left lands at -cardW/2,-cardH/2 (the
   *  card container is positioned at its center so the pop-in scales around the middle). */
  private resizeCard(cardW: number, cardH: number): void {
    this.cardBg.width = cardW;
    this.cardBg.height = cardH;
    this.cardBg.position.set(-cardW / 2, -cardH / 2);
    this.cardBorder.width = cardW;
    this.cardBorder.height = cardH;
    this.cardBorder.position.set(-cardW / 2, -cardH / 2);
  }
}
