import { Application, Container, Ticker } from 'pixi.js';
import { sdk } from '@smoud/playable-sdk';
import { SceneManager } from '@shared/SceneManager';
import type { PlayableLifecycle } from '@shared/PlayableType';
import type { EggSummonScript } from './script';
import { EggCrackScene } from './scenes/EggCrackScene';
import { BoardRollScene } from '../egg-summon/scenes/BoardRollScene';
import { FightScene } from '../egg-summon/scenes/FightScene';
import { ClaimRewardScene } from '../egg-summon/scenes/ClaimRewardScene';
import { PickPetScene } from '../egg-summon/scenes/PickPetScene';
import { EndCardScene } from '../end_card/EndCardScene';
import { fitViewport, DESIGN_W, DESIGN_H } from '@shared/safeArea';
import { loadGameFont } from '@shared/gameFont';
import { loadDamageFont } from '@shared/damageFont';
import { alTrack } from '@shared/alAnalytics';
import * as audio from '../egg-summon/audio';
import splashImage from 'assets/Splash/splash screen 2.webp';
import logoImage from 'assets/UI/LOGO_rogue legend_.webp';

export class EggCrackDirector implements PlayableLifecycle {
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
    const startAt = new URLSearchParams(location.search).get('start');
    const fromStart = startAt !== 'fight' && startAt !== 'claim';

    if (fromStart) audio.playBoardMusic(sdk.volume);

    if (fromStart) {
      // The new 5-tap crack egg replaces egg-summon's opening scene.
      const egg = new EggCrackScene(this.script, this.ticker, this.cw, this.ch);
      await this.sceneManager.push(egg, 'replace');
      await egg.done;
      // 25%: cracked the egg open and saw the pet summoned (first real engagement).
      alTrack('CHALLENGE_PASS_25');
      const board = new BoardRollScene(this.app.renderer, this.ticker, this.cw, this.ch);
      await this.sceneManager.seamlessReplace(board);
      await board.done;
      // 50%: rolled the board and reached the boss battle.
      alTrack('CHALLENGE_PASS_50');
    }
    if (startAt !== 'claim') {
      const fight = new FightScene(this.ticker, this.cw, this.ch);
      audio.playFightMusic(sdk.volume);
      await (fromStart
        ? this.sceneManager.seamlessReplace(fight)
        : this.sceneManager.push(fight, 'replace'));
      await fight.done;
      // 75%: defeated the boss.
      alTrack('CHALLENGE_PASS_75');
    }
    audio.playBoardMusic(sdk.volume);
    const claim = new ClaimRewardScene(this.ticker, this.cw, this.ch);
    await (startAt === 'claim'
      ? this.sceneManager.push(claim, 'replace')
      : this.sceneManager.seamlessReplace(claim));
    await claim.done;
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
