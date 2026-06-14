import { Application, Ticker } from 'pixi.js';
import { sdk } from '@smoud/playable-sdk';
import { SceneManager } from '@shared/SceneManager';
import { installViewportListener } from '@shared/viewport';
import type { Scene } from '@shared/Scene';
import type { PlayableLifecycle } from '@shared/PlayableType';
import type { PlayerState, StatDelta } from './PlayerState';
import type { BoardConfig } from './board/BoardConfig';
// BoardScene is statically imported because it's instantiated directly in
// runScript() (board mode) and is part of the always-loaded path.
import { BoardScene } from './scenes/BoardScene';
import type { BoardSceneConfig } from './scenes/BoardScene';
// All event-driven scene classes are injected per-variant via
// `PlayableScript.sceneClasses`. Codegen emits a static import + entry for
// only the scenes referenced by the variant's events, so unused scenes (and
// their statically-imported assets) drop out of the bundle entirely.
//
// Type-only imports here exist for the FightScene cast at the call site and
// for the *Config arg types in the PlayableEvent union below. The constructor
// types in PlayableSceneClasses use `typeof import(...)` so no value-level
// import of the scene class lands in this file.
import type { FightScene } from './scenes/FightScene';
import type { WeaponRewardSceneConfig } from './scenes/WeaponRewardScene';
import type { HeroRewardSceneConfig } from './scenes/HeroRewardScene';
import type { RewardDiscoverySceneConfig } from './scenes/RewardDiscoveryScene';
import type { LevelUpSceneConfig } from './scenes/LevelUpScene';
import type { GameEndSceneConfig } from './scenes/GameEndScene';
import type { NextChapterSceneConfig } from './scenes/NextChapterScene';
import type { TreasureChestSceneConfig } from './scenes/TreasureChestScene';
import type { DialogueSceneConfig } from './scenes/DialogueScene';
import type { LuckyWheelSceneConfig } from './scenes/LuckyWheelScene';
import type { SlotReelsSceneConfig } from './scenes/SlotReelsScene';
import type { BlackjackSceneConfig } from './scenes/BlackjackScene';
import type { ShopSceneConfig } from './scenes/ShopScene';

/** Subset of scene + board-popup constructors a variant ships. Codegen
 *  populates only the entries needed by the variant's events; PlayableDirector
 *  / BoardScene instantiate from this map and throw when a referenced class
 *  is missing. Keeping unused classes out of the map lets webpack tree-shake
 *  their static asset imports.
 */
export interface PlayableSceneClasses {
  FightScene?: typeof import('./scenes/FightScene').FightScene;
  WeaponRewardScene?: typeof import('./scenes/WeaponRewardScene').WeaponRewardScene;
  HeroRewardScene?: typeof import('./scenes/HeroRewardScene').HeroRewardScene;
  RewardDiscoveryScene?: typeof import('./scenes/RewardDiscoveryScene').RewardDiscoveryScene;
  LevelUpScene?: typeof import('./scenes/LevelUpScene').LevelUpScene;
  GameEndScene?: typeof import('./scenes/GameEndScene').GameEndScene;
  NextChapterScene?: typeof import('./scenes/NextChapterScene').NextChapterScene;
  TreasureChestScene?: typeof import('./scenes/TreasureChestScene').TreasureChestScene;
  DialogueScene?: typeof import('./scenes/DialogueScene').DialogueScene;
  LuckyWheelScene?: typeof import('./scenes/LuckyWheelScene').LuckyWheelScene;
  SlotReelsScene?: typeof import('./scenes/SlotReelsScene').SlotReelsScene;
  BlackjackScene?: typeof import('./scenes/BlackjackScene').BlackjackScene;
  ShopScene?: typeof import('./scenes/ShopScene').ShopScene;
  // Embedded dice-blackjack minigame + its blackjack-styled end card. Codegen
  // includes these only for variants with diceBlackjack/endCard events.
  DiceBlackjackScene?: typeof import('../dice-blackjack/BlackjackScene').DiceBlackjackScene;
  EndCardScene?: typeof import('../end_card/EndCardScene').EndCardScene;
  // Board-overlay popups — owned by BoardScene, gated on tilePopup/loot events.
  // These each pull in their own webp/audio assets, so listing them here lets
  // codegen skip them in variants that don't have those board events.
  StatChangePopup?: typeof import('./board/popups/StatChangePopup').StatChangePopup;
  LootToast?: typeof import('./board/popups/LootToast').LootToast;
  // Horizontal fight-progress bar — only used by `showFightProgress` (no-board)
  // variants. Board-mode variants use the vertical FightProgressBar instead,
  // which lives outside this map because its static helpers (extractFights,
  // computeRollRatios) are always reachable.
  FightProgressBarH?: typeof import('./FightProgressBarH').FightProgressBarH;
  // Per-HUD modules — each owns its asset import (EXP/ATK/Coin webp). Codegen
  // includes only the HUDs the variant uses (showXp / atkDisplay='bar' /
  // showCoins or coin events) so unused HUDs and their assets drop out.
  XpHud?: typeof import('./hud/XpHud').XpHud;
  AtkHud?: typeof import('./hud/AtkHud').AtkHud;
  CoinHud?: typeof import('./hud/CoinHud').CoinHud;
}
import type { FightSceneConfig } from './fight/FightStep';
import type { SkillConfig } from './skills';
import type { WeaponConfig, SpineAssets } from '@shared/SpineCharacter';
import type { BoardFloatConfig } from './board/BoardFloatOverlay';
import { FightProgressBar } from './FightProgressBar';
// FightProgressBarH lives in script.sceneClasses (codegen-gated on
// showFightProgress) so no-board-mode-only assets/code don't bundle for
// board-mode variants.
import type { FightProgressBarH } from './FightProgressBarH';
import { computeLevelUpSkills } from './dynamicSkillSelection';
import { alTrack } from '@shared/alAnalytics';
import type { LogoOverlayHandle } from '@shared/ui/LogoOverlay';
import { safeInstall } from '@shared/mraidInstall';
import type { CtaTrigger } from './ctaTriggers';
import musicData from 'assets/Audio/Level1_Compressed_Theme.mp3';
import { setMusic, setMusicVolume, pauseMusic, resumeMusic } from './sfx';
import { requiresRoll, drainLeadingEvents, challengePassEvents } from './eventPolicy';
import { SCRIPTS_BY_VARIANT } from '../dice-blackjack/config';
import type { VariantName } from '../dice-blackjack/config';
// Splash/logo for the blackjack-styled end card. Hardcoded (not codegen-gated)
// because the endCard event has no per-event config to carry them. Mirrors
// dice-blackjack/BlackjackDirector.ts, which imports the same two assets.
import splashImage from 'assets/Splash/splash screen 2.webp';
import logoImage from 'assets/UI/LOGO_rogue legend_.webp';

