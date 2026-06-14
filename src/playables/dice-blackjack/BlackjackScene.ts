import {
  Assets,
  Container,
  Graphics,
  Renderer,
  Sprite,
  Text,
  TextStyle,
  Texture,
  Ticker,
} from 'pixi.js';
import { sdk } from '@smoud/playable-sdk';
import type { Scene } from '@shared/Scene';
import { alTrack } from '@shared/alAnalytics';
import { safeInstall } from '@shared/mraidInstall';
import { blackjackSfx } from '../board-fight/sfx-blackjack';
import './fonts/fonts.css';
import * as sfx from '../board-fight/sfx';
import musicData from 'assets/Audio/Arcade_Oddities.mp3';
import { BlackjackDice } from './BlackjackDice';
import { LoadBar } from './LoadBar';
import {
  Sequence,
  type SequenceListener,
  type SequenceState,
  type Side,
  type DiceFaces,
} from './Sequence';
import type { BlackjackScript, DialogueKey } from './config';
import { PostGameUI } from './PostGameUI';
import confetti from 'canvas-confetti';
import bgUrl from 'assets/dice-blackjack/bg.webp';
import stageUrl from 'assets/dice-blackjack/stage.webp';
import dealerUrl from 'assets/dice-blackjack/dealer.webp';
import dealerAngryUrl from 'assets/dice-blackjack/angry_dealer.webp';
import buttonRollUrl from 'assets/dice-blackjack/button_roll.webp';
import buttonStandUrl from 'assets/dice-blackjack/button_stand.webp';
import ftueHandUrl from 'assets/UI/FTUE_Hand.webp';
import coinIconUrl from 'assets/UI/Coin.webp';
import { buttons9slice } from '../end_card/buttons9slice';

// Reference canvas constants live in layout.ts so they can be unit-tested.
import { REF_W, REF_H, BAR_W, BAR_H, computeLayout } from './layout';

// Comic-book speech font — Bangers reads as "spoken" but is punchier and
// more game-y than Chalkboard SE. Falls back to Marker Felt / Comic Sans on
// systems where the woff2 fails to load.
const DIALOGUE_STYLE = new TextStyle({
  fill: 0x181008,
  fontFamily: '"Bangers", "Marker Felt", "Comic Sans MS", "Comic Neue", "Trebuchet MS", Arial, sans-serif',
  fontSize: 28,
  fontWeight: '400',
  letterSpacing: 1.2,
  wordWrap: true,
  wordWrapWidth: 220,
  align: 'center',
});

// CTA button captions — Luckiest Guy is the canonical "fun mobile game
// button" font: chunky all-caps, friendly. Thick stroke for the comic outline.
const BUTTON_LABEL_STYLE = new TextStyle({
  fill: 0xffffff,
  fontFamily: '"Luckiest Guy", Impact, "Arial Black", sans-serif',
  fontSize: 40,
  letterSpacing: 1.5,
  stroke: { color: 0x181008, width: 7, join: 'round' },
});

// Luck-popup text style — same family as the buttons but BIGGER and bolder
// so the reward/loss read pops over the dice. Fill set at spawn time
// (green = lucky, red = unlucky).
const LUCK_POPUP_STYLE_BASE = {
  fontFamily: '"Luckiest Guy", Impact, "Arial Black", sans-serif',
  fontSize: 84,
  letterSpacing: 2.5,
};

// Delay between the round resolving and the scene resolving `done`. Long
// enough for the coin shower to fill the screen, so when the end card mounts
// it feels like the COINS just transitioned into it (no dead air).
const RESOLVE_DELAY_MS = 1300;
// How long a dialogue line stays on screen before the bubble hides.
const DIALOGUE_VISIBLE_MS = 3300;
// Cross-fade duration when the bubble appears/disappears.
const DIALOGUE_FADE_MS = 180;

// ── Intro fade-in ────────────────────────────────────────────────────────
// Total length of the staged UI intro after the scene mounts. Each element
// has a sub-window inside this — see updateIntro().
const INTRO_DURATION_MS = 900;
// How far elements travel during their slide-in (REF px).
const INTRO_SLIDE_PX = 60;

// ── Luck popup ───────────────────────────────────────────────────────────
const LUCK_POPUP_LIFETIME_MS = 1100;
const LUCK_POPUP_RISE_PX = 110;          // travels upward across its lifetime
const LUCK_GOOD_COLOR = 0x4be36d;
const LUCK_STROKE_COLOR = 0x1a1006;
const LUCK_STROKE_WIDTH = 11;

interface LuckPopup {
  text: Text;
  vy: number;
  life: number;
  maxLife: number;
}

// ── STAND pulse trigger ──────────────────────────────────────────────────
// Player score that flips STAND from "available but quiet" to "pulsing prompt".
const STAND_PULSE_SCORE_THRESHOLD = 19;

// ── Tutorial card ────────────────────────────────────────────────────────
// Appears once after the intro fade-in; dismisses on the first ROLL tap.
const TUTORIAL_FADE_MS = 260;
// Delay between the intro finishing and the tutorial starting to fade in.
const TUTORIAL_DELAY_AFTER_INTRO_MS = 80;
const TUTORIAL_CARD_W = 540;
const TUTORIAL_CARD_H = 280;
const TUTORIAL_TITLE_STYLE = new TextStyle({
  fill: 0x181008,
  fontFamily: '"Luckiest Guy", Impact, "Arial Black", sans-serif',
  fontSize: 56,
  letterSpacing: 2,
  stroke: { color: 0xffe6a8, width: 6, join: 'round' },
  align: 'center',
});
const TUTORIAL_BODY_STYLE = new TextStyle({
  fill: 0x2a1d10,
  fontFamily: '"Bangers", "Marker Felt", "Comic Sans MS", Arial, sans-serif',
  fontSize: 30,
  letterSpacing: 1.2,
  wordWrap: true,
  wordWrapWidth: TUTORIAL_CARD_W - 60,
  align: 'center',
});
const TUTORIAL_HINT_STYLE = new TextStyle({
  fill: 0xb24a1a,
  fontFamily: '"Luckiest Guy", Impact, "Arial Black", sans-serif',
  fontSize: 28,
  letterSpacing: 1.5,
  align: 'center',
});

// ── Juice constants ──────────────────────────────────────────────────────
// Full-screen red flash on bust.
const FLASH_DURATION_MS = 420;
// Screen shake on big rolls or bust. ms.
const SCREEN_SHAKE_MS = 380;
// Threshold for "big roll" screen shake.
const BIG_ROLL_THRESHOLD = 10;
// Coin rain on win — designed as a SHOWER, then a TRANSITION wipe that
// covers the screen as the end card mounts. Three tight waves give us
// continuous coverage from win → end card without dead time.
const COIN_COUNT_FIRST_WAVE = 110;   // main burst — drowns the screen
const COIN_COUNT_SECOND_WAVE = 90;   // sustain — fills any gaps
const COIN_COUNT_THIRD_WAVE = 70;    // tail — lasts into the end-card fade
const COIN_SECOND_WAVE_DELAY_MS = 180;
const COIN_THIRD_WAVE_DELAY_MS = 380;
const COIN_LIFETIME_MS = 2800;

interface Coin {
  sprite: Sprite;
  vx: number;
  vy: number;
  va: number;          // angular velocity (rad/ms)
  life: number;        // ms remaining
}

// Dust-burst tunables (dice-impact). Lives in REF space (inside uiRoot) so
// the burst scales with the rest of the UI and lands exactly on the dice.
// Tuned to puff outward from the BOTTOM edge of each die — small, tight,
// ground-hugging spread (not a radial explosion).
const DUST_PARTICLES_PER_DIE = 8;
const DUST_LIFETIME_MS = 460;
const DUST_SPEED = 0.13;      // px/ms upper bound — kept low to avoid sprawl
const DUST_GRAVITY = 0.0011;  // px/ms² downward pull
const DUST_START_SCALE_MIN = 0.45;
const DUST_START_SCALE_MAX = 0.78;

interface Dust {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export class BlackjackScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;
  private ready = false;

  /** All UI lives inside this child container, in 720×1280 reference coords. */
  private readonly uiRoot = new Container();
  /**
   * Sibling-of-uiRoot layer that holds elements which should NOT participate
   * in screen-shake (currently: the stone stage sprite). Mirrors uiRoot's BASE
   * scale/position during relayout so its REF-space children render in the
   * same spot — but updateShake() only jiggles uiRoot, leaving this rock-steady.
   */
  private readonly staticStageLayer = new Container();

  private renderer: Renderer;
  private ticker: Ticker;
  private script: BlackjackScript;
  private width: number;
  private height: number;
  /**
   * When true, this scene is hosted inside another playable (e.g. board-fight)
   * that owns the single SDK lifecycle, so we skip our own `sdk.start()`.
   * Standalone (default) keeps the original behavior.
   */
  private embedded: boolean;
  /**
   * When false, the host is keeping its own music playing and we should NOT
   * call `sfx.setMusic(...)`. Standalone (default) plays our music as before.
   */
  private playMusic: boolean;

  // Background letterbox layer (sits behind uiRoot, fills the whole screen)
  private bgFill!: Graphics;

