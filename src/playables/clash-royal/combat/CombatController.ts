import type { ClashConfig } from '../config';
import { sfx } from '../audio/sfx';
import { ROSTER, skillById } from '../roster';
import { CoinEconomy } from './CoinEconomy';
import { RigDirector } from './RigDirector';
import { SlotModel, type SlotEntry } from './SlotModel';
import { IdleClock } from './IdleClock';
import { Deck, MAX_STACK } from './Deck';
import { mulberry32 } from '../rng';

/** Rendering seam — implemented by CombatScene in prod, stubbed in unit tests. */
export interface CombatFxBridge {
  /** Run the cosmetic VFX for a cast.
   *  @param damageAmount — the rig-resolved damage delta (>=0). CombatFx may split this
   *    cosmetically across multiple visible strikes (e.g. chain-lightning) by calling
   *    showDamage internally per strike; the controller's `onImpact` callback still
   *    drives the SINGLE HP-bar tween + kill at the end so the rig invariant
   *    (sum-of-floating-numbers === bar delta) is preserved. Negative or 0-amount casts
   *    SHOULD still call onImpact so the controller can finalize. */
  playCast(skillId: string, tier: number, targetIndex: number, isSelf: boolean, damageAmount: number, onImpact: () => void): Promise<void>;
  showDamage(side: 'enemy' | 'self', index: number, amount: number, heal: boolean): void;
  tweenHpEnemy(index: number, hp: number): void;
  tweenHpHero(hp: number): void;
  killEnemy(index: number): void;
  /** Hero basic-melee swing. `damageAmount` is the rig-resolved chip (0 when saturated at
   *  the milestone floor + 1 — bridge still plays the cosmetic swing but skips the HP
   *  tween + damage number). The deck owns milestones + the killing fire; the bridge MUST
   *  NOT push the target's HP past floor+1 nor trigger killEnemy from a melee swing. */
  heroMelee(targetIndex: number, damageAmount: number): void;
  /** Enemy basic-melee swing (Mission G Issue 1, extended for Mission I-v2).
   *
   *  `damageAmount` is the rig-resolved chip on the hero (0 when saturated at the
   *  scare/survival floor — the bridge still plays the cosmetic enemy attack anim
   *  but skips the hero HP tween + damage number). The scare beats STILL own the
   *  dramatic HP dips; enemy melee is BACKGROUND chip only and MUST NOT push hero HP
   *  at-or-below the floor + 1, MUST NOT kill the hero.
   *
   *  Mission I-v2 — `opts.attackerIndex` (Issue I1a): the controller now picks the
   *  attacker (round-robin among living enemies, minions preferred while any minion
   *  is alive) and passes its index here. The bridge MUST use this index instead of
   *  `enemies.find(!dead)` — the legacy `.find` always returned enemies[0] (the boss)
   *  and minions never visibly attacked. Falling back to find(!dead) is left in place
   *  for defensive back-compat (a caller that omits the opts arg).
   *
   *  Mission I-v2 — `opts.dodge` (Issue I1b): true when the swing fires during the
   *  heal-HOLD. The previous "damage=0 cosmetic-only" branch read as "boss stopped
   *  attacking" to viewers (the user-perceived bug). The bridge MUST play the swing
   *  AND a guaranteed 'Dodge!' label on the hero so the moment reads as an intentional
   *  dodge — the rig still owns the floor (damage=0 mechanically). */
  enemyAttack(damageAmount?: number, opts?: { attackerIndex?: number; dodge?: boolean }): void;
  scare(targetHp: number): void;
  clearScare(): void;
  onEnemyKilled(killCount: number): void; // CombatScene maps killCount → SkillQueue.reveal
  onVictory(): void;
  /** Lose-variant: the boss's lethal counter — big red hit on the hero + screen shake, then the
   *  hero plays its Die anim and settles (NO full fade). Drives the hero HP-bar drain to 0.
   *  `bossHpAfter` is the rig's forced sliver — the bridge sets the boss DISPLAY bar to it so the
   *  boss never reads 0 even if the held-finisher path left the display bar near 0. */
  heroDeath(heroHpBefore: number, bossHpAfter: number): void;
}

