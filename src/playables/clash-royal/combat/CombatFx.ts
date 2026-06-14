// CombatFx — the RENDER BRIDGE. Implements CombatFxBridge against real FightActors
// and reused board-fight DamageNumber/HitEffect, and builds the CosmeticVfxContext
// per cast (wiring the handler's onImpact to the controller's callback).
//
// 10a (this slice): constructor, tween/delay, playCast, actor, showDamage,
// showHealNumber, destroy are concrete. The HP/death/melee/scare/victory ports
// (10b/10c) are left as empty-body /* PORT ... */ stubs that satisfy the void
// return type so the class type-checks as `implements CombatFxBridge`.
import { Assets, Container, FillGradient, Sprite, Texture, Ticker, Text, TextStyle } from 'pixi.js';
import { HitEffect } from '../../board-fight/fight/HitEffect';
import { tween as sharedTween, delay as sharedDelay } from '@shared/tween';
import type { FightActor } from '../../board-fight/fight/FightActor';
import { getCosmeticVfx, type CosmeticVfxContext, type TargetRef, type ImpactBurstSpec } from './vfx/registry';
import { ImpactFx } from './ImpactFx';
import { HealPlusBurst, preloadHealPlusTexture } from './vfx/healPlusParticles';
import { LightningBolt } from './vfx/lightningBolt';
import type { CombatFxBridge } from './CombatController';
import type { Tier } from '../config';
// Mission C — cosmetic crit system. CRIT_STYLE owns the warm-gradient/bold/label
// constants; rollCrit() reads our side-channel Rng (separate from the rig's Rng so
// crit visuals never perturb rig deterministic behaviour).
import { CRIT_STYLE, HERO_HIT_STYLE, rollCrit } from './Crit';
// Clash-royal owns its damage-number renderer (no longer board-fight's plain-Arial
// DamageNumber). GAME_FONT_STACK is the chunky Luckiest Guy display stack; the CSS
// import inside ./fonts registers the @font-face and ensureGameFontsLoaded awaits it.
import { GAME_FONT_STACK, ensureGameFontsLoaded } from '../fonts';
// Projectile sprites thrown hero→target (mirrors board-fight skillVfx: a Sprite
// flies from the caster to the target, then is destroyed). shuriken-family throws a
// spinning star, fire-family throws a fireball; lightning arcs (no projectile) and
// heal is self-target. MUST be Assets.load-ed in preload() (never Texture.from(url)).
import { sfx } from '../audio/sfx';
import shurikenProjData from 'assets/Skills/skill_Shuriken.webp';
import fireballProjData from 'assets/Skills/skill_Deadly_Fireball.webp';

// Replicated from board-fight FightEngine.ts:41 (module-private const, not exported).
const ANIM_DEATH = ['Dead', 'Death', 'Die', 'Dying'];
// Replicated from board-fight FightEngine.ts:40 — the hurt/take-hit anim fallback chain.
// Mission #10: played on the hero when a scare beat goes pending (the boss's combo lands).
const ANIM_HIT = ['TakeHit', 'Take_Hit', 'Hit', 'Hurt', 'Damaged', 'Get_Hit', 'Got_Hit', 'Got_Hit_By_Attack'];
// Replicated from board-fight FightEngine.ts:24 (DEATH_FADE_MS) and :23 (HP_TWEEN_MS).
const DEATH_FADE_MS = 150;
const HP_TWEEN_MS = 150;
// Basic-melee attack anim fallbacks — the `basic` entry of ATTACK_TIMING (FightEngine.ts:56).
// Replicated as a literal list (ATTACK_TIMING is module-private, not exported).
const ANIM_ATTACK_BASIC = ['Regular_Attack_Melee', 'Basic_Attack_Sword_1', 'Basic_Attack', 'Basic_Attck', 'Attack'];
// Replicated from FightEngine.ts:38 (ANIM_IDLE fallback chain).
const ANIM_IDLE = ['Idle', 'Idle_Full', 'Idle_Loop'];
// Vignette fade duration — local const in FightEngine.toggleVignette (FightEngine.ts:391).
const VIGNETTE_FADE_MS = 180;
// Absolute-timeline basic-melee timing profile (mirrors FightEngine ATTACK_TIMING.basic,
// FightEngine.ts:55-61): approach over moveDuration, play attack anim at animAt, damage
// (flash/shake) lands at damageAt — preferring the spine 'Attack' event, with damageAt as
// the deadline fallback. `anims` is the first-match fallback chain.
const ATTACK_BASIC = { moveDuration: 150, animAt: 150, damageAt: 350,
  anims: ['Regular_Attack_Melee', 'Basic_Attack_Sword_1', 'Basic_Attack', 'Basic_Attck', 'Attack', ...ANIM_IDLE] };

// Projectile tuning (mirrors board-fight skillVfx/shurikenFlurry constants).
const PROJECTILE_FLY_MS = 160;
const PROJECTILE_SCALE = 0.14;
const PROJECTILE_SPIN = Math.PI * 3;
// vfxId -> projectile texture URL. Only families that "throw" appear here; chainLightning
// arcs and heal is self-cast, so neither spawns a projectile.
const PROJECTILE_URL: Record<string, string> = {
  shurikenFlurry: shurikenProjData,
  fireballBarrage: fireballProjData,
};
// Loaded projectile textures, populated by preload() (Assets.load — never Texture.from).
const PROJECTILE_TEX: Record<string, Texture> = {};

// ── Damage-number tuning ───────────
// Floating-number lifetime: a quick pop-in scale overshoot, then a rise + fade.
const DMG_LIFE_MS = 700;       // total on-screen time
const DMG_POP_FRAC = 0.18;     // fraction of life spent on the pop-in (overshoot → settle)
const DMG_POP_OVERSHOOT = 1.35; // peak scale at the top of the pop
const DMG_FADE_FRAC = 0.55;    // start fading after this fraction of life
const DMG_RISE_PX = 56;        // how far the number drifts up over its life
// Font size interpolates by hit size so heavy hits read as heavier.
const DMG_SIZE_MIN = 34;
const DMG_SIZE_MAX = 64;
const DMG_SIZE_REF = 120;      // amount that maps to DMG_SIZE_MAX (clamped above this)
// Mission #10 hit-marker polish: tilt + directional spread.
//  • Per-number random rotation in [-DMG_TILT_RAD, +DMG_TILT_RAD] so stacked hits don't
//    look stamped.
//  • Per-number rise direction: ±DMG_SPREAD_DEG° off vertical (so 4 hits at the same
//    target fan out instead of pile on top of each other). Subtle — not chaotic.
const DMG_TILT_RAD = 0.15;     // ±0.15 rad ≈ ±8.6°
const DMG_SPREAD_DEG = 20;     // ±20° spread around straight-up
// Y-offset above the target's spine: keep the marker close-by (subtle, not noisy).
const DMG_Y_OFFSET = 120;

// ── Floating-text anti-collision ──────────────────────────────────────────
// Floating labels (Dodge!/Counter!) and damage/heal numbers can fire on the SAME
// actor at overlapping times (e.g. an enemy swing draws a red hero damage number AND
// the hold-window 'Dodge!' label ~140ms later). Both anchored at spine.y-120 and both
// rising, they stack ON TOP of each other and the label hides the number.
//
// Fix: a tiny per-actor occupancy registry. When a new floater spawns, we look at the
// other floaters still live on the SAME actor and, if any sits within a collision band
// of the new one's intended slot, we push the new one to a clear vertical slot:
//   • LABELS bias UP   (above the number — the eye reads "Dodge!" then the value).
//   • NUMBERS bias DOWN (below the label) when a label already occupies the top slot.
// Each floater registers its current y-slot on spawn and unregisters on destroy, so
// the offset is only applied while there's a genuine co-occurrence (single floaters
// keep their natural position).
const FLOAT_SLOT_GAP = 40;        // vertical gap between stacked floaters (px)
const FLOAT_COLLISION_BAND = 34;  // two slots closer than this are "colliding"

