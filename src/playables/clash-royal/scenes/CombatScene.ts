// CombatScene — the VISUAL HOST for the clash-royal playable. It implements the
// shared `Scene` interface via COMPOSITION (Scene is an interface, Container is a
// concrete class; `readonly container = new Container()` is the host node).
//
// 11a (this slice): the full Scene surface + enter() builds the background + angled
// battle viewport + FightActor init/layout, and exit()/layout() handle teardown and
// relayout. The CombatFx / CombatController / UI views are NOT constructed yet
// (that lands in 11b), so update()/exit() optional-chain anything 11b owns.
//
// Viewport + actor ports are adapted from board-fight:
//   drawBattleMask / layoutBg  ← board-fight/scenes/FightScene.ts:184-209
//   init (actor creation)      ← board-fight/fight/FightEngine.ts:142-201
//   layoutActors (home x/y!)   ← board-fight/fight/FightEngine.ts:268-325
//   destroyActors              ← board-fight/fight/FightEngine.ts:256-265
import { Assets, Container, Graphics, Sprite, Text, TextStyle, Ticker } from 'pixi.js';
// Battle background — mirrors how board-fight imports a webp bg as a data-URL string
// (e.g. CloudLayer.ts / board1.ts) then Assets.load(...)s it. BattleBG_Stage1 is the
// closest stock arena to the Rogue Legend fake-ad look.
import BATTLE_BG from 'assets/Backgrounds/BattleBG_Stage1.webp';
import type { Scene } from '@shared/Scene';
import { alTrack } from '@shared/alAnalytics';
import { FightActor } from '../../board-fight/fight/FightActor';
import type { ActorConfig } from '../../board-fight/fight/FightStep';
import { WARRIORS_BLADE } from '../../board-fight/catalog/weapons/warriorBlade';
import { HERO, ENEMY_ASSETS } from '../catalog';
import type { ClashConfig } from '../config';
import { CombatFx } from '../combat/CombatFx';
import { CombatController } from '../combat/CombatController';
import { mulberry32 } from '../rng';
import type { SlotEntry } from '../combat/SlotModel';
import { CoinMeter } from '../ui/CoinMeter';
import { SkillSlots } from '../ui/SkillSlots';
import { SkillQueue } from '../ui/SkillQueue';
import { SkillPanel } from '../ui/SkillPanel';
import { CoachHand } from '../ui/CoachHand';
import { BossHpBar } from '../ui/BossHpBar';
import { sfx } from '../audio/sfx';
// Side-effect imports: each cosmetic-VFX module self-registers its handler into the
// registry on import (see e.g. shurikenFlurry.ts tail: registerCosmeticVfx(...)).
// Importing them here guarantees the registry is populated before CombatFx.playCast.
import '../combat/vfx/shurikenFlurry';
import '../combat/vfx/fireballBarrage';
import '../combat/vfx/chainLightning';
import '../combat/vfx/heal';

// Ported from board-fight FightScene.ts:15-16 — the battle viewport occupies the top
// 55% of the screen with a slight angled bottom edge.
const BATTLE_AREA_RATIO = 0.55;
const BATTLE_SKEW = 0.025;

// Layout constants — ported from board-fight FightEngine.ts:31-35.
const PLAYER_X_FRAC = 0.18; // hero pushed further left (was 0.28) so he isn't crowding the enemies
const ENEMY_X_FRAC = 0.72;
const CHARACTER_Y_FRAC = 0.88;
const CHAR_STAGGER_X = 0.08;
const CHAR_STAGGER_Y = 0.04;
const DEFAULT_CHAR_SCALE = 0.12;
// Global multiplier applied to EVERY character's resolved scale — shrinks hero + all enemies
// uniformly (1.0 = authored size). 0.75 = 25% smaller.
const CHAR_SCALE_MULT = 0.75;

// UI layout. The widgets author themselves at a fixed intrinsic pixel size; the scene
// composes the bottom UI (a big PANEL holding the 3 slot cards + the coin bar) and
// scales the whole panel down on narrow viewports so everything stays on-screen.
//
// Vertical bands (fractions of screen height), top→bottom under the battle viewport:
const TRAY_Y_FRAC = 0.605;        // ROW 1: rarity tray row center (just under battle scene)
const PANEL_TOP_FRAC = 0.66;      // ROW 2: panel top
const PANEL_BOTTOM_FRAC = 0.975;  // ROW 2: panel bottom
const PANEL_W_FRAC = 0.95;        // panel outer width as a fraction of screen width
const PANEL_PAD = 26;             // inner padding inside the panel
// Intrinsic SkillSlots row width — MUST match SkillSlots' own SLOT_W*3 + GAP*2
// (116*3 + 26*2 = 400). The slot visual box is SLOT_BOX_H (150) tall.
const SLOTS_ROW_W = 3 * 116 + 2 * 26;
const SLOT_BOX_H = 150;           // matches SkillSlots.SLOT_BOX_H (portrait hex box)
const SLOT_BADGE_BLOCK = 10 + 30; // matches SkillSlots BADGE_GAP + COIN_SIZE below the box

// Mission G Issue 2: after the controller reports victory we hold for this long (real
// ms, accumulated from update's deltaMS) before resolving `done` — just long enough to
// see the killing-fire flair settle (death anim ~300ms + spine fade ~150ms ≈ 500ms
// minimum), then the director (Task 15) swaps in the end card. The old 1800ms was too
// long — the user perceived it as a "long pause" after the boss dies. 700ms keeps the
// killing-fire moment readable while keeping total boss-dies → end-card under 1s.
const VICTORY_HOLD_MS = 700;

// ≥ the hero Die anim length + settle; longer than VICTORY_HOLD_MS so the death reads before
// the Defeat overlay swaps in.
const DEFEAT_HOLD_MS = 2200;

// ── Onboarding overlay ────────────────────────────────────────────────────
// A UNIFORM full-screen scrim dims the whole scene (no hole). Over the cheapest
// slot we lift a bright, PULSING CLONE of the hex card above the scrim — because
// the clone is itself a hex frame, its silhouette is the hexagon, so no rectangle
// is ever revealed behind it. The real slot underneath stays dimmed; the clone is
// purely visual and taps pass through the scrim to the live slot. A tutorial card
// sits in the upper/middle band; the coach hand points at the spotlit slot. Fades
// in on enter() then waits for the first pick. State machine + card styling ported
// from BlackjackScene.
const ONBOARD_FADE_MS = 260;
const ONBOARD_CARD_W = 340;
const ONBOARD_CARD_H = 180;
// Gentle ~6% spotlight pulse, oscillating around the clone's on-screen base scale.
const SPOTLIGHT_PULSE_AMP = 0.06;
const SPOTLIGHT_PULSE_PERIOD = 180; // ms divisor for the sine
const ONBOARD_TITLE_STYLE = new TextStyle({
  fill: 0x181008,
  fontFamily: '"Luckiest Guy", Impact, "Arial Black", sans-serif',
  fontSize: 40,
  letterSpacing: 1.5,
  stroke: { color: 0xffe6a8, width: 5, join: 'round' },
  align: 'center',
});
const ONBOARD_BODY_STYLE = new TextStyle({
  fill: 0x2a1d10,
  fontFamily: '"Bangers", "Marker Felt", "Comic Sans MS", Arial, sans-serif',
  fontSize: 24,
  letterSpacing: 1,
  wordWrap: true,
  wordWrapWidth: ONBOARD_CARD_W - 48,
  align: 'center',
});

