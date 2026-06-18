import type { PowerupId, PowerupDef, XpConfig } from '../SidescrollerScript';
import type { HeroEntity } from '../entities/HeroEntity';
import type { ProjectileManager } from './ProjectileManager';

export class PowerupEffects {
  private config: XpConfig;
  private hero: HeroEntity;
  private projectileManager: ProjectileManager;

  spectralActive = false;
  iceActive = false;
  iceSlowFactor = 0.5;
  iceSlowDurationMs = 2000;

  homingActive = false;
  fireActive = false;
  burnDps = 8;
  burnDurationMs = 2000;
  lightningActive = false;
  chainCount = 2;
  chainDamageRatio = 0.5;
  chainRange = 150;
  splitActive = false;

  constructor(config: XpConfig, hero: HeroEntity, projectileManager: ProjectileManager) {
    this.config = config;
    this.hero = hero;
    this.projectileManager = projectileManager;
  }

  apply(id: PowerupId): void {
    const def = this.config.availablePowerups.find(p => p.id === id);

    if (!def) {
      return;
    }

    switch (id) {
      case 'fasterRate':
        this.applyFasterRate(def);
        break;
      case 'spectralArrows':
        this.applySpectral(def);
        break;
      case 'iceArrows':
        this.applyIce(def);
        break;
      case 'magneticArrows':
        this.applyMagnetic(def);
        break;
      case 'fireArrows':
        this.applyFire(def);
        break;
      case 'lightningArrows':
        this.applyLightning(def);
        break;
      case 'splitArrows':
        this.applySplit(def);
        break;
    }
  }

  private applyFasterRate(def: PowerupDef): void {
    const mult = def.params?.rateMultiplier ?? 1.3;
    this.hero.setAttackRateMultiplier(mult);
  }

  private applySpectral(_def: PowerupDef): void {
    this.spectralActive = true;
    this.setSpriteLook('spectralArrows', false, -Math.PI / 2); // lay the upright bolt along travel
  }

  private applyIce(def: PowerupDef): void {
    this.iceActive = true;
    this.iceSlowFactor = def.params?.slowFactor ?? 0.5;
    this.iceSlowDurationMs = def.params?.slowDurationMs ?? 2000;
    this.projectileManager.projectileLook = { mode: 'tint', tint: 0x9fe8ff }; // icy-blue
  }

  private applyMagnetic(def: PowerupDef): void {
    this.homingActive = true;
    this.projectileManager.homing = true;
    this.projectileManager.homingStrength = def.params?.homingStrength ?? 3.0;
    this.projectileManager.projectileLook = { mode: 'tint', tint: 0xff4444 }; // seeking red
  }

  private applyFire(def: PowerupDef): void {
    this.fireActive = true;
    this.burnDps = def.params?.burnDps ?? 8;
    this.burnDurationMs = def.params?.burnDurationMs ?? 2000;
    this.setSpriteLook('fireArrows');
  }

  private applyLightning(def: PowerupDef): void {
    this.lightningActive = true;
    this.chainCount = def.params?.chainCount ?? 2;
    this.chainDamageRatio = def.params?.chainDamageRatio ?? 0.5;
    this.chainRange = def.params?.chainRange ?? 150;
    // No sprite for lightning — keep the default bolt; the on-hit electric zap reads it.
    this.projectileManager.projectileLook = { mode: 'default' };
  }

  private applySplit(def: PowerupDef): void {
    this.splitActive = true;
    this.projectileManager.splitActive = true;
    this.projectileManager.splitDelayMs = def.params?.splitDelayMs ?? 150;
    this.projectileManager.splitAngle = def.params?.splitAngle ?? 15;
    this.setSpriteLook('splitArrows', true); // spinning shuriken
  }

  /** Switch projectiles to a card-icon sprite (if its texture is loaded), else leave as-is. */
  private setSpriteLook(id: string, spin = false, baseRotation = 0): void {
    const texture = this.projectileManager.projectileTextures[id];
    if (texture) {
      this.projectileManager.projectileLook = { mode: 'sprite', texture, spin, baseRotation };
    }
  }
}