// requiresRoll moved to ./eventPolicy (asset-free, unit-testable). Re-exported
// here so existing importers (e.g. FightProgressBar) keep resolving it from
// PlayableDirector without edits.
export { requiresRoll } from './eventPolicy';

export type RollSpec = { hops: number; major?: boolean };
export type RollEntry = number | RollSpec | null;

export function normalizeRoll(entry: RollEntry | undefined): { hops: number; major: boolean } {
  if (entry == null) return { hops: 0, major: false };
  if (typeof entry === 'number') return { hops: entry, major: false };
  return { hops: entry.hops, major: !!entry.major };
}

/** Apply an event's `atkBoost` field to player state. Strictly narrowed by event
 *  type — only weaponReward/heroReward/levelup carry atkBoost. The previous
 *  `'atkBoost' in event` check was fragile: would match any future event with
 *  an optional atkBoost field. */
function applyEventAtkBoost(event: PlayableEvent, state: PlayerState): void {
  if (event.type !== 'weaponReward' && event.type !== 'heroReward' && event.type !== 'levelup') return;
  if (!event.atkBoost) return;
  state.atk = event.atkBoost;
}

/** Extract a StatDelta from a TilePopupEvent. Exported so BoardScene can compute
 *  the actual change before showing the bubble (Unity flow: ApplyMainStatChange
 *  returns the post-clamp delta and the popup shows that). */
export function deltaForTilePopup(event: TilePopupEvent): StatDelta {
  const value = event.amount ?? event.pct ?? 0;
  const usePct = event.amount == null;
  if (event.stat === 'hp') {
    return usePct ? { hpPct: value, maxHp: 0 } : { hp: value };
  }
  if (event.stat === 'atk') {
    return usePct ? { atkPct: value } : { atk: value };
  }
  // 'def' isn't tracked on PlayerState yet — popup-only display, no state mutation.
  return {};
}

/** A stat-change popup event. Renders a speech-bubble popup over the player's
 *  tile, then applies the corresponding StatDelta. Non-blocking (auto-chains). */
export interface TilePopupEvent {
  type: 'tilePopup';
  /** Stat key the bubble shows. Drives icon + label. */
  stat: 'hp' | 'atk' | 'def';
  /** % delta (positive = buff, negative = debuff). Mutually exclusive with `amount`. */
  pct?: number;
  /** Absolute delta. Mutually exclusive with `pct`. */
  amount?: number;
}

/** A loot toast event. Renders a golden +N text + glow + radial particle burst
 *  over the player's tile, then credits the coins. Non-blocking (auto-chains). */
export interface LootEvent {
  type: 'loot';
  currency: 'coin';
  amount: number;
}

/** Treasure chest tile event. Renders a full-screen chest scene with single-tap
 *  open and a coin reward popup. Coins are awarded on Continue dismiss. */
export interface TreasureEvent {
  type: 'treasure';
  config: TreasureChestSceneConfig;
}

/** Dialogue tile event (campfire / choice). 2-button decision over a battle BG
 *  with a centered cutscene prop. Outcomes from the chosen option apply on click. */
export interface DialogueEvent {
  type: 'dialogue';
  config: DialogueSceneConfig;
}

/** Lucky-wheel rare minigame. Skills-only random reward. */
export interface LuckyWheelEvent {
  type: 'luckyWheel';
  config: LuckyWheelSceneConfig;
}

/** Slot-reels rare reward minigame. */
export interface SlotReelsEvent {
  type: 'slotReels';
  config: SlotReelsSceneConfig;
}

/** Dice-blackjack minigame — 2d6 race to 21 with multi-round streak rewards. */
export interface BlackjackEvent {
  type: 'blackjack';
  config: BlackjackSceneConfig;
}

