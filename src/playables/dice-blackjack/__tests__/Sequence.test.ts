import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ticker } from 'pixi.js';
import {
  Sequence,
  type SequenceListener,
  type SequenceState,
  type Side,
  type DiceFaces,
} from '../Sequence';
import {
  DEFAULT_SCRIPT,
  SCRIPT_WIN_RIGGED,
  SCRIPT_LOSE_RIGGED,
  SCRIPT_FAIR,
  type BlackjackScript,
  type DialogueKey,
} from '../config';

// Tests run against a real PIXI Ticker but with fast-forwarded timings so the
// suite finishes in milliseconds.

const FAST_TIMINGS = {
  ...DEFAULT_SCRIPT.timings,
  delayBetweenPlayerRolls: 0,
  delayBetweenOpponentRolls: 0,
  delayOnBlackjack: 0,
  delayOnWin: 0,
  delayOnLose: 0,
  endCardDelayMs: 0,
};

const FAST_SCRIPT: BlackjackScript = { ...DEFAULT_SCRIPT, timings: FAST_TIMINGS };
const FAST_WIN: BlackjackScript = { ...SCRIPT_WIN_RIGGED, timings: FAST_TIMINGS };
const FAST_LOSE: BlackjackScript = { ...SCRIPT_LOSE_RIGGED, timings: FAST_TIMINGS };
const FAST_FAIR: BlackjackScript = { ...SCRIPT_FAIR, timings: FAST_TIMINGS };

// Winnable round 0 (gambler force-busts, player cushioned) + a no-cushion round 1
// that drains on bust — exercises the FSM's onLoseAll(accumulated) path, which the
// (now unwinnable) loseRigged script can no longer reach via a win→challenge.
const FAST_MULTI_LOSEALL: BlackjackScript = {
  round: { maxScore: 21 },
  rig: {
    playerAlwaysRerollsBust: true,
    opponentOvershootRetries: 0,
    opponentOvershootChance: 0,
    resetOnFirstBust: false,
    forceOpponentBust: true,
  },
  rounds: [
    { coins: 80,  retryLosingRollCount: 3, retryChance: 100, bustLosesAll: false },
    { coins: 160, retryLosingRollCount: 0, retryChance: 0,   bustLosesAll: true },
  ],
  timings: FAST_TIMINGS,
  dialogue: DEFAULT_SCRIPT.dialogue,
};

interface Recorder extends SequenceListener {
  events: string[];
  claimedCoins?: number;
  loseAllFired: boolean;
  roundWins: Array<{ round: number; coinsThisRound: number; total: number }>;
  challengesAccepted: Array<{ round: number; nextReward: number }>;
}

function makeRecorder(): Recorder {
  const r: Recorder = {
    events: [],
    loseAllFired: false,
    roundWins: [],
    challengesAccepted: [],
    onStateChange(s: SequenceState) { r.events.push(`state:${s}`); },
    onDialogue(k: DialogueKey) { r.events.push(`dlg:${k}`); },
    onScoreChange(side: Side, score: number) { r.events.push(`score:${side}=${score}`); },
    async onDiceRoll(side: Side, _faces: DiceFaces) { r.events.push(`roll:${side}`); },
    onBust(side: Side) { r.events.push(`bust:${side}`); },
    onBlackjack() { r.events.push('blackjack'); },
    onWin() { r.events.push('win'); },
    onLose() { r.events.push('lose'); },
    onRoundWin(round: number, coinsThisRound: number, total: number) {
      r.events.push(`roundWin:${round}:${coinsThisRound}:${total}`);
      r.roundWins.push({ round, coinsThisRound, total });
    },
    onClaim(total: number) {
      r.events.push(`claim:${total}`);
      r.claimedCoins = total;
    },
    onChallengeAccepted(round: number, nextReward: number) {
      r.events.push(`challenge:${round}:${nextReward}`);
      r.challengesAccepted.push({ round, nextReward });
    },
    onLoseAll(total: number) {
      r.events.push(`loseAll:${total}`);
      r.loseAllFired = true;
    },
  };
  return r;
}

function makeTicker(): Ticker {
  const t = new Ticker();
  t.autoStart = false;
  t.start();
  return t;
}

// Mulberry32 — small deterministic PRNG used to make the multi-round FSM
// tests reproducible without rigging the FSM itself. Seeds chosen so the
// test bodies stay readable.
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Drive the FSM through one round using a "stand at STAND_AT" strategy.
 * Returns the terminal Sequence state — either 'PostGame' (won) or 'Finished' (lost / claimed).
 */
