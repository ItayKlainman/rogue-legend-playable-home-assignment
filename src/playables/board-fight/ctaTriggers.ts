/**
 * CTA triggers — declarative hooks that fire `safeInstall()` (open the app
 * store) at specific gameplay checkpoints. Configured per-variant via
 * `PlayableScript.ctaTriggers`. Each trigger fires at most once per playable
 * run; the player's click does its normal thing in addition.
 *
 * Add a new trigger kind by:
 *   1. Adding a variant to this discriminated union.
 *   2. Calling `director.notifyCheckpoint('<kind>')` from the relevant scene
 *      at the moment that should count.
 */
export type CtaTrigger =
  | { on: 'levelUpChoice'; n: number };
