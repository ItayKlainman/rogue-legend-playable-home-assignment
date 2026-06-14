import { Assets, Container, Graphics, Renderer, Sprite, Text, Texture, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import { SpineCharacter } from '@shared/SpineCharacter';
import { GAME_FONT_STACK } from '@shared/gameFont';
import { Board } from '../../board-fight/board/Board';
import { board1Config } from '../../board-fight/board/board1';
import { BoardDice } from '../../board-fight/BoardDice';
import { RollButton } from '../../board-fight/RollButton';
import { skeletonKingBundle } from '../../board-fight/catalog/enemies/stage1/skeletonKing';
import { WARRIORS_BLADE } from '../../board-fight/catalog/weapons/warriorBlade';
import { HERO_BASE_BUNDLE, HERO_BASE_SKIN } from '../catalog';
import rollButtonData from 'assets/UI/RollButton.webp';
import rollButtonBackData from 'assets/UI/RollButton_Back.webp';
import rollButtonFrontData from 'assets/UI/RollButton_Front.webp';
import handData from 'assets/UI/FTUE_Hand.webp';

// Hop tuning — mirrors board-fight/scenes/BoardScene.ts so the motion matches
// the real game board exactly.
const HOP_DURATION = 0.125;       // s, normal hop
const HOP_HEIGHT = 25;            // px, normal hop arc
const MAJOR_HOP_DURATION = 0.28;  // s, final hop onto the boss tile
const MAJOR_HOP_HEIGHT = 75;      // px, final hop arc
const MAJOR_SHAKE_AMP = 16;
const MAJOR_SHAKE_MS = 350;
const ZOOM_OUT = 0.9;

const START_TILE = 0;
const HOPS = 4;                   // hero hops 4 tiles to the Boss Tile

const SETTLE_MS = 400;            // brief idle hold before the roll
const HOLD_MS = 600;              // hold on the boss tile before resolving
const AUTO_ROLL_MS = 8000;        // late fallback: auto-roll if the player stays idle

/**
 * Cinematic board beat for the egg-summon flow: the REAL game board appears with
 * the hero on it, the 3D dice auto-rolls, the hero hops along the tiles to the
 * Boss Tile (where the Skeleton King waits), then resolves `done`.
 *
 * Composed from board-fight's real `Board` + `BoardDice` rather than reusing
 * `BoardScene` (which needs a tap on its RollButton and pulls the gitignored
 * `Main_Character.build.json`). The hero uses egg-summon's committed
 * `HERO_BASE_BUNDLE` instead.
 */
export interface BoardRollOptions {
  /** Tiles the hero hops this roll (default 4). */
  hops?: number;
  /** Show the Skeleton King boss marker on the destination tile (default true). */
  showBossMarker?: boolean;
  /** Fired once, the instant the hero's final hop lands on the destination tile. */
  onLand?: () => void;
}

export class BoardRollScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;
  private exited = false;

  private marginFill!: Graphics;
  private board!: Board;
  private hero!: SpineCharacter;
  private boss?: SpineCharacter;
  private dice?: BoardDice;

  // Tap-to-roll (authentic: the real game waits for a Roll-button tap).
  private rollButton!: RollButton;
  private handTex!: Texture;
  private hand!: Sprite;
  private rollNudge!: Text;
  private rolled = false;
  private resolveRoll?: (v: { d1: number; d2: number }) => void;
  private elapsed = 0;
  private handRestY = 0;

  private ready = false;
  private paused = false;
  private started = false;

  // Movement state (mirrors BoardScene.updateMovement)
  private currentTileIndex = START_TILE;
  private isMoving = false;
  private moveProgress = 0;
  private moveFrom = { x: 0, y: 0 };
  private moveTo = { x: 0, y: 0 };
  private remainingHops = 0;
  private currentHopMajor = false;
  private currentHopHeight = HOP_HEIGHT;
  private currentHopDuration = HOP_DURATION;
  private onAllHopsDone?: () => void;

  constructor(
    private renderer: Renderer,
    private ticker: Ticker,
    private width: number,
    private height: number,
    private opts: BoardRollOptions = {},
  ) {
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }

  private get hops(): number { return this.opts.hops ?? HOPS; }

  async enter(): Promise<void> {
    // Real board background + camera.
    this.board = await Board.create(board1Config, this.width, this.height, this.ticker);
    this.marginFill = new Graphics();
    this.container.addChildAt(this.marginFill, 0);
    this.container.addChild(this.board.sprite);

    // Boss-tile marker: Skeleton King waiting at the target tile, added before
    // the hero so the hero renders in front when it lands.
    const bossTileIndex = this.bossTileIndex();
    if (this.opts.showBossMarker ?? true) {
      try {
        this.boss = await SpineCharacter.create('boardBoss', skeletonKingBundle, this.ticker);
        const skel = this.boss.spine.skeleton;
        for (const name of ['Idle', 'Idle_Full', 'Idle_Loop']) {
          if (skel.data.findAnimation(name)) { this.boss.play(name, true); break; }
        }
        const bs = skeletonKingBundle.defaultScale ?? 0.16;
        this.boss.spine.scale.set(bs, bs);
        this.container.addChild(this.boss.spine);
      } catch {
        // Boss marker is decorative — if its rig fails to load, hop to the tile anyway.
        this.boss = undefined;
      }
    }

    // Hero — egg-summon's committed bundle (NOT board-fight's build-only heroBundle).
    this.hero = await SpineCharacter.create('hero', HERO_BASE_BUNDLE, this.ticker, {
      skin: HERO_BASE_SKIN,
      animation: 'Idle',
    });
    this.hero.facingLeft = true;
    this.container.addChild(this.hero.spine);
    await this.hero.equipWeapon(WARRIORS_BLADE);

    // 3D dice — anchored near the hero's current tile in source-image coords.
    this.dice = new BoardDice(
      this.container,
      this.renderer,
      this.ticker,
      this.board,
      () => this.diceAnchorSrc(),
    );

    // Real Roll button (3D-dice mode) — the player taps it to roll, like the game.
    this.rollButton = await RollButton.create(
      { button: rollButtonData, back: rollButtonBackData, front: rollButtonFrontData },
      (d1, d2) => { if (!this.rolled) { this.rolled = true; this.resolveRoll?.({ d1, d2 }); } },
      '3d',
    );
    this.rollButton.container.visible = false;
    this.container.addChild(this.rollButton.container);

    // "TAP TO ROLL!" nudge + FTUE hand on the button.
    this.rollNudge = new Text({
      text: 'TAP TO ROLL!',
      style: { fontFamily: GAME_FONT_STACK, fontWeight: 'normal', fontSize: 34, fill: 0xffe066, stroke: { color: 0x000000, width: 6 } },
    });
    this.rollNudge.anchor.set(0.5);
    this.rollNudge.visible = false;
    this.container.addChild(this.rollNudge);
    this.handTex = await Assets.load(handData);
    this.hand = new Sprite(this.handTex);
    this.hand.anchor.set(0.381, 0.039);
    this.hand.visible = false;
    this.container.addChild(this.hand);

    // Frame the start tile immediately, then sync the hero onto it.
    this.board.focusOnTile(this.currentTileIndex);
    this.board.snapCamera();
    this.syncHeroToTile();
    this.syncBossToTile(bossTileIndex);

    this.ready = true;
    this.layout(this.width, this.height);
    void this.runBeat();
  }

  private async runBeat(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // Brief settle: board + hero idle, camera framed on the start tile.
    await this.wait(SETTLE_MS);
    this.board.setZoom(ZOOM_OUT);

    // Wait for the player to tap ROLL (authentic core mechanic). The dice are
    // scripted to total HOPS so the hero lands on the boss tile. A late fallback
    // auto-rolls if the player stays idle so the ad never dead-ends.
    this.rollButton.setNextRoll(this.hops);
    this.rollButton.container.visible = true;
    this.rollButton.setPulsing(true);
    this.showRollNudge(true);
    // Fallback dice that sum to `hops` (so the auto-roll matches the movement).
    const fb1 = Math.min(this.hops - 1, 6);
    const fb2 = this.hops - fb1;
    const { d1, d2 } = await new Promise<{ d1: number; d2: number }>((resolve) => {
      this.resolveRoll = resolve;
      void this.wait(AUTO_ROLL_MS).then(() => { if (!this.rolled) { this.rolled = true; resolve({ d1: fb1, d2: fb2 }); } });
    });
    this.rollButton.setPulsing(false);
    this.showRollNudge(false);

    // Roll the 3D dice, then hop the hero `hops` tiles to the destination tile.
    if (this.dice) {
      await this.dice.throw(d1, d2);
    }
    this.rollButton.finishRoll();
    this.rollButton.container.visible = false;
    await this.hopTo(this.hops);
    // Fire the land callback the instant the final hop settles (boss-land CTA).
    this.opts.onLand?.();

    // Hold on the destination tile, then resolve.
    await this.wait(HOLD_MS);
    this.resolveDone();
  }

  /** Run `count` hops, resolving when the hero lands on the final tile. */
  private hopTo(count: number): Promise<void> {
    return new Promise((resolve) => {
      this.onAllHopsDone = resolve;
      this.remainingHops = count - 1;
      this.startHop();
    });
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

    const useMajor = this.remainingHops === 0;
    this.currentHopMajor = useMajor;
    this.currentHopHeight = useMajor ? MAJOR_HOP_HEIGHT : HOP_HEIGHT;
    this.currentHopDuration = useMajor ? MAJOR_HOP_DURATION : HOP_DURATION;

    this.moveProgress = 0;
    this.isMoving = true;
    this.hero.facingLeft = this.moveTo.x < this.moveFrom.x;
    this.hero.play('Idle');
  }

  /** Per-frame hop progression — mirrors BoardScene.updateMovement. */
  private updateMovement(deltaMS: number): void {
    if (!this.isMoving) return;

    this.moveProgress += (deltaMS / 1000) / this.currentHopDuration;
    if (this.moveProgress >= 1) {
      this.moveProgress = 1;
      this.isMoving = false;

      if (this.remainingHops > 0) {
        this.remainingHops--;
        this.startHop();
      } else {
        // Landed on the boss tile.
        if (this.currentHopMajor) this.board.shake(MAJOR_SHAKE_AMP, MAJOR_SHAKE_MS);
        this.hero.play('Idle');
        this.board.setZoom(1);
        const done = this.onAllHopsDone;
        this.onAllHopsDone = undefined;
        done?.();
      }
    }

    const t = this.moveProgress;
    const eased = t * (2 - t); // OutQuad (horizontal)
    const sx = this.moveFrom.x + (this.moveTo.x - this.moveFrom.x) * eased;
    const sy = this.moveFrom.y + (this.moveTo.y - this.moveFrom.y) * eased;
    let jumpArc: number;
    if (this.currentHopMajor) {
      const archT = 2 * t - 1;
      jumpArc = this.currentHopHeight * (1 - archT * archT * archT * archT);
    } else {
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

  /** Place the hero on its current tile at the board-matched scale. Skipped
   *  while a hop is in flight (updateMovement owns position then). */
  private syncHeroToTile(): void {
    if (this.isMoving) return;
    const tile = this.board.tiles[this.currentTileIndex];
    const pos = this.board.tileToScreen(tile);
    this.hero.spine.x = pos.x;
    this.hero.spine.y = pos.y;
    // Fixed hero size, independent of boardScale — matches BoardScene.syncHeroToTile.
    const baseScale = 65 * 0.90 * this.board.currentZoom / 700;
    const s = baseScale * (this.board.config.heroScale ?? 1);
    this.hero.spine.scale.set(this.hero.facingLeft ? -s : s, s);
  }

  private syncBossToTile(tileIndex: number): void {
    if (!this.boss) return;
    const tile = this.board.tiles[tileIndex];
    const pos = this.board.tileToScreen(tile);
    this.boss.spine.x = pos.x;
    this.boss.spine.y = pos.y;
    const baseScale = 65 * 0.90 * this.board.currentZoom / 700;
    const s = baseScale * (skeletonKingBundle.defaultScale ?? 0.16) / (HERO_BASE_BUNDLE.defaultScale ?? 0.12);
    this.boss.spine.scale.set(s, s);
  }

  /** Source-image anchor for the dice — in the open CENTRE of the board (inside
   *  the path loop, board centre ≈ y 800), above the hero's head so they don't
   *  land on the hero or the path. The hero hops away up-left from the start tile. */
  private diceAnchorSrc(): { x: number; y: number } {
    const hero = this.board.tiles[this.currentTileIndex];
    return { x: hero.x, y: hero.y - 215 };
  }

  private bossTileIndex(): number {
    const dir = this.board.config.direction ?? -1;
    const n = this.board.tiles.length;
    return (START_TILE + dir * this.hops + n * this.hops) % n;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      let elapsed = 0;
      const handler = (t: Ticker) => {
        if (this.paused) return;
        elapsed += t.deltaMS;
        if (elapsed >= ms) { this.ticker.remove(handler); resolve(); }
      };
      this.ticker.add(handler);
    });
  }

  private showRollNudge(show: boolean): void {
    this.rollNudge.visible = show;
    this.hand.visible = show;
  }

  update(deltaMS: number): void {
    if (!this.ready || this.paused || this.exited) return;
    this.elapsed += deltaMS;
    this.rollButton?.update(deltaMS);
    if (this.rollNudge?.visible) {
      this.rollButton.setPulsePhase(this.elapsed / 300);
      const phase = (this.elapsed % 600) / 600;
      const press = Math.max(0, Math.sin(phase * Math.PI * 2));
      this.hand.y = this.handRestY + press * 16;
      this.rollNudge.alpha = 0.6 + 0.4 * Math.abs(Math.sin(this.elapsed / 300));
    }
    this.updateMovement(deltaMS);
    this.syncHeroToTile();
    this.syncBossToTile(this.bossTileIndex());
    this.board.update();
  }

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }

  async exit(): Promise<void> {
    // Stop update() touching the (about-to-be-destroyed) hero/boss spines on any
    // stray tick during the seamless handoff.
    this.exited = true;
    // BoardDice owns its own ticker callback + spine display objects; destroy it
    // explicitly (mirrors BoardScene.exit) before tearing down the container so
    // its ticker handler is removed and we don't double-free.
    this.dice?.destroy();
    this.dice = undefined;
    this.container.destroy({ children: true });
  }

  layout(width: number, height: number, fillX = 0, fillW = width, fillY = 0, fillH = height): void {
    this.width = width;
    this.height = height;
    if (this.marginFill && !this.marginFill.destroyed) {
      this.marginFill.clear().rect(fillX, fillY, fillW, fillH).fill(0x12100f);
    }
    // Cover the FULL viewport (fill rect), not just the design column, so the
    // board grass reaches every edge — otherwise the near-black marginFill shows
    // as a black band at the top/bottom on phones taller than the design.
    if (this.board) this.board.layout(fillW, fillH, fillX, fillY);
    if (this.rollButton) {
      this.rollButton.layout(width, height);
      const u = Math.min(width, height);
      this.hand.height = u * 0.22;
      this.hand.scale.x = this.hand.scale.y;
      this.handRestY = height - u * 0.30;
      this.hand.position.set(width / 2, this.handRestY);   // fingertip centered on the roll button
      this.rollNudge.position.set(width / 2, height - u * 0.46);
    }
  }
}
