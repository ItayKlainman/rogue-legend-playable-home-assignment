import { Assets, Graphics, Sprite, Ticker } from 'pixi.js';
import type { BoardConfig, TileCoord } from './BoardConfig';

const CAMERA_LERP = 0.08;
const LOOK_AHEAD_TILES = 1;
const CENTER_PULL = 40;
const CAMERA_MAX_OFFSET = { x: 100, y: 80 };
const ZOOM_LERP = 0.06;
const HIGHLIGHT_SCALE = 0.2725;
const HIGHLIGHT_CORNER_SCALE = 0.424;
const HIGHLIGHT_STAGGER_MS = 50;

export class Board {
  readonly sprite: Sprite;
  readonly config: BoardConfig;
  private screenWidth: number;
  private screenHeight: number;
  // Top-left origin of the viewport in the board's coordinate space. Lets a caller
  // place the covered region anywhere (e.g. the full fill rect, whose origin is
  // negative/offset on iPad/landscape) instead of assuming it starts at (0,0).
  private originX = 0;
  private originY = 0;
  private ticker: Ticker;

  private cameraTarget = { x: 0, y: 0 };
  private cameraPos = { x: 0, y: 0 };
  private zoomTarget = 1;
  currentZoom = 1;
  private highlights = new Map<number, Sprite[]>();

  private shakeAmp = 0;
  private shakeDurationMS = 0;
  private shakeElapsedMS = 0;
  private shakeOffset = { x: 0, y: 0 };

  private constructor(sprite: Sprite, config: BoardConfig, width: number, height: number, ticker: Ticker) {
    this.sprite = sprite;
    this.config = config;
    this.screenWidth = width;
    this.screenHeight = height;
    this.ticker = ticker;
  }

