import { Application, Ticker } from 'pixi.js';
import { SceneManager } from '@shared/SceneManager';
import type { PlayableLifecycle } from '@shared/PlayableType';
import { alTrack } from '@shared/alAnalytics';
import { CombatScene } from './scenes/CombatScene';
import { DefeatScene } from './scenes/DefeatScene';
import { EndCardScene } from '../end_card/EndCardScene';
import { safeInstall } from '@shared/mraidInstall';
import { PerfHud } from './ui/perfHud';
import { startBgMusic } from './audio/sfx';
import type { ClashConfig } from './config';
import splashImage from 'assets/Splash/splash screen 2.webp';
import logoImage from 'assets/UI/LOGO_rogue legend_.webp';

/**
 * CombatDirector — the lifecycle host for the clash-royal playable. Mirrors
 * dice-blackjack/BlackjackDirector: it owns the PIXI Application + Ticker +
 * SceneManager, mounts CombatScene, fires the AppLovin analytics sequence, and
 * swaps in the shared EndCardScene once the combat scene's `done` resolves
 * (CombatScene resolves ~1.8s after victory — see VICTORY_HOLD_MS there).
 */
export class CombatDirector implements PlayableLifecycle {
  private app: Application;
  private ticker: Ticker;
  private sceneManager!: SceneManager;
  private scene!: CombatScene;
  private endCard?: EndCardScene;
  private defeatScene?: DefeatScene;
  private endCardShown = false;
  /**
   * Set to true ONLY when the scene's `done` promise resolves (victory). Used
   * to suppress spurious showEndCard() calls coming from `src/index.ts`'s
   * `sdk.on('finish')` handler — `sdk.install()` fires `finish` as a side
   * effect, which would otherwise mount the end card the moment a soft-CTA
   * install gesture fires mid-game.
   */
  private gameFinished = false;
  private width: number;
  private height: number;
  private script: ClashConfig;
  private windowResizeHandler: (() => void) | null = null;
  private perfHud?: PerfHud;

  constructor(width: number, height: number, script: ClashConfig) {
    // Trust the actual viewport dimensions over whatever the SDK passed —
    // some browser environments (iOS Safari with dynamic browser chrome,
    // splitscreen tablets) give the SDK stale or partial values, leaving
    // a coloured band at the top/bottom of the canvas.
    const vp = readViewport();
    this.width = vp.width ?? width;
    this.height = vp.height ?? height;
    this.script = script;
    this.app = new Application();
    this.ticker = new Ticker();
    void this.init();
  }