export class CombatFx implements CombatFxBridge {
  private readonly hit: HitEffect;
  private readonly liveSprites = new Set<{ destroy: () => void }>();
  // Anti-collision occupancy: per-actor list of the live floaters' assigned y-slots
  // (the spine.y - offset each currently sits at). reserveFloatSlot() reads this to
  // pick a clear slot; the floater removes its entry on destroy. Keyed by FightActor.
  private readonly floatSlots = new Map<FightActor, { kind: 'label' | 'number'; y: number }[]>();
  // Impact particle system (ember/spark bursts + shockwave rings + glow blooms). Owns a
  // single ticker handler torn down in destroy(); added on top of battleArea.
  private readonly impactFx: ImpactFx;
  // Heal "+" particle bursts (green plus-sign swarm on every heal cast). Each HealPlusBurst
  // is driven by render(deltaMS) — CombatFx owns the single ticker handler that pumps them
  // and reaps the dead ones. Torn down in destroy(). Mission H (wire-up): the prep agent
  // shipped healPlusParticles.ts + the asset but left the heal handler un-wired, so the
  // burst never spawned — this is that missing wire-up.
  private healBursts: HealPlusBurst[] = [];
  // Mission J — lightning bolt arcs (hero→target electric zig-zag). Same render(deltaMS)
  // lifetime model as HealPlusBurst; pumped by the SAME single ticker handler (no extra
  // Ticker.shared handler). Torn down in destroy(). This is the lightning family's
  // missing visual signature — see vfx/lightningBolt.ts.
  private lightningBolts: LightningBolt[] = [];
  // Set in destroy() so any in-flight tween() callback bails before touching a reaped sprite.
  private destroyed = false;
  private readonly healBurstTick: (t: Ticker) => void;
  // The active red danger overlay (10c). Mirrors FightEngine.vignetteSprite (FightEngine.ts:388).
  private vignette: Sprite | null = null;
  // Lose-variant halt latch — set by heroDeath() right before it stages the death sequence.
  // Once latched, every cosmetic entry point (showDamageNumber, tweenHp, flash, shake, projectile,
  // impactBurst, lightningBolt, heal burst, scare, melee, enemyAttack, playCast) short-circuits
  // so any deck-fire that was mid-flight at the moment the defeat triggered stops producing visuals
  // (no leftover projectiles flying / enemy damage numbers / vignette during the death hold). The
  // death sequence inside heroDeath runs its OWN tween/Die path directly (it does NOT route through
  // the gated entry points), so the drain → Die visuals survive intact.
  private halted = false;
  // Lose-variant boss-sliver latch — set by heroDeath() to the forced sliver HP. Once set, ANY
  // boss-bar tween (incl. a tweenHpEnemy that was ALREADY in flight when defeat triggered, which
  // halt() can't cancel — sharedTween has no cancel handle) is clamped to this value so the boss
  // bar STAYS at the sliver and never gets dragged back up/down to a stale milestone (the bar
  // would otherwise read ~2400 mid-tween at the death frame instead of the ~480 sliver).
  private bossDeathHp: number | null = null;
  // Mission C — side-channel Rng for crit rolls. SEPARATE from the rig's Rng so crit
  // visuals never perturb deterministic deck/scare/rig behaviour. CombatScene passes
  // a seeded mulberry32; tests can pin the crit sequence. Defaults to Math.random
  // so a no-arg construction in unit/test contexts still rolls crits.
  private readonly critRng: () => number;
  // Mission C — dev toggle to FORCE every damage number into crit style. Used by the
  // Playwright screenshot harness when natural variance doesn't catch a crit frame.
  // Read via globalThis.__clashRoyalForceCrit; default false. Must be unset before
  // shipping (the production build path NEVER toggles this).
  private get forceCrit(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return !!(globalThis as any).__clashRoyalForceCrit;
  }

  constructor(
    private readonly battleArea: Container,
    private readonly ticker: Ticker,
    private readonly hero: FightActor,
    private readonly enemies: FightActor[],
    private readonly speed: number,
    critRng?: () => number,
  ) {
    this.hit = new HitEffect(battleArea, ticker);
    this.impactFx = new ImpactFx(battleArea, ticker, speed);
    this.critRng = critRng ?? Math.random;
    // Single ticker handler that pumps every live heal-plus burst and reaps the dead
    // ones (mirrors ImpactFx's single-handler design — no Ticker.shared, no per-burst
    // handler that could leak). Scaled by combat speed like the rest of the FX timeline.
    this.healBurstTick = (t: Ticker) => this.pumpHealBursts(t.deltaMS * this.speed);
    this.ticker.add(this.healBurstTick);
  }

  /** Advance every live heal-plus burst AND lightning bolt by one frame; reap expired. */
  private pumpHealBursts(deltaMS: number): void {
    for (let i = this.healBursts.length - 1; i >= 0; i--) {
      const b = this.healBursts[i];
      b.render(deltaMS);
      if (!b.alive) { b.destroy(); this.healBursts.splice(i, 1); }
    }
    for (let i = this.lightningBolts.length - 1; i >= 0; i--) {
      const b = this.lightningBolts[i];
      b.render(deltaMS);
      if (!b.alive) { b.destroy(); this.lightningBolts.splice(i, 1); }
    }
  }

  /** Spawn a jagged lightning bolt arc from the hero's hand to the target's body. The
   *  origin mirrors the projectile launch anchor (hero HOME + chest offset) so a bolt
   *  fired while the hero is mid-melee still launches from a stable spot; the target end
   *  tracks the target's live spine. No-op if the target actor is gone. */
  private spawnLightningBolt(t: TargetRef, intensity: number): void {
    const target = this.actor(t);
    if (!target) return;
    const sx = this.hero.homeX, sy = this.hero.homeY - 70;
    const tgtSpine = target.character.spine;
    const ex = tgtSpine.x, ey = tgtSpine.y - 50;
    const bolt = new LightningBolt(this.battleArea, sx, sy, ex, ey, { intensity });
    this.lightningBolts.push(bolt);
  }

  /** Spawn the green plus-sign burst centred on the hero's chest. Called from BOTH heal
   *  display paths (the "+N" number AND the full-HP shimmer) so EVERY heal cast pops the
   *  particles. Tuned a touch beefier than the helper defaults — heal is a celebratory,
   *  player-agency moment so the swarm reads bold against the bright battle bg. */
  private spawnHealBurst(actor: FightActor): void {
    const spine = actor.character.spine;
    // Anchor at the CHEST/torso (spine origin is at the feet) so the hovering "+"es sit
    // AROUND the body and the mist aura envelopes the hero. The helper scatters a FEW small
    // "+"es at varied heights/locations and bobs them gently in place (owns the envelope +
    // small-scale defaults), so we just take the defaults — no count/scale override.
    const burst = new HealPlusBurst(this.battleArea, spine.x, spine.y - 78);
    this.healBursts.push(burst);
  }

  /** Preload the hit-VFX spritesheet so the first flash() has its frame textures ready
   *  (HitEffect.preload is instance-based — CombatFx owns the single HitEffect). */
  async preload(): Promise<void> {
    await this.hit.preload();
    await Promise.all(
      Object.entries(PROJECTILE_URL).map(async ([id, url]) => { PROJECTILE_TEX[id] = await Assets.load<Texture>(url); }),
    );
    // Warm the heal "+" particle texture so the first heal cast spawns its sprites
    // synchronously on frame 1 (no few-ms pop-in while Assets.load resolves). Idempotent
    // — the helper caches a module-level Texture and guards concurrent loads.
    await preloadHealPlusTexture();
    // Register/await the Luckiest Guy display font so the FIRST styled damage number
    // is drawn in the real face (PIXI caches a Text's glyph atlas on first draw — a
    // miss here bakes the Impact/Arial fallback in for the session). ensureGameFontsLoaded
    // never throws/hangs (it catches a failed woff2 fetch), so a slow font can't block.
    await ensureGameFontsLoaded();
  }

  /** Fly a projectile sprite from the hero to the target, then destroy it. No-op delay
   *  fallback if this vfx family has no projectile (lightning/heal) or the target is gone. */
  private async flyProjectile(skillId: string, to: TargetRef): Promise<void> {
    const tex = PROJECTILE_TEX[skillId];
    const target = this.actor(to);
    if (!tex || !target || (to.id >= 0 && target.dead)) { await this.delay(120); return; }
    const tgtSpine = target.character.spine;
    // Origin is the hero's HOME anchor (not the live spine x/y) so a projectile fired while
    // the hero is mid-melee-transit still launches from a stable spot. Target stays live.
    const sx = this.hero.homeX, sy = this.hero.homeY - 80;
    const ex = tgtSpine.x, ey = tgtSpine.y - 40;
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.scale.set(PROJECTILE_SCALE);
    sprite.position.set(sx, sy);
    this.battleArea.addChild(sprite);
    this.liveSprites.add(sprite);
    const spin = skillId === 'shurikenFlurry' ? PROJECTILE_SPIN : 0;
    await this.tween(PROJECTILE_FLY_MS, (t) => {
      sprite.x = sx + (ex - sx) * t;
      sprite.y = sy + (ey - sy) * t;
      if (spin) sprite.rotation = t * spin;
    });
    this.liveSprites.delete(sprite);
    sprite.destroy();
  }

  private tween(ms: number, fn: (t: number) => void): Promise<void> {
    // Guard the destroyed-sprite teardown race: sharedTween has no cancel handle (see the note
    // in fadeAndKill), so a scene exit() that runs destroy() while a tween is mid-flight leaves
    // the handler scheduled — its callback then writes .position/.scale.set on a sprite that
    // destroy() already reaped (via liveSprites), throwing "Cannot read properties of null".
    // Iteration #3's win-on-return arms a bounce-back retry MID-COMBAT (the first path to tear
    // down a live fight with in-flight VFX), so this is now reachable. Bail every CombatFx tween
    // once destroyed — one guard covers projectiles, damage numbers, crit labels + heal floaters.
    return sharedTween(this.ticker, ms, (t) => { if (!this.destroyed) fn(t); }, this.speed);
  }
  private delay(ms: number): Promise<void> {
    return sharedDelay(this.ticker, ms, this.speed);
  }

