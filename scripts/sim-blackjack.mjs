#!/usr/bin/env node
// In-process Monte-Carlo for the dice-blackjack rigs — runs the real Sequence FSM
// (no browser) thousands of times and prints the outcome distribution. This is the
// right tool for rig STATISTICS (odds, "can the player ever win/hit 21"); Playwright
// is only for a few visual/integration runs.
//
// Run:  node --import tsx --import src/playables/dice-blackjack/__tests__/setup.ts \
//             scripts/sim-blackjack.mjs [winRigged|loseRigged|fair] [games] [standAt]
//   or: npm run sim:blackjack -- loseRigged 20000
import { Ticker } from 'pixi.js';
import { Sequence } from '../src/playables/dice-blackjack/Sequence.ts';
import { SCRIPTS_BY_VARIANT } from '../src/playables/dice-blackjack/config.ts';

// The test rAF shim (setup.ts) ticks every 16ms, which makes the FSM's zero-duration
// sleeps the bottleneck. Override with an immediate scheduler so we can run thousands
// of games per second. Pixi reads globalThis.requestAnimationFrame per tick.
globalThis.requestAnimationFrame = (cb) => setImmediate(() => cb(performance.now()));

const variant = process.argv[2] || 'loseRigged';
const games = Number(process.argv[3] || 20000);
const fixedStand = process.argv[4] ? Number(process.argv[4]) : null;

const script = {
  ...SCRIPTS_BY_VARIANT[variant],
  timings: { delayBetweenPlayerRolls: 0, delayBetweenOpponentRolls: 0, delayOnBlackjack: 0, delayOnWin: 0, delayOnLose: 0, endCardDelayMs: 0 },
};

function makeTicker() { const t = new Ticker(); t.autoStart = false; t.start(); return t; }

const tally = {
  games: 0, playerWins: 0, playerBlackjacks: 0, playerBusts: 0, losses: 0,
  gamblerFinals: new Map(), playerStands: new Map(),
};

for (let g = 0; g < games; g++) {
  const ev = [];
  const rec = {
    onStateChange() {}, onDialogue() {}, onScoreChange(side, score) { ev.push(`${side}=${score}`); },
    async onDiceRoll() {}, onBust(side) { ev.push(`bust:${side}`); }, onBlackjack() { ev.push('blackjack'); },
    onWin() { ev.push('win'); }, onLose() {}, onRoundWin() {}, onClaim() {}, onChallengeAccepted() {}, onLoseAll() {},
  };
  const seq = new Sequence(script, rec, makeTicker());
  await seq.start();
  // Player strategy: stand once at/above a target (random 15..19 unless fixed).
  const standAt = fixedStand ?? (15 + Math.floor(Math.random() * 5));
  for (let i = 0; i < 25 && seq.getState() === 'Playing'; i++) {
    const ps = ev.filter(e => e.startsWith('player=')).map(e => Number(e.split('=')[1]));
    const cur = ps.at(-1) ?? 0;
    if (cur >= standAt) { await seq.onStandClicked(); break; }
    await seq.onRollClicked();
  }
  if (seq.getState() === 'Playing') await seq.onStandClicked();

  const ps = ev.filter(e => e.startsWith('player=')).map(e => Number(e.split('=')[1]));
  const os = ev.filter(e => e.startsWith('opponent=')).map(e => Number(e.split('=')[1]));
  tally.games++;
  if (ev.includes('win')) tally.playerWins++; else tally.losses++;
  if (ev.includes('blackjack')) tally.playerBlackjacks++;
  if (ev.includes('bust:player')) tally.playerBusts++;
  const pf = ps.at(-1) ?? 0, of = os.at(-1) ?? 0;
  if (of > 0 && pf < 21) tally.gamblerFinals.set(of, (tally.gamblerFinals.get(of) ?? 0) + 1);
  if (pf <= 20) tally.playerStands.set(pf, (tally.playerStands.get(pf) ?? 0) + 1);
}

const pct = (n) => `${((n / tally.games) * 100).toFixed(2)}%`;
const dist = (m) => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join('  ');
console.log(`\n=== sim: ${variant} — ${tally.games} games ===`);
console.log(`player WINS:       ${tally.playerWins}  (${pct(tally.playerWins)})`);
console.log(`player blackjacks: ${tally.playerBlackjacks}  (${pct(tally.playerBlackjacks)})`);
console.log(`player busts:      ${tally.playerBusts}  (${pct(tally.playerBusts)})`);
console.log(`losses:            ${tally.losses}  (${pct(tally.losses)})`);
console.log(`gambler final totals (clean stand-losses): ${dist(tally.gamblerFinals)}`);
console.log(`player stand totals:                       ${dist(tally.playerStands)}`);
