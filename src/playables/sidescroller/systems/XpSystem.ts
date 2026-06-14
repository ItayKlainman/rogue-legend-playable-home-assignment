import type { XpConfig, PowerupDef, PowerupId } from '../SidescrollerScript';

export class XpSystem {
  private xp = 0;
  private lvl = 0;
  private config: XpConfig;
  private acquired = new Set<PowerupId>();

  constructor(config: XpConfig) {
    this.config = config;
  }

  get currentXp(): number { return this.xp; }
  get xpToNext(): number { return this.config.xpToLevelUp; }
  get level(): number { return this.lvl; }
  get acquiredPowerups(): ReadonlySet<PowerupId> { return this.acquired; }

  addXp(amount: number): boolean {
    this.xp += amount;

    if (this.xp >= this.config.xpToLevelUp) {
      return true;
    }

    return false;
  }

  getRandomChoices(count?: number): PowerupDef[] {
    const n = count ?? this.config.choicesPerLevel;
    const available = this.config.availablePowerups.filter(p => !this.acquired.has(p.id));

    if (available.length === 0) {
      return [];
    }

    const shuffled = available.slice();

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, Math.min(n, shuffled.length));
  }

  applyPowerup(id: PowerupId): void {
    this.acquired.add(id);
    this.xp = 0;
    this.lvl++;
  }

  hasPowerup(id: PowerupId): boolean {
    return this.acquired.has(id);
  }

  hasAvailablePowerups(): boolean {
    return this.config.availablePowerups.some(p => !this.acquired.has(p.id));
  }
}