/** Shop economy checkpoint. Browse + buy from cards. */
export interface ShopEvent {
  type: 'shop';
  config: ShopSceneConfig;
}

/** Embedded dice-blackjack minigame — runs the standalone dice-blackjack scene
 *  inside the board playable. `rig` selects the variant script; `music` opts
 *  the embedded scene into playing its own music (default: host keeps theirs). */
export interface DiceBlackjackEvent {
  type: 'diceBlackjack';
  rig: VariantName;
  music?: boolean;
}

/** Blackjack-styled end card — splash/logo splash that finishes the ad. */
export interface EndCardEvent {
  type: 'endCard';
}

export type PlayableEvent =
  | { type: 'fight'; config: FightSceneConfig; xpFill?: number }
  | { type: 'weaponReward'; config: WeaponRewardSceneConfig; atkBoost?: number; discovery?: boolean; boardFloat?: boolean }
  | { type: 'heroReward'; config: HeroRewardSceneConfig; atkBoost?: number; discovery?: boolean; boardFloat?: boolean }
  | { type: 'levelup'; config?: LevelUpSceneConfig; atkBoost?: number }
  | { type: 'gameEnd'; config: GameEndSceneConfig }
  | { type: 'nextChapter'; config: NextChapterSceneConfig }
  | TilePopupEvent
  | LootEvent
  | TreasureEvent
  | DialogueEvent
  | LuckyWheelEvent
  | SlotReelsEvent
  | BlackjackEvent
  | ShopEvent
  | DiceBlackjackEvent
  | EndCardEvent;

export interface PlayableScript {
  initialState: PlayerState;
  board?: BoardConfig;
  rolls?: RollEntry[];
  events: PlayableEvent[];
  /** Direction-B cold-open: full-screen events played BEFORE the board mounts.
   *  runScript drains these via eventPolicy.drainLeadingEvents, then reveals the
   *  board with seamlessReplace (the last leading scene stays visible during the
   *  board's enter(), avoiding a blank frame). */
  leadingEvents?: PlayableEvent[];
  /** Per-variant subset of scene constructors. Codegen emits only the scenes
   *  used by this variant's events; PlayableDirector throws if it tries to
   *  instantiate a scene not present here. Required so PlayableDirector
   *  doesn't drag every scene class into every bundle. */
  sceneClasses: PlayableSceneClasses;
  allSkills: SkillConfig[];
  stats?: { showXp?: boolean; atkDisplay?: 'bar' | 'overhead'; showCoins?: boolean };
  debugWeapons?: { name: string; config: WeaponConfig }[];
  dynamicLevelUp?: boolean;
  showFightProgress?: boolean;
  /** Opt-in: use the 3D Unity-authored dice roll on the board.
   *  Default (false/undefined) keeps the original 2D UI-overlay dice. */
  use3dDice?: boolean;
  /** Opt-in: pulse the roll button's red sprite while the FTUE hand is shown. */
  pulseRollButton?: boolean;
  hitsCounter?: boolean;
  xpFlyAfterFights?: boolean;
  createLogoOverlay?: () => Promise<LogoOverlayHandle>;
  tileFloats?: BoardFloatConfig[];
  centerEnemy?: SpineAssets;
  centerEnemyScale?: number;
  centerEnemyPosition?: { x: number; y: number };
  /** In-game CTA triggers — fire `safeInstall()` at specific gameplay checkpoints.
   *  Each trigger fires at most once per run. See `ctaTriggers.ts`. */
  ctaTriggers?: CtaTrigger[];
}

export class PlayableDirector implements PlayableLifecycle {
  private app: Application;
  private ticker: Ticker;
  private sceneManager!: SceneManager;
  private state: PlayerState;
  private script: PlayableScript;
  private width: number;
  private height: number;
  private removeViewportListener: (() => void) | null = null;
  private eventIndex = 0;
  // Leading (cold-open) events already drained — counted into AL progress so the
  // CHALLENGE_PASS_* milestones span the whole combo, not just the main events.
  private leadingDrained = 0;
  private levelUpCount = 0;
  private lastFightBg: string | null = null;
  private musicStarted = false;
  private logoOverlay: LogoOverlayHandle | null = null;
  private ctaCounters = new Map<CtaTrigger['on'], number>();
  private firedTriggers = new Set<number>();

  constructor(width: number, height: number, script: PlayableScript) {
    this.width = width;
    this.height = height;
    this.script = script;
    this.state = {
      coins: 0,
      ...script.initialState,
      skills: [...script.initialState.skills],
    };
    if (__DEV__) (window as any).__debugState = this.state;
    this.ticker = new Ticker();
    this.app = new Application();
    this.init();
  }

  private startMusicOnce(): void {
    if (this.musicStarted) return;
    this.musicStarted = true;
    setMusic(musicData, sdk.volume);
  }

