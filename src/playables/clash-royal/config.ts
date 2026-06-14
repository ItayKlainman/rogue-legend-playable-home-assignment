export type Tier = 1 | 2 | 3;
export type Family = 'shuriken' | 'fire' | 'lightning' | 'none';
export type SkillId =
  | 'shuriken' | 'fireball' | 'bolt' | 'heal'
  | 'flameStrike' | 'lightningShot'
  | 'meteor' | 'thunderstorm';
export type VfxId = 'shurikenFlurry' | 'fireballBarrage' | 'chainLightning' | 'heal';

export interface SkillDef {
  id: SkillId;
  family: Family;
  tier: Tier;
  target: 'enemy' | 'self';
  cost: number;
  vfxId: VfxId;
}

/** A beat is one HP milestone on one enemy. Casts consume beats subject to tier gates. */
export interface Beat {
  targetIndex: number;     // index into config.enemies
  milestoneHp: number;     // the target's HP bar tweens to this when the beat is consumed
  mustKill?: boolean;      // consuming this beat kills the target
  dangerBeat?: boolean;    // before this beat resolves, script a hero-HP scare tween
  /** Mission #10: kind of scare. `'auto'` = early build-up scare (HP→~50%, auto-clears
   *  after a brief moment so the fight breathes); `'heal'` = late hold-for-heal scare
   *  (HP→~15%, only a heal cast clears it, controller force-clears on ignore-timeout). */
  scareKind?: 'auto' | 'heal';
  finisher?: boolean;      // the climactic kill beat that ends the fight
}

export interface EnemyDef { id: 'skeletonKing' | 'skeletonWarrior' | 'slime'; maxHp: number; isBoss?: boolean; }

export interface ClashConfig {
  combatSpeed: number;
  hero: { maxHp: number };
  enemies: EnemyDef[];
  coin: { start: number; regenEarly: number; regenMid: number; regenBoss: number; max: number; deadAirMs: number };
  heroAttackIntervalMs: number;
  enemyAttackIntervalMs: number;
  scare: { hpFrac: number; earlyHpFrac?: number; ignoreTimeoutMs: number; autoClearMs?: number };
  beats: Beat[];
  deck: {
    cooldownMs: number;
    cap: number;
    stack?: { cooldowns: [number, number, number, number] };
    /** Mission G Issue 3 — finale barrage. When the boss's HP falls below
     *  `hpFracThreshold * boss.maxHp`, all deck cooldowns are multiplied by
     *  `cooldownScale` (sub-1.0 for an acceleration). Omitted ⇒ no acceleration. */
    finaleAccel?: { hpFracThreshold: number; cooldownScale: number };
  };
  fightClock: { minMs: number; maxMs: number };
  /** When true, the fight is HELD (no melee/scares/deck-fire/clock) while the onboarding is up —
   *  it only begins on the first pick (manual OR the idle auto-pick). When false the fight runs
   *  behind the onboarding from frame 0 (legacy behavior). */
  gateFightUntilFirstPick: boolean;
  /** Build-selected outcome. 'win' (default) = current rigged win; 'lose' = "so close" forced loss.
   *  Optional so existing config literals/tests stay valid; code treats absent as 'win'. */
  outcome?: 'win' | 'lose';
  idleAutoPickMs: number;
  onboarding: { title: string; body: string };
  rngSeed: number;
}

const BOSS_HP = 16000;
const MINION_HP = 1200;

/** Dense descending boss milestone curve (maxHp → 0). The fractions are packed tighter
 *  toward the bottom so the spammy END BARRAGE lands a REAL damage number on (nearly) every
 *  cast all the way to the kill — instead of the boss reaching the floor early and the casts
 *  dropping to 0-damage. Scares sit at ~0.85 (early auto) and ~0.20 (late heal) of maxHp.
 *  Below the finaleAccel threshold (0.45) there are ~18 milestones for the barrage to chew. */
function bossCurve(maxHp: number): Beat[] {
  // Same hand-tuned shape (denser toward the kill so the end barrage keeps landing real numbers),
  // but SUBDIVIDED once — a midpoint between every pair — to ~double the milestone count. Paired
  // with BOSS_HP scaled up to match, each per-cast delta stays the SAME size, so the fight feels
  // identical (same cooldowns, same damage numbers) but takes ~2× as many casts → runs longer.
  const base = [
    0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50, 0.45, // top/mid → finale threshold
    0.41, 0.38, 0.35, 0.32, 0.29, 0.26, 0.23, 0.20, 0.18, 0.16, 0.14, // finale: dense, real dmg every cast
    0.12, 0.10, 0.085, 0.07, 0.055, 0.04, 0.025,
  ];
  const fracs: number[] = [];
  for (let i = 0; i < base.length; i++) {
    fracs.push(base[i]);
    if (i < base.length - 1) fracs.push((base[i] + base[i + 1]) / 2); // midpoint
  }
  fracs.push(0.0); // finisher
  return fracs.map((f, i): Beat => {
    const last = i === fracs.length - 1;
    const beat: Beat = { targetIndex: 0, milestoneHp: last ? 0 : Math.round(maxHp * f) };
    if (last) { beat.mustKill = true; beat.finisher = true; }
    else if (Math.abs(f - 0.85) < 1e-6) { beat.dangerBeat = true; beat.scareKind = 'auto'; }
    else if (Math.abs(f - 0.20) < 1e-6) { beat.dangerBeat = true; beat.scareKind = 'heal'; }
    return beat;
  });
}

