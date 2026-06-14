import { AnimatedSprite, Assets, Container, Rectangle, Texture } from 'pixi.js';

export interface SpriteEffectConfig {
  /** Webpack-imported base64 data URL for the spritesheet PNG. */
  spriteData: string;
  /** Number of frame columns in the grid. */
  columns: number;
  /** Number of frame rows in the grid. */
  rows: number;
  /** Playback speed in frames per second (default 24). */
  fps?: number;
  /** Total frames if the last row isn't full (default columns × rows). */
  totalFrames?: number;
}

export interface PlayOptions {
  loop?: boolean;
  scale?: number;
  anchor?: { x: number; y: number };
  onComplete?: () => void;
}

/**
 * Reusable spritesheet effect. Load once, spawn many instances.
 *
 * Usage:
 *   const slash = await SpriteEffect.load({ spriteData: slashPng, columns: 4, rows: 4 });
 *   slash.play(parentContainer, x, y);           // plays once, auto-destroys
 *   slash.play(parent, x, y, { loop: true });    // loops until manually destroyed
 */
export class SpriteEffect {
  private frames: Texture[];
  private fps: number;

  private constructor(frames: Texture[], fps: number) {
    this.frames = frames;
    this.fps = fps;
  }

  static async load(config: SpriteEffectConfig): Promise<SpriteEffect> {
    const texture = await Assets.load(config.spriteData);
    const frameW = texture.width / config.columns;
    const frameH = texture.height / config.rows;
    const total = config.totalFrames ?? config.columns * config.rows;

    const frames: Texture[] = [];
    for (let i = 0; i < total; i++) {
      const col = i % config.columns;
      const row = Math.floor(i / config.columns);
      frames.push(new Texture({
        source: texture.source,
        frame: new Rectangle(col * frameW, row * frameH, frameW, frameH),
      }));
    }

    return new SpriteEffect(frames, config.fps ?? 24);
  }

  /** Spawn an animated instance. Non-looping effects auto-destroy on completion. */
  play(parent: Container, x: number, y: number, options?: PlayOptions): AnimatedSprite {
    const anim = new AnimatedSprite(this.frames);
    anim.anchor.set(options?.anchor?.x ?? 0.5, options?.anchor?.y ?? 0.5);
    anim.position.set(x, y);
    anim.animationSpeed = this.fps / 60;
    anim.loop = options?.loop ?? false;

    if (options?.scale) anim.scale.set(options.scale);

    if (!anim.loop) {
      anim.onComplete = () => {
        options?.onComplete?.();
        anim.destroy();
      };
    }

    parent.addChild(anim);
    anim.play();
    return anim;
  }
}
