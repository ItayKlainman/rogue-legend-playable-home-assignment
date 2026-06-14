import type { ClashConfig, SkillDef, Beat, Tier } from '../config';

export interface CastOutcome {
  kind: 'milestone' | 'chip';
  targetSide: 'enemy' | 'self';
  targetIndex: number;
  hpBefore: number;
  hpAfter: number;
  amount: number;
  kills: boolean;
  beatsCleared: number;
}

const CHIP_FRACTION = 0.3; // a chip removes 30% of the distance to the next milestone

// Hero melee chip: a small fraction of the distance to the next milestone, removed by
// each basic swing of the rogue's sword. The deck owns the milestones + the killing
// fire — melee is BACKGROUND CHIP only: it never crosses the next milestone floor and
// never reports a kill. Mission G (Issue 4): the previous 7% / [8,35] clamp made
// melee read as trivial next to 150–300 deck-fire numbers. Bumped to 15% / [25,80]
// so a single swing is comparable to ONE SLICE of a multi-strike tier-3 (a 5-strike
// chain-lightning splits a ~300 hit into ~60-per-strike — melee at 60-80 reads as
// "one slice's worth per swing", deck-fire stays "1-5 slices per cast"). The deck
// STILL owns the milestone curve: chip cannot push past floor+1.
const HERO_MELEE_CHIP_FRACTION = 0.15;
const HERO_MELEE_MIN_AMOUNT = 25; // floor so swings always show a meaningful number
const HERO_MELEE_MAX_AMOUNT = 80; // cap so swings never dwarf deck-level damage

// Enemy melee chip (Mission G Issue 1): mirrors hero-melee. Each cosmetic enemy attack
// now ALSO lands a small rig-resolved chip on the hero — the original turn-based
// "enemyAttack does no damage" shell is gone. Same tuning as hero-melee (15% of the
// remaining-to-scare-floor distance, clamped [25, 80]) so the two combatants chip each
// other at comparable rates. Floor scheme:
//  • If a scare beat is still pending in beats[beatPtr..], its targetFrac maps to the
//    floor: scare.hpFrac * maxHp (heal-kind) or scare.earlyHpFrac * maxHp (auto-kind).
//  • If no scare is pending (post both scares), fall back to a fixed survival floor of
//    SAT_MIN_HERO_HP so the enemy can still chip the hero through the endgame without
//    actually killing them (the scene drives the boss to die via the deck; enemy melee
//    is BACKGROUND only, never lethal).
// NEVER pushes hero HP below the floor + 1, NEVER kills the hero. The scares STILL
// script the big HP dips; enemy melee is the continuous chip BETWEEN scares.
const ENEMY_MELEE_CHIP_FRACTION = 0.15;
const ENEMY_MELEE_MIN_AMOUNT = 25;
const ENEMY_MELEE_MAX_AMOUNT = 80;
// Hard survival floor: enemy melee can never push the hero at-or-below this HP — the
// hero never dies from enemy melee alone. Picked to be just above 0 so a player who
// never heals still finishes the fight alive (the deck drives the boss kill).
const SAT_MIN_HERO_HP = 50;

function bandsForTier(tier: Tier): number {
  return tier; // tier-1 -> 1 band, tier-2 -> 2, tier-3 -> 3
}

export class RigDirector {
  private readonly cfg: ClashConfig;
  private readonly rng: () => number;
  private enemyHp: number[];
  private heroHp: number;
  private beatPtr = 0;
  private dangerActive = false;
  /** Kind of the currently-active scare ('auto' = early build-up; 'heal' = late hold-for-heal).
   *  Reset to null when no scare is active. The controller reads this to decide handling. */
  private dangerKind: 'auto' | 'heal' | null = null;
  private kills = 0;
  private defeat = false;