  private async init(): Promise<void> {
    alTrack('LOADING');
    const isTouch = matchMedia('(pointer: coarse)').matches;
    const dpr = window.devicePixelRatio || 1;
    await this.app.init({
      width: this.width,
      height: this.height,
      backgroundAlpha: 0,
      antialias: true,
      // Force WebGL — PixiJS 8 may auto-pick WebGPU on iOS 18+ Safari, which
      // has known performance issues (especially with antialias) and is much
      // less mature than the WebGL path. WebGL is also the maintainer-
      // recommended renderer for production.
      preference: 'webgl',
      resolution: isTouch ? Math.min(dpr, 1.5) : dpr,
      autoDensity: true,
    });
    document.body.appendChild(this.app.canvas);

    // Respect SDK volume control. setMusicVolume() handles play/pause based on level.
    sdk.on('volume', (level: number) => {
      setMusicVolume(level);
    });

    // Kick off music on first user interaction. WebAudio (in sfx.ts) defers
    // the actual `start()` until the AudioContext is resumed — which the
    // sfx module already does on the same first-gesture hook — so we just
    // need to register the music here. Idempotent.
    //
    // Direction B (cold-open) variants skip this handler: the embedded
    // leading scene owns the music during the cold-open (it runs setMusic on
    // its own arcade track via the leading event's `music:true`), and
    // startMusicOnce() is instead called manually after the board mounts (see
    // runScript). sfx.ts resumes the AudioContext on its OWN first-gesture
    // hook, so gating this off does NOT silence the cold-open.
    if (!this.script.leadingEvents?.length) {
      const startOnInteraction = () => {
        this.startMusicOnce();
        removeListeners();
      };
      const removeListeners = () => {
        document.removeEventListener('pointerdown', startOnInteraction);
        document.removeEventListener('touchstart', startOnInteraction);
        document.removeEventListener('click', startOnInteraction);
        document.removeEventListener('keydown', startOnInteraction);
      };
      document.addEventListener('pointerdown', startOnInteraction);
      document.addEventListener('touchstart', startOnInteraction);
      document.addEventListener('click', startOnInteraction);
      document.addEventListener('keydown', startOnInteraction);
    }

    this.sceneManager = new SceneManager(this.app.stage);

    // Relayout on orientation / browser-chrome changes the SDK resize can miss
    // (shared with clash-royal). Guarded resize() below makes redundant fires cheap.
    this.removeViewportListener = installViewportListener((w, h) => this.resize(w, h));

    if (this.script.createLogoOverlay) {
      this.logoOverlay = await this.script.createLogoOverlay();
      this.app.stage.sortableChildren = true;
      this.logoOverlay.container.zIndex = 9999;
      this.app.stage.addChild(this.logoOverlay.container);
      const logoYOffset = this.script.showFightProgress ? 30 : 0;
      this.logoOverlay.layout(this.width, this.height, logoYOffset);
    }

    this.ticker.add((t) => {
      this.sceneManager.update(t.deltaMS);
      this.logoOverlay?.update(t.deltaMS);
    });

    alTrack('LOADED');
    this.ticker.start();
    sdk.start();
    alTrack('DISPLAYED');

    this.runScript();
  }

