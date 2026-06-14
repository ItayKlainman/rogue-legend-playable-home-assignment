import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture, Ticker } from 'pixi.js';
import glowRaysData from 'assets/UI/GlowRays.webp';
import * as sfx from '../sfx';
import { tween as sharedTween, delay as sharedDelay } from '@shared/tween';
import type { PlayerState } from '../PlayerState';
import { FightActor } from './FightActor';
import { DamageNumber, type DamageNumberOpts } from './DamageNumber';
import { HitEffect } from './HitEffect';
import { HitsCounter } from './HitsCounter';
import { skillVfxRegistry, type SkillVfxContext } from './skillVfx/registry';
import type {
  FightSceneConfig, FightStep, FightStepAttack, FightStepSkill,
  FightStepStatus, FightStepDie, FightStepLabel,
  FightStepLevelUp, FightStepWeaponReward, FightStepVignette,
} from './FightStep';

const FIGHT_SPEED = 1.3;
const DEFAULT_VARIANCE = 0.15;
const INTRO_SLIDE_MS = 400;
const INTRO_STAGGER_MS = 120;
const MELEE_APPROACH_MS = 150;
const HIT_FLASH_MS = 150;
const HP_TWEEN_MS = 150;
const DEATH_FADE_MS = 150;
const VICTORY_HOLD_MS = 500;
const VICTORY_FADE_MS = 80;
const DODGE_OFFSET = 70;
const DODGE_MS = 360;

// Layout constants
const PLAYER_X_FRAC = 0.28;
const ENEMY_X_FRAC = 0.72;
const CHARACTER_Y_FRAC = 0.88;
const CHAR_STAGGER_X = 0.08;
const CHAR_STAGGER_Y = 0.04;

// Animation name fallbacks — tried in order per character.
const ANIM_IDLE = ['Idle', 'Idle_Full', 'Idle_Loop'];
const ANIM_WALK = ['Walk', 'Run', 'Idle', 'Idle_Full', 'Idle_Loop'];
const ANIM_HIT = ['TakeHit', 'Take_Hit', 'Hit', 'Hurt', 'Damaged', 'Get_Hit', 'Got_Hit', 'Got_Hit_By_Attack'];
const ANIM_DEATH = ['Dead', 'Death', 'Die', 'Dying'];

// Absolute-timeline timing profile per attack category.
// All values in ms from t=0 (start of attack). Events run concurrently.
interface AttackTiming {
  /** Spine animation name, with fallbacks tried in order (first match wins). */
  animWithFallbacks: string[];
  moveAt: number;         // when melee approach begins
  moveDuration: number;   // how long the approach takes
  animAt: number;         // when attack animation starts playing
  damageAt: number;       // when damage number + hit effects fire
}

const ATTACK_TIMING: Record<string, AttackTiming> = {
  basic: {
    animWithFallbacks: ['Regular_Attack_Melee', 'Basic_Attack_Sword_1', 'Basic_Attack', 'Basic_Attck', 'Attack', ...ANIM_IDLE],
    moveAt: 0,
    moveDuration: 150,
    animAt: 150,
    damageAt: 350,
  },
  combo: {
    animWithFallbacks: ['Basic_Attack_Sword_1', 'Regular_Attack_Melee', 'Basic_Attack', 'Basic_Attck', 'Attack', ...ANIM_IDLE],
    moveAt: 0,
    moveDuration: 100,
    animAt: 100,
    damageAt: 250,
  },
  counter: {
    animWithFallbacks: ['Regular_Attack_Melee', 'Basic_Attack', 'Basic_Attck', 'Attack', ...ANIM_IDLE],
    moveAt: 0,
    moveDuration: 150,
    animAt: 150,
    damageAt: 350,
  },
  rage: {
    animWithFallbacks: ['Rage_Attack_Melee', 'Rage_Attack', 'Ultimate_Attack', 'Regular_Attack_Melee', 'Basic_Attack', 'Basic_Attck', 'Attack', ...ANIM_IDLE],
    moveAt: 350,
    moveDuration: 100,
    animAt: 0,
    damageAt: 550,
  },
};

export class FightEngine {
  private static nextId = 0;
  readonly battleArea: Container;
  private players: FightActor[] = [];
  private enemies: FightActor[] = [];
  private state: PlayerState;
  private config: FightSceneConfig;
  private ticker: Ticker;
  private width: number;
  private height: number;
  private battleH: number;
  // Horizontal layout bounds in battleArea-local (design) space: fighters,
  // vignette and the VS intro spread across [layoutX, layoutX+layoutW] so on
  // iPad/landscape they fill the full screen width instead of a centre column.
  // Default to the design width; FightScene sets the real fill via setLayoutBounds.
  private layoutX = 0;
  private layoutW = 0;
  // Vertical extent of the battle "box" (the masked forest panel) in battleArea
  // coords. The danger vignette is sized to this box and rendered INSIDE the
  // masked battleArea, so its red darkens the box edges with no floating line.
  private boxTop = 0;
  private boxBottom = 0;
  private damageNumber: DamageNumber;
  private hitEffect: HitEffect;
  private hitsCounter: HitsCounter | null = null;
  private lastOffensiveSide: 'player' | 'enemy' | null = null;
  private stepIndex = 0;
  private currentSteps: FightStep[] = [];
  private skillUseIndex = 0;
  private cachePrefix: string;
  onSkillActivated?: (skillId: string) => void;
  onSkillCharging?: (skillId: string) => Promise<void>;
  onBeforeMelee?: (actor: FightActor) => Promise<void>;
  onAfterMelee?: (actor: FightActor) => Promise<void>;
  onMidFightOverlay?: (step: FightStepLevelUp | FightStepWeaponReward) => Promise<void>;
  skipVictoryFade = false;
  /** Keep the whole battle scene visible on victory (no fade at all). For flows
   *  that crossfade straight into a follow-up scene (e.g. egg-summon → claim), so
   *  there's no empty/board beat between the kill and the next scene. */
  keepSceneOnVictory = false;

  constructor(
    config: FightSceneConfig,
    state: PlayerState,
    ticker: Ticker,
    battleArea: Container,
    width: number,
    battleH: number,
  ) {
    this.cachePrefix = `fight${FightEngine.nextId++}`;
    this.config = config;
    this.state = state;
    this.ticker = ticker;
    this.battleArea = battleArea;
    this.width = width;
    this.height = battleH;
    this.battleH = battleH;
    this.layoutX = 0;
    this.layoutW = width;
    this.boxTop = 0;
    this.boxBottom = battleH;

    this.damageNumber = new DamageNumber(battleArea, ticker);
    this.hitEffect = new HitEffect(battleArea, ticker);

    if (config.hitsCounter) {
      this.hitsCounter = new HitsCounter((ms, fn) => this.tween(ms, fn));
      const parent = battleArea.parent;
      if (parent) {
        parent.addChild(this.hitsCounter.container);
        this.hitsCounter.layout(this.width, this.height);
      }
    }
  }

  /**
   * Update the cached battle-area dimensions after a viewport resize (e.g. device
   * orientation change). Must be called before layoutActors() so actors and HP/rage
   * bars are repositioned into the new battle box instead of the stale one.
   */
  setViewport(width: number, battleH: number): void {
    this.width = width;
    this.height = battleH;
    this.battleH = battleH;
  }

  // ── Resize-safe movement ───────────────────────────────
  // In-flight position tweens resolve their endpoints from LIVE home positions
  // every frame (via the from/to closures below), so an orientation change —
  // which re-homes actors through layoutActors() — immediately re-routes any
  // actor that is mid-movement instead of letting it finish on the stale path.
  private activeMotions = new Map<FightActor, {
    from: () => { x: number; y: number };
    to: () => { x: number; y: number };
    hpOffX: number; hpOffY: number;
    rageOffX: number; rageOffY: number;
    t: number;
  }>();