// __DEV__ E2E bridge surface. Mirrors board-fight's `(window as any).__debugState`
// pattern but typed: window.__clashRoyal exposes live read-only state + a tapSlot
// router for the Task 16 Playwright play-through. Optional — only installed under
// __DEV__ (tree-shaken from production by the DefinePlugin guard in CombatScene.enter).
declare global {
  interface Window {
    __clashRoyal?: {
      readonly state: string;
      readonly coins: number;
      readonly slots: (SlotEntry | null)[];
      readonly enemiesAlive: number;
      /** RENDERED boss HP (the value the bar shows) — what the user actually sees. -1 if no
       *  boss actor. Used by the lose-flow E2E to assert the boss bar never reads 0 (the bug). */
      readonly bossHp: number;
      /** RENDERED hero HP-bar value (`Math.round(hero.hp)`). -1 if no hero actor. */
      readonly heroHp: number;
      /** Hero track-0 animation name (null if none). The flow harness asserts it sits in a
       *  Die anim (never Idle) once the hero is dead — catches the "hero revives" leak. */
      readonly heroAnim: string | null;
      /** `hero.dead` — latched true at the start of the death sequence. */
      readonly heroDead: boolean;
      /** `!enemies[0].dead` — the boss must stay alive through the lose defeat. */
      readonly bossAlive: boolean;
      /** Boss (enemies[0]) track-0 animation name (null if none). */
      readonly bossAnim: string | null;
      /** Count of transient VFX sprites currently on the battle layer (CombatFx.liveVfxCount).
       *  Monotonically non-increasing through the defeat hold once halt() has fired. -1 pre-fx. */
      readonly liveVfxCount: number;
      /** Skill ids currently offered in the 3 slots (null for an empty slot). The harness asserts
       *  'heal' is absent during lose combat and present again in the win/retry pool. */
      readonly slotSkillIds: (string | null)[];
      /** True while the onboarding scrim/coach overlay is mounted (gateFightUntilFirstPick fights,
       *  before the first pick). The TRY-AGAIN retry runs with gateFightUntilFirstPick=false, so the
       *  harness asserts this is false on retry (no onboarding/coach re-shown). */
      readonly onboardingActive: boolean;
      readonly deck: string[];
      readonly deckEntries: { id: string; stack: number }[];
      affordable(): number[];
      tapSlot(i: number): boolean;
      /** Test-only (__DEV__): place a specific skill into a slot for deterministic screenshots
       *  of stacking. Returns true on success. Bypasses the slot RNG by stomping the live
       *  slots array; the next refill still draws from the pool (so coin economy + cost still
       *  apply on the subsequent tap). Use sparingly — purely a screenshot determinism hook. */
      forceOffer(skillId: string, slotIndex: number): boolean;
      /** Test-only (__DEV__): fire ONE cosmetic cast through the bridge directly (real
       *  playCast → real handler), bypassing coins/cooldown/deck for deterministic VFX
       *  screenshots. Cosmetic only — never touches the rig. Returns true if fired. */
      fireVfx(vfxId: string, tier: number): boolean;
      /** Internal: scene endCardShown flag accessor used by the `state` getter. */
      endCardShownRef(): boolean;
    };
  }
}

export class CombatScene implements Scene {
  readonly container = new Container();
  readonly done: Promise<void>;
  private resolveDone!: () => void;

  // Battle viewport (masked, angled). Built in enter(), relaid in layout().
  private readonly battleArea = new Container();
  private battleMask!: Graphics;
  private bgSprite!: Sprite;

  // Actors. hero is index-0 of the player side; enemies mirror cfg.enemies order.
  private hero!: FightActor;
  private enemies: FightActor[] = [];

  // 11b: render bridge + controller (constructed there; optional-chained until then).
  private fx?: CombatFx;
  private controller?: CombatController;

  // 11b: UI views (mounted there; declared now for the field types).
  private panel?: SkillPanel;
  private coinMeter?: CoinMeter;
  private slots?: SkillSlots;
  private tray?: SkillQueue;
  private coach?: CoachHand;
  // Prominent top-center boss HP bar overlay — a default, built-in part of every clash-royal build.
  private bossBar?: BossHpBar;

  private ready = false;

  // 11c: victory→end-card handoff state. Once the controller reports victory we latch
  // `victoryHoldMs` and accumulate deltaMS; after VICTORY_HOLD_MS we resolve `done` once.
  private victoryHoldMs = 0;
  private defeatHoldMs = 0;
  private doneResolved = false;
  private outcomeResult: 'win' | 'defeat' = 'win';

  /** Outcome the director reads after `done` resolves — 'defeat' on the lose path, else 'win'. */
  result(): 'win' | 'defeat' { return this.outcomeResult; }

  /** The boss FightActor — the enemy whose config entry is flagged `isBoss` (falls back to the
   *  first enemy). `actor.index` mirrors cfg.enemies order, so the flag picks the right actor. */
  private bossActor(): FightActor | undefined {
    const bossIdx = this.cfg.enemies.findIndex(e => e.isBoss);
    return this.enemies[bossIdx >= 0 ? bossIdx : 0];
  }

  // __DEV__ E2E bridge state: flipped by the director (via markEndCardShown) once the
  // end card mounts so the `state` getter on window.__clashRoyal reads 'endcard'.
  private endCardShown = false;

  // Onboarding overlay (built in enter() after the UI mounts; torn down on first pick).
  // firstPickDone latches the very first pick (manual/auto/bridge) and gates the coach +
  // onboarding dismiss so it fires exactly once.
  private firstPickDone = false;
  private tutorialLayer?: Container;
  private scrim?: Graphics;
  private tutorialCard?: Container;
  private spotlightCard?: Container; // bright pulsing hex clone lifted above the scrim
  private spotlightBaseScale = 1;    // on-screen base scale of the clone (panel scale); pulse oscillates around it
  private spotlightIndex = 0;     // cheapest-cost slot index the spotlight + coach highlight
  private onboardPhase: 'pending' | 'fadeIn' | 'shown' | 'fadeOut' | 'done' = 'pending';
  private onboardElapsed = 0;
  // Active fly-to-deck cosmetic tweens (self-removing per-frame from update()). Each one
  // arcs a real hex CARD clone from the picked slot up into its deck-tile slot, scaling
  // slot-size→tile-size with a little spin, then reveals+pops the (deferred) deck tile and
  // destroys the clone on landing. `node` is the flying Container (a buildSpotlightCard).
  private flyTweens: {
    node: Container; id: string; elapsed: number; dur: number;
    sx: number; sy: number; dx: number; dy: number;
    fromScale: number; toScale: number; spin: number;
    /** When true, on landing the tray runs `merge(id)` (existing tile pops + burst + badge
     *  swap) instead of `popDeferred(id)` (a new-tile reveal). Routed from onPick. */
    merge: boolean;
  }[] = [];

  constructor(
    private readonly cfg: ClashConfig,
    private readonly ticker: Ticker,
    private width: number,
    private height: number,
    /** Iteration #3: fired when the player rapid-fires a spammy skill volley — the director
     *  redirects to the store (paired with win-on-return). Optional so tests/retries can omit it. */
    private readonly onVolley?: () => void,
  ) {
    this.done = new Promise(resolve => { this.resolveDone = resolve; });
  }

