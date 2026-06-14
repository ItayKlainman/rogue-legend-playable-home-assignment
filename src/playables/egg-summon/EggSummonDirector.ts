import { Application, Container, Ticker } from 'pixi.js';
import { sdk } from '@smoud/playable-sdk';
import { SceneManager } from '@shared/SceneManager';
import type { PlayableLifecycle } from '@shared/PlayableType';
import type { EggSummonScript } from './script';
import { EggSummonScene } from './scenes/EggSummonScene';
import { BoardRollScene } from './scenes/BoardRollScene';
import { FightScene } from './scenes/FightScene';
import { ClaimRewardScene } from './scenes/ClaimRewardScene';
import { PickPetScene } from './scenes/PickPetScene';
import { EndCardScene } from '../end_card/EndCardScene';
import { buildBossFight } from './fightConfig';
import { fitViewport, DESIGN_W, DESIGN_H } from '@shared/safeArea';
import { loadGameFont } from '@shared/gameFont';
import { loadDamageFont } from '@shared/damageFont';
import { alTrack } from '@shared/alAnalytics';
import * as audio from './audio';
import splashImage from 'assets/Splash/splash screen 2.webp';
import logoImage from 'assets/UI/LOGO_rogue legend_.webp';

export class EggSummonDirector implements PlayableLifecycle {
  private app: Application;
  private ticker: Ticker;
  private sceneManager!: SceneManager;
  private world!: Container;
  private cw = 0;
  private ch = 0;

  constructor(
    private width: number,
    private height: number,
    private script: EggSummonScript,
  ) {
    this.app = new Application();
    this.ticker = new Ticker();
    this.init();
  }

  private async init(): Promise<void> {
    // Analytics funnel (AppLovin ALPlayableAnalytics; no-ops on other networks):
    // LOADING fires the moment the playable starts initializing.
    alTrack('LOADING');
    await this.app.init({
      width: this.width, height: this.height,
      backgroundAlpha: 0, antialias: true,
      resolution: window.devicePixelRatio || 1, autoDensity: true,
    });
    document.body.appendChild(this.app.canvas);
    // Load the real game UI font (Titan One) before any scene builds its text,
    // so PIXI measures/renders glyphs with it.
    await Promise.all([loadGameFont(), loadDamageFont()]);
    this.world = new Container();
    this.app.stage.addChild(this.world);
    this.sceneManager = new SceneManager(this.world, this.ticker);
    this.applyViewport();
    this.ticker.add((t) => this.sceneManager.update(t.deltaMS));
    // LOADED: renderer + fonts + scene graph are ready to draw.
    alTrack('LOADED');
    this.ticker.start();
    sdk.start();
    // DISPLAYED: the first frame is on screen.
    alTrack('DISPLAYED');
    // Respect the SDK volume slider (handles music play/pause at level 0).
    sdk.on('volume', (level: number) => audio.setMusicVolume(level));
    void this.runFlow();
  }

  private async runFlow(): Promise<void> {
    // Dev-only: `?start=fight` / `?start=claim` jump ahead for quick iteration.
    const startAt = new URLSearchParams(location.search).get('start');
    const fromStart = startAt !== 'fight' && startAt !== 'claim';

    // Board/Stage-1 theme plays through the summon + board scenes (the actual
    // WebAudio start is deferred to the first user gesture inside sfx.ts).
    if (fromStart) audio.playBoardMusic(sdk.volume);

    if (fromStart) {
      // The first scene just mounts (nothing visible yet to keep on screen).
      const egg = new EggSummonScene(this.script, this.ticker, this.cw, this.ch);
      await this.sceneManager.push(egg, 'replace');
      await egg.done;
      // 25%: user tapped the egg and saw the pet summoned (first real engagement).
      alTrack('CHALLENGE_PASS_25');
      // From here use seamlessReplace: the current scene stays on screen while the
      // next scene's enter() loads its assets, so there's never a black gap between
      // scenes (e.g. board → fight, which loads spines + backgrounds).
      // One egg → the mythic dragon is summoned → it goes straight to battle
      // (no "Pick Your Fighter" step — there's only one beast).
      const board = new BoardRollScene(this.app.renderer, this.ticker, this.cw, this.ch, {
        hops: 4, showBossMarker: true,
      });
      await this.sceneManager.seamlessReplace(board);
      await board.done;
      // 50%: rolled the board and reached the boss battle.
      alTrack('CHALLENGE_PASS_50');
    }
    if (startAt !== 'claim') {
      const fight = new FightScene(buildBossFight(), this.ticker, this.cw, this.ch);
      // Switch to the Stage-1 BOSS theme for the battle.
      audio.playFightMusic(sdk.volume);
      await (fromStart
        ? this.sceneManager.seamlessReplace(fight)
        : this.sceneManager.push(fight, 'replace'));
      await fight.done;
      // 75%: defeated the boss (the core win moment before the reward/end card).
      alTrack('CHALLENGE_PASS_75');
    }
    // Authentic post-battle beat: tap to CLAIM the victory reward — resolve back
    // to the main board theme under the reward SFX.
    audio.playBoardMusic(sdk.volume);
    const claim = new ClaimRewardScene(this.ticker, this.cw, this.ch);
    await (startAt === 'claim'
      ? this.sceneManager.push(claim, 'replace')
      : this.sceneManager.seamlessReplace(claim));
    await claim.done;
    // The claimed egg opens into two new pets — the player picks one (juicy).
    const pick = new PickPetScene(this.script, this.ticker, this.cw, this.ch);
    await this.sceneManager.seamlessReplace(pick);
    await pick.done;
    sdk.finish();
    const endCard = new EndCardScene({ splashImage, logoImage }, this.cw, this.ch);
    await this.sceneManager.seamlessReplace(endCard);
  }

  resize(width: number, height: number): void {
    this.width = width; this.height = height;
    this.app.renderer.resize(width, height);
    this.applyViewport();
  }

  /** Scale the fixed phone DESIGN canvas to fit the viewport (contain + centre)
   *  so the content is pixel-identical to the phone layout on any aspect ratio;
   *  scenes fill `(fillX,fillY,fillW,fillH)` (the viewport in design space) so the
   *  margins are covered by the scene's own background — no bars. */
  private applyViewport(): void {
    const { scale, offsetX, offsetY, fillX, fillY, fillW, fillH } = fitViewport(this.width, this.height);
    this.cw = DESIGN_W; this.ch = DESIGN_H;
    this.world.scale.set(scale);
    this.world.position.set(offsetX, offsetY);
    this.sceneManager?.layout(DESIGN_W, DESIGN_H, fillX, fillW, fillY, fillH);
  }
  pause(): void { this.ticker.stop(); audio.pauseMusic(); }
  resume(): void { this.ticker.start(); audio.resumeMusic(); }

  showEndCard(): void {}
}