  constructor(cfg: ClashConfig, rng: () => number) {
    this.cfg = cfg;
    this.rng = rng;
    this.enemyHp = cfg.enemies.map(e => e.maxHp);
    this.heroHp = cfg.hero.maxHp;
  }

  currentHp(enemyIndex: number): number { return this.enemyHp[enemyIndex]; }
  heroCurrentHp(): number { return this.heroHp; }
  killCount(): number { return this.kills; }
  isVictory(): boolean { return this.enemyHp.every(hp => hp <= 0); }
  isDefeat(): boolean { return this.defeat; }

  /** True while a danger (scare) beat is pending resolution. */
  pendingDangerBeat(): boolean { return this.dangerActive; }
  /** Kind of the active scare (null when none active). */
  currentDangerKind(): 'auto' | 'heal' | null { return this.dangerKind; }

  atFinisherBeat(): boolean { const b = this.cfg.beats[this.beatPtr]; return !!b && !!b.finisher; }

  /** Controller-owned finale: resolve ALL remaining beats so every enemy dies.
   *  Returns the enemy indices newly killed (resolution order) for the scene's kill VFX. */
  resolveFinisher(): { kills: number[] } {
    this.dangerActive = false;
    this.dangerKind = null;
    const kills: number[] = [];
    while (this.beatPtr < this.cfg.beats.length) {
      const beat = this.cfg.beats[this.beatPtr];
      this.enemyHp[beat.targetIndex] = beat.milestoneHp;
      if (beat.mustKill && beat.milestoneHp <= 0) { this.kills++; kills.push(beat.targetIndex); }
      this.beatPtr++;
    }
    for (let i = 0; i < this.enemyHp.length; i++) {
      if (this.enemyHp[i] > 0) { this.enemyHp[i] = 0; this.kills++; kills.push(i); }
    }
    return { kills };
  }

  /** Lose-variant climax: force the boss to a visible sliver (so the "so close" is guaranteed for
   *  ANY deck/seed — see red-team M2), then drain the hero to 0, OVERRIDING SAT_MIN_HERO_HP. The
   *  boss is NOT killed. Returns the pre-death hero HP for the bridge's drain tween. */
  resolveHeroDeath(): { heroHpBefore: number; bossHpAfter: number } {
    const before = this.heroHp;
    const bossMax = this.cfg.enemies[0].maxHp;
    // ALWAYS force a visible sliver (3%): clamps a near-0 held boss UP and a damage-less full
    // boss DOWN, so the "so close" reads and the boss never displays 0 in the lose build.
    this.enemyHp[0] = Math.max(1, Math.round(bossMax * 0.03));
    this.dangerActive = false;
    this.dangerKind = null;
    this.heroHp = 0; // lethal — intentionally below SAT_MIN_HERO_HP (lose-only path)
    this.defeat = true;
    return { heroHpBefore: before, bossHpAfter: this.enemyHp[0] };
  }

  private gateSatisfied(_beat: Beat, _skill: SkillDef): boolean { return true; }

  /** Force-clear a pending danger beat (the ignore-timeout path). Restores hero HP. */
  forceResolveDanger(): { healedTo: number } {
    if (!this.dangerActive) return { healedTo: this.heroHp };
    this.dangerActive = false;
    this.dangerKind = null;
    this.heroHp = this.cfg.hero.maxHp;
    return { healedTo: this.heroHp };
  }

