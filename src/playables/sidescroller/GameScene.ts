import { Assets, Container, Sprite, Ticker } from 'pixi.js';
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
import { VirtualJoystick } from './ui/VirtualJoystick';
import { HpBar } from './ui/HpBar';
import { WaveIndicator } from './ui/WaveIndicator';
import { XpBar } from './ui/XpBar';
import { LevelUpScene } from './scenes/LevelUpScene';
import type { LevelUpPlayerState } from './scenes/LevelUpScene';
import type { SkillConfig } from './scenes/skillTypes';
import { SpriteEffect } from '@shared/SpriteEffect';
import { sfx } from './sfx';
import flameSheetData from 'assets/VFX/Flame_3_loop_SpriteSheet.webp';
import electricitySheetData from 'assets/VFX/Electricity_Splash_2_SpriteSheet.webp';

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
  private joystick!: VirtualJoystick;
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
      this.projectileManager.fire(x, y, speed, damage);
    };

    this.hero.onDeath = () => {
      this.gameOver = true;
      this.endDelay = 1500;
    };

    this.projectileManager = new ProjectileManager(this.width, this.height);
    this.container.addChild(this.projectileManager.container);

    this.projectileManager.findTarget = (x, y) => {
      let closest: EnemyEntity | null = null;
      let minDist = Infinity;

      for (const e of this.enemies) {
        if (!e.isAlive) {
          continue;
        }

        const d = Math.hypot(e.x - x, e.centerY - y);

        if (d < minDist) {
          minDist = d;
          closest = e;
        }
      }

      return closest ? { x: closest.x, y: closest.centerY } : null;
    };

    const spawnerCallbacks: SpawnerCallbacks = {
      onEnemySpawned: (enemy) => {
        this.enemies.push(enemy);
        this.gameLayer.addChild(enemy.container);
        enemy.onDeath = (e) => this.removeEnemy(e);
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

    this.joystick = new VirtualJoystick();
    this.joystick.layout(this.width, this.height);
    this.uiLayer.addChild(this.joystick.container);

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

    this.hero.update(deltaMS, this.joystick.direction);
    this.spawner.update(deltaMS);
    this.projectileManager.update(deltaMS);

    for (const enemy of this.enemies) {
      if (enemy.isAlive || enemy.isDying) {
        enemy.update(deltaMS, this.hero.x, this.hero.y);
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

      hit.enemy.takeDamage(hit.projectile.hitDamage);

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
    this.joystick.layout(width, height);
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

      if (leveledUp && !this.paused && this.xpSystem.hasAvailablePowerups()) {
        this.enterLevelUpPause();
      }
    };

    orb.spawn(fromX, fromY, targetX, targetY, duration);
  }

  private async enterLevelUpPause(): Promise<void> {
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
      this.gameOver = true;
      this.endDelay = 1000;
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
