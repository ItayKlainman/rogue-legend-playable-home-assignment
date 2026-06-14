import { Application, Ticker } from 'pixi.js';
import { sdk } from '@smoud/playable-sdk';
import { SceneManager } from '@shared/SceneManager';
import { alTrack } from '@shared/alAnalytics';
import type { PlayableLifecycle } from '@shared/PlayableType';
import type { SidescrollerScript } from './SidescrollerScript';
import { GameScene } from './GameScene';
import { GameEndScene } from './scenes/GameEndScene';

export class SidescrollerDirector implements PlayableLifecycle {
  private app: Application;
  private ticker: Ticker;
  private sceneManager!: SceneManager;
  private width: number;
  private height: number;
  private script: SidescrollerScript;

  constructor(width: number, height: number, script: SidescrollerScript) {
    this.width = width;
    this.height = height;
    this.script = script;
    this.app = new Application();
    this.ticker = new Ticker();
    this.init();
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

    this.ticker.add((t) => {
      this.sceneManager.update(t.deltaMS);
    });

    alTrack('LOADED');
    this.ticker.start();
    sdk.start();
    alTrack('DISPLAYED');

    const gameScene = new GameScene(this.script, this.ticker, this.width, this.height);
    await this.sceneManager.push(gameScene, 'replace');
    await gameScene.done;

    sdk.finish();

    if (this.script.endCard) {
      const endScene = new GameEndScene(
        {
          displayImage: this.script.endCard.splashImage ?? this.script.background,
          logoImage: this.script.endCard.logoImage,
        },
        this.width,
        this.height,
      );
      await this.sceneManager.push(endScene, 'replace');
    }
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

  showEndCard(): void {}
}
