import { Assets, Container, Graphics, Sprite, Ticker } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { Spine, SpineTexture } from '@esotericsoftware/spine-pixi-v8';
import { TextureAtlas } from '@esotericsoftware/spine-core';

/** Config for a swappable weapon sprite attached to a Spine slot.
 *  Position values are in Unity units (auto-converted to Spine skeleton pixels). */
export interface WeaponGlowConfig {
  color: number;
  distance?: number;      // glow spread in px (default 15)
  outerStrength?: number; // glow intensity (default 4)
  quality?: number;       // 0–1, more = smoother but heavier (default 1)
  pulseSpeed?: number;    // ms per full alpha cycle (default 1200)
}

export interface WeaponConfig {
  spriteData: string;
  position: { x: number; y: number };
  rotation: number;
  scale: number;
  glow?: WeaponGlowConfig;
  /** Procedural additive glow pinned to a point on the weapon art (e.g. a staff's ember gem).
   *  Cheap alternative to GlowFilter. `at` is the gem centre as a fraction of the texture
   *  (0..1, origin top-left); `radiusFrac` is the glow radius as a fraction of texture width. */
  ember?: { color: number; at: { x: number; y: number }; radiusFrac: number };
}

// Unity skeleton import scale is 0.01 → 1 Unity unit = 100 Spine pixels
const UNITY_TO_SPINE = 100;

/** Stable cache key for a raw asset string. Webpack interns the same import
 *  as the same string instance across modules, so identity-as-key works. */
const sharedKeyForString = new Map<string, string>();
let sharedKeyCounter = 0;
function sharedKey(raw: string): string {
  let key = sharedKeyForString.get(raw);
  if (!key) {
    key = `__spine_shared_${sharedKeyCounter++}`;
    sharedKeyForString.set(raw, key);
  }
  return key;
}


/** Raw Spine asset data as imported by webpack (no HTTP). */
export interface SpineAssets {
  atlasRaw: string;
  jsonRaw: string;
  pngData: string | string[];
  /** Default display scale for this character. Overridden by per-actor `scale`. */
  defaultScale?: number;
  /** Scale override for VS intro screen. */
  vsScale?: number;
}

export class SpineCharacter {
  readonly spine: Spine;
  private weaponContainer: Container | null = null;
  private weaponSlot: string | null = null;
  private weaponGlow: Sprite | null = null;
  private weaponGlowBaseScale = 1;
  private weaponGlowElapsed = 0;
  private weaponGlowFilter: GlowFilter | null = null;
  private weaponGlowCfg: WeaponGlowConfig | null = null;
  private weaponGlowFilterElapsed = 0;
  private weaponEmber: Graphics | null = null;
  private weaponEmberElapsed = 0;

  private constructor(spine: Spine) {
    this.spine = spine;
  }