export class CombatController {
  private readonly cfg: ClashConfig;
  private readonly fx: CombatFxBridge;
  private readonly economy: CoinEconomy;
  private readonly rig: RigDirector;
  private readonly slots: SlotModel;
  private readonly deck: Deck;
  private readonly idle: IdleClock;
  private heroAttackAcc = 0;
  private enemyAttackAcc = 0;
  private elapsedMs = 0;
  private finaleStarted = false;
  private victory = false;
  private defeat = false;
  private defeatStarted = false;
  private scareTimer = 0;
  private scareShown = false;
  // One-shot: the FIRST successful pick re-offers the SAME skill into its slot (so the player
  // can immediately pick it again and watch it merge/stack — the onboarding shuriken tutorial).
  // Cleared after the first pick; every later refill behaves normally.
  private firstPickReoffer = true;
  // Combat gate (cfg.gateFightUntilFirstPick): false while the fight is held under the onboarding;
  // flips true on the first pick (manual or idle auto). When gating is off it starts true.
  private combatLive: boolean;
  // Debug-only latch so we log the finale-accel transition ONCE per fight (tree-shaken via
  // __DEV__ guards on the log sites; harmless ballast outside dev).
  private finaleAccelLogged = false;
  // Round-robin cursor for the enemy-attack pick. Advances every tick so successive attacks
  // rotate across living enemies instead of locking onto enemies[0] (the boss).
  private enemyAttackCursor = 0;

  // ── Iteration #3: store-CTA on the LATE-SCARE pressure point ──────────────────────────
  // The late "heal" scare is the second, near-death pressure point: the boss is at ~20% HP, the
  // hero floors to ~15% ("so close!"), and a heal is forced into a slot. The FIRST manual skill
  // pick AFTER that scare fires onVolley() exactly ONCE (the director's soft store CTA: open the
  // store + keep the fight running underneath so the user can come back). Firing on a manual pick
  // — a real user gesture, never an idle auto-pick — keeps the store-open from being popup-blocked.
  // At most once per run; the terminal end-card/defeat CTA stays the cap.
  private onVolley?: () => void;
  // Latched true once the late (heal) scare fires; the next manual pick fires the soft CTA once.
  private lateScareReached = false;
  private volleyFired = false;

  constructor(cfg: ClashConfig, fx: CombatFxBridge, seed: number) {
    this.cfg = cfg;
    this.fx = fx;
    const rng = mulberry32(seed);
    this.economy = new CoinEconomy({ start: cfg.coin.start, regen: cfg.coin.regenEarly, max: cfg.coin.max });
    this.rig = new RigDirector(cfg, rng);
    // Lose segment: drop the self-heal — the death is scripted and the hero floor protects until
    // then, so heal is dead weight. An all-offensive pool lets the player stack lightning
    // (bolt/lightningShot/thunderstorm) for a satisfying barrage before the "so close" reversal.
    // WIN (incl. the TRY-AGAIN retry, which mounts outcome:'win') keeps the full roster with heal.
    const pool = this.cfg.outcome === 'lose' ? ROSTER.filter(s => s.id !== 'heal') : ROSTER;
    this.slots = new SlotModel(pool.map(s => ({ id: s.id, cost: s.cost })), rng); // heal included in WIN; dedupe ⇒ ≤1
    // Onboarding stack tutorial: guarantee the cheapest tier-1 (shuriken, cost 5 = the starting
    // coins) is in the opening slots so it's the spotlit + first affordable pick. The first pick
    // then re-offers it (see firstPickReoffer) so the player can immediately stack it. No-op when
    // shuriken is already drawn. Deterministic — doesn't consume the rng, so the rig is unaffected.
    this.slots.forceIntoAnySlot('shuriken', new Set());
    this.deck = new Deck(cfg.deck);
    this.idle = new IdleClock({ idleMs: cfg.idleAutoPickMs });
    this.combatLive = !cfg.gateFightUntilFirstPick;
  }