  /** Resolve a player/auto cast into a concrete outcome and mutate rig HP state.
   *  @param opts.holdFinisher — when true (controller passes !pastMin), a cast that would
   *    cross into the boss-finisher beat instead CHIPS (boss whittles to floor+1 but does
   *    NOT die). This keeps the boss ALIVE under the finale barrage until the min-fight clock,
   *    so it can't be killed early and sit dead with no victory (the dead-air gap). */
  resolveCast(skill: SkillDef, opts?: { holdFinisher?: boolean; sliverHold?: boolean }): CastOutcome {
    if (skill.target === 'self') return this.resolveHeal();

    const beat = this.cfg.beats[this.beatPtr];
    if (!beat) {
      // No beats left (boss already dead) — pure cosmetic chip on a dead-ish target.
      return this.chip(0);
    }

    // Hold the finisher until the controller allows it (pastMin): chip toward floor+1 instead
    // of consuming the kill, so the boss stays alive (barrage climax) and never dies early.
    if (opts?.holdFinisher && beat.finisher) {
      if (opts?.sliverHold) {
        // Lose: the boss must read as alive-at-a-sliver — NEVER chip toward 0/1. chip() floors at
        // the finisher's milestoneHp=0 and drives the bar to 1 HP, which DISPLAYS as 0 (the
        // user-reported "boss at 0 HP when it killed me"). Pin at the current HP (the last real
        // milestone ≈ sliver) instead — no further drain.
        const hp = this.enemyHp[beat.targetIndex] ?? 0;
        return { kind: 'chip', targetSide: 'enemy', targetIndex: beat.targetIndex, hpBefore: hp, hpAfter: hp, amount: 0, kills: false, beatsCleared: 0 };
      }
      return this.chip(beat.targetIndex);
    }

    // NOTE: scares NO LONGER freeze the deck. Both kinds ('auto' early, 'heal' late) now
    // just script a hero-HP dip on entry and auto-recover via the controller's timer — the
    // boss whittle continues the whole time, so the hero ALWAYS deals damage to the boss
    // during a scare (the previous heal-HOLD froze the boss → "hero doesn't damage the boss
    // during the grace period"; removed for good). The heal SKILL is still pickable, but it
    // is no longer REQUIRED to clear the scare.

    // Wrong-tier cast on a tier-gated beat → non-consuming chip.
    if (!this.gateSatisfied(beat, skill)) return this.chip(beat.targetIndex);

    // Mission #10: the finisher beat is no longer "held" — an ordinary cast that arrives at
    // it consumes it as the natural killing-fire. The loop below treats finisher exactly like
    // any other mustKill beat (it just breaks the band-clear loop so a tier-3 doesn't double-
    // consume past the kill).

    // Milestone cast: consume up to bandsForTier beats that share this target.
    const target = beat.targetIndex;
    const hpBefore = this.enemyHp[target];
    let cleared = 0;
    let last = beat;
    const bands = bandsForTier(skill.tier);
    while (
      cleared < bands &&
      this.beatPtr < this.cfg.beats.length &&
      this.cfg.beats[this.beatPtr].targetIndex === target &&
      this.gateSatisfied(this.cfg.beats[this.beatPtr], skill)
    ) {
      // Don't let a multi-band cast cross INTO the held finisher — stop at floor+1.
      if (opts?.holdFinisher && this.cfg.beats[this.beatPtr].finisher) break;
      last = this.cfg.beats[this.beatPtr];
      // A scare beat scripts the hero-HP dip on entry (both kinds). It does NOT freeze the
      // cast — the boss keeps taking damage; the controller auto-clears the dip on a timer.
      // BUG 1: in LOSE the scare is suppressed entirely — no HP dip means the controller's
      // auto-recover never runs, so there's no green heal VFX/bar-refill (the heal skill was
      // removed but the SCARE recovery was still healing the hero). The hero fights at health
      // until the scripted death (which is HP/time-driven and scare-independent).
      if (last.dangerBeat && !this.dangerActive && this.cfg.outcome !== 'lose') {
        this.dangerActive = true;
        this.dangerKind = last.scareKind ?? 'heal';
        const frac = this.dangerKind === 'auto'
          ? (this.cfg.scare.earlyHpFrac ?? 0.50)
          : this.cfg.scare.hpFrac;
        this.heroHp = Math.round(this.cfg.hero.maxHp * frac);
      }
      this.beatPtr++;
      cleared++;
      if (last.mustKill) break;
    }
    const hpAfter = last.milestoneHp;
    this.enemyHp[target] = hpAfter;
    const kills = !!last.mustKill && hpAfter <= 0;
    if (kills) this.kills++;
    return {
      kind: 'milestone', targetSide: 'enemy', targetIndex: target,
      hpBefore, hpAfter, amount: hpBefore - hpAfter, kills, beatsCleared: cleared,
    };
  }