  /** Async factory: loads webpack-bundled assets and returns a ready-to-use character. */
  static async create(
    id: string,
    assets: SpineAssets,
    ticker: Ticker,
    options?: { skin?: string; animation?: string },
  ): Promise<SpineCharacter> {
    // Unique cache keys prevent collisions between multiple characters
    const atlasKey = `${id}Atlas`;
    const dataKey = `${id}Data`;

    // Re-use parsed atlas/JSON across instances of the same character bundle.
    // JSON.parse on Main_Character is ~671 KB → 30–80 ms blocking on iOS;
    // skipping it on subsequent fights / weapon changes is the difference
    // between a snappy and a stuttery scene transition.
    const sharedAtlasKey = sharedKey(assets.atlasRaw);
    const sharedDataKey = sharedKey(assets.jsonRaw);

    let atlas = Assets.cache.get(sharedAtlasKey) as TextureAtlas | undefined;
    if (!atlas) {
      const pngDataArr = Array.isArray(assets.pngData) ? assets.pngData : [assets.pngData];
      const pngTextures = await Promise.all(pngDataArr.map(d => Assets.load(d)));
      atlas = new TextureAtlas(assets.atlasRaw);
      const pages = atlas.pages;
      for (let i = 0; i < pages.length; i++) {
        const tex = pngTextures[Math.min(i, pngTextures.length - 1)];
        pages[i].setTexture(SpineTexture.from(tex.source));
      }
      Assets.cache.set(sharedAtlasKey, atlas);
    }

    let data = Assets.cache.get(sharedDataKey);
    if (!data) {
      data = JSON.parse(assets.jsonRaw);
      Assets.cache.set(sharedDataKey, data);
    }

    // Per-instance keys still need to point at the shared objects so Spine.from
    // resolves them — set both per-id and shared keys to the same instance.
    Assets.cache.set(atlasKey, atlas);
    Assets.cache.set(dataKey, data);

    const spine = Spine.from({ skeleton: dataKey, atlas: atlasKey, ticker });
    spine.state.data.defaultMix = 0.15;
    const character = new SpineCharacter(spine);

    const skin = options?.skin ?? 'default';
    spine.skeleton.setSkinByName(skin);
    spine.skeleton.setToSetupPose();

    if (options?.animation) {
      spine.state.setAnimation(0, options.animation, true);
    }

    return character;
  }

  play(name: string, loop = true): void {
    this.spine.state.setAnimation(0, name, loop);
  }

  /** Name of the animation currently playing on the base track, if any. */
  currentAnimation(): string | null {
    return this.spine.state.getCurrent(0)?.animation?.name ?? null;
  }

  /** True if the skeleton defines an animation with this exact name. */
  hasAnimation(name: string): boolean {
    return !!this.spine.skeleton.data.findAnimation(name);
  }

  queue(name: string, loop = true, delay = 0): void {
    this.spine.state.addAnimation(0, name, loop, delay);
  }

  set facingLeft(left: boolean) {
    const abs = Math.abs(this.spine.scale.x);
    this.spine.scale.x = left ? -abs : abs;
  }

  get facingLeft(): boolean {
    return this.spine.scale.x < 0;
  }

  /** Notify physics constraints of an external position change so hair/cape/etc react. */
  physicsTranslate(dx: number, dy: number): void {
    this.spine.skeleton.physicsTranslate(dx, dy);
  }

  async equipWeapon(config: WeaponConfig, slot = 'Sword_Hilt2'): Promise<void> {
    this.unequipWeapon();

    const texture = await Assets.load(config.spriteData);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 0.5);
    sprite.position.set(
      config.position.x * UNITY_TO_SPINE,
      -config.position.y * UNITY_TO_SPINE,
    );
    sprite.rotation = -config.rotation * (Math.PI / 180);
    sprite.scale.set(config.scale);

    this.weaponContainer = new Container();
    this.weaponContainer.addChild(sprite);
    this.weaponSlot = slot;

    if (config.glow) {
      const gf = new GlowFilter({
        color: config.glow.color,
        distance: config.glow.distance ?? 15,
        outerStrength: config.glow.outerStrength ?? 4,
        innerStrength: 0,
        quality: config.glow.quality ?? 1,
      });
      gf.resolution = 2;
      sprite.filters = [gf];
      this.weaponGlowFilter = gf;
      this.weaponGlowCfg = config.glow;
      this.weaponGlowFilterElapsed = 0;
    }

    if (config.ember) {
      const r = texture.width * config.ember.radiusFrac;
      const ex = (config.ember.at.x - 0.5) * texture.width;
      const ey = (config.ember.at.y - 0.5) * texture.height;
      const ember = new Graphics();
      ember.circle(0, 0, r * 1.7).fill({ color: config.ember.color, alpha: 0.22 }); // soft outer bloom
      ember.circle(0, 0, r).fill({ color: config.ember.color, alpha: 0.55 });
      ember.circle(0, 0, r * 0.5).fill({ color: 0xffffff, alpha: 0.9 });
      ember.blendMode = 'add';
      ember.position.set(ex, ey);
      sprite.addChild(ember); // child of the weapon art → tracks its rotation/scale
      this.weaponEmber = ember;
      this.weaponEmberElapsed = 0;
    }