  private applyMotion(actor: FightActor): void {
    const m = this.activeMotions.get(actor);
    if (!m) return;
    const a = m.from();
    const b = m.to();
    const x = a.x + (b.x - a.x) * m.t;
    const y = a.y + (b.y - a.y) * m.t;
    const spine = actor.character.spine;
    spine.x = x;
    spine.y = y;
    actor.hpBar.container.x = x + m.hpOffX;
    actor.hpBar.container.y = y + m.hpOffY;
    if (actor.rageBar) {
      actor.rageBar.container.x = x + m.rageOffX;
      actor.rageBar.container.y = y + m.rageOffY;
    }
  }

  /** Create all actors, add to battleArea, and layout. */
  async init(): Promise<void> {
    // Hero index 0 inherits HP from PlayerState before async work begins
    if (this.config.players.length > 0) {
      const heroCfg = this.config.players[0];
      if (heroCfg.hp === undefined) heroCfg.hp = this.state.hp;
      if (heroCfg.maxHp === undefined || heroCfg.maxHp === 0) heroCfg.maxHp = this.state.maxHp;
    }

    // Build all actors + supporting assets in parallel — each FightActor.create
    // does an Assets.load + (after Fix A) a cached JSON.parse + Spine.from.
    // Sequential awaits add up to ~600 ms on iOS for a 4-actor fight; parallel
    // collapses that to the cost of the slowest single actor.
    const playerPromises = this.config.players.map((cfg, i) =>
      FightActor.create(cfg, 'player', i, this.ticker, this.cachePrefix),
    );
    const enemyPromises = this.config.enemies.map((cfg, i) =>
      FightActor.create(cfg, 'enemy', i, this.ticker, this.cachePrefix),
    );
    const glowTexP = Assets.load(glowRaysData);

    const [players, enemies] = await Promise.all([
      Promise.all(playerPromises),
      Promise.all(enemyPromises),
    ]);

    for (let i = 0; i < players.length; i++) {
      const actor = players[i];
      if (i === 0 && this.state.weaponConfig) {
        await actor.character.equipWeapon(this.state.weaponConfig);
      }
      if (__DEV__ && i === 0) (window as any).__debugHero = actor.character;
      actor.character.facingLeft = false;
      actor.character.spine.state.timeScale = FIGHT_SPEED;
      actor.character.spine.visible = false;
      actor.hpBar.container.visible = false;
      if (actor.rageBar) actor.rageBar.container.visible = false;
      actor.addTo(this.battleArea);
      this.players.push(actor);
    }

    for (const actor of enemies) {
      actor.character.facingLeft = false;
      actor.character.spine.state.timeScale = FIGHT_SPEED;
      actor.character.spine.visible = false;
      actor.hpBar.container.visible = false;
      if (actor.rageBar) actor.rageBar.container.visible = false;
      actor.addTo(this.battleArea);
      this.enemies.push(actor);
    }

    // Re-add players so they render in front of enemies
    for (const player of this.players) {
      player.addTo(this.battleArea);
    }

    this.layoutActors();

    await this.hitEffect.preload();
    Assets.cache.set('glowRays', await glowTexP);
  }

  /** Main fight loop. */
  async run(): Promise<void> {
    // Debug: loop VS intro endlessly for visual tuning
    if (this.config.debugVsLoop) {
      while (true) {
        this.layoutActors();
        await this.playVsIntro();
        await this.delay(500);
      }
    }

    await this.playIntro();

    do {
      const steps = this.prepareSteps();
      this.currentSteps = steps;
      for (this.stepIndex = 0; this.stepIndex < steps.length; this.stepIndex++) {
        const step = steps[this.stepIndex];
        if (this.isTargetDead(step)) {
          if (__DEV__) console.warn(`[FightEngine] Skipping step targeting dead actor`, step);
          continue;
        }
        await this.executeStep(step);
      }

      if (this.config.debugLoop) {
        // Reset all actors for next loop
        for (const actor of [...this.players, ...this.enemies]) {
          actor.dead = false;
          actor.setHp(actor.maxHp);
          actor.character.spine.visible = true;
          actor.character.spine.alpha = 1;
          actor.character.spine.position.set(actor.homeX, actor.homeY);
          this.tryPlay(actor, ANIM_IDLE, true);
          if (actor.rageBar) {
            actor.rage = 0;
            actor.rageBar.setRage(0);
          }
        }
        this.skillUseIndex = 0;
        this.hitsCounter?.reset();
        this.lastOffensiveSide = null;
        await this.delay(400);
        continue;
      }

      await this.playVictory();
    } while (this.config.debugLoop);
  }

  /** Destroy all actors and free their Spine, weapon, HP/Rage bar resources.
   *  Called by FightScene.exit() to release physics-constraint CPU and VRAM
   *  between fights. Safe to call after run() resolves. */
  destroyActors(): void {
    for (const actor of [...this.players, ...this.enemies]) {
      actor.character.unequipWeapon();
      actor.character.spine.destroy();
      actor.hpBar.container.destroy({ children: true });
      actor.rageBar?.container.destroy({ children: true });
    }
    this.players.length = 0;
    this.enemies.length = 0;
  }

  /** Set the horizontal layout bounds (battleArea-local design space) the
   *  fighters / vignette / VS intro spread across. `x` is the left edge, `w` the
   *  full visible width. Lets the battle fill the screen on iPad/landscape. */
  setLayoutBounds(x: number, w: number, boxTop?: number, boxBottom?: number): void {
    this.layoutX = x;
    this.layoutW = w;
    if (boxTop !== undefined) this.boxTop = boxTop;
    if (boxBottom !== undefined) this.boxBottom = boxBottom;
    if (this.vignetteSprite) this.layoutVignette(this.vignetteSprite);
  }

  /** Map a 0..1 horizontal fraction to an x in the current layout bounds.
   *  frac 0 → left edge, 0.5 → centre, 1 → right edge. On the phone this equals
   *  the old `width * frac` (layoutX=0, layoutW=width). */
  private fracToX(frac: number): number {
    return this.layoutX + frac * this.layoutW;
  }

