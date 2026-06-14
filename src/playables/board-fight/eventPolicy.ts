// Pure, asset-free, Pixi-free policy logic for board-fight events. Lives apart
// from PlayableDirector so it can be unit-tested under the `tsx` test loader,
// which does NOT resolve the `assets/*` webpack imports PlayableDirector pulls
// in statically. The `PlayableEvent` import below is type-only and is erased at
// runtime by tsx/esbuild, so importing it here pulls in NO assets.
import type { PlayableEvent } from './PlayableDirector';

/** Events that require their OWN dice roll on the board. Fights are the
 *  classic case; the new tile events (treasure, dialogue, etc.) also each
 *  represent landing on a board tile, so they require a roll too. The embedded
 *  dice-blackjack minigame is a board-tile event as well, so it requires a roll.
 *
 *  Events that do NOT require a roll (auto-chain after a roll-required event):
 *  levelup, weaponReward, heroReward, gameEnd, nextChapter, endCard. */
export function requiresRoll(eventType: PlayableEvent['type']): boolean {
  return eventType === 'fight'
      || eventType === 'tilePopup'
      || eventType === 'loot'
      || eventType === 'treasure'
      || eventType === 'dialogue'
      || eventType === 'luckyWheel'
      || eventType === 'slotReels'
      || eventType === 'blackjack'
      || eventType === 'shop'
      || eventType === 'diceBlackjack';
}

/** AppLovin progress milestones, mapped over the WHOLE combo timeline.
 *
 *  `completed` counts scenes the player has reached (leading events drained +
 *  main events dequeued); `total` is the full count (leadingEvents + events).
 *  Returns the CHALLENGE_PASS_* events that should be active at that ratio.
 *
 *  Counting leading events in the denominator is what keeps Direction-B
 *  cold-open variants honest: with total=3, finishing the cold-open blackjack
 *  (completed=1) reports only PASS_25 — the board+fight half ahead still moves
 *  the funnel — rather than the old behavior where the embedded blackjack fired
 *  all three PASS events in the first ~20s. */
export type ChallengePassEvent =
  | 'CHALLENGE_PASS_25'
  | 'CHALLENGE_PASS_50'
  | 'CHALLENGE_PASS_75';

export function challengePassEvents(completed: number, total: number): ChallengePassEvent[] {
  if (total <= 0) return [];
  const ratio = completed / total;
  const out: ChallengePassEvent[] = [];
  if (ratio >= 0.25) out.push('CHALLENGE_PASS_25');
  if (ratio >= 0.50) out.push('CHALLENGE_PASS_50');
  if (ratio >= 0.75) out.push('CHALLENGE_PASS_75');
  return out;
}

// --- Direction-B cold-open ordering ---------------------------------------
// Minimal structural shapes the drain helper needs, kept Pixi-free so this
// module stays testable. The real SceneManager + Scene satisfy these.

export interface DrainScene {
  readonly done: Promise<void>;
}

export interface DrainSceneManager {
  push(scene: DrainScene, mode?: 'replace' | 'overlay'): Promise<void>;
  pop(): Promise<void>;
}

/** Drain leading full-screen events before the board mounts. Pushes each
 *  leading scene, awaits its `done`, and pops it — EXCEPT the last one, which
 *  is intentionally LEFT on the stack so a following seamlessReplace(board)
 *  can keep it visible as the old entry during the board's enter(), avoiding
 *  a blank frame. Caller is responsible for mounting the board after this.
 *
 *  Pure helper, wired into PlayableDirector.runScript's board branch for
 *  Direction-B cold-open variants. */
export async function drainLeadingEvents(
  leadingEvents: PlayableEvent[],
  mgr: DrainSceneManager,
  makeScene: (event: PlayableEvent) => DrainScene,
): Promise<void> {
  for (let i = 0; i < leadingEvents.length; i++) {
    const scene = makeScene(leadingEvents[i]);
    await mgr.push(scene, 'replace');
    await scene.done;
    if (i < leadingEvents.length - 1) await mgr.pop();
  }
}