async function playRound(seq: Sequence, standAt = 17, scoreEvents: () => string[]): Promise<void> {
  for (let safety = 0; safety < 20 && seq.getState() === 'Playing'; safety++) {
    const playerScores = scoreEvents().filter(e => e.startsWith('score:player'));
    const last = playerScores.at(-1);
    const score = last ? Number(last.split('=')[1]) : 0;
    if (score >= standAt) {
      await seq.onStandClicked();
      return;
    }
    await seq.onRollClicked();
  }
  if (seq.getState() === 'Playing') await seq.onStandClicked();
}

test('Sequence.start emits Playing state and start dialogue', async () => {
  const r = makeRecorder();
  const ticker = makeTicker();
  const seq = new Sequence(FAST_SCRIPT, r, ticker);
  await seq.start();
  assert.ok(r.events.includes('state:Playing'));
  assert.ok(r.events.includes('dlg:start'));
  ticker.destroy();
});

test('Sequence: stand-only path triggers opponent turn and terminates', async () => {
  const r = makeRecorder();
  const ticker = makeTicker();
  const seq = new Sequence(FAST_WIN, r, ticker);
  await seq.start();
  await seq.onStandClicked();
  assert.ok(r.events.includes('dlg:opponent_turn'), `events: ${r.events.join(',')}`);
  // Multi-round: after stand we're either in PostGame (offered claim/challenge)
  // or Finished (lost outright). Drive to a terminal state if needed.
  if (seq.getState() === 'PostGame') {
    await seq.onClaimClicked();
  }
  assert.equal(seq.getState(), 'Finished', `expected Finished, got ${seq.getState()}`);
  ticker.destroy();
});

test('Sequence: full rounds always terminate cleanly', async () => {
  // Smart-stand at 17. With FAST_WIN's heavy rigging, the player should reach
  // a terminal state every time (claim or lose), never hanging.
  const STAND_AT = 17;
  const trials = 50;
  let terminated = 0;
  for (let i = 0; i < trials; i++) {
    const r = makeRecorder();
    const ticker = makeTicker();
    const seq = new Sequence(FAST_WIN, r, ticker, { rng: mulberry32(i + 1) });
    await seq.start();
    // Play until we're not Playing.
    for (let safetyRound = 0; safetyRound < 5 && seq.getState() !== 'Finished'; safetyRound++) {
      if (seq.getState() === 'Playing') {
        await playRound(seq, STAND_AT, () => r.events);
      }
      if (seq.getState() === 'PostGame') {
        await seq.onClaimClicked();
      }
    }
    if (seq.getState() === 'Finished') terminated++;
    ticker.destroy();
  }
  assert.equal(terminated, trials, 'not every run reached Finished');
});

test('Sequence: re-entry guard prevents double-rolls', async () => {
  const r = makeRecorder();
  const ticker = makeTicker();
  const seq = new Sequence(FAST_SCRIPT, r, ticker);
  await seq.start();
  const a = seq.onRollClicked();
  const b = seq.onRollClicked();
  await Promise.all([a, b]);
  const playerRollEvents = r.events.filter(e => e === 'roll:player').length;
  assert.equal(playerRollEvents, 1, `expected 1 player roll, got ${playerRollEvents}: ${r.events.join(',')}`);
  ticker.destroy();
});

// --- Multi-round behavior --------------------------------------------------

test('multi-round: claim after round 1 fires onClaim with round-1 reward only', async () => {
  // Find a seed where the player wins round 1, then claim. winRigged has heavy
  // reroll cushioning so most seeds win — we still loop in case the first few
  // unlucky-lose.
  let foundWin = false;
  for (let seed = 1; seed <= 50 && !foundWin; seed++) {
    const r = makeRecorder();
    const ticker = makeTicker();
    const seq = new Sequence(FAST_WIN, r, ticker, { rng: mulberry32(seed) });
    await seq.start();
    await playRound(seq, 17, () => r.events);
    if (seq.getState() === 'PostGame') {
      foundWin = true;
      assert.equal(r.roundWins.length, 1, 'should have one onRoundWin event for round 1');
      assert.equal(r.roundWins[0].round, 0, 'round index should be 0');
      assert.equal(r.roundWins[0].coinsThisRound, 80, 'round 1 reward should be 80');
      assert.equal(r.roundWins[0].total, 80, 'accumulated total after round 1 should be 80');
      await seq.onClaimClicked();
      assert.equal(r.claimedCoins, 80, 'onClaim should fire with 80');
      assert.equal(seq.getState(), 'Finished');
    }
    ticker.destroy();
  }
  assert.ok(foundWin, 'no seed in 1..50 produced a round-1 win — rig may be broken');
});

