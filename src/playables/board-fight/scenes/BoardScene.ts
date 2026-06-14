import { Container, Ticker, Sprite, Assets, Graphics, Text, TextStyle, Texture, Renderer } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import type { PlayerState } from '../PlayerState';
import type { BoardConfig, TileCoord, DiceAnchor } from '../board/BoardConfig';
import { Board } from '../board/Board';
import { SpineCharacter } from '@shared/SpineCharacter';
import { RollButton } from '../RollButton';
import { CloudLayer } from '../CloudLayer';
import type { FightProgressBar } from '../FightProgressBar';
import { BoardStatsBar } from '../BoardStatsBar';
import { OverheadAtkLabel } from '../OverheadAtkLabel';
import { BoardFloatOverlay } from '../board/BoardFloatOverlay';
import type { BoardFloatConfig } from '../board/BoardFloatOverlay';
import type { BoardDice } from '../BoardDice';
import * as sfx from '../sfx';
import type { BoardStatsConfig } from '../BoardStatsBar';
import type { WeaponConfig, SpineAssets } from '@shared/SpineCharacter';
import {
  normalizeRoll, deltaForTilePopup,
  type RollEntry, type TilePopupEvent, type LootEvent,
} from '../PlayableDirector';
import type { StatDelta } from '../PlayerState';
// StatChangePopup / LootToast are NOT statically imported. They're injected
// per-variant via `PlayableSceneClasses`, so variants without tilePopup/loot
// events drop the popup classes (and their statically-imported webp/audio).
import type { StatChangePopup } from '../board/popups/StatChangePopup';
import type { LootToast } from '../board/popups/LootToast';
import type { PlayableSceneClasses } from '../PlayableDirector';
import { flyIcon } from '@shared/flyIcon';
import { tween, delay } from '@shared/tween';
import { RARITY_COLORS } from '../skills';
import type { SkillConfig } from '../skills';

import { heroBundle } from '../catalog/heroes';
import rollButtonData from 'assets/UI/RollButton.webp';
import rollButtonBackData from 'assets/UI/RollButton_Back.webp';
import rollButtonFrontData from 'assets/UI/RollButton_Front.webp';
import glowData from 'assets/UI/highlight_4.webp';
import ftueHandData from 'assets/UI/FTUE_Hand.webp';
// EXP.webp / Coin.webp are NOT statically imported here. Each lives in its
// own HUD module (hud/XpHud.ts, hud/CoinHud.ts) which is codegen-gated via
// `script.sceneClasses` — so variants that don't render XP/Coin drop the
// HUD class and its asset entirely. BoardScene reuses the loaded textures
// via `statsBar.getXpIconTexture()` / `getCoinIconTexture()`.

export interface BoardSceneConfig {
  rolls: RollEntry[];
  debugWeapons?: { name: string; config: WeaponConfig }[];
}

const HOP_DURATION = 0.125;
const HOP_HEIGHT = 25;
const MAJOR_HOP_DURATION = 0.28;
const MAJOR_HOP_HEIGHT = 75;
const MAJOR_SHAKE_AMP = 16;
const MAJOR_SHAKE_MS = 350;
const ZOOM_OUT = 0.9;

// FTUE hand
const FTUE_HAND_SIZE = 70;
const FTUE_BOB_AMP = 10;
const FTUE_BOB_SPEED = 0.004; // radians per ms
const FTUE_IDLE_DELAY = 2000; // ms before re-showing after roll