  static async create(config: BoardConfig, width: number, height: number, ticker: Ticker): Promise<Board> {
    const texture = await Assets.load(config.boardImageData);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0, 0);
    sprite.scale.set(config.boardScale);
    const board = new Board(sprite, config, width, height, ticker);
    board.positionSprite();
    return board;
  }

  get effectiveScale(): number {
    return this.config.boardScale * this.currentZoom;
  }

  get tiles(): TileCoord[] {
    return this.config.tiles;
  }

  tileToScreen(tile: TileCoord): { x: number; y: number } {
    return {
      x: this.sprite.x + tile.x * this.effectiveScale,
      y: this.sprite.y + tile.y * this.effectiveScale,
    };
  }

  setZoom(zoom: number): void {
    this.zoomTarget = Math.max(zoom, this.minZoom());
  }

  /** Smallest zoom that still keeps the board covering the viewport on both
   *  axes. Requesting a smaller zoom would expose area outside the image. */
  private minZoom(): number {
    const imgW = this.sprite.texture.width;
    const imgH = this.sprite.texture.height;
    const bs = this.config.boardScale;
    return Math.max(this.screenWidth / (imgW * bs), this.screenHeight / (imgH * bs));
  }

  /** Calculate camera target from a tile index with look-ahead and center pull. */
  focusOnTile(tileIndex: number): void {
    const tiles = this.config.tiles;
    const cur = tiles[tileIndex];
    const dir = this.config.direction ?? -1;
    const nextIdx = (tileIndex + dir * LOOK_AHEAD_TILES + tiles.length) % tiles.length;
    const next = tiles[nextIdx];

    const t = LOOK_AHEAD_TILES / Math.ceil(LOOK_AHEAD_TILES);
    let tx = cur.x + (next.x - cur.x) * t;
    let ty = cur.y + (next.y - cur.y) * t;

    const center = this.config.boardCenter;
    const dx = center.x - tx;
    const dy = center.y - ty;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    tx += (dx / dist) * CENTER_PULL;
    ty += (dy / dist) * CENTER_PULL;

    const clampX = tx - cur.x;
    const clampY = ty - cur.y;
    if (Math.abs(clampX) > CAMERA_MAX_OFFSET.x) tx = cur.x + Math.sign(clampX) * CAMERA_MAX_OFFSET.x;
    if (Math.abs(clampY) > CAMERA_MAX_OFFSET.y) ty = cur.y + Math.sign(clampY) * CAMERA_MAX_OFFSET.y;

    this.cameraTarget.x = tx;
    this.cameraTarget.y = ty;
  }

  /** Set camera target to a source-image point directly (no look-ahead). */
  focusOnPoint(x: number, y: number): void {
    this.cameraTarget.x = x;
    this.cameraTarget.y = y;
  }

  /** Snap camera to target immediately (no lerp). Call after focusOnTile on init. */
  snapCamera(): void {
    this.cameraPos.x = this.cameraTarget.x;
    this.cameraPos.y = this.cameraTarget.y;
    this.positionSprite();
  }

  /** Per-frame update: camera lerp, zoom lerp, clamp, reposition. */
  update(): void {
    this.cameraPos.x += (this.cameraTarget.x - this.cameraPos.x) * CAMERA_LERP;
    this.cameraPos.y += (this.cameraTarget.y - this.cameraPos.y) * CAMERA_LERP;
    this.currentZoom += (this.zoomTarget - this.currentZoom) * ZOOM_LERP;

    // Clamp camera so the visible area stays within the board image
    const s = this.effectiveScale;
    const halfW = (this.screenWidth / 2) / s;
    const halfH = (this.screenHeight / 2) / s;
    const imgW = this.sprite.texture.width;
    const imgH = this.sprite.texture.height;
    this.cameraPos.x = Math.max(halfW, Math.min(imgW - halfW, this.cameraPos.x));
    this.cameraPos.y = Math.max(halfH, Math.min(imgH - halfH, this.cameraPos.y));

    this.positionSprite();
  }

  layout(width: number, height: number, originX = 0, originY = 0): void {
    this.screenWidth = width;
    this.screenHeight = height;
    this.originX = originX;
    this.originY = originY;
    this.positionSprite();
  }

  /** Stagger-reveal highlights on tiles the player will pass. Returns when all are shown. */
  async showHighlights(
    tileIndices: number[],
    glowData: string,
  ): Promise<void> {
    this.clearHighlights();
    const glowTex = await Assets.load(glowData);

    for (let i = 0; i < tileIndices.length; i++) {
      if (i > 0) await this.tickerDelay(HIGHLIGHT_STAGGER_MS);
      const tile = this.config.tiles[tileIndices[i]];

      const glow = new Sprite(glowTex);
      glow.anchor.set(0.5, 0.5);
      const isCorner = this.config.cornerTiles?.includes(tileIndices[i]) ?? false;
      glow.position.set(tile.x, tile.y - (isCorner ? 20 : 12));
      const highlightCompensation = 0.90 / this.config.boardScale;
      glow.scale.set((isCorner ? HIGHLIGHT_CORNER_SCALE : HIGHLIGHT_SCALE) * highlightCompensation);
      this.sprite.addChild(glow);

      this.highlights.set(tileIndices[i], [glow]);
    }
  }

  removeHighlight(tileIndex: number): void {
    const sprites = this.highlights.get(tileIndex);
    if (sprites) {
      sprites.forEach(s => { s.destroy(); });
      this.highlights.delete(tileIndex);
    }
  }

  clearHighlights(): void {
    this.highlights.forEach(sprites => sprites.forEach(s => { s.destroy(); }));
    this.highlights.clear();
  }

  /** Camera shake — screen-space offset on the board sprite. Decays over
   *  `durationMS`. Applied on top of camera clamp so it bypasses clamping
   *  cleanly and won't fight the camera lerp. */
  shake(amplitude: number, durationMS: number): void {
    this.shakeAmp = amplitude;
    this.shakeDurationMS = durationMS;
    this.shakeElapsedMS = 0;
    const handler = (t: Ticker) => {
      this.shakeElapsedMS += t.deltaMS;
      if (this.shakeElapsedMS >= this.shakeDurationMS) {
        this.shakeOffset.x = 0;
        this.shakeOffset.y = 0;
        this.ticker.remove(handler);
        return;
      }
      const decay = 1 - this.shakeElapsedMS / this.shakeDurationMS;
      const e = this.shakeElapsedMS;
      this.shakeOffset.x = Math.sin(e * 0.018) * this.shakeAmp * decay * 0.4;
      this.shakeOffset.y = Math.cos(e * 0.022) * this.shakeAmp * decay;
    };
    this.ticker.add(handler);
  }

  drawDebugMarkers(): void {
    const markers = new Graphics();
    const dotRadius = 4 / this.config.boardScale;
    this.config.tiles.forEach((tile, i) => {
      const color = i === 0 ? 0x00ff00 : 0xff3333;
      markers.circle(tile.x, tile.y, dotRadius).fill({ color });
    });
    this.sprite.addChild(markers);
  }

  private tickerDelay(ms: number): Promise<void> {
    return new Promise(resolve => {
      let elapsed = 0;
      const handler = (t: Ticker) => {
        elapsed += t.deltaMS;
        if (elapsed >= ms) {
          this.ticker.remove(handler);
          resolve();
        }
      };
      this.ticker.add(handler);
    });
  }

  private positionSprite(): void {
    const s = this.effectiveScale;
    this.sprite.scale.set(s);
    this.sprite.position.set(
      this.originX + this.screenWidth / 2 - this.cameraPos.x * s + this.shakeOffset.x,
      this.originY + this.screenHeight / 2 - this.cameraPos.y * s + this.shakeOffset.y,
    );
  }
}