  async enter(): Promise<void> {
    // Kick off background decode first so its PNG/webp decode overlaps actor creation
    // (mirrors FightScene.enter() ordering; iOS decodes synchronously on the main thread).
    const bgLoadP = Assets.load(BATTLE_BG);

    // Perf A/B flags (set from URL params in CombatDirector; empty in the real ad).
    const perf = (globalThis as { __crPerf?: Record<string, boolean> }).__crPerf || {};

    // Battle area + angled bottom mask. ?bmask=off skips the whole-viewport mask to
    // A/B whether masking the entire battle scene (bg + both Spine chars + all VFX)
    // every frame is the iOS GPU cost.
    this.container.addChild(this.battleArea);
    this.battleMask = new Graphics();
    this.drawBattleMask();
    this.container.addChild(this.battleMask);
    if (!perf.noBattleMask) this.battleArea.mask = this.battleMask;

    // Background sprite (anchored center; sized in layoutBg).
    const bgTexture = await bgLoadP;
    this.bgSprite = new Sprite(bgTexture);
    this.bgSprite.anchor.set(0.5, 0.5);
    this.battleArea.addChild(this.bgSprite);
    this.layoutBg();

    // ── Actor creation (ported from FightEngine.init ~142-201) ──
    // Wrap the catalog bundles as ActorConfig { spine, skin, maxHp }. ActorConfig.hp
    // defaults to maxHp inside FightActor, which is what we want for a fresh fight.
    // `skin` is REQUIRED: FightActor.create passes config.skin straight into
    // SpineCharacter.create, which falls back to 'default' when it's undefined.
    // The hero skeleton (Main_Character) only ships the 'Base'/'Fire_Wizard'
    // skins — no 'default' — so an omitted skin throws "Skin not found: default"
    // and aborts scene.enter() before the __DEV__ bridge installs. The enemy
    // skeletons all carry a 'default' skin (matches board-fight's convention).
    const heroCfg: ActorConfig = { spine: HERO, skin: 'Base', maxHp: this.cfg.hero.maxHp };
    const enemyCfgs: ActorConfig[] = this.cfg.enemies.map(e => ({
      spine: ENEMY_ASSETS[e.id],
      skin: 'default',
      maxHp: e.maxHp,
    }));

    // FightActor.create(config, side, index, ticker, cachePrefix) — async (loads Spine).
    // Build hero + all enemies in parallel so per-actor Assets.load + Spine.from cost
    // collapses to the slowest single actor instead of summing serially.
    const [hero, enemies] = await Promise.all([
      FightActor.create(heroCfg, 'player', 0, this.ticker, 'clash'),
      Promise.all(enemyCfgs.map((cfg, i) =>
        FightActor.create(cfg, 'enemy', i, this.ticker, 'clash'),
      )),
    ]);

    this.hero = hero;
    this.enemies = enemies;

    // Configure + mount each actor. facingLeft=false (both sides authored facing right
    // in the source skeletons); timeScale follows the configured combat speed.
    for (const actor of [hero, ...enemies]) {
      actor.character.facingLeft = false;
      actor.character.spine.state.timeScale = this.cfg.combatSpeed;
      actor.addTo(this.battleArea);
    }
    // Re-add the hero last so it renders in front of the enemies.
    hero.addTo(this.battleArea);

    // Equip the hero's sword. The Main_Character spine ships no weapon in its skin —
    // board-fight attaches one via equipWeapon onto the `Sword_Hilt2` bone; without
    // this the hero fights bare-handed. WARRIORS_BLADE is tuned for this skeleton.
    await this.hero.character.equipWeapon(WARRIORS_BLADE);

    // Lay out actors — CRITICAL: this sets homeX/homeY. Without it they default to 0
    // and every VFX (and the melee approach math) fires at the battle-area origin.
    this.layoutActors();

    // ?actors=off — stop drawing both Spine characters (keeps autoUpdate so the sim's
    // anim-events still fire and the fight progresses) to A/B whether the ornate
    // skeletons' per-frame draw calls are the (resolution-independent) cost.
    if (perf.noActors) {
      for (const a of [hero, ...enemies]) {
        (a.character.spine as unknown as { renderable: boolean }).renderable = false;
      }
    }

    // ── 11b: render bridge + controller ──
    // fx wraps the live actors; controller drives the sim and pushes into fx.
    // Mission C2 — side-channel Rng for crit visuals. SEPARATE from the rig's Rng (which
    // CombatController consumes for deck/slot/scare ordering) so crit visuals never
    // perturb deterministic rig behaviour. XORed seed offset keeps the crit pattern
    // deterministic per fight but independent of the rig sequence.
    const critRng = mulberry32(this.cfg.rngSeed ^ 0x9E3779B9);
    this.fx = new CombatFx(this.battleArea, this.ticker, hero, enemies, this.cfg.combatSpeed, critRng);
    await this.fx.preload(); // warm the hit-VFX spritesheet before the first flash()
    this.controller = new CombatController(this.cfg, this.fx, this.cfg.rngSeed);
    if (this.onVolley) this.controller.setOnVolley(this.onVolley);

    // ── 11b: UI views ──
    // Mounted on this.container (NOT battleArea) so the angled battle mask never clips
    // them. Constructed once; layoutUi() positions them in enter() + layout().
    // PIXI v8: each widget's textures MUST be Assets.load-ed before construction —
    // a Sprite built from an un-loaded Texture.from(url) draws nothing.
    await Promise.all([
      SkillPanel.preload(), CoinMeter.preload(), SkillSlots.preload(), SkillQueue.preload(), CoachHand.preload(),
    ]);

    // The bottom UI is authored at a fixed intrinsic pixel size, then the whole
    // assembly is scaled to fit the screen in layoutUi(). Intrinsic dims:
    const panelW = SLOTS_ROW_W + PANEL_PAD * 2;            // panel wraps the slot row + padding
    const panelH = this.intrinsicPanelHeight();
    const barW = panelW - PANEL_PAD * 2 - this.coinBarInset(); // bar leaves room for the overlapping disk

    this.panel = new SkillPanel(panelW, panelH);
    this.coinMeter = new CoinMeter(barW);
    this.tray = new SkillQueue();
    this.slots = new SkillSlots((i) => this.onPick(i));
    this.coach = new CoachHand();
    // z-order: battleArea + mask are already on this.container; panel is the backdrop,
    // then the coin bar + slot cards on top of it, then the tray, then the coach.
    this.panel.addChild(this.coinMeter, this.slots);
    this.container.addChild(this.panel, this.tray, this.coach);

    this.layoutUi(this.width, this.height);

    // ── Prominent TOP-CENTER boss HP bar overlay (default, every build) ──
    // Added to this.container (above the battle viewport + bottom UI) and laid out at the top
    // of the screen, well clear of the per-actor HP bars (which sit on the characters down in
    // the battle viewport). Tracks enemies[0] (the boss). The boss's own on-character HP bar is
    // hidden below since this prominent bar replaces it.
    const boss = this.bossActor();
    if (boss) {
      await BossHpBar.preload();
      this.bossBar = new BossHpBar(boss.maxHp);
      this.container.addChild(this.bossBar.container);
      this.bossBar.layout(this.width, this.height, safeAreaTop());
      // Hide the boss's redundant on-character HP bar (the hero + minion bars stay). visible=false
      // survives the re-adds in layoutActors() (which never touch .visible).
      boss.hpBar.container.visible = false;
    }

    // ?ui=off — stop drawing the whole bottom assembly (panel + slots + cards + coin
    // meter + tray + coach) to A/B whether the always-on UI layer is the cost.
    if (perf.noUi) {
      this.panel.renderable = false;
      this.tray.renderable = false;
      this.coach.renderable = false;
    }

    // ── Onboarding overlay (uniform scrim + lifted pulsing hex clone + card + coach) ──
    // Built ABOVE panel/tray/coach so the dim composites over the whole scene. A bright
    // pulsing clone of the cheapest slot's hex card sits above the scrim (its hexagon
    // silhouette means no rectangle is revealed); the coach points at it. The idle
    // auto-pick clock is NOT armed until the overlay reaches `shown` (see updateOnboarding).
    if (this.cfg.gateFightUntilFirstPick) {
      this.buildOnboarding();
    } else {
      // No onboarding (e.g. the lose-variant win-retry): the player already learned the mechanic.
      // Mark the tutorial done so the coach stays hidden, and arm the idle auto-pick clock directly
      // (normally done when the onboarding overlay reaches 'shown') so an idle viewer still auto-builds.
      this.firstPickDone = true;
      this.controller!.beginOnboarding();
    }

    this.ready = true;

    // __DEV__ E2E bridge. Installed here (not in index.ts) because the live
    // CombatController is constructed asynchronously inside enter() — index.ts
    // can't reach it synchronously. The Task 16 Playwright E2E reads live state
    // through window.__clashRoyal and routes taps through the real controller
    // (so affordability + cast-in-flight gating still applies). Whole block is
    // tree-shaken out of production builds by the __DEV__ DefinePlugin guard.
    if (__DEV__) this.installDevBridge();
  }