  isVictory(): boolean { return this.victory; }
  isDefeat(): boolean { return this.defeat; }
  private get lose(): boolean { return this.cfg.outcome === 'lose'; }
  heroHp(): number { return this.rig.heroCurrentHp(); }
  killCount(): number { return this.rig.killCount(); }
  /** Read-only count of enemies still standing (currentHp > 0). For the __DEV__ E2E bridge. */
  enemiesAlive(): number {
    let n = 0;
    for (let i = 0; i < this.cfg.enemies.length; i++) if (this.rig.currentHp(i) > 0) n++;
    return n;
  }
  /** Read-only per-enemy HP — used by tests to assert rig state is untouched during HOLD. */
  currentEnemyHp(i: number): number { return this.rig.currentHp(i); }
  /** Fight playthrough fraction in [0,1] — total enemy HP removed / total enemy max HP.
   *  Monotonic (enemy HP never regenerates) and reaches 1 at victory. Drives the AppLovin
   *  CHALLENGE_PASS_25/50/75 milestones (fired by the scene). */
  challengeProgress(): number {
    let max = 0; let cur = 0;
    for (let i = 0; i < this.cfg.enemies.length; i++) { max += this.cfg.enemies[i].maxHp; cur += Math.max(0, this.rig.currentHp(i)); }
    return max > 0 ? Math.min(1, (max - cur) / max) : 0;
  }
  currentRegenRate(): number { return this.regenForKills(); }

  /** Read-only coin balance — for CombatScene's CoinMeter refresh. */
  get coins(): number { return this.economy.coins; }
  /** Read-only slot snapshot — for CombatScene's SkillSlots.render + coach-hand cost lookup. */
  slotsSnapshot(): (SlotEntry | null)[] { return this.slots.slots; }
  /** Deck contents (skill ids in deck-index order). */
  deckList(): string[] { return this.deck.list(); }
  /** Deck entries with stack counts in deck-index order — for badge rendering + merge target lookup. */
  deckEntries(): { id: string; stack: number }[] { return this.deck.entries(); }
  /** Arm the idle auto-pick clock (called once when the onboarding/fight begins). */
  beginOnboarding(): void { this.idle.begin(); }
  /** Iteration #3: register the store-CTA callback (the director's soft store CTA). Fires once
   *  per run, on the first manual pick after the finale barrage starts. */
  setOnVolley(cb: () => void): void { this.onVolley = cb; }

  /** Per-slot fill ratio (coins / cost), clamped to [0,1]; 0 for empty slots. */
  slotCharge(i: number): number { const c = this.slots.costAt(i); return c > 0 ? Math.min(1, this.economy.coins / c) : 0; }

  /** Test/dev hook: place a specific skill into a slot deterministically. Used by the
   *  Playwright stacking-screenshot harness to force a duplicate offer for a deck skill.
   *  Looks up the skill's cost from the roster; refuses on unknown ids or out-of-range
   *  slot indices. Does NOT touch coins or the pool. Returns true on success. */
  forceOffer(skillId: string, slotIndex: number): boolean {
    if (slotIndex < 0 || slotIndex >= this.slots.slots.length) return false;
    const def = skillById(skillId as any);
    if (!def) return false;
    this.slots.slots[slotIndex] = { skill: { id: def.id, cost: def.cost } };
    return true;
  }

  /** Indices of slots the player can currently afford to pick (none if the deck is full). */
  affordableSlots(): number[] {
    if (this.deck.isFull()) return [];
    const out: number[] = [];
    for (let i = 0; i < this.slots.slots.length; i++) { const c = this.slots.costAt(i); if (c > 0 && this.economy.coins >= c) out.push(i); }
    return out;
  }