  // UI elements (all children of uiRoot, positioned in REF coords)
  private bgSprite!: Sprite;
  private stageSprite!: Sprite;
  private dealerSprite!: Sprite;
  private dealerAngrySprite!: Sprite;
  /** Crossfade state — 0 = calm, 1 = angry. */
  private dealerAngerLevel = 0;
  /** Ms remaining in the calm → angry crossfade. */
  private dealerCrossfadeMs = 0;
  private readonly DEALER_CROSSFADE_DURATION_MS = 380;
  private dialogueBubble!: Graphics;
  private dialogueText!: Text;
  private bubbleWidth = 0;
  private bubbleHeight = 0;
  /** Cached dealer geometry — captured during relayout() and reused by
   *  positionDialogueBubble() so showDialogue() can re-anchor the bubble
   *  whenever a new (possibly differently-sized) line comes in. */
  private dealerLeftEdgeRef = 0;
  private dealerHeadYRef = 0;
  private playerBar!: LoadBar;
  private opponentBar!: LoadBar;
  private rollButton!: Container;
  private rollButtonSprite!: Sprite;
  private rollButtonCaption!: Text;
  private standButton!: Container;
  /** Pulse state for the ROLL button — runs until the first press. */
  private rollPulseActive = true;
  private rollPulseElapsed = 0;
  /** Pulse state for the STAND button — runs while player score ≥ threshold. */
  private standPulseActive = false;
  private standPulseElapsed = 0;
  private standButtonSprite!: Sprite;
  private standButtonCaption!: Text;
  /** FTUE finger pointer that bobs above the ROLL button until first tap. */
  private ftueHand: Sprite | null = null;
  private ftueHandBaseX = 0;
  private ftueHandBaseY = 0;
  private rollEnabled = true;
  private standEnabled = false;
  private lastPlayerScore = 0;
  // Dialogue auto-hide state: counts ms since the last setDialogue() call,
  // fades the bubble out after DIALOGUE_VISIBLE_MS.
  private dialogueElapsed = 0;
  private dialogueVisible = false;

  // Juice state
  private flashOverlay!: Graphics;
  private flashElapsed = FLASH_DURATION_MS;     // sentinel: finished
  private flashColor = 0xff3333;
  private shakeElapsed = SCREEN_SHAKE_MS;
  private shakeMagnitude = 0;
  private uiRootBaseX = 0;
  private uiRootBaseY = 0;
  private coinLayer!: Container;
  private coins: Coin[] = [];
  private coinTexture: Texture | null = null;
  private dustLayer!: Container;
  private dust: Dust[] = [];
  private dustTexture: Texture | null = null;
  private luckLayer!: Container;
  private luckPopups: LuckPopup[] = [];

  // ── Tutorial overlay state ──────────────────────────────────────────────
  private tutorialActive = true;
  private tutorialAlpha = 0;       // current overlay alpha (0..1)
  private tutorialPhase: 'pending' | 'fadeIn' | 'shown' | 'fadeOut' | 'done' = 'pending';
  private tutorialElapsed = 0;     // ms in the current phase
  private tutorialLayer!: Container;
  private tutorialDim!: Graphics;
  private tutorialCard!: Container;
  private tutorialCardBg!: Graphics;

  // ── Intro fade-in state ─────────────────────────────────────────────────
  /** Elapsed time since `enter()` finished mounting — drives staggered fade-in. */
  private introElapsed = 0;
  private introActive = true;
  /**
   * Cached base Y for every element that slides in. Re-captured on relayout,
   * because the slide offset is APPLIED to the relayout-set position and
   * needs to know what the resting position is.
   */
  private introBaseY = new Map<Container, number>();

  private dice!: BlackjackDice;
  private sequence!: Sequence;

  // PostGame UI — coin reward HUD + Claim/Challenge buttons. Built in enter()
  // once the coin texture has been baked, since the HUD reuses the same coin
  // sprite art as the coin-rain.
  private postGameUI!: PostGameUI;

  // Pending coin-rain setTimeout ids + the live celebration ticker handler.
  // Tracked so exit() can cancel anything still scheduled — otherwise a wave
  // or a frame-handler fires after teardown against detached objects and
  // throw-kills the shared (board-fight Director) ticker.
  private coinRainTimers: ReturnType<typeof setTimeout>[] = [];
  private celebrationHandler: ((t: Ticker) => void) | null = null;

  constructor(opts: {
    renderer: Renderer;
    ticker: Ticker;
    script: BlackjackScript;
    width: number;
    height: number;
    /** Set true when hosted inside another playable that owns sdk.start(). */
    embedded?: boolean;
    /** Set false when the host keeps its own music playing. */
    playMusic?: boolean;
  }) {
    this.renderer = opts.renderer;
    this.ticker = opts.ticker;
    this.script = opts.script;
    this.width = opts.width;
    this.height = opts.height;
    // Defaults preserve standalone behavior: not embedded, play our own music.
    this.embedded = opts.embedded ?? false;
    this.playMusic = opts.playMusic ?? true;
    this.done = new Promise(resolve => {
      this.resolveDone = resolve;
    });
  }

