// Player deck — auto-fires skills on a per-entry cooldown. Stackable skills (blue tier-1
// and purple tier-2 with target='enemy') merge in place: picking the same id again
// increments the entry's stack (max 3) and re-energises its cooldown (cd=0 fires next
// step). Non-stackable entries (tier-3 yellow, heal/self) dedupe — a second add returns
// `{ rejected: 'dedupe' }`. The deck CAP is on UNIQUE entries; merges don't grow size.

export interface DeckConfig {
  /** Legacy/back-compat default cooldown when `stack` is absent. */
  cooldownMs: number;
  /** Cap on UNIQUE entries (merges don't count). */
  cap: number;
  /** Per-stack cooldown table — index 0=stack-1, 1=stack-2, 2=stack-3, 3=stack-4. */
  stack?: { cooldowns: [number, number, number, number] };
}

/** A skill is stackable iff its tier is 1 or 2 AND it does not target self (heal). */
const STACKABLE_TIERS = new Set([1, 2]);
/** Hard ceiling on per-entry stack count. Mission A: bumped from 3 → 4. The upgrade row
 *  on each card has 3 cutouts (filled = stack-1), so MAX_STACK=4 ↔ 3 stars displayed. */
export const MAX_STACK = 4;

interface Entry {
  id: string;
  cd: number;
  stack: number;          // 1..MAX_STACK
  stackable: boolean;     // cached at add-time so step() doesn't re-resolve roster
}

export type AddResult =
  | { added: true; stack: number; merged?: false; rejected?: false }
  | { merged: true; stack: number; added?: false; rejected?: false }
  | { rejected: true; reason: 'max' | 'dedupe' | 'deckFull'; added?: false; merged?: false };

export class Deck {
  // The internal store; `entries()` returns a public { id, stack } snapshot.
  private readonly _entries: Entry[] = [];
  private readonly cfg: DeckConfig;
  constructor(cfg: DeckConfig) { this.cfg = cfg; }

  /**
   * Add a skill to the deck.
   * @param id      skill id
   * @param tier    1..3 — drives stackable eligibility. Omit/undefined → non-stackable.
   * @param target  'enemy' | 'self' — heal/self never stacks even on a low tier.
   *
   * Returns a discriminated union:
   *   { added, stack: 1 }              — new entry
   *   { merged, stack: N }             — same id already in deck, stackable, stack incremented
   *   { rejected, reason: 'max' }      — same id already in deck at MAX_STACK
   *   { rejected, reason: 'dedupe' }   — same id already in deck, non-stackable
   *   { rejected, reason: 'deckFull' } — deck at cap (UNIQUE entries) and id not in deck
   */
  add(id: string, tier?: number, target?: 'enemy' | 'self'): AddResult {
    const stackable = tier !== undefined && STACKABLE_TIERS.has(tier) && target !== 'self';
    const existing = this._entries.find(e => e.id === id);
    if (existing) {
      if (!existing.stackable) return { rejected: true, reason: 'dedupe' };
      if (existing.stack >= MAX_STACK) return { rejected: true, reason: 'max' };
      existing.stack += 1;
      existing.cd = 0; // merged entry fires next step at the new (faster) level cooldown
      return { merged: true, stack: existing.stack };
    }
    if (this._entries.length >= this.cfg.cap) return { rejected: true, reason: 'deckFull' };
    this._entries.push({ id, cd: 0, stack: 1, stackable });
    return { added: true, stack: 1 };
  }

  has(id: string): boolean { return this._entries.some(e => e.id === id); }
  /** Number of UNIQUE entries (cap-based). */
  size(): number { return this._entries.length; }
  isFull(): boolean { return this._entries.length >= this.cfg.cap; }
  /** Ids in deck-index order (one entry per stacked group). */
  list(): string[] { return this._entries.map(e => e.id); }
  /** Snapshot of { id, stack } in deck-index order — for the tray view + merge target lookup. */
  entries(): { id: string; stack: number }[] {
    return this._entries.map(e => ({ id: e.id, stack: e.stack }));
  }

  /** Per-stack cooldown lookup. Defaults to cfg.cooldownMs when no stack table is given. */
  cooldownForStack(stack: number): number {
    if (this.cfg.stack) {
      const idx = Math.max(0, Math.min(this.cfg.stack.cooldowns.length - 1, stack - 1));
      return this.cfg.stack.cooldowns[idx];
    }
    return this.cfg.cooldownMs;
  }

  /**
   * Tick all entries forward by dtMs and return the ids that fired this tick.
   *
   * `cooldownScale` (Mission G Issue 3 — finale barrage): multiplier applied to the
   * post-fire cooldown so the deck can fire faster as the boss's HP drops. When the
   * caller computes a sub-1 scale (e.g. 0.45 below the 35% HP threshold), an entry
   * that just fired comes off cooldown ~2.2× sooner — producing a visible "barrage"
   * in the final stretch. Default 1.0 ⇒ no change (back-compat with all callers).
   */
  step(dtMs: number, cooldownScale: number = 1): string[] {
    const fired: string[] = [];
    for (let i = 0; i < this._entries.length; i++) {
      const e = this._entries[i];
      e.cd -= dtMs;
      if (e.cd <= 0) {
        fired.push(e.id);
        // Stackable entries use the level-N cooldown; non-stackable fall back to the default.
        const base = e.stackable ? this.cooldownForStack(e.stack) : this.cfg.cooldownMs;
        e.cd = base * cooldownScale;
      }
    }
    return fired;
  }
}
