import { Container, Renderer, Ticker } from 'pixi.js';
import { Die3D, DieTrack } from './Die3D';
import { bakeFaceTextures } from './dicePips';
import type { Board } from './board/Board';
import diceAnimData from './data/diceAnimations.json';
import * as sfx from './sfx';

interface ClipData {
  name: string;
  duration: number;
  animationLength: number;
  die1: DieTrack;
  die2: DieTrack;
}

// webpack loads .json via asset/source → raw string; parse it once.
const CLIPS: ClipData[] = (JSON.parse(diceAnimData as unknown as string) as { clips: ClipData[] }).clips;

// Visual size of each cube. Matches a roughly tile-scale die on screen.
const CUBE_HALF = 24;
// Unity units → screen px for animation position curves. Tuned so the authored
// ~3-unit drop reads as ~2 tiles of motion on our board.
const POS_SCALE = 45;
// Animator state plays clips at 2× speed (Dice_Roll.controller m_Speed: 2).
const PLAYBACK_RATE = 2.0;
const SETTLE_SHAKE_AMP = 8;
const SETTLE_SHAKE_MS = 200;
const VIBRATE_MS = 60;
const CLIP = CLIPS[0];

export class BoardDice {
  private readonly parent: Container;
  private readonly board: Board;
  private readonly ticker: Ticker;
  private readonly getSourceAnchor: () => { x: number; y: number };
  private readonly container: Container;
  private readonly die1: Die3D;
  private readonly die2: Die3D;
  private tickerCb: ((t: Ticker) => void) | null = null;
  private avgEndX = 0;
  private avgEndY = 0;
  private hasActiveThrow = false;
  // Source-image anchor captured once per throw so the dice stay fixed where
  // they landed even as the hero advances past that tile.
  private lockedSrcX = 0;
  private lockedSrcY = 0;

  constructor(
    parent: Container,
    renderer: Renderer,
    ticker: Ticker,
    board: Board,
    getSourceAnchor: () => { x: number; y: number },
  ) {
    this.parent = parent;
    this.board = board;
    this.ticker = ticker;
    this.getSourceAnchor = getSourceAnchor;

    this.container = new Container();
    this.container.visible = false;
    this.parent.addChild(this.container);

    const textures = bakeFaceTextures(renderer);
    this.die1 = new Die3D(CUBE_HALF);
    this.die1.setFaceTextures(textures);
    this.die2 = new Die3D(CUBE_HALF);
    this.die2.setFaceTextures(textures);
    this.container.addChild(this.die1.outer, this.die2.outer);
  }

  throw(die1Value: number, die2Value: number): Promise<void> {
    return new Promise(resolve => {
      const clip = CLIP;

      this.die1.loadClip(clip.die1, clip.duration, clip.animationLength, die1Value, POS_SCALE, PLAYBACK_RATE);
      this.die2.loadClip(clip.die2, clip.duration, clip.animationLength, die2Value, POS_SCALE, PLAYBACK_RATE);

      // Cache the animation's end position (averaged across the two dice) so each
      // frame we can re-anchor the dice: outer = anchor - animEnd*POS_SCALE. Lets
      // the dice settle AT the anchor and keeps them anchored when the board pans.
      const die1End = clip.die1.position[clip.die1.position.length - 1];
      const die2End = clip.die2.position[clip.die2.position.length - 1];
      this.avgEndX = (die1End.x + die2End.x) / 2;
      this.avgEndY = (die1End.y + die2End.y) / 2;
      // Lock the source-image anchor now. Re-projected each frame via
      // tileToScreen so board pan/shake still tracks, but the point is fixed
      // in board coords so the dice don't drift when the hero advances.
      const src = this.getSourceAnchor();
      this.lockedSrcX = src.x;
      this.lockedSrcY = src.y;
      this.hasActiveThrow = true;
      this.updateAnchorPosition();

      this.container.visible = true;
      sfx.diceRoll();

      let done1 = false;
      let done2 = false;
      const tryFinish = () => {
        if (!done1 || !done2) return;
        this.triggerSettlePolish();
        resolve();
      };
      this.die1.setOnSettle(() => { done1 = true; tryFinish(); });
      this.die2.setOnSettle(() => { done2 = true; tryFinish(); });

      this.ensureTicker();
    });
  }

  private ensureTicker(): void {
    if (this.tickerCb) return;
    const cb = (t: Ticker) => {
      this.die1.update(t.deltaMS);
      this.die2.update(t.deltaMS);
      if (this.hasActiveThrow) this.updateAnchorPosition();
    };
    this.tickerCb = cb;
    this.ticker.add(cb);
  }

  private stopTicker(): void {
    if (this.tickerCb) {
      this.ticker.remove(this.tickerCb);
      this.tickerCb = null;
    }
  }

  private updateAnchorPosition(): void {
    const anchor = this.board.tileToScreen({ x: this.lockedSrcX, y: this.lockedSrcY });
    // Unity Y-up → screen Y-down: subtracting Y gets a positive screen-Y add.
    const ax = anchor.x - this.avgEndX * POS_SCALE;
    const ay = anchor.y + this.avgEndY * POS_SCALE;
    this.die1.setWorldPos(ax, ay);
    this.die2.setWorldPos(ax, ay);
  }

  private triggerSettlePolish(): void {
    try { navigator?.vibrate?.(VIBRATE_MS); } catch { /* unsupported */ }
  }

  destroy(): void {
    this.stopTicker();
    this.die1.destroy();
    this.die2.destroy();
    this.container.destroy({ children: true });
  }
}