  async playCast(skillId: string, tier: number, targetIndex: number, isSelf: boolean, damageAmount: number, onImpact: () => void): Promise<void> {
    // Lose-variant halt: once heroDeath() has latched the screen, suppress any new deck-fires
    // entirely. The controller's step() already early-returns on isDefeat() so no new playCast
    // should arrive here; this gate covers the IDLE-auto-pick race where a queued cast was
    // scheduled in the same tick the defeat latched. onImpact is still fired so the controller's
    // bookkeeping (cooldowns / deck cursor — all moot during the hold) stays consistent.
    if (this.halted) { onImpact(); return; }
    const handler = getCosmeticVfx(skillId);
    if (!handler) { onImpact(); return; }
    const refs: TargetRef[] = skillId === 'chainLightning'
      ? this.enemies.map((_, i) => ({ id: i })).filter(r => !this.enemies[r.id].dead)
      : isSelf ? [{ id: -1 }] : [{ id: targetIndex }];

    // Mission C — per-strike damage-number split.
    // Handlers advertise their impact count via declareImpacts(N) BEFORE the first impact
    // lands. The bridge splits the rig-resolved damageAmount into N integer slices (sum
    // equals damageAmount exactly — the last slice absorbs any rounding remainder). Each
    // onImpact call draws ONE slice; calls past N are silent (flash/shake/kill signals only).
    //
    // Handlers that do NOT call declareImpacts get the back-compat single-number path:
    // one consolidated damage number on the LAST flagged impact (legacy behavior preserved
    // for unit-test stubs and the heal self-cast).
    let perStrikeAmounts: number[] | null = null;
    let drawnStrikes = 0;
    const declareImpacts = (count: number): void => {
      if (perStrikeAmounts || isSelf || damageAmount <= 0 || count <= 1) {
        // Don't split: self-cast (heal), zero damage, or single impact. The legacy path
        // (single consolidated number on isLast=true) covers these. count=1 stays legacy
        // so the existing tier-1 shuriken/fireball UX (one big number) is unchanged.
        return;
      }
      const base = Math.floor(damageAmount / count);
      const slices: number[] = [];
      for (let i = 0; i < count; i++) slices.push(base);
      slices[slices.length - 1] += damageAmount - base * count;
      perStrikeAmounts = slices;
    };

    let firedImpact = false;
    const showHitForTarget = (t: TargetRef, amount: number): void => {
      const a = this.actor(t);
      if (!a || amount <= 0) return;
      // Mission C2 — eligibility for crit: hero-melee + deck-fire enemy numbers can crit.
      // Self-target casts (heal) NEVER crit (heal numbers are routed via showHealNumber,
      // not this path). Force-crit dev toggle wins over the rng coin flip.
      const crit = this.forceCrit || rollCrit(this.critRng);
      this.showDamageNumber(a, amount, { crit });
    };
    const ctx: CosmeticVfxContext = {
      tier: tier as Tier,
      resolveTargets: () => refs,
      isDead: (t) => t.id >= 0 && this.enemies[t.id]?.dead,
      declareImpacts,
      onImpact: (t, isLast) => {
        // Lose-variant halt: a deck-fire handler that started mid-flight before triggerDefeat
        // landed will still call onImpact (it's mid-async). Suppress every visual side-effect
        // (damage numbers, the rig-driven controller bookkeeping is independent of this).
        if (this.halted) { if (isLast && !firedImpact) { firedImpact = true; onImpact(); } return; }
        // Per-strike damage number rendering:
        //  • Declared-impacts path: draw a slice on each call while drawnStrikes < count.
        //    Calls beyond the declared count are silent (flash/shake/kill signals only).
        //  • Back-compat path (handler didn't declare): draw the consolidated amount on
        //    the LAST flagged impact, once.
        if (perStrikeAmounts) {
          if (drawnStrikes < perStrikeAmounts.length) {
            const slice = perStrikeAmounts[drawnStrikes];
            drawnStrikes++;
            showHitForTarget(t, slice);
          }
          // else: overflow call (e.g. chain-lightning extra passes). Silent on numbers.
        } else if (isLast && damageAmount > 0 && !isSelf) {
          showHitForTarget(t, damageAmount);
        }
        // Heal (isSelf): no number drawn here; showHeal is centralized below.
        if (isLast && !firedImpact) { firedImpact = true; onImpact(); }
      },
      // Every cosmetic side-effect a handler can fire goes through the bridge — gate each so
      // a still-running handler whose target/projectile/burst hadn't landed yet at the moment
      // halt() latched produces nothing visible during the defeat hold. (delay/tween stay
      // un-gated: the handler's async needs to RESOLVE so its `await handler(ctx)` completes
      // and onImpact ultimately fires — otherwise the controller hangs.)
      spawnProjectile: async (_from, to) => { if (this.halted) return; await this.flyProjectile(skillId, to); },
      flash: (t) => { if (this.halted) return; const a = this.actor(t); if (a) this.hit.flash(a); },
      shake: (px) => { if (this.halted) return; this.hit.shake(px); },
      tween: (ms, fn) => this.tween(ms, fn),
      delay: (ms) => this.delay(ms),
      impactBurst: (t, spec) => { if (this.halted) return; this.impactBurst(t, spec); },
      lightningBolt: (t, intensity) => { if (this.halted) return; this.spawnLightningBolt(t, intensity ?? 1); },
    };
    await handler(ctx);
    // Self-target casts (heal): show the heal display once at the end. The damageAmount carries
    // the heal delta from the controller; <=0 routes to healShimmer via showDamage.
    if (isSelf) this.showDamage('self', -1, damageAmount, true);
    if (!firedImpact) onImpact(); // safety — see CRITICAL invariant: handlers may fire ZERO onImpact (all targets dead/empty)
  }

  private actor(t: TargetRef): FightActor | undefined { return t.id < 0 ? this.hero : this.enemies[t.id]; }

  /** Emit the spectacular impact particles at a target's body (ember/spark burst +
   *  optional shockwave ring + glow bloom). Positions everything at the actor's spine
   *  in battleArea-local coords (the same space ImpactFx.container lives in). No-op if
   *  the target is gone. The burst NEVER touches HP/rig state — display only. */
  private impactBurst(t: TargetRef, spec: ImpactBurstSpec): void {
    const a = this.actor(t);
    if (!a) return;
    const spine = a.character.spine;
    const x = spine.x;
    const y = spine.y - 60; // strike the body mass, not the feet
    const family = spec.family ?? 'fire';
    // Glow first (behind), then ring, then the particle burst on top.
    if (spec.glow && spec.glow > 0) this.impactFx.glowBloom(x, y, { family, radius: spec.glow });
    if (spec.shockwave && spec.shockwave > 0) {
      this.impactFx.shockwave(x, y, { family, radius: spec.shockwave });
    }
    this.impactFx.impactBurst(x, y, {
      family,
      count: spec.count,
      speed: spec.speed,
      scale: spec.scale,
      life: spec.life,
      gravity: spec.gravity,
      debris: spec.debris,
    });
  }

  showDamage(side: 'enemy' | 'self', index: number, amount: number, heal: boolean): void {
    // Lose-variant halt: suppress all bridge-routed damage/heal numbers from in-flight casts.
    // The death sequence's own big red number bypasses this gate by calling showDamageNumber
    // directly (heroDeath does that explicitly).
    if (this.halted) return;
    // Mission #10: the dd7d3aa "amount<=0 → no number" suppression was REMOVED — the rig
    // no longer reports 0-damage hits on the finisher beat (the killing fire lands real
    // damage now). The only remaining 0-amount path is heal-at-full-HP (handled below as
    // a green shimmer). A non-heal amount<=0 would be a bug — let it draw -0 so it shows.
    const a = side === 'self' ? this.hero : this.enemies[index];
    if (!a) return;
    if (heal) {
      // Green "+" particle swarm on EVERY heal cast — fires for both the meaningful-heal
      // path and the full-HP shimmer path (the cast still reads as a beneficial event even
      // when there's nothing to restore). Mission H wire-up: the burst helper existed but
      // was never spawned; this is the call that was missing.
      this.spawnHealBurst(a);
      // Heal at full HP (nothing to restore): no "+0" number — just a brief green self-tint
      // shimmer so the cast still reads as a beneficial cosmetic event.
      if (amount <= 0) { this.healShimmer(a); return; }
      this.showHealNumber(a, amount);
      return;
    }
    // Clash-royal's own styled damage number (chunky Luckiest Guy, gold→white, pop+rise)
    // instead of board-fight's plain-Arial DamageNumber.
    this.showDamageNumber(a, amount);
  }

  /** Reserve a clear vertical slot for a new floater on `actor`, returning the base y
   *  (spine.y + this). Strategy: a `label` prefers ABOVE the number (more-negative
   *  offset); a `number` prefers the natural baseline but drops BELOW if a label
   *  already holds the top slot — so a co-occurring 'Dodge!' + damage number never
   *  overlap. When nothing else is live on the actor, the natural offset is used. */
  private reserveFloatSlot(actor: FightActor, kind: 'label' | 'number', naturalOffset: number): number {
    const list = this.floatSlots.get(actor) ?? [];
    const collides = (y: number): boolean => list.some(s => Math.abs(s.y - y) < FLOAT_COLLISION_BAND);
    // Candidate slots in preference order. Labels read best ABOVE the value, numbers
    // sit at the baseline (or below if the top is taken). Offsets are NEGATIVE-up.
    const candidates = kind === 'label'
      ? [naturalOffset - FLOAT_SLOT_GAP, naturalOffset, naturalOffset - FLOAT_SLOT_GAP * 2, naturalOffset + FLOAT_SLOT_GAP]
      : [naturalOffset, naturalOffset + FLOAT_SLOT_GAP, naturalOffset - FLOAT_SLOT_GAP, naturalOffset + FLOAT_SLOT_GAP * 2];
    let chosen = candidates.find(c => !collides(c));
    if (chosen == null) {
      // Everything close is taken — stack one gap below the lowest current slot so it
      // is at least separated (never silently overlap).
      const lowest = list.reduce((m, s) => Math.max(m, s.y), naturalOffset);
      chosen = lowest + FLOAT_SLOT_GAP;
    }
    list.push({ kind, y: chosen });
    this.floatSlots.set(actor, list);
    return chosen;
  }