  /** Layout all actors based on current dimensions. */
  layoutActors(): void {
    if (this.vignetteSprite) this.layoutVignette(this.vignetteSprite);
    if (this.hitsCounter) this.hitsCounter.layout(this.width, this.height);
    const bw = this.width;
    const bh = this.battleH;
    const charScale = this.config.characterScale ?? 0.12;
    const barW = 70;
    const barH = 8;
    const isLandscape = bw > bh * 2;
    const fullHeight = bh / 0.55;
    const isPortrait = fullHeight > bw;
    const portraitYOffset = isPortrait ? -bh * 0.1 : 0;
    const enemyYOffset = isLandscape ? -bh * 0.08 : 0;

    for (const actor of this.players) {
      const i = actor.index;
      const x = actor.config.xFrac !== undefined
        ? this.fracToX(actor.config.xFrac)
        : this.fracToX(PLAYER_X_FRAC - i * CHAR_STAGGER_X);
      const y = (actor.config.yFrac !== undefined
        ? bh * actor.config.yFrac
        : bh * (CHARACTER_Y_FRAC + i * CHAR_STAGGER_Y)) + portraitYOffset;
      actor.character.spine.position.set(x, y);
      actor.character.spine.scale.set(actor.config.scale ?? actor.config.spine.defaultScale ?? charScale);
      actor.homeX = x;
      actor.homeY = y;

      actor.hpBar.layout(x, y + 10, barW, barH);
      if (actor.rageBar) {
        actor.rageBar.layout(x, y + 10 + barH + 2, barW, Math.max(6, barH * 0.7));
      }
    }

    for (const actor of this.enemies) {
      const i = actor.index;
      const x = actor.config.xFrac !== undefined
        ? this.fracToX(actor.config.xFrac)
        : this.fracToX(ENEMY_X_FRAC + i * CHAR_STAGGER_X);
      const y = (actor.config.yFrac !== undefined
        ? bh * actor.config.yFrac
        : bh * (CHARACTER_Y_FRAC + i * CHAR_STAGGER_Y)) + enemyYOffset + portraitYOffset;
      actor.character.spine.position.set(x, y);
      actor.character.spine.scale.set(actor.config.scale ?? actor.config.spine.defaultScale ?? charScale);
      actor.homeX = x;
      actor.homeY = y;

      actor.hpBar.layout(x, y + 10, barW, barH);
      if (actor.rageBar) {
        actor.rageBar.layout(x, y + 10 + barH + 2, barW, Math.max(6, barH * 0.7));
      }
    }

    // Sort enemies by Y so lower ones render in front (depth sorting)
    const sorted = [...this.enemies].sort((a, b) => a.homeY - b.homeY);
    for (const actor of sorted) actor.addTo(this.battleArea);
    // Re-add players so they render in front of enemies
    // Depth-sort players by Y too (like enemies): a pet placed higher (smaller
    // homeY) renders BEHIND the hero. Single-hero fights are unaffected.
    for (const player of [...this.players].sort((a, b) => a.homeY - b.homeY)) player.addTo(this.battleArea);
    // Keep the danger vignette on top of the (just re-added) fighters.
    if (this.vignetteSprite) this.battleArea.addChild(this.vignetteSprite);

    // Re-route any in-flight movement to the freshly-computed home positions so
    // mid-move actors snap to the new layout instead of finishing on the old path.
    for (const actor of this.activeMotions.keys()) this.applyMotion(actor);
  }

  // ── Prepare ────────────────────────────────────────

  private prepareSteps(): FightStep[] {
    const steps = [...this.config.steps];
    const variance = this.config.damageVariance ?? DEFAULT_VARIANCE;

    // Group shuffle
    const groupMap = new Map<string, number[]>();
    steps.forEach((s, i) => {
      const g = ('group' in s && s.group) ? s.group : null;
      if (g) {
        if (!groupMap.has(g)) groupMap.set(g, []);
        groupMap.get(g)!.push(i);
      }
    });
    for (const indices of groupMap.values()) {
      // Fisher-Yates shuffle within group
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmpIdx = indices[i];
        const tmp = steps[tmpIdx];
        steps[tmpIdx] = steps[indices[j]];
        steps[indices[j]] = tmp;
      }
    }

    // Apply damage variance (skill ID resolution moved to playSkill for mid-fight support)
    for (const step of steps) {
      if (step.type === 'attack' || step.type === 'skill') {
        if (step.damage !== undefined && variance > 0) {
          const jitter = 1 + (Math.random() * 2 - 1) * variance;
          step.damage = Math.round(step.damage * jitter);
        }
      }
    }

