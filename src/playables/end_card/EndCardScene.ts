import { Assets, Container, Graphics, Sprite } from 'pixi.js';
import { sdk } from '@smoud/playable-sdk';
import type { Scene } from '@shared/Scene';
import { safeInstall } from '@shared/mraidInstall';
import { alTrack } from '@shared/alAnalytics';
import { easeOutQuad, easeInOutQuad } from '@shared/utils';
import type { EndCardScript } from './index';
import { buttons9slice } from './buttons9slice';
import { createConvexButton, CONVEX_TINTS, ensureGameFontLoaded } from './convexButton';
// Registers the @font-face for Luckiest Guy (the bundled CTA font). Side-effect
// import — when the end card runs standalone (?type=end_card) the blackjack scene
// hasn't loaded it. webpack dedupes this with the blackjack scene's own import.
import '../dice-blackjack/fonts/fonts.css';

const FADE_IN_MS = 300;
const BUTTON_APPEAR_DELAY = 400;
const BUTTON_APPEAR_MS = 250;

// The convex CTA is built once at this design size (9-slice keeps the corners crisp
// + stretches the middle to this aspect), then uniformly scaled to fit the viewport.
const BTN_DESIGN_W = 560;
const BTN_DESIGN_H = 150;
const BTN_FONT_SIZE = 56;
const BTN_PRESS_DEPTH = 9; // face dips this far (design px) into the pocket on press
const LABEL_Y_NUDGE = -8;  // pull the caps label up to optically center it in the convex face
// Juicy CTA life: a gentle breathing pulse + a periodic gloss sweep across the face.
const PULSE_PERIOD_MS = 1150; // one full breathe in→out
const PULSE_AMP = 0.04;       // ±4% scale around the laid-out size
const SHINE_PERIOD_MS = 2400; // gleam cadence (one sweep + a rest)
const SHINE_SWEEP_MS = 560;   // how long a single gloss sweep takes to cross