export const DEFAULT_CONFIG: ClashConfig = {
  combatSpeed: 1.3,
  hero: { maxHp: 900 },
  enemies: [
    { id: 'skeletonKing', maxHp: BOSS_HP, isBoss: true }, // index 0
    { id: 'skeletonWarrior', maxHp: MINION_HP },          // index 1
    { id: 'slime', maxHp: MINION_HP },                    // index 2
  ],
  // Mission #10: lower start + slower regenEarly so the player FEELS the build-up; tier-shifts
  // jump on minion kills (regenMid after minion 1, regenBoss after minion 2 ≈ "the boss spike").
  coin: { start: 5, regenEarly: 1.5, regenMid: 3.0, regenBoss: 5.0, max: 24, deadAirMs: 2500 },
  heroAttackIntervalMs: 1400,
  enemyAttackIntervalMs: 1700,
  // `hpFrac` is the LATE (heal-clear) scare floor. The early auto-scare uses earlyHpFrac.
  // `autoClearMs` is how long the early scare lingers before the rig auto-resolves it
  //   (no heal required; the hero is back to full HP afterward via the TakeHit/recover beat).
  // Mission I-v2 — ignoreTimeoutMs bumped 3500→7200ms so the user-spec'd "3 dodges then
  // real damage resumes" arc is reachable BEFORE the controller's force-resolve auto-heal.
  // At 1700ms enemy-attack cadence, 3 dodges land at ~1.7/3.4/5.1s into the HOLD and the
  // FIRST resumed real-damage chip lands at ~6.8s; the 7.2s ceiling leaves headroom for
  // that resume chip to render before the auto-heal kicks in. (Old 3500ms only fit 2
  // dodges + auto-heal — the player never saw the threat re-assert.)
  scare: { hpFrac: 0.15, earlyHpFrac: 0.50, ignoreTimeoutMs: 7200, autoClearMs: 1200 },
  // Beats: minions die first; then a 16-step boss whittle. Two scare beats sit in the curve:
  //   • EARLY auto-scare (~3rd boss-fire) — HP dips to ~50% and recovers ~1.2s later
  //   • LATE heal-scare (penultimate boss beat) — HP floors to ~15% and waits for heal
  // The deck whittles to the FINAL mustKill+finisher beat (milestoneHp 0), and THAT cast IS
  // the natural killing fire (visual flair owned by the scene, not a separate orchestrated
  // volley over a held sliver). Every non-finisher delta is in [150, 350] HP so EVERY cast
  // shows a meaningful damage number.
  beats: [
    { targetIndex: 1, milestoneHp: 800 },                // minion 1 chip A (Δ400)
    { targetIndex: 1, milestoneHp: 400 },                // minion 1 chip B (Δ400)
    { targetIndex: 1, milestoneHp: 0, mustKill: true },  // minion 1 dies (Δ400)
    { targetIndex: 2, milestoneHp: 800 },                // minion 2 chip A (Δ400)
    { targetIndex: 2, milestoneHp: 400 },                // minion 2 chip B (Δ400)
    { targetIndex: 2, milestoneHp: 0, mustKill: true },  // minion 2 dies (Δ400)
    // Boss: a 28-step dense curve (denser toward the kill) so the end barrage keeps landing
    // real damage numbers right up to the finisher — no early floor + 0-damage drop.
    ...bossCurve(BOSS_HP),
  ],
  // Per-stack cooldown (ms). Level-1 is meaningfully slower than the old 1500ms baseline so
  // a merge is a real upgrade (1→2 nearly halves the cd; 2→3 trims another third; 3→4 trims
  // ~30%). MAX_STACK=4 ⇒ 4 cooldown entries; the upgrade row on each card shows 3 stars
  // (stack=1 → 0 filled, stack=4 → 3 filled). The legacy `cooldownMs: 2200` remains as the
  // back-compat default for non-stackable entries (heal/t3).
  // Finale barrage (Mission G Issue 3, RE-TUNED for "spammier end / way more lightning"):
  // base stack cooldowns kept at their paced values (so the early/mid fight + scare beats
  // land on schedule, no front-loading or dead time before the MIN clock), but the FINAL
  // stretch is now MUCH faster — cooldowns × 0.22 (was 0.45 ⇒ ~4.5× instead of ~2.2×) once
  // the boss drops below 35% HP. A stack-4 skill then fires every ~155ms: a genuine spam of
  // casts (lightning especially) for the kill, while the rest of the fight stays paced.
  deck: {
    cooldownMs: 2200, cap: 6,
    stack: { cooldowns: [2200, 1500, 1000, 700] },
    finaleAccel: { hpFracThreshold: 0.45, cooldownScale: 0.22 },
  },
  fightClock: { minMs: 17000, maxMs: 48000 },
  gateFightUntilFirstPick: true, // hold the fight under the onboarding until the player's first pick
  idleAutoPickMs: 7000,
  onboarding: { title: 'BUILD YOUR DECK', body: 'Tap a glowing skill to add it. Your deck auto-fights the boss!' },
  rngSeed: 0xC0FFEE,
};