  /** Player tap to pick a slot into the deck. Routes to a MERGE (existing stackable
   *  entry) or a NEW UNIQUE entry. Returns false if rejected (no coin spend). */
  /** @param opts.auto true when the call comes from the idle-clock auto-pick (NOT the player).
   *  A manual tap (auto falsy) disengages auto-pick for the rest of the run — see IdleClock. */
  tapSlot(i: number, opts?: { auto?: boolean }): boolean {
    const slot = this.slots.slots[i];
    if (!slot) return false;
    const id = slot.skill.id;
    const def = skillById(id as any);
    if (!def) return false;
    // Iteration #3: the FIRST manual tap on a real skill slot after the late (heal) scare fires the
    // soft store CTA exactly once — a genuine user gesture during the near-death pressure peak (so
    // the store-open isn't popup-blocked). Fires even if the pick is rejected below (e.g. a maxed
    // deck): an engaged player panic-tapping IS the signal. Idle auto-picks (opts.auto) never count.
    if (!opts?.auto && this.lateScareReached && !this.volleyFired) {
      this.volleyFired = true;
      this.onVolley?.();
    }
    const cost = this.slots.costAt(i);
    if (cost <= 0 || this.economy.coins < cost) return false;
    // Try the deck add FIRST (cheap, no state mutation beyond the deck on success). If
    // rejected (deck full, maxed, dedupe) we return false WITHOUT spending coins.
    const result = this.deck.add(id, def.tier, def.target);
    if (result.rejected) return false;
    // Accepted (added or merged): spend coins + refill slot. The "excluded" set passed to
    // the slot refill is the set of ids that CAN NEVER BE OFFERED AGAIN — maxed-stack
    // stackables + non-stackable owned. Partially-stacked stackables stay offerable.
    this.economy.spend(cost);
    this.combatLive = true; // the first pick (manual or idle auto) starts the held fight
    // First successful pick: re-offer the SAME skill into the slot (stack tutorial). One-shot.
    const reoffer = this.firstPickReoffer;
    this.firstPickReoffer = false;
    this.slots.pick(i, this.computeExcludedIds(), undefined, reoffer);
    this.idle.notePick(!opts?.auto);
    return true;
  }

  /** Ids the slot refill must NEVER offer: maxed-stack stackables + non-stackable owned. */
  private computeExcludedIds(): Set<string> {
    const out = new Set<string>();
    for (const e of this.deck.entries()) {
      const def = skillById(e.id as any);
      if (!def) continue;
      const stackable = (def.tier === 1 || def.tier === 2) && def.target !== 'self';
      if (!stackable) out.add(e.id);                  // non-stackable owned → never re-offer
      else if (e.stack >= MAX_STACK) out.add(e.id);   // maxed stackable → never re-offer
    }
    return out;
  }

  /** Announce a newly-pending scare exactly once (HP-dip flash + sfx + heal offer on the late
   *  one). Called BOTH from the scare-handling block AND right after each deck cast — a cast can
   *  consume a danger beat mid-loop, and a heal cast later in the SAME step would clear the dip
   *  before the next step's scare block runs, silently swallowing the scare. Announcing inline
   *  guarantees the dramatic moment always registers, even when a heal rescues the hero instantly. */
  private announceScareIfPending(): void {
    if (!this.rig.pendingDangerBeat() || this.scareShown) return;
    this.scareShown = true;
    this.scareTimer = 0;
    sfx.scare();
    this.fx.scare(this.rig.heroCurrentHp());
    // Still OFFER a heal on the late scare (lets the player self-rescue faster), but it is
    // NO LONGER required — the dip auto-recovers on the timer regardless.
    if (this.rig.currentDangerKind() === 'heal') {
      this.lateScareReached = true; // Iteration #3: the late "so close" pressure point — arm the soft CTA.
      this.slots.forceIntoAnySlot('heal', this.computeExcludedIds());
    }
  }

  private regenForKills(): number {
    const k = this.rig.killCount();
    if (k >= 2) return this.cfg.coin.regenBoss;
    if (k >= 1) return this.cfg.coin.regenMid;
    return this.cfg.coin.regenEarly;
  }