  private async runScript(): Promise<void> {
    // CHALLENGE_STARTED fires once per run when a diceBlackjack minigame is on
    // the bill (leading or main events). Emitted here, before reportSceneProgress
    // can fire any CHALLENGE_PASS_* events, so the ordering reads correctly.
    const allEvents = [...(this.script.leadingEvents ?? []), ...this.script.events];
    if (allEvents.some((e) => e.type === 'diceBlackjack')) alTrack('CHALLENGE_STARTED');
    if (this.script.board) {
      // Board mode: events fire on each landing
      const boardConfig: BoardSceneConfig = {
        rolls: this.script.rolls ?? [],
        debugWeapons: this.script.debugWeapons,
      };
      const fightMarkers = FightProgressBar.extractFights(this.script.events);
      const rollRatios = FightProgressBar.computeRollRatios(this.script.events);
      const progressBar = fightMarkers.length > 0 ? new FightProgressBar(fightMarkers) : undefined;
      let rollCount = 0;
      const playEvent = async (event: PlayableEvent) => {
        // Non-scene popup events run as overlays on the BoardScene and don't push
        // a full scene. They award stats + show a transient bubble/toast.
        // (loot triggers its own coin fly, so it bypasses the
        // post-event coin-diff fly below.)
        if (event.type === 'tilePopup') {
          await board.runTilePopup(event);
          return;
        }
        if (event.type === 'loot') {
          await board.runLoot(event);
          return;
        }
        // Snapshot coins before the scene so we can animate any positive delta
        // (treasure, slot, dialogue-w/-coin-outcome, etc.) flying to the HUD.
        const coinsBefore = this.state.coins ?? 0;
        const skillsBefore = this.state.skills.length;
        const scene = this.createEventScene(event);
        // The terminal end card is a full-screen scene whose splash uses a cover
        // fit that leaves a ~49px uncovered strip at the bottom (526×1169 art on a
        // 412×915 viewport, anchored at top y=-50). Pushed as an 'overlay', the
        // BoardScene stays visible behind that strip and bleeds through (stone
        // tiles + the red fight pit). 'replace' hides the board behind it, so the
        // gap shows the dark canvas instead — matching the standalone
        // dice-blackjack end card (BlackjackDirector also pushes it 'replace').
        // endCard's `done` never resolves (it's the last screen), so the pop()
        // below never runs for it — the board stays hidden until the ad ends.
        const pushMode = event.type === 'endCard' ? 'replace' : 'overlay';
        await this.sceneManager.push(scene, pushMode);
        await scene.done;
        await this.sceneManager.pop();
        if (event.type === 'fight') progressBar?.advance();
        const coinsAfter = this.state.coins ?? 0;
        const coinDelta = coinsAfter - coinsBefore;
        if (coinDelta > 0) {
          // Fire-and-forget: don't block the next roll on the fly's full lifetime.
          void board.playCoinFlyFromCenter(coinDelta);
        }
        // Skill awarded by a full-screen reward scene (lucky wheel etc.) —
        // fly the skill icon from screen center to the hero with an impact burst.
        if (this.state.skills.length > skillsBefore) {
          const newSkillId = this.state.skills[this.state.skills.length - 1];
          const newSkill = this.script.allSkills.find(s => s.id === newSkillId);
          if (newSkill) {
            await board.playSkillFly(newSkill);
          }
        }
      };
      const onRolled = () => {
        if (rollCount < rollRatios.length) {
          progressBar?.setProgress(rollRatios[rollCount]);
          rollCount++;
        }
      };
      const onLanded = async (_tileIndex: number) => {
        await this.playNextEventChain(playEvent, board);
      };
      const floatConfigs = this.computeFloatConfigs();
      // Auto-enable coin HUD whenever the script contains coin-bearing tile events
      // (treasure / loot / jail / shop), so coin mutations from those events are visible.
      const hasCoinEvents = [...(this.script.leadingEvents ?? []), ...this.script.events].some(
        (e) => e.type === 'treasure' || e.type === 'loot'
            || e.type === 'shop' || e.type === 'blackjack'
            || e.type === 'diceBlackjack',
      );
      const baseStats = this.script.stats ?? (hasCoinEvents ? {} : undefined);
      const statsConfig = baseStats
        ? {
            ...baseStats,
            xpFlyMode: !!this.script.xpFlyAfterFights,
            showCoins: baseStats.showCoins ?? hasCoinEvents,
          }
        : undefined;
      const board = new BoardScene(
        boardConfig, this.script.board, this.state,
        this.ticker, this.app.renderer, this.width, this.height, onLanded, progressBar, onRolled,
        statsConfig, floatConfigs, this.script.centerEnemy, this.script.centerEnemyScale,
        this.script.centerEnemyPosition, this.script.use3dDice,
        this.script.pulseRollButton,
        (delta) => this.applyStatDelta(delta),
        this.script.sceneClasses,
      );
      if (this.script.leadingEvents && this.script.leadingEvents.length > 0) {
        // Direction B cold-open: play the leading full-screen scene(s) first, then
        // reveal the board via seamlessReplace. seamlessReplace keeps the last leading
        // scene visible (and animating) during the board's enter(), so there's no
        // blank frame while BoardScene loads — no separate preload needed.
        // (Single leading event today; with multiple, transitions BETWEEN leading
        // scenes would flash — drainLeadingEvents does push→await→pop per intermediate
        // event, so the pop empties the stack — only the last→board handoff is seamless.)
        await drainLeadingEvents(
          this.script.leadingEvents,
          this.sceneManager,
          (e) => this.createEventScene(e),
        );
        // Cold-open scenes are done — credit them toward AL progress (fires the
        // first PASS milestone) before the board+fight half advances it further.
        this.leadingDrained = this.script.leadingEvents.length;
        this.reportSceneProgress();
        // Crossfade the minigame out to reveal the board (already rendered behind),
        // so the cold-open → board hand-off dissolves instead of hard-cutting.
        await this.sceneManager.seamlessReplace(board, { ticker: this.ticker, ms: 450 });
        // Cold-open is over. Tear down the embedded scene's arcade source first —
        // sfx's setMusic won't replace an already-playing track (startMusicIfPending
        // bails while musicSrc is live) — then start the board theme.
        pauseMusic();
        this.startMusicOnce();
      } else {
        await this.sceneManager.push(board, 'replace');
      }
      await board.done;
      await this.sceneManager.pop();
    } else {
      // No board: run all events sequentially
      let prevFightBg: string | null = null; // null = no previous fight
      let needsPop = false;

      // Optional horizontal fight progress bar
      let hProgressBar: FightProgressBarH | undefined;
      if (this.script.showFightProgress) {
        const FightProgressBarHCls = this.script.sceneClasses.FightProgressBarH;
        if (!FightProgressBarHCls) {
          throw new Error('PlayableDirector: showFightProgress set but sceneClasses.FightProgressBarH missing — codegen forgot to include it.');
        }
        const hMarkers = FightProgressBar.extractFights(this.script.events);
        if (hMarkers.length > 0) {
          hProgressBar = new FightProgressBarHCls(hMarkers);
          await hProgressBar.init();
        }
      }

      const getFightBg = (event: PlayableEvent): string | null =>
        event.type === 'fight' ? event.config.background : null;

      const playEvent = async (event: PlayableEvent) => {
        // No-board mode has no tile to anchor to: apply stat changes silently and skip the popup.
        if (event.type === 'tilePopup') {
          this.applyStatDelta(deltaForTilePopup(event));
          return;
        }
        if (event.type === 'loot') {
          this.applyStatDelta({ coins: event.amount });
          return;
        }
        // Advance horizontal progress bar before each fight starts
        if (event.type === 'fight' && hProgressBar) {
          hProgressBar.advance();
        }
        const scene = this.createEventScene(event, hProgressBar);
        const curBg = getFightBg(event);
        // In fights-only mode, non-fight events are overlays — except discovery scenes which have their own bg
        const isDiscovery = ('discovery' in event) && event.discovery;
        const isNonFight = event.type !== 'fight' && !isDiscovery;
        if (isNonFight && needsPop) {
          await this.sceneManager.push(scene, 'overlay');
          await scene.done;
          await this.sceneManager.pop();
          return;
        }
        // Seamless transition: fight→fight with same background (skip pop, use seamlessReplace)
        if (event.type === 'fight' && prevFightBg !== null && curBg === prevFightBg && needsPop) {
          await this.sceneManager.seamlessReplace(scene);
          needsPop = true;
        } else {
          if (needsPop) await this.sceneManager.pop();
          await this.sceneManager.push(scene, 'replace');
          needsPop = true;
        }
        prevFightBg = curBg;

        // Tell fight to skip victory fade (keep bg visible) if next event reuses
        // same background OR is a non-fight overlay shown over this scene
        if (event.type === 'fight') {
          const nextEvent = this.script.events[this.eventIndex];
          const nextBg = nextEvent ? getFightBg(nextEvent) : null;
          const nextIsOverlay = nextEvent && nextEvent.type !== 'fight';
          if ((curBg !== null && nextBg === curBg) || nextIsOverlay) {
            (scene as FightScene).setSkipVictoryFade(true);
          }
        }

        await scene.done;

        // Peek at next event: defer pop if next fight reuses same bg,
        // or if next event is a non-fight overlay that should show over this scene
        const nextEvent = this.script.events[this.eventIndex];
        const nextBg = nextEvent ? getFightBg(nextEvent) : null;
        const nextIsOverlay = nextEvent && nextEvent.type !== 'fight';
        if ((curBg !== null && nextBg === curBg) || nextIsOverlay) {
          // Don't pop yet — seamlessReplace or overlay will handle it
        } else {
          await this.sceneManager.pop();
          needsPop = false;
          prevFightBg = null;
        }
      };
      while (this.eventIndex < this.script.events.length) {
        await this.playNextEventChain(playEvent);
      }
      if (needsPop) await this.sceneManager.pop();
    }
  }

