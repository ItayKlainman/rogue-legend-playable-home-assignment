import { sfx } from '../audio/sfx';

export interface CoinEconomyConfig { start: number; regen: number; max: number; }
export type CoinSink = (coins: number) => void;

export class CoinEconomy {
  coins: number;
  private regenRate: number;
  private readonly max: number;
  private readonly onChange?: CoinSink;

  constructor(cfg: CoinEconomyConfig, onChange?: CoinSink) {
    this.coins = cfg.start;
    this.regenRate = cfg.regen;
    this.max = cfg.max;
    this.onChange = onChange;
  }

  setRegenRate(rate: number): void { this.regenRate = rate; }

  /** Advance by dtMs of wall/combat time. */
  tick(dtMs: number): void {
    if (this.coins >= this.max) return;
    const before = this.coins;
    this.coins = Math.min(this.max, this.coins + this.regenRate * (dtMs / 1000));
    if (Math.floor(before) < Math.floor(this.coins)) sfx.coinTick();
    this.onChange?.(this.coins);
  }

  canAfford(cost: number): boolean { return this.coins >= cost; }

  spend(cost: number): boolean {
    if (this.coins < cost) return false;
    this.coins = Math.max(0, this.coins - cost);
    this.onChange?.(this.coins);
    return true;
  }
}
