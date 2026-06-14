import { Application, Ticker } from 'pixi.js';
import { SceneManager } from '@shared/SceneManager';
import type { PlayableLifecycle } from '@shared/PlayableType';
import { alTrack } from '@shared/alAnalytics';
import { BlackjackScene } from './BlackjackScene';
import { EndCardScene } from '../end_card/EndCardScene';
import { pauseMusic, resumeMusic, setMusicVolume } from '../board-fight/sfx';
import type { BlackjackScript } from './config';
import splashImage from 'assets/Splash/splash screen 2.webp';
import logoImage from 'assets/UI/LOGO_rogue legend_.webp';

export class BlackjackDirector implements PlayableLifecycle {
  private app: Application;
  private ticker: Ticker;
  private sceneManager!: SceneManager;
  private scene!: BlackjackScene;
  private endCard?: EndCardScene;
  private endCardShown = false;
  /**
   * Set to true ONLY when the scene's `done` promise resolves (player
   * claimed / lost outright / lost-all). Used to suppress spurious
   * showEndCard() calls coming from `src/index.ts`'s `sdk.on('finish')`
   * handler — `sdk.install()` fires `finish` as a side effect, which would
   * otherwise mount the end card the moment the soft-CTA Challenge button
   * triggers the App Store popup mid-game.
   */
  private gameFinished = false;
  private width: number;
  private height: number;
  private script: BlackjackScript;
  private windowResizeHandler: (() => void) | null = null;

  constructor(width: number, height: number, script: BlackjackScript) {
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
    await this.app.init({
      width: this.width,
      height: this.height,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    document.body.appendChild(this.app.canvas);

    this.sceneManager = new SceneManager(this.app.stage);

    this.ticker.add(t => this.sceneManager.update(t.deltaMS));
    this.ticker.start();

    this.scene = new BlackjackScene({
      renderer: this.app.renderer,
      ticker: this.ticker,
      script: this.script,
      width: this.width,
      height: this.height,
    });
    await this.sceneManager.push(this.scene, 'replace');
    alTrack('LOADED');
    alTrack('DISPLAYED');
    // Required by AppLovin event spec — CHALLENGE_PASS_X events emitted by the
    // game scene MUST be preceded by CHALLENGE_STARTED. We fire it as soon as
    // the playable surface is interactive so the order is guaranteed regardless
    // of what the player does next.
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

    // When the round LEGITIMATELY finishes (player claimed, lost outright, or
    // lost-all), mark the game as finished and show the end card. Setting
    // gameFinished here gates showEndCard() against spurious triggers — the
    // SDK fires `finish` as a side effect of `sdk.install()`, which routes
    // through `src/index.ts`'s `sdk.on('finish', () => lifecycle.showEndCard())`
    // handler. Without this gate, tapping the soft-CTA Challenge button
    // (which calls sdk.install via safeInstall) would prematurely mount the
    // end card on top of an active round 2.
    void this.scene.done.then(() => {
      this.gameFinished = true;
      this.showEndCard();
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
    pauseMusic();
  }

  resume(): void {
    this.ticker.start();
    resumeMusic();
  }

  /** Bridge SDK volume events into the music gain. */
  setVolume(volume: number): void {
    setMusicVolume(Math.min(volume, 0.6));
  }

  showEndCard(): void {
    if (this.endCardShown) return;
    // Ignore SDK-finish-driven end-card requests until the round has actually
    // finished. The Challenge button (soft CTA) calls sdk.install() which
    // fires `finish` as a side effect — we don't want that to end the playable.
    if (!this.gameFinished) return;
    this.endCardShown = true;
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
