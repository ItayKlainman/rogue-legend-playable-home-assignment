import type { Container } from 'pixi.js';

export interface Scene {
  readonly container: Container;
  readonly done: Promise<void>;
  enter(): Promise<void>;
  exit(): Promise<void>;
  update(deltaMS: number): void;
  pause(): void;
  resume(): void;
  layout(width: number, height: number, fillX?: number, fillW?: number, fillY?: number, fillH?: number): void;
}