  /** Hero basic-melee chip. Returns a positive `amount` (or 0 when saturated at the
   *  milestone floor + 1) on the FRONT LIVING ENEMY. Never advances the beat pointer,
   *  never reports a kill, never crosses the next milestone floor — those belong to the
   *  deck. Safe to call at any time (no-op when no living enemy remains).
   *
   *  Sizing:
   *   • Target the front living enemy (lowest index with hp > 0).
   *   • Pick the relevant next-milestone floor for that target by scanning forward in
   *     the beats list — fall back to 0 (HP floor) if no remaining beat addresses them.
   *   • Chip = clamp(HERO_MELEE_CHIP_FRACTION * (currentHp - floor), MIN, MAX).
   *   • Never reduce HP at-or-below floor+1 (the deck owns crossing the floor).
   */
  resolveHeroMelee(opts?: { loseSliverFloor?: number }): CastOutcome {
    // Find front living enemy.
    let target = -1;
    for (let i = 0; i < this.enemyHp.length; i++) { if (this.enemyHp[i] > 0) { target = i; break; } }
    if (target < 0) {
      // No living enemy — a degenerate no-op outcome (controller will treat amount=0 as a skip).
      return { kind: 'chip', targetSide: 'enemy', targetIndex: 0, hpBefore: 0, hpAfter: 0,
        amount: 0, kills: false, beatsCleared: 0 };
    }
    // Find the relevant next-milestone floor for this target (scan forward from beatPtr).
    let floor = 0;
    for (let i = this.beatPtr; i < this.cfg.beats.length; i++) {
      if (this.cfg.beats[i].targetIndex === target) { floor = this.cfg.beats[i].milestoneHp; break; }
    }
    // Lose: the boss (index 0) sits at the scripted finisher-hold sliver — its next milestone is
    // the finisher (milestoneHp=0), so the floor above is 0 and melee would chip it down toward 1
    // (the bar reads 0). Raise the floor to the lose sliver so melee NEVER drains the held boss
    // below the visible sliver. Mirrors the deck-fire sliverHold pin in resolveCast.
    if (opts?.loseSliverFloor !== undefined && target === 0) floor = Math.max(floor, opts.loseSliverFloor);
    const hpBefore = this.enemyHp[target];
    const room = hpBefore - (floor + 1);
    if (room <= 0) {
      // Saturated — already at floor+1 (deck must cross). Report 0-amount, no-op.
      return { kind: 'chip', targetSide: 'enemy', targetIndex: target, hpBefore, hpAfter: hpBefore,
        amount: 0, kills: false, beatsCleared: 0 };
    }
    const raw = Math.round((hpBefore - floor) * HERO_MELEE_CHIP_FRACTION);
    const clamped = Math.max(HERO_MELEE_MIN_AMOUNT, Math.min(HERO_MELEE_MAX_AMOUNT, raw));
    const amount = Math.min(clamped, room); // never cross floor+1
    const hpAfter = hpBefore - amount;
    this.enemyHp[target] = hpAfter;
    return { kind: 'chip', targetSide: 'enemy', targetIndex: target, hpBefore, hpAfter,
      amount, kills: false, beatsCleared: 0 };
  }

