export interface IdleClockConfig { idleMs: number; }
export class IdleClock {
  private readonly cfg: IdleClockConfig;
  private started = false;
  private sinceTick = 0;
  // Once the player makes a MANUAL pick they're actively playing — auto-pick disengages
  // permanently. Auto-pick is ONLY for a pure idle viewer who never interacts; it must
  // never fire mid-play just because the player paused to think (the reported bug).
  private disengaged = false;
  constructor(cfg: IdleClockConfig) { this.cfg = cfg; }
  begin(): void { this.started = true; this.sinceTick = 0; }
  /** Reset the idle countdown. @param manual true when the PLAYER tapped a slot (vs. the
   *  clock's own auto-pick) — a manual pick disengages auto-pick for the rest of the run. */
  notePick(manual = false): void {
    this.sinceTick = 0;
    if (manual) this.disengaged = true;
  }
  step(dtMs: number, anyPickable: boolean): boolean {
    if (!this.started || this.disengaged) return false;
    this.sinceTick += dtMs;
    if (this.sinceTick >= this.cfg.idleMs && anyPickable) { this.sinceTick = 0; return true; }
    return false;
  }
}
