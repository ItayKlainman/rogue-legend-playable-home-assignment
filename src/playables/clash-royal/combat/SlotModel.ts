export interface SlotEntry { skill: { id: string; cost: number }; }
export interface PoolEntry { id: string; cost: number; }
export class SlotModel {
  slots: (SlotEntry | null)[] = [null, null, null];
  private readonly pool: PoolEntry[];
  private readonly rng: () => number;
  constructor(pool: PoolEntry[], rng: () => number) {
    this.pool = pool; this.rng = rng;
    for (let i = 0; i < 3; i++) this.slots[i] = this.draw(new Set());
    this.sort();
  }
  costAt(i: number): number { return this.slots[i]?.skill.cost ?? 0; }
  /**
   * Pick slot `i` and refill it.
   * @param excluded  ids that the controller deemed permanently un-offerable (maxed-stack
   *                  stackables ∪ non-stackable already-owned). PARTIALLY-stacked stackables
   *                  must NOT be in this set — they're re-offerable to enable merges.
   * @param biasId    Optional id to PREFER for the refill (Mission #10: heal during a heal-scare).
   *                  Honored only if the id is in the pool AND not in `excluded`/`shown`.
   * @param reoffer   First-pick stack tutorial: re-draw the SAME id back into this slot (instead
   *                  of excluding it) and bias toward it, so the player can immediately pick it
   *                  again and watch it merge/stack. The bias only fires if the id is still a
   *                  legal candidate — an id the caller put in `excluded` (maxed/owned) still wins.
   * The picked id is auto-added to the exclusion of THIS refill so the new draw can't redraw it.
   */
  pick(i: number, excluded: Set<string>, biasId?: string, reoffer?: boolean): { id: string; cost: number } | null {
    const s = this.slots[i]; if (!s) return null;
    const skill = s.skill;
    this.slots[i] = null;
    // Excluding the just-picked id only for THIS draw guards against an immediate redraw of
    // the same id back into the slot the player just consumed; the CALLER decides whether
    // the id is permanently excluded (maxed) by passing it in `excluded` next time. The reoffer
    // path skips that exclusion and biases toward the picked id to FORCE the re-draw.
    const exclude = reoffer ? new Set(excluded) : new Set([...excluded, skill.id]);
    this.slots[i] = this.draw(exclude, reoffer ? skill.id : biasId);
    this.sort();
    return skill;
  }
  /** Force `biasId` into the first available slot (replacing the existing one if it's not
   *  protected by `excluded`). Used by the controller to guarantee a heal offer when the
   *  late heal-scare goes pending. Returns the slot index actually mutated, or -1 if no
   *  slot could be replaced (e.g. heal already present, or pool can't supply it). */
  forceIntoAnySlot(biasId: string, excluded: Set<string>): number {
    if (excluded.has(biasId)) return -1;
    // If the biased id is already shown, do nothing.
    if (this.slots.some(s => s?.skill.id === biasId)) return -1;
    const def = this.pool.find(p => p.id === biasId);
    if (!def) return -1;
    // Replace the priciest filled slot (least likely the player wanted) — keeps cheaper
    // option intact during the scare. Falls back to slot 0 if none filled.
    let idx = 0; let bestCost = -1;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s && s.skill.cost > bestCost) { bestCost = s.skill.cost; idx = i; }
    }
    this.slots[idx] = { skill: { id: def.id, cost: def.cost } };
    this.sort();
    return idx;
  }
  /** Keep filled slots cost-ascending (cheapest left); nulls sink to the end. */
  private sort(): void {
    this.slots.sort((a, b) => {
      if (a && b) return a.skill.cost - b.skill.cost;
      return (a ? 0 : 1) - (b ? 0 : 1);
    });
  }
  private draw(exclude: Set<string>, biasId?: string): SlotEntry | null {
    const shown = new Set(this.slots.filter(Boolean).map(s => s!.skill.id));
    const candidates = this.pool.filter(p => !exclude.has(p.id) && !shown.has(p.id));
    if (candidates.length === 0) return null;
    // Mission #10: if the controller asks for a bias (heal during a heal-scare) AND the
    // biased id is a legal candidate, prefer it deterministically over the RNG draw.
    if (biasId) {
      const biased = candidates.find(p => p.id === biasId);
      if (biased) return { skill: { id: biased.id, cost: biased.cost } };
    }
    const pick = candidates[Math.floor(this.rng() * candidates.length)];
    return { skill: { id: pick.id, cost: pick.cost } };
  }
}
