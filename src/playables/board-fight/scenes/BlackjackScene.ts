import { Assets, Container, Graphics, Renderer, Sprite, Text, TextStyle, Texture, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import type { PlayerState, StatDelta } from '../PlayerState';
import { tween, delay } from '@shared/tween';
import * as sfx from '../sfx';
import { blackjackSfx } from '../sfx-blackjack';
import { SpinButton } from '../ui/SpinButton';
import { bakeFaceTextures } from '../dicePips';
import { Die3D, DieTrack } from '../Die3D';
import diceAnimData from '../data/diceAnimations.json';

import bgData from 'assets/tiles/blackjack_bg.webp';
import gamblerData from 'assets/tiles/blackjack_gambler.webp';
import stageData from 'assets/tiles/blackjack_stage.webp';
import coinIconData from 'assets/UI/Coin.webp';

interface DiceClipData {
  name: string;
  duration: number;
  animationLength: number;
  die1: DieTrack;
  die2: DieTrack;
}
const DICE_CLIPS: DiceClipData[] = (JSON.parse(diceAnimData as unknown as string) as { clips: DiceClipData[] }).clips;
// Dice flight — match BoardDice trajectory feel; CUBE_HALF bumped for blackjack so
// the dice read large in their cells (the board's dice live at the player-token's
// scale, but blackjack's dice are the focal element of the screen).
const DICE_CUBE_HALF = 42;       // larger than BoardDice's 24 — fills the cell well
const DICE_PLAYBACK_RATE = 2.0;  // BoardDice: 2.0 (animator m_Speed: 2)
const DICE_POS_SCALE = 45;       // BoardDice: 45

// ───────────────────────── Constants (from DiceBlackjackSequence.cs) ──────────

const REF_W = 1080;
const REF_H = 1920;
const TARGET_SCORE = 21;

// Per-Unity inspector values on DiceBlackjackSequence.
const DELAY_BETWEEN_PLAYER_ROLLS_MS = 100;
const DELAY_BETWEEN_OPPONENT_ROLLS_MS = 750;
const DELAY_ON_BLACKJACK_MS = 2000;
const DELAY_ON_WIN_MS = 2000;
const DELAY_ON_LOSE_MS = 2000;

// Player and opponent dice spin durations (DiceBlocksUI _rollTimeMin/_rollTimeMax).
const PLAYER_ROLL_MS = 1000;
const OPPONENT_ROLL_MS = 660;

const TYPEWRITER_MS_PER_CHAR = 30;

// Entry animations (mirror Unity Fade_In + Scale_In).
const ENTRY_FADE_MS = 167;
const ENTRY_SCALE_MS = 167;

// Round configuration — Unity defaults baked in.
interface RoundCfg {
  rewardCoins: number;
  multiplierLabel: string;
  retryLosingRollCount: number;
  retryChance: number;
}
const DEFAULT_ROUNDS: RoundCfg[] = [
  { rewardCoins:  80, multiplierLabel: '1x', retryLosingRollCount: 2, retryChance: 1.0 },
  { rewardCoins: 160, multiplierLabel: '2x', retryLosingRollCount: 1, retryChance: 0.5 },
  { rewardCoins: 240, multiplierLabel: '3x', retryLosingRollCount: 0, retryChance: 0   },
  { rewardCoins: 320, multiplierLabel: '4x', retryLosingRollCount: 0, retryChance: 0   },
  { rewardCoins: 400, multiplierLabel: '5x', retryLosingRollCount: 0, retryChance: 0   },
  { rewardCoins: 480, multiplierLabel: '6x', retryLosingRollCount: 0, retryChance: 0   },
];

// Unity HUD palette (sampled from BattleDice_HUD.prefab Image colors).
// Both score pills share a single translucent-black BG (not lavender vs slate).
const PILL_BG_COLOR = 0x000000;
const PILL_BG_ALPHA = 0.502;
const SCORE_TEXT_COLOR = 0xFFFFFF;      // Unity score text is plain white
const TITLE_RED = 0xFE4D65;             // "Don't go over 21!" rich-text span color
const CHAT_BUBBLE_FILL = 0xFFFFFF;
const CHAT_BUBBLE_STROKE = 0x000000;
const CHAT_BUBBLE_TEXT_COLOR = 0x000000;
const STREAK_PANEL_FILL = 0x3B2F4F;     // dark slate panel at the win-streak strip
const STREAK_PANEL_ALPHA = 0.92;
const REWARD_STRIP_FILL = 0x3B2F4F;
const REWARD_STRIP_ALPHA = 0.85;

// Unity reference-frame layout (canvas 1080×1920, Y-up; PIXI Y-down via negation).
//
// HUD has TWO coordinate scopes:
//   • Top-level (canvas-relative): backdrop, title, current-reward, play-button row, streak panel
//   • Inner Container (main game zone): gambler, chat, dice rows, score pills.
//     Inner Container origin is offset (0, +63 PIXI) from canvas center.
//
// Element positions below are scene-local PIXI coords inside `sceneUnit`
// (sceneUnit lives at canvas-center and is scaled by vScale).
const INNER_OFFSET_Y = 63;

// Inner container elements
const GAMBLER_X = 235.65;
const GAMBLER_Y = -243.99 + INNER_OFFSET_Y;          // ≈ -181
const GAMBLER_W = 332;
const GAMBLER_H = 498;
// Unity m_Pivot Y=0.206 measures from the bottom; PIXI anchor.y measures from the top —
// so the equivalent PIXI anchor is 1 - 0.206 = 0.794 (pivot near-bottom of sprite).
const GAMBLER_PIVOT_Y = 0.794;

const CHAT_X = -150.91;
const CHAT_Y = -498 + INNER_OFFSET_Y;                // ≈ -435
const CHAT_W = 494;
const CHAT_H = 159;

const DICE_ROW_X = 0;
const DICE_ROW_Y = 0 + INNER_OFFSET_Y;               // ≈ +63
const DICE_LOCAL_X = 75;                             // ±75 each die from row center
const DICE_LOCAL_Y = -20;                            // shifted up so dice sit higher on the stage
const DICE_RESULT_Y = -180;                          // sum text well above dice

const PLAYER_PILL_X = -6;
const PLAYER_PILL_Y = 468 + INNER_OFFSET_Y;          // ≈ +531
const PLAYER_PILL_W = 304;
const PILL_H = 100;
const OPPONENT_PILL_X = -169;
const OPPONENT_PILL_Y = -321 + INNER_OFFSET_Y;       // ≈ -258
const OPPONENT_PILL_W = 417;

// Top-level (canvas-relative) elements
const TITLE_X = 0;
const TITLE_Y = 665;                                  // Unity -665 → PIXI +665
const TITLE_W = 796;

const REWARD_STRIP_X = 0;
const REWARD_STRIP_Y = -707;                          // Unity +707 → PIXI -707
const REWARD_STRIP_W = 380;
const REWARD_STRIP_H = 104;

const PLAY_ROW_Y = 887;                               // Unity -887 → PIXI +887
const PLAY_ROW_W = 886;
const PLAY_BTN_W = 410;                               // ~half row width
const PLAY_BTN_H = 130;

const STREAK_PANEL_X = 0;
const STREAK_PANEL_Y = 960;                           // Unity -960 → PIXI +960 (pivot bottom)
const STREAK_PANEL_W = 886;
const STREAK_PANEL_H = 400;

// ───────────────────────── Public types ─────────────────────────

export interface BlackjackSceneConfig {
  /** 0..5; default 0. Skips ahead to the given streak (for testing higher rounds). */
  startingStreak?: number;
  /** Per-round overrides. Defaults to Unity's 6-round table. */
  rounds?: RoundCfg[];
  /** Forced player rolls — each entry is [d1, d2]. Replaces RNG when set. */
  forcedPlayerRolls?: number[][];
  /** Forced opponent rolls — each entry is [d1, d2]. Replaces RNG when set. */
  forcedOpponentRolls?: number[][];
}

type GameState = 'Playing' | 'PostGame' | 'Finished';

// ───────────────────────── Scene ─────────────────────────

export class BlackjackScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private config: BlackjackSceneConfig;
  // PlayerState passes through applyStatDelta — held here for lifecycle parity but unused inside.
  private state!: PlayerState;
  private ticker: Ticker;
  private renderer: Renderer;
  private width: number;
  private height: number;
  private applyStatDelta: (delta: StatDelta) => StatDelta;

  private ready = false;
  private disposed = false;

  // Game state.
  private rounds: RoundCfg[];
  private currentStreak = 0;
  private gameState: GameState = 'Playing';
  private playerScore = 0;
  private opponentScore = 0;
  private playerRollIndex = 0;
  private opponentRollIndex = 0;
  /** Pending forced rolls — pop-and-consume queues. */
  private forcedPlayerRolls: number[][];
  private forcedOpponentRolls: number[][];
  /** Per-round retry counter (mirrors `_rerollAmount` in Unity). */
  private rerollAmount = 0;

  // Display tree.
  private bgFlat!: Graphics;
  private bgSprite?: Sprite;
  private dimOverlay!: Graphics;
  private currentVScale = 1;

  private sceneUnit!: Container;
  private diceStage?: Sprite;
  private gamblerContainer!: Container;
  private gamblerSprite?: Sprite;
  private gamblerAnimT = 0;
  private chatBubble!: Container;
  private chatBubbleText!: Text;
  /** Active typewriter token — old typewriters check this and abort if mismatched. */
  private typewriterToken = 0;

  private playerPill!: Container;
  private playerPillScoreText!: Text;
  private opponentPill!: Container;
  private opponentPillScoreText!: Text;

  private titleText!: Text;
  private titleAccentText!: Text;
  private currentRewardStrip!: Container;
  private currentRewardLabel!: Text;
  private currentRewardAmount!: Text;
  private currentRewardCoinIcon?: Sprite;
  private coinTexture?: Texture;
  private streakPanel!: Container;
  private streakDescriptionText!: Text;
  private streakMultiplierText!: Text;

  private playerDice!: Container;
  private playerDie3D: Die3D[] = [];
  private opponentDice!: Container;
  private opponentDie3D: Die3D[] = [];
  /** [1..6] face textures, baked once via bakeFaceTextures(). */
  private faceTextures: Texture[] = [];

  // Buttons (root-level, screen-anchored — same pattern as SpinButton in LuckyWheel).
  private rollButton!: SpinButton;
  private standButton!: SpinButton;
  private claimButton!: SpinButton;
  private challengeButton!: SpinButton;

  constructor(
    config: BlackjackSceneConfig,
    state: PlayerState,
    ticker: Ticker,
    renderer: Renderer,
    width: number,
    height: number,
    applyStatDelta: (delta: StatDelta) => StatDelta,
  ) {
    this.container = new Container();
    this.config = config;
    this.state = state;
    this.ticker = ticker;
    this.renderer = renderer;
    this.width = width;
    this.height = height;
    this.applyStatDelta = applyStatDelta;
    this.rounds = config.rounds ?? DEFAULT_ROUNDS;
    this.currentStreak = Math.min(config.startingStreak ?? 0, this.rounds.length - 1);
    this.forcedPlayerRolls = (config.forcedPlayerRolls ?? []).map(r => [...r]);
    this.forcedOpponentRolls = (config.forcedOpponentRolls ?? []).map(r => [...r]);
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    // Bake d1..d6 face textures procedurally — no PNG asset needed (per dicePips.ts).
    this.faceTextures = bakeFaceTextures(this.renderer);

    // Coin icon for the reward strip — loaded eagerly so buildRewardStrip can use it.
    try {
      this.coinTexture = await Assets.load(coinIconData) as Texture;
    } catch {
      this.coinTexture = undefined;
    }
    if (this.disposed) return;

    // ── BG layer ──
    this.bgFlat = new Graphics();
    this.container.addChild(this.bgFlat);
    try {
      const bgTex = await Assets.load(bgData);
      if (this.disposed) return;
      this.bgSprite = new Sprite(bgTex as Texture);
      this.bgSprite.anchor.set(0.5);
      this.container.addChild(this.bgSprite);
    } catch {
      this.bgSprite = undefined;
    }

    // ── Dim overlay (Unity rgba(0,0,0,0.502) — fades in via Fade_In.anim) ──
    this.dimOverlay = new Graphics();
    this.dimOverlay.alpha = 0;
    this.container.addChild(this.dimOverlay);

    // ── sceneUnit master container (mirrors LuckyWheel/SlotReels pattern) ──
    this.sceneUnit = new Container();
    this.sceneUnit.scale.set(0); // scale-in via entry anim
    this.container.addChild(this.sceneUnit);

    // ── Dice stage platter — Unity DiceBG (BattleDice_Stage.png), behind the dice rows
    //    Stretches across most of the inner Container. Sits BEHIND PlayerDice/EnemyDice. ──
    try {
      const stageTex = await Assets.load(stageData);
      if (this.disposed) return;
      const sp = new Sprite(stageTex as Texture);
      sp.anchor.set(0.5);
      this.diceStage = sp;
      this.sceneUnit.addChild(sp);
    } catch {
      // No stage; dice still render fine without it.
    }

    // ── Gambler dealer ──
    // Unity: anchor pivot (0.5, 0.206) — near-bottom — at sizeDelta 332×498. We render
    // the texture with a bottom-center pivot for simplicity (the difference is ≈100 px
    // of head room, swallowed by the sprite's transparent margin).
    this.gamblerContainer = new Container();
    try {
      const tex = await Assets.load(gamblerData);
      if (this.disposed) return;
      const sp = new Sprite(tex as Texture);
      sp.anchor.set(0.5, GAMBLER_PIVOT_Y);
      const th = sp.texture.height || 1;
      sp.scale.set(GAMBLER_H / th);
      this.gamblerSprite = sp;
      this.gamblerContainer.addChild(sp);
    } catch {
      const fallback = new Graphics();
      fallback
        .ellipse(0, -GAMBLER_H * 0.7, GAMBLER_W * 0.35, GAMBLER_H * 0.30).fill({ color: 0x8a5a2b })
        .rect(-GAMBLER_W * 0.30, -GAMBLER_H * 0.40, GAMBLER_W * 0.60, GAMBLER_H * 0.40).fill({ color: 0x4a3010 });
      this.gamblerContainer.addChild(fallback);
    }
    this.sceneUnit.addChild(this.gamblerContainer);

    // ── Chat bubble (left of dealer, tail pointing right) ──
    this.chatBubble = this.buildChatBubble('Welcome, friend...');
    this.sceneUnit.addChild(this.chatBubble);

    // ── Score pills (translucent black, white text — Unity-faithful) ──
    const { container: ppc, scoreText: pst } = this.buildPill('Me', PLAYER_PILL_W);
    this.playerPill = ppc;
    this.playerPillScoreText = pst;
    this.sceneUnit.addChild(this.playerPill);

    const { container: opc, scoreText: ost } = this.buildPill('Gambler', OPPONENT_PILL_W);
    this.opponentPill = opc;
    this.opponentPillScoreText = ost;
    this.sceneUnit.addChild(this.opponentPill);

    // ── Dice rows (both centered at inner-Container origin; opponent fades in on Stand) ──
    this.playerDice = this.buildDiceRow(this.playerDie3D);
    this.opponentDice = this.buildDiceRow(this.opponentDie3D);
    this.opponentDice.alpha = 0;
    this.sceneUnit.addChild(this.playerDice);
    this.sceneUnit.addChild(this.opponentDice);

    // ── CurrentReward strip (top of canvas — slate panel showing "{n}x  •  {coins}c") ──
    this.currentRewardStrip = this.buildRewardStrip();
    this.sceneUnit.addChild(this.currentRewardStrip);

    // ── Title block (bottom-of-canvas — two single-line texts so we can color the
    //    "Don't go over 21!" warning red without rich-text). ──
    this.titleText = new Text({
      text: 'Roll the dice and get the higher score.',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 36,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 5, join: 'round' },
        align: 'center',
        wordWrap: true,
        wordWrapWidth: TITLE_W,
      }),
    });
    this.titleText.anchor.set(0.5);
    this.sceneUnit.addChild(this.titleText);

    this.titleAccentText = new Text({
      text: "Don't go over 21!",
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 42,
        fontWeight: 'bold',
        fill: TITLE_RED,
        stroke: { color: 0x000000, width: 5, join: 'round' },
        align: 'center',
      }),
    });
    this.titleAccentText.anchor.set(0.5);
    this.sceneUnit.addChild(this.titleAccentText);

    // ── Buttons — all live INSIDE sceneUnit at Unity ref-frame positions so they
    //    scale with the canvas (matches Unity's CanvasScaler behavior). ──
    this.rollButton = new SpinButton({
      width: PLAY_BTN_W, height: PLAY_BTN_H, radius: 22, fontSize: 44, label: 'ROLL',
      onClick: () => { void this.onRollClicked(); },
    });
    this.standButton = new SpinButton({
      width: PLAY_BTN_W, height: PLAY_BTN_H, radius: 22, fontSize: 44, label: 'STAND',
      fillColor: 0xC85050,
      onClick: () => { void this.onStandClicked(); },
    });
    this.claimButton = new SpinButton({
      width: PLAY_BTN_W, height: PLAY_BTN_H, radius: 22, fontSize: 44, label: 'CLAIM',
      onClick: () => { void this.onClaimClicked(); },
    });
    this.challengeButton = new SpinButton({
      width: PLAY_BTN_W, height: PLAY_BTN_H, radius: 22, fontSize: 32,
      label: 'DOUBLE OR\nNOTHIN\'',
      fillColor: 0x6E45C8,
      onClick: () => { this.onChallengeClicked(); },
    });
    this.claimButton.setHidden(true);
    this.challengeButton.setHidden(true);

    // Streak panel — wraps the post-game reward summary + Claim/Challenge buttons.
    this.streakPanel = this.buildStreakPanel();
    this.streakPanel.visible = false;
    this.sceneUnit.addChild(this.streakPanel);

    // Add buttons to sceneUnit at top level so they sit above the streak panel BG
    // but still scale together.
    this.sceneUnit.addChild(this.rollButton.container);
    this.sceneUnit.addChild(this.standButton.container);
    this.sceneUnit.addChild(this.claimButton.container);
    this.sceneUnit.addChild(this.challengeButton.container);

    this.layoutAll();

    // ── Entry animations ──
    void this.playEnterAnimations();

    // Speak the intro line via typewriter.
    void this.typewriter(this.firstLine());

    this.ready = true;
    // Re-apply layout in case a resize arrived during the async load above
    // (the !ready guard would have dropped it).
    this.layout(this.width, this.height);
  }

  async exit(): Promise<void> {
    this.disposed = true;
  }

  update(deltaMS: number): void {
    if (!this.ready || this.disposed) return;
    // Gambler idle breathing — same pattern as LuckyWheel monk.
    this.gamblerAnimT = (this.gamblerAnimT + deltaMS / 2200) % 1;
    const phase = this.gamblerAnimT < 0.5 ? this.gamblerAnimT * 2 : (1 - this.gamblerAnimT) * 2;
    if (this.gamblerSprite) {
      const base = GAMBLER_H / (this.gamblerSprite.texture.height || GAMBLER_H);
      this.gamblerSprite.scale.x = base * (1 + (0.97 - 1) * phase);
      this.gamblerSprite.scale.y = base * (1 + (1.03 - 1) * phase);
    }
    this.rollButton.update(deltaMS);
    this.standButton.update(deltaMS);
    this.claimButton.update(deltaMS);
    this.challengeButton.update(deltaMS);

    // Drive 3D dice tumbles each frame.
    for (const d of this.playerDie3D) d.update(deltaMS);
    for (const d of this.opponentDie3D) d.update(deltaMS);
  }

  pause(): void { this.container.interactiveChildren = false; }
  resume(): void { this.container.interactiveChildren = true; }

  layout(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (!this.ready) return;
    this.layoutAll();
  }

  // ───────────────────────── Builders ─────────────────────────

  private buildChatBubble(initialText: string): Container {
    const c = new Container();
    const w = CHAT_W;
    const h = CHAT_H;
    const bg = new Graphics();
    bg.roundRect(-w / 2, -h / 2, w, h, 24)
      .fill({ color: CHAT_BUBBLE_FILL })
      .stroke({ color: CHAT_BUBBLE_STROKE, width: 3 });
    // Tail points DOWN-RIGHT toward the gambler. Bubble at PIXI (-151, -435), gambler
    // at (+236, -181) → tail anchored at right-bottom of bubble pointing diagonally.
    bg.moveTo(w / 2 - 30, h / 2 - 1).lineTo(w / 2 + 36, h / 2 + 36).lineTo(w / 2 - 4, h / 2 - 1).closePath()
      .fill({ color: CHAT_BUBBLE_FILL }).stroke({ color: CHAT_BUBBLE_STROKE, width: 3 });
    c.addChild(bg);

    this.chatBubbleText = new Text({
      text: initialText,
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 32,
        fontWeight: 'bold',
        fill: CHAT_BUBBLE_TEXT_COLOR,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: w - 40,
      }),
    });
    this.chatBubbleText.anchor.set(0.5);
    c.addChild(this.chatBubbleText);
    return c;
  }

  private buildPill(name: string, width: number): { container: Container; scoreText: Text } {
    const c = new Container();
    const bg = new Graphics();
    // Unity: rgba(0,0,0,0.502) translucent-black 9-sliced strip — same for both pills.
    bg.roundRect(-width / 2, -PILL_H / 2, width, PILL_H, 16)
      .fill({ color: PILL_BG_COLOR, alpha: PILL_BG_ALPHA });
    c.addChild(bg);

    const nameText = new Text({
      text: name,
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 38,
        fontWeight: 'bold',
        fill: SCORE_TEXT_COLOR,
        stroke: { color: 0x000000, width: 4, join: 'round' },
      }),
    });
    nameText.anchor.set(0, 0.5);
    nameText.x = -width / 2 + 22;
    c.addChild(nameText);

    const scoreText = new Text({
      text: `0 / ${TARGET_SCORE}`,
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 44,
        fontWeight: 'bold',
        fill: SCORE_TEXT_COLOR,
        stroke: { color: 0x000000, width: 4, join: 'round' },
      }),
    });
    scoreText.anchor.set(1, 0.5);
    scoreText.x = width / 2 - 22;
    c.addChild(scoreText);

    return { container: c, scoreText };
  }

  private buildDiceRow(dieList: Die3D[]): Container {
    // Two dice land at local (±DICE_LOCAL_X, DICE_LOCAL_Y) PIXI. No cell wells — the
    // dice fly onto the stage platter directly via the board's Dice_Roll clip.
    const c = new Container();

    const clip = DICE_CLIPS[0];
    const trackEnds = [
      clip.die1.position[clip.die1.position.length - 1],
      clip.die2.position[clip.die2.position.length - 1],
    ];

    for (let i = 0; i < 2; i++) {
      const cellX = (i === 0 ? -DICE_LOCAL_X : +DICE_LOCAL_X);
      const cellY = DICE_LOCAL_Y;

      // 3D die — anchor `outer` so the trajectory end lands exactly at cell center.
      // Die3D.update writes inner.x = animP.x * posScale, inner.y = -animP.y * posScale.
      // World pos at end = outer + (endX * posScale, -endY * posScale). Solve for outer.
      const die = new Die3D(DICE_CUBE_HALF);
      die.setFaceTextures(this.faceTextures);
      const end = trackEnds[i];
      die.setWorldPos(
        cellX - end.x * DICE_POS_SCALE,
        cellY + end.y * DICE_POS_SCALE,
      );
      c.addChild(die.outer);
      dieList.push(die);
    }

    // Sum result text above the dice (Unity Result_Text 99-pt). Updated by animateDice.
    const sumText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 80,
        fontWeight: 'bold',
        fill: SCORE_TEXT_COLOR,
        stroke: { color: 0x000000, width: 6, join: 'round' },
      }),
    });
    sumText.anchor.set(0.5);
    sumText.x = 0;
    sumText.y = DICE_RESULT_Y;
    sumText.visible = false;
    (c as Container & { __sumText?: Text }).__sumText = sumText;
    c.addChild(sumText);
    return c;
  }

  private buildRewardStrip(): Container {
    const c = new Container();
    const w = REWARD_STRIP_W;
    const h = REWARD_STRIP_H;
    const bg = new Graphics();
    bg.roundRect(-w / 2, -h / 2, w, h, 18)
      .fill({ color: REWARD_STRIP_FILL, alpha: REWARD_STRIP_ALPHA })
      .stroke({ color: 0x000000, width: 3 });
    c.addChild(bg);

    this.currentRewardLabel = new Text({
      text: 'Current Reward',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 22,
        fontWeight: 'bold',
        fill: 0xCCCCCC,
        stroke: { color: 0x000000, width: 3, join: 'round' },
      }),
    });
    this.currentRewardLabel.anchor.set(0.5);
    this.currentRewardLabel.y = -h / 2 + 22;
    c.addChild(this.currentRewardLabel);

    // Bottom row: [coin icon] [amount]. Both anchored at center (0.5) and laid out
    // horizontally — final positions wired in updateRewardStripLayout() once we know
    // the rendered text width.
    const COIN_SIZE = 44;
    if (this.coinTexture) {
      const coin = new Sprite(this.coinTexture);
      coin.anchor.set(0.5);
      const ts = COIN_SIZE / Math.max(coin.texture.width || COIN_SIZE, coin.texture.height || COIN_SIZE);
      coin.scale.set(ts);
      this.currentRewardCoinIcon = coin;
      c.addChild(coin);
    }

    this.currentRewardAmount = new Text({
      text: String(this.currentRound().rewardCoins),
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 38,
        fontWeight: 'bold',
        fill: 0xFFC600,
        stroke: { color: 0x000000, width: 4, join: 'round' },
      }),
    });
    this.currentRewardAmount.anchor.set(0, 0.5); // left-pivot so coin sits to its left
    this.currentRewardAmount.y = 14;
    c.addChild(this.currentRewardAmount);

    this.updateRewardStripLayout();
    return c;
  }

  /** Center the [coin][amount] pair horizontally inside the reward strip. */
  private updateRewardStripLayout(): void {
    const COIN_GAP = 10;
    const amountW = this.currentRewardAmount.width;
    const coinW = this.currentRewardCoinIcon?.width ?? 0;
    const totalW = coinW + COIN_GAP + amountW;
    const startX = -totalW / 2;
    if (this.currentRewardCoinIcon) {
      this.currentRewardCoinIcon.x = startX + coinW / 2;
      this.currentRewardCoinIcon.y = 14;
    }
    this.currentRewardAmount.x = startX + coinW + COIN_GAP;
  }

  private buildStreakPanel(): Container {
    // Wraps the post-game "Winning Streak Reward — {n}x" panel. Unity layout:
    //   pivot bottom-center, sized 886×400, anchored at canvas Y=-960 (PIXI +960).
    // We place children in panel-local PIXI space where Y=0 is panel center.
    const c = new Container();
    const w = STREAK_PANEL_W;
    const h = STREAK_PANEL_H;
    const bg = new Graphics();
    bg.roundRect(-w / 2, -h / 2, w, h, 22)
      .fill({ color: STREAK_PANEL_FILL, alpha: STREAK_PANEL_ALPHA })
      .stroke({ color: 0x000000, width: 3 });
    c.addChild(bg);

    this.streakDescriptionText = new Text({
      text: 'Winning Streak Reward',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 28,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3, join: 'round' },
      }),
    });
    this.streakDescriptionText.anchor.set(0.5);
    this.streakDescriptionText.x = -180;
    this.streakDescriptionText.y = -h / 2 + 60;
    c.addChild(this.streakDescriptionText);

    this.streakMultiplierText = new Text({
      text: '2x!',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 90,
        fontWeight: 'bold',
        fill: 0xFFC600,
        stroke: { color: 0x000000, width: 6, join: 'round' },
      }),
    });
    this.streakMultiplierText.anchor.set(0.5);
    this.streakMultiplierText.x = +220;
    this.streakMultiplierText.y = -50;
    c.addChild(this.streakMultiplierText);

    return c;
  }

  // ───────────────────────── Layout ─────────────────────────

  private layoutAll(): void {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const vScale = Math.min(this.width / REF_W, this.height / REF_H);
    this.currentVScale = vScale;

    // BG flat fill.
    this.bgFlat.clear();
    this.bgFlat.rect(0, 0, this.width, this.height).fill({ color: 0x2a1b14 });

    // BG sprite — cover-fit then linear * vScale * 1.2 (matches LuckyWheelScene).
    if (this.bgSprite && this.bgSprite.texture) {
      this.bgSprite.x = cx;
      this.bgSprite.y = cy;
      const tw = this.bgSprite.texture.width || 1;
      const th = this.bgSprite.texture.height || 1;
      const refScale = Math.max(REF_W / tw, REF_H / th);
      const BG_EXTRA_ZOOM = 1.2;
      this.bgSprite.scale.set(refScale * BG_EXTRA_ZOOM * vScale);
    }

    this.dimOverlay.clear();
    this.dimOverlay.rect(0, 0, this.width, this.height).fill({ color: 0x000000, alpha: 0.5 });

    // sceneUnit at canvas center, scaled by vScale. All children below use Unity
    // reference-frame coords (Y-flipped) — sceneUnit.scale handles viewport scaling.
    this.sceneUnit.x = cx;
    this.sceneUnit.y = cy;
    if (this.sceneUnit.scale.x > 0.01) {
      this.sceneUnit.scale.set(vScale);
    }
    (this.sceneUnit as Container & { __targetScale?: number }).__targetScale = vScale;

    // ── Inner-Container scope (offset +63 PIXI baked into the constants below) ──

    // Dice stage platter — Unity DiceBG, sized 871×759 (Container 795×608 + sizeDelta
    // 76×151 stretch). Anchored at (-6.44, -85 Unity) = (-6.44, +85 PIXI) inside the
    // inner Container, so sceneUnit-local center = (-6.44, +85 + INNER_OFFSET_Y).
    if (this.diceStage) {
      const tw = this.diceStage.texture.width || 1;
      const th = this.diceStage.texture.height || 1;
      const targetW = 871;
      const targetH = 759;
      // PreserveAspect: scale the sprite to fit inside the target rect.
      const stageScale = Math.min(targetW / tw, targetH / th);
      this.diceStage.scale.set(stageScale);
      this.diceStage.x = -6.44;
      this.diceStage.y = 85 + INNER_OFFSET_Y;
    }

    this.gamblerContainer.x = GAMBLER_X;
    this.gamblerContainer.y = GAMBLER_Y;

    this.chatBubble.x = CHAT_X;
    this.chatBubble.y = CHAT_Y;

    this.opponentPill.x = OPPONENT_PILL_X;
    this.opponentPill.y = OPPONENT_PILL_Y;
    this.playerPill.x = PLAYER_PILL_X;
    this.playerPill.y = PLAYER_PILL_Y;

    // Both dice rows centered at inner-Container origin (overlap; opponent fades in).
    this.playerDice.x = DICE_ROW_X;
    this.playerDice.y = DICE_ROW_Y;
    this.opponentDice.x = DICE_ROW_X;
    this.opponentDice.y = DICE_ROW_Y;

    // ── Top-level (canvas-relative) ──
    this.currentRewardStrip.x = REWARD_STRIP_X;
    this.currentRewardStrip.y = REWARD_STRIP_Y + REWARD_STRIP_H / 2; // pivot Y=1 → top at -707

    this.titleText.x = TITLE_X;
    this.titleText.y = TITLE_Y - 30;
    this.titleAccentText.x = TITLE_X;
    this.titleAccentText.y = TITLE_Y + 30;

    // PlayButtons row — Roll on right, Stand on left. Each button at half-row offset.
    const btnHalfOffset = (PLAY_ROW_W / 2) - PLAY_BTN_W / 2 - 20;
    this.rollButton.container.x = +btnHalfOffset;
    this.rollButton.container.y = PLAY_ROW_Y;
    this.standButton.container.x = -btnHalfOffset;
    this.standButton.container.y = PLAY_ROW_Y;

    // Streak panel — pivot bottom-center, anchored at PLAY_ROW_Y + (gap) + STREAK_PANEL_Y.
    // Place panel-CENTER at STREAK_PANEL_Y - STREAK_PANEL_H/2 (so panel-bottom = STREAK_PANEL_Y).
    this.streakPanel.x = STREAK_PANEL_X;
    this.streakPanel.y = STREAK_PANEL_Y - STREAK_PANEL_H / 2;

    // Claim/Challenge live INSIDE the streak panel — but as siblings of the panel
    // (sceneUnit children) so they remain interactive on top. Position them within
    // the panel's footprint.
    this.claimButton.container.x = +btnHalfOffset;
    this.claimButton.container.y = PLAY_ROW_Y; // same row position as Roll
    this.challengeButton.container.x = -btnHalfOffset;
    this.challengeButton.container.y = PLAY_ROW_Y;

    // Buttons live inside sceneUnit — pass scale=1 so the button bakes at reference
    // resolution (sceneUnit.scale handles the viewport scaling).
    this.rollButton.layout(1);
    this.standButton.layout(1);
    this.claimButton.layout(1);
    this.challengeButton.layout(1);
  }

  // ───────────────────────── Entry ─────────────────────────

  private async playEnterAnimations(): Promise<void> {
    const targetScale = (this.sceneUnit as Container & { __targetScale?: number }).__targetScale ?? 1;
    void tween(this.ticker, ENTRY_FADE_MS, t => {
      this.dimOverlay.alpha = t * 0.5;
    });
    await tween(this.ticker, ENTRY_SCALE_MS, t => {
      let factor: number;
      if (t < 0.5) factor = (t / 0.5) * 1.05;
      else factor = 1.05 + ((t - 0.5) / 0.5) * (1.0 - 1.05);
      this.sceneUnit.scale.set(targetScale * factor);
    });
    if (this.disposed) return;
    this.sceneUnit.scale.set(targetScale);
  }

  // ───────────────────────── Game flow ─────────────────────────

  private firstLine(): string {
    return "Welcome, friend. Roll the dice. Don't go over 21!";
  }

  private currentRound(): RoundCfg {
    return this.rounds[Math.min(this.currentStreak, this.rounds.length - 1)];
  }

  /** Roll 2d6. Honors `forcedPlayerRolls` / `forcedOpponentRolls` queues. */
  private roll2d6(forced: number[][], idx: number): { dice: [number, number]; sum: number } {
    if (idx < forced.length) {
      const [d1, d2] = forced[idx];
      return { dice: [d1, d2], sum: d1 + d2 };
    }
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    return { dice: [d1, d2], sum: d1 + d2 };
  }

  /** Pity retry — only on player rolls per Unity. Keeps re-rolling busts up to N times at chance C. */
  private rollPlayerWithPity(): { dice: [number, number]; sum: number } {
    const round = this.currentRound();
    let result = this.roll2d6(this.forcedPlayerRolls, this.playerRollIndex);
    while (
      this.rerollAmount < round.retryLosingRollCount
      && this.playerScore + result.sum > TARGET_SCORE
      && Math.random() < round.retryChance
    ) {
      this.rerollAmount++;
      // Skip past forced entry if it would have been consumed.
      if (this.playerRollIndex < this.forcedPlayerRolls.length) this.playerRollIndex++;
      result = this.roll2d6(this.forcedPlayerRolls, this.playerRollIndex);
    }
    return result;
  }

  private async onRollClicked(): Promise<void> {
    if (this.gameState !== 'Playing' || this.disposed) return;
    this.rollButton.setInteractive(false);
    this.standButton.setInteractive(false);
    this.rollButton.setPressed(true);
    this.standButton.setPressed(true);

    const result = this.rollPlayerWithPity();
    this.playerRollIndex++;

    await this.animateDice(this.playerDice, this.playerDie3D, result.dice, PLAYER_ROLL_MS);
    if (this.disposed) return;

    this.playerScore += result.sum;
    this.updatePillScore(this.playerPillScoreText, this.playerScore);

    await delay(this.ticker, DELAY_BETWEEN_PLAYER_ROLLS_MS);
    if (this.disposed) return;

    if (this.playerScore > TARGET_SCORE) {
      // Bust.
      void this.typewriter('Bust! You went over.');
      blackjackSfx.lose(1.0);
      await delay(this.ticker, DELAY_ON_LOSE_MS);
      if (this.disposed) return;
      this.gameState = 'Finished';
      this.startPostGameState();
      return;
    }
    if (this.playerScore === TARGET_SCORE) {
      void this.typewriter('21! Perfect roll!');
      blackjackSfx.twentyOne(1.0);
      await delay(this.ticker, DELAY_ON_BLACKJACK_MS);
      if (this.disposed) return;
      this.startPostGameState();
      return;
    }

    // Allow another roll or stand.
    this.rollButton.setInteractive(true);
    this.standButton.setInteractive(true);
    this.rollButton.setPressed(false);
    this.standButton.setPressed(false);
  }

  private async onStandClicked(): Promise<void> {
    if (this.gameState !== 'Playing' || this.disposed) return;
    this.rollButton.setInteractive(false);
    this.standButton.setInteractive(false);
    this.rollButton.setHidden(true);
    this.standButton.setHidden(true);

    // Hide player dice; reveal opponent dice.
    void tween(this.ticker, 250, t => { this.playerDice.alpha = 1 - t; });
    void tween(this.ticker, 250, t => { this.opponentDice.alpha = t; });
    await delay(this.ticker, 250);
    if (this.disposed) return;

    void this.typewriter("My turn — let's see if I can beat you...");
    this.rerollAmount = 0;

    // Opponent loops until they pass or bust.
    while (this.opponentScore <= this.playerScore) {
      const result = this.roll2d6(this.forcedOpponentRolls, this.opponentRollIndex);
      this.opponentRollIndex++;

      await this.animateDice(this.opponentDice, this.opponentDie3D, result.dice, OPPONENT_ROLL_MS);
      if (this.disposed) return;

      this.opponentScore += result.sum;
      this.updatePillScore(this.opponentPillScoreText, this.opponentScore);

      await delay(this.ticker, DELAY_BETWEEN_OPPONENT_ROLLS_MS);
      if (this.disposed) return;

      if (this.opponentScore > TARGET_SCORE) {
        void this.typewriter('I busted! You win.');
        blackjackSfx.win(1.0);
        await delay(this.ticker, DELAY_ON_WIN_MS);
        if (this.disposed) return;
        this.startPostGameState();
        return;
      }
    }

    // Opponent passed (>= playerScore + bounded by 21).
    void this.typewriter('I beat you. Better luck next time.');
    blackjackSfx.lose(1.0);
    await delay(this.ticker, DELAY_ON_LOSE_MS);
    if (this.disposed) return;
    this.gameState = 'Finished';
    this.startPostGameState();
  }

  private startPostGameState(): void {
    // Hide play buttons.
    this.rollButton.setHidden(true);
    this.standButton.setHidden(true);

    // Hide the title and play-row labels while in post-game (mirrors Unity behavior
    // where the streak panel takes over the bottom area).
    this.titleText.visible = false;
    this.titleAccentText.visible = false;

    if (this.gameState === 'Finished') {
      // Loss — only Claim button. Streak panel stays hidden.
      this.claimButton.setHidden(false);
      this.claimButton.setInteractive(true);
      this.challengeButton.setHidden(true);
      this.streakPanel.visible = false;
      this.currentRewardAmount.text = '0';
      this.currentRewardAmount.style.fill = 0x999999;
      this.updateRewardStripLayout();
      void this.typewriter('Better luck next time, friend.');
      return;
    }

    // Win path — set state, show streak panel + Claim + Challenge.
    this.gameState = 'PostGame';
    const nextRound = this.rounds[Math.min(this.currentStreak + 1, this.rounds.length - 1)];
    this.streakDescriptionText.text = 'Winning Streak Reward';
    this.streakMultiplierText.text = nextRound.multiplierLabel + '!';
    this.streakPanel.visible = true;
    this.claimButton.setHidden(false);
    this.claimButton.setInteractive(true);

    // Hide Challenge if streak maxed.
    if (this.currentStreak + 1 >= this.rounds.length) {
      this.challengeButton.setHidden(true);
    } else {
      this.challengeButton.setHidden(false);
      this.challengeButton.setInteractive(true);
    }
    void this.typewriter("Brave enough to try again? Double or nothin'.");
  }

  private async onClaimClicked(): Promise<void> {
    if (this.disposed) return;
    this.claimButton.setInteractive(false);
    this.challengeButton.setInteractive(false);

    if (this.gameState === 'PostGame') {
      // Apply reward.
      const r = this.currentRound();
      this.applyStatDelta({ coins: r.rewardCoins });
    }
    // Slight beat for the player to read the action, then resolve.
    await delay(this.ticker, 200);
    if (this.disposed) return;
    this.resolveDone();
  }

  private onChallengeClicked(): void {
    if (this.gameState !== 'PostGame' || this.disposed) return;
    if (this.currentStreak + 1 >= this.rounds.length) return;
    this.currentStreak++;
    this.startPlayState();
  }

  /** Reset for the next round (called by Challenge). */
  private startPlayState(): void {
    this.gameState = 'Playing';
    this.playerScore = 0;
    this.opponentScore = 0;
    this.rerollAmount = 0;
    this.updatePillScore(this.playerPillScoreText, 0);
    this.updatePillScore(this.opponentPillScoreText, 0);
    this.currentRewardAmount.text = String(this.currentRound().rewardCoins);
    this.currentRewardAmount.style.fill = 0xFFC600;
    this.updateRewardStripLayout();
    this.streakPanel.visible = false;
    this.titleText.visible = true;
    this.titleAccentText.visible = true;

    // Restore dice visibility.
    this.playerDice.alpha = 1;
    this.opponentDice.alpha = 0;

    // Hide post-game buttons; show play buttons.
    this.claimButton.setHidden(true);
    this.challengeButton.setHidden(true);
    this.rollButton.setHidden(false);
    this.rollButton.setInteractive(true);
    this.rollButton.setPressed(false);
    this.standButton.setHidden(false);
    this.standButton.setInteractive(true);
    this.standButton.setPressed(false);

    void this.typewriter('Round ' + (this.currentStreak + 1) + ' — roll again.');
  }

  // ───────────────────────── Animations / helpers ─────────────────────────

  /** Roll a 2-die row to a final value via Die3D, then reveal the sum. */
  private async animateDice(diceRow: Container, dice: Die3D[], finalDice: [number, number], _durationMs: number): Promise<void> {
    sfx.diceRoll(0.7);
    const sumText = (diceRow as Container & { __sumText?: Text }).__sumText;
    if (sumText) sumText.visible = false;

    // Match the board's roll exactly: use the clip's natural duration (0.75 s)
    // and full animationLength. Die3D's faceEulers are calibrated for the clip's
    // natural settle pose, so we MUST let the clip run to its settle frame —
    // shorter durations leave the dice mid-tumble showing a wrong face.
    const clip = DICE_CLIPS[0];
    dice[0].loadClip(clip.die1, clip.duration, clip.animationLength, finalDice[0], DICE_POS_SCALE, DICE_PLAYBACK_RATE);
    dice[1].loadClip(clip.die2, clip.duration, clip.animationLength, finalDice[1], DICE_POS_SCALE, DICE_PLAYBACK_RATE);

    await new Promise<void>((resolve) => {
      let done0 = false, done1 = false;
      dice[0].setOnSettle(() => { done0 = true; if (done1) resolve(); });
      dice[1].setOnSettle(() => { done1 = true; if (done0) resolve(); });
      // Hard timeout in case onSettle doesn't fire (e.g., scene torn down mid-roll).
      void delay(this.ticker, clip.duration * 1000 + 200).then(() => { if (!done0 || !done1) resolve(); });
    });
    if (this.disposed) return;

    if (sumText) {
      sumText.text = String(finalDice[0] + finalDice[1]);
      sumText.visible = true;
    }
  }

  private updatePillScore(scoreText: Text, score: number): void {
    scoreText.text = `${score} / ${TARGET_SCORE}`;
    scoreText.style.fill = score > TARGET_SCORE ? TITLE_RED : SCORE_TEXT_COLOR;
  }

  /** Type out `text` to the chat bubble char-by-char at TYPEWRITER_MS_PER_CHAR. */
  private async typewriter(text: string): Promise<void> {
    const myToken = ++this.typewriterToken;
    this.chatBubbleText.text = '';
    for (let i = 0; i < text.length; i++) {
      if (this.disposed) return;
      if (myToken !== this.typewriterToken) return; // a newer line replaced ours
      this.chatBubbleText.text = text.substring(0, i + 1);
      await delay(this.ticker, TYPEWRITER_MS_PER_CHAR);
    }
  }
}