test('multi-round: challenge after round 1 advances to round 2 and resets dice state', async () => {
  let foundWin = false;
  for (let seed = 1; seed <= 50 && !foundWin; seed++) {
    const r = makeRecorder();
    const ticker = makeTicker();
    const seq = new Sequence(FAST_WIN, r, ticker, { rng: mulberry32(seed) });
    await seq.start();
    await playRound(seq, 17, () => r.events);
    if (seq.getState() === 'PostGame') {
      foundWin = true;
      await seq.onChallengeClicked();
      assert.equal(r.challengesAccepted.length, 1, 'one challenge should be accepted');
      assert.equal(r.challengesAccepted[0].round, 1, 'next round index should be 1');
      assert.equal(r.challengesAccepted[0].nextReward, 160, 'next reward should be 160');
      assert.equal(seq.getState(), 'Playing', 'state should return to Playing for round 2');
      // Score events should show a reset to 0 for both sides.
      const lastPlayerScore = r.events.filter(e => e.startsWith('score:player')).at(-1);
      const lastOppScore = r.events.filter(e => e.startsWith('score:opponent')).at(-1);
      assert.equal(lastPlayerScore, 'score:player=0', 'player score should reset on challenge');
      assert.equal(lastOppScore, 'score:opponent=0', 'opponent score should reset on challenge');
    }
    ticker.destroy();
  }
  assert.ok(foundWin, 'no seed in 1..50 produced a round-1 win');
});

test('multi-round: winning all 3 rounds auto-claims the full ladder total (560)', async () => {
  // 80 + 160 + 320 = 560. With FAST_WIN rig + smart-stand, sweeping all 3 is
  // common. Try seeds until we hit a clean sweep, then verify auto-claim.
  let foundSweep = false;
  for (let seed = 1; seed <= 200 && !foundSweep; seed++) {
    const r = makeRecorder();
    const ticker = makeTicker();
    const seq = new Sequence(FAST_WIN, r, ticker, { rng: mulberry32(seed) });
    await seq.start();
    // Round 1
    await playRound(seq, 17, () => r.events);
    if (seq.getState() !== 'PostGame') { ticker.destroy(); continue; }
    await seq.onChallengeClicked();
    // Round 2
    await playRound(seq, 17, () => r.events);
    if (seq.getState() !== 'PostGame') { ticker.destroy(); continue; }
    await seq.onChallengeClicked();
    // Round 3 — should auto-claim, no challenge offered
    await playRound(seq, 17, () => r.events);
    if (seq.getState() === 'Finished' && r.claimedCoins === 560) {
      foundSweep = true;
      assert.equal(r.roundWins.length, 3, '3 round wins recorded');
      assert.deepEqual(
        r.roundWins.map(w => w.coinsThisRound),
        [80, 160, 320],
        'ladder coins per round',
      );
      assert.deepEqual(
        r.roundWins.map(w => w.total),
        [80, 240, 560],
        'running total per round',
      );
      assert.equal(r.challengesAccepted.length, 2, 'only 2 challenges accepted (no challenge after final round)');
      // No claim button click happened for the final round — must be auto.
      assert.equal(r.claimedCoins, 560, 'final auto-claim total');
    }
    ticker.destroy();
  }
  assert.ok(foundSweep, 'no seed produced a 3-round sweep — rig may be broken');
});

test('multi-round: bust on round 1 ends the game with 0 coins and fires onLose (not onLoseAll)', async () => {
  // FAST_FAIR has no reroll cushion + bustLosesAll on every round. But round 1
  // bust still ends without "losing accumulated coins" because there were none.
  let foundBust = false;
  for (let seed = 100; seed <= 300 && !foundBust; seed++) {
    const r = makeRecorder();
    const ticker = makeTicker();
    const seq = new Sequence(FAST_FAIR, r, ticker, { rng: mulberry32(seed) });
    await seq.start();
    // Keep rolling — eventually bust if seed has high rolls.
    for (let i = 0; i < 10 && seq.getState() === 'Playing'; i++) {
      await seq.onRollClicked();
    }
    if (r.events.includes('bust:player') && seq.getState() === 'Finished') {
      // Only count this as a "round-1 terminal bust" if there was no onWin
      // recorded (i.e. they didn't win a round before busting).
      if (r.roundWins.length === 0) {
        foundBust = true;
        assert.equal(r.loseAllFired, false, 'onLoseAll must NOT fire on round 1');
        assert.ok(r.events.includes('lose'), 'onLose should fire on a round 1 bust');
        assert.equal(r.claimedCoins, undefined, 'no coins claimed');
      }
    }
    ticker.destroy();
  }
  assert.ok(foundBust, 'no seed in 100..300 produced a round-1 bust');
});