  async enter(): Promise<void> {
    // Wait for the bundled fonts (Luckiest Guy + Bangers) to finish loading
    // before constructing any PixiJS Text — Pixi caches rendered glyphs the
    // first time a Text is drawn, so if we render before the woff2 is parsed
    // we'd get the fallback font baked in for the whole session.
    await ensureFontsLoaded();

    // Solid letterbox fallback — only visible if the bg texture fails to load.
    this.bgFill = new Graphics();
    this.container.addChild(this.bgFill);

    const [bgTex, stageTex, dealerTex, dealerAngryTex] = await Promise.all([
      Assets.load<Texture>(bgUrl),
      Assets.load<Texture>(stageUrl),
      Assets.load<Texture>(dealerUrl),
      Assets.load<Texture>(dealerAngryUrl),
    ]);

    // Background art — sits as a sibling of uiRoot, NOT inside it. This lets
    // the bg aspect-fill the viewport on every device without being clipped
    // to the REF canvas.
    this.bgSprite = new Sprite(bgTex);
    this.bgSprite.anchor.set(0.5);
    this.container.addChild(this.bgSprite);

    // Static stage layer — a sibling of uiRoot that scales/positions WITH the
    // UI on resize but is NOT subject to screen shake. Mounted BEFORE uiRoot
    // so the stage renders behind everything in uiRoot (bars, dealer, dice).
    this.container.addChild(this.staticStageLayer);

    // uiRoot sits ON TOP of the bg + stage, in REF coordinate space.
    this.container.addChild(this.uiRoot);

    // Stage — stone platform centered behind the dice render. Lives in the
    // static layer so screen shake doesn't slide the rock around (the shake
    // is meant to read as "the WORLD lurches", not "the ground lurches").
    this.stageSprite = new Sprite(stageTex);
    this.stageSprite.anchor.set(0.5);
    // Bigger stage so the dice settle inside the inner circle. The bg has
    // a visible inner oval that's roughly 65% of the sprite's width/height.
    this.stageSprite.width = 640;
    this.stageSprite.height = 480;
    this.stageSprite.alpha = 0.94;
    this.staticStageLayer.addChild(this.stageSprite);

    // Score bars (no title — the GAMBLER bar is the top of the HUD).
    // Positions set by relayout() / computeLayout().
    this.opponentBar = new LoadBar({
      label: 'GAMBLER',
      maxScore: this.script.round.maxScore,
      width: BAR_W, height: BAR_H, ticker: this.ticker,
    });
    this.uiRoot.addChild(this.opponentBar);

    this.playerBar = new LoadBar({
      label: 'YOU',
      maxScore: this.script.round.maxScore,
      width: BAR_W, height: BAR_H, ticker: this.ticker,
    });
    // Y set by layoutDynamicElements.
    this.uiRoot.addChild(this.playerBar);

    // Dealer NPC — top-right band, between bar and dice stage
    // Dealer NPC — centered horizontally above the stage, anchored
    // bottom-center so his feet sit on a fixed line just above the stage.
    // Position Y is set dynamically by relayout() in case the stage moves.
    // Dealer dimensions — slightly smaller (was 200×300) so he stops
    // crowding the opponent bar. Both calm + angry sprites share the same
    // box so the crossfade lands cleanly without a size pop.
    const DEALER_W = 170;
    const DEALER_H = 255;

    this.dealerSprite = new Sprite(dealerTex);
    this.dealerSprite.anchor.set(0.5, 1);
    this.dealerSprite.width = DEALER_W;
    this.dealerSprite.height = DEALER_H;
    this.uiRoot.addChild(this.dealerSprite);

    // Angry dealer art — same dimensions/anchor, painted on top of the calm
    // sprite. Stays at alpha 0 until the gambler loses, then crossfades in.
    this.dealerAngrySprite = new Sprite(dealerAngryTex);
    this.dealerAngrySprite.anchor.set(0.5, 1);
    this.dealerAngrySprite.width = DEALER_W;
    this.dealerAngrySprite.height = DEALER_H;
    this.dealerAngrySprite.alpha = 0;
    this.uiRoot.addChild(this.dealerAngrySprite);

    // Dialogue bubble — positioned dynamically by relayout() relative to the
    // dealer (who moves with the stage). Tail points right-down at his face.
    this.dialogueBubble = new Graphics();
    this.bubbleWidth = 230;
    this.bubbleHeight = 100;
    this.uiRoot.addChild(this.dialogueBubble);
    this.dialogueText = new Text({ text: '', style: DIALOGUE_STYLE });
    this.dialogueText.anchor.set(0.5);
    this.uiRoot.addChild(this.dialogueText);
    this.drawDialogueBubble();
    // Start hidden — first setDialogue() will fade it in.
    this.dialogueBubble.alpha = 0;
    this.dialogueText.alpha = 0;

    // 3D dice — child of uiRoot so it scales with the rest
    this.dice = new BlackjackDice(this.renderer, this.ticker);
    this.dice.setAnchor(REF_W / 2, 660);
    this.uiRoot.addChild(this.dice.container);

    // Roll / Stand buttons
    const [rollTex, standTex] = await Promise.all([
      Assets.load<Texture>(buttonRollUrl),
      Assets.load<Texture>(buttonStandUrl),
    ]);
    this.rollButton = this.makeIconButton(rollTex, 'ROLL', () => {
      // Stop the pulse + hide the FTUE finger the first time ROLL is pressed.
      this.rollPulseActive = false;
      this.hideFtueHand();
      // Tap on ROLL also dismisses the tutorial overlay (the only way out).
      this.dismissTutorial();
      sfx.buttonClick();
      void this.sequence.onRollClicked();
    });
    this.rollButtonSprite = this.rollButton.children[0] as Sprite;
    this.rollButtonCaption = this.rollButton.children[1] as Text;
    this.standButton = this.makeIconButton(standTex, 'STAND', () => {
      // Tapping STAND silences its own pulse — same idea as ROLL on first tap.
      this.standPulseActive = false;
      sfx.buttonClick();
      void this.sequence.onStandClicked();
    });
    this.standButtonSprite = this.standButton.children[0] as Sprite;
    this.standButtonCaption = this.standButton.children[1] as Text;

    // FTUE hand — same asset board-fight uses. Native orientation has the
    // fingertip UP and cuff at the bottom; rotate 180° so the fingertip
    // points DOWN at the button. After the flip, anchor (0.5, 0) sits at the
    // visual top (the cuff) so positioning is "cuff x/y".
    const ftueTex = await Assets.load<Texture>(ftueHandUrl);
    this.ftueHand = new Sprite(ftueTex);
    this.ftueHand.anchor.set(0.5, 0);
    this.ftueHand.rotation = Math.PI;
    const FTUE_TARGET_W = 110;
    this.ftueHand.scale.set(FTUE_TARGET_W / ftueTex.width);
    this.uiRoot.addChild(this.ftueHand);
    // Button + FTUE hand positions are set dynamically by layoutDynamicElements
    // (they anchor to the bottom of the viewport, not a fixed REF Y).
    this.uiRoot.addChild(this.rollButton, this.standButton);
    this.applyButtonState();

    // Full-screen flash overlay — sits above uiRoot so it dims everything.
    // Added to this.container (not uiRoot) so it covers letterbox too.
    this.flashOverlay = new Graphics();
    this.flashOverlay.alpha = 0;
    this.container.addChild(this.flashOverlay);

    // Coin rain layer — also above uiRoot.
    this.coinLayer = new Container();
    this.coinLayer.visible = false;
    this.container.addChild(this.coinLayer);

    // Dust burst layer — sits INSIDE uiRoot, in REF coords, so puffs land on
    // the dice and scale with the rest of the UI. Added late so it draws
    // above the dice/stage.
    this.dustLayer = new Container();
    this.uiRoot.addChild(this.dustLayer);

    // Luck-popup layer — floating "BIG LUCK" / "BUST!" labels that rise from
    // the dice on big-swing rolls. REF coords, sits above the dust layer.
    this.luckLayer = new Container();
    this.uiRoot.addChild(this.luckLayer);

    // Tutorial overlay — dim screen + intro card with the ROLL button + FTUE
    // finger poking through. Built inside uiRoot using sortableChildren so the
    // ROLL button + FTUE can be lifted above the dim via zIndex alone (no
    // re-parenting maths). Dismissed on the first ROLL tap.
    this.uiRoot.sortableChildren = true;
    this.tutorialLayer = new Container();
    this.tutorialLayer.zIndex = 850;
    this.tutorialLayer.alpha = 0;
    this.tutorialLayer.eventMode = 'static';
    this.uiRoot.addChild(this.tutorialLayer);
    this.tutorialDim = new Graphics();
    this.tutorialLayer.addChild(this.tutorialDim);
    this.tutorialCard = this.buildTutorialCard();
    this.tutorialLayer.addChild(this.tutorialCard);
    // Lift ROLL button + FTUE finger above the dim so they remain bright.
    this.rollButton.zIndex = 900;
    if (this.ftueHand) this.ftueHand.zIndex = 900;

    // Coin + button textures use real game art (extracted from Unity via
    // npm run extract:dice-blackjack-9slice). Dust still procedural — it's just
    // a tiny radial blob and not worth shipping as a separate asset.
    const [coinTex, buttonTex] = await Promise.all([
      Assets.load<Texture>(coinIconUrl),
      Assets.load<Texture>(buttons9slice.convex.url),
    ]);
    this.coinTexture = coinTex;
    this.dustTexture = this.bakeDustTexture();

    // PostGame UI (coin HUD + Claim/Challenge buttons). Lives inside uiRoot so
    // it scales with the rest of the playable; sits on top of the bars/dice
    // but below the tutorial overlay and flash.
    this.postGameUI = new PostGameUI({
      ticker: this.ticker,
      coinTexture: this.coinTexture,
      buttonTexture: buttonTex,
      buttonBorder: buttons9slice.convex.border,
      onClaim: () => {
        sfx.buttonClick();
        void this.sequence.onClaimClicked();
      },
      onChallenge: () => {
        sfx.buttonClick();
        // Soft CTA: tap fires the App Store popup via MRAID AND advances the
        // round in the background. The playable keeps running underneath, so
        // when the user dismisses the store they return to round 2 already
        // in progress — they "keep playing from where they left off" (= now
        // they're playing the next round, not stuck on the PostGame screen).
        safeInstall();
        void this.sequence.onChallengeClicked();
      },
    });
    this.uiRoot.addChild(this.postGameUI);

    // Mark ready BEFORE laying out: layout() early-returns while `!ready`, so this
    // mount-time relayout (the only code that scales uiRoot + positions the bars,
    // buttons and stage) must run here. The standalone used to get a free relayout
    // from the sdk.start()→resize below, but the embedded path skips sdk.start(),
    // so nothing else lays us out — without this the UI renders unscaled at the
    // top-left (ROLL button top-left, tutorial title overflowing the right edge).
    this.ready = true;
    this.layout(this.width, this.height);
    // Stage the staggered fade-in by zeroing alphas on everything that
    // animates in. relayout() (via layout() above) has set final positions;
    // updateIntro() applies a per-element offset against those.
    this.beginIntro();

    // Background music — loops continuously. setMusic gates playback on
    // the first user interaction (handled inside sfx.ts), so calling it
    // here is safe even before the player has tapped.
    // When embedded, the host may keep its own music playing (playMusic=false).
    if (this.playMusic) sfx.setMusic(musicData, Math.min(sdk.volume, 0.6));

    this.sequence = new Sequence(this.script, this.makeListener(), this.ticker);
    await this.sequence.start();
    // When embedded, board-fight owns the single sdk.start() call.
    if (!this.embedded) sdk.start();
  }

  async exit(): Promise<void> {
    // Full teardown. Critical when embedded: the board-fight Director's ticker
    // is shared + long-lived, so every per-frame handler this scene (and its
    // children) added MUST be detached here. Any handler left behind fires
    // against detached/destroyed Pixi objects on the next frame, throws, and —
    // because Pixi's Ticker._tick doesn't re-arm rAF after a listener throws —
    // permanently kills the ticker for the whole app. Idempotent + guarded so
    // it's also safe for the standalone teardown path.
    this.ready = false;                       // stop this scene's own update()
    for (const id of this.coinRainTimers) clearTimeout(id);
    this.coinRainTimers = [];
    if (this.celebrationHandler) {
      this.ticker.remove(this.celebrationHandler);
      this.celebrationHandler = null;
    }
    this.dice?.destroy?.();                    // removes the dice ticker handler
    this.playerBar?.dispose?.();
    this.opponentBar?.dispose?.();
    this.postGameUI?.destroy?.();              // also removes the win-popup handler
    this.container.removeChildren();
  }

  update(deltaMS: number): void {
    if (!this.ready) return;
    this.updateIntro(deltaMS);
    this.updateDialogue(deltaMS);
    this.updateFlash(deltaMS);
    this.updateShake(deltaMS);
    this.updateCoins(deltaMS);
    this.updateDust(deltaMS);
    this.updateLuckPopups(deltaMS);
    this.updateRollPulse(deltaMS);
    this.updateStandPulse(deltaMS);
    this.updateDealerCrossfade(deltaMS);
    this.updateTutorial(deltaMS);
  }

  /**
   * Tutorial overlay state machine. After the staged intro fade-in finishes,
   * fades in a dim screen + an intro text card. Stays visible until the
   * player taps ROLL, then fades back out and disposes.
   */
  private updateTutorial(deltaMS: number): void {
    if (this.tutorialPhase === 'done') return;
    this.tutorialElapsed += deltaMS;

    if (this.tutorialPhase === 'pending') {
      // Wait for the intro fade-in to wrap up before we drop the overlay in.
      const startAt = INTRO_DURATION_MS + TUTORIAL_DELAY_AFTER_INTRO_MS;
      if (this.tutorialElapsed >= startAt) {
        this.tutorialPhase = 'fadeIn';
        this.tutorialElapsed = 0;
      }
      return;
    }

    if (this.tutorialPhase === 'fadeIn') {
      this.tutorialAlpha = Math.min(1, this.tutorialElapsed / TUTORIAL_FADE_MS);
      this.tutorialLayer.alpha = this.tutorialAlpha;
      if (this.tutorialAlpha >= 1) {
        this.tutorialPhase = 'shown';
        this.tutorialElapsed = 0;
      }
      return;
    }

    if (this.tutorialPhase === 'fadeOut') {
      this.tutorialAlpha = Math.max(0, 1 - this.tutorialElapsed / TUTORIAL_FADE_MS);
      this.tutorialLayer.alpha = this.tutorialAlpha;
      if (this.tutorialAlpha <= 0) {
        // Restore default z-order for ROLL + FTUE so they composite normally
        // for the rest of the round.
        this.tutorialLayer.visible = false;
        this.tutorialLayer.eventMode = 'none';
        this.rollButton.zIndex = 0;
        if (this.ftueHand) this.ftueHand.zIndex = 0;
        this.tutorialPhase = 'done';
        this.tutorialActive = false;
      }
      return;
    }
    // 'shown' is steady-state — no work each frame.
  }