  step(dtMs: number): void {
    if (this.victory || this.defeat) return;
    this.economy.setRegenRate(this.regenForKills());
    this.economy.tick(dtMs);

    // Idle auto-pick (cheapest unlocked) — runs BEFORE the combat gate so that while the fight is
    // held for onboarding (cfg.gateFightUntilFirstPick), a non-tapping viewer's auto-pick still
    // makes the first pick and STARTS the fight. Flagged auto so it does NOT disengage itself.
    if (this.idle.step(dtMs, this.affordableSlots().length > 0)) {
      const aff = this.affordableSlots();
      if (aff.length) { const cheapest = aff.reduce((a, b) => this.slots.costAt(a) <= this.slots.costAt(b) ? a : b, aff[0]); this.tapSlot(cheapest, { auto: true }); }
    }

    // Combat gate: while the fight is held under the onboarding (no pick yet, gating on), freeze
    // everything below — no fight-clock, melee, scares, or deck-fire. The first pick flips
    // combatLive (tapSlot). When gating is off combatLive starts true, so this never blocks.
    if (!this.combatLive) return;
    this.elapsedMs += dtMs;

    // Hero basic-melee chip — small visible damage on the front living enemy. The deck
    // still owns the milestones + killing fire; melee just chips around the floor (rig
    // returns 0 when saturated at floor+1, in which case the bridge plays a cosmetic-only
    // swing). PAUSE during a heal-kind scare HOLD so a saturated swing doesn't desync the
    // bar state during the scripted dip (same gate the deck-fire path uses).
    this.heroAttackAcc += dtMs;
    if (this.heroAttackAcc >= this.cfg.heroAttackIntervalMs) {
      this.heroAttackAcc = 0;
      // Hero ALWAYS chips the front enemy — including DURING a scare. The old heal-HOLD
      // played a cosmetic-only (zero-damage) swing during the grace period, which is exactly
      // the "hero doesn't deal damage to the boss during the scare" bug; removed for good.
      // Lose: pin the boss-melee floor at the 3% sliver so hero-melee NEVER drains the scripted
      // finisher-hold boss toward 0 (its next milestone is the finisher@0; without this the bar
      // reads 0 — the same chip-to-0 class the deck-fire sliverHold guards against).
      const loseSliverFloor = this.lose ? Math.max(1, Math.round(this.cfg.enemies[0].maxHp * 0.03)) : undefined;
      const out = this.rig.resolveHeroMelee({ loseSliverFloor });
      this.fx.heroMelee(out.targetIndex, out.amount);
    }
    // Enemy basic-melee chip — Mission G Issue 1. The enemy attack is no longer
    // cosmetic-only: it now lands a rig-resolved chip on the hero (background chip
    // BETWEEN scares). The scares STILL script the big HP dips; melee nibbles in
    // between. PAUSE during a heal-kind scare HOLD (same gate the deck/hero-melee
    // paths use) so we don't desync hero HP during the scripted dip. NEVER kills
    // the hero — the rig clamps at floor+1.
    this.enemyAttackAcc += dtMs;
    if (this.enemyAttackAcc >= this.cfg.enemyAttackIntervalMs) {
      this.enemyAttackAcc = 0;
      // Round-robin a living enemy (boss + minions). -1 ⇒ all dead, skip the tick so the
      // bridge never gets a ghost attack. No more heal-HOLD dodge grace: the enemy just
      // attacks. resolveEnemyMelee no-ops the chip (amount 0 → cosmetic-only swing) during
      // the brief scare dip, and chips normally otherwise.
      const attackerIndex = this.pickEnemyAttacker();
      if (attackerIndex >= 0) {
        const out = this.rig.resolveEnemyMelee();
        this.fx.enemyAttack(out.amount, { attackerIndex });
      }
    }

    // Scare beat: fire the scare once when danger goes pending, then AUTO-RECOVER on a timer.
    // Both kinds ('auto' early, 'heal' late) script a hero-HP dip and recover — NOTHING
    // freezes (the hero keeps damaging the boss throughout; that was the heal-HOLD bug).
    // A heal cast still clears the dip early (rig.resolveHeal resets dangerActive).
    if (this.rig.pendingDangerBeat()) {
      this.announceScareIfPending();
      this.scareTimer += dtMs;
      const kind = this.rig.currentDangerKind();
      const timeoutMs = kind === 'auto'
        ? (this.cfg.scare.autoClearMs ?? this.cfg.scare.ignoreTimeoutMs)
        : this.cfg.scare.ignoreTimeoutMs;
      // BUG 1 belt-and-suspenders: even if a stray scare went active in lose, NEVER run the
      // auto-recover (forceResolveDanger → tweenHpHero → green heal VFX) — that recovery IS the
      // heal the user saw. Lose mode suppresses scares at the rig (RigDirector.resolveCast), so
      // this guard is defensive; together they guarantee no heal in lose.
      if (this.scareTimer >= timeoutMs && !this.lose) {
        const dipHp = this.rig.heroCurrentHp();
        const { healedTo } = this.rig.forceResolveDanger();
        this.fx.tweenHpHero(healedTo);
        // Play the heal VFX on the auto-recover so the HP refill READS as a heal (the "+"
        // hover swarm + green mist + "+N" number) instead of a silent bar jump. Fixes
        // "the HP spike has a heal after and the animation doesn't trigger for that".
        if (healedTo > dipHp && !this.finaleStarted) this.fx.showDamage('self', -1, healedTo - dipHp, true);
        this.fx.clearScare();
      }
    } else if (this.scareShown) {
      this.scareShown = false;
      this.scareTimer = 0;
    }

    // Deck auto-fire (deck-index order). Fires EVERY step — scares no longer pause it.
    //
    // Mission #10: pass outcome.amount to CombatFx so multi-strike cosmetics (chain-lightning)
    // can split it across visible strikes (sum equals the rig delta). For single-strike VFX
    // CombatFx renders the consolidated number from the same `damageAmount` argument. The
    // onImpact callback ONLY drives the HP-bar tween + kill — never the floating-number
    // display (the bridge handles all damage-number rendering now via playCast).
    // Mission G Issue 3 — finale barrage. When the boss's HP falls below the configured
    // threshold (default 35% of maxHp), shrink the per-fire cooldown by `cooldownScale`
    // (default 0.45 ⇒ ~2.2× faster). Result: 3+ deck-fires inside a ~500ms window in
    // the final stretch (the user-visible "barrage"). Below the threshold the scale is
    // a SHARP step (not a smooth ramp) so the moment reads as a dramatic acceleration.
    let cooldownScale = 1;
    const accel = this.cfg.deck.finaleAccel;
    if (accel) {
      const bossMax = this.cfg.enemies[0]?.maxHp ?? 0;
      const bossHp = this.rig.currentHp(0);
      if (bossMax > 0 && bossHp > 0 && bossHp < bossMax * accel.hpFracThreshold) {
        cooldownScale = accel.cooldownScale;
        if (__DEV__ && !this.finaleAccelLogged) {
          this.finaleAccelLogged = true;
          // eslint-disable-next-line no-console
          console.log(`[finaleAccel] active=true t=${this.elapsedMs}ms bossHpFrac=${(bossHp / bossMax).toFixed(3)} threshold=${accel.hpFracThreshold}`);
        }
      }
    }
    const pastMin = this.elapsedMs >= this.cfg.fightClock.minMs;
    const pastMax = this.elapsedMs >= this.cfg.fightClock.maxMs;
    // Deck auto-fires EVERY step now — no heal-HOLD pause. Scares no longer freeze the deck,
    // so casts always land meaningful damage on the boss (incl. during the scripted dip).
    //
    // GUARD: once the killing fire is locked in (finaleStarted), STOP firing casts entirely.
    // The run is won — the boss is dead and victory is latching (deferred into the killing
    // fire's onImpact). Without this, deck.step keeps returning ready ids in the same step AND
    // across the deferred-victory window, so a deck HEAL fires repeatedly AFTER the boss is
    // killed (the reported "three heals sequence triggers after the boss is killed" bug).
    if (!this.finaleStarted) {
      for (const id of this.deck.step(dtMs, cooldownScale)) {
        const skill = skillById(id as any)!;
        // Hold the boss-finisher until pastMin: the boss whittles to floor+1 under the finale
        // barrage but cannot die before the min-fight clock (no early kill → no dead-air gap
        // where the boss is dead with no victory). Once pastMin, the next cast lands the kill.
        const outcome = this.rig.resolveCast(skill, { holdFinisher: this.lose || !pastMin, sliverHold: this.lose });
        // Lose climax: at the end of the sequence (boss whittled to its sliver, past MIN), one-shot
        // the hero — damage applied equals the hero's current HP. Deterministic; does not depend on
        // the global beat pointer landing precisely on the finisher beat (which under some deck/seed
        // path may not hold). Fires whenever enemyHp[0] is within 5% of zero — the visible "sliver"
        // the player sees right before the reversal.
        if (this.lose && pastMin) {
          const bossMax = this.cfg.enemies[0].maxHp;
          const bossHp = this.rig.currentHp(0);
          if (bossHp > 0 && bossHp <= Math.max(1, Math.round(bossMax * 0.05))) {
            this.triggerDefeat();
            break;
          }
        }
        // A cast can consume a danger beat mid-loop; announce it NOW so a heal cast later in
        // this same step can't clear the dip before the scare ever registers (see helper).
        this.announceScareIfPending();
        // NOTE: do NOT skip 0-damage casts. EVERY cast must PROC its VFX (user: "all skills
        // have to have vfx procs") — esp. during the finisher-hold when the boss is pinned at
        // floor+1 and chips resolve to 0. playCast already skips the "-0" number for amount<=0
        // (CombatFx lines 293/318), so a held cast shows its full VFX barrage with no number.
        // Natural killing-fire: the deck-fire that consumes the finisher beat. Detect it
        // SYNCHRONOUSLY (so we guard re-entry + block the pastMax backstop below) but DEFER
        // the victory latch + onVictory into the impact callback — otherwise victory procs
        // while the killing-fire projectile is still mid-flight, BEFORE the boss visually
        // dies (the reported "victory before the boss dies" bug). Latching inside onImpact
        // means victory fires right after killEnemy() starts the boss death anim, so the
        // scene's victory-hold window begins only once the boss is actually dying.
        let killingFireNow = false;
        if (outcome.kills && this.rig.isVictory() && pastMin && !this.finaleStarted) {
          this.finaleStarted = true;
          this.naturalKillingFire = true;
          killingFireNow = true;
        }
        void this.fx.playCast(skill.vfxId, skill.tier, outcome.targetIndex, skill.target === 'self', outcome.amount, () => {
          if (outcome.targetSide === 'self') this.fx.tweenHpHero(outcome.hpAfter); else this.fx.tweenHpEnemy(outcome.targetIndex, outcome.hpAfter);
          if (outcome.kills) { this.fx.killEnemy(outcome.targetIndex); this.fx.onEnemyKilled(this.rig.killCount()); }
          if (killingFireNow) {
            this.victory = true;
            this.fx.clearScare();
            this.fx.onVictory();
          }
        });
        if (skill.target === 'self') this.fx.clearScare();
        // Killing fire is the LAST cast — break so no further ready ids (e.g. a heal) fire
        // after the boss is dead within this same step.
        if (killingFireNow) break;
      }
    }
    // Finale / victory gate. The COMMON natural killing-fire is latched (deferred) inside the
    // loop above. This block covers the two remaining paths:
    //   • MAX backstop — clean-kill anything alive past MAX (degenerate / damage-less decks).
    //   • "boss already dead before MIN" — the in-loop deferral only fires on the kill STEP;
    //     if that happened before MIN, latch here once we pass MIN (the death anim has long
    //     since played, so an immediate latch reads correctly).
    if (!this.finaleStarted) {
      if (!this.lose && this.rig.isVictory() && pastMin) {
        this.naturalKillingFire = true;
        this.finaleStarted = true;
        this.victory = true;
        this.fx.clearScare();
        this.fx.onVictory();
      } else if (pastMax) {
        if (this.lose) this.triggerDefeat();   // M1: lose mode MUST NOT win via the backstop
        else this.fireFinale();
      }
    }
  }