export class BoardScene implements Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  private config: BoardSceneConfig;
  private boardConfig: BoardConfig;
  private state: PlayerState;
  private ticker: Ticker;
  private renderer: Renderer;
  private width: number;
  private height: number;

  private board!: Board;
  private hero!: SpineCharacter;
  private rollButton!: RollButton;
  private boardDice?: BoardDice;
  private cloudLayer!: CloudLayer;
  private rollInProgress = false;
  private use3dDice = false;
  private pulseRollButton = false;

  // Movement
  private currentTileIndex: number;
  private isMoving = false;
  private moveProgress = 0;
  private moveFrom = { x: 0, y: 0 };
  private moveTo = { x: 0, y: 0 };
  private remainingHops = 0;
  private rollIndex = 0;
  private currentRollMajor = false;
  private currentHopMajor = false;
  private currentHopHeight = HOP_HEIGHT;
  private currentHopDuration = HOP_DURATION;
  private ready = false;

  private onLanded?: (tileIndex: number) => Promise<void>;
  private onRolled?: () => void;
  private awaitingCallback = false;
  private paused = false;
  private progressBar?: FightProgressBar;
  private statsBar?: BoardStatsBar;
  private statsConfig?: BoardStatsConfig;
  private expTex?: Texture;
  private xpFlying = false;
  private overheadAtk?: OverheadAtkLabel;

  // FTUE hand
  private ftueHand?: Sprite;
  private ftueHandVisible = false;
  private ftueIdleTimer = 0;
  private ftueBobElapsed = 0;
  private ftueBaseY = 0;
  private ftueFirstRoll = true;

  // Board float overlays
  private floatConfigs: BoardFloatConfig[];
  private floatOverlays: BoardFloatOverlay[] = [];

  // Tile popup layer (Phase 1: tilePopup, loot). Survives pause() — overlays
  // like dialogue/treasure shouldn't freeze a popup mid-fade.
  private popupLayer: Container = new Container();
  private activePopups: Array<StatChangePopup | LootToast> = [];

  // Director hook for stat mutations from board-mode popups.
  private onStatDelta?: (delta: StatDelta) => StatDelta;

  // Center boss — optional cinematic, singleton at board center, drives final-roll jump
  private centerEnemyBundle?: SpineAssets;
  private centerEnemyScale: number;
  private centerEnemyPosition?: TileCoord; // source-image coords; defaults to boardConfig.boardCenter
  private centerBoss?: SpineCharacter;

  // Debug weapon cycling
  private debugWeaponIndex = 0;
  private debugWeaponBtn?: Container;

  // Per-variant lazy classes (StatChangePopup, LootToast) injected from script.
  private sceneClasses: PlayableSceneClasses = {};

  constructor(
    config: BoardSceneConfig,
    boardConfig: BoardConfig,
    state: PlayerState,
    ticker: Ticker,
    renderer: Renderer,
    width: number,
    height: number,
    onLanded?: (tileIndex: number) => Promise<void>,
    progressBar?: FightProgressBar,
    onRolled?: () => void,
    statsConfig?: BoardStatsConfig,
    floatConfigs?: BoardFloatConfig[],
    centerEnemyBundle?: SpineAssets,
    centerEnemyScale?: number,
    centerEnemyPosition?: TileCoord,
    use3dDice?: boolean,
    pulseRollButton?: boolean,
    onStatDelta?: (delta: StatDelta) => StatDelta,
    sceneClasses?: PlayableSceneClasses,
  ) {
    this.container = new Container();
    this.sceneClasses = sceneClasses ?? {};
    this.config = config;
    this.boardConfig = boardConfig;
    this.state = state;
    this.ticker = ticker;
    this.renderer = renderer;
    this.width = width;
    this.height = height;
    this.currentTileIndex = state.boardTileIndex;
    this.onLanded = onLanded;
    this.progressBar = progressBar;
    this.onRolled = onRolled;
    this.statsConfig = statsConfig;
    this.floatConfigs = floatConfigs ?? [];
    this.centerEnemyBundle = centerEnemyBundle;
    this.centerEnemyScale = centerEnemyScale ?? 0.18;
    this.centerEnemyPosition = centerEnemyPosition;
    this.use3dDice = use3dDice ?? false;
    this.pulseRollButton = pulseRollButton ?? false;
    this.onStatDelta = onStatDelta;
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
  }

  /** Camera-anchor screen-X = the hero's current screen position. Tile popups
   *  read this every frame to decide which side of the bubble points the tail
   *  toward the popup's source tile. */
  get cameraAnchorScreenX(): number {
    return this.hero?.spine.x ?? this.width / 2;
  }

  /** Direct accessor for popup tiles to compute their screen position each frame. */
  tileScreen(tileIndex: number): { x: number; y: number } {
    const tile = this.board.tiles[tileIndex];
    return this.board.tileToScreen(tile);
  }

  /** Force HUD elements to re-read state — coin counter, ATK label, etc. */
  refreshHud(): void {
    this.statsBar?.setAtk(this.state.atk);
    this.statsBar?.setCoins(this.state.coins ?? 0);
    this.overheadAtk?.setAtk(this.state.atk);
  }

  /** Run a tilePopup event: apply its stat delta, then show a speech-bubble
   *  popup over the player's current tile for ~4s. Returns when the popup
   *  finishes its lifecycle. */
  async runTilePopup(event: TilePopupEvent): Promise<void> {
    const delta = deltaForTilePopup(event);
    const applied = this.onStatDelta ? this.onStatDelta(delta) : delta;
    this.refreshHud();
    const StatChangePopupCls = this.sceneClasses.StatChangePopup;
    if (!StatChangePopupCls) {
      throw new Error('BoardScene.runTilePopup: StatChangePopup not registered in sceneClasses — codegen forgot to include it for this variant.');
    }
    const popup = new StatChangePopupCls({
      ticker: this.ticker,
      stat: event.stat,
      pct: event.pct,
      amount: event.amount,
      applied,
      tileScreen: () => this.tileScreen(this.currentTileIndex),
      cameraAnchorX: () => this.cameraAnchorScreenX,
    });
    await popup.init();
    this.popupLayer.addChild(popup.container);
    this.activePopups.push(popup);
    await popup.run();
    this.popupLayer.removeChild(popup.container);
    this.activePopups = this.activePopups.filter(p => p !== popup);
    popup.destroy();
  }

  /** Run a loot event: brief +N pop over the tile, then coin sprites fly to the
   *  HUD coin counter (mirrors playXpFly). Resolves quickly (~600ms) so the next
   *  roll is available almost immediately; the fly animation continues in the
   *  background and ramps the HUD value up as each sprite lands. */
  async runLoot(event: LootEvent): Promise<void> {
    // Apply state immediately but DON'T refresh the HUD coin number — we want
    // the displayed number to ramp up as flying coins land.
    const applied = this.onStatDelta ? this.onStatDelta({ coins: event.amount }) : { coins: event.amount };
    const amount = applied.coins ?? event.amount;

    const tilePos = this.tileScreen(this.currentTileIndex);

    const LootToastCls = this.sceneClasses.LootToast;
    if (!LootToastCls) {
      throw new Error('BoardScene.runLoot: LootToast not registered in sceneClasses — codegen forgot to include it for this variant.');
    }
    const toast = new LootToastCls({
      ticker: this.ticker,
      amount,
      currency: event.currency,
      tileScreen: () => this.tileScreen(this.currentTileIndex),
    });
    await toast.init();
    this.popupLayer.addChild(toast.container);
    this.activePopups.push(toast);

    // Fire coin fly in PARALLEL with the toast and don't await it — the next roll
    // can prepare while coins continue to land in the HUD.
    void this.playCoinFly(amount, tilePos);

    // Wait only for the toast's brief pop (not the full hold/exit) before
    // resolving the loot event. The toast handles its own destroy after exit.
    await toast.runQuick();
    this.popupLayer.removeChild(toast.container);
    this.activePopups = this.activePopups.filter(p => p !== toast);
    toast.destroy();
  }

  /** Convenience: fly coin sprites from the viewport center. Use this after a
   *  full-screen scene (treasure / dialogue / slot / etc.) credits coins, since
   *  the visual source is the center of where the scene was rendered.
   *
   *  Important: BoardScene.resume() has already snapped the HUD to the new
   *  state.coins value, so we first roll the displayed value back to
   *  (state.coins - amount) so the fly visually accumulates from old → new. */
  async playCoinFlyFromCenter(amount: number): Promise<void> {
    const target = (this.state.coins ?? 0);
    this.statsBar?.initCoins(Math.max(0, target - amount));
    return this.playCoinFly(amount, { x: this.width / 2, y: this.height / 2 });
  }

  /** Fly N coin sprites from sourcePos to the coin HUD pill. Each arriving
   *  sprite increments the displayed coin number; final arrival snaps the
   *  displayed value to the exact state.coins so float drift doesn't leave
   *  the HUD off-by-one. No-op if statsBar / coin group not available. */
  async playCoinFly(amount: number, sourcePos: { x: number; y: number }): Promise<void> {
    if (!this.statsBar) return;
    const hudTex = this.statsBar.getCoinIconTexture();
    if (!hudTex) {
      throw new Error('BoardScene.playCoinFly called but CoinHud not constructed — variant does not include CoinHud in sceneClasses.');
    }
    const tex = this.coinTex ?? hudTex;
    this.coinTex = tex;

    const target = this.statsBar.getCoinIconCenterScreenPosition();
    // Spawn a generous shower — at least 15, scales up to 28 for big loot.
    const COUNT = Math.min(28, Math.max(15, Math.round(Math.sqrt(amount) * 1.8)));
    const STAGGER = 22;
    const per = amount / COUNT;

    const promises: Promise<void>[] = [];
    for (let i = 0; i < COUNT; i++) {
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5);
      const size = 22 + Math.random() * 12;
      sprite.width = size;
      sprite.height = size;
      sprite.x = sourcePos.x + (Math.random() - 0.5) * 80;
      sprite.y = sourcePos.y + (Math.random() - 0.5) * 80;
      this.popupLayer.addChild(sprite);
      promises.push(this.flyCoinIcon(sprite, target, i * STAGGER, per));
    }
    await Promise.all(promises);
    // Float drift correction: snap displayed value to authoritative state.coins
    // so the bar reads exactly what's in the player's wallet.
    this.statsBar.setCoins(this.state.coins ?? 0);
  }

  private flyCoinIcon(
    sprite: Sprite,
    target: { x: number; y: number },
    initialDelay: number,
    coinsPer: number,
  ): Promise<void> {
    return flyIcon(this.ticker, sprite, target, {
      initialDelay,
      durationMs: 280,
      durationJitter: 100,
      arcHeight: -50,
      arcJitter: 50,
      alphaFadeStart: 0.85,
      onArrive: () => {
        this.statsBar?.addCoinDelta(coinsPer);
        sfx.experienceBar(0.6);
      },
    });
  }

  private coinTex?: Texture;

  async enter(): Promise<void> {
    this.board = await Board.create(this.boardConfig, this.width, this.height, this.ticker);
    this.container.addChild(this.board.sprite);

    this.hero = await SpineCharacter.create('hero',
      heroBundle,
      this.ticker,
      { skin: this.state.heroSkin, animation: 'Idle' },
    );
    this.currentHeroSkin = this.state.heroSkin;
    this.hero.facingLeft = true;
    this.syncHeroToTile();

    // Board float overlays (added before hero so they render below)
    for (const fc of this.floatConfigs) {
      const overlay = await BoardFloatOverlay.create(fc, this.board, this.ticker);
      this.container.addChild(overlay.container);
      this.floatOverlays.push(overlay);
    }

    // Center boss (optional) — singleton at board center, added before hero so the
    // hero renders in front when landing next to it after the final-roll jump.
    if (this.centerEnemyBundle) {
      const boss = await SpineCharacter.create('centerBoss', this.centerEnemyBundle, this.ticker);
      const skel = boss.spine.skeleton;
      for (const name of ['Idle', 'Idle_Full', 'Idle_Loop']) {
        if (skel.data.findAnimation(name)) {
          boss.play(name, true);
          break;
        }
      }
      const s = this.centerEnemyScale;
      boss.spine.scale.set(s, s); // positive: enemy rig natural facing (left)
      const sourceCoord = this.centerEnemyPosition ?? this.board.config.boardCenter;
      const pos = this.board.tileToScreen(sourceCoord);
      boss.spine.x = pos.x;
      boss.spine.y = pos.y;
      this.centerBoss = boss;
      this.container.addChild(boss.spine);
    }

    this.container.addChild(this.hero.spine);
    if (this.state.weaponConfig) {
      await this.hero.equipWeapon(this.state.weaponConfig);
    }

    this.rollButton = await RollButton.create(
      { button: rollButtonData, back: rollButtonBackData, front: rollButtonFrontData },
      (die1, die2) => this.onDiceRolled(die1, die2),
      this.use3dDice ? '3d' : '2d',
    );
    this.rollButton.layout(this.width, this.height);
    this.container.addChild(this.rollButton.container);

    if (this.use3dDice) {
      // Lazy-load the 3D dice module so it (+ diceAnimations.json ~10KB +
      // Die3D/dicePips) only ships in bundles for variants with use3dDice: true.
      const { BoardDice } = await import('../BoardDice');
      this.boardDice = new BoardDice(
        this.container,
        this.renderer,
        this.ticker,
        this.board,
        () => this.computeDiceAnchorSrc(),
      );

    }

    // FTUE hand — show immediately on first enter
    const handTex = await Assets.load(ftueHandData);
    this.ftueHand = new Sprite(handTex);
    this.ftueHand.anchor.set(0.5, 1);
    this.ftueHand.rotation = Math.PI; // flip to point down
    this.ftueHand.visible = false;
    this.container.addChild(this.ftueHand);
    this.showFtueHand();

    if (this.progressBar) {
      await this.progressBar.init();
      this.progressBar.layout(this.width, this.height);
      this.container.addChild(this.progressBar.container);
    }

    // Popup layer sits between board and HUD: above hero so popups occlude the player,
    // below stats bar so the coin counter doesn't get covered.
    this.container.addChild(this.popupLayer);

    if (this.statsConfig && (this.statsConfig.showXp || this.statsConfig.atkDisplay === 'bar')) {
      this.statsBar = new BoardStatsBar(this.statsConfig, this.sceneClasses);
      await this.statsBar.init();
      this.statsBar.initAtk(this.state.atk);
      if (this.state.coins != null) this.statsBar.initCoins(this.state.coins);
      this.statsBar.layout(this.width, this.height);
      this.container.addChild(this.statsBar.container);
      // XpHud already loaded the EXP texture during its init(); reuse it for
      // playXpFly so we don't re-decode the same webp.
      if (this.statsConfig.showXp) {
        this.expTex = this.statsBar.getXpIconTexture();
      }
    }

    if (this.statsConfig?.atkDisplay === 'overhead') {
      this.overheadAtk = new OverheadAtkLabel(this.state.atk);
      await this.overheadAtk.init();
      this.overheadAtk.initAtk(this.state.atk);
      this.overheadAtk.syncPosition(
        this.hero.spine.x,
        this.hero.spine.y,
        Math.abs(this.hero.spine.scale.y),
      );
      this.container.addChild(this.overheadAtk.container);
    }

    const boardTex = this.board.sprite.texture;
    const cloudScale = 0.90 / this.board.config.boardScale; // counter-scale so clouds stay consistent
    this.cloudLayer = await CloudLayer.create(boardTex.width / cloudScale, boardTex.height / cloudScale);
    this.cloudLayer.container.scale.set(cloudScale);
    this.board.sprite.addChild(this.cloudLayer.container);
    // if (__DEV__) this.cloudLayer.drawDebug();

    this.board.focusOnTile(this.currentTileIndex);
    this.board.snapCamera();

    this.prepareNextRoll();

    // Debug: tap button to cycle weapons (stripped from production builds)
    if (__DEV__) {
      const weapons = this.config.debugWeapons;
      if (weapons && weapons.length > 0) {
        this.debugWeaponBtn = this.createDebugWeaponButton(weapons);
        this.container.addChild(this.debugWeaponBtn);
        this.layoutDebugWeaponBtn();
      }
    }

    this.ready = true;
  }

  async exit(): Promise<void> {
    this.boardDice?.destroy();
  }

  update(deltaMS: number): void {
    if (!this.ready || this.paused) return;
    this.updateMovement(deltaMS);
    this.syncHeroToTile();
    this.rollButton.update(deltaMS);
    this.board.update();
    this.cloudLayer.update(deltaMS);
    this.progressBar?.update(deltaMS);
    this.statsBar?.update(deltaMS);
    if (this.overheadAtk) {
      this.overheadAtk.syncPosition(
        this.hero.spine.x,
        this.hero.spine.y,
        Math.abs(this.hero.spine.scale.y),
      );
      this.overheadAtk.update(deltaMS);
    }
    for (const overlay of this.floatOverlays) {
      overlay.update(deltaMS, this.hero.spine.x);
    }
    this.syncCenterBoss();
    this.hero.updateWeaponGlow(deltaMS);
    this.updateFtueHand(deltaMS);

  }

  /** Source-image coords where the dice should land this roll. Priority:
   *  1. Hero tile's `diceAnchor` override if present (short string, object, or with offset).
   *  2. Otherwise: automatic heuristic — midpoint between tile-3-ahead and
   *     board center, OR above the hero if the ahead-tile sits in the top
   *     region (to avoid overlapping a center boss on diamond boards). */
  private computeDiceAnchorSrc(): { x: number; y: number } {
    const tiles = this.board.tiles;
    const hero = tiles[this.currentTileIndex];
    const override = hero.diceAnchor;
    if (override !== undefined) {
      const base = this.resolveAnchorBase(override, hero);
      const off = typeof override === 'object' ? override.offset : undefined;
      return { x: base.x + (off?.x ?? 0), y: base.y + (off?.y ?? 0) };
    }
    // Auto: above-hero when near top, midpoint otherwise.
    const dir = this.board.config.direction ?? -1;
    const aheadIdx = (this.currentTileIndex + dir * 3 + tiles.length * 3) % tiles.length;
    const ahead = tiles[aheadIdx];
    const center = this.board.config.boardCenter;
    const TOP_GUARD = 150;
    if (ahead.y < center.y - TOP_GUARD) return this.aboveHeroAnchor(hero);
    return this.midpointAnchor();
  }

  private resolveAnchorBase(a: DiceAnchor, hero: TileCoord): { x: number; y: number } {
    if (a === 'aboveHero') return this.aboveHeroAnchor(hero);
    if (a === 'midpoint') return this.midpointAnchor();
    if (a.mode === 'aboveHero') return this.aboveHeroAnchor(hero);
    if (a.mode === 'midpoint') return this.midpointAnchor();
    if (a.x != null && a.y != null) return { x: a.x, y: a.y };
    // Fallback if object has only offset: anchor on the hero tile itself.
    return { x: hero.x, y: hero.y };
  }

  private aboveHeroAnchor(hero: TileCoord): { x: number; y: number } {
    const ABOVE_HERO_Y = 120;
    return { x: hero.x, y: hero.y - ABOVE_HERO_Y };
  }

  private midpointAnchor(): { x: number; y: number } {
    const dir = this.board.config.direction ?? -1;
    const tiles = this.board.tiles;
    const aheadIdx = (this.currentTileIndex + dir * 3 + tiles.length * 3) % tiles.length;
    const ahead = tiles[aheadIdx];
    const center = this.board.config.boardCenter;
    return { x: (ahead.x + center.x) / 2, y: (ahead.y + center.y) / 2 };
  }


  private syncCenterBoss(): void {
    if (!this.centerBoss) return;
    const sourceCoord = this.centerEnemyPosition ?? this.board.config.boardCenter;
    const pos = this.board.tileToScreen(sourceCoord);
    this.centerBoss.spine.x = pos.x;
    this.centerBoss.spine.y = pos.y;
  }

  pause(): void {
    this.paused = true;
    this.container.interactiveChildren = false;
  }

  resume(): void {
    this.paused = false;
    this.container.interactiveChildren = true;
    if (this.state.heroSkin !== this.currentHeroSkin) {
      // Recreate hero with new skin (setSkinByName leaves ghost attachments)
      this.rebuildHeroIfNeeded();
    } else if (this.state.weaponConfig) {
      // Only re-equip if skin didn't change (rebuild handles weapon internally)
      this.hero.equipWeapon(this.state.weaponConfig);
    }
    this.statsBar?.setAtk(this.state.atk);
    this.statsBar?.setCoins(this.state.coins ?? 0);
    this.overheadAtk?.setAtk(this.state.atk);
    // Reset idle timer so FTUE hand re-shows after overlays
    this.ftueIdleTimer = 0;
  }

  private currentHeroSkin = '';

  private async rebuildHeroIfNeeded(): Promise<void> {
    if (this.state.heroSkin === this.currentHeroSkin) return;
    const idx = this.container.getChildIndex(this.hero.spine);
    const wasFacingLeft = this.hero.facingLeft;
    this.hero.unequipWeapon();
    this.container.removeChild(this.hero.spine);
    this.hero.spine.destroy();
    this.hero = await SpineCharacter.create('hero',
      heroBundle,
      this.ticker,
      { skin: this.state.heroSkin, animation: 'Idle' },
    );
    this.hero.facingLeft = wasFacingLeft;
    this.container.addChildAt(this.hero.spine, idx);
    this.syncHeroToTile();
    this.currentHeroSkin = this.state.heroSkin;
    if (this.state.weaponConfig) {
      await this.hero.equipWeapon(this.state.weaponConfig);
    }
  }

  layout(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.board) this.board.layout(width, height);
    if (this.rollButton) this.rollButton.layout(width, height);
    this.progressBar?.layout(width, height);
    this.statsBar?.layout(width, height);
    this.layoutFtueHand();
    this.layoutDebugWeaponBtn();
  }

  // --- Scripted rolls ---

  private prepareNextRoll(): void {
    if (this.rollIndex < this.config.rolls.length) {
      const { hops } = normalizeRoll(this.config.rolls[this.rollIndex]);
      this.rollButton.setNextRoll(hops > 0 ? hops : null);
    }
  }

  // --- Movement ---

  private async onDiceRolled(die1: number, die2: number): Promise<void> {
    this.hideFtueHand();
    this.rollInProgress = true;

    const total = die1 + die2;
    this.currentRollMajor = normalizeRoll(this.config.rolls[this.rollIndex]).major;

    const tiles = this.board.tiles;
    const dir = this.board.config.direction ?? -1;
    const path: number[] = [];
    let idx = this.currentTileIndex;
    for (let i = 0; i < total; i++) {
      idx = (idx + dir + tiles.length) % tiles.length;
      path.push(idx);
    }

    // Run the 3D dice roll and path highlights concurrently so the player
    // doesn't wait for the dice to settle before the path reveals.
    const diceDone = this.boardDice ? this.boardDice.throw(die1, die2) : Promise.resolve();
    await Promise.all([diceDone, this.board.showHighlights(path, glowData)]);
    this.rollInProgress = false;
    this.onRolled?.();
    this.remainingHops = total - 1;
    this.startHop();
  }

  private startHop(): void {
    const tiles = this.board.tiles;
    const fromTile = tiles[this.currentTileIndex];
    this.moveFrom.x = fromTile.x;
    this.moveFrom.y = fromTile.y;

    const dir = this.board.config.direction ?? -1;
    this.currentTileIndex = (this.currentTileIndex + dir + tiles.length) % tiles.length;
    const toTile = tiles[this.currentTileIndex];
    this.moveTo.x = toTile.x;
    this.moveTo.y = toTile.y;

    const useMajor = this.currentRollMajor && this.remainingHops === 0;
    this.currentHopMajor = useMajor;
    this.currentHopHeight = useMajor ? MAJOR_HOP_HEIGHT : HOP_HEIGHT;
    this.currentHopDuration = useMajor ? MAJOR_HOP_DURATION : HOP_DURATION;

    this.moveProgress = 0;
    this.isMoving = true;
    this.board.setZoom(ZOOM_OUT);
    this.hero.facingLeft = this.moveTo.x < this.moveFrom.x;
    this.hero.play('Idle');
    sfx.boardHop(0.5);
  }

  private updateMovement(deltaMS: number): void {
    if (!this.isMoving || this.awaitingCallback) return;

    this.moveProgress += (deltaMS / 1000) / this.currentHopDuration;
    if (this.moveProgress >= 1) {
      this.moveProgress = 1;
      this.isMoving = false;
      this.board.removeHighlight(this.currentTileIndex);

      const arrivedTile = this.currentTileIndex;
      const terminal = this.remainingHops === 0;
      this.floatOverlays = this.floatOverlays.filter(o => {
        if (o.tileIndex !== arrivedTile) return true;
        if (o.lifecycle === 'onPass') { o.remove(); return false; }
        if (terminal && o.lifecycle === 'onLand') { o.remove(); return false; }
        return true;
      });

      if (this.remainingHops > 0) {
        this.remainingHops--;
        this.startHop();
      } else {
        if (this.currentRollMajor) {
          this.board.shake(MAJOR_SHAKE_AMP, MAJOR_SHAKE_MS);
          sfx.boardHop(1.0);
        }
        this.hero.play('Idle');
        this.board.setZoom(1);
        this.board.clearHighlights();
        this.state.boardTileIndex = this.currentTileIndex;

        const isLastRoll = this.rollIndex === this.config.rolls.length - 1;
        const doFinalZoomOut = this.centerBoss && isLastRoll;

        const finishLanding = () => {
          if (this.onLanded) {
            this.awaitingCallback = true;
            this.onLanded(this.currentTileIndex).then(() => {
              this.awaitingCallback = false;
              this.advanceRoll();
            });
          } else {
            this.advanceRoll();
          }
        };

        if (doFinalZoomOut) {
          // Cinematic reveal: zoom out to frame the whole board with the boss
          // at center, then proceed to the fight. Opt-in via centerEnemy.
          // Zoom-out hold (0.9s) already outlasts the shake (0.35s), so the
          // shake is visible inside the hold.
          this.awaitingCallback = true;
          this.performFinalZoomOut().then(() => {
            this.awaitingCallback = false;
            finishLanding();
          });
        } else if (this.currentRollMajor) {
          // Hold the landing so the shake can play on the visible board before
          // the next scene pauses us.
          this.awaitingCallback = true;
          this.waitMS(MAJOR_SHAKE_MS).then(() => {
            this.awaitingCallback = false;
            finishLanding();
          });
        } else {
          finishLanding();
        }
      }
    }

    const t = this.moveProgress;
    const eased = t * (2 - t); // OutQuad (horizontal)
    const sx = this.moveFrom.x + (this.moveTo.x - this.moveFrom.x) * eased;
    const sy = this.moveFrom.y + (this.moveTo.y - this.moveFrom.y) * eased;
    let jumpArc: number;
    if (this.currentHopMajor) {
      // Flat-top quartic on raw t: peak mid-time with hang at apex.
      const archT = 2 * t - 1;
      jumpArc = this.currentHopHeight * (1 - archT * archT * archT * archT);
    } else {
      // Original parabolic arc (tied to horizontal easing) — unchanged.
      jumpArc = -4 * this.currentHopHeight * (eased - 0.5) * (eased - 0.5) + this.currentHopHeight;
    }
    const screenPos = this.board.tileToScreen({ x: sx, y: sy - jumpArc });
    const prevX = this.hero.spine.x;
    const prevY = this.hero.spine.y;
    this.hero.spine.x = screenPos.x;
    this.hero.spine.y = screenPos.y;
    const scaleX = this.hero.spine.scale.x;
    const scaleY = this.hero.spine.scale.y;
    this.hero.physicsTranslate((screenPos.x - prevX) / scaleX, (screenPos.y - prevY) / scaleY);
    this.board.focusOnTile(this.currentTileIndex);
  }

  /** Cinematic final reveal: zoom out to frame the whole board with the boss
   *  at center, hold briefly so the player can take it in, then resolve so the
   *  caller can start the fight. Opt-in via centerEnemy. */
  private performFinalZoomOut(): Promise<void> {
    const HOLD_S = 0.9;
    const ZOOM = 0.45;

    const sourceCoord = this.centerEnemyPosition ?? this.board.config.boardCenter;
    this.board.setZoom(ZOOM);

    return new Promise(resolve => {
      let elapsed = 0;
      const onTick = (ticker: Ticker) => {
        // Re-assert focus each frame — the terminal tick of updateMovement
        // calls focusOnTile after us, which would otherwise pull the camera
        // back to the landed tile.
        this.board.focusOnPoint(sourceCoord.x, sourceCoord.y);
        elapsed += ticker.deltaMS / 1000;
        if (elapsed >= HOLD_S) {
          this.ticker.remove(onTick);
          resolve();
        }
      };
      this.ticker.add(onTick);
    });
  }

  private waitMS(ms: number): Promise<void> {
    return new Promise(resolve => {
      let elapsed = 0;
      const onTick = (t: Ticker) => {
        elapsed += t.deltaMS;
        if (elapsed >= ms) {
          this.ticker.remove(onTick);
          resolve();
        }
      };
      this.ticker.add(onTick);
    });
  }

  private advanceRoll(): void {
    this.rollButton.finishRoll();
    this.rollIndex++;
    if (this.rollIndex < this.config.rolls.length) {
      this.prepareNextRoll();
    } else {
      this.resolveDone();
    }
  }

  getCurrentXpRatio(): number {
    return this.statsBar?.getCurrentXpRatio() ?? 0;
  }

  async playXpFly(xpFill: number): Promise<void> {
    if (!this.statsBar || this.xpFlying) return;
    const current = this.statsBar.getCurrentXpRatio();
    const delta = xpFill - current;
    if (delta <= 0) return;

    this.xpFlying = true;
    const hudTex = this.statsBar.getXpIconTexture();
    if (!hudTex) {
      throw new Error('BoardScene.playXpFly called but XpHud not constructed — variant does not include XpHud in sceneClasses.');
    }
    const tex = this.expTex ?? hudTex;
    this.expTex = tex;

    // Expand XP bar toward the logo (top-right). Logo occupies a region in the
    // top-right; reserve ~110px of margin for it and the inter-UI gap.
    const LOGO_RESERVE = 110;
    const xpLeft = this.statsBar.getXpBarLeftScreenX();
    const expandedW = Math.max(this.statsBar.getXpBarWidth(), (this.width - LOGO_RESERVE) - xpLeft);
    this.statsBar.animateXpBarWidth(expandedW, 100);

    const targetY = this.statsBar.getXpPillPosition().y;
    const target = { x: xpLeft, y: targetY };
    const cx = this.width / 2;
    const cy = this.height / 2;
    // Reduced from 22 → 10. 22 in flight = ~45 concurrent ticker callbacks
    // (fly + landing ring per icon) and overlapping XP-bar redraws on iOS.
    // 10 is visually equivalent (icons are randomly positioned + sized);
    // perf delta is large.
    const COUNT = 10;
    const STAGGER = 35;
    const per = delta / COUNT;

    const promises: Promise<void>[] = [];
    for (let i = 0; i < COUNT; i++) {
      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5, 0.5);
      const size = 26 + Math.random() * 14;
      sprite.width = size;
      sprite.height = size;
      sprite.x = cx + (Math.random() - 0.5) * 140;
      sprite.y = cy + (Math.random() - 0.5) * 140;
      this.container.addChild(sprite);
      promises.push(this.flyXpIcon(sprite, target, i * STAGGER, per));
    }
    await Promise.all(promises);
    this.statsBar.setXpFill(xpFill);
    this.statsBar.snapXpToTarget();
    this.xpFlying = false;
  }

  resetXpBar(): void {
    this.statsBar?.setXpFill(0);
    this.statsBar?.snapXpToTarget();
    this.statsBar?.resetXpBarWidth(140);
  }

  /** Fly a freshly-awarded skill icon from screen center to the hero with a
   *  pop-in, parabolic flight, and impact burst on arrival. Used after
   *  full-screen skill-reward scenes (lucky wheel, etc.) so the player sees
   *  the skill "land" on the character before the next roll begins. */
  async playSkillFly(skill: SkillConfig): Promise<void> {
    if (!this.hero) return;

    // ── Build a mini skill card matching LevelUp / LuckyWheel framing ─────
    const SLOT = 140;
    const colors = RARITY_COLORS[skill.rarity] ?? RARITY_COLORS.common;
    const card = new Container();
    const borderW = 5;
    const outW = 2;
    const totalW = borderW + outW;
    const frame = new Graphics();
    frame.roundRect(-SLOT / 2 - totalW, -SLOT / 2 - totalW, SLOT + totalW * 2, SLOT + totalW * 2, 12)
      .fill({ color: 0x000000 });
    frame.roundRect(-SLOT / 2 - borderW, -SLOT / 2 - borderW, SLOT + borderW * 2, SLOT + borderW * 2, 11)
      .fill({ color: colors.skillBorder });
    frame.roundRect(-SLOT / 2, -SLOT / 2, SLOT, SLOT, 9)
      .fill({ color: colors.skillBg });
    card.addChild(frame);

    let icon: Sprite | undefined;
    if (skill.icon) {
      try {
        const tex = await Assets.load(skill.icon);
        icon = new Sprite(tex);
        icon.anchor.set(0.5);
        const tw = icon.texture.width || 1;
        const th = icon.texture.height || 1;
        icon.scale.set((SLOT * 0.8) / Math.max(tw, th));
        card.addChild(icon);
      } catch { /* fall back to bare frame */ }
    }

    card.x = this.width / 2;
    card.y = this.height / 2;
    card.scale.set(0);
    this.container.addChild(card);

    // ── Pop-in 0 → 1.1 → 1.0 (220ms) ────────────────────────────────────
    await tween(this.ticker, 220, t => {
      const s = t < 0.6 ? (t / 0.6) * 1.1 : 1.1 + ((t - 0.6) / 0.4) * (1.0 - 1.1);
      card.scale.set(s);
    });

    await delay(this.ticker, 150);

    // ── Fly to hero with arc, scale 1.0 → 0.35 (easeIn) ─────────────────
    const startX = card.x;
    const startY = card.y;
    const targetX = this.hero.spine.x;
    const targetY = this.hero.spine.y - Math.abs(this.hero.spine.scale.y) * 200; // chest height
    const FLY_MS = 480;
    const ARC = -120;
    await tween(this.ticker, FLY_MS, t => {
      const e = t * t; // easeInQuad — accelerate into hero
      card.x = startX + (targetX - startX) * e;
      card.y = startY + (targetY - startY) * e + ARC * Math.sin(Math.PI * t);
      card.scale.set(1.0 + (0.35 - 1.0) * e);
      card.alpha = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
    });

    card.destroy();

    // ── Impact burst on arrival ──────────────────────────────────────────
    sfx.powerUp(0.9);
    this.spawnImpactBurst(targetX, targetY, colors.skillBorder);
    void this.heroPulse();
  }

  /** Gold ring expansion + white flash centered at (x, y) — the visual punch
   *  that fires when a flying skill icon hits the hero. */
  private spawnImpactBurst(x: number, y: number, ringColor: number): void {
    // Inner white flash — appears instantly, fades 80ms
    const flash = new Graphics();
    flash.circle(0, 0, 60).fill({ color: 0xffffff, alpha: 0.85 });
    flash.x = x; flash.y = y;
    flash.scale.set(0.4);
    this.container.addChild(flash);
    void tween(this.ticker, 180, t => {
      flash.scale.set(0.4 + 1.6 * t);
      flash.alpha = 0.85 * (1 - t);
    }).then(() => flash.destroy());

    // Outer ring expansion (rarity color) — slower, longer
    const ring = new Graphics();
    ring.circle(0, 0, 50).stroke({ color: ringColor, width: 8 });
    ring.x = x; ring.y = y;
    ring.scale.set(0.3);
    this.container.addChild(ring);
    void tween(this.ticker, 380, t => {
      ring.scale.set(0.3 + 2.4 * t);
      ring.alpha = 1 - t;
    }).then(() => ring.destroy());

    // Secondary thinner ring, slight delay
    const ring2 = new Graphics();
    ring2.circle(0, 0, 50).stroke({ color: 0xffffff, width: 3 });
    ring2.x = x; ring2.y = y;
    ring2.scale.set(0.2);
    ring2.alpha = 0;
    this.container.addChild(ring2);
    void delay(this.ticker, 80).then(async () => {
      await tween(this.ticker, 320, t => {
        ring2.scale.set(0.2 + 2.0 * t);
        ring2.alpha = (1 - t);
      });
      ring2.destroy();
    });
  }

  /** Brief scale-bob on the hero — feels like an upward power surge. */
  private async heroPulse(): Promise<void> {
    if (!this.hero) return;
    const baseX = this.hero.spine.scale.x;
    const baseY = this.hero.spine.scale.y;
    await tween(this.ticker, 220, t => {
      const k = t < 0.5 ? 1 + 0.18 * (t / 0.5) : 1.18 - 0.18 * ((t - 0.5) / 0.5);
      this.hero.spine.scale.set(baseX * k, baseY * k);
    });
    this.hero.spine.scale.set(baseX, baseY);
  }

  /** XP icon flight to the XP bar. Delegates the parabolic-arc + alpha-fade
   *  motion to the shared `flyIcon` utility; this wrapper provides the XP-
   *  specific arrival feedback (sfx, bar fill, pulse, landing ring). */
  private flyXpIcon(
    sprite: Sprite,
    target: { x: number; y: number },
    initialDelay: number,
    fillPer: number,
  ): Promise<void> {
    return flyIcon(this.ticker, sprite, target, {
      initialDelay,
      durationMs: 220,
      durationJitter: 80,
      arcHeight: -40,
      arcJitter: 40,
      alphaFadeStart: 0.8,
      onArrive: () => {
        sfx.experienceBar(0.7);
        this.statsBar?.addXpFill(fillPer);
        this.statsBar?.pulseXp();
        this.spawnLandingRing();
      },
    });
  }

  /** Single pooled landing-ring Graphics + ticker handler — reused across all
   *  XP / coin landings instead of allocating per-arrival. The ring restarts
   *  whenever a new landing fires, so the visual is the same as a fresh ring
   *  but the cost is a single ticker callback, not N. */
  private landingRing: Graphics | null = null;
  private landingRingElapsed = 0;
  private landingRingTickerCb: ((dt: { deltaMS: number }) => void) | null = null;

  private spawnLandingRing(): void {
    if (!this.statsBar) return;
    const iconPos = this.statsBar.getXpIconCenterScreenPosition();

    if (!this.landingRing) {
      const ring = new Graphics();
      ring.circle(0, 0, 6).stroke({ color: 0xffffff, width: 2 });
      this.container.addChild(ring);
      this.landingRing = ring;
    }
    const ring = this.landingRing;
    ring.x = iconPos.x;
    ring.y = iconPos.y;
    ring.alpha = 1;
    ring.scale.set(0.4);
    this.landingRingElapsed = 0;

    if (this.landingRingTickerCb) return; // already animating — ring restarted above
    const RING_DURATION = 220;
    const cb = (dt: { deltaMS: number }) => {
      this.landingRingElapsed += dt.deltaMS;
      const rt = Math.min(1, this.landingRingElapsed / RING_DURATION);
      ring.scale.set(0.4 + 1.4 * rt);
      ring.alpha = 1 - rt;
      if (rt >= 1) {
        this.ticker.remove(cb);
        this.landingRingTickerCb = null;
        ring.alpha = 0;
      }
    };
    this.landingRingTickerCb = cb;
    this.ticker.add(cb);
  }

  private syncHeroToTile(): void {
    if (this.isMoving) return;
    const tile = this.board.tiles[this.currentTileIndex];
    const pos = this.board.tileToScreen(tile);
    this.hero.spine.x = pos.x;
    this.hero.spine.y = pos.y;
    const baseScale = 65 * 0.90 * this.board.currentZoom / 700; // fixed hero size (independent of boardScale)
    const s = baseScale * (this.board.config.heroScale ?? 1);
    this.hero.spine.scale.set(this.hero.facingLeft ? -s : s, s);
  }

  // ── FTUE Hand ──────────────────────────────────────────

  private showFtueHand(): void {
    if (!this.ftueHand) return;
    this.ftueHandVisible = true;
    this.ftueBobElapsed = 0;
    this.ftueHand.visible = true;
    this.layoutFtueHand();
    if (this.pulseRollButton) this.rollButton.setPulsing(true);
  }

  private hideFtueHand(): void {
    if (!this.ftueHand) return;
    this.ftueHandVisible = false;
    this.ftueHand.visible = false;
    this.ftueIdleTimer = 0;
    this.ftueFirstRoll = false;
    if (this.pulseRollButton) this.rollButton.setPulsing(false);
  }

  private updateFtueHand(deltaMS: number): void {
    if (!this.ftueHand) return;

    // If hand is visible, animate bob
    if (this.ftueHandVisible) {
      this.ftueBobElapsed += deltaMS;
      const phase = this.ftueBobElapsed * FTUE_BOB_SPEED;
      this.ftueHand.y = this.ftueBaseY + Math.sin(phase) * FTUE_BOB_AMP;
      if (this.pulseRollButton) this.rollButton.setPulsePhase(phase);
      return;
    }

    // If not visible and not moving/awaiting/rolling, count idle time to re-show
    if (!this.isMoving && !this.awaitingCallback && !this.rollInProgress && !this.ftueFirstRoll) {
      this.ftueIdleTimer += deltaMS;
      if (this.ftueIdleTimer >= FTUE_IDLE_DELAY) {
        this.showFtueHand();
      }
    }
  }

  private layoutFtueHand(): void {
    if (!this.ftueHand) return;
    // Scale to target size
    const tex = this.ftueHand.texture;
    const scale = FTUE_HAND_SIZE / tex.width;
    this.ftueHand.scale.set(scale);
    // Position: centered on roll button, fingertip points down at button top
    this.ftueHand.x = this.width / 2;
    const btnScale = 0.31;
    this.ftueBaseY = this.height - 50 * btnScale - 250;
    this.ftueHand.y = this.ftueBaseY;
  }

  // ── Debug Weapon Button ────────────────────────────────

  private createDebugWeaponButton(
    weapons: { name: string; config: WeaponConfig }[],
  ): Container {
    const btn = new Container();
    const label = new Text({
      text: `W: ${weapons[0].name}`,
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontSize: 13,
        fontWeight: 'bold',
        fill: 0xffffff,
      }),
    });
    const pad = 8;
    const bg = new Graphics();
    const draw = () => {
      bg.clear();
      bg.roundRect(0, 0, label.width + pad * 2, label.height + pad * 2, 6)
        .fill({ color: 0x000000, alpha: 0.55 });
    };
    draw();
    label.position.set(pad, pad);
    btn.addChild(bg, label);

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerdown', () => {
      this.debugWeaponIndex = (this.debugWeaponIndex + 1) % weapons.length;
      const entry = weapons[this.debugWeaponIndex];
      this.state.weaponConfig = entry.config;
      this.hero.equipWeapon(entry.config);
      label.text = `W: ${entry.name}`;
      draw();
      console.log(`[debug] Weapon: ${entry.name} (${this.debugWeaponIndex + 1}/${weapons.length})`);
    });

    return btn;
  }

  private layoutDebugWeaponBtn(): void {
    if (!this.debugWeaponBtn) return;
    this.debugWeaponBtn.position.set(8, this.height - this.debugWeaponBtn.height - 8);
  }
}