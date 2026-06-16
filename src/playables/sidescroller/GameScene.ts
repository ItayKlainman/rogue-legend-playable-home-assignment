import { Assets, Container, Graphics, Sprite, Ticker } from 'pixi.js';
import type { Scene } from '@shared/Scene';
import type { SidescrollerScript } from './SidescrollerScript';
import { HeroEntity } from './entities/HeroEntity';
import { EnemyEntity } from './entities/EnemyEntity';
import { XpOrb } from './entities/XpOrb';
import { ProjectileManager } from './systems/ProjectileManager';
import { EnemySpawner } from './systems/EnemySpawner';
import type { SpawnerCallbacks } from './systems/EnemySpawner';
import { checkCollisions } from './systems/CollisionSystem';
import { XpSystem } from './systems/XpSystem';
import { PowerupEffects } from './systems/PowerupEffects';
import { HpBar } from './ui/HpBar';
import { WaveIndicator } from './ui/WaveIndicator';
import { XpBar } from './ui/XpBar';
import { LevelUpScene } from './scenes/LevelUpScene';
import type { LevelUpPlayerState } from './scenes/LevelUpScene';
import type { SkillConfig } from './scenes/skillTypes';
import { SpriteEffect } from '@shared/SpriteEffect';
import { sfx, music } from './sfx';
import flameSheetData from 'assets/VFX/Flame_3_loop_SpriteSheet.webp';
import electricitySheetData from 'assets/VFX/Electricity_Splash_2_SpriteSheet.webp';
import explosionSheetData from 'assets/VFX/explosion_5_SpriteSheet.webp';

// Cap roguelike level-ups (assignment: "repeat ~3–5 times"). All 7 powerups stay in the
// pool so every level still offers 3 distinct cards (7,6,5,4,3 remaining across 5 levels).
const MAX_LEVELUPS = 5;

// Level-up slow-mo: ramp the world down to SLOWMO_MIN over SLOWMO_MS, then show the cards.
const SLOWMO_MS = 280;
const SLOWMO_MIN = 0.12;