  /**
   * Play the next event and auto-chain any non-fight events that follow.
   * Only fights require a new roll; everything else plays immediately after.
   */
  private async playNextEventChain(
    playEvent: (event: PlayableEvent) => Promise<void>,
    board?: BoardScene,
  ): Promise<void> {
    const event = this.script.events[this.eventIndex];
    if (!event) return;
    this.eventIndex++;
    this.reportSceneProgress();
    applyEventAtkBoost(event, this.state);
    await playEvent(event);
    if (event.type === 'fight' && board) {
      const nextEvt = this.script.events[this.eventIndex];
      const eligible = nextEvt?.type === 'levelup';
      let xpFill: number | undefined;
      if (event.xpFill != null) {
        xpFill = event.xpFill;
      } else if (this.script.xpFlyAfterFights && eligible) {
        xpFill = 1;
      }
      if (xpFill != null) {
        await board.playXpFly(xpFill);
      }
    }
    // Auto-chain: drain events that don't require their own roll. Fights and
    // tile events (treasure/dialogue/luckyWheel/etc.) each consume a roll —
    // they break out of the chain so the player rolls again before they fire.
    while (this.eventIndex < this.script.events.length) {
      const next = this.script.events[this.eventIndex];
      if (requiresRoll(next.type)) break;
      this.eventIndex++;
      // Report on DEQUEUE, before playEvent — the terminal endCard's `done` never
      // resolves, so a post-await report (line above's pattern) would never run and
      // PASS_75 would be lost. Mirrors the first-event report a few lines up.
      this.reportSceneProgress();
      applyEventAtkBoost(next, this.state);
      await playEvent(next);
      if (next.type === 'levelup' && board) {
        board.resetXpBar();
      }
    }
  }

  /** Apply a stat delta to PlayerState. Called by tile-popup, loot, treasure,
   *  campfire, jail, and shop events. Returns the actual deltas applied
   *  (post-clamp for HP) so the popup can show the real change.
   *
   *  Mirrors Unity's BattlerStats.ApplyMainStatChange clamp: HP can never drop
   *  below 1 — debuff popups never kill the player. */
  applyStatDelta(delta: StatDelta): StatDelta {
    const applied: StatDelta = {};
    if (delta.maxHp != null) {
      const prevMax = this.state.maxHp;
      this.state.maxHp = Math.max(1, prevMax + delta.maxHp);
      // Match the new max so the buff isn't immediately wasted.
      this.state.hp += (this.state.maxHp - prevMax);
      applied.maxHp = this.state.maxHp - prevMax;
    }
    if (delta.hpPct != null) {
      const want = Math.round(this.state.maxHp * delta.hpPct / 100);
      const prev = this.state.hp;
      this.state.hp = Math.max(1, Math.min(this.state.maxHp, this.state.hp + want));
      applied.hpPct = delta.hpPct;
      applied.hp = this.state.hp - prev;
    }
    if (delta.hp != null) {
      const prev = this.state.hp;
      this.state.hp = Math.max(1, Math.min(this.state.maxHp, this.state.hp + delta.hp));
      applied.hp = (applied.hp ?? 0) + (this.state.hp - prev);
    }
    if (delta.atk != null) {
      this.state.atk = Math.max(0, this.state.atk + delta.atk);
      applied.atk = delta.atk;
    }
    if (delta.atkPct != null) {
      const add = Math.round(this.state.atk * delta.atkPct / 100);
      this.state.atk = Math.max(0, this.state.atk + add);
      applied.atkPct = delta.atkPct;
      applied.atk = (applied.atk ?? 0) + add;
    }
    if (delta.coins != null) {
      this.state.coins = Math.max(0, (this.state.coins ?? 0) + delta.coins);
      applied.coins = delta.coins;
    }
    if (delta.skill && !this.state.skills.includes(delta.skill)) {
      this.state.skills.push(delta.skill);
      applied.skill = delta.skill;
    }
    return applied;
  }