  /** Release a previously-reserved slot (called when the floater is destroyed). */
  private releaseFloatSlot(actor: FightActor, slotY: number): void {
    const list = this.floatSlots.get(actor);
    if (!list) return;
    const i = list.findIndex(s => s.y === slotY);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) this.floatSlots.delete(actor);
  }

  /** Floating damage number in the game's display font. Built on the showHealNumber
   *  pattern (rising/fading Text on this.tween) but with: a pop-in scale overshoot,
   *  a thick dark stroke for readability over the bright battle bg, a white→gold fill,
   *  and a font size that scales up with the hit so heavy hits read as heavier.
   *
   *  Mission C2 — crit styling. When `opts.crit` is true, the number renders with a
   *  warm red→orange gradient + chunkier font + heavier stroke + a small "CRIT!" label
   *  rising above the number. The displayed numeric VALUE is unchanged — crit is purely
   *  visual (sum invariant preserved).
   */
  private showDamageNumber(actor: FightActor, amount: number, opts?: { crit?: boolean }): void {
    const crit = !!opts?.crit;
    // Mission I-v2 Issue I2 — detect hero-side numbers and render them in the warm-red
    // HERO_HIT_STYLE gradient so "incoming damage" reads unambiguously as bad. The CRIT
    // path is mutually exclusive (hero-side numbers are not crit-eligible per the
    // enemy-attack design — see Crit.ts comment) so the three branches are clean.
    const heroSide = actor === this.hero && !crit;
    if (crit) sfx.crit(); else sfx.damage();
    const rounded = Math.max(1, Math.round(amount));
    // Interpolate size by hit magnitude (clamped) — small hits ~34px, big hits up to 64px.
    const mag = Math.min(1, rounded / DMG_SIZE_REF);
    const baseFontSize = DMG_SIZE_MIN + (DMG_SIZE_MAX - DMG_SIZE_MIN) * mag;
    const fontSize = crit ? baseFontSize * CRIT_STYLE.fontSizeMul : baseFontSize;
    // Fill stops:
    //  • CRIT      — warm white→amber→orange→deep-red (CRIT_STYLE).
    //  • HERO HIT  — light-pink → bright red → deep red → blood (HERO_HIT_STYLE).
    //  • VANILLA   — white→gold→amber (legacy enemy-side number).
    const stops = crit ? CRIT_STYLE.gradientStops
      : heroSide ? HERO_HIT_STYLE.gradientStops
      : [
          { offset: 0, color: 0xffffff },
          { offset: 0.55, color: 0xffe14d },
          { offset: 1, color: 0xffae00 },
        ];
    const fill = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      textureSpace: 'local',
      colorStops: stops,
    });
    const strokeBaseW = Math.max(4, fontSize * 0.14);
    const strokeMul = crit ? CRIT_STYLE.strokeMul : heroSide ? HERO_HIT_STYLE.strokeMul : 1;
    const strokeW = strokeBaseW * strokeMul;
    const strokeColor = crit ? CRIT_STYLE.strokeColor
      : heroSide ? HERO_HIT_STYLE.strokeColor
      : 0x2a1400;
    const t = new Text({
      text: `-${rounded}`,
      style: new TextStyle({
        fontFamily: GAME_FONT_STACK,
        fontSize,
        fontWeight: '900',
        fill,
        stroke: { color: strokeColor, width: strokeW, join: 'round' },
        letterSpacing: 1,
        align: 'center',
      }),
    });
    t.anchor.set(0.5, 0.5);
    // Mission #10 polish:
    //  • Random tilt in ±DMG_TILT_RAD so stacked hits don't read as mechanical stamps.
    //  • Directional rise — ±DMG_SPREAD_DEG° off straight-up — so multiple hits on one
    //    target fan out subtly. Slight horizontal jitter on the START position too so the
    //    first frame doesn't snap to the same x for every hit.
    const tilt = (Math.random() - 0.5) * 2 * DMG_TILT_RAD;
    t.rotation = tilt;
    const spreadDeg = (Math.random() - 0.5) * 2 * DMG_SPREAD_DEG;
    const spreadRad = spreadDeg * Math.PI / 180;
    // Direction unit-vector: 0 rad = straight up; positive spread tilts to the right.
    const dirX = Math.sin(spreadRad);
    const dirY = -Math.cos(spreadRad);
    const jitterX = (Math.random() - 0.5) * 36;
    const x0 = actor.character.spine.x + jitterX;
    // Anti-collision: reserve a clear vertical slot so a co-occurring 'Dodge!'/'Counter!'
    // label doesn't bury this number. Numbers prefer the natural baseline; if a label
    // already holds the top slot the number drops below it. Released on destroy.
    const slotOffset = this.reserveFloatSlot(actor, 'number', -DMG_Y_OFFSET);
    const y0 = actor.character.spine.y + slotOffset;
    t.position.set(x0, y0);
    t.scale.set(0);
    this.battleArea.addChild(t);
    this.liveSprites.add(t);
    // Crit label: a small "CRIT!" rising above the number, same lifetime/rise/fade so it
    // settles in sync. Anchored above the number so the eye reads label-then-number.
    let critLabel: Text | null = null;
    if (crit) {
      critLabel = new Text({
        text: 'CRIT!',
        style: new TextStyle({
          fontFamily: GAME_FONT_STACK,
          fontSize: CRIT_STYLE.labelFontSize,
          fontWeight: '900',
          fill: CRIT_STYLE.labelFill,
          stroke: { color: CRIT_STYLE.labelStroke, width: 4, join: 'round' },
          letterSpacing: 1,
        }),
      });
      critLabel.anchor.set(0.5, 1); // anchor at bottom so it sits ABOVE the number
      critLabel.rotation = tilt;
      critLabel.position.set(x0, y0 - CRIT_STYLE.labelOffsetY);
      critLabel.scale.set(0);
      this.battleArea.addChild(critLabel);
      this.liveSprites.add(critLabel);
    }
    void this.tween(DMG_LIFE_MS, (k) => {
      // Pop-in: 0 → overshoot → settle to 1 over DMG_POP_FRAC, then hold at 1.
      let scale: number;
      if (k < DMG_POP_FRAC) {
        const p = k / DMG_POP_FRAC; // 0..1 across the pop window
        scale = p < 0.6
          ? (p / 0.6) * DMG_POP_OVERSHOOT
          : DMG_POP_OVERSHOOT - ((p - 0.6) / 0.4) * (DMG_POP_OVERSHOOT - 1);
      } else {
        scale = 1;
      }
      t.scale.set(scale);
      // Directional rise + fade. Drift along the spread vector instead of pure-up so
      // stacked hits separate visually as they age.
      const dx = dirX * k * DMG_RISE_PX;
      const dy = dirY * k * DMG_RISE_PX;
      t.x = x0 + dx;
      t.y = y0 + dy;
      t.alpha = k > DMG_FADE_FRAC ? 1 - (k - DMG_FADE_FRAC) / (1 - DMG_FADE_FRAC) : 1;
      if (critLabel) {
        critLabel.scale.set(scale);
        critLabel.x = x0 + dx;
        critLabel.y = (y0 - CRIT_STYLE.labelOffsetY) + dy;
        critLabel.alpha = t.alpha;
      }
    }).then(() => {
      this.releaseFloatSlot(actor, slotOffset);
      this.liveSprites.delete(t);
      t.destroy();
      if (critLabel) {
        this.liveSprites.delete(critLabel);
        critLabel.destroy();
      }
    });
  }

  private showHealNumber(actor: FightActor, amount: number): void {
    const t = new Text({
      text: `+${Math.round(amount)}`,
      style: new TextStyle({
        fontFamily: GAME_FONT_STACK,
        fontSize: 36,
        fontWeight: '900',
        fill: 0x66ff88,
        stroke: { color: 0x0a3311, width: 5, join: 'round' },
      }),
    });
    t.anchor.set(0.5);
    // Anti-collision: the heal "+N" is a number; reserve a clear slot (drops below a
    // co-occurring label) so it stays readable. Released on destroy.
    const slotOffset = this.reserveFloatSlot(actor, 'number', -120);
    const y0 = actor.character.spine.y + slotOffset;
    t.position.set(actor.character.spine.x, y0);
    t.scale.set(0);
    this.battleArea.addChild(t);
    void this.tween(700, (k) => {
      if (k < DMG_POP_FRAC) {
        const p = k / DMG_POP_FRAC;
        const s = p < 0.6 ? (p / 0.6) * DMG_POP_OVERSHOOT : DMG_POP_OVERSHOOT - ((p - 0.6) / 0.4) * (DMG_POP_OVERSHOOT - 1);
        t.scale.set(s);
      } else { t.scale.set(1); }
      t.y = y0 - k * 40;
      t.alpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    }).then(() => { this.releaseFloatSlot(actor, slotOffset); t.destroy(); });
  }

  /** Full-HP heal feedback: a brief green self-tint shimmer (white → 0x66ff99 → white over
   *  ~300ms) on the actor's spine, in lieu of a meaningless "+0" number. Restores the
   *  original tint at the end so it never leaves the spine stuck green. */
  private healShimmer(actor: FightActor): void {
    const spine: any = actor.character.spine;
    const orig = spine.tint ?? 0xffffff;
    const green = { r: 0x66, g: 0xff, b: 0x99 };
    const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
    void this.tween(300, (k) => {
      // Ramp toward green over the first half, back to white over the second.
      const m = k < 0.5 ? k / 0.5 : 1 - (k - 0.5) / 0.5;
      const r = lerp(0xff, green.r, m), g = lerp(0xff, green.g, m), b = lerp(0xff, green.b, m);
      spine.tint = (r << 16) | (g << 8) | b;
    }).then(() => { spine.tint = orig; });
  }

  tweenHpEnemy(index: number, hp: number): void {
    // Lose-variant halt: cancel new HP tweens on enemies once the death sequence has latched.
    // Any tween already in flight runs to completion (we don't track tween handles) — but the
    // bar of a still-alive enemy moving by ~150ms during the 1.4s defeat hold is acceptable
    // (the user-reported leak was projectiles + numbers + scare, not enemy HP bars).
    if (this.halted) return;
    const a = this.enemies[index];
    if (a) void this.tweenHp(a, hp);
  }
  tweenHpHero(hp: number): void {
    // Lose-variant halt: NEW hero-bar tween requests are suppressed (the death drain is
    // already running via the internal `this.tween` inside heroDeath, which bypasses this gate).
    if (this.halted) return;
    void this.tweenHp(this.hero, hp);
  }

  // PORT FightEngine.tweenHp (FightEngine.ts:1305-1322): tween actor.hp→clamped hp via
  // this.tween, calling actor.setHp(round) each frame. Speed is baked into this.tween.
  // The rig/scripting tail (death auto-trigger at 0, vignette peek-ahead) is DROPPED —
  // it is FightEngine outcome logic; CombatFx is display-only and the controller drives death.
  private async tweenHp(actor: FightActor, newHp: number): Promise<void> {
    const startHp = actor.hp;
    const endHp = Math.max(0, Math.min(newHp, actor.maxHp));
    await this.tween(HP_TWEEN_MS, (t) => {
      // A killed actor's bar is frozen at 0 — no stale/concurrent finale-barrage tween may revive
      // it (the WIN-DEATH-AT-ZERO race: overlapping tweens bumped the boss bar back up after the
      // kill tween hit 0, so the death anim read non-zero HP). killActor sets dead+0 first.
      if (actor.dead) return;
      // Lose-variant: once the boss-sliver is latched, an in-flight tween on the BOSS actor
      // (started before defeat, uncancellable) must NOT move the bar off the sliver. Pin it.
      if (this.bossDeathHp !== null && actor === this.enemies[0]) { actor.setHp(this.bossDeathHp); return; }
      actor.setHp(Math.round(startHp + (endHp - startHp) * t));
    });
  }

  // PORT FightEngine.killActor (FightEngine.ts:788-807): mark dead, play ANIM_DEATH,
  // delay 300, fade spine alpha→0, hide hpBar. sfx.death dropped (cosmetic-only).
  //
  // Mission #10: when the BOSS dies (index 0), the scene's killing-fire flair fires —
  // a moderate shake plus a dense fire-family impact burst with shockwave + glow. The
  // visual flair the spec calls out: "extra particles + shake on the killing fire" —
  // owned by the bridge so the rig/controller stay rig-pure.
  //
  // Mission #15 (boss-death-shake-breaks-screen): the previous version ran a `zoom-punch`
  // that pivot-shifted battleArea by its visual centre and scaled it 1→1.08→1 over 360ms.
  // HitEffect.shake (shared with board-fight) ALSO mutates battleArea.x/y every tick, and
  // captures origX/origY at shake-start. The two effects fought: shake's per-tick write
  // overwrote the zoom-punch's centre-pivot reposition, sliding battleArea by (-cx, -cy)
  // every frame and slamming spine content OUT of the angled mask region (visible as the
  // bg layer leaking through the bottom-right gap). We removed the zoom-punch entirely —
  // the shake + dense ember burst + shockwave + glow already reads as climactic. Shake px
  // was also reduced from 14 (~4.4% of the 320px canvas, screen-breaking) to 6 (~1.9%,
  // strong but bounded so spine content stays inside the mask).
  killEnemy(index: number): void {
    // Lose-variant halt: no new enemy kills are processed during the death hold (no fading
    // sprites, no extra death flairs). The controller stops scheduling new kills after defeat
    // latches; this gate covers any in-flight delivery.
    if (this.halted) return;
    const a = this.enemies[index];
    if (!a) return;
    if (index === 0 && !a.dead) this.killingFireFlair(a);
    void this.killActor(a);
  }

  /** Killing-fire flair on the boss: a moderate shake plus a dense fire-family ember burst
   *  with shockwave + glow at the body. All cosmetic — never touches HP/rig state. The
   *  earlier zoom-punch was dropped (see killEnemy comment) because it fought HitEffect's
   *  per-tick battleArea-position write and produced a broken-screen frame at killmoment. */
  private killingFireFlair(boss: FightActor): void {
    const spine = boss.character.spine;
    const x = spine.x, y = spine.y - 60;
    this.impactFx.glowBloom(x, y, { family: 'fire', radius: 220 });
    this.impactFx.shockwave(x, y, { family: 'fire', radius: 200 });
    this.impactFx.impactBurst(x, y, {
      family: 'fire', count: 56, speed: 460, scale: 0.7, life: 620, gravity: 60, debris: true,
    });
    // 6 px ≈ 1.9% of the 320px canvas width — strong, but spine content stays inside the
    // angled battle mask (vs the previous 14 px / ~4.4%, which combined with the zoom-punch
    // pivot offset was the dominant cause of the broken-screen frame).
    this.hit.shake(6);
  }
  private async killActor(actor: FightActor): Promise<void> {
    if (actor.dead) return;
    // BUG 3: the death anim plays ONLY on an EMPTY bar. Mark dead + snap the bar to 0 FIRST so the
    // controller's concurrent HP-drain tween AND any still-running finale-barrage tween can no
    // longer move this bar (tweenHp bails on a dead actor) — then play the death anim. A fixed
    // delay / poll raced those overlapping tweens (one could bump the bar back up after the kill
    // tween hit 0), so the boss read non-zero HP under the death anim (the user-reported "death
    // anim while it still has HP"; flaky across runs). dead+0-first is deterministic.
    actor.dead = true;
    actor.setHp(0);
    sfx.enemyDeath();
    this.tryPlay(actor, ANIM_DEATH, false);
    await this.delay(300);
    const spine = actor.character.spine;
    const startAlpha = spine.alpha;
    await this.tween(DEATH_FADE_MS, (t) => { spine.alpha = startAlpha * (1 - t); });
    actor.hpBar.container.alpha = 0;
    if (actor.rageBar) actor.rageBar.container.alpha = 0;
  }

  // Replicated from FightEngine.tryPlay (FightEngine.ts:1358-1368): first existing anim wins.
  // Returns the name actually played (so callers can ask waitForAnimEvent about the REAL anim),
  // or null if none of the fallbacks exist on this skeleton.
  private tryPlay(actor: FightActor, names: string[], loop: boolean): string | null {
    // A mid-flight async heroMelee/enemyAttack can resume AFTER destroy() (its awaited tween
    // resolves post-teardown) and call here on an actor whose Spine destroy() already reaped —
    // reading `skeleton.data` then throws "Cannot read properties of null". Iteration #3's
    // win-on-return tears down a LIVE fight mid-attack, so bail once destroyed.
    if (this.destroyed) return null;
    const skeleton = actor.character.spine.skeleton;
    for (const name of names) {
      if (skeleton.data.findAnimation(name)) { actor.character.play(name, loop); return name; }
    }
    return null;
  }
  // PORT the basic-melee subset of FightEngine.playAttack (FightEngine.ts:470-621) +
  // getApproachOffset (462-466): hero approaches the target enemy, plays the basic-attack
  // anim, waits for its 'Attack' event (the real swing moment) via waitForAnimEvent, fires
  // this.hit.flash/shake on impact, then walks home. SKIPPED vs playAttack: dramatic
  // darkening, category labels, dodge path, rage weapon glow, rage fill/discharge,
  // berserk scale hooks. The hero now ALSO tweens the target HP bar + floats a damage
  // number when `damageAmount > 0` (deck still owns milestones; the rig clamps the chip).
  heroMelee(targetIndex: number, damageAmount: number = 0): void {
    // Lose-variant halt: suppress new hero-melee scheduling. Any still-running async heroMelee
    // (mid-approach) will finish its tween, but it won't draw damage numbers (showDamageNumber
    // is gated below) and the IDLE-resume tryPlay at the bottom is gated too so the hero
    // doesn't re-trigger Idle on top of Die during the hold.
    if (this.halted) return;
    const hero = this.hero, target = this.enemies[targetIndex];
    if (!hero || hero.dead || !target || target.dead) return;
    void (async () => {
      // Approach: stop just short of the target by the summed half-widths (getApproachOffset).
      // Hero is on the player (left) side, so it stops to the LEFT of the target's home.
      const approachX = target.homeX - this.getApproachOffset(hero, target);
      await this.tweenPosition(hero, approachX, target.homeY, ATTACK_BASIC.moveDuration);
      // Attack anim (non-looping); impact lands on the spine 'Attack' event (board-fight
      // timeline), else after the damageAt-animAt deadline so it never hangs.
      const playedAnim = this.tryPlay(hero, ATTACK_BASIC.anims, false);
      // Resolve at the swing's 'Attack' event (the real hit moment, ~0.6s into the 1.43s anim)
      // when the played anim has it — NOT the short cosmetic deadline, which fired mid-windup
      // and reset the hero to Idle before the sword ever swung. damageAt is only a last-ditch
      // fallback for an anim with neither the event nor a known duration.
      await this.waitForAnimEvent(hero, playedAnim, 'Attack', ATTACK_BASIC.damageAt - ATTACK_BASIC.animAt);
      // BUG 2: a melee that passed the schedule-time guards but was mid-flight (await
      // tweenPosition → await waitForAnimEvent) when the death latched (halt() set this.halted,
      // heroDeath set hero.dead) must NOT land its impact on the boss after the hero is dead.
      // Re-check at the impact moment, before any flash/HP-tween/number lands.
      if (this.halted || hero.dead) return;
      if (!target.dead) {
        this.hit.flash(target);
        sfx.heroMelee();
        this.hit.shake(3);
        // Deal the rig-resolved chip: tween the target's HP bar + float a small damage
        // number. Skipped when damageAmount = 0 (saturated at floor+1 — deck owns the
        // crossing) so the swing stays a cosmetic-only chip there.
        if (damageAmount > 0) {
          const newHp = Math.max(0, target.hp - damageAmount);
          void this.tweenHp(target, newHp);
          // Mission C2 — hero melee chip can crit (consistency with deck-fire numbers).
          const crit = this.forceCrit || rollCrit(this.critRng);
          this.showDamageNumber(target, damageAmount, { crit });
        }
      }
      await this.delay(80);
      // Return home and resume idle. Lose-variant halt: a halted check guards the IDLE-resume
      // so a still-running heroMelee whose `await waitForAnimEvent` resolves AFTER the death
      // latched doesn't overwrite the hero's frozen Die pose with Idle (the user-reported
      // "hero revives" leak — separate from the Die-pose-hold fix in heroDeath).
      if (this.halted || hero.dead) return;
      this.tryPlay(hero, ANIM_IDLE, true);
      await this.tweenPosition(hero, hero.homeX, hero.homeY, ATTACK_BASIC.moveDuration);
    })();
  }

  /** Resolve at the attack's hit moment. Mirrors FightEngine.waitForAnimEvent (FightEngine.ts:1379-1429)
   *  semantics, which are the WORKING reference:
   *   - If the just-played anim DOES contain `eventName`, listen ONLY for that event and use a
   *     GENEROUS safety timeout (the event's true time may be far past the cosmetic deadline — e.g.
   *     Regular_Attack_Melee fires 'Attack' at 0.6s of a 1.43s anim, so a ~200ms deadline would
   *     fire long before the swing and yank the hero back to Idle mid-windup). `complete` is NEVER
   *     used to resolve — an interrupted/looping track-entry completion would resolve too early.
   *   - If the anim has NO such event, fall back to 45% of the anim's REAL duration.
   *   - Only if no anim/duration is known does it fall back to the passed `deadlineMs`.
   *  `animName` is the name `tryPlay` actually started (first match of the fallback chain), so the
   *  has-event check is against the real playing anim, not the head of the list. */
  private waitForAnimEvent(actor: FightActor, animName: string | null, eventName: string, deadlineMs: number): Promise<void> {
    const skeletonData: any = actor.character.spine.skeleton.data;
    const anim: any = animName ? skeletonData.findAnimation(animName) : null;
    if (anim) {
      const hasEvent = (anim.timelines ?? []).some((tl: any) =>
        (tl.events ?? []).some((e: any) => e?.data?.name === eventName),
      );
      if (hasEvent) {
        return new Promise<void>((resolve) => {
          let done = false;
          const state: any = actor.character.spine.state;
          const finish = () => { if (!done) { done = true; try { state.removeListener(listener); } catch {} resolve(); } };
          // ONLY the named event resolves the listener — no `complete` (avoids early-resolve).
          const listener: any = { event: (_entry: unknown, ev: any) => { if (ev?.data?.name === eventName) finish(); } };
          try { state.addListener(listener); } catch { /* fall through to safety timeout */ }
          // Safety: resolve if the event never fires (scene teardown / unexpected interrupt).
          // Generous — the event's real time plus headroom — so it never pre-empts the swing.
          const animDurationMs = (anim.duration ?? 0) * 1000;
          void this.delay(animDurationMs + 1000).then(finish);
        });
      }
      // No event on this anim — damage moment is a fraction of the anim's real duration.
      const animDurationMs = (anim.duration ?? 0) * 1000;
      if (animDurationMs > 0) {
        const wait = animDurationMs * 0.45;
        return wait > 0 ? this.delay(wait) : Promise.resolve();
      }
    }
    // No anim/duration known — fall back to the cosmetic deadline.
    return deadlineMs > 0 ? this.delay(deadlineMs) : Promise.resolve();
  }

  // Mission G Issue 1: a living enemy plays its basic-attack anim and — when the rig
  // resolved a positive chip — draws a red damage number on the hero AND tweens hero HP.
  // The previous version was COSMETIC ONLY ("never touches hero HP"), which left the
  // enemy looking turn-based-broken next to the working hero-melee chip path. The rig
  // still owns the floor (scare-pending → never crosses next-scare floor; otherwise the
  // hard survival floor) so the hero is NEVER killed by enemy melee alone.
  //
  // Crit-eligibility decision: enemy-attack chip is NOT crit-eligible. Matches the heal
  // exclusion philosophy: scripted / dramatic damage stays vanilla; only player-driven
  // hits (hero melee, deck-fires on enemies) roll crits. Keeps the crit signal pointed
  // at the player's agency, not at incoming damage.
  enemyAttack(damageAmount: number = 0, opts?: { attackerIndex?: number; dodge?: boolean }): void {
    // Lose-variant halt: stop scheduling new enemy attacks. A still-running async swing will
    // finish its approach tween but its damage path is gated below (hero.dead short-circuits
    // the hero-damage block, and showDamageNumber checks halted via the public showDamage gate
    // it routes through). The IDLE-resume on the attacker is gated below so the attacker
    // doesn't get re-Idled on top of any inherited state.
    if (this.halted) return;
    // Mission I-v2 Issue I1a — prefer the controller-picked attackerIndex. The legacy
    // fallback (`enemies.find(e => !e.dead)`) ALWAYS returned enemies[0] (the boss),
    // because the boss is alive through the entire minion phase — see m18-runtime-log.txt
    // line scan: every pre-fix line shows `attackerIdx=0`. The controller now passes the
    // explicit pick via opts.attackerIndex; the .find fallback stays for defensive back-
    // compat (a caller that omits the opts arg or passes a stale index).
    const idx = opts?.attackerIndex;
    const explicit = idx != null && idx >= 0 ? this.enemies[idx] : undefined;
    const attacker = (explicit && !explicit.dead) ? explicit : this.enemies.find(e => e && !e.dead);
    const dodge = !!opts?.dodge;
    if (__DEV__) {
      const attackerIdxLog = attacker ? this.enemies.indexOf(attacker) : -1;
      // eslint-disable-next-line no-console
      console.log(`[fx.enemyAttack] dmg=${damageAmount} attackerIdx=${attackerIdxLog} dead=${attacker?.dead ?? 'noActor'} heroDead=${this.hero?.dead} dodge=${dodge}`);
    }
    if (!attacker) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log(`[fx.enemyAttack] SKIP (no living enemy)`);
      }
      return; // no living enemy — no-op
    }
    if (damageAmount <= 0 && !dodge) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log(`[fx.enemyAttack] dmg<=0 — cosmetic only (no damage number, no HP tween)`);
      }
    }
    // Mission I-v2 (user follow-up: "enemies are supposed to move to hero when they
    // attack currently they don't"). The enemy now APPROACHES the hero, swings, lands
    // the chip on the 'Attack' impact event, then walks home — mirroring heroMelee's
    // approach→swing→impact→return loop. Previously the enemy played its attack anim in
    // place which read as a turn-based "stand and flail" (no sense of the enemy closing
    // the distance to strike). The whole sequence is wrapped in one async IIFE so the
    // approach/return tweens sequence correctly even when no damage lands (dodge/cosmetic).
    void (async () => {
      if (attacker.dead) return;
      // Approach: the enemy is on the RIGHT side, the hero on the LEFT — so the enemy
      // stops just to the RIGHT of the hero's home by the summed half-widths. (heroMelee
      // is the mirror: hero stops to the LEFT of the target.)
      const approachX = this.hero.homeX + this.getApproachOffset(attacker, this.hero);
      await this.tweenPosition(attacker, approachX, this.hero.homeY, ATTACK_BASIC.moveDuration);
      if (attacker.dead) return;
      // Attack anim at the approach end; impact lands on the spine 'Attack' event.
      const playedAnim = this.tryPlay(attacker, ANIM_ATTACK_BASIC, false);
      await this.waitForAnimEvent(attacker, playedAnim, 'Attack', ATTACK_BASIC.damageAt - ATTACK_BASIC.animAt);
      // Land the rig-resolved chip on the hero at the IMPACT moment: flash + shake +
      // tween HP bar + float a RED damage number. Skip when damageAmount <= 0 (saturated
      // at the floor — cosmetic-only) or the hero is already dead.
      if (damageAmount > 0 && this.hero && !this.hero.dead) {
        // Flash the hero + a small shake so the hit reads even if the player's eye is
        // on the boss side. sfx.damage() is fired by showDamageNumber below.
        this.hit.flash(this.hero);
        this.hit.shake(2);
        const newHp = Math.max(0, this.hero.hp - damageAmount);
        void this.tweenHp(this.hero, newHp);
        // NOT crit-eligible (see comment above). showDamageNumber detects the hero side
        // and renders the warm-red HERO_HIT_STYLE — visually distinct from the player's
        // own crit-eligible gold deck/melee numbers (Issue I2).
        this.showDamageNumber(this.hero, damageAmount);
      }
      // Mission I-v2 Issue I1b — guaranteed 'Dodge!' label on the hero when the controller
      // flagged this swing as a HOLD-window dodge. Outside the HOLD the legacy 25% random
      // Dodge!/Counter! flair stays (subtle, occasional flavour — not load-bearing). Inside
      // the HOLD the label is required: the user-readable signal that the attack was
      // INTENTIONALLY dodged (vs the previous "boss stopped attacking" broken read).
      if (dodge && this.hero && !this.hero.dead) {
        // The enemy attack clip has NO 'Attack' spine event, so waitForAnimEvent resolved at
        // 45% of the clip (mid-windup). The damage path masks that with a hit-flash; the bare
        // 'Dodge!' label had nothing to anchor it and read as popping BEFORE the swing landed.
        // Nudge it to the swing's visual peak so the dodge reads as a reaction to the hit.
        await this.delay(140);
        if (this.hero && !this.hero.dead) this.showFloatingLabel('Dodge!', this.hero, 0xffcc00);
      } else if (Math.random() < 0.25 && this.hero && !this.hero.dead) {
        const text = Math.random() < 0.5 ? 'Dodge!' : 'Counter!';
        this.showFloatingLabel(text, this.hero, 0xffcc00);
      }
      await this.delay(80);
      // Return home and resume idle.
      if (!attacker.dead) {
        this.tryPlay(attacker, ANIM_IDLE, true);
        await this.tweenPosition(attacker, attacker.homeX, attacker.homeY, ATTACK_BASIC.moveDuration);
      }
    })();
  }

  // PORT the vignette trio: createVignette (FightEngine.ts:414-430) + layoutVignette
  // (432-436) + fade-in (toggleVignette on-path 392-404). Then tween the hero HP BAR to
  // targetHp via the 10b helper — the rig already scripted heroHp down; this only mirrors
  // the displayed bar. Does NOT compute HP.
  scare(targetHp: number): void {
    // Lose-variant halt: no new scare cues during the defeat hold (the vignette + bar dip
    // would compete with the death frame). halt() already wiped any active vignette + cleared
    // the existing scare. The controller stops scheduling scares after defeat latches; this
    // gate covers any in-flight scheduling.
    if (this.halted) return;
    if (!this.vignette) {
      const sprite = this.createVignette();
      sprite.alpha = 0;
      this.layoutVignette(sprite);
      // Sibling of battleArea like FightEngine (avoids the battleArea mask clipping the
      // overlay to the fight viewport); fall back to battleArea if no parent yet.
      const parent = this.battleArea.parent ?? this.battleArea;
      parent.addChild(sprite);
      this.vignette = sprite;
      this.liveSprites.add(sprite);
      void this.tween(VIGNETTE_FADE_MS, (t) => { sprite.alpha = t; });
    }
    // Mission #10: play the hero's TakeHit clip on each scare so the dip reads as a real
    // combat moment (not just a vignette + bar drop). Non-looping; settles back into idle
    // naturally via the tail of the clip / the next attack cycle. The first-match fallback
    // chain (ANIM_HIT) keeps this safe across spine skeletons that name it differently.
    if (!this.hero.dead) {
      const playedHit = this.tryPlay(this.hero, ANIM_HIT, false);
      if (playedHit) {
        // Best-effort settle back to idle after the hit anim's duration; if the spine
        // has no anim of that name (playedHit=null) the tryPlay returned null and we skip.
        const animData: any = this.hero.character.spine.skeleton.data.findAnimation(playedHit);
        const durMs = animData ? (animData.duration ?? 0) * 1000 : 0;
        void this.delay(Math.max(150, durMs)).then(() => {
          if (!this.hero.dead) this.tryPlay(this.hero, ANIM_IDLE, true);
        });
      }
    }
    void this.tweenHp(this.hero, targetHp);
  }

  // Adapt the off-path of FightEngine.toggleVignette (FightEngine.ts:405-411): fade out,
  // destroy, drop the reference. Safe to call with no active vignette (no-op).
  clearScare(): void {
    const sprite = this.vignette;
    if (!sprite) return;
    this.vignette = null;
    this.liveSprites.delete(sprite);
    void this.tween(VIGNETTE_FADE_MS, (t) => { sprite.alpha = 1 - t; }).then(() => {
      sprite.destroy({ texture: true, textureSource: true });
    });
  }

  // Settable hook: CombatScene installs a callback that maps killCount →
  // SkillQueue.reveal(config.trayUnlocks.find(u=>u.atKill===killCount)?.skillId).
  // The CombatFxBridge signature stays `onEnemyKilled(killCount: number): void` — this
  // just forwards to the optional callback so the display layer can react to kills.
  onEnemyKilledCb?: (killCount: number) => void;
  onEnemyKilled(killCount: number): void { this.onEnemyKilledCb?.(killCount); }

  // NET-NEW 'VICTORY!' label (adapt FightEngine.playVictory FightEngine.ts:1187-1208):
  // centered celebratory Text that scales in with a brief overshoot pop. Lives in
  // liveSprites so destroy() tears it down.
  onVictory(): void {
    sfx.victory();
    const label = new Text({
      text: 'VICTORY!',
      style: new TextStyle({
        fontFamily: GAME_FONT_STACK,
        fontSize: 52,
        fill: 0xffe27a,
        stroke: { color: 0x5a2e00, width: 8, join: 'round' },
        letterSpacing: 2,
      }),
    });
    label.anchor.set(0.5, 0.5);
    const bounds = this.battleArea.getLocalBounds();
    label.position.set(bounds.width / 2, bounds.height * 0.4);
    label.scale.set(0);
    this.battleArea.addChild(label);
    this.liveSprites.add(label);
    void this.tween(150, (t) => {
      const ease = t < 0.6 ? (t / 0.6) * 1.2 : 1.2 - ((t - 0.6) / 0.4) * 0.2;
      label.scale.set(ease);
    });
  }

  // Lose-variant: the boss's lethal counter on the hero. Sequenced visibly: shows the full
  // lethal red number, the boss lunges, the hero bar drains hp→0 over ~400ms (perceptible —
  // HP_TWEEN_MS's 150 was too fast to read as a "drain to 0"), THEN the hero plays Die
  // CHAINED on the drain finishing (not on a fixed delay that could race the bar tween).
  // The Die anim runs at 1.0× spine timeScale — CombatScene applies cfg.combatSpeed (1.3×)
  // to every actor's spine.state.timeScale for combat anims, which rushes the lethal death;
  // we restore 1.0 right before tryPlay so the death reads weighty. Hero stays VISIBLE slumped
  // in the pose — alpha is left UNTOUCHED (unlike killActor, which fades enemies out).
  heroDeath(heroHpBefore: number, bossHpAfter: number): void {
    // Mark dead IMMEDIATELY so any in-flight enemyAttack impact (its async hp tween toward
    // the rig-clamped newHp lands LATER than the defeat trigger if its lunge anim hadn't yet
    // hit the impact event) and idle/scare paths skip writing the hero bar — without this,
    // a late `tweenHp(hero, 64)` from a still-mid-air lunge OVERWRITES our drain-to-0 and
    // the bar reads non-zero while Die is already playing. dead=true gates those paths
    // (their `!this.hero.dead` checks now short-circuit).
    this.hero.dead = true;
    // Halt LEAKAGE FIRST: any deck-fire that was mid-flight at this moment (a shuriken still
    // travelling, an impact-burst still spawning ember particles, a heal-plus swarm hovering,
    // a lightning bolt arcing, a damage number rising over an enemy, a scare vignette fading)
    // would otherwise keep playing through the 1.4s defeat hold while the hero is already
    // slumped on the ground — the user-reported "skills keep shooting" leak. halt() wipes the
    // screen of all those transient visuals and latches a flag so every public bridge entry
    // point + cosmetic ctx callback in still-running playCast handlers no-ops from here on.
    // It runs BEFORE the death visuals below so the death-sequence sprites (the big red
    // number, the boss lunge, the drain tween, the Die anim) are NOT swept up in the halt.
    this.halt();
    // The boss SURVIVES at a sliver — force its display bar to the rig sliver so it never reads 0
    // (the held-finisher path could have left the DISPLAY bar near 0 even though the boss is alive).
    // Direct setHp — halt() gated the public tweenHpEnemy. Latch bossDeathHp so a boss HP tween
    // that was ALREADY in flight (uncancellable) can't drag the bar back off the sliver afterward.
    this.bossDeathHp = bossHpAfter;
    if (this.enemies[0]) this.enemies[0].setHp(bossHpAfter);
    const boss = this.enemies[0];
    const startHp = this.hero.hp;
    // Sequence the lethal blow EXACTLY like a normal enemy attack so it reads seamless: the
    // boss APPROACHES + SWINGS, and only at the swing's IMPACT moment does the hero's HP
    // number pop + the bar drop. (Previously both fired at t=0, before the boss connected —
    // the user's "hp drops before the boss attacks / feels scripted" bug.) After the drain the
    // hero plays Die at 1.0x and freezes on the last frame.
    void (async () => {
      // Boss lunge: approach the hero, swing, wait for the real impact moment (mirrors enemyAttack).
      if (boss && !boss.dead) {
        const approachX = this.hero.homeX + this.getApproachOffset(boss, this.hero);
        await this.tweenPosition(boss, approachX, this.hero.homeY, ATTACK_BASIC.moveDuration);
        const played = this.tryPlay(boss, ANIM_ATTACK_BASIC, false);
        await this.waitForAnimEvent(boss, played, 'Attack', ATTACK_BASIC.damageAt - ATTACK_BASIC.animAt);
      }
      // IMPACT — land the killing blow like every other hit: flash + climactic shake + the
      // floating red damage number (HERO_HIT_STYLE, identical to in-fight hero hits) + the HP
      // bar dropping at the normal hit speed (HP_TWEEN_MS), so number + drop coincide with the strike.
      this.hit.flash(this.hero);
      this.hit.shake(8);
      this.showDamageNumber(this.hero, heroHpBefore);
      await this.tween(HP_TWEEN_MS, (t) => { this.hero.setHp(Math.round(startHp * (1 - t))); });
      this.hero.setHp(0);
      // Boss recoils home (concurrent with the hero's collapse) — same return as enemyAttack.
      if (boss && !boss.dead) {
        this.tryPlay(boss, ANIM_IDLE, true);
        void this.tweenPosition(boss, boss.homeX, boss.homeY, ATTACK_BASIC.moveDuration);
      }
      // Die at 1.0x + freeze on the final frame (preserve the existing freeze logic verbatim).
      const state: any = this.hero.character.spine.state;
      state.timeScale = 1.0;
      const skeleton = this.hero.character.spine.skeleton;
      let dieName: string | null = null;
      for (const n of ANIM_DEATH) if (skeleton.data.findAnimation(n)) { dieName = n; break; }
      if (dieName) {
        const entry: any = state.setAnimation(0, dieName, false);
        const listener: any = {
          complete: (e: any) => {
            if (e === entry) { entry.timeScale = 0; try { state.removeListener(listener); } catch { /* ignore */ } }
          },
        };
        try { state.addListener(listener); } catch { /* ignore */ }
      }
    })();
  }

  /** __DEV__ E2E hook (CombatScene bridge `liveVfxCount`): count of transient VFX currently
   *  on the battle layer — exactly the collections halt() wipes on death: the liveSprites set
   *  (mid-fly projectiles, damage/heal numbers, crit/dodge labels, the VICTORY label, the scare
   *  vignette is nulled separately) PLUS the heal-plus particle swarms, the lightning-bolt arcs,
   *  and the active scare vignette. The flow harness samples this after the defeat latch to assert
   *  it is monotonically non-increasing through the hold (no new projectile/VFX spawns — the
   *  "skills keep shooting after death" leak). Does NOT count the actors' own spines/HP bars
   *  (those live on FightActor, never in these collections) nor the impactFx particle pool
   *  (it is torn down + reinitialised, not individually trackable). */
  liveVfxCount(): number {
    return this.liveSprites.size + this.healBursts.length + this.lightningBolts.length + (this.vignette ? 1 : 0);
  }

  /** Lose-variant leakage halt: wipe every in-flight cosmetic the controller had queued so the
   *  1.4s defeat hold reads as ONLY the hero death (drain → Die → big red number → boss lunge).
   *  Concretely:
   *    • Destroy every transient liveSprite (projectiles, lightning bolts, scare vignette,
   *      damage/heal numbers, crit + dodge labels, victory text — anything tracked by liveSprites).
   *    • Clear the heal-plus particle swarms and lightning bolt arcs.
   *    • Tear down the impact-burst particle subsystem (it reinitialises on the next mount —
   *      no follow-up impactBurst calls reach it during the hold because the gate below latches).
   *    • Cancel any active scare vignette (the red overlay was set up to fade in 180ms before
   *      the lethal; without an explicit clear it lingers under the defeat card).
   *    • Latch `halted = true` so every NEW public bridge call (showDamage, tweenHpEnemy/Hero,
   *      enemyAttack, heroMelee, scare, killEnemy, playCast) AND every still-running playCast
   *      handler's ctx callbacks (flash/shake/impactBurst/lightningBolt/spawnProjectile/onImpact)
   *      no-op. Internal helpers used by heroDeath (showDamageNumber, hit.shake direct, tryPlay,
   *      this.tween) bypass the gate so the death sequence stays intact.
   *  Idempotent: re-entry after the latch is a no-op. */
  halt(): void {
    if (this.halted) return;
    this.halted = true;
    // Hide every transient cosmetic sprite tracked through liveSprites. liveSprites holds
    // damage/heal numbers, crit labels, the projectile sprites mid-fly, the scare vignette,
    // and the VICTORY label — every one of these should vanish at the death moment so the
    // hold reads as cinematic stillness. The hero spine + hp bars + enemy spines are NOT
    // in liveSprites (they live on the FightActor) so this does not touch the actors.
    //
    // We REMOVE FROM PARENT (alpha=0 + detach) rather than destroy() — the in-flight tween
    // callbacks for these sprites (`(k) => { t.scale.set(...); t.x = ...; t.alpha = ... }`)
    // are scheduled by sharedTween with no cancel handle. Calling destroy() here nulls the
    // sprite's `.scale` Point and the next tick of the callback throws "Cannot read properties
    // of null (reading 'set')". Detaching keeps the PIXI object alive so callbacks no-op
    // visually; the original .then() at the end of each tween still fires destroy() later.
    for (const s of this.liveSprites) {
      const anyS: any = s;
      if (anyS.parent && typeof anyS.parent.removeChild === 'function') anyS.parent.removeChild(anyS);
      if ('alpha' in anyS) anyS.alpha = 0;
    }
    this.liveSprites.clear();
    this.floatSlots.clear();
    // Cancel the scare vignette pointer too (its sprite was just destroyed above) so the
    // tween that's still running stops finding a target. clearScare would tween-fade it,
    // but the user reported the leakage during a 1.4s hold — hard wipe.
    this.vignette = null;
    // Heal-plus particle swarms + lightning bolt arcs aren't in liveSprites — they're owned
    // by their own arrays and pumped by the ticker. Wipe them too.
    for (const b of this.healBursts) b.destroy();
    this.healBursts.length = 0;
    for (const b of this.lightningBolts) b.destroy();
    this.lightningBolts.length = 0;
    // Tear down the impact-burst subsystem. impactFx.destroy() is idempotent (guarded by its
    // own `destroyed` flag) and already called again from CombatFx.destroy() at scene exit.
    // No future impactBurst calls reach it because the `halted` gate in playCast/the ctx
    // wrappers short-circuits them. ImpactFx.destroy removes its container from battleArea
    // and frees its particles/rings/glows; the heap is cleared.
    this.impactFx.destroy();
  }

  // ── 10c helpers (ported from FightEngine) ───────────

  /** PORT FightEngine.getApproachOffset (FightEngine.ts:462-466): summed half-widths in px. */
  private getApproachOffset(actor: FightActor, target: FightActor): number {
    const actorW = actor.character.spine.skeleton.data.width * Math.abs(actor.character.spine.scale.x);
    const targetW = target.character.spine.skeleton.data.width * Math.abs(target.character.spine.scale.x);
    return (actorW + targetW) / 2;
  }

  /** PORT FightEngine.tweenPosition (FightEngine.ts:1325-1345): move spine + hpBar (+ rageBar) together. */
  private async tweenPosition(actor: FightActor, toX: number, toY: number, durationMs: number): Promise<void> {
    const spine = actor.character.spine;
    const startX = spine.x;
    const startY = spine.y;
    const hpStartX = actor.hpBar.container.x;
    const hpStartY = actor.hpBar.container.y;
    const rageStartX = actor.rageBar?.container.x;
    const rageStartY = actor.rageBar?.container.y;
    await this.tween(durationMs, (t) => {
      const dx = (toX - startX) * t;
      const dy = (toY - startY) * t;
      spine.x = startX + dx;
      spine.y = startY + dy;
      actor.hpBar.container.x = hpStartX + dx;
      actor.hpBar.container.y = hpStartY + dy;
      if (actor.rageBar) {
        actor.rageBar.container.x = rageStartX! + dx;
        actor.rageBar.container.y = rageStartY! + dy;
      }
    });
  }

  /** PORT FightEngine.createVignette (FightEngine.ts:414-430): canvas radial-gradient red overlay Sprite. */
  private createVignette(): Sprite {
    const SIZE = 512;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(
      SIZE / 2, SIZE / 2, SIZE * 0.25,
      SIZE / 2, SIZE / 2, SIZE * 0.60,
    );
    grad.addColorStop(0, 'rgba(180, 30, 30, 0)');
    grad.addColorStop(0.75, 'rgba(170, 40, 40, 0.18)');
    grad.addColorStop(1, 'rgba(140, 20, 20, 0.65)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);
    return new Sprite(Texture.from(canvas));
  }

  /** Adapt FightEngine.layoutVignette (FightEngine.ts:432-436). CombatFx has no width/battleH
   *  fields (those are FightEngine layout state), so size from the parent's local bounds —
   *  the full-screen container the overlay sits in. */
  private layoutVignette(sprite: Sprite): void {
    const host = this.battleArea.parent ?? this.battleArea;
    const bounds = host.getLocalBounds();
    sprite.position.set(0, 0);
    sprite.width = bounds.width;
    sprite.height = bounds.height;
  }

  /** Adapt FightEngine.showFloatingLabel (FightEngine.ts:1281-1302): rising, fading label near an actor. */
  private showFloatingLabel(text: string, actor: FightActor, color: number): void {
    const label = new Text({
      text,
      style: new TextStyle({
        fontFamily: GAME_FONT_STACK,
        fontSize: 22,
        fill: color,
        stroke: { color: 0x2a1500, width: 4, join: 'round' },
      }),
    });
    label.anchor.set(0.5, 0.5);
    // Anti-collision: a label biases ABOVE any co-occurring damage/heal number so the
    // number stays visible (e.g. 'Dodge!' sits above the red hero damage number rather
    // than burying it). Released on destroy.
    const slotOffset = this.reserveFloatSlot(actor, 'label', -120);
    const startY = actor.character.spine.y + slotOffset;
    label.position.set(actor.character.spine.x, startY);
    this.battleArea.addChild(label);
    void this.tween(600, (t) => {
      label.y = startY - t * 40;
      label.alpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
    }).then(() => { this.releaseFloatSlot(actor, slotOffset); label.destroy(); });
  }

  destroy(): void {
    this.destroyed = true; // in-flight tween() callbacks now no-op (see tween())
    this.liveSprites.forEach(s => s.destroy());
    this.liveSprites.clear();
    this.floatSlots.clear();
    this.impactFx.destroy(); // removes its single ticker handler + frees all live particles
    // Tear down the heal-burst ticker handler + any in-flight bursts.
    this.ticker.remove(this.healBurstTick);
    this.healBursts.forEach(b => b.destroy());
    this.healBursts.length = 0;
    this.lightningBolts.forEach(b => b.destroy());
    this.lightningBolts.length = 0;
  }
}
