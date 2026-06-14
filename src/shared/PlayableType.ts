export interface PlayableType<TScript = unknown> {
  readonly name: string;
  getScript(): Promise<TScript>;
  create(width: number, height: number, script: TScript): PlayableLifecycle;
}

export interface PlayableLifecycle {
  resize(width: number, height: number): void;
  pause(): void;
  resume(): void;
  showEndCard(): void;
  destroy?(): void;
}