test('multi-round: bust on round 2 with bustLosesAll=true fires onLoseAll', async () => {
  // FAST_MULTI_LOSEALL: round 0 is winnable (player gains 80), round 1 has no
  // cushion + bustLosesAll. Find a seed where the player wins round 0, accepts
  // the challenge, then busts round 1 → onLoseAll should report the lost 80.
  let scenarioFound = false;
  for (let seed = 1; seed <= 500 && !scenarioFound; seed++) {
    const r = makeRecorder();
    const ticker = makeTicker();
    const seq = new Sequence(FAST_MULTI_LOSEALL, r, ticker, { rng: mulberry32(seed) });
    await seq.start();
    await playRound(seq, 17, () => r.events);
    if (seq.getState() !== 'PostGame') { ticker.destroy(); continue; }
    await seq.onChallengeClicked();
    // Round 2 — keep rolling, expect to bust.
    for (let i = 0; i < 10 && seq.getState() === 'Playing'; i++) {
      await seq.onRollClicked();
    }
    if (r.loseAllFired) {
      scenarioFound = true;
      assert.equal(seq.getState(), 'Finished');
      // The player won 80 on round 1 — onLoseAll should report the lost-total.
      const lastLoseAll = r.events.find(e => e.startsWith('loseAll:'));
      assert.ok(lastLoseAll, 'loseAll event should be recorded');
      assert.equal(lastLoseAll, 'loseAll:80', 'should report the 80 coins that were lost');
    }
    ticker.destroy();
  }
  assert.ok(scenarioFound, 'no seed produced a round-2 bust after a round-1 win');
});

test('multi-round: dialogue includes challenge_offer when entering PostGame', async () => {
  let foundWin = false;
  for (let seed = 1; seed <= 50 && !foundWin; seed++) {
    const r = makeRecorder();
    const ticker = makeTicker();
    const seq = new Sequence(FAST_WIN, r, ticker, { rng: mulberry32(seed) });
    await seq.start();
    await playRound(seq, 17, () => r.events);
    if (seq.getState() === 'PostGame') {
      foundWin = true;
      assert.ok(
        r.events.includes('dlg:challenge_offer'),
        `challenge_offer dialogue should fire on PostGame entry: ${r.events.join(',')}`,
      );
    }
    ticker.destroy();
  }
  assert.ok(foundWin);
});

test('lose-rigged: player can NEVER win, gambler never busts, and its total VARIES (feels real)', async () => {
  const TRIALS = 80;
  const opponentFinals = new Set<number>();
  let standLosses = 0;
  for (let i = 0; i < TRIALS; i++) {
    const r = makeRecorder();
    const ticker = makeTicker();
    const seq = new Sequence(FAST_LOSE, r, ticker);
    await seq.start();
    await playRound(seq, 13 + (i % 7), () => r.events); // vary the player's stand 13..19

    // Every player-win path (clean win, opponent bust, OR tie) routes through
    // onWin → 'win'. Lose-rigged must be unwinnable.
    assert.ok(!r.events.includes('win'), `trial ${i}: player won — lose-rigged must be unwinnable`);
    assert.equal(r.roundWins.length, 0, `trial ${i}: a round was won`);
    // A gambler bust would hand the player the win — it must win cleanly.
    assert.ok(!r.events.includes('bust:opponent'), `trial ${i}: gambler busted`);
    // The player must NEVER hit exactly 21 (a blackjack reads like a win/tie).
    // Busting (going over) IS allowed — that's simply a loss.
    assert.ok(!r.events.includes('blackjack'), `trial ${i}: player hit exactly 21 — blackjack must never happen`);

    const opp = r.events.filter(e => e.startsWith('score:opponent=')).map(e => Number(e.split('=')[1]));
    const ply = r.events.filter(e => e.startsWith('score:player=')).map(e => Number(e.split('=')[1]));

    // When the player STOOD under 21 (an opponent turn happened and their final
    // score is < 21), the gambler must land STRICTLY above — no ties, no bust.
    const oppFinal = opp.at(-1) ?? 0;
    const playerFinal = ply.at(-1) ?? 0;
    if (oppFinal > 0 && playerFinal < 21) {
      assert.ok(oppFinal <= 21, `trial ${i}: gambler over 21 (${oppFinal})`);
      assert.ok(oppFinal > playerFinal, `trial ${i}: not a clean beat — gambler ${oppFinal} vs player ${playerFinal} (ties not allowed)`);
      opponentFinals.add(oppFinal);
      standLosses++;
    }
  }
  assert.ok(standLosses >= 10, `expected several stand-and-lose rounds, got ${standLosses}`);
  assert.ok(opponentFinals.size >= 3, `gambler total must vary (not always 21); saw: ${[...opponentFinals].sort().join(',')}`);
});