  /** __DEV__-only: expose a live read/route bridge for the Task 16 E2E. */
  private installDevBridge(): void {
    const controller = this.controller;
    if (!controller) return;
    const scene = this; // captured for getters where `this` binds to the bridge object literal
    window.__clashRoyal = {
      get state(): string {
        // 'endcard' once the director has mounted the end card; 'won' the moment
        // the controller reports victory; 'combat' while the fight is live.
        if (this.endCardShownRef()) return 'endcard';
        if (controller.isDefeat()) return 'defeat';
        return controller.isVictory() ? 'won' : 'combat';
      },
      get coins(): number { return controller.coins; },
      get slots(): (SlotEntry | null)[] { return controller.slotsSnapshot(); },
      get enemiesAlive(): number { return controller.enemiesAlive(); },
      // RENDERED boss HP — read straight off the boss FightActor's bar value (NOT the rig),
      // because the bug was the DISPLAY bar reading 0 while the rig held the boss at 1.
      get bossHp(): number { return scene.enemies[0] ? Math.round(scene.enemies[0].hp) : -1; },
      // RENDERED hero HP — the value the hero's bar shows. Used to assert hero HP only reaches 0
      // at/after the boss's killing blow (never mid-combat before the defeat latch).
      get heroHp(): number { return scene.hero ? Math.round(scene.hero.hp) : -1; },
      // Track-0 anim names straight off the live Spine state. The flow harness asserts heroAnim
      // sits in a Die anim (never Idle) once the hero is dead — the "hero revives" leak — and that
      // the boss never plays a death anim in the lose flow.
      get heroAnim(): string | null { return scene.hero?.character.spine.state.tracks[0]?.animation?.name ?? null; },
      get heroDead(): boolean { return !!scene.hero?.dead; },
      get bossAlive(): boolean { return !scene.enemies[0]?.dead; },
      get bossAnim(): string | null { return scene.enemies[0]?.character.spine.state.tracks[0]?.animation?.name ?? null; },
      // Transient VFX still live on the battle layer (CombatFx.liveVfxCount) — see that method.
      get liveVfxCount(): number { return scene.fx ? scene.fx.liveVfxCount() : -1; },
      // Ids currently offered in the 3 slots (null per empty slot). Asserts 'heal' presence per flow.
      get slotSkillIds(): (string | null)[] { return controller.slotsSnapshot().map(s => s?.skill.id ?? null); },
      // Onboarding scrim still mounted on the scene container AND not yet faded out. The retry
      // (gateFightUntilFirstPick=false) never builds it, so this stays false there.
      get onboardingActive(): boolean { return !!scene.tutorialLayer && scene.tutorialLayer.parent != null && scene.onboardPhase !== 'done'; },
      get deck(): string[] { return controller.deckList(); },
      get deckEntries(): { id: string; stack: number }[] { return controller.deckEntries(); },
      affordable: (): number[] => controller.affordableSlots(),
      // Route through the scene's pick path so E2E picks also fly + add the tray tile +
      // dismiss onboarding (a raw controller.tapSlot would skip all the UI wiring). For a
      // duplicate-id pick this also routes to the merge flow (tray.merge + burst).
      tapSlot: (i: number): boolean => {
        const beforeEntries = controller.deckEntries();
        const beforeId = controller.slotsSnapshot()[i]?.skill.id;
        this.onPick(i);
        const afterEntries = controller.deckEntries();
        // Accept if the deck grew (new) OR an existing entry's stack went up (merge).
        if (afterEntries.length > beforeEntries.length) return true;
        const before = beforeEntries.find(e => e.id === beforeId);
        const after = afterEntries.find(e => e.id === beforeId);
        return !!(before && after && after.stack > before.stack);
      },
      forceOffer: (skillId: string, slotIndex: number): boolean => controller.forceOffer(skillId, slotIndex),
      // Mission J — deterministic VFX capture hook. Fires ONE cosmetic cast directly through
      // the bridge (real playCast → real handler), bypassing coins/cooldown/deck so a
      // screenshot harness can catch a specific family's VFX (e.g. the lightning bolt arc)
      // without the live fight's cast-timing jitter. Cosmetic only — does not touch the rig.
      fireVfx: (vfxId: string, tier: number): boolean => {
        if (!this.fx) return false;
        // heal is the only self-target vfx — route it as isSelf so the handler resolves
        // the hero (and the heal "+" particle burst spawns on the hero, not an enemy).
        const isSelf = vfxId === 'heal';
        void this.fx.playCast(vfxId, tier, 0, isSelf, 80, () => {});
        return true;
      },
      // Internal: lets the `state` getter see the scene's endCardShown flag without
      // capturing `this` in the getter's own dynamic scope.
      endCardShownRef: (): boolean => this.endCardShown,
    };
  }

  /** __DEV__ hook: the director calls this once the end card mounts so the bridge
   *  `state` getter reports 'endcard'. No-op (and undefined) effect in production. */
  markEndCardShown(): void {
    this.endCardShown = true;
  }

  // ── Pick path ─────────────────────────────────────────────────────
  /** Player (or E2E / dev-bridge) picks slot `i`: gate through the controller, then fly the
   *  icon to the deck, add the tray tile (NEW) OR merge into the existing tile (DUPE), and
   *  dismiss the onboarding on the very first pick. The controller is the single source of
   *  truth — we snapshot deckEntries BEFORE + AFTER tapSlot to detect merge vs new. */
  private onPick(i: number): void {
    const id = this.controller!.slotsSnapshot()[i]?.skill.id;
    if (!id) return;
    // Snapshot the deck entry for THIS id before the tap. If it exists, an accept will be a
    // MERGE; if it doesn't, an accept will be a NEW unique entry. (A rejected tap leaves
    // entries unchanged → no UI change either.)
    const before = this.controller!.deckEntries().find(e => e.id === id);
    if (!this.controller!.tapSlot(i)) return;
    const after = this.controller!.deckEntries().find(e => e.id === id);
    if (!after) return; // defensive — shouldn't happen on a true accept
    const isMerge = before !== undefined; // tile already existed → this was a merge

    if (isMerge) {
      // MERGE: fly a card from the slot to the EXISTING tile, then on landing the tray pops
      // the badge + plays the burst. No slide of other tiles (deck size unchanged).
      sfx.cardMerge();
      const flying = this.flyToDeck(i, id, /* merge */ true);
      if (!flying) this.tray!.merge(id); // fallback: merge immediately
    } else {
      // NEW unique tile: the smooth slide of existing tiles runs inside addToDeck. Defer the
      // tile pop until the fly clone lands so the read is "the card became the deck tile."
      const flying = this.flyToDeck(i, id, /* merge */ false);
      this.tray!.addToDeck(id, /* deferPop */ flying);
      if (!flying) this.tray!.popDeferred(id); // safety: reveal now if nothing is flying
    }
    if (!this.firstPickDone) { this.firstPickDone = true; this.dismissOnboarding(); }
  }

