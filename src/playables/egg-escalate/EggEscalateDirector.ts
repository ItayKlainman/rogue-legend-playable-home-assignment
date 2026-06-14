import { Application, Container, Ticker } from 'pixi.js';
import { sdk } from '@smoud/playable-sdk';
import { SceneManager } from '@shared/SceneManager';
import type { PlayableLifecycle } from '@shared/PlayableType';
import type { EggEscalateScript } from './script';
import { BoardRollScene } from '../egg-summon/scenes/BoardRollScene';
import { FightScene } from '../egg-summon/scenes/FightScene';
import { EggCrackRewardScene } from './scenes/EggCrackRewardScene';
import { EndCardScene } from '../end_card/EndCardScene';
import { buildSmallFight, buildBossFight } from './fightConfig';
import { fitViewport, DESIGN_W, DESIGN_H } from '@shared/safeArea';
import { loadGameFont } from '@shared/gameFont';
import { loadDamageFont } from '@shared/damageFont';
import { alTrack } from '@shared/alAnalytics';
import { safeInstall } from '@shared/mraidInstall';
import { showSimStore } from './simStore';
import * as audio from '../egg-summon/audio';
import splashImage from 'assets/Splash/splash screen 2.webp';
import logoImage from 'assets/UI/LOGO_rogue legend_.webp';

/**
 * CEO escalation concept: dice roll → win vs 2 small enemies → collect Boneclaw
 * → dice roll → land on the boss (the store opens here) → boss fight with hero
 * + Glacidrake + Boneclaw → claim → end card. Reuses egg-summon's scenes
 * (parameterized) and the real battle-pet Spines.
 */
export class EggEscalateDirector implements PlayableLifecycle {
  private app: Application;
  private ticker: Ticker;
  private sceneManager!: SceneManager;
  private world!: Container;
  private cw = 0;
  private ch = 0;

  constructor(
    private width: number,
    private height: number,
    private script: EggEscalateScript,
  ) {
    this.app = new Application();
    this.ticker = new Ticker();
    this.init();
  }

  private async init(): Promise<void> {
    alTrack('LOADING');
    await this.app.init({
      width: this.width, height: this.height,
      backgroundAlpha: 0, antialias: true,
      resolution: window.devicePixelRatio || 1, autoDensity: true,
    });
    document.body.appendChild(this.app.canvas);
    await Promise.all([loadGameFont(), loadDamageFont()]);
    this.world = new Container();
    this.app.stage.addChild(this.world);
    this.sceneManager = new SceneManager(this.world, this.ticker);
    this.applyViewport();
    this.ticker.add((t) => this.sceneManager.update(t.deltaMS));
    alTrack('LOADED');
    this.ticker.start();
    sdk.start();
    alTrack('DISPLAYED');
    sdk.on('volume', (level: number) => audio.setMusicVolume(level));
    void this.runFlow();
  }

  private async runFlow(): Promise<void> {
    audio.playBoardMusic(sdk.volume);

    // 1. First roll → small-enemies tile (3 hops, no boss marker).
    const roll1 = new BoardRollScene(this.app.renderer, this.ticker, this.cw, this.ch, {
      hops: 3, showBossMarker: false,
    });
    await this.sceneManager.push(roll1, 'replace');
    await roll1.done;

    // 2. Easy win vs 2 small enemies (hero + Glacidrake).
    audio.playFightMusic(sdk.volume);
    const small = new FightScene(buildSmallFight(), this.ticker, this.cw, this.ch);
    await this.sceneManager.seamlessReplace(small);
    await small.done;
    // 25%: cleared the first fight.
    alTrack('CHALLENGE_PASS_25');

    // 3. Collect Boneclaw — the tap-to-crack mini-game, the burst revealing the
    //    live Boneclaw Spine. Lean altar (Graphics, no statue/torch sprites) so
    //    the build stays under the 5 MB network cap.
    audio.playBoardMusic(sdk.volume);
    const reward = new EggCrackRewardScene(this.script.rewardPetName, this.ticker, this.cw, this.ch);
    await this.sceneManager.seamlessReplace(reward);
    await reward.done;
    // 50%: collected the new pet.
    alTrack('CHALLENGE_PASS_50');

    // 4. Second roll → BOSS tile. The store opens the instant the hero lands.
    // Dev/QA URL switches:
    //   ?nocta     — suppress the store entirely (review the boss fight straight).
    //   ?simstore  — show a simulated store sheet over the still-running boss
    //                fight (real-network behaviour); close it to see the boss.
    const params = new URLSearchParams(location.search);
    const skipCta = params.has('nocta');
    // The PREVIEW build (QA / shareable demo) defaults to the simulated store
    // popup so a shared HTML shows the full CTA flow on any device. Real
    // ad-network builds (applovin/unity/google/moloco) always use the live CTA.
    // Overrides: ?real forces the live CTA, ?simstore forces the mock.
    const isPreview = typeof AD_NETWORK !== 'undefined' && AD_NETWORK === 'preview';
    const simStore = params.has('simstore') || (isPreview && !params.has('real'));
    let ctaFired = false;
    const roll2 = new BoardRollScene(this.app.renderer, this.ticker, this.cw, this.ch, {
      hops: 4, showBossMarker: true,
      onLand: () => {
        if (ctaFired) return;
        ctaFired = true;
        // 75%: reached the boss — fire the store CTA at peak anticipation.
        alTrack('CHALLENGE_PASS_75');
        if (skipCta) return;
        if (simStore) {
          showSimStore({ iconSrc: logoImage, appName: 'Rogue Legend', onInstall: () => safeInstall() });
        } else {
          safeInstall();
        }
      },
    });
    await this.sceneManager.seamlessReplace(roll2);
    await roll2.done;

    // 5. Boss fight (plays if the user dismissed the store and returned).
    audio.playFightMusic(sdk.volume);
    const boss = new FightScene(buildBossFight(), this.ticker, this.cw, this.ch);
    await this.sceneManager.seamlessReplace(boss);
    await boss.done;

    // 6. End card (no post-boss egg-claim reward — the boss win goes straight
    //    to the end card).
    sdk.finish();
    const endCard = new EndCardScene({ splashImage, logoImage }, this.cw, this.ch);
    await this.sceneManager.seamlessReplace(endCard);
  }

  resize(width: number, height: number): void {
    this.width = width; this.height = height;
    this.app.renderer.resize(width, height);
    this.applyViewport();
  }

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