  /** Triggered by the first ROLL tap. Idempotent. */
  private dismissTutorial(): void {
    if (this.tutorialPhase === 'fadeOut' || this.tutorialPhase === 'done') return;
    this.tutorialPhase = 'fadeOut';
    this.tutorialElapsed = 0;
  }

  /** Build the tutorial card — speech-bubble look, no tail. */
  private buildTutorialCard(): Container {
    const card = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, TUTORIAL_CARD_W, TUTORIAL_CARD_H, 28);
    bg.fill({ color: 0xfff6dc, alpha: 0.97 });
    bg.stroke({ color: 0x181008, width: 5 });
    card.addChild(bg);
    this.tutorialCardBg = bg;

    const title = new Text({ text: 'DICE BLACKJACK!', style: TUTORIAL_TITLE_STYLE });
    title.anchor.set(0.5, 0);
    title.position.set(TUTORIAL_CARD_W / 2, 28);
    card.addChild(title);

    const body = new Text({
      text: 'Roll the dice. Get as close to 21 as you dare. Beat the gambler!',
      style: TUTORIAL_BODY_STYLE,
    });
    body.anchor.set(0.5, 0);
    body.position.set(TUTORIAL_CARD_W / 2, 108);
    card.addChild(body);

    const hint = new Text({ text: 'TAP  ROLL  TO  BEGIN', style: TUTORIAL_HINT_STYLE });
    hint.anchor.set(0.5, 1);
    hint.position.set(TUTORIAL_CARD_W / 2, TUTORIAL_CARD_H - 22);
    card.addChild(hint);