  /** Cool A→B flourish: a real full-color hex CARD (reusing SkillSlots.buildSpotlightCard,
   *  guaranteeing a valid on-theme visual) arcs from the picked slot's world center UP into
   *  its deck-tile slot, scaling slot-size→tile-size with a little spin, then reveals+pops
   *  the deferred deck tile and destroys itself on landing. Added LAST to this.container so
   *  it renders above the panel + tray. Returns true if a flight was spawned (caller defers
   *  the tile pop) or false if not (caller reveals the tile immediately). Never throws. */
  private flyToDeck(i: number, id: string, merge: boolean): boolean {
    if (!this.panel || !this.slots || !this.tray) return false;
    // Don't stack a second flight for the same id (a flight already in transit will deliver
    // a tile/merge for this id; a parallel flight would land into the same slot redundantly).
    if (this.flyTweens.some(f => f.id === id)) return false;

    // Slot (source) center in this.container coords (same transform as the coach hand).
    const c = this.slots.slotCenter(i);
    const sx = this.panel.x + this.panel.scale.x * (this.slots.x + c.x);
    const sy = this.panel.y + this.panel.scale.y * (this.slots.y + c.y);

    // Deck-tile (destination) center.
    //  - MERGE: target the EXISTING tile's live center via tileCenter().
    //  - NEW unique: the new tile is appended in addToDeck (called AFTER flyToDeck in the new
    //    pick path) — but since merge picks call flyToDeck WITHOUT first calling addToDeck,
    //    and new picks call it BEFORE addToDeck, tileCenter would return {0,0} in the NEW
    //    case. So for NEW we compute the would-be position from the next index ourselves.
    let dxLocal: number; let dyLocal: number;
    if (merge) {
      const t = this.tray.tileCenter(id);
      dxLocal = t.x; dyLocal = t.y;
    } else {
      // Would-be new tile is at the (current-count + 1)th slot in a centered row.
      const n = this.tray.ids().length + 1;
      const TILE_W = 52; const TILE_GAP = 12;
      const rowW = n * TILE_W + (n - 1) * TILE_GAP;
      const startX = -rowW / 2 + TILE_W / 2;
      dxLocal = startX + (n - 1) * (TILE_W + TILE_GAP);
      dyLocal = 0;
    }
    const dx = this.tray.x + dxLocal;
    const dy = this.tray.y + dyLocal;

    // The flying card is a REAL hex card for this tier (Bg+Border+icon) — same builder the
    // onboarding spotlight uses, so it's a guaranteed-valid, on-theme visual (sidesteps the
    // missing/EMPTY-texture class of bug entirely).
    let card: Container;
    try {
      card = this.slots.buildSpotlightCard(id);
    } catch {
      return false; // builder unavailable (textures not preloaded) — caller pops tile now
    }
    // The spotlight card is authored at SLOT_BOX_H scale (=1.0 here). On-screen the live slot
    // is rendered at panel.scale, and the deck tile is ~TILE_SIZE(64)/SLOT_BOX_H(150)≈0.43 of
    // that intrinsic size. So fly from the slot's on-screen scale DOWN to the tile's size.
    const fromScale = this.panel.scale.x;          // matches the on-screen slot card size
    const toScale = this.panel.scale.x * (64 / SLOT_BOX_H); // matches the deck-tile size
    card.position.set(sx, sy);
    card.scale.set(fromScale);
    this.container.addChild(card); // LAST child → renders above panel + tray + everything

    this.flyTweens.push({
      node: card, id, elapsed: 0, dur: 380,
      sx, sy, dx, dy, fromScale, toScale,
      spin: (Math.random() < 0.5 ? -1 : 1) * 0.5, // ~±0.5 rad total wobble spin
      merge,
    });
    return true;
  }

  /** Drive the active fly-to-deck tweens. Cool motion: ease-in-out-cubic on x/y with an
   *  upward ARC overshoot (the card lofts above the straight line then settles), scale
   *  from slot-size→tile-size, a small spin that unwinds to 0 on land, and alpha that
   *  holds ~1 then snaps out in the final 15%. On landing: reveal+pop the deferred deck
   *  tile and destroy the clone, so the flight becomes the tile. */
  private updateFlyTweens(deltaMS: number): void {
    if (this.flyTweens.length === 0) return;
    for (let n = this.flyTweens.length - 1; n >= 0; n--) {
      const f = this.flyTweens[n];
      f.elapsed += deltaMS;
      const u = Math.min(1, f.elapsed / f.dur);
      // ease-in-out cubic for the base linear interpolation along the path.
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const baseX = f.sx + (f.dx - f.sx) * e;
      const baseY = f.sy + (f.dy - f.sy) * e;
      // Upward arc: a parabola peaking mid-flight (max at u=0.5), lofting the card ABOVE the
      // straight slot→deck line so it reads as a thrown card, not a slide.
      const arc = Math.sin(Math.PI * u);
      const liftPx = Math.min(120, Math.abs(f.sy - f.dy) * 0.45 + 40);
      f.node.position.set(baseX, baseY - arc * liftPx);
      // scale slot-size → tile-size; spin unwinds to 0 as it lands (1-e weights it out).
      f.node.scale.set(f.fromScale + (f.toScale - f.fromScale) * e);
      f.node.rotation = f.spin * (1 - e) * arc;
      // alpha holds ~1, snaps out over the final 15% so the clone vanishes as the tile pops.
      f.node.alpha = u < 0.85 ? 1 : 1 - (u - 0.85) / 0.15;
      if (u >= 1) {
        // Landing: for a NEW pick reveal + pop the deferred deck tile; for a MERGE pick play
        // the merge animation on the existing tile (badge swap + tier-burst). Either way,
        // destroy the clone — the flight "becomes" the tile / "feeds" the existing tile.
        if (f.merge) this.tray?.merge(f.id);
        else this.tray?.popDeferred(f.id);
        f.node.destroy({ children: true });
        this.flyTweens.splice(n, 1);
      }
    }
  }

