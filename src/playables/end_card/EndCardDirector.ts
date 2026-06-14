import { Application, Ticker } from 'pixi.js';
import { sdk } from '@smoud/playable-sdk';
import { SceneManager } from '@shared/SceneManager';
import { alTrack } from '@shared/alAnalytics';
import type { PlayableLifecycle } from '@shared/PlayableType';
import type { EndCardScript } from './index';
import { EndCardScene } from './EndCardScene';

export class EndCardDirector implements PlayableLifecycle {
  private app: Application;
  private ticker: Ticker;
  private sceneManager!: SceneManager;
  private width: number;
  private height: number;
  private script: EndCardScript;

  constructor(width: number, height: number, script: EndCardScript) {
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
    alTrack('DISPLAYED');
    sdk.finish();

    const scene = new EndCardScene(this.script, this.width, this.height);
    await this.sceneManager.push(scene, 'replace');
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