  private async init(): Promise<void> {
    alTrack('LOADING');
    // Light looping fight music — registered now, actually starts on the first tap (autoplay
    // policy) via the sfx first-interaction gate. Respects SDK mute.
    startBgMusic(0.3);
    // ── REAL-DEVICE perf A/B harness (URL params; inert in the shipped ad) ──────
    // We can't reproduce iPhone GPU lag on a desktop simulator, so these let the
    // suspects be toggled on the actual phone and watched live via the ?perf=1 HUD.
    // Default (no params) = the shipped behaviour, NOTHING changed:
    //   ?perf=1     show the FPS/renderer overlay
    //   ?dpr=full   restore native (uncapped) DPR — tests if the DPR cap matters
    //   ?aa=off     disable antialias — tests MSAA cost (brutal on iOS WebGL)
    //   ?juice=off  disable card rarity-juice (glow/sparkle/shine) — tests its cost
    //   ?mask=off   disable the tier-3 shine stencil mask
    const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
    const showHud = params.get('perf') === '1' || params.get('perf') === 'true';
    const dprParam = params.get('dpr');                // 'full' | a number | null
    const aaOff = params.get('aa') === 'off';
    const juiceOff = params.get('juice') === 'off';
    const maskOff = params.get('mask') === 'off';        // tier-3 card SHINE mask
    const bmaskOff = params.get('bmask') === 'off';      // whole-battle-viewport mask
    const uiOff = params.get('ui') === 'off';            // bottom panel/slots/tray/coach
    const actorsOff = params.get('actors') === 'off';    // both Spine characters
    const audioOff = params.get('audio') === 'off';      // all SFX (HTMLAudioElement)
    // Wire URL overrides into the __crPerf flags read by RarityJuice + CombatScene + sfx.
    const g = globalThis as { __crPerf?: Record<string, boolean> };
    g.__crPerf = {
      ...(g.__crPerf || {}),
      dprUncapped: dprParam === 'full', noJuice: juiceOff, noMask: maskOff,
      noBattleMask: bmaskOff, noUi: uiOff, noActors: actorsOff, noAudio: audioOff,
    };

    // Full device DPR (sharp). The 1.5 touch-cap from cd02402 was REVERTED: a real-
    // device HUD A/B proved iOS lag was AUDIO (HTMLAudioElement on the main thread),
    // NOT fill-rate — dpr 3 ran the same fps as 1.5, so capping only softened the
    // image for zero gain. ?dpr=<n>|full retained purely as a diagnostic override.
    const dpr = window.devicePixelRatio || 1;
    let resolution: number;
    if (dprParam === 'full') resolution = dpr;
    else if (dprParam != null && !Number.isNaN(parseFloat(dprParam))) resolution = parseFloat(dprParam);
    else resolution = dpr;
    await this.app.init({
      width: this.width,
      height: this.height,
      backgroundAlpha: 0,
      antialias: !aaOff,
      // Force WebGL — PixiJS 8 may auto-pick WebGPU on iOS 18+ Safari, which has
      // known performance issues (especially with antialias) and is far less
      // mature than the WebGL path. WebGL is the maintainer-recommended renderer
      // for production. (board-fight/PlayableDirector forces this for the same reason.)
      preference: 'webgl',
      resolution,
      autoDensity: true,
    });
    document.body.appendChild(this.app.canvas);

    if (showHud) {
      this.perfHud = new PerfHud(this.app, this.ticker, {
        dprLabel: resolution >= dpr ? `FULL ${dpr}` : `CAPPED ${resolution} (was ${dpr})`,
        antialias: !aaOff,
        overrides: [
          dprParam && `dpr=${dprParam}`, aaOff && 'aa=off', juiceOff && 'juice=off',
          maskOff && 'mask=off', bmaskOff && 'bmask=off', uiOff && 'ui=off',
          actorsOff && 'actors=off', audioOff && 'audio=off',
        ].filter(Boolean).join(' '),
      });
    }

    this.sceneManager = new SceneManager(this.app.stage);

    this.ticker.add(t => this.sceneManager.update(t.deltaMS));
    this.ticker.start();

    // DEV-only outcome override (?outcome=win|lose) — gated behind __DEV__ so it is
    // tree-shaken from the shipped ad and NOT readable in production.
    if (__DEV__) {
      const o = params.get('outcome');
      if (o === 'lose' || o === 'win') this.script = { ...this.script, outcome: o };
    }

    // CombatScene takes positional args (cfg, ticker, width, height, onVolley).
    // Iteration #3: a spammy skill volley fires a SOFT store CTA (the dice-blackjack
    // double-or-nothing pattern) — open the store + keep the live fight running underneath, so a
    // returning user lands back in the SAME fight instead of depending on a visibility round-trip.
    this.scene = new CombatScene(this.script, this.ticker, this.width, this.height, () => safeInstall());
    await this.sceneManager.push(this.scene, 'replace');
    alTrack('LOADED');
    alTrack('DISPLAYED');
    // Required by AppLovin event spec — CHALLENGE_PASS_X events MUST be preceded
    // by CHALLENGE_STARTED. Fire it as soon as the playable surface is
    // interactive so ordering is guaranteed regardless of what the player does.
    alTrack('CHALLENGE_STARTED');

    // Belt-and-braces resize: if the browser chrome shows/hides (iOS Safari
    // address bar collapse, tablet split view, orientation change), the SDK
    // doesn't always emit a fresh resize. Listen on the window directly.
    this.windowResizeHandler = () => {
      const vp = readViewport();
      if (vp.width != null && vp.height != null) {
        this.resize(vp.width, vp.height);
      }
    };
    window.addEventListener('resize', this.windowResizeHandler);
    window.addEventListener('orientationchange', this.windowResizeHandler);

    // When the round LEGITIMATELY finishes (victory + the in-scene VICTORY hold
    // elapses), mark the game as finished and show the end card. Setting
    // gameFinished here gates showEndCard() against spurious triggers — the SDK
    // fires `finish` as a side effect of `sdk.install()`, which routes through
    // `src/index.ts`'s `sdk.on('finish', () => lifecycle.showEndCard())`.
    void this.scene.done.then(() => {
      if (this.scene.result() === 'defeat') { this.showDefeat(); return; } // do NOT set gameFinished (C2)
      this.gameFinished = true;
      this.showEndCard();
    });
  }