export class GameScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;

  private resolveDone!: () => void;
  private script: SidescrollerScript;
  private ticker: Ticker;
  private width: number;
  private height: number;
  private ready = false;

  private bg!: Sprite;
  private gameLayer!: Container;
  private uiLayer!: Container;
  private hero!: HeroEntity;
  private projectileManager!: ProjectileManager;
  private spawner!: EnemySpawner;
  private hpBar!: HpBar;
  private waveIndicator!: WaveIndicator;
  private enemies: EnemyEntity[] = [];
  private gameOver = false;
  private ended = false;
  private endDelay = 0;

  private xpSystem: XpSystem | null = null;
  private xpBar: XpBar | null = null;
  private xpOrbs: XpOrb[] = [];
  private powerupEffects: PowerupEffects | null = null;
  private paused = false;
  private levelUpScene: LevelUpScene | null = null;
  private flameEffect: SpriteEffect | null = null;
  private electricityEffect: SpriteEffect | null = null;
  private explosionEffect: SpriteEffect | null = null;

  // Juice: camera shake + hit-stop
  private shakeTimer = 0;
  private shakeDuration = 0;
  private shakeMag = 0;
  private hitStopTimer = 0;

  // Juice: level-up slow-mo ramp (plays before the cards appear)
  private inSlowmo = false;
  private slowmoTimer = 0;

  constructor(script: SidescrollerScript, ticker: Ticker, width: number, height: number) {
    this.script = script;
    this.ticker = ticker;
    this.width = width;
    this.height = height;
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
  }

  async enter(): Promise<void> {
    const bgTexture = await Assets.load(this.script.background);
    this.bg = new Sprite(bgTexture);
    this.bg.width = this.width;
    this.bg.height = this.height;
    this.container.addChild(this.bg);

    this.gameLayer = new Container();
    this.container.addChild(this.gameLayer);

    const heroConfig = this.script.hero;
    this.hero = new HeroEntity(
      heroConfig.spineBundle,
      heroConfig.skin,
      heroConfig.scale,
      heroConfig.hp,
      heroConfig.speed,
      heroConfig.attackRate,
      heroConfig.arrowDamage,
      heroConfig.arrowSpeed,
    );
    await this.hero.init(this.ticker, this.width, this.height);
    this.gameLayer.addChild(this.hero.container);

    this.hero.onFire = (x, y, damage, speed) => {
      const target = this.projectileManager.findTarget?.(x, y) ?? null;
      const angle = target ? Math.atan2(target.y - y, target.x - x) : 0;
      this.projectileManager.fire(x, y, speed, damage, angle);
      this.spawnMuzzleFlash(x, y);
    };

    this.hero.onDeath = () => {
      if (__DEV__) { console.log('[ss] END: hero died'); }
      this.gameOver = true;
      this.endDelay = 1500;
    };

    this.projectileManager = new ProjectileManager(this.width, this.height);
    this.container.addChild(this.projectileManager.container);

    // Auto-aim target: prioritise the NEAREST enemy (per the brief's "auto-casts at the
    // nearest enemies"), tie-broken by lowest-HP. Used for both the initial aim and homing steering.
    this.projectileManager.findTarget = (x, y) => {
      let best: EnemyEntity | null = null;
      let bestHp = Infinity;
      let bestDist = Infinity;

      for (const e of this.enemies) {
        if (!e.isAlive) {
          continue;
        }

        const hp = e.currentHp;
        const d = Math.hypot(e.x - x, e.centerY - y);

        if (d < bestDist || (d === bestDist && hp < bestHp)) {
          bestHp = hp;
          bestDist = d;
          best = e;
        }
      }

      return best ? { x: best.x, y: best.centerY } : null;
    };

    const spawnerCallbacks: SpawnerCallbacks = {
      onEnemySpawned: (enemy) => {
        this.enemies.push(enemy);
        this.gameLayer.addChild(enemy.container);
        enemy.onDeath = (e) => this.removeEnemy(e);
        enemy.onKilled = (e) => this.onEnemyKilled(e);

        if (enemy.isBoss) {
          music.boss();     // swap gameplay → boss theme on the boss entrance
          this.shake(10, 400);
        }
      },
      onWaveComplete: (_waveIndex) => {},
      onAllComplete: () => {
        this.checkVictory();
      },
    };

    this.spawner = new EnemySpawner(
      this.script.mode,
      this.script.waves ?? [],
      this.script.continuous ?? null,
      this.ticker,
      this.width,
      this.height,
      spawnerCallbacks,
    );

    this.uiLayer = new Container();
    this.container.addChild(this.uiLayer);

    this.hpBar = new HpBar(this.hero.maximumHp);
    this.hpBar.layout(this.width);
    this.uiLayer.addChild(this.hpBar.container);

    const totalWaves = this.script.mode === 'waves' ? (this.script.waves?.length ?? 0) : 0;
    this.waveIndicator = new WaveIndicator(totalWaves);
    this.waveIndicator.layout(this.width);
    this.uiLayer.addChild(this.waveIndicator.container);

    if (this.script.xp) {
      this.xpSystem = new XpSystem(this.script.xp);
      this.powerupEffects = new PowerupEffects(this.script.xp, this.hero, this.projectileManager);

      this.xpBar = new XpBar();
      this.xpBar.layout(this.width);
      this.uiLayer.addChild(this.xpBar.container);

      const orbPoolSize = 20;

      for (let i = 0; i < orbPoolSize; i++) {
        const orb = new XpOrb();
        this.xpOrbs.push(orb);
        this.uiLayer.addChild(orb.graphics);
      }
    }

    this.flameEffect = await SpriteEffect.load({
      spriteData: flameSheetData,
      columns: 4,
      rows: 2,
      totalFrames: 8,
      fps: 20,
    });

    this.electricityEffect = await SpriteEffect.load({
      spriteData: electricitySheetData,
      columns: 4,
      rows: 2,
      totalFrames: 5,
      fps: 10,
    });

    this.explosionEffect = await SpriteEffect.load({
      spriteData: explosionSheetData,
      columns: 4,
      rows: 2,
      totalFrames: 8,
      fps: 30,
    });

    music.gameplay(); // starts on first user gesture (autoplay policy)

    this.ready = true;
  }

  async exit(): Promise<void> {
    this.container.removeChildren();
  }

  update(deltaMS: number): void {
    if (!this.ready) {
      return;
    }

    if (this.gameOver) {
      if (this.ended) {
        return;
      }

      this.endDelay -= deltaMS;

      if (this.endDelay <= 0) {
        this.ended = true;
        this.resolveDone();
      }
      return;
    }

    for (const orb of this.xpOrbs) {
      orb.update(deltaMS);
    }

    if (this.paused) {
      if (this.levelUpScene) {
        this.levelUpScene.update(deltaMS);
      }

      return;
    }

    // Hit-stop: briefly freeze the world for impact (e.g. boss death). Shake still settles.
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= deltaMS;
      this.updateShake(deltaMS);
      return;
    }

    // Level-up slow-mo intro: ramp the world down, then hand off to the card overlay.
    let simDelta = deltaMS;
    if (this.inSlowmo) {
      this.slowmoTimer -= deltaMS;

      if (this.slowmoTimer <= 0) {
        this.inSlowmo = false;
        this.enterLevelUpPause();
        return;
      }

      const t = 1 - this.slowmoTimer / SLOWMO_MS; // 0 → 1 across the ramp
      const factor = 1 - (1 - SLOWMO_MIN) * (t * t);
      simDelta = deltaMS * factor;
      this.setWorldTimeScale(factor);
    }

    this.hero.update(simDelta, { x: 0, y: 0 }); // idle: hero never moves
    this.spawner.update(simDelta);
    this.projectileManager.update(simDelta);

    for (const enemy of this.enemies) {
      if (enemy.isAlive || enemy.isDying) {
        enemy.update(simDelta, this.hero.x, this.hero.y);
      }
    }

    this.sortGameLayer();

    const activeProjectiles = this.projectileManager.getActiveProjectiles();
    const result = checkCollisions(this.hero, this.enemies, activeProjectiles);

    const pendingChainHits: { enemy: EnemyEntity; damage: number }[] = [];

    for (const hit of result.projectileHits) {
      if (this.powerupEffects?.lightningActive && hit.enemy.isAlive) {
        const targets = this.findChainTargets(
          hit.enemy,
          this.powerupEffects.chainCount,
          this.powerupEffects.chainRange,
        );
        const chainDmg = Math.round(hit.projectile.hitDamage * this.powerupEffects.chainDamageRatio);

        for (const t of targets) {
          pendingChainHits.push({ enemy: t, damage: chainDmg });
        }
      }

      const isCrit = Math.random() < 0.25;
      const dmg = isCrit ? Math.round(hit.projectile.hitDamage * 2) : hit.projectile.hitDamage;
      hit.enemy.takeDamage(dmg, isCrit);

      if (!hit.projectile.piercing) {
        hit.projectile.deactivate();
      }

      if (this.powerupEffects?.iceActive && hit.enemy.isAlive) {
        hit.enemy.applySlow(this.powerupEffects.iceSlowFactor, this.powerupEffects.iceSlowDurationMs);
      }

      if (this.powerupEffects?.fireActive && hit.enemy.isAlive) {
        hit.enemy.applyBurn(
          this.powerupEffects.burnDps,
          this.powerupEffects.burnDurationMs,
          this.flameEffect ?? undefined,
        );
      }

      sfx.arrowHit();
    }

    if (pendingChainHits.length > 0) {
      sfx.chainLightning();
    }

    for (const ch of pendingChainHits) {
      if (ch.enemy.isAlive) {
        ch.enemy.takeDamage(ch.damage);

        if (this.electricityEffect) {
          this.electricityEffect.play(this.gameLayer, ch.enemy.x, ch.enemy.centerY, {
            scale: 1.5,
          });
        }
      }
    }

    for (const enemy of result.heroContacts) {
      this.hero.takeDamage(enemy.contactDamage);
      enemy.resetContactCooldown();
      sfx.heroDamage();
    }

    this.hpBar.update(this.hero.currentHp);

    if (this.xpBar && this.xpSystem) {
      this.xpBar.update(this.xpSystem.currentXp, this.xpSystem.xpToNext);
    }

    if (this.script.mode === 'waves') {
      this.waveIndicator.update(this.spawner.currentWave + 1);
    }

    this.updateShake(deltaMS);
  }

  // ── Juice helpers ───────────────────────────────────────────────────────────
  private startLevelUp(): void {
    sfx.powerUp();
    this.spawnLevelUpFlash();
    this.inSlowmo = true;
    this.slowmoTimer = SLOWMO_MS;
  }

  private spawnLevelUpFlash(): void {
    const flash = new Graphics();
    flash.rect(0, 0, this.width, this.height).fill({ color: 0xffffff });
    flash.alpha = 0.85;
    flash.eventMode = 'none';
    this.container.addChild(flash);

    let elapsed = 0;
    const duration = 320;
    const onTick = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      const t = Math.min(1, elapsed / duration);
      flash.alpha = 0.85 * (1 - t);

      if (t >= 1) {
        flash.destroy();
        ticker.remove(onTick);
      }
    };
    Ticker.shared.add(onTick);
  }

  private setWorldTimeScale(scale: number): void {
    this.hero.setSpineTimeScale(scale);

    for (const e of this.enemies) {
      e.setSpineTimeScale(scale);
    }
  }

  private onEnemyKilled(enemy: EnemyEntity): void {
    if (this.explosionEffect) {
      const scale = (Math.max(60, enemy.displayHeight) * 1.6) / 512;
      this.explosionEffect.play(this.gameLayer, enemy.x, enemy.centerY, { scale });
    }

    if (enemy.isBoss) {
      this.shake(16, 600);
      this.hitStop(140);
    } else {
      this.shake(2.5, 70);
    }
  }

  private spawnMuzzleFlash(x: number, y: number): void {
    if (!this.gameLayer) {
      return;
    }

    const g = new Graphics();
    g.circle(0, 0, 16).fill({ color: 0xfff0a0 });
    g.circle(0, 0, 8).fill({ color: 0xffffff });
    g.position.set(x, y);
    g.blendMode = 'add';
    this.gameLayer.addChild(g);

    let elapsed = 0;
    const duration = 130;
    const onTick = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      const t = Math.min(1, elapsed / duration);
      g.scale.set(0.6 + t * 0.9);
      g.alpha = 1 - t;

      if (t >= 1) {
        g.destroy();
        ticker.remove(onTick);
      }
    };
    Ticker.shared.add(onTick);
  }

  private shake(mag: number, durationMs: number): void {
    this.shakeMag = mag;
    this.shakeDuration = durationMs;
    this.shakeTimer = durationMs;
  }

  private hitStop(durationMs: number): void {
    this.hitStopTimer = Math.max(this.hitStopTimer, durationMs);
  }

  private updateShake(deltaMS: number): void {
    if (this.shakeTimer <= 0) {
      return;
    }

    this.shakeTimer -= deltaMS;
    const t = Math.max(0, this.shakeTimer / this.shakeDuration);
    const m = this.shakeMag * t;
    this.gameLayer.position.set((Math.random() * 2 - 1) * m, (Math.random() * 2 - 1) * m);

    if (this.shakeTimer <= 0) {
      this.gameLayer.position.set(0, 0);
    }
  }

  pause(): void {}
  resume(): void {}

  layout(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (!this.ready) {
      return;
    }

    this.bg.width = width;
    this.bg.height = height;
    this.hero.layout(width, height);
    this.projectileManager.layout(width, height);
    this.spawner.layout(width, height);
    this.hpBar.layout(width);
    this.waveIndicator.layout(width);
    this.xpBar?.layout(width);
    this.levelUpScene?.layout(width, height);
  }

  private removeEnemy(enemy: EnemyEntity): void {
    const idx = this.enemies.indexOf(enemy);

    if (idx >= 0) {
      this.enemies.splice(idx, 1);
    }

    if (this.xpSystem && this.xpBar && this.script.xp) {
      this.spawnXpOrb(enemy.x, enemy.centerY);
    }

    this.gameLayer.removeChild(enemy.container);
    this.checkVictory();
  }

  private spawnXpOrb(fromX: number, fromY: number): void {
    const orb = this.xpOrbs.find(o => !o.isActive);

    if (!orb || !this.xpBar || !this.xpSystem || !this.script.xp) {
      return;
    }

    const targetX = this.xpBar.globalBarX + 100;
    const targetY = this.xpBar.globalBarY;
    const duration = this.script.xp.orbFlyDurationMs;

    orb.onCollected = () => {
      sfx.xpCollect();

      if (!this.xpSystem || !this.script.xp) {
        return;
      }

      const leveledUp = this.xpSystem.addXp(this.script.xp.xpPerKill);

      if (
        leveledUp && !this.paused && !this.inSlowmo
        && this.xpSystem.level < MAX_LEVELUPS
        && this.xpSystem.hasAvailablePowerups()
      ) {
        this.startLevelUp();
      }
    };

    orb.spawn(fromX, fromY, targetX, targetY, duration);
  }

  private async enterLevelUpPause(): Promise<void> {
    if (__DEV__) { console.log('[ss] LEVEL UP →', (this.xpSystem?.level ?? 0) + 1); (window as any).__ssPaused = true; }
    this.paused = true;

    for (const orb of this.xpOrbs) {
      if (orb.isActive) {
        orb.deactivate();
      }
    }

    this.hero.setSpinePaused(true);

    for (const enemy of this.enemies) {
      enemy.setSpinePaused(true);
    }

    if (this.xpBar && this.xpSystem) {
      this.xpBar.update(this.xpSystem.currentXp, this.xpSystem.xpToNext);
    }

    if (!this.xpSystem) {
      this.exitLevelUpPause();
      return;
    }

    const choices = this.xpSystem.getRandomChoices();

    if (choices.length === 0) {
      this.exitLevelUpPause();
      return;
    }

    const skills: SkillConfig[] = choices.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      rarity: 'legendary' as const,
      icon: p.icon,
    }));

    const playerState: LevelUpPlayerState = {
      heroSkin: this.script.hero.skin ?? 'Base',
      weaponConfig: null,
      skills: [],
    };

    const scene = new LevelUpScene(
      {
        skills: [skills],
        showCoach: this.xpSystem.level === 0, // teach the tap on the first level-up only
        onSkillPicked: () => {
          const pickedId = playerState.skills[playerState.skills.length - 1];

          if (pickedId && this.xpSystem && this.powerupEffects) {
            this.xpSystem.applyPowerup(pickedId as any);
            this.powerupEffects.apply(pickedId as any);

            if (this.powerupEffects.spectralActive) {
              this.projectileManager.piercing = true;
            }
          }
        },
      },
      playerState,
      this.ticker,
      this.width,
      this.height,
    );

    this.levelUpScene = scene;
    this.container.addChild(scene.container);
    await scene.enter();
    await scene.done;
    await scene.exit();
    this.container.removeChild(scene.container);
    this.levelUpScene = null;
    this.exitLevelUpPause();
  }

  private exitLevelUpPause(): void {
    if (__DEV__) { (window as any).__ssPaused = false; }
    this.paused = false;

    this.hero.setSpinePaused(false);

    for (const enemy of this.enemies) {
      enemy.setSpinePaused(false);
    }
  }

  private sortGameLayer(): void {
    this.gameLayer.children.sort((a, b) => a.y - b.y);
  }

  private checkVictory(): void {
    if (this.gameOver) {
      return;
    }

    const allSpawned = this.spawner.isFinished;
    const allDead = this.enemies.every(e => !e.isAlive);

    if (allSpawned && allDead) {
      if (__DEV__) { console.log('[ss] END: victory (all enemies cleared)'); }
      this.gameOver = true;
      // Hold on the boss-death beat (explosion / shake / hit-stop) before cutting to the CTA.
      this.endDelay = 2000;
    }
  }

  private findChainTargets(source: EnemyEntity, count: number, range: number): EnemyEntity[] {
    const candidates: { enemy: EnemyEntity; dist: number }[] = [];

    for (const e of this.enemies) {
      if (!e.isAlive || e === source) {
        continue;
      }

      const dist = Math.hypot(e.x - source.x, e.centerY - source.centerY);

      if (dist <= range) {
        candidates.push({ enemy: e, dist });
      }
    }

    candidates.sort((a, b) => a.dist - b.dist);
    return candidates.slice(0, count).map(c => c.enemy);
  }
}