  private reportSceneProgress(): void {
    // Count the FULL timeline (leading cold-open events + main events) so the
    // milestones spread across the whole ad. For Direction-B cold-open variants
    // the embedded blackjack no longer fires PASS_* itself (it's `embedded`), so
    // the director is the single, ordered source of progress.
    const total = (this.script.leadingEvents?.length ?? 0) + this.script.events.length;
    const completed = this.leadingDrained + this.eventIndex;
    for (const ev of challengePassEvents(completed, total)) alTrack(ev);
  }

  /** Notify the director that a CTA-relevant checkpoint just occurred.
   *  Increments the per-kind counter and fires `safeInstall()` for any
   *  matching unfired trigger. */
  private notifyCheckpoint(kind: CtaTrigger['on']): void {
    const next = (this.ctaCounters.get(kind) ?? 0) + 1;
    this.ctaCounters.set(kind, next);
    const triggers = this.script.ctaTriggers ?? [];
    triggers.forEach((t, i) => {
      if (this.firedTriggers.has(i)) return;
      if (t.on !== kind) return;
      if (t.n !== next) return;
      this.firedTriggers.add(i);
      safeInstall();
    });
  }

  private computeFloatConfigs(): BoardFloatConfig[] {
    if (!this.script.board) return [];
    const rolls = this.script.rolls ?? [];
    const tiles = this.script.board.tiles;
    const dir = this.script.board.direction ?? -1;
    let tileIdx = this.state.boardTileIndex;
    let rollIdx = 0;
    const configs: BoardFloatConfig[] = [];

    for (const event of this.script.events) {
      if (event.type === 'fight') {
        const hops = normalizeRoll(rolls[rollIdx]).hops;
        for (let i = 0; i < hops; i++) {
          tileIdx = (tileIdx + dir + tiles.length) % tiles.length;
        }
        rollIdx++;
      }
      // Non-fight events share the tile of the preceding fight
      if (event.type === 'weaponReward' && event.boardFloat) {
        configs.push({
          type: 'weapon',
          tileIndex: tileIdx,
          displaySprite: event.config.displaySprite,
          lifecycle: 'onLand',
        });
      }
      if (event.type === 'heroReward' && event.boardFloat) {
        configs.push({
          type: 'hero',
          tileIndex: tileIdx,
          heroBundle: event.config.heroBundle,
          heroSkin: event.config.heroConfig.skinName,
          lifecycle: 'onLand',
        });
      }
    }
    if (this.script.tileFloats) {
      configs.push(...this.script.tileFloats);
    }
    return configs;
  }

  /** Look up a scene constructor that the variant promised to ship via
   *  `script.sceneClasses`. Throws a clear error if the variant referenced
   *  an event whose scene class wasn't included in codegen — that's a bug in
   *  the codegen registry, not a user-visible failure. */
  private requireSceneClass<K extends keyof PlayableSceneClasses>(
    key: K,
  ): NonNullable<PlayableSceneClasses[K]> {
    const cls = this.script.sceneClasses[key];
    if (!cls) {
      throw new Error(`PlayableScript.sceneClasses.${key} is missing — codegen forgot to import this scene class for the current variant.`);
    }
    return cls as NonNullable<PlayableSceneClasses[K]>;
  }