  /** True iff the fight ended via the natural killing-fire (the deck's last cast consumed
   *  the finisher beat), as opposed to the MAX-backstop fireFinale path. The scene reads
   *  this to play the killing-fire flair (zoom + extra particles) ONLY on the natural path
   *  — the backstop path already runs a finale-volley with its own flair. */
  private naturalKillingFire = false;
  endedByNaturalKillingFire(): boolean { return this.naturalKillingFire; }

  private fireFinale(): void {
    this.finaleStarted = true;
    this.fx.clearScare();
    const { kills } = this.rig.resolveFinisher();
    // BUG 3 (backstop path): drain each dying enemy's bar to 0 BEFORE killEnemy plays the death
    // anim — consistent with the natural killing-fire path. killActor now waits HP_TWEEN_MS for
    // this drain so the boss falls on an empty bar; without this tween it would snap to 0 instead.
    for (const idx of kills) { this.fx.tweenHpEnemy(idx, 0); this.fx.killEnemy(idx); this.fx.onEnemyKilled(this.rig.killCount()); }
    const volley = this.deck.list().map(id => skillById(id as any)!).filter(s => s && s.target === 'enemy')
      .sort((a, b) => b.tier - a.tier).slice(0, 3);
    // Finale volley = pure visual flair on the MAX-backstop path (everything already dead).
    // No damage amount — pass 0 so the bridge skips floating numbers.
    for (const s of volley) void this.fx.playCast(s.vfxId, s.tier, 0, false, 0, () => {});
    this.victory = true;
    this.fx.onVictory();
  }

