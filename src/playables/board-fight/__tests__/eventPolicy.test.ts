import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  requiresRoll,
  drainLeadingEvents,
  challengePassEvents,
  type DrainScene,
  type DrainSceneManager,
} from '../eventPolicy';
import type { PlayableEvent } from '../PlayableDirector';

// --- CHALLENGE_PASS_* progress mapping ------------------------------------
// Progress milestones must span the WHOLE combo (leading + main events), so the
// Direction-B cold-open doesn't bunch all three PASS events into the first ~20s.
// `completed` = leading events drained + main events dequeued; `total` = both counts.

test('challengePassEvents: nothing fires at 0 progress', () => {
  assert.deepEqual(challengePassEvents(0, 3), []);
});

test('challengePassEvents: total<=0 is a no-op (no division by zero)', () => {
  assert.deepEqual(challengePassEvents(0, 0), []);
  assert.deepEqual(challengePassEvents(2, 0), []);
});

test('challengePassEvents: Direction B cold-open done (1 of 3) fires ONLY PASS_25', () => {
  // The whole board+fight half still lies ahead — must NOT report 75% here.
  assert.deepEqual(challengePassEvents(1, 3), ['CHALLENGE_PASS_25']);
});

test('challengePassEvents: after the fight (2 of 3) PASS_25 + PASS_50', () => {
  assert.deepEqual(challengePassEvents(2, 3), ['CHALLENGE_PASS_25', 'CHALLENGE_PASS_50']);
});

test('challengePassEvents: at the end card (3 of 3) all three fire', () => {
  assert.deepEqual(challengePassEvents(3, 3), [
    'CHALLENGE_PASS_25',
    'CHALLENGE_PASS_50',
    'CHALLENGE_PASS_75',
  ]);
});

test('requiresRoll: diceBlackjack requires a roll', () => {
  assert.equal(requiresRoll('diceBlackjack'), true);
});

test('requiresRoll: endCard does NOT require a roll', () => {
  assert.equal(requiresRoll('endCard'), false);
});

test('requiresRoll: regression for existing event types', () => {
  assert.equal(requiresRoll('fight'), true);
  assert.equal(requiresRoll('treasure'), true);
  assert.equal(requiresRoll('levelup'), false);
  assert.equal(requiresRoll('gameEnd'), false);
});

// --- drainLeadingEvents ordering ------------------------------------------
// Fake recording SceneManager + fake scenes. Each scene's `done` resolves
// immediately so the helper advances synchronously through its loop.

type Call = { op: 'push'; mode?: string } | { op: 'pop' };

function makeRecorder() {
  const calls: Call[] = [];
  const mgr: DrainSceneManager = {
    async push(_scene: DrainScene, mode?: string) {
      calls.push({ op: 'push', mode });
    },
    async pop() {
      calls.push({ op: 'pop' });
    },
  };
  return { calls, mgr };
}

const makeScene = (): DrainScene => ({ done: Promise.resolve() });

test('drainLeadingEvents: single leading event → one push, no pop (last left on stack)', async () => {
  const { calls, mgr } = makeRecorder();
  const events = [{ type: 'diceBlackjack', rig: 'winRigged' }] as unknown as PlayableEvent[];

  await drainLeadingEvents(events, mgr, makeScene);

  assert.deepEqual(calls, [{ op: 'push', mode: 'replace' }]);
});

test('drainLeadingEvents: two leading events → push, pop, push (no final pop)', async () => {
  const { calls, mgr } = makeRecorder();
  const events = [
    { type: 'diceBlackjack', rig: 'winRigged' },
    { type: 'diceBlackjack', rig: 'loseRigged' },
  ] as unknown as PlayableEvent[];

  await drainLeadingEvents(events, mgr, makeScene);

  assert.deepEqual(calls, [
    { op: 'push', mode: 'replace' },
    { op: 'pop' },
    { op: 'push', mode: 'replace' },
  ]);
});