    return steps;
  }

  // ── Step dispatch ──────────────────────────────────

  private async executeStep(step: FightStep): Promise<void> {
    if (step.type === 'attack' || step.type === 'skill') {
      if (this.hitsCounter && step.side === 'player' && this.lastOffensiveSide === 'enemy') {
        this.hitsCounter.resetCount();
      }
      this.lastOffensiveSide = step.side;
    }
    switch (step.type) {
      case 'attack':       await this.playAttack(step); break;
      case 'skill':        await this.playSkill(step);  break;
      case 'status':       await this.playStatus(step); break;
      case 'die':          await this.playDeath(step);  break;
      case 'wait':         await this.delay(step.ms);   break;
      case 'label':        await this.showLabel(step);  break;
      case 'levelup':      // fall through
      case 'weaponReward': await this.playMidFightOverlay(step); break;
      case 'vignette':     await this.toggleVignette(step);      break;
    }
  }

  private vignetteSprite: Sprite | null = null;

  private async toggleVignette(step: FightStepVignette): Promise<void> {
    const FADE_MS = 180;
    if (step.on) {
      if (this.vignetteSprite) return;
      const sprite = this.createVignette();
      sprite.alpha = 0;
      // Add INSIDE the battleArea (on top of the fighters) so the battleArea mask
      // clips the vignette to the fighting box. Its red then darkens the box edges
      // and ends exactly at the box boundary — no line floating in the dark UI
      // area below or at the panel edges.
      this.battleArea.addChild(sprite);
      this.layoutVignette(sprite);
      this.vignetteSprite = sprite;
      await this.tween(FADE_MS, (t) => { sprite.alpha = t; });
    } else {
      const sprite = this.vignetteSprite;
      if (!sprite) return;
      this.vignetteSprite = null;
      await this.tween(FADE_MS, (t) => { sprite.alpha = 1 - t; });
      sprite.destroy({ texture: true, textureSource: true });
    }
  }

  private createVignette(): Sprite {
    const SIZE = 512;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;
    // Danger vignette: a clearly-visible red darkening around the screen
    // perimeter that fades SMOOTHLY to a clear centre — no opaque plateau, so it
    // never reads as a hard red FRAME with hard lines at the edges (the old
    // version held an opaque 0.65 across everything beyond 60% radius). Strong at
    // the corners, lighter at the edge-middles, clear in the middle.
    const grad = ctx.createRadialGradient(
      SIZE / 2, SIZE / 2, SIZE * 0.05,
      SIZE / 2, SIZE / 2, SIZE * 0.72,
    );
    grad.addColorStop(0, 'rgba(175, 30, 30, 0)');
    grad.addColorStop(0.42, 'rgba(175, 30, 30, 0)');   // clear centre
    grad.addColorStop(0.72, 'rgba(170, 35, 35, 0.26)');
    grad.addColorStop(1, 'rgba(150, 22, 22, 0.55)');   // strong toward the corners
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);
    return new Sprite(Texture.from(canvas));
  }

  private layoutVignette(sprite: Sprite): void {
    // Fill the entire fighting BOX (the masked forest panel) so the red darkens
    // every box edge. The sprite is a child of the masked battleArea, so it's
    // clipped to the box trapezoid — the red ends exactly at the box edges (the
    // screen top/sides and the forest/board diagonal), with no floating line.
    sprite.position.set(this.layoutX, this.boxTop);
    sprite.width = this.layoutW;
    sprite.height = Math.max(1, this.boxBottom - this.boxTop);
  }

  private async playMidFightOverlay(step: FightStepLevelUp | FightStepWeaponReward): Promise<void> {
    if (!this.onMidFightOverlay) return;

    // Freeze all actor animations
    const allActors = [...this.players, ...this.enemies];
    for (const actor of allActors) {
      actor.character.spine.autoUpdate = false;
    }

    await this.onMidFightOverlay(step);

    // Re-equip weapon if it changed
    const hero = this.players[0];
    if (hero && this.state.weaponConfig) {
      await hero.character.equipWeapon(this.state.weaponConfig);
    }

    // Unfreeze all actor animations
    for (const actor of allActors) {
      actor.character.spine.autoUpdate = true;
    }
  }

  /** Melee approach offset: sum of both actors' half-widths in screen pixels (like Unity's Size). */
  private getApproachOffset(actor: FightActor, target: FightActor): number {
    const actorW = actor.character.spine.skeleton.data.width * Math.abs(actor.character.spine.scale.x);
    const targetW = target.character.spine.skeleton.data.width * Math.abs(target.character.spine.scale.x);
    return (actorW + targetW) / 2;
  }

  // ── Attack ─────────────────────────────────────────

  private async playAttack(step: FightStepAttack): Promise<void> {
    const actor = this.getActor(step.side, step.actor);
    const targetSide = step.targetSide ?? (step.side === 'player' ? 'enemy' : 'player');
    const target = this.getActor(targetSide, step.target);
    if (!actor || !target) return;

    const isMelee = step.melee ?? actor.config.melee ?? false;
    const shouldReturn = step.return !== false;
    const category = step.category ?? 'basic';

    // Dramatic darkening
    if (step.dramatic) {
      this.hitEffect.fadeInDarkening(250);
    }

    // Category label
    if (category !== 'basic') {
      const labels: Record<string, string> = {
        combo: 'Combo!', counter: 'Counter!',
      };
      if (labels[category]) {
        this.showFloatingLabel(labels[category], actor, 0xffcc00);
      }
    }

    // Dodge path
    if (step.dodge) {
      await this.playDodge(actor, target, isMelee);
      if (step.dramatic) await this.hitEffect.fadeOutDarkening(250);
      return;
    }

    // Rage weapon glow — spin while active, remove on hit
    let glowHandler: ((t: Ticker) => void) | null = null;
    if (category === 'rage') {
      sfx.charge(0.7);
      actor.character.setWeaponGlow(true);
      glowHandler = (t: Ticker) => actor.character.updateWeaponGlow(t.deltaMS * FIGHT_SPEED);
      this.ticker.add(glowHandler);
    }

    // Absolute-timeline attack sequence — all events run concurrently from t=0.
    const timing = ATTACK_TIMING[category] ?? ATTACK_TIMING.basic;
    const offset = this.getApproachOffset(actor, target);
    // Live resolvers (read homes every frame) so a mid-attack resize re-routes movement.
    const approachPoint = () => ({
      x: target.homeX + (actor.side === 'player' ? -offset : offset),
      y: target.homeY,
    });
    const homePoint = () => ({ x: actor.homeX, y: actor.homeY });
    let attackElapsed = 0;
    const trackElapsed = (t: Ticker) => { attackElapsed += t.deltaMS * FIGHT_SPEED; };
    this.ticker.add(trackElapsed);
    const waitUntil = (ms: number) => {
      const remaining = ms - attackElapsed;
      return remaining > 0 ? this.delay(remaining) : Promise.resolve();
    };

    // Berserk: scale up before melee
    if (isMelee && actor.side === 'player' && this.onBeforeMelee) {
      await this.onBeforeMelee(actor);
    }

    // Movement task (fire-and-forget, runs on the same timeline)
    // If attack anim starts before movement, skip Walk to avoid interrupting attack anim.
    const skipWalk = timing.animAt <= timing.moveAt;
    let moveTask = Promise.resolve();
    if (isMelee && timing.moveDuration > 0) {
      moveTask = (async () => {
        await waitUntil(timing.moveAt);
        if (!skipWalk) this.tryPlay(actor, ANIM_WALK, true);
        await this.tweenPosition(actor, approachPoint, timing.moveDuration, homePoint);
      })();
    }

    // Animation task (starts at animAt, may overlap with movement)
    let playedAnim: string | null = null;
    const animTask = (async () => {
      await waitUntil(timing.animAt);
      if (isMelee && category !== 'rage') sfx.swordHit(0.7);
      playedAnim = this.tryPlay(actor, timing.animWithFallbacks, false);
    })();

    // Wait for the animation's "Attack" event (or fall back to fixed damageAt timing)
    await animTask;
    await this.waitForAnimEvent(actor, playedAnim, 'Attack', timing.damageAt, attackElapsed);
    await moveTask;
    this.ticker.remove(trackElapsed);

    // Clear rage weapon glow on hit
    if (glowHandler) {
      this.ticker.remove(glowHandler);
      actor.character.setWeaponGlow(false);
    }

    // Hit effects
    if (step.damage !== undefined && step.damage > 0) {
      this.playHit(target);
      this.hitEffect.flash(target);
      this.hitEffect.shake(step.crit ? 6 : 3);

      const newHp = Math.max(0, target.hp - step.damage);
      this.damageNumber.show(target, step.damage, {
        crit: step.crit,
      });
      if (this.hitsCounter && step.side === 'player' && !step.dodge) {
        this.hitsCounter.increment();
      }
      await this.tweenHp(target, newHp);

      // Lethal peek: if the next step is `die` on this target, start death now (runs in parallel with attacker cleanup).
      if (!target.dead && this.nextStepKills(targetSide, step.target))
      {
        target.setHp(0);
        void this.killActor(target);
      }

      // Apply explicit hpChanges if provided
      if (step.hpChanges) {
        const targets = targetSide === 'player' ? this.players : this.enemies;
        for (let i = 0; i < step.hpChanges.length; i++) {
          if (targets[i] && i !== step.target) {
            const newVal = Math.max(0, step.hpChanges[i]);
            await this.tweenHp(targets[i], newVal);
          }
        }
      }
    }

    // Rage fill
    if (step.rageFill && actor.rageBar) {
      actor.setRage(actor.rage + step.rageFill);
    }

    // Rage discharge on rage attacks
    if (category === 'rage' && actor.rageBar) {
      actor.rageBar.discharge();
      actor.rage = 0;
    }

    // Return to position
    await this.delay(50); // brief hold
    this.tryPlay(actor, ANIM_IDLE, true);

    if (isMelee && shouldReturn) {
      await this.tweenPosition(actor, homePoint, MELEE_APPROACH_MS, approachPoint);
    }

    // Berserk: scale back down after melee
    if (isMelee && actor.side === 'player' && this.onAfterMelee) {
      await this.onAfterMelee(actor);
    }

    if (step.dramatic) {
      await this.hitEffect.fadeOutDarkening(250);
    }
  }

  // ── Dodge ──────────────────────────────────────────

  private async playDodge(actor: FightActor, target: FightActor, isMelee: boolean): Promise<void> {
    // Live resolvers (read homes every frame) so a mid-dodge resize re-routes movement.
    const offset = this.getApproachOffset(actor, target);
    const attackerApproach = () => ({
      x: target.homeX + (actor.side === 'player' ? -offset : offset),
      y: target.homeY,
    });
    const attackerHome = () => ({ x: actor.homeX, y: actor.homeY });
    const targetHome = () => ({ x: target.homeX, y: target.homeY });
    const dodgeDir = target.side === 'player' ? -1 : 1;
    const targetAway = () => ({ x: target.homeX + DODGE_OFFSET * dodgeDir, y: target.homeY });

    // Attacker approaches if melee
    if (isMelee) {
      this.tryPlay(actor, ANIM_WALK, true);
      await this.tweenPosition(actor, attackerApproach, MELEE_APPROACH_MS, attackerHome);
    }

    // Attacker winds up; dodger hops just before the whiff
    this.tryPlay(actor, ATTACK_TIMING.basic.animWithFallbacks, false);

    // Wait for wind-up, then trigger dodge right as the hit would land
    await this.delay(220);
    sfx.dodge(0.7);
    this.showFloatingLabel('Dodge!', target, 0xaaaaff);
    this.tryPlay(target, ANIM_WALK, true);

    // Step back, then return to home
    await this.tweenPosition(target, targetAway, DODGE_MS * 0.4, targetHome);
    await this.tweenPosition(target, targetHome, DODGE_MS * 0.45, targetAway);
    this.tryPlay(target, ANIM_IDLE, true);

    // Return attacker
    this.tryPlay(actor, ANIM_IDLE, true);
    if (isMelee) {
      await this.tweenPosition(actor, attackerHome, MELEE_APPROACH_MS, attackerApproach);
    }
  }

  // ── Skill ──────────────────────────────────────────

  private async playSkill(step: FightStepSkill): Promise<void> {
    const actor = this.getActor(step.side, step.actor);
    if (!actor) return;

    // Resolve useAllPlayerSkills: play each registered player skill sequentially
    if (step.useAllPlayerSkills) {
      const available = this.state.skills.filter(id => skillVfxRegistry.has(id));
      for (const id of available) {
        await this.playSkill({ ...step, useAllPlayerSkills: undefined, usePlayerSkill: undefined, skillId: id });
      }
      return;
    }

    // Resolve usePlayerSkill: pick the next player skill in rotation
    let skillId = step.skillId;
    if (step.usePlayerSkill && !skillId) {
      const available = this.state.skills.filter(id => skillVfxRegistry.has(id));
      if (available.length > 0) {
        skillId = available[this.skillUseIndex % available.length];
        this.skillUseIndex++;
      }
    }

    if (!skillId) {
      if (__DEV__) console.warn('[FightEngine] Skill step has no resolved skillId, skipping');
      return;
    }

    const handler = skillVfxRegistry.get(skillId);
    if (!handler) {
      // No VFX handler — just apply damage directly
      if (step.damage !== undefined && step.target !== undefined) {
        const targetSide = step.targetSide ?? (step.side === 'player' ? 'enemy' : 'player');
        const target = this.getActor(targetSide, step.target);
        if (target) {
          this.playHit(target);
          this.hitEffect.flash(target);
          this.hitEffect.shake(step.crit ? 6 : 3);
          const newHp = Math.max(0, target.hp - step.damage);
          this.damageNumber.show(target, step.damage, { crit: step.crit });
          if (this.hitsCounter && step.side === 'player') {
            this.hitsCounter.increment();
          }
          await this.tweenHp(target, newHp);
        }
      }
      return;
    }

    // Dramatic darkening
    if (step.dramatic) {
      this.hitEffect.fadeInDarkening(250);
    }

    const targetSide = step.targetSide ?? (step.side === 'player' ? 'enemy' : 'player');
    const target = step.target !== undefined ? this.getActor(targetSide, step.target) : undefined;

    // Charge animation — fill overlay on skill icon before VFX plays
    if (this.onSkillCharging) {
      await this.onSkillCharging(skillId);
    }

    const ctx: SkillVfxContext = {
      actor,
      target: target ?? undefined,
      allEnemies: this.enemies,
      allPlayers: this.players,
      playerState: this.state,
      totalDamage: step.damage ?? 0,
      battleArea: this.battleArea,
      showDamage: (t, amount, opts) => {
        this.damageNumber.show(t, amount, opts);
        if (this.hitsCounter && step.side === 'player') {
          this.hitsCounter.increment();
        }
      },
      tweenHp: (t, newHp) => this.tweenHp(t, newHp),
      delay: (ms) => this.delay(ms),
      flash: (t) => this.hitEffect.flash(t),
      playHit: (t) => this.playHit(t),
      shake: (px) => this.hitEffect.shake(px),
      tween: (durationMs, fn) => this.tween(durationMs, fn),
      pulse: () => this.onSkillActivated?.(skillId),
    };

    await handler(ctx);

    if (step.dramatic) {
      await this.hitEffect.fadeOutDarkening(250);
    }
  }

  // ── Status ─────────────────────────────────────────

  private async playStatus(step: FightStepStatus): Promise<void> {
    const side = step.side ?? 'enemy';
    const target = this.getActor(side, step.target);
    if (!target) return;

    // Status effects are visual-only in the playable.
    // For now, just show a label indicating the effect.
    if (step.stacks > 0) {
      const colors: Record<string, number> = {
        freeze: 0x44aaff, burn: 0xff6622, poison: 0x44cc44,
        bleed: 0xcc2222,
      };
      const color = colors[step.effect] ?? 0xffffff;
      this.showFloatingLabel(`${step.effect} x${step.stacks}`, target, color);
    }

    await this.delay(400);
  }

  // ── Death ──────────────────────────────────────────

  private async playDeath(step: FightStepDie): Promise<void> {
    const side = step.side ?? 'enemy';
    const actor = this.getActor(side, step.actor);
    if (!actor || actor.dead) return;
    if (actor.hp > 0)
    {
      actor.setHp(0);
    }
    await this.killActor(actor);
  }

  private async killActor(actor: FightActor): Promise<void> {
    if (actor.dead) return;

    // Mark dead immediately so concurrent steps (follow-up combos, duplicate die triggers) short-circuit.
    actor.dead = true;

    // Play death animation, then fade out. If a death animation is ALREADY playing
    // (e.g. a skill triggered the collapse in sync with its hit), don't restart it —
    // that would re-collapse the body; just fade. Otherwise play it and hold for the
    // clip's actual duration (capped) so it plays out fully — a fixed 300ms cut
    // longer clips off mid-animation (the boss "Dead" is ~0.9s), an abrupt pop.
    sfx.death(0.7);
    const alreadyDying = ANIM_DEATH.includes(actor.character.currentAnimation() ?? '');
    if (!alreadyDying) {
      const deathAnimName = this.tryPlay(actor, ANIM_DEATH, false);
      const deathClip = deathAnimName ? actor.character.spine.skeleton.data.findAnimation(deathAnimName) : null;
      await this.delay(deathClip ? Math.min(deathClip.duration * 1000, 1400) : 300);
    }

    const spine = actor.character.spine;
    const startAlpha = spine.alpha;
    await this.tween(DEATH_FADE_MS, (t) => {
      spine.alpha = startAlpha * (1 - t);
    });

    actor.hpBar.container.alpha = 0;
    if (actor.rageBar) actor.rageBar.container.alpha = 0;
  }

  // ── Label ──────────────────────────────────────────

  private async showLabel(step: FightStepLabel): Promise<void> {
    let x: number, y: number;
    if (step.actor !== undefined) {
      const side = step.side ?? 'enemy';
      const actor = this.getActor(side, step.actor);
      if (actor) {
        x = actor.character.spine.x;
        y = actor.character.spine.y - 150;
      } else {
        x = this.width / 2;
        y = this.battleH / 2;
      }
    } else {
      x = this.width / 2;
      y = this.battleH / 2;
    }

    const label = new Text({
      text: step.text,
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontSize: 32,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 4 },
      }),
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(x, y);
    label.scale.set(0);
    this.battleArea.addChild(label);

    // Scale in with overshoot
    await this.tween(200, (t) => {
      const ease = t < 0.7 ? t / 0.7 * 1.15 : 1.15 - (t - 0.7) / 0.3 * 0.15;
      label.scale.set(ease);
    });

    await this.delay(300);

    // Fade out
    await this.tween(200, (t) => {
      label.alpha = 1 - t;
    });

    label.destroy();
  }

  // ── Intro ──────────────────────────────────────────

  private async playIntro(): Promise<void> {
    if (this.config.bossFight && this.width > this.battleH * 2) {
      // Skip VS intro in landscape — fall through to normal slide-in
    } else if (this.config.bossFight) {
      await this.playVsIntro();
      return;
    }

    const allActors = [...this.players, ...this.enemies];

    // Position all actors off-screen first, then make visible
    for (const actor of allActors) {
      const offX = actor.side === 'player' ? -400 : this.width + 400;
      const dx = offX - actor.character.spine.x;
      actor.character.spine.x = offX;
      actor.hpBar.container.x += dx;
      if (actor.rageBar) actor.rageBar.container.x += dx;
      actor.hpBar.container.alpha = 0;
      if (actor.rageBar) actor.rageBar.container.alpha = 0;
      actor.character.spine.visible = true;
      actor.hpBar.container.visible = true;
      if (actor.rageBar) actor.rageBar.container.visible = true;
    }

    // Slide in with stagger
    const promises: Promise<void>[] = [];
    for (let i = 0; i < allActors.length; i++) {
      const actor = allActors[i];
      const slideDelay = i * INTRO_STAGGER_MS;
      promises.push((async () => {
        await this.delay(slideDelay);
        this.tryPlay(actor, ANIM_WALK, true);
        await this.tweenPosition(actor, () => ({ x: actor.homeX, y: actor.homeY }), INTRO_SLIDE_MS);
        this.tryPlay(actor, ANIM_IDLE, true);
        // Fade in bars
        await this.tween(100, (t) => {
          actor.hpBar.container.alpha = t;
          if (actor.rageBar) actor.rageBar.container.alpha = t;
        });
      })());
    }

    await Promise.all(promises);
  }

  private async playVsIntro(): Promise<void> {
    const hero = this.players[0];
    const boss = this.enemies[0];
    if (!hero || !boss) return;

    const bw = this.width;
    const bh = this.battleH;
    const charScale = this.config.characterScale ?? 0.12;
    const vsCharScale = charScale * 2.5;

    // Remove mask so VS screen can render full-screen
    const savedMask = this.battleArea.mask as Container | null;
    this.battleArea.mask = null;
    if (savedMask && 'visible' in savedMask) (savedMask as Container).visible = false;

    // Hide all sibling containers (dim overlay, skill bar, mask graphic)
    const parent = this.battleArea.parent;
    const hiddenSiblings: { child: Container; alpha: number }[] = [];
    if (parent) {
      for (const child of parent.children) {
        if (child !== this.battleArea) {
          hiddenSiblings.push({ child: child as Container, alpha: (child as Container).alpha });
          (child as Container).alpha = 0;
        }
      }
    }

    // Save and reset battleArea transform for full-screen rendering
    const savedScaleX = this.battleArea.scale.x;
    const savedScaleY = this.battleArea.scale.y;
    const savedPivotX = this.battleArea.pivot.x;
    const savedPivotY = this.battleArea.pivot.y;
    const savedPosX = this.battleArea.position.x;
    const savedPosY = this.battleArea.position.y;
    this.battleArea.scale.set(1);
    this.battleArea.pivot.set(0, 0);
    this.battleArea.position.set(0, 0);

    // Estimate full screen height (battleArea is ~55% of screen)
    const fullH = bh / 0.55;

    // Show + hide bars for all actors
    const allActors = [...this.players, ...this.enemies];
    for (const actor of allActors) {
      actor.character.spine.visible = true;
      actor.hpBar.container.visible = true;
      if (actor.rageBar) actor.rageBar.container.visible = true;
      actor.hpBar.container.alpha = 0;
      if (actor.rageBar) actor.rageBar.container.alpha = 0;
    }

    // ── Background: blue/red diagonal split. Extend FAR beyond the design column
    // (overscan) so the panels fully cover the viewport on EVERY aspect ratio —
    // iPad/landscape side margins and the area below the design height included.
    // Solid-colour polygons, so overdrawing past the screen is free, and this
    // needs no fill params (avoids any first-frame race with layout). ──
    const bg = new Graphics();
    const divLY = fullH * 0.55; // divider Y at the design-column left edge (x=0)
    const divRY = fullH * 0.45; // divider Y at the design-column right edge (x=bw)
    const sw = 4;               // stripe half-width
    const slope = (divRY - divLY) / bw;
    const OVER = 4000;          // overscan well past any viewport margin
    const L = -OVER, R = bw + OVER, T = -OVER, B = fullH + OVER;
    const yL = divLY + slope * L;   // divider Y at the far-left edge
    const yR = divLY + slope * R;   // divider Y at the far-right edge

    // Blue upper region
    bg.poly([L, T, R, T, R, yR - sw, L, yL - sw]);
    bg.fill(0x1155cc);
    // Red lower region
    bg.poly([L, yL + sw, R, yR + sw, R, B, L, B]);
    bg.fill(0xcc2222);
    // White diagonal stripe
    bg.poly([L, yL - sw, R, yR - sw, R, yR + sw, L, yL + sw]);
    bg.fill(0xffffff);

    this.battleArea.addChild(bg);

    // Two independent lightning bolts along the diagonal, flickering every ~70ms.
    // Span a wide (bounded) extent so the bolt reaches across typical viewports;
    // the white stripe underneath covers any remainder at the far edges.
    const lightning = new Graphics();
    this.battleArea.addChild(lightning);
    const x1 = -1000, y1 = divLY + slope * -1000;
    const x2 = bw + 1000, y2 = divLY + slope * (bw + 1000);
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len; // perpendicular unit vector
    const makePath = (amp: number): number[] => {
      const segments = Math.max(10, Math.ceil(len / 26));
      const pts: number[] = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const bx2 = x1 + dx * t;
        const by2 = y1 + dy * t;
        const taper = Math.sin(t * Math.PI);
        const jitter = (i === 0 || i === segments) ? 0 : (Math.random() * 2 - 1) * amp * taper;
        pts.push(bx2 + nx * jitter, by2 + ny * jitter);
      }
      return pts;
    };
    const tracePath = (pts: number[]) => {
      lightning.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) lightning.lineTo(pts[i], pts[i + 1]);
    };
    const drawLightning = () => {
      lightning.clear();
      // Main bolt — thicker, bluer glow
      const pts1 = makePath(9);
      tracePath(pts1); lightning.stroke({ color: 0x4aa8ff, width: 14, alpha: 0.35 });
      tracePath(pts1); lightning.stroke({ color: 0xbde0ff, width: 7, alpha: 0.7 });
      tracePath(pts1); lightning.stroke({ color: 0xffffff, width: 2.5, alpha: 1 });
      // Secondary bolt — independent jitter, thinner, warmer tint
      const pts2 = makePath(13);
      tracePath(pts2); lightning.stroke({ color: 0xffeecc, width: 6, alpha: 0.45 });
      tracePath(pts2); lightning.stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 });
    };
    drawLightning();
    let lightningAcc = 0;
    const lightningTick = (t: Ticker) => {
      lightningAcc += t.deltaMS;
      if (lightningAcc < 70) return;
      lightningAcc = 0;
      drawLightning();
    };
    this.ticker.add(lightningTick);

    // Re-add characters on top of VS background
    hero.addTo(this.battleArea);
    boss.addTo(this.battleArea);

    // Position hero upper-left, boss lower-right (off-screen to start)
    const heroSpine = hero.character.spine;
    const bossSpine = boss.character.spine;

    // Spread across the FULL visible width (fracToX), so on iPad/landscape the
    // hero and boss are well separated instead of clustered in a centre column.
    const heroVsX = this.fracToX(0.35);
    const heroVsY = fullH * 0.40;
    const bossVsX = this.fracToX(0.65);
    const bossVsY = fullH * 1;
    const offL = this.layoutX - 300;                 // off the left edge
    const offR = this.layoutX + this.layoutW + 300;  // off the right edge

    heroSpine.position.set(offL, heroVsY);
    heroSpine.scale.set(hero.config.spine.vsScale ?? vsCharScale);
    bossSpine.position.set(offR, bossVsY);
    const vsEnemyScale = boss.config.spine.vsScale ?? (vsCharScale * 0.8);
    bossSpine.scale.set(vsEnemyScale);

    this.tryPlay(hero, ANIM_IDLE, true);
    this.tryPlay(boss, ANIM_IDLE, true);

    // ── Phase 2 — Slide in (300ms + 80ms stagger) ──
    const heroSlide = this.tween(300, (t) => {
      const ease = t * (2 - t); // OutQuad
      heroSpine.x = offL + (heroVsX - offL) * ease;
    });

    const bossSlide = (async () => {
      await this.delay(80);
      await this.tween(300, (t) => {
        const ease = t * (2 - t); // OutQuad
        bossSpine.x = offR + (bossVsX - offR) * ease;
      });
    })();

    await Promise.all([heroSlide, bossSlide]);

    // ── Phase 3 — VS slam ──
    const cx = this.fracToX(0.5);   // centre of the visible width
    const cy = fullH / 2;

    // VS text — white fill, black stroke (matches ref)
    const vsText = new Text({
      text: 'VS',
      style: new TextStyle({
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 90,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: { color: 0x222222, width: 8 },
        dropShadow: {
          color: 0x000000,
          blur: 6,
          distance: 3,
          angle: Math.PI / 4,
        },
      }),
    });
    vsText.anchor.set(0.5, 0.5);
    vsText.position.set(cx, cy);
    vsText.scale.set(0);
    this.battleArea.addChild(vsText);

    // Scale 0 → 1.3 with OutBack easing (200ms)
    await this.tween(200, (t) => {
      const s = 1.70158;
      const t1 = t - 1;
      const ease = t1 * t1 * ((s + 1) * t1 + s) + 1;
      vsText.scale.set(ease * 1.3);
    });

    // Screen shake on impact
    this.hitEffect.shake(8);

    // Settle 1.3 → 1.0 (100ms)
    await this.tween(100, (t) => {
      vsText.scale.set(1.3 - t * 0.3);
    });

    // ── Phase 4 — Hold (600ms) ──
    await this.delay(600);

    // ── Phase 5 — Fade VS overlay ──
    const heroFightScale = hero.config.scale ?? hero.config.spine.defaultScale ?? charScale;
    const bossFightScale = boss.config.scale ?? boss.config.spine.defaultScale ?? charScale;

    // Fade VS text + bg while still in identity transform
    await this.tween(200, (t) => {
      vsText.alpha = 1 - t;
      vsText.scale.set(1 + t * 0.2);
      bg.alpha = 1 - t;
      lightning.alpha = 1 - t;
    });
    this.ticker.remove(lightningTick);
    vsText.destroy();
    bg.destroy();
    lightning.destroy();

    // Restore battleArea transform
    this.battleArea.scale.set(savedScaleX, savedScaleY);
    this.battleArea.pivot.set(savedPivotX, savedPivotY);
    this.battleArea.position.set(savedPosX, savedPosY);

    // Convert VS screen positions to restored local space
    const toLocalX = (sx: number) => (sx - savedPosX) / savedScaleX + savedPivotX;
    const toLocalY = (sy: number) => (sy - savedPosY) / savedScaleY + savedPivotY;
    const heroStartX = toLocalX(heroVsX);
    const heroStartY = toLocalY(heroVsY);
    const bossStartX = toLocalX(bossVsX);
    const bossStartY = toLocalY(bossVsY);
    const heroStartScale = (hero.config.spine.vsScale ?? vsCharScale) / savedScaleX;
    const bossStartScale = vsEnemyScale / savedScaleX;

    heroSpine.position.set(heroStartX, heroStartY);
    heroSpine.scale.set(heroStartScale);
    bossSpine.position.set(bossStartX, bossStartY);
    bossSpine.scale.set(bossStartScale);

    // Restore mask and siblings
    if (savedMask && 'visible' in savedMask) (savedMask as Container).visible = true;
    this.battleArea.mask = savedMask;
    for (const { child, alpha } of hiddenSiblings) child.alpha = alpha;

    // ── Phase 6 — Morph to fight positions ──
    await this.tween(300, (t) => {
      const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) * (-2 * t + 2) / 2;

      heroSpine.x = heroStartX + (hero.homeX - heroStartX) * ease;
      heroSpine.y = heroStartY + (hero.homeY - heroStartY) * ease;
      heroSpine.scale.set(heroStartScale + (heroFightScale - heroStartScale) * ease);

      bossSpine.x = bossStartX + (boss.homeX - bossStartX) * ease;
      bossSpine.y = bossStartY + (boss.homeY - bossStartY) * ease;
      bossSpine.scale.set(bossStartScale + (bossFightScale - bossStartScale) * ease);
    });

    // Restore depth-sorted draw order (VS intro moved hero+boss to end)
    const sorted = [...this.enemies].sort((a, b) => a.homeY - b.homeY);
    for (const actor of sorted) actor.addTo(this.battleArea);
    // Depth-sort players by Y too (like enemies): a pet placed higher (smaller
    // homeY) renders BEHIND the hero. Single-hero fights are unaffected.
    for (const player of [...this.players].sort((a, b) => a.homeY - b.homeY)) player.addTo(this.battleArea);

    // Fade in HP/rage bars (100ms)
    await this.tween(100, (t) => {
      for (const actor of allActors) {
        actor.hpBar.container.alpha = t;
        if (actor.rageBar) actor.rageBar.container.alpha = t;
      }
    });
  }

  // ── Victory ────────────────────────────────────────

  private async playVictory(): Promise<void> {
    const labelText = this.config.onVictory?.labelText ?? 'VICTORY!';
    const holdMs = this.config.onVictory?.holdMs ?? VICTORY_HOLD_MS;

    // Play rage animation on the hero (victory flourish). Opt-out via config so
    // flows with a dramatic finisher don't show the hero swinging at a dead boss.
    const hero = this.players[0];
    if (hero && !hero.dead && (this.config.onVictory?.heroPose ?? true)) {
      this.tryPlay(hero, ATTACK_TIMING.rage.animWithFallbacks, false);
    }

    const label = new Text({
      text: labelText,
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontSize: 48,
        fontWeight: '900',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 8, join: 'round' },
        letterSpacing: 2,
      }),
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(this.width / 2, this.battleH * (this.config.onVictory?.labelYFrac ?? 0.4));
    label.scale.set(0);
    this.battleArea.addChild(label);

    // Scale in with overshoot
    await this.tween(150, (t) => {
      const ease = t < 0.6 ? t / 0.6 * 1.2 : 1.2 - (t - 0.6) / 0.4 * 0.2;
      label.scale.set(ease);
    });

    await this.delay(holdMs);

    // Leave the full scene up (label + characters + background) for callers that
    // crossfade straight into the next scene — the crossfade is the transition.
    if (this.keepSceneOnVictory) return;

    if (this.skipVictoryFade) {
      // Fade out label, characters, and HP bars — but keep the background visible
      // Capture current alpha so dead enemies (alpha=0) don't flash back to life
      const faders: { obj: { alpha: number }; startAlpha: number }[] = [
        { obj: label, startAlpha: label.alpha },
      ];
      for (const a of [...this.players, ...this.enemies]) {
        faders.push({ obj: a.character.spine, startAlpha: a.character.spine.alpha });
        faders.push({ obj: a.hpBar.container, startAlpha: a.hpBar.container.alpha });
        if (a.rageBar) faders.push({ obj: a.rageBar.container, startAlpha: a.rageBar.container.alpha });
      }
      await this.tween(VICTORY_FADE_MS, (t) => {
        for (const f of faders) f.obj.alpha = f.startAlpha * (1 - t);
      });
    } else {
      // Fade out everything including background
      await this.tween(VICTORY_FADE_MS, (t) => {
        this.battleArea.alpha = 1 - t;
      });
    }
  }

  // ── Helpers ────────────────────────────────────────

  /** Play hit reaction animation on a target, then return to Idle. */
  private playHit(target: FightActor): void {
    if (target.dead) return;
    sfx.damage(0.7);
    this.tryPlay(target, ANIM_HIT, false);
    const idleName = this.findAnim(target, ANIM_IDLE);
    if (idleName) target.character.queue(idleName, true, 0);
  }

  private getActor(side: 'player' | 'enemy', index: number): FightActor | undefined {
    const arr = side === 'player' ? this.players : this.enemies;
    return arr[index];
  }

  /** True if the step immediately after the current one is a `die` targeting the given actor. */
  private nextStepKills(side: 'player' | 'enemy', actorIndex: number): boolean {
    const next = this.currentSteps[this.stepIndex + 1];
    if (!next || next.type !== 'die') return false;
    const dieSide = next.side ?? 'enemy';
    return dieSide === side && next.actor === actorIndex;
  }

  private isTargetDead(step: FightStep): boolean {
    if (step.type === 'wait' || step.type === 'label' || step.type === 'levelup' || step.type === 'weaponReward') return false;
    if (step.type === 'die') {
      const side = step.side ?? 'enemy';
      const actor = this.getActor(side, step.actor);
      return actor?.dead ?? false;
    }
    if (step.type === 'status') {
      const side = step.side ?? 'enemy';
      const actor = this.getActor(side, step.target);
      return actor?.dead ?? false;
    }
    if (step.type === 'attack' || step.type === 'skill') {
      const actor = this.getActor(step.side, step.actor);
      if (actor?.dead) return true;
      if (step.target !== undefined) {
        const targetSide = step.targetSide ?? (step.side === 'player' ? 'enemy' : 'player');
        const target = this.getActor(targetSide, step.target);
        if (target?.dead) return true;
      }
    }
    return false;
  }

  private showFloatingLabel(text: string, actor: FightActor, color: number): void {
    const label = new Text({
      text,
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontSize: 20,
        fontWeight: 'bold',
        fill: color,
        stroke: { color: 0x000000, width: 3 },
      }),
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(actor.character.spine.x, actor.character.spine.y - 120);
    this.battleArea.addChild(label);

    // Float up and fade out
    const startY = label.y;
    this.tween(600, (t) => {
      label.y = startY - t * 40;
      label.alpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
    }).then(() => label.destroy());
  }

  /** Tween actor HP with smooth bar animation. Auto-triggers death at 0 (runs in parallel). */
  private async tweenHp(actor: FightActor, newHp: number): Promise<void> {
    const startHp = actor.hp;
    const endHp = Math.max(0, Math.min(newHp, actor.maxHp));
    await this.tween(HP_TWEEN_MS, (t) => {
      const current = Math.round(startHp + (endHp - startHp) * t);
      actor.setHp(current);
    });
    if (endHp <= 0 && !actor.dead) {
      void this.killActor(actor);
    }
    // Peek ahead: if the next scripted step is a vignette toggle, start it now
    // so the red tint fades in during the HP drop rather than queueing behind
    // the attack's dramatic fade-out and return walk.
    const nextStep = this.currentSteps[this.stepIndex + 1];
    if (nextStep?.type === 'vignette') {
      void this.toggleVignette(nextStep);
    }
  }

  /** Tween actor position (spine + bars move together). */
  /**
   * Move an actor (and its HP/rage bars) to the point returned by `to`.
   * `to`/`from` are resolver closures evaluated live every frame so an
   * orientation change mid-move (which re-homes actors via layoutActors())
   * re-routes the motion immediately instead of finishing on the stale path.
   * `from` defaults to the actor's position frozen at the start of the move.
   */
  private async tweenPosition(
    actor: FightActor,
    to: () => { x: number; y: number },
    durationMs: number,
    from?: () => { x: number; y: number },
  ): Promise<void> {
    const spine = actor.character.spine;
    const sx = spine.x;
    const sy = spine.y;
    const motion = {
      from: from ?? (() => ({ x: sx, y: sy })),
      to,
      // Bar offsets relative to the spine are layout-constant, so capturing
      // them once at the start keeps the bars glued through a resize.
      hpOffX: actor.hpBar.container.x - sx,
      hpOffY: actor.hpBar.container.y - sy,
      rageOffX: actor.rageBar ? actor.rageBar.container.x - sx : 0,
      rageOffY: actor.rageBar ? actor.rageBar.container.y - sy : 0,
      t: 0,
    };
    this.activeMotions.set(actor, motion);
    try {
      await this.tween(durationMs, (t) => {
        motion.t = t;
        this.applyMotion(actor);
      });
    } finally {
      this.activeMotions.delete(actor);
    }
  }

  /** General purpose tween (0 → 1). Wraps shared tween() with FIGHT_SPEED. */
  tween(durationMs: number, fn: (t: number) => void): Promise<void> {
    return sharedTween(this.ticker, durationMs, fn, FIGHT_SPEED);
  }

  /** Wait for a duration. Wraps shared delay() with FIGHT_SPEED. */
  delay(ms: number): Promise<void> {
    return sharedDelay(this.ticker, ms, FIGHT_SPEED);
  }

  /** Try to play the first animation name that exists on the actor's skeleton. */
  private tryPlay(actor: FightActor, names: string[], loop: boolean): string | null {
    const skeleton = actor.character.spine.skeleton;
    for (const name of names) {
      if (skeleton.data.findAnimation(name)) {
        actor.character.play(name, loop);
        return name;
      }
    }
    // None found — stay on current animation
    return null;
  }

  /** Find the first animation name from a fallback list that exists on the actor. */
  private findAnim(actor: FightActor, names: string[]): string | null {
    const skeleton = actor.character.spine.skeleton;
    for (const name of names) {
      if (skeleton.data.findAnimation(name)) return name;
    }
    return null;
  }

  /** Returns a promise that resolves when the given Spine animation fires an event with `eventName`.
   *  Falls back to a fraction of the animation's actual duration if no such event exists. */
  private waitForAnimEvent(
    actor: FightActor, animName: string | null, eventName: string,
    fallbackMs: number, attackElapsed: number,
  ): Promise<void> {
    // Check if the animation actually contains this event
    if (animName) {
      const anim = actor.character.spine.skeleton.data.findAnimation(animName);
      if (anim) {
        const hasEvent = anim.timelines.some((tl: any) =>
          tl.events?.some((e: any) => e.data?.name === eventName),
        );
        if (hasEvent) {
          return new Promise<void>(resolve => {
            let resolved = false;
            const listener = {
              event: (_entry: any, evt: any) => {
                if (!resolved && evt.data.name === eventName) {
                  resolved = true;
                  actor.character.spine.state.removeListener(listener);
                  resolve();
                }
              },
            };
            actor.character.spine.state.addListener(listener);
            // Safety timeout: resolve + cleanup if event never fires (e.g. scene teardown)
            const remaining = fallbackMs - attackElapsed;
            const safetyMs = Math.max(remaining, 0) + 2000;
            this.delay(safetyMs).then(() => {
              if (!resolved) {
                resolved = true;
                actor.character.spine.state.removeListener(listener);
                resolve();
              }
            });
          });
        }

        // No event — use 45% of animation duration as the damage moment
        const animDurationMs = anim.duration * 1000;
        if (animDurationMs > 0) {
          const wait = animDurationMs * 0.45;
          return wait > 0 ? this.delay(wait) : Promise.resolve();
        }
      }
    }
    // Fallback to fixed timing
    const remaining = fallbackMs - attackElapsed;
    return remaining > 0 ? this.delay(remaining) : Promise.resolve();
  }
}