  /** Lose path: mount the DefeatScene overlay over the frozen death frame. We do NOT set
   *  gameFinished — DefeatScene.enter() calls sdk.finish(), which re-emits SDK `finish`
   *  routed to showEndCard(); leaving gameFinished false keeps that re-emit a no-op (C2). */
  private showDefeat(): void {
    this.defeatScene = new DefeatScene(this.width, this.height, {
      // Soft CTA (dice-blackjack double-or-nothing): open the store AND immediately start the
      // win-retry in the background — no return listener — so the user "keeps playing from where
      // they left off" and lands on the win whether or not they bounce back from the store.
      onTryAgain: () => { safeInstall(); void this.retryAsWin(); },
    });
    void this.sceneManager.push(this.defeatScene, 'replace');
  }

  private async retryAsWin(): Promise<void> {
    // push('replace') only pauses+hides the previous scene; it never calls exit(). Explicitly
    // exit() the defeat overlay AND the dead combat scene so the dead scene's CombatFx/ImpactFx
    // ticker handlers stop, Spine/VRAM frees, and the __clashRoyal bridge is dropped.
    await this.defeatScene?.exit();
    await this.scene.exit();
    this.endCardShown = false;
    this.gameFinished = false;
    const retryCfg: ClashConfig = { ...this.script, outcome: 'win', gateFightUntilFirstPick: false };
    this.scene = new CombatScene(retryCfg, this.ticker, this.width, this.height);
    await this.sceneManager.push(this.scene, 'replace');
    void this.scene.done.then(() => {
      if (this.scene.result() === 'win') { this.gameFinished = true; this.showEndCard(); }
    });
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.app.renderer.resize(width, height);
    this.sceneManager?.layout(width, height);
  }

  pause(): void {
    this.ticker.stop();
  }

  resume(): void {
    this.ticker.start();
  }

  showEndCard(): void {
    if (this.endCardShown) return;
    // Ignore SDK-finish-driven end-card requests until the round has actually
    // finished. A soft-CTA install gesture calls sdk.install() which fires
    // `finish` as a side effect — we don't want that to end the playable early.
    if (!this.gameFinished) return;
    this.endCardShown = true;
    if (__DEV__) {
      // Signal the Task 16 E2E that the playable reached its terminal screen.
      // CombatScene installs window.__clashRoyal under __DEV__ and exposes
      // markEndCardShown() so its `state` getter can report 'endcard'.
      this.scene.markEndCardShown?.();
      // eslint-disable-next-line no-console
      console.log('[clash-royal] ENDCARD_SHOWN');
    }
    this.endCard = new EndCardScene({ splashImage, logoImage }, this.width, this.height);
    void this.sceneManager.push(this.endCard, 'replace');
  }
}

/** Read the actual viewport dimensions. Returns nulls in test/SSR contexts. */
function readViewport(): { width: number | null; height: number | null } {
  if (typeof window === 'undefined') return { width: null, height: null };
  // visualViewport excludes the iOS browser chrome — use it when available
  // so we don't render BEHIND the address bar and get bg bleed.
  const vv = window.visualViewport;
  return {
    width: vv ? Math.round(vv.width) : window.innerWidth,
    height: vv ? Math.round(vv.height) : window.innerHeight,
  };
}