    this.spine.addSlotObject(slot, this.weaponContainer, {
      followAttachmentTimeline: false,
    });
  }

  unequipWeapon(): void {
    if (this.weaponContainer && this.weaponSlot) {
      this.setWeaponGlow(false);
      this.weaponGlowFilter = null;
      this.weaponGlowCfg = null;
      this.weaponEmber = null; // destroyed with the weaponContainer tree below
      this.spine.removeSlotObject(this.weaponSlot);
      this.weaponContainer.destroy({ children: true });
      this.weaponContainer = null;
      this.weaponSlot = null;
    }
  }

  /** Toggle a rotating golden glow ray behind the weapon (or body center if no weapon).
   *  Requires the GlowRays texture to be pre-loaded in Assets cache. */
  setWeaponGlow(on: boolean): void {
    if (on && !this.weaponGlow) {
      const tex = Assets.cache.get('glowRays');
      if (!tex) return;
      const glow = new Sprite(tex);
      glow.anchor.set(0.5);
      glow.tint = 0xffdd44;
      glow.alpha = 0.8;
      const texSize = Math.max(tex.width, tex.height);

      if (this.weaponContainer) {
        // Attach to weapon
        const wpnSprite = this.weaponContainer.children[0] as Sprite | undefined;
        const glowSize = 900;
        this.weaponGlowBaseScale = glowSize / texSize;
        glow.scale.set(this.weaponGlowBaseScale);
        if (wpnSprite) glow.position.copyFrom(wpnSprite.position);
        this.weaponGlow = glow;
        this.weaponContainer.addChildAt(glow, 0);
      } else if (this.spine.parent) {
        // Body-centered glow for characters without a weapon — add to parent behind spine
        const skelH = this.spine.skeleton.data.height;
        const spineScale = Math.abs(this.spine.scale.x);
        const glowSize = skelH * spineScale * 1.6;
        this.weaponGlowBaseScale = glowSize / texSize;
        glow.scale.set(this.weaponGlowBaseScale);
        glow.position.set(this.spine.x, this.spine.y - skelH * spineScale * 0.4);
        this.weaponGlow = glow;
        const idx = this.spine.parent.getChildIndex(this.spine);
        this.spine.parent.addChildAt(glow, idx);
      }
      this.weaponGlowElapsed = 0;
    } else if (!on && this.weaponGlow) {
      this.weaponGlow.destroy();
      this.weaponGlow = null;
    }
  }

  /** Call each frame to spin and pulse the weapon glow. */
  updateWeaponGlow(deltaMS: number): void {
    if (this.weaponGlow) {
      this.weaponGlow.rotation += deltaMS * 0.003;
      this.weaponGlowElapsed += deltaMS;
      const pulse = 1 + 0.18 * ((Math.sin(this.weaponGlowElapsed * 0.006) + 1) / 2);
      this.weaponGlow.scale.set(this.weaponGlowBaseScale * pulse);
    }
    if (this.weaponGlowFilter && this.weaponGlowCfg) {
      this.weaponGlowFilterElapsed += deltaMS;
      const speed = this.weaponGlowCfg.pulseSpeed ?? 1200;
      const t = (Math.sin((this.weaponGlowFilterElapsed / speed) * Math.PI * 2) + 1) / 2;
      const base = this.weaponGlowCfg.outerStrength ?? 4;
      this.weaponGlowFilter.outerStrength = base * (0.5 + 0.5 * t);
    }
    if (this.weaponEmber) {
      this.weaponEmberElapsed += deltaMS;
      const t = (Math.sin(this.weaponEmberElapsed * 0.005) + 1) / 2;
      this.weaponEmber.scale.set(0.85 + 0.3 * t);
      this.weaponEmber.alpha = 0.7 + 0.3 * t;
    }
  }
}
