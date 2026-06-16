import { Ticker } from 'pixi.js';
import { EnemyEntity } from '../entities/EnemyEntity';
import type { EnemyWaveConfig, EnemySpawnDef, ContinuousConfig } from '../SidescrollerScript';

export interface SpawnerCallbacks {
  onEnemySpawned(enemy: EnemyEntity): void;
  onWaveComplete(waveIndex: number): void;
  onAllComplete(): void;
}

export class EnemySpawner {
  private mode: 'waves' | 'continuous';
  private waves: EnemyWaveConfig[];
  private continuous: ContinuousConfig | null;
  private ticker: Ticker;
  private screenWidth: number;
  private screenHeight: number;
  private callbacks: SpawnerCallbacks;

  private currentWaveIndex = 0;
  private spawnQueue: EnemySpawnDef[] = [];
  private spawnTimer = 0;
  private waveDelayTimer = 0;
  private inWaveDelay = false;
  private currentSpawnDelay = 300;
  private currentBurst = 1;
  private finished = false;

  private continuousTimer = 0;
  private continuousElapsed = 0;
  private continuousSpawnInterval = 0;

  constructor(
    mode: 'waves' | 'continuous',
    waves: EnemyWaveConfig[],
    continuous: ContinuousConfig | null,
    ticker: Ticker,
    screenWidth: number,
    screenHeight: number,
    callbacks: SpawnerCallbacks,
  ) {
    this.mode = mode;
    this.waves = waves;
    this.continuous = continuous;
    this.ticker = ticker;
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.callbacks = callbacks;

    if (mode === 'waves' && waves.length > 0) {
      this.loadWave(0);
    } else if (mode === 'continuous' && continuous) {
      this.continuousSpawnInterval = continuous.spawnInterval;
    }
  }

  get isFinished(): boolean { return this.finished; }
  get currentWave(): number { return this.currentWaveIndex; }
  get totalWaves(): number { return this.waves.length; }

  update(deltaMS: number): void {
    if (this.finished) {
      return;
    }

    if (this.mode === 'waves') {
      this.updateWaves(deltaMS);
    } else {
      this.updateContinuous(deltaMS);
    }
  }

  private updateWaves(deltaMS: number): void {
    if (this.inWaveDelay) {
      this.waveDelayTimer -= deltaMS;

      if (this.waveDelayTimer <= 0) {
        this.inWaveDelay = false;
        this.loadWave(this.currentWaveIndex);
      }
      return;
    }

    if (this.spawnQueue.length === 0) {
      this.callbacks.onWaveComplete(this.currentWaveIndex);
      this.currentWaveIndex++;

      if (this.currentWaveIndex >= this.waves.length) {
        this.finished = true;
        this.callbacks.onAllComplete();
      } else {
        this.inWaveDelay = true;
        this.waveDelayTimer = this.waves[this.currentWaveIndex - 1].waveDelay;
      }
      return;
    }

    this.spawnTimer -= deltaMS;

    if (this.spawnTimer <= 0) {
      this.spawnNext();
      this.spawnTimer = this.currentSpawnDelay;
    }
  }

  private updateContinuous(deltaMS: number): void {
    if (!this.continuous) {
      return;
    }

    this.continuousElapsed += deltaMS;

    if (this.continuousElapsed >= this.continuous.duration) {
      this.finished = true;
      this.callbacks.onAllComplete();
      return;
    }

    this.continuousTimer -= deltaMS;

    if (this.continuousTimer <= 0) {
      const ramp = 1 + (this.continuousElapsed / this.continuous.duration) * (this.continuous.difficultyRamp - 1);
      this.continuousSpawnInterval = this.continuous.spawnInterval / ramp;
      this.continuousTimer = this.continuousSpawnInterval;

      const pool = this.continuous.enemyPool;
      const def = pool[Math.floor(Math.random() * pool.length)];
      this.spawnEnemy(def);
    }
  }

  private loadWave(index: number): void {
    if (index >= this.waves.length) {
      this.finished = true;
      this.callbacks.onAllComplete();
      return;
    }

    const wave = this.waves[index];
    this.currentSpawnDelay = wave.spawnDelay;
    this.currentBurst = wave.burst ?? 1;
    this.spawnQueue = [];

    for (const def of wave.enemies) {
      for (let i = 0; i < def.count; i++) {
        this.spawnQueue.push(def);
      }
    }

    this.spawnTimer = 0;
  }

  private spawnNext(): void {
    for (let i = 0; i < this.currentBurst; i++) {
      const def = this.spawnQueue.shift();

      if (!def) {
        return;
      }

      this.spawnEnemy(def);
    }
  }

  private spawnEnemy(def: EnemySpawnDef): void {
    const margin = 80;
    const spawnX = this.screenWidth + 50;
    const spawnY = def.isBoss
      ? this.screenHeight * 0.5
      : margin + Math.random() * (this.screenHeight - margin * 2);

    const enemy = new EnemyEntity(def.hp, def.speed, def.damage, def.scale, def.isBoss);
    enemy.init(def.spineBundle, def.skin, this.ticker, spawnX, spawnY, this.screenWidth, this.screenHeight);
    this.callbacks.onEnemySpawned(enemy);
  }

  layout(screenWidth: number, screenHeight: number): void {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
  }
}