    return card;
  }

  /**
   * Smooth crossfade between calm dealer (alpha 1, angry alpha 0) and angry
   * dealer (calm alpha 0, angry alpha 1). Driven by `dealerCrossfadeMs`
   * counting down to 0; the target level is `dealerAngerLevel` (0 or 1) which
   * is set when the swap is triggered.
   */
  private updateDealerCrossfade(deltaMS: number): void {
    if (this.dealerCrossfadeMs <= 0) return;
    this.dealerCrossfadeMs = Math.max(0, this.dealerCrossfadeMs - deltaMS);
    const u = 1 - this.dealerCrossfadeMs / this.DEALER_CROSSFADE_DURATION_MS;
    // We always crossfade INTO `dealerAngerLevel`. If anger=1, angry alpha
    // climbs to 1 and calm decays to 0; vice versa for anger=0.
    const target = this.dealerAngerLevel;
    const eased = 1 - Math.pow(1 - u, 3);   // ease-out cubic
    const angry = target === 1 ? eased : 1 - eased;
    if (this.dealerSprite) this.dealerSprite.alpha = 1 - angry;
    if (this.dealerAngrySprite) this.dealerAngrySprite.alpha = angry;
  }

  /** Trigger the calm → angry dealer crossfade. Idempotent. */
  private setDealerAngry(): void {
    if (this.dealerAngerLevel === 1) return;
    this.dealerAngerLevel = 1;
    this.dealerCrossfadeMs = this.DEALER_CROSSFADE_DURATION_MS;
    // Tiny reaction shake to sell the swap — small kick.
    this.screenShake(8);
  }

  /**
   * Gentle breathing pulse on the ROLL icon + caption AND a synced bob on the
   * FTUE finger pointer hovering above the button. Stops on the first tap.
   */
  private updateRollPulse(deltaMS: number): void {
    if (!this.rollPulseActive || !this.rollEnabled) {
      // Reset to neutral scale once if we just stopped.
      if (this.rollButtonSprite && this.rollButtonSprite.scale.x !== 1) {
        this.rollButtonSprite.scale.set(1);
      }
      if (this.rollButtonCaption && this.rollButtonCaption.scale.x !== 1) {
        this.rollButtonCaption.scale.set(1);
      }
      return;
    }
    this.rollPulseElapsed += deltaMS;
    // ~1.4 Hz breathing — fast enough to feel inviting but not frantic.
    const PERIOD_MS = 700;
    const AMP = 0.07;
    const phase = (this.rollPulseElapsed / PERIOD_MS) * Math.PI * 2;
    const s = 1 + Math.sin(phase) * AMP;
    this.rollButtonSprite.scale.set(s);
    this.rollButtonCaption.scale.set(s);

    // Bob the finger pointer on the same phase — it dips toward the button
    // when the button is at its "smaller" half-cycle, reads as "tap me".
    if (this.ftueHand && this.ftueHand.visible) {
      const BOB_AMP = 12;
      this.ftueHand.y = this.ftueHandBaseY + Math.sin(phase) * BOB_AMP;
    }
  }

  /**
   * Pulse on the STAND button. Fires when player score crosses the bust-risk
   * threshold (>= 19) and the player is still allowed to act — same breathing
   * cadence as the ROLL pulse, slightly stronger amplitude so the prompt to
   * "lock it in!" reads clearly. Stops on tap (see button onTap) and when the
   * state machine leaves Playing.
   */
  private updateStandPulse(deltaMS: number): void {
    const shouldPulse =
      this.standPulseActive &&
      this.standEnabled &&
      this.lastPlayerScore >= STAND_PULSE_SCORE_THRESHOLD;
    if (!shouldPulse) {
      if (this.standButtonSprite && this.standButtonSprite.scale.x !== 1) {
        this.standButtonSprite.scale.set(1);
      }
      if (this.standButtonCaption && this.standButtonCaption.scale.x !== 1) {
        this.standButtonCaption.scale.set(1);
      }
      return;
    }
    this.standPulseElapsed += deltaMS;
    const PERIOD_MS = 620;
    const AMP = 0.09;
    const phase = (this.standPulseElapsed / PERIOD_MS) * Math.PI * 2;
    const s = 1 + Math.sin(phase) * AMP;
    this.standButtonSprite.scale.set(s);
    this.standButtonCaption.scale.set(s);
  }

  /**
   * Staged fade-in for the HUD on first scene mount. Each element has its
   * own (startMs, endMs) window — they cascade so the player sees the bars
   * arrive first, then the stage/dealer, then the buttons. Each element
   * fades alpha 0→1 AND slides into place from a small offset.
   */
  private updateIntro(deltaMS: number): void {
    if (!this.introActive) return;
    this.introElapsed += deltaMS;

    // Window helper: returns 0..1 progress for [startMs..endMs] inside the
    // intro, with a quick ease-out so each element snaps into place softly.
    const win = (startMs: number, endMs: number): number => {
      if (this.introElapsed <= startMs) return 0;
      if (this.introElapsed >= endMs) return 1;
      const u = (this.introElapsed - startMs) / (endMs - startMs);
      // ease-out cubic
      return 1 - Math.pow(1 - u, 3);
    };

    // Each element: (target, startMs, endMs, slideDirection)
    // slideDirection: -1 = slides down from above, +1 = slides up from below,
    // 0 = no slide (alpha only).
    const stages: Array<[Container, number, number, number]> = [
      [this.opponentBar,  0,   320, -1],
      [this.stageSprite,  150, 500,  0],
      [this.dealerSprite, 230, 560,  0],
      [this.playerBar,    320, 680, +1],
      [this.standButton,  500, 820, +1],
      [this.rollButton,   500, 820, +1],
    ];

    for (const [el, startMs, endMs, dir] of stages) {
      if (!el) continue;
      const p = win(startMs, endMs);
      el.alpha = p;
      const base = this.introBaseY.get(el);
      if (base !== undefined && dir !== 0) {
        el.y = base + dir * INTRO_SLIDE_PX * (1 - p);
      }
    }
    // FTUE hand reveals only when the ROLL button finishes its slide-in,
    // otherwise the finger is pointing at nothing.
    if (this.ftueHand) {
      this.ftueHand.alpha = win(700, 920);
    }

    if (this.introElapsed >= INTRO_DURATION_MS) {
      // Snap to final values and disable the per-frame work.
      for (const [el] of stages) {
        if (!el) continue;
        el.alpha = 1;
        const base = this.introBaseY.get(el);
        if (base !== undefined) el.y = base;
      }
      if (this.ftueHand) this.ftueHand.alpha = 1;
      this.introActive = false;
    }
  }

  /** Cache the resting Y of every fade-in element + zero its alpha. */
  private beginIntro(): void {
    const all: Container[] = [
      this.opponentBar,
      this.stageSprite,
      this.dealerSprite,
      this.playerBar,
      this.standButton,
      this.rollButton,
    ];
    for (const el of all) {
      if (!el) continue;
      this.introBaseY.set(el, el.y);
      el.alpha = 0;
    }
    if (this.ftueHand) this.ftueHand.alpha = 0;
  }

  /** Re-capture intro base Y values after a relayout — keeps the slide-in
   *  honest if the user rotates the device mid-intro. */
  private refreshIntroBaseY(): void {
    if (!this.introActive) return;
    if (this.opponentBar)  this.introBaseY.set(this.opponentBar, this.opponentBar.y);
    if (this.stageSprite)  this.introBaseY.set(this.stageSprite, this.stageSprite.y);
    if (this.dealerSprite) this.introBaseY.set(this.dealerSprite, this.dealerSprite.y);
    if (this.playerBar)    this.introBaseY.set(this.playerBar, this.playerBar.y);
    if (this.standButton)  this.introBaseY.set(this.standButton, this.standButton.y);
    if (this.rollButton)   this.introBaseY.set(this.rollButton, this.rollButton.y);
  }

  /** Float a "BIG LUCK" / "BAD LUCK" label upward from the dice anchor. */
  private spawnLuckPopup(text: string, color: number): void {
    if (!this.luckLayer) return;
    const t = new Text({
      text,
      style: new TextStyle({
        ...LUCK_POPUP_STYLE_BASE,
        fill: color,
        stroke: { color: LUCK_STROKE_COLOR, width: LUCK_STROKE_WIDTH, join: 'round' },
      }),
    });
    t.anchor.set(0.5);
    // Spawn at the dice anchor, slightly above the dice's settle line.
    const diceAnchorX = REF_W / 2;
    const diceAnchorY = this.dice.container.y + 580;  // slightly above stage center
    // We don't have a stored "dice landing Y" here in REF coords because
    // BlackjackDice owns it — use the visible dice centroid instead.
    const positions = this.dice.getDicePositions();
    const cx = (positions[0].x + positions[1].x) / 2;
    const cy = Math.min(positions[0].y, positions[1].y) - 30;
    t.position.set(Number.isFinite(cx) ? cx : diceAnchorX, Number.isFinite(cy) ? cy : diceAnchorY);
    t.scale.set(0.7);
    this.luckLayer.addChild(t);
    this.luckPopups.push({
      text: t,
      vy: -0.18,           // px/ms (rise upward)
      life: LUCK_POPUP_LIFETIME_MS,
      maxLife: LUCK_POPUP_LIFETIME_MS,
    });
  }

  private updateLuckPopups(deltaMS: number): void {
    if (this.luckPopups.length === 0) return;
    for (let i = this.luckPopups.length - 1; i >= 0; i--) {
      const p = this.luckPopups[i];
      p.life -= deltaMS;
      const u = 1 - p.life / p.maxLife;     // 0 → 1
      // Quick pop-in scale during first 18% of life, then settle to 1.
      const popPhase = Math.min(1, u / 0.18);
      const popScale = 0.7 + 0.45 * popPhase - 0.15 * Math.max(0, (popPhase - 0.7) / 0.3);
      p.text.scale.set(popScale);
      // Rise + fade-out in the back half.
      p.text.y += p.vy * deltaMS;
      p.text.alpha = u < 0.65 ? 1 : Math.max(0, 1 - (u - 0.65) / 0.35);
      if (p.life <= 0) {
        this.luckLayer.removeChild(p.text);
        p.text.destroy();
        this.luckPopups.splice(i, 1);
      }
    }
  }

  /**
   * Map a 2-dice player roll to a luck popup, if any. Only HIGH rolls trigger
   * a popup — the playable is a hype machine, not a gambling teach-in, so
   * negative feedback on a low roll would deflate the loop without giving
   * the player anything to react to.
   */
  private maybeShowLuckPopup(sum: number): void {
    let text: string | null = null;
    if (sum >= 12) text = 'BIG LUCK!';
    else if (sum === 11) text = 'LUCKY!';
    else if (sum === 10) text = 'NICE!';
    if (text) this.spawnLuckPopup(text, LUCK_GOOD_COLOR);
  }

  private hideFtueHand(): void {
    if (this.ftueHand) this.ftueHand.visible = false;
  }

  // ── Juice updaters ──────────────────────────────────────────────────────

  private updateFlash(deltaMS: number): void {
    if (this.flashElapsed >= FLASH_DURATION_MS) return;
    this.flashElapsed += deltaMS;
    const u = Math.min(this.flashElapsed / FLASH_DURATION_MS, 1);
    // Quick peak then fade — alpha curve: 0 → 0.55 → 0
    const peak = 0.55;
    const a = u < 0.2 ? (u / 0.2) * peak : peak * (1 - (u - 0.2) / 0.8);
    this.flashOverlay.alpha = Math.max(0, a);
  }

  private updateShake(deltaMS: number): void {
    if (this.shakeElapsed >= SCREEN_SHAKE_MS) {
      if (this.uiRoot.x !== this.uiRootBaseX || this.uiRoot.y !== this.uiRootBaseY) {
        this.uiRoot.x = this.uiRootBaseX;
        this.uiRoot.y = this.uiRootBaseY;
      }
      return;
    }
    this.shakeElapsed += deltaMS;
    const u = Math.min(this.shakeElapsed / SCREEN_SHAKE_MS, 1);
    const decay = 1 - u;
    const m = this.shakeMagnitude * decay;
    this.uiRoot.x = this.uiRootBaseX + (Math.random() - 0.5) * 2 * m;
    this.uiRoot.y = this.uiRootBaseY + (Math.random() - 0.5) * 2 * m;
  }

  private updateCoins(deltaMS: number): void {
    if (this.coins.length === 0) {
      if (this.coinLayer.visible) this.coinLayer.visible = false;
      return;
    }
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.life -= deltaMS;
      c.vy += 0.0018 * deltaMS;  // gravity
      c.sprite.position.x += c.vx * deltaMS;
      c.sprite.position.y += c.vy * deltaMS;
      c.sprite.rotation += c.va * deltaMS;
      const lifeRatio = c.life / COIN_LIFETIME_MS;
      c.sprite.alpha = Math.min(1, lifeRatio * 2);
      if (c.life <= 0 || c.sprite.position.y > this.height + 80) {
        this.coinLayer.removeChild(c.sprite);
        c.sprite.destroy();
        this.coins.splice(i, 1);
      }
    }
  }

  // ── Juice triggers ──────────────────────────────────────────────────────

  private flashRed(): void {
    this.flashElapsed = 0;
    this.flashColor = 0xff3333;
    this.redrawFlash();
  }

  /** Gold flash overlay — celebratory cousin of flashRed(). Fires on blackjack. */
  private flashGold(): void {
    this.flashElapsed = 0;
    this.flashColor = 0xffd33a;
    this.redrawFlash();
  }

  /**
   * Climactic blackjack celebration — fires when player hits exactly 21.
   * Combines: gold flash, hard screen shake, "BLACKJACK!" big-text popup
   * scaling-in over the stage, and a gold confetti burst layered over the
   * Pixi canvas. Total visual span ~1.8s, lands inside delayOnBlackjack.
   *
   * Robustness: text width is measured at scale 1 and a per-celebration
   * `safeMaxScale` is derived so the BLACKJACK text NEVER exceeds the visible
   * REF width (minus a margin). The pop-in peak and the fade-out grow cap
   * both honor it, so narrow phones (Galaxy Fold, etc.) still fit the text.
   */
  private spawnBlackjackCelebration(): void {
    // Big celebratory text — bypass the standard luck-popup style for maximum
    // impact (the luck popup tops out at scale 1.15 which doesn't sell "21").
    const style = new TextStyle({
      fontFamily: '"Luckiest Guy", Impact, "Arial Black", sans-serif',
      fontSize: 110,
      letterSpacing: 3,
      fill: 0xffd33a,
      stroke: { color: 0x3b2008, width: 12, join: 'round' },
      align: 'center',
    });
    const t = new Text({ text: 'BLACKJACK!', style });
    t.anchor.set(0.5);
    // Center horizontally on the canvas; vertically over the stage's dice
    // landing area so the celebration covers the action zone.
    t.position.set(REF_W / 2, 600);
    t.scale.set(0.3);
    t.alpha = 0;
    this.luckLayer.addChild(t);

    // Compute the screen-safe scale ceiling from the measured text width.
    // 60px margin = 30px on each side inside REF_W=720.
    const MARGIN = 60;
    const baseWidth = t.width;
    const safeMaxScale = (REF_W - MARGIN) / baseWidth;
    const POP_PEAK = Math.min(1.15, safeMaxScale);
    const FADE_GROW_MAX = Math.min(1.35, safeMaxScale);

    // Phase 1: pop-in (180ms, ease-out-back to scale POP_PEAK)
    // Phase 2: hold w/ subtle pulse (480ms)
    // Phase 3: fade-out + lift (520ms), capped at FADE_GROW_MAX
    const POP_IN_MS = 180;
    const HOLD_MS = 480;
    const FADE_MS = 520;
    const TOTAL = POP_IN_MS + HOLD_MS + FADE_MS;
    let elapsed = 0;
    const handler = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      if (elapsed <= POP_IN_MS) {
        const u = elapsed / POP_IN_MS;
        // ease-out-back equivalent
        const c1 = 1.70158;
        const c3 = c1 + 1;
        const eased = 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
        t.scale.set(0.3 + eased * (POP_PEAK - 0.3));
        t.alpha = Math.min(1, u * 2);
      } else if (elapsed <= POP_IN_MS + HOLD_MS) {
        const u = (elapsed - POP_IN_MS) / HOLD_MS;
        // Small breathing pulse during hold — bounded to stay within safe ceiling.
        const pulse = Math.sin(u * Math.PI * 4) * 0.04;
        const s = Math.min(safeMaxScale, POP_PEAK + pulse);
        t.scale.set(s);
      } else if (elapsed < TOTAL) {
        const u = (elapsed - POP_IN_MS - HOLD_MS) / FADE_MS;
        const target = POP_PEAK + (FADE_GROW_MAX - POP_PEAK) * u;
        t.scale.set(Math.min(safeMaxScale, target));
        t.y = 600 - u * 80;                    // rise
        t.alpha = Math.max(0, 1 - u);
      } else {
        this.luckLayer.removeChild(t);
        t.destroy();
        this.ticker.remove(handler);
        this.celebrationHandler = null;
      }
    };
    this.celebrationHandler = handler;
    this.ticker.add(handler);

    // Gold confetti burst layered above the Pixi canvas.
    if (typeof document !== 'undefined') {
      try {
        confetti({
          particleCount: 140,
          spread: 85,
          startVelocity: 45,
          ticks: 200,
          origin: { x: 0.5, y: 0.5 },
          scalar: 1.15,
          colors: ['#ffd33a', '#ff9c1c', '#ffeb84', '#ffffff'],
          zIndex: 9999,
        });
      } catch {
        // Decorative-only — silent degrade.
      }
    }
  }

  private screenShake(magnitude: number): void {
    this.shakeElapsed = 0;
    this.shakeMagnitude = magnitude;
  }

  private spawnCoinRain(): void {
    if (!this.coinTexture) return;
    this.coinLayer.visible = true;
    // Wave 1: tight cluster RIGHT above screen edge so coins enter immediately
    this.spawnCoinWave(COIN_COUNT_FIRST_WAVE, 0, 200, 0.32);
    // Wave 2: deeper stagger, sustains the rain
    this.coinRainTimers.push(
      setTimeout(() => this.spawnCoinWave(COIN_COUNT_SECOND_WAVE, 100, 400, 0.28), COIN_SECOND_WAVE_DELAY_MS),
    );
    // Wave 3: slower coins, fills the last gap as the end card mounts
    this.coinRainTimers.push(
      setTimeout(() => this.spawnCoinWave(COIN_COUNT_THIRD_WAVE, 200, 500, 0.22), COIN_THIRD_WAVE_DELAY_MS),
    );
  }

  /**
   * Spawn one wave of coins.
   * @param count       How many coins this wave drops.
   * @param yShallow    Smallest Y above the screen (closer = enters sooner).
   * @param yRange      How deep the wave is staggered above the screen.
   * @param speedBoost  Initial downward velocity bias (higher = faster rain).
   */
  private spawnCoinWave(count: number, yShallow: number, yRange: number, speedBoost: number): void {
    if (!this.coinTexture) return;
    const w = this.width;
    for (let i = 0; i < count; i++) {
      const s = new Sprite(this.coinTexture);
      s.anchor.set(0.5);
      s.scale.set(0.4 + Math.random() * 0.55);
      // Spread coins WIDER than the screen so they don't cluster center.
      s.position.set(
        -40 + Math.random() * (w + 80),
        -yShallow - Math.random() * yRange,
      );
      s.rotation = Math.random() * Math.PI * 2;
      this.coinLayer.addChild(s);
      this.coins.push({
        sprite: s,
        vx: (Math.random() - 0.5) * 0.22,
        vy: speedBoost + Math.random() * 0.3,
        va: (Math.random() - 0.5) * 0.018,
        life: COIN_LIFETIME_MS,
      });
    }
  }

  private updateDust(deltaMS: number): void {
    if (this.dust.length === 0) return;
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i];
      d.life -= deltaMS;
      d.vy += DUST_GRAVITY * deltaMS;
      d.sprite.position.x += d.vx * deltaMS;
      d.sprite.position.y += d.vy * deltaMS;
      // Puff grows slightly as it dissipates, then fades.
      const u = 1 - d.life / d.maxLife;          // 0 → 1 over lifetime
      const scale = d.sprite.scale.x * (1 + 0.012 * (deltaMS / 16));
      d.sprite.scale.set(scale);
      d.sprite.alpha = Math.max(0, 1 - u * u);   // quadratic fade
      if (d.life <= 0) {
        this.dustLayer.removeChild(d.sprite);
        d.sprite.destroy();
        this.dust.splice(i, 1);
      }
    }
  }

  /** Spawn a dust burst at each die's settled position (REF coords). */
  private spawnDustBurst(): void {
    if (!this.dustTexture) return;
    const positions = this.dice.getDicePositions();
    for (const p of positions) {
      this.spawnDustCluster(p.x, p.bottomY);
    }
  }

  /** @param cx visible center X of the die.
   *  @param groundY visible BOTTOM-EDGE Y of the die (where dust kicks up). */
  private spawnDustCluster(cx: number, groundY: number): void {
    if (!this.dustTexture) return;
    for (let i = 0; i < DUST_PARTICLES_PER_DIE; i++) {
      const s = new Sprite(this.dustTexture);
      s.anchor.set(0.5);
      // Half the puffs go left, half right — split-cone outward from the
      // die's footprint. The vertical component is small (skim the ground).
      const leftward = i < DUST_PARTICLES_PER_DIE / 2;
      const sideSign = leftward ? -1 : +1;
      // Angle inside a narrow 60° cone tilted slightly upward off horizontal.
      // Horizontal = 0; up = -PI/2. We aim around -15° from horizontal.
      const baseAngle = sideSign === -1 ? Math.PI : 0;
      const spread = (Math.random() - 0.5) * (Math.PI / 6);   // ±30°
      const upTilt = -Math.PI / 12 * Math.random();           // 0…-15°
      const angle = baseAngle + spread + upTilt * sideSign;
      const speed = DUST_SPEED * (0.55 + Math.random() * 0.45);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const scale = DUST_START_SCALE_MIN + Math.random() * (DUST_START_SCALE_MAX - DUST_START_SCALE_MIN);
      s.scale.set(scale);
      // Spawn jitter is narrow horizontally and tight to the ground line.
      s.position.set(
        cx + sideSign * (4 + Math.random() * 6),     // small offset off-center
        groundY + (Math.random() - 0.5) * 3,
      );
      s.alpha = 0.92;
      this.dustLayer.addChild(s);
      this.dust.push({
        sprite: s,
        vx, vy,
        life: DUST_LIFETIME_MS,
        maxLife: DUST_LIFETIME_MS,
      });
    }
  }

  private bakeDustTexture(): Texture {
    // Soft warm-grey puff — multiple translucent rings stacked for a fluffy
    // edge. Looks like kicked-up dirt against the stone stage.
    const g = new Graphics();
    g.circle(0, 0, 22).fill({ color: 0xb8a48a, alpha: 0.16 });
    g.circle(0, 0, 16).fill({ color: 0xc9b89e, alpha: 0.32 });
    g.circle(0, 0, 11).fill({ color: 0xe2d5be, alpha: 0.55 });
    g.circle(0, 0, 6).fill({ color: 0xf0e6d2, alpha: 0.85 });
    const tex = this.renderer.generateTexture({ target: g, resolution: 2, antialias: true });
    g.destroy();
    return tex;
  }

  private redrawFlash(): void {
    this.flashOverlay.clear();
    this.flashOverlay.rect(0, 0, this.width, this.height).fill({ color: this.flashColor });
  }

  /** Fade the bubble in for DIALOGUE_VISIBLE_MS then fade it back out. */
  private updateDialogue(deltaMS: number): void {
    if (!this.dialogueVisible && this.dialogueBubble.alpha === 0) return;
    this.dialogueElapsed += deltaMS;

    // Fade-in window
    if (this.dialogueElapsed <= DIALOGUE_FADE_MS) {
      const a = this.dialogueElapsed / DIALOGUE_FADE_MS;
      this.dialogueBubble.alpha = a;
      this.dialogueText.alpha = a;
      return;
    }
    // Hold
    if (this.dialogueElapsed <= DIALOGUE_VISIBLE_MS - DIALOGUE_FADE_MS) {
      this.dialogueBubble.alpha = 1;
      this.dialogueText.alpha = 1;
      return;
    }
    // Fade-out window
    if (this.dialogueElapsed < DIALOGUE_VISIBLE_MS) {
      const a = 1 - (this.dialogueElapsed - (DIALOGUE_VISIBLE_MS - DIALOGUE_FADE_MS)) / DIALOGUE_FADE_MS;
      this.dialogueBubble.alpha = a;
      this.dialogueText.alpha = a;
      return;
    }
    // Done
    this.dialogueBubble.alpha = 0;
    this.dialogueText.alpha = 0;
    this.dialogueVisible = false;
  }

  /**
   * Show a dialogue line — restarts the 2.8s fade-in/hold/fade-out cycle.
   * Resizes the bubble to fit the rendered text so long lines (e.g. the
   * "Double or nothin'" challenge prompt) never overflow.
   */
  private showDialogue(text: string): void {
    this.dialogueText.text = text;
    this.fitBubbleToText();
    this.drawDialogueBubble();
    this.positionDialogueBubble();
    this.dialogueElapsed = 0;
    this.dialogueVisible = true;
  }

  /**
   * Recompute bubbleWidth/bubbleHeight from the currently-set dialogue text.
   * Uses Pixi's measured text width/height (which already accounts for
   * wordWrapWidth in DIALOGUE_STYLE) plus padding.
   */
  private fitBubbleToText(): void {
    const PADDING_X = 24;
    const PADDING_Y = 18;
    const MIN_W = 230;
    const MIN_H = 92;
    // dialogueText.width/height reflect the WRAPPED, RENDERED size.
    const textW = this.dialogueText.width;
    const textH = this.dialogueText.height;
    this.bubbleWidth = Math.max(MIN_W, Math.ceil(textW + PADDING_X * 2));
    this.bubbleHeight = Math.max(MIN_H, Math.ceil(textH + PADDING_Y * 2));
  }

  /**
   * Anchor the bubble (and its centered text) UP-LEFT of the dealer's face
   * using the cached dealer geometry. Called from relayout() AND showDialogue()
   * so a long line repositions the bubble cleanly without waiting for a resize.
   */
  private positionDialogueBubble(): void {
    if (!this.dialogueBubble) return;
    const bubbleX = this.dealerLeftEdgeRef - this.bubbleWidth - 8;
    const bubbleY = this.dealerHeadYRef - this.bubbleHeight - 10;
    this.dialogueBubble.position.set(bubbleX, bubbleY);
    this.dialogueText.position.set(bubbleX + this.bubbleWidth / 2, bubbleY + this.bubbleHeight / 2);
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
    this.relayout();
  }

  // ── internals ───────────────────────────────────────────────────────────

  private relayout(): void {
    // 1) Letterbox fallback (only visible while bg texture is still loading)
    this.bgFill.clear();
    this.bgFill.rect(0, 0, this.width, this.height).fill({ color: 0x0b1a18 });

    // Compute everything via the pure layout function (also unit-tested).
    const L = computeLayout(this.width, this.height);

    // 2) Background — aspect-FILL the viewport.
    if (this.bgSprite && this.bgSprite.texture) {
      const tex = this.bgSprite.texture;
      const bg = L.background(tex.width, tex.height);
      this.bgSprite.scale.set(bg.scale);
      this.bgSprite.position.set(bg.center.x, bg.center.y);
    }

    // 3) UI root scaled + positioned
    this.uiRoot.scale.set(L.uiScale);
    this.uiRootBaseX = L.uiOffset.x;
    this.uiRootBaseY = L.uiOffset.y;
    this.uiRoot.x = this.uiRootBaseX;
    this.uiRoot.y = this.uiRootBaseY;

    // 3b) Static stage layer mirrors uiRoot's BASE transform — same scale,
    // same offset — so the stage sprite renders in the same screen position
    // as if it were inside uiRoot. Screen shake mutates uiRoot.x/y only,
    // leaving this layer rock-steady.
    this.staticStageLayer.scale.set(L.uiScale);
    this.staticStageLayer.x = this.uiRootBaseX;
    this.staticStageLayer.y = this.uiRootBaseY;

    // 4) Bottom-anchored UI placed via layout snapshot
    this.opponentBar.position.set(L.opponentBar.x, L.opponentBar.y);
    this.playerBar.position.set(L.playerBar.x, L.playerBar.y);
    this.standButton.position.set(L.standButton.x, L.standButton.y);
    this.rollButton.position.set(L.rollButton.x, L.rollButton.y);
    if (this.ftueHand) {
      this.ftueHandBaseX = L.ftueHand.x;
      this.ftueHandBaseY = L.ftueHand.y;
      this.ftueHand.position.set(L.ftueHand.x, L.ftueHand.y);
    }
    this.stageSprite.position.set(L.stage.x, L.stage.y);
    this.dice.setAnchor(L.diceAnchor.x, L.diceAnchor.y);

    // Dealer stands above the stage, offset to the RIGHT of center so he
    // clears the opponent bar's score readout instead of sitting on top of it.
    if (this.dealerSprite) {
      const dealerFeetY = L.stage.y - 260;
      const DEALER_X_OFFSET = 80;
      const dealerCenterX = REF_W / 2 + DEALER_X_OFFSET;
      const dealerHalfW = this.dealerSprite.width / 2;   // 170/2 = 85
      this.dealerSprite.position.set(dealerCenterX, dealerFeetY);
      if (this.dealerAngrySprite) {
        this.dealerAngrySprite.position.set(dealerCenterX, dealerFeetY);
      }

      // Dialogue bubble — pointed at the dealer's face. Dealer is 255 tall
      // (anchor 0.5, 1); face sits near feetY - 200. The bubble lives UP-LEFT
      // of his head, tail pointing down-right into the face.
      this.dealerHeadYRef = dealerFeetY - 200;
      this.dealerLeftEdgeRef = dealerCenterX - dealerHalfW;
      this.positionDialogueBubble();
    }

    // 5) Flash overlay covers the full screen.
    if (this.flashOverlay) this.redrawFlash();

    // 5b) PostGame UI — coin badge top-left + Claim/Challenge buttons occupying
    // the exact Roll/Stand slot (the live game does the same swap). Pass the
    // Roll button Y as the button-row Y so the swap is pixel-aligned, and the
    // dealer head Y so the "+N" win popup floats above his head.
    if (this.postGameUI) {
      const dealerFeetY = L.stage.y - 260;
      const dealerHeadY = dealerFeetY - 200;
      this.postGameUI.applyLayout(L.rollButton.y, dealerHeadY);
    }

    // 6) Tutorial overlay — dim covers the whole REF canvas plus generous
    // bleed (uiRoot is letterbox-fitted; the bleed makes sure the dim still
    // reaches the viewport corners on wide aspect ratios). Card sits in the
    // upper-middle so the lower half (with ROLL + FTUE) reads clearly.
    if (this.tutorialDim) {
      const BLEED = 2000;
      this.tutorialDim.clear();
      this.tutorialDim
        .rect(-BLEED, -BLEED, REF_W + BLEED * 2, L.effectiveRefH + BLEED * 2)
        .fill({ color: 0x07090a, alpha: 0.72 });
    }
    if (this.tutorialCard) {
      const cardX = (REF_W - TUTORIAL_CARD_W) / 2;
      const cardY = 240;
      this.tutorialCard.position.set(cardX, cardY);
    }

    // 7) If we're mid-intro and the viewport changed (rotation, address-bar
    // collapse), the slide-in offsets reference stale Y values — refresh.
    this.refreshIntroBaseY();
  }

  private drawDialogueBubble(): void {
    const w = this.bubbleWidth;
    const h = this.bubbleHeight;
    this.dialogueBubble.clear();
    this.dialogueBubble.roundRect(0, 0, w, h, 18);
    this.dialogueBubble.fill({ color: 0xfff6dc, alpha: 0.96 });
    this.dialogueBubble.stroke({ color: 0x181008, width: 4 });
    // Tail extends from the BOTTOM-RIGHT corner pointing DOWN-RIGHT into the
    // dealer's face (who sits below+right of the bubble).
    this.dialogueBubble.poly([
      w - 60, h,         // bubble bottom edge, slightly inside
      w + 30, h + 48,    // tail tip (down-right of bubble corner)
      w - 10, h,         // bubble bottom edge, closer to corner
    ]);
    this.dialogueBubble.fill({ color: 0xfff6dc, alpha: 0.96 });
    this.dialogueBubble.stroke({ color: 0x181008, width: 4 });
  }

  private makeIconButton(tex: Texture, label: string, onTap: () => void): Container {
    const root = new Container();
    root.eventMode = 'static';
    root.cursor = 'pointer';

    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.width = 150;
    sprite.height = 150;
    root.addChild(sprite);

    const cap = new Text({ text: label, style: BUTTON_LABEL_STYLE });
    cap.anchor.set(0.5);
    cap.y = 90;
    root.addChild(cap);

    const HOVER = 1.06;
    const resetScale = () => sprite.scale.set(1);
    root.on('pointerover',     () => { if (root.alpha === 1 && root.eventMode === 'static') sprite.scale.set(HOVER); });
    root.on('pointerout',      resetScale);
    root.on('pointerleave',    resetScale);
    root.on('pointerupoutside', resetScale);
    root.on('pointercancel',   resetScale);
    root.on('pointertap', () => {
      if (root.alpha < 1) return;
      onTap();
      resetScale();
    });

    return root;
  }

  private setButtonEnabled(btn: Container, enabled: boolean): void {
    btn.alpha = enabled ? 1 : 0.45;
    btn.eventMode = enabled ? 'static' : 'none';
    btn.cursor = enabled ? 'pointer' : 'default';
    const sprite = btn.children[0] as Sprite | undefined;
    if (sprite && 'scale' in sprite) sprite.scale.set(1);
  }

  private applyButtonState(): void {
    this.setButtonEnabled(this.rollButton, this.rollEnabled);
    this.setButtonEnabled(this.standButton, this.standEnabled);
  }

  /**
   * Show or hide BOTH Roll and Stand buttons completely (alpha + event mode).
   * Called on state transitions so the PostGame UI can own the bottom slot
   * during the Claim/Challenge moment without ghost buttons underneath.
   */
  private setPlayButtonsVisible(visible: boolean): void {
    if (!this.rollButton) return;
    this.rollButton.visible = visible;
    this.standButton.visible = visible;
    this.rollButton.eventMode = visible ? 'static' : 'none';
    this.standButton.eventMode = visible ? 'static' : 'none';
    if (!visible) {
      // Stop the pulses so they don't keep ticking while invisible.
      this.rollPulseActive = false;
      this.standPulseActive = false;
    }
  }

  /**
   * Reset the score bars + dice so a Challenge-accepted round starts clean.
   * The Sequence already fires onScoreChange(0) for both sides which makes
   * the bars drain — but we also reset the player-score-derived UI state here
   * so the STAND pulse doesn't carry over from the prior round.
   */
  private resetForNextRound(): void {
    this.lastPlayerScore = 0;
    this.standPulseActive = false;
    this.rollPulseActive = true;
    this.rollPulseElapsed = 0;
  }

  private makeListener(): SequenceListener {
    return {
      onStateChange: (state: SequenceState) => {
        const playing = state === 'Playing';
        this.rollEnabled = playing;
        this.standEnabled = playing && this.lastPlayerScore > 0;
        // Hide Roll/Stand completely whenever we're NOT Playing — the
        // PostGame Claim/Challenge buttons sit in their exact slot and we
        // don't want the disabled-grey stack peeking through underneath.
        this.setPlayButtonsVisible(playing);
        this.applyButtonState();
      },
      onDialogue: (key: DialogueKey, text: string) => {
        if (key === 'opponent_turn') {
          if (!this.embedded) alTrack('CHALLENGE_PASS_50');
          // The player's turn just ended → gambler reacts now (was on win).
          this.setDealerAngry();
        }
        // Suppress the dealer's opening greeting while the tutorial card is
        // up — two speech bubbles competing for attention reads as noise.
        if (key === 'start' && this.tutorialActive) return;
        this.showDialogue(text);
      },
      onScoreChange: (side: Side, score: number) => {
        // Bar-fill sfx — escalating "rise" tone from the SoundPack01 ladder.
        // The closer the side's score gets to 21, the higher the chirp; busts
        // skip the rise (the lose sfx fires next anyway). Volume kept moderate
        // so it sits under the dice-roll rattle that just played.
        if (score > 0 && score <= this.script.round.maxScore) {
          // Rise sfx volume dropped from 0.6 → 0.4 because the snappier pace
          // means consecutive rises now stack closer together — 0.6 read as
          // muddy/loud, 0.4 sits cleanly under the dice rattle.
          blackjackSfx.rise(score, this.script.round.maxScore, 0.4);
        }
        if (side === 'player') {
          this.lastPlayerScore = score;
          this.playerBar.setScore(score);
          this.standEnabled = score > 0 && this.rollEnabled;
          // Trigger the STAND pulse once the player crosses into bust-risk
          // territory — "you're close, lock it in!" prompt.
          if (score >= STAND_PULSE_SCORE_THRESHOLD && score <= this.script.round.maxScore) {
            if (!this.standPulseActive) {
              this.standPulseActive = true;
              this.standPulseElapsed = 0;
            }
          } else {
            this.standPulseActive = false;
          }
          this.applyButtonState();
        } else {
          this.opponentBar.setScore(score);
        }
      },
      onDiceRoll: async (side: Side, faces: DiceFaces) => {
        // Dice rattle starts at the moment the cubes hit the air.
        sfx.diceRoll();
        await this.dice.throw(faces[0], faces[1]);
        // Ground-impact puff at each die's landing point.
        this.spawnDustBurst();
        // Luck popup (player rolls only — feels like a personal reward,
        // not a constant overlay every time the opponent rolls too).
        if (side === 'player') {
          this.maybeShowLuckPopup(faces[0] + faces[1]);
          if (!this.embedded) alTrack('CHALLENGE_PASS_25');
        }
        // Big-roll screen shake — fires the moment the dice settle, before
        // they fly into the bar. Magnitude scales with the roll value so 12
        // (double 6) reads as a far harder hit than 10.
        const total = faces[0] + faces[1];
        if (total >= BIG_ROLL_THRESHOLD) {
          // 10 → 14, 11 → 20, 12 → 26
          const magnitude = 14 + (total - BIG_ROLL_THRESHOLD) * 6;
          this.screenShake(magnitude);
        }
        // Fly the dice into the active player's score bar before the bar
        // fills. The sequence will fire onScoreChange right after this
        // promise resolves, so the bar-fill tween starts as the dice land.
        // Use the bar's LIVE position — it moves on resize, so we can't
        // pre-compute a static target.
        const bar = side === 'player' ? this.playerBar : this.opponentBar;
        const targetY = bar.position.y + BAR_H / 2;
        // Whoosh sfx — fires when the dice begin their suction-fly toward
        // the bar. Air_Move.wav, dropped in via sfx-blackjack.
        // Whoosh sfx volume dropped 0.7 → 0.55 to match the shorter fly time
        // (200ms suction is barely audible at 0.7, the snap reads better at 0.55).
        blackjackSfx.airMove(0.55);
        await this.dice.flyAway(REF_W / 2, targetY);
        // Bar squashes the instant the dice land (cause→effect feel).
        bar.notifyImpact();
      },
      onBust: (_side: Side) => {
        blackjackSfx.lose();
        // Full-screen red flash + extra hard screen shake on top of the bar's
        // own internal bust shake (which is per-bar).
        this.flashRed();
        this.screenShake(20);
      },
      onBlackjack: () => {
        blackjackSfx.twentyOne();
        // Full celebration ladder: hard screen shake, gold flash, big
        // "BLACKJACK!" popup text, gold confetti burst. The bar's own gold
        // pulse from setScore(21) lands on top of this stack.
        this.screenShake(18);
        this.flashGold();
        this.spawnBlackjackCelebration();
      },
      onWin: () => {
        if (!this.embedded) alTrack('CHALLENGE_PASS_75');
        blackjackSfx.win();
        // (Angry crossfade already fired at opponent_turn — keep him angry.)
        // NOTE: coin-rain + done-resolve moved to onClaim — winning a round
        // no longer ends the scene. The PostGameUI handles the reveal.
      },
      onLose: () => {
        if (!this.embedded) alTrack('CHALLENGE_PASS_75');
        blackjackSfx.lose();
        setTimeout(() => this.resolveDone(), RESOLVE_DELAY_MS);
      },
      onRoundWin: (round: number, _coinsThisRound: number, totalCoins: number) => {
        const totalRounds = this.script.rounds.length;
        const isFinalRound = round >= totalRounds - 1;
        // On the final round, Sequence will auto-fire onClaim right after
        // onRoundWin — we don't want to flash the buttons in the meantime, so
        // pass nextRoundCoins=null to keep them hidden.
        const nextRoundCoins = isFinalRound ? null : this.script.rounds[round + 1].coins;
        void this.postGameUI.countUpTo(totalCoins, nextRoundCoins);
      },
      onChallengeAccepted: (_round: number, _nextReward: number) => {
        // Buttons hide immediately so they don't catch a stray double-tap
        // during the round transition.
        this.postGameUI.hideButtons();
        // Bars are reset by Sequence firing onScoreChange(0) for both sides
        // right before this — LoadBar.setScore(0) handles the visual drain.
        // Reset the dealer to calm for the new round + clear stale pulse state.
        this.setDealerCalm();
        this.resetForNextRound();
      },
      onClaim: (totalCoins: number) => {
        if (!this.embedded) alTrack('CHALLENGE_PASS_75');
        blackjackSfx.win();
        this.postGameUI.hideButtons();
        // Sync the HUD to the final total in case onClaim arrives via the
        // auto-claim path before the count-up tween completed (e.g. on
        // back-to-back wins in the final round).
        this.postGameUI.setCoinsImmediate(totalCoins);
        this.spawnCoinRain();
        this.fireConfettiBurst();
        setTimeout(() => this.resolveDone(), RESOLVE_DELAY_MS);
      },
      onLoseAll: (_lostTotal: number) => {
        if (!this.embedded) alTrack('CHALLENGE_PASS_75');
        blackjackSfx.lose();
        this.flashRed();
        this.screenShake(24);
        this.setDealerAngry();
        // Drain the coin counter so the loss is unambiguous, THEN resolve.
        void this.postGameUI.drainToZero().then(() => {
          setTimeout(() => this.resolveDone(), this.script.timings.loseAllDrainMs);
        });
      },
    };
  }

  /**
   * Fire a celebratory confetti burst layered over the Pixi canvas. Uses
   * canvas-confetti (~4 KB gz) — fire-and-forget, manages its own canvas, no
   * Pixi coupling. SSR-safe: guarded for environments without `document`.
   */
  private fireConfettiBurst(): void {
    if (typeof document === 'undefined') return;
    try {
      confetti({
        particleCount: 180,
        spread: 95,
        startVelocity: 42,
        ticks: 220,
        origin: { x: 0.5, y: 0.55 },
        scalar: 1.1,
        zIndex: 9999,
      });
      // Side-bursts a beat later for a "the room is full of confetti" feel.
      setTimeout(() => {
        confetti({
          particleCount: 80,
          spread: 70,
          startVelocity: 38,
          origin: { x: 0.15, y: 0.65 },
          angle: 60,
          ticks: 200,
          zIndex: 9999,
        });
        confetti({
          particleCount: 80,
          spread: 70,
          startVelocity: 38,
          origin: { x: 0.85, y: 0.65 },
          angle: 120,
          ticks: 200,
          zIndex: 9999,
        });
      }, 220);
    } catch {
      // Confetti is purely decorative — any failure (canvas blocked,
      // memory pressure) silently degrades to "no confetti".
    }
  }

  /** Reset the dealer to the calm portrait (used after a successful challenge). */
  private setDealerCalm(): void {
    if (this.dealerAngerLevel === 0) return;
    this.dealerAngerLevel = 0;
    this.dealerCrossfadeMs = this.DEALER_CROSSFADE_DURATION_MS;
  }
}

// Alias for codegen: board-fight defines its own (different) `BlackjackScene`,
// so the host imports this one under a distinct name to avoid a collision.
export { BlackjackScene as DiceBlackjackScene };

/**
 * Resolve once the bundled webfonts (Luckiest Guy + Bangers) have been parsed
 * by the browser. Without this, the first PixiJS Text gets rendered with the
 * fallback font and the glyph atlas is cached — the real font then never
 * shows up. `document.fonts.load(...)` returns a promise per family.
 *
 * Gracefully degrades on browsers without the FontFace API: we just resolve
 * immediately, and Pixi falls back to the next family in the stack.
 */
let fontsReady: Promise<void> | null = null;
function ensureFontsLoaded(): Promise<void> {
  if (fontsReady) return fontsReady;
  if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) {
    fontsReady = Promise.resolve();
    return fontsReady;
  }
  fontsReady = Promise.all([
    document.fonts.load('40px "Luckiest Guy"'),
    document.fonts.load('28px "Bangers"'),
  ])
    .then(() => undefined)
    // If the woff2 fetch fails we still want the playable to render — let
    // Pixi fall through to the system-font fallback rather than hanging.
    .catch(() => undefined);
  return fontsReady;
}