  private triggerDefeat(): void {
    if (this.defeatStarted) return;
    this.defeatStarted = true;
    const { heroHpBefore, bossHpAfter } = this.rig.resolveHeroDeath();
    this.fx.heroDeath(heroHpBefore, bossHpAfter);
    this.defeat = true; // latched; step() now early-returns (sim frozen during the death hold)
  }

  /** Mission I-v2 Issue I1a — pick the next enemy attacker. Returns -1 when all enemies
   *  are dead (caller MUST gate on this so the bridge never receives a ghost tick).
   *
   *  Strategy: round-robin across ALL LIVING enemies — boss (idx 0) AND minions (idx 1,
   *  idx 2) alike. The boss is in the rotation FROM THE START, so it attacks the hero
   *  during the minion phase rather than waiting for the minions to die (user follow-up:
   *  "boss only starts attacking after the minions die, he should attack from the start").
   *
   *  History: the original bug was `enemies.find(e => !e.dead)` in CombatFx.enemyAttack
   *  ALWAYS returning the boss (enemies[0], alive the whole minion phase) — minions never
   *  attacked. The first fix over-corrected by rotating MINIONS-ONLY while any minion was
   *  alive, which flipped the bug: the boss never attacked until the minions died. This
   *  version rotates the full living set so everyone alive takes turns. */
  private pickEnemyAttacker(): number {
    const n = this.cfg.enemies.length;
    // Full living set (boss + minions), in index order.
    const living: number[] = [];
    for (let i = 0; i < n; i++) if (this.rig.currentHp(i) > 0) living.push(i);
    if (living.length === 0) return -1; // all dead — caller skips the tick.
    // Rotate the cursor across every living enemy so boss + minions alternate turns.
    this.enemyAttackCursor = (this.enemyAttackCursor + 1) % living.length;
    return living[this.enemyAttackCursor];
  }
}
