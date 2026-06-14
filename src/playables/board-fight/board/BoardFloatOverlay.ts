import { Assets, Container, Sprite, Ticker } from 'pixi.js';
import type { Board } from './Board';
import type { SpineAssets } from '@shared/SpineCharacter';
import { SpineCharacter } from '@shared/SpineCharacter';
import glowRaysData from 'assets/UI/GlowRays.webp';

const BOB_AMPLITUDE = 6;
const BOB_PERIOD = 1500;
const FLOAT_OFFSET_Y = -40;
const FLOAT_SCALE_WEAPON = 0.13;
const FLOAT_SCALE_HERO = 0.08;
const FLOAT_SCALE_SPINE = 0.08;
const GLOW_SCALE = 0.6;
const GLOW_ROTATION_SPEED = 0.00015;

export type Lifecycle = 'persistent' | 'onPass' | 'onLand';

export interface TileFloatDef {
  sprite: string;
  scale: number;
  lifecycle: Lifecycle;
}

export type BoardFloatConfig =
  | { type: 'weapon'; tileIndex: number; displaySprite: string; lifecycle?: Lifecycle }
  | { type: 'hero';   tileIndex: number; heroBundle: SpineAssets; heroSkin?: string; lifecycle?: Lifecycle }
  | { type: 'sprite'; tileIndex: number; def: TileFloatDef }
  | { type: 'spine';  tileIndex: number; spineBundle: SpineAssets; lifecycle: Lifecycle; scale?: number };

export class BoardFloatOverlay {
  readonly container: Container;
  readonly tileIndex: number;
  readonly lifecycle: Lifecycle;
  private board: Board;
  private elapsed = 0;
  private baseY = 0;
  private floatScale: number;
  private mode: 'weaponFloat' | 'heroFloat' | 'spriteDeco' | 'spineDeco';
  private glow?: Sprite;
  private heroChar?: SpineCharacter;

  private constructor(
    board: Board,
    tileIndex: number,
    floatScale: number,
    mode: BoardFloatOverlay['mode'],
    lifecycle: Lifecycle,
  ) {
    this.container = new Container();
    this.board = board;
    this.tileIndex = tileIndex;
    this.floatScale = floatScale;
    this.mode = mode;
    this.lifecycle = lifecycle;
  }

  static async create(config: BoardFloatConfig, board: Board, ticker: Ticker): Promise<BoardFloatOverlay> {
    if (config.type === 'hero') {
      const glowTexture = await Assets.load(glowRaysData);
      const overlay = new BoardFloatOverlay(
        board, config.tileIndex, FLOAT_SCALE_HERO, 'heroFloat', config.lifecycle ?? 'onLand',
      );
      overlay.addGlow(glowTexture, 0, -30);
      const hero = await SpineCharacter.create(
        `boardFloat_${config.tileIndex}`, config.heroBundle, ticker,
        { skin: config.heroSkin ?? 'Base', animation: 'Idle' },
      );
      hero.spine.scale.set(FLOAT_SCALE_HERO);
      overlay.heroChar = hero;
      overlay.container.addChild(hero.spine);
      overlay.syncPosition();
      return overlay;
    }

    if (config.type === 'weapon') {
      const glowTexture = await Assets.load(glowRaysData);
      const overlay = new BoardFloatOverlay(
        board, config.tileIndex, FLOAT_SCALE_WEAPON, 'weaponFloat', config.lifecycle ?? 'onLand',
      );
      overlay.addGlow(glowTexture, 0, 0);
      const texture = await Assets.load(config.displaySprite);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.scale.set(FLOAT_SCALE_WEAPON);
      overlay.container.addChild(sprite);
      overlay.syncPosition();
      return overlay;
    }

    if (config.type === 'sprite') {
      const overlay = new BoardFloatOverlay(
        board, config.tileIndex, config.def.scale, 'spriteDeco', config.def.lifecycle,
      );
      const texture = await Assets.load(config.def.sprite);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.scale.set(config.def.scale);
      overlay.container.addChild(sprite);
      overlay.syncPosition();
      return overlay;
    }

    // config.type === 'spine' — enemy idle decoration
    const decoScale = config.scale ?? FLOAT_SCALE_SPINE;
    const overlay = new BoardFloatOverlay(
      board, config.tileIndex, decoScale, 'spineDeco', config.lifecycle,
    );
    const spineChar = await SpineCharacter.create(
      `tileDeco_${config.tileIndex}`, config.spineBundle, ticker,
    );
    const skeleton = spineChar.spine.skeleton;
    for (const name of ['Idle', 'Idle_Full', 'Idle_Loop']) {
      if (skeleton.data.findAnimation(name)) {
        spineChar.play(name, true);
        break;
      }
    }

    // Static facing: hero would be facing-left when approaching this tile if the
    // tile is to the left of the previous tile in the path. Decoration faces the
    // opposite direction so it looks toward the approaching hero. Since enemy rigs
    // are natively facing left and hero scale uses `facingLeft ? -s : s`, the two
    // sign inversions cancel and we use the hero's exact formula.
    const tiles = board.tiles;
    const dir = board.config.direction ?? -1;
    const prevIdx = (config.tileIndex - dir + tiles.length) % tiles.length;
    const heroApproachFacingLeft = tiles[config.tileIndex].x < tiles[prevIdx].x;
    const s = decoScale;
    spineChar.spine.scale.set(heroApproachFacingLeft ? -s : s, s);

    overlay.heroChar = spineChar;
    overlay.container.addChild(spineChar.spine);
    overlay.syncPosition();
    return overlay;
  }

  private addGlow(glowTexture: any, offsetX: number, offsetY: number): void {
    this.glow = new Sprite(glowTexture);
    this.glow.anchor.set(0.5);
    this.glow.tint = 0xffdd44;
    this.glow.alpha = 0.6;
    this.glow.scale.set(GLOW_SCALE);
    this.glow.x = offsetX;
    this.glow.y = offsetY;
    this.container.addChild(this.glow);
  }

  update(deltaMS: number, heroX?: number): void {
    this.elapsed += deltaMS;
    this.syncPosition(heroX);
    if (this.glow) this.glow.rotation += deltaMS * GLOW_ROTATION_SPEED;
  }

  syncPosition(heroX?: number): void {
    const tile = this.board.tiles[this.tileIndex];
    if (!tile) return;
    const pos = this.board.tileToScreen(tile);
    this.container.x = pos.x;

    if (this.mode === 'heroFloat') {
      this.container.y = pos.y;
      if (this.heroChar && heroX !== undefined) {
        const shouldFaceLeft = heroX < this.container.x;
        const s = this.floatScale;
        this.heroChar.spine.scale.set(shouldFaceLeft ? -s : s, s);
      }
      return;
    }

    if (this.mode === 'spineDeco') {
      // Facing is set statically at creation based on approach direction.
      this.container.y = pos.y;
      return;
    }

    // weaponFloat + spriteDeco: bob above tile
    this.baseY = pos.y + FLOAT_OFFSET_Y * this.board.effectiveScale / this.board.config.boardScale;
    const bob = BOB_AMPLITUDE * Math.sin(this.elapsed * (2 * Math.PI / BOB_PERIOD));
    this.container.y = this.baseY + bob;
  }

  remove(): void {
    this.container.parent?.removeChild(this.container);
    this.container.destroy({ children: true });
  }
}