  // ── Onboarding overlay ────────────────────────────────────────────
  /** Build the uniform scrim + a bright pulsing hex CLONE over the cheapest slot + tutorial
   *  card + put the coach on the spotlit slot. Added to a top-level tutorialLayer ABOVE
   *  panel/tray/coach. The clone's hexagon silhouette means no rectangle is ever revealed. */
  private buildOnboarding(): void {
    if (!this.controller || !this.slots) return;
    this.spotlightIndex = this.cheapestSlotIndex();

    const layer = new Container();
    layer.alpha = 0;
    const scrim = new Graphics();
    // eventMode 'none' so taps pass THROUGH the scrim to the slots underneath (the spotlight
    // clone is purely visual; the slot itself stays the live tap target).
    scrim.eventMode = 'none';
    layer.addChild(scrim);

    // Bright pulsing hex clone of the spotlit slot, lifted ABOVE the scrim. Its hexagon
    // silhouette is the only bright thing over the uniform dim — no rectangle behind it.
    const spotId = this.controller.slotsSnapshot()[this.spotlightIndex]?.skill.id;
    let spotlightCard: Container | undefined;
    if (spotId) {
      spotlightCard = this.slots.buildSpotlightCard(spotId);
      spotlightCard.eventMode = 'none'; // visual only — taps fall through to the real slot
      layer.addChild(spotlightCard);
    }

    const card = this.buildOnboardingCard();
    layer.addChild(card);

    // z-order: tutorialLayer above everything; the coach must render above the scrim so the
    // finger is visible over the spotlit slot — re-add it on top of the layer's parent.
    this.container.addChild(layer);
    if (this.coach) this.container.addChild(this.coach); // lift the coach above the scrim

    this.tutorialLayer = layer;
    this.scrim = scrim;
    this.tutorialCard = card;
    this.spotlightCard = spotlightCard;
    this.onboardPhase = 'pending';
    this.onboardElapsed = 0;
    this.layoutOnboarding();
  }

  /** Index of the cheapest-cost slot (SlotModel keeps slots cost-ascending, but compute it). */
  private cheapestSlotIndex(): number {
    const snap = this.controller!.slotsSnapshot();
    let idx = 0;
    let min = Infinity;
    for (let i = 0; i < snap.length; i++) {
      const cost = snap[i]?.skill.cost ?? Infinity;
      if (cost < min) { min = cost; idx = i; }
    }
    return idx;
  }

  /** Port of BlackjackScene.buildTutorialCard: rounded panel + big title + wrapped body. */
  private buildOnboardingCard(): Container {
    const card = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, ONBOARD_CARD_W, ONBOARD_CARD_H, 24);
    bg.fill({ color: 0xfff6dc, alpha: 0.97 });
    bg.stroke({ color: 0x181008, width: 4 });
    card.addChild(bg);

    const title = new Text({ text: this.cfg.onboarding.title, style: ONBOARD_TITLE_STYLE });
    title.anchor.set(0.5, 0);
    title.position.set(ONBOARD_CARD_W / 2, 26);
    card.addChild(title);

    const body = new Text({ text: this.cfg.onboarding.body, style: ONBOARD_BODY_STYLE });
    body.anchor.set(0.5, 0);
    body.position.set(ONBOARD_CARD_W / 2, 86);
    card.addChild(body);