  /** Enemy basic-melee chip (Mission G Issue 1). Mirror of resolveHeroMelee but in the
   *  opposite direction: a small rig-resolved chip on the HERO's HP. The scare beats script
   *  the big HP dips — this chip is the BACKGROUND continuous chip the enemy lands BETWEEN
   *  scares. Never crosses the next scare floor; never kills the hero (clamps at survival).
   *
   *  During an ACTIVE scare the rig has already pinned hero HP to the scripted dip, so the
   *  chip no-ops (amount 0) to avoid desyncing it — but the dip now auto-recovers on a timer
   *  (no more freeze/dodge mechanic), so this is just a brief beat.
   *
   *  Returns CastOutcome with targetSide='self', targetIndex=0 (single hero) and amount=0
   *  when saturated at the floor (no chip lands — the bridge plays a cosmetic-only attack). */
  resolveEnemyMelee(): CastOutcome {
    const hpBefore = this.heroHp;
    // Find the next-scare floor by scanning forward in beats[] from beatPtr.
    let floor = SAT_MIN_HERO_HP;
    for (let i = this.beatPtr; i < this.cfg.beats.length; i++) {
      const b = this.cfg.beats[i];
      if (b.dangerBeat) {
        const frac = (b.scareKind ?? 'heal') === 'auto'
          ? (this.cfg.scare.earlyHpFrac ?? 0.50)
          : this.cfg.scare.hpFrac;
        const scareFloor = Math.round(this.cfg.hero.maxHp * frac);
        // Use the higher of (scare floor, survival floor) so a near-future scare doesn't
        // get pre-empted by melee chip pushing past it. The scare beat itself sets the
        // dramatic HP dip; melee just nibbles down toward it between scares.
        floor = Math.max(scareFloor, SAT_MIN_HERO_HP);
        break;
      }
    }
    // During an active scare the rig already pinned HP to the scripted dip — leave it alone
    // (the dip auto-recovers via the controller timer; the enemy resumes chipping after).
    if (this.dangerActive) {
      return { kind: 'chip', targetSide: 'self', targetIndex: 0, hpBefore, hpAfter: hpBefore,
        amount: 0, kills: false, beatsCleared: 0 };
    }
    const room = hpBefore - (floor + 1);
    if (room <= 0) {
      // Saturated — chip would cross floor+1. No-op (cosmetic attack only).
      return { kind: 'chip', targetSide: 'self', targetIndex: 0, hpBefore, hpAfter: hpBefore,
        amount: 0, kills: false, beatsCleared: 0 };
    }
    const raw = Math.round((hpBefore - floor) * ENEMY_MELEE_CHIP_FRACTION);
    const clamped = Math.max(ENEMY_MELEE_MIN_AMOUNT, Math.min(ENEMY_MELEE_MAX_AMOUNT, raw));
    const amount = Math.min(clamped, room); // never cross floor+1
    const hpAfter = hpBefore - amount;
    this.heroHp = hpAfter;
    return { kind: 'chip', targetSide: 'self', targetIndex: 0, hpBefore, hpAfter,
      amount, kills: false, beatsCleared: 0 };
  }

  private chip(target: number): CastOutcome {
    const beat = this.cfg.beats[this.beatPtr];
    const hpBefore = this.enemyHp[target] ?? 0;
    const floor = beat ? beat.milestoneHp : 0;
    const hpAfter = Math.max(floor + 1, Math.round(hpBefore - (hpBefore - floor) * CHIP_FRACTION));
    this.enemyHp[target] = Math.min(hpBefore, hpAfter);
    return {
      kind: 'chip', targetSide: 'enemy', targetIndex: target,
      hpBefore, hpAfter: this.enemyHp[target], amount: hpBefore - this.enemyHp[target],
      kills: false, beatsCleared: 0,
    };
  }

  private resolveHeal(): CastOutcome {
    const before = this.heroHp;
    const after = this.cfg.hero.maxHp;
    this.heroHp = after;
    this.dangerActive = false;
    return {
      kind: 'milestone', targetSide: 'self', targetIndex: 0,
      hpBefore: before, hpAfter: after, amount: after - before, kills: false, beatsCleared: 0,
    };
  }

}