  private createEventScene(event: PlayableEvent, progressBar?: FightProgressBarH): Scene {
    switch (event.type) {
      case 'fight': {
        this.lastFightBg = event.config.background;
        const config = { ...event.config, allSkills: this.script.allSkills, progressBar, hitsCounter: !!this.script.hitsCounter };
        config.players = config.players.map((p, i) =>
          i === 0 ? { ...p, hp: this.state.hp, maxHp: this.state.maxHp, skin: this.state.heroSkin } : p,
        );
        const FightSceneCls = this.requireSceneClass('FightScene');
        return new FightSceneCls(config, this.state, this.ticker, this.width, this.height);
      }
      case 'weaponReward': {
        if (event.discovery && this.lastFightBg) {
          const RewardDiscoverySceneCls = this.requireSceneClass('RewardDiscoveryScene');
          return new RewardDiscoverySceneCls({
            mode: 'weapon',
            background: this.lastFightBg,
            weaponDisplaySprite: event.config.displaySprite,
            weaponConfig: event.config.weaponConfig,
            weaponId: event.config.weaponId,
          }, this.state, this.ticker, this.width, this.height);
        }
        const WeaponRewardSceneCls = this.requireSceneClass('WeaponRewardScene');
        return new WeaponRewardSceneCls(event.config, this.state, this.width, this.height);
      }
      case 'heroReward': {
        if (event.discovery && this.lastFightBg) {
          const RewardDiscoverySceneCls = this.requireSceneClass('RewardDiscoveryScene');
          return new RewardDiscoverySceneCls({
            mode: 'hero',
            background: this.lastFightBg,
            heroConfig: event.config.heroConfig,
            heroBundle: event.config.heroBundle,
          }, this.state, this.ticker, this.width, this.height);
        }
        const HeroRewardSceneCls = this.requireSceneClass('HeroRewardScene');
        return new HeroRewardSceneCls(event.config, this.state, this.ticker, this.width, this.height);
      }
      case 'levelup': {
        let config = event.config;
        if (!config || this.script.dynamicLevelUp) {
          const skills = computeLevelUpSkills(
            this.script.allSkills,
            this.state.skills,
            this.levelUpCount === 0,
          );
          config = {
            skills: [skills as [SkillConfig, SkillConfig, SkillConfig]],
            ...(event.config?.layout && { layout: event.config.layout }),
          };
        }
        this.levelUpCount++;
        const levelUpConfig: LevelUpSceneConfig = {
          ...config,
          onSkillPicked: () => this.notifyCheckpoint('levelUpChoice'),
        };
        const LevelUpSceneCls = this.requireSceneClass('LevelUpScene');
        return new LevelUpSceneCls(levelUpConfig, this.state, this.ticker, this.width, this.height);
      }
      case 'gameEnd': {
        sdk.finish();
        this.logoOverlay?.hide();
        const GameEndSceneCls = this.requireSceneClass('GameEndScene');
        return new GameEndSceneCls(event.config, this.width, this.height);
      }
      case 'nextChapter': {
        sdk.finish();
        this.logoOverlay?.hide();
        const NextChapterSceneCls = this.requireSceneClass('NextChapterScene');
        return new NextChapterSceneCls(event.config, this.width, this.height);
      }
      case 'treasure': {
        const TreasureChestSceneCls = this.requireSceneClass('TreasureChestScene');
        return new TreasureChestSceneCls(
          event.config, this.state, this.ticker, this.width, this.height,
          (delta) => this.applyStatDelta(delta),
        );
      }
      case 'dialogue': {
        const dialogueConfig: DialogueSceneConfig = {
          ...event.config,
          background: event.config.background || this.lastFightBg || '',
        };
        const DialogueSceneCls = this.requireSceneClass('DialogueScene');
        return new DialogueSceneCls(
          dialogueConfig, this.state, this.ticker, this.width, this.height,
          (delta) => this.applyStatDelta(delta),
        );
      }
      case 'luckyWheel': {
        const LuckyWheelSceneCls = this.requireSceneClass('LuckyWheelScene');
        return new LuckyWheelSceneCls(
          event.config, this.state, this.ticker, this.width, this.height,
          this.script.allSkills,
          (delta) => this.applyStatDelta(delta),
        );
      }
      case 'slotReels': {
        const SlotReelsSceneCls = this.requireSceneClass('SlotReelsScene');
        return new SlotReelsSceneCls(
          event.config, this.state, this.ticker, this.width, this.height,
          (delta) => this.applyStatDelta(delta),
        );
      }
      case 'blackjack': {
        const BlackjackSceneCls = this.requireSceneClass('BlackjackScene');
        return new BlackjackSceneCls(
          event.config, this.state, this.ticker, this.app.renderer,
          this.width, this.height,
          (delta) => this.applyStatDelta(delta),
        );
      }
      case 'shop': {
        const ShopSceneCls = this.requireSceneClass('ShopScene');
        return new ShopSceneCls(
          event.config, this.state, this.ticker, this.width, this.height,
          (delta) => this.applyStatDelta(delta),
        );
      }
      case 'diceBlackjack': {
        const DiceBlackjackSceneCls = this.requireSceneClass('DiceBlackjackScene');
        return new DiceBlackjackSceneCls({
          renderer: this.app.renderer,
          ticker: this.ticker,
          script: SCRIPTS_BY_VARIANT[event.rig],
          width: this.width,
          height: this.height,
          embedded: true,
          playMusic: !!event.music,
        });
      }
      case 'endCard': {
        sdk.finish();
        this.logoOverlay?.hide();
        const EndCardSceneCls = this.requireSceneClass('EndCardScene');
        return new EndCardSceneCls({ splashImage, logoImage }, this.width, this.height);
      }
      case 'tilePopup':
      case 'loot':
        // Routed to BoardScene popups (board mode) or applied directly (no-board mode);
        // never reaches createEventScene in normal flow.
        throw new Error(`Event type ${event.type} should not reach createEventScene — handled in playEvent`);
    }
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.app.renderer.resize(width, height);
    this.sceneManager?.layout(width, height);
    const logoYOffset = this.script.showFightProgress ? 30 : 0;
    this.logoOverlay?.layout(width, height, logoYOffset);
  }

  pause(): void { this.ticker.stop(); pauseMusic(); }
  resume(): void { this.ticker.start(); resumeMusic(); }
  showEndCard(): void {
    // Music continues playing through the end card (nextChapter/gameEnd)
  }
}