    return card;
  }

  /** Recompute the uniform scrim + reposition the bright spotlight clone over the spotlit
   *  slot + center the card. Called from buildOnboarding + layoutUi (on relayout). Safe
   *  before the overlay exists / after dismiss. */
  private layoutOnboarding(): void {
    if (!this.scrim || !this.panel || !this.slots) return;
    const W = this.width;
    const H = this.height;

    // UNIFORM full-screen dim — NO hole. The bright spotlight clone sits ON TOP of this, so
    // its hexagon is the only thing that reads bright (no rectangular reveal behind the hex).
    this.scrim.clear();
    this.scrim.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.6 });

    // Position the bright hex clone exactly over the spotlit slot's world center (same panel
    // transform the coach hand uses). Match its on-screen size by scaling to the panel scale
    // (the live slots are scaled only by the panel; slots.scale is 1). The pulse oscillates
    // around this base in updateOnboarding.
    if (this.spotlightCard) {
      const c = this.slots.slotCenter(this.spotlightIndex);
      this.spotlightCard.x = this.panel.x + this.panel.scale.x * (this.slots.x + c.x);
      this.spotlightCard.y = this.panel.y + this.panel.scale.y * (this.slots.y + c.y);
      this.spotlightBaseScale = this.panel.scale.x;
      this.spotlightCard.scale.set(this.spotlightBaseScale);
    }

    if (this.tutorialCard) {
      // Center the card horizontally; place it in the upper/middle band above the panel.
      const cardY = Math.min(this.panel.y - ONBOARD_CARD_H - 24, H * 0.34);
      this.tutorialCard.position.set((W - ONBOARD_CARD_W) / 2, Math.max(40, cardY));
    }
  }

  /** Onboarding state machine (ported from BlackjackScene.updateTutorial): pending → fadeIn →
   *  shown → fadeOut → done. Arms the idle auto-pick clock ONLY when it enters `shown`. */
  private updateOnboarding(deltaMS: number): void {
    if (this.onboardPhase === 'done' || !this.tutorialLayer) return;
    this.onboardElapsed += deltaMS;

    // Gentle ~6% spotlight pulse while the overlay is fading in or shown. Oscillate the
    // clone's scale around its on-screen base (panel scale) so the bright hexagon breathes.
    if (this.spotlightCard && (this.onboardPhase === 'fadeIn' || this.onboardPhase === 'shown')) {
      const pulse = 1 + SPOTLIGHT_PULSE_AMP * Math.sin(this.onboardElapsed / SPOTLIGHT_PULSE_PERIOD);
      this.spotlightCard.scale.set(this.spotlightBaseScale * pulse);
    }

    if (this.onboardPhase === 'pending') {
      // Drop the overlay in immediately on the first tick.
      this.onboardPhase = 'fadeIn';
      this.onboardElapsed = 0;
      return;
    }
    if (this.onboardPhase === 'fadeIn') {
      const a = Math.min(1, this.onboardElapsed / ONBOARD_FADE_MS);
      this.tutorialLayer.alpha = a;
      if (a >= 1) {
        this.onboardPhase = 'shown';
        this.onboardElapsed = 0;
        // Arm the idle auto-pick 7s clock NOW (not before the overlay is shown).
        this.controller!.beginOnboarding();
      }
      return;
    }
    if (this.onboardPhase === 'fadeOut') {
      const a = Math.max(0, 1 - this.onboardElapsed / ONBOARD_FADE_MS);
      this.tutorialLayer.alpha = a;
      if (a <= 0) {
        this.onboardPhase = 'done';
        this.tutorialLayer.destroy({ children: true });
        this.tutorialLayer = undefined;
        this.scrim = undefined;
        this.tutorialCard = undefined;
        this.spotlightCard = undefined; // destroyed with the layer's children above
      }
      return;
    }
    // 'shown' is steady-state — nothing to do per frame.
  }

  /** Begin tearing down the onboarding overlay (→ fadeOut → done) and hide the coach for good.
   *  Called on the first pick from any path (manual tap / dev bridge / idle auto-pick). */
  private dismissOnboarding(): void {
    sfx.click();
    this.coach?.hide();
    // If the overlay is shown but the auto-pick clock was never armed (dismissed during
    // fadeIn, before reaching `shown`), arm it now so the deck still auto-fires afterward.
    if (this.onboardPhase === 'fadeIn' || this.onboardPhase === 'pending') {
      this.controller?.beginOnboarding();
    }
    if (this.onboardPhase === 'fadeOut' || this.onboardPhase === 'done') return;
    this.onboardPhase = 'fadeOut';
    this.onboardElapsed = 0;
  }

  async exit(): Promise<void> {
    this.ready = false;
    if (__DEV__ && window.__clashRoyal) delete window.__clashRoyal;
    this.fx?.destroy();
    // Tear down any in-flight fly-to-deck cosmetics + the onboarding overlay.
    for (const f of this.flyTweens) f.node.destroy({ children: true });
    this.flyTweens.length = 0;
    this.tutorialLayer?.destroy({ children: true });
    this.tutorialLayer = this.scrim = this.tutorialCard = this.spotlightCard = undefined;
    // Tear down the UI views. The panel owns the coinMeter + slots as children, so
    // destroying it with {children:true} tears those down too — don't double-destroy them.
    this.panel?.destroy({ children: true });
    this.tray?.destroy({ children: true });
    this.coach?.destroy({ children: true });
    this.panel = this.coinMeter = this.tray = this.slots = this.coach = undefined;
    this.bossBar?.destroy();
    this.bossBar = undefined;
    this.destroyActors();
    // Tear down the 11a viewport graphics (background sprite + angled battle mask). Detach
    // the mask first so PIXI doesn't hold a destroyed Graphics as battleArea.mask, then
    // destroy both null-safe (enter() may not have run, or exit() may be called twice).
    if (this.battleArea.mask) this.battleArea.mask = null;
    this.bgSprite?.destroy();
    this.battleMask?.destroy();
  }

  update(deltaMS: number): void {
    // Pre-enter (or post-exit) update is a no-op: nothing to drive yet.
    const controller = this.controller;
    if (!controller || !this.coinMeter || !this.slots || !this.coach) return;

    // 1) advance the sim.
    controller.step(deltaMS);

    // 1a) AppLovin funnel — fire the playthrough milestones as the fight progresses (boss +
    // minion HP whittled). alTrack dedupes, so calling every frame past a threshold fires each
    // exactly once. CHALLENGE_STARTED was already emitted by the director, so ordering holds.
    const prog = controller.challengeProgress();
    if (prog >= 0.25) alTrack('CHALLENGE_PASS_25');
    if (prog >= 0.50) alTrack('CHALLENGE_PASS_50');
    if (prog >= 0.75) alTrack('CHALLENGE_PASS_75');

    // 1b) reconcile the tray with the deck: the idle auto-pick (and any controller-internal
    // pick) adds to the deck WITHOUT routing through onPick, so the tray would miss those
    // tiles + merges. For NEW ids, addToDeck (deduped) creates the tile. For MERGES (the
    // entry's stack advanced past the tray's tracked stack), call merge() to drive the badge
    // swap + tier burst. Also dismiss onboarding if the deck became non-empty by any path.
    //
    // IMPORTANT: skip merge catch-up for ids that have an in-flight fly tween — that fly
    // will call tray.merge(id) on landing, and a parallel catch-up here would double-merge
    // (advancing the tile's stack past the controller's truth + lighting an extra star).
    const deck = controller.deckList();
    for (const id of deck) this.tray!.addToDeck(id);
    for (const e of controller.deckEntries()) {
      const flying = this.flyTweens.some(f => f.id === e.id);
      if (flying) continue;
      // If the controller's stack is higher than what the tray rendered, catch up — once per
      // missed merge. Bounded by MAX_STACK=4 so the loop is finite.
      while (this.tray!.stackOf(e.id) > 0 && this.tray!.stackOf(e.id) < e.stack) {
        this.tray!.merge(e.id);
      }
    }
    // Advance the tray's own per-frame tweens (slide, pop, badge-pop, merge bursts).
    this.tray!.render(deltaMS);
    if (!this.firstPickDone && deck.length > 0) { this.firstPickDone = true; this.dismissOnboarding(); }

    // 2) refresh the coin meter.
    this.coinMeter.setCoins(controller.coins, this.cfg.coin.max);

    // 2a) mirror the boss's live HP onto the prominent top-center bar.
    const boss = this.bossActor();
    if (this.bossBar && boss) this.bossBar.setHp(boss.hp);

    // 3) refresh the slot row (icons, cost, bottom-up charge fill + unlock pop). Pass the
    //    current deck-stack of each offered skill so the slot card's upgrade-row stars
    //    reflect "picking this will land you at stack N+1" before the tap.
    const snapshot = controller.slotsSnapshot();
    const affordable = controller.affordableSlots();
    const slotStacks: number[] = [];
    const entries = controller.deckEntries();
    for (let i = 0; i < snapshot.length; i++) {
      const id = snapshot[i]?.skill.id;
      const e = id ? entries.find(x => x.id === id) : undefined;
      slotStacks.push(e ? e.stack : 0);
    }
    this.slots.render(snapshot, [0, 1, 2].map(i => controller.slotCharge(i)), deltaMS, slotStacks);

    // 4) coach hand. DURING onboarding it points at the spotlit (cheapest) slot; AFTER the
    // first pick it's gone permanently (dismissOnboarding hid it). Gate the per-frame
    // "point at cheapest affordable" logic behind !firstPickDone so it never reappears.
    if (!this.firstPickDone) {
      // While the overlay is up, lock the coach on the spotlit slot (computed in
      // buildOnboarding); once it's down (auto-pick path can dismiss before a tap),
      // fall back to the cheapest-affordable slot so the hint still guides.
      let target = this.onboardPhase !== 'done' ? this.spotlightIndex : -1;
      if (target < 0) {
        let cheapestCost = Infinity;
        for (const i of affordable) {
          const cost = snapshot[i]?.skill.cost ?? Infinity;
          if (cost < cheapestCost) { cheapestCost = cost; target = i; }
        }
      }
      if (target >= 0 && this.panel) {
        const c = this.slots.slotCenter(target);
        // slotCenter is SkillSlots-LOCAL. The slot row lives inside the panel (which is the
        // only scaled node; slots.scale is 1), so transform: panel.pos + panel.scale * (slots.pos + c)
        // to land in this.container coords (the coach's parent).
        this.coach.pointAt(
          this.panel.x + this.panel.scale.x * (this.slots.x + c.x),
          this.panel.y + this.panel.scale.y * (this.slots.y + c.y),
        );
      } else {
        this.coach.hide();
      }
    }

    // 5) drive the coach pulse animation + the onboarding state machine + fly tweens.
    this.coach.update(deltaMS);
    this.updateOnboarding(deltaMS);
    this.updateFlyTweens(deltaMS);

    // 6) victory→end-card handoff. Once the controller reports victory, accumulate a hold
    // timer (the controller.step above already early-returns post-victory, so the sim is
    // effectively frozen) and resolve `done` exactly once after VICTORY_HOLD_MS — this is
    // the signal the director (Task 15) waits on to swap in the end card. The doneResolved
    // guard makes resolveDone() unrepeatable even though update() keeps ticking.
    if (controller.isVictory() && !this.doneResolved) {
      this.victoryHoldMs += deltaMS;
      if (this.victoryHoldMs >= VICTORY_HOLD_MS) {
        this.doneResolved = true;
        this.resolveDone();
      }
    }

    // Lose path: hold on the death (sim already frozen — step early-returns on defeat) then resolve
    // `done` once, carrying the 'defeat' outcome the director reads via result().
    if (controller.isDefeat() && !this.doneResolved) {
      this.defeatHoldMs += deltaMS;
      if (this.defeatHoldMs >= DEFEAT_HOLD_MS) {
        this.outcomeResult = 'defeat';
        this.doneResolved = true;
        this.resolveDone();
      }
    }
  }

  pause(): void {
    this.container.interactiveChildren = false;
  }

  resume(): void {
    this.container.interactiveChildren = true;
  }

  layout(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (!this.ready) return;
    this.drawBattleMask();
    this.layoutBg();
    this.layoutActors();
    this.layoutUi(width, height);
  }

  // ── UI layout ─────────────────────────────────────────────────────
  /** Horizontal room reserved at the bar's left so the bigger coin disk can overlap it. */
  private coinBarInset(): number {
    return 30;
  }

  /** Coin bar height (tracks its width in CoinMeter: barH = width * 0.135). */
  private coinBarHeight(): number {
    return (SLOTS_ROW_W + PANEL_PAD * 2 - this.coinBarInset()) * 0.135;
  }

  /** Intrinsic (pre-scale) panel height: padding + slot card (with cost badge) + coin bar. */
  private intrinsicPanelHeight(): number {
    // SkillSlots portrait box SLOT_BOX_H (150) + cost badge below (BADGE_GAP 10 + COIN_SIZE 30).
    const slotBlock = SLOT_BOX_H + SLOT_BADGE_BLOCK;
    const innerGap = 22;
    return PANEL_PAD * 2 + slotBlock + innerGap + this.coinBarHeight() + 6;
  }

  /** Lay out the bottom UI: the panel (with slot cards + coin bar nested inside it),
   *  the rarity tray, and leave the coach to update(). Safe before construction. */
  private layoutUi(width: number, height: number): void {
    const panelW = SLOTS_ROW_W + PANEL_PAD * 2;
    const panelH = this.intrinsicPanelHeight();

    if (this.panel) {
      // Scale the whole panel assembly so it never exceeds PANEL_W_FRAC of the screen.
      const targetW = width * PANEL_W_FRAC;
      const s = panelW > targetW ? targetW / panelW : 1;
      this.panel.scale.set(s);
      // Top-anchored at PANEL_TOP_FRAC, horizontally centered.
      const drawnW = panelW * s;
      this.panel.position.set((width - drawnW) / 2, height * PANEL_TOP_FRAC);

      // Children are panel-LOCAL (origin = panel top-left). Center the slot row in the
      // upper area; place the coin bar across the lower area. slotCenter is the hex BOX
      // center; the cost badge hangs SLOT_BADGE_BLOCK below it (inside the slotBlock).
      const slotRowCY = PANEL_PAD + SLOT_BOX_H / 2;  // hex box vertical center
      if (this.slots) {
        this.slots.scale.set(1);
        this.slots.position.set(panelW / 2, slotRowCY);
      }
      if (this.coinMeter) {
        // Coin bar spans the panel width below the slots; the disk overlaps its left end,
        // so inset the bar's left origin by the disk overhang and sit it near the bottom.
        const barH = this.coinBarHeight();
        const barY = panelH - PANEL_PAD - barH;
        this.coinMeter.position.set(PANEL_PAD + this.coinBarInset(), barY);
      }
    }

    // SkillQueue rarity tray: small centered row just under the battle scene.
    if (this.tray) {
      this.tray.position.set(width / 2, height * TRAY_Y_FRAC);
    }

    // CoachHand: overlay; its position is driven each frame in update(). Nothing to do.

    // Recompute the onboarding scrim + spotlight-clone + card placement against the new panel transform.
    this.layoutOnboarding();

    // Re-anchor the top-center boss bar against the new screen size + current safe-area inset
    // (re-read so an orientation change that changes the notch position is honoured).
    this.bossBar?.layout(width, height, safeAreaTop());
  }

  // ── Viewport (ported from board-fight FightScene.ts) ──────────────

  /** Angled-bottom mask for the battle viewport (FightScene.ts:184-193). */
  private drawBattleMask(): void {
    const battleH = this.height * BATTLE_AREA_RATIO;
    const skew = this.height * BATTLE_SKEW;
    this.battleMask.clear();
    this.battleMask.poly([
      0, 0, this.width, 0,
      this.width, battleH - skew,
      0, battleH + skew,
    ]).fill({ color: 0xffffff });
  }

  /** Center + scale the background sprite to fill the battle area (FightScene.ts:195-209). */
  private layoutBg(): void {
    const battleH = this.height * BATTLE_AREA_RATIO;
    this.bgSprite.anchor.set(0.5, 0.5);
    this.bgSprite.scale.set(0.34);
    this.bgSprite.x = this.width / 2;
    this.bgSprite.y = battleH / 2;
  }

  // ── Actor layout / teardown (ported from board-fight FightEngine.ts) ──

  /** Position every actor + set homeX/homeY (FightEngine.layoutActors ~268-325).
   *  Sets spine.position, spine.scale, homeX/homeY, and lays out the hp/rage bars. */
  private layoutActors(): void {
    const bw = this.width;
    const bh = this.height * BATTLE_AREA_RATIO;
    const charScale = DEFAULT_CHAR_SCALE;
    const barW = 70;
    const barH = 8;
    const isLandscape = bw > bh * 2;
    const fullHeight = bh / BATTLE_AREA_RATIO;
    const isPortrait = fullHeight > bw;
    const portraitYOffset = isPortrait ? -bh * 0.1 : 0;
    const enemyYOffset = isLandscape ? -bh * 0.08 : 0;

    if (this.hero) {
      const actor = this.hero;
      const x = bw * PLAYER_X_FRAC;
      const y = bh * CHARACTER_Y_FRAC + portraitYOffset;
      actor.character.spine.position.set(x, y);
      actor.character.spine.scale.set((actor.config.scale ?? actor.config.spine.defaultScale ?? charScale) * CHAR_SCALE_MULT);
      actor.homeX = x;
      actor.homeY = y;
      actor.hpBar.layout(x, y + 10, barW, barH);
      if (actor.rageBar) {
        actor.rageBar.layout(x, y + 10 + barH + 2, barW, Math.max(6, barH * 0.7));
      }
    }

    for (const actor of this.enemies) {
      const i = actor.index;
      const x = bw * (ENEMY_X_FRAC + i * CHAR_STAGGER_X);
      const y = bh * (CHARACTER_Y_FRAC + i * CHAR_STAGGER_Y) + enemyYOffset + portraitYOffset;
      actor.character.spine.position.set(x, y);
      actor.character.spine.scale.set((actor.config.scale ?? actor.config.spine.defaultScale ?? charScale) * CHAR_SCALE_MULT);
      actor.homeX = x;
      actor.homeY = y;
      actor.hpBar.layout(x, y + 10, barW, barH);
      if (actor.rageBar) {
        actor.rageBar.layout(x, y + 10 + barH + 2, barW, Math.max(6, barH * 0.7));
      }
    }

    // Depth sort: lower enemies render in front; then re-add the hero on top.
    const sorted = [...this.enemies].sort((a, b) => a.homeY - b.homeY);
    for (const actor of sorted) actor.addTo(this.battleArea);
    if (this.hero) this.hero.addTo(this.battleArea);
  }

  /** Destroy all actors, freeing Spine physics + VRAM (FightEngine.destroyActors ~256-265). */
  private destroyActors(): void {
    const all = this.hero ? [this.hero, ...this.enemies] : [...this.enemies];
    for (const actor of all) {
      actor.character.unequipWeapon();
      actor.character.spine.destroy();
      actor.hpBar.container.destroy({ children: true });
      actor.rageBar?.container.destroy({ children: true });
    }
    this.enemies.length = 0;
  }
}

// ── Safe-area inset ─────────────────────────────────────────────────────────
// Top safe-area inset (device camera notch / Dynamic Island / status bar), in CSS px. The
// playable-scripts webpack injects `<meta viewport ... viewport-fit=cover>`, so env() is
// populated on notched devices. We measure it by reading a one-off probe element styled with
// `padding-top: env(safe-area-inset-top)` (the spec way to surface env() to JS). Returns 0 on
// desktop / non-notched devices (and any non-DOM context), so behaviour is unchanged there.
function safeAreaTop(): number {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px)';
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return px;
}