export class EndCardScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private script: EndCardScript;
  private width: number;
  private height: number;
  private ready = false;

  private hitArea!: Graphics;
  private bgSprite!: Sprite;
  private logoSprite!: Sprite;
  private button!: Container;
  private buttonFace!: Container;
  private shine!: Graphics;      // gloss-sweep strip, clipped to the CTA face
  private shineMask!: Graphics;  // rounded-rect mask matching the face so the gloss never spills

  private animElapsed = 0;
  private buttonY = 0;
  private buttonScale = 1;

  constructor(script: EndCardScript, width: number, height: number) {
    this.script = script;
    this.width = width;
    this.height = height;
    this.done = new Promise(resolve => {
      this.resolveDone = resolve;
    });
  }

  async enter(): Promise<void> {
    this.hitArea = new Graphics();
    this.hitArea.eventMode = 'static';
    this.hitArea.cursor = 'pointer';
    // Tap anywhere installs; the button visibly presses for feedback.
    this.hitArea.on('pointerdown', () => {
      this.buttonFace.y = BTN_PRESS_DEPTH;
      safeInstall();
    });
    const release = (): void => { this.buttonFace.y = 0; };
    this.hitArea.on('pointerup', release);
    this.hitArea.on('pointerupoutside', release);
    this.hitArea.on('pointercancel', release);
    this.container.addChild(this.hitArea);

    const bgTex = await Assets.load(this.script.splashImage);
    this.bgSprite = new Sprite(bgTex);
    this.bgSprite.anchor.set(0.5, 0);
    this.bgSprite.alpha = 0;
    this.bgSprite.eventMode = 'none';
    this.container.addChild(this.bgSprite);

    const logoTex = await Assets.load(this.script.logoImage);
    this.logoSprite = new Sprite(logoTex);
    this.logoSprite.anchor.set(0.5);
    this.logoSprite.alpha = 0;
    this.logoSprite.eventMode = 'none';
    this.container.addChild(this.logoSprite);

    // The convex "Play Now!" CTA — same Layer Lab button used by the in-game
    // Claim/Double buttons (single source: ./convexButton + ./buttons9slice).
    const btnTex = await Assets.load(buttons9slice.convex.url);
    await ensureGameFontLoaded();
    const { root, face, label } = createConvexButton({
      texture: btnTex,
      border: buttons9slice.convex.border,
      width: BTN_DESIGN_W,
      height: BTN_DESIGN_H,
      label: 'Play Now!',
      fontSize: BTN_FONT_SIZE,
      tint: CONVEX_TINTS.cta,
    });
    // Optically center the caps label: Luckiest Guy's line box reserves descender space,
    // so an anchor-0.5 label sits visually LOW in the convex face. Nudge it up to balance.
    label.y = LABEL_Y_NUDGE;
    this.button = root;
    this.buttonFace = face;
    this.button.eventMode = 'none';
    this.button.alpha = 0;
    this.container.addChild(this.button);

    this.buildButtonShine();

    this.layoutScene();
    this.animElapsed = 0;
    this.ready = true;
    sdk.start();
    // Mark the playable finished the moment the end card mounts. This is the
    // terminal screen, and it ensures the CTA tap's sdk.install() opens the store
    // SYNCHRONOUSLY inside the user gesture. Otherwise the SDK's first install()
    // call only emits `finish` and defers the actual open() to a setTimeout — which
    // runs outside the gesture and gets killed by the browser's popup blocker (and
    // delays the store on some networks). Idempotent: the combo director already
    // calls finish(), and every showEndCard() handler is guarded/no-op.
    sdk.finish();
    alTrack('ENDCARD_SHOWN');
  }

  /** Gloss-sweep overlay clipped to the CTA face. Pure Graphics (no new asset); mirrors the
   *  board-fight button shine (GameEndScene/RollButton): a leaning white strip masked to the
   *  rounded face, swept by update() — so every playable showing the end card gets the juicy CTA. */
  private buildButtonShine(): void {
    const W = BTN_DESIGN_W;
    const H = BTN_DESIGN_H;
    // Leaning white gloss strip (tilt baked into the points), CLIPPED to the rounded face by
    // shineMask so the taller/leaning strip never spills past the button's top/bottom/sides as
    // it sweeps. update() also alpha-fades it (sin across the sweep) so it reads as a glossy
    // light pass that fades at the ends.
    const stripW = W * 0.18;
    const lean = H * 0.4;
    this.shine = new Graphics()
      .poly([0, -H / 2, stripW, -H / 2, stripW - lean, H / 2, -lean, H / 2])
      .fill({ color: 0xffffff, alpha: 0.7 });
    this.shine.visible = false;
    // Rounded-rect mask matching the button face — the gloss is clipped to the visible face.
    this.shineMask = new Graphics().roundRect(-W / 2, -H / 2, W, H, H / 4).fill(0xffffff);
    this.shine.mask = this.shineMask;
    this.buttonFace.addChild(this.shineMask, this.shine);
  }

  async exit(): Promise<void> {}

  update(deltaMS: number): void {
    if (!this.ready) {
      return;
    }

    this.animElapsed += deltaMS;

    const fadeT = Math.min(1, this.animElapsed / FADE_IN_MS);
    this.bgSprite.alpha = fadeT;
    this.logoSprite.alpha = fadeT;

    const btnT = (this.animElapsed - BUTTON_APPEAR_DELAY) / BUTTON_APPEAR_MS;
    if (btnT > 0 && btnT <= 1) {
      const e = easeOutQuad(btnT);
      this.button.alpha = e;
      this.button.y = this.buttonY + 20 * (1 - e);
    } else if (btnT > 1) {
      this.button.alpha = 1;
      this.button.y = this.buttonY;
    }

    // Breathing pulse — multiply the laid-out scale so resizes stay correct.
    const pulse = 1 + PULSE_AMP * Math.sin(this.animElapsed * (2 * Math.PI / PULSE_PERIOD_MS));
    this.button.scale.set(this.buttonScale * pulse);

    // Gloss sweep — kicks in once the button has finished appearing, then loops.
    const appearDone = BUTTON_APPEAR_DELAY + BUTTON_APPEAR_MS;
    if (this.animElapsed > appearDone) {
      const phase = ((this.animElapsed - appearDone) % SHINE_PERIOD_MS) / SHINE_SWEEP_MS;
      if (phase <= 1) {
        this.shine.visible = true;
        this.shine.x = -BTN_DESIGN_W * 0.7 + easeInOutQuad(phase) * BTN_DESIGN_W * 1.6;
        this.shine.alpha = Math.sin(Math.PI * phase); // fade in/out → hide the edge overflow
      } else if (this.shine.visible) {
        this.shine.visible = false;
      }
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
    if (!this.ready) {
      return;
    }
    this.layoutScene();
  }

  private layoutScene(): void {
    const centerX = this.width / 2;
    const isLandscape = this.width > this.height;

    this.hitArea.clear();
    if (isLandscape) {
      this.hitArea.rect(0, 0, this.width, this.height).fill({ color: 0x111111 });
    } else {
      this.hitArea.rect(0, 0, this.width, this.height).fill({ color: 0x000000, alpha: 0.001 });
    }

    this.bgSprite.visible = !isLandscape;
    if (!isLandscape) {
      const texW = this.bgSprite.texture.width;
      const texH = this.bgSprite.texture.height;
      const coverScale = Math.max(this.width / texW, this.height / texH);
      this.bgSprite.scale.set(coverScale);
      this.bgSprite.position.set(centerX, -50);
    }

    this.logoSprite.visible = isLandscape;
    if (isLandscape) {
      const logoTex = this.logoSprite.texture;
      const maxW = this.width * 0.7;
      const maxH = this.height * 0.65;
      const logoScale = Math.min(maxW / logoTex.width, maxH / logoTex.height);
      this.logoSprite.scale.set(logoScale);
      this.logoSprite.position.set(centerX, this.height * 0.38);
    }

    // Uniformly scale the convex CTA to ~62% of the viewport width (capped), then
    // pin it near the bottom. update() owns the y during the appear slide.
    const desiredW = Math.min(this.width * 0.62, 600);
    this.buttonScale = desiredW / BTN_DESIGN_W;
    this.button.scale.set(this.buttonScale);
    this.buttonY = this.height * 0.88;
    this.button.position.set(centerX, this.buttonY);
  }
}
