// Port of pocketroll's DiceBlackjackSequence with multi-round (Double-or-Nothin')
// extension layered on. Decoupled from the renderer via a listener interface —
// the scene wires actual UI updates. RNG is injectable for deterministic tests.

import type { Ticker } from 'pixi.js';
import { delay } from '@shared/tween';
import { RigPolicy } from './RigPolicy';
import type { BlackjackScript, DialogueKey } from './config';

export type SequenceState = 'Playing' | 'PostGame' | 'Finished';
export type Side = 'player' | 'opponent';
export type DiceFaces = readonly [number, number];

export interface SequenceListener {
  onStateChange(state: SequenceState): void;
  onDialogue(key: DialogueKey, text: string): void;
  onScoreChange(side: Side, score: number): void;
  onDiceRoll(side: Side, faces: DiceFaces): Promise<void>;
  onBust(side: Side): void;
  onBlackjack(): void;
  onWin(): void;
  onLose(): void;
  /** Fired right after onWin with the round's coin reward + running total. */
  onRoundWin(round: number, coinsThisRound: number, totalCoins: number): void;
  /** Terminal: player took the coins. Total is the accumulated reward. */
  onClaim(totalCoins: number): void;
  /** Player accepted the double-or-nothing for the next round. */
  onChallengeAccepted(round: number, nextReward: number): void;
  /**
   * Terminal: player busted on a round flagged bustLosesAll, draining the
   * accumulated coins. `lostTotal` is the amount that was drained (i.e. the
   * coins they had right before busting).
   */
  onLoseAll(lostTotal: number): void;
}

export interface SequenceOptions {
  /** Injected RNG (defaults to Math.random); flows through to RigPolicy. */
  rng?: () => number;
}

export class Sequence {
  private readonly rig: RigPolicy;
  private state: SequenceState = 'Playing';
  private playerScore = 0;
  private opponentScore = 0;
  private playerBustCount = 0;
  private isRolling = false;
  private currentRound = 0;
  private accumulatedCoins = 0;

  constructor(
    private readonly script: BlackjackScript,
    private readonly listener: SequenceListener,
    private readonly ticker: Ticker,
    options: SequenceOptions = {},
  ) {
    this.rig = new RigPolicy(script, { rng: options.rng });
  }

  async start(): Promise<void> {
    this.transitionTo('Playing');
    this.listener.onDialogue('start', this.script.dialogue.start);
  }

  async onRollClicked(): Promise<void> {
    if (this.state !== 'Playing' || this.isRolling) return;
    this.isRolling = true;

    const { faces, sum } = this.rig.rollForPlayer(this.playerScore, this.currentRound);
    this.playerScore += sum;
    await this.listener.onDiceRoll('player', faces);
    this.listener.onScoreChange('player', this.playerScore);
    await sleep(this.ticker, this.script.timings.delayBetweenPlayerRolls);

    const max = this.script.round.maxScore;
    if (this.playerScore < max) {
      this.isRolling = false;
      return;
    }
    if (this.playerScore > max) {
      this.playerBustCount++;
      this.listener.onDialogue('player_bust', this.script.dialogue.player_bust);
      this.listener.onBust('player');
      await sleep(this.ticker, this.script.timings.delayOnLose);
      // Soft-reset only on the very first round (round 0). Mirrors the live
      // game's "first bust forgiven" pity rule. From round 1 onward we don't
      // forgive: this is where loseRigged drains the player's stack.
      if (
        this.currentRound === 0 &&
        this.script.rig.resetOnFirstBust &&
        this.playerBustCount < 2
      ) {
        this.softReset();
        return;
      }
      this.endOnPlayerBust();
      return;
    }
    // Exactly maxScore — blackjack.
    this.listener.onDialogue('player_blackjack', this.script.dialogue.player_blackjack);
    this.listener.onBlackjack();
    await sleep(this.ticker, this.script.timings.delayOnBlackjack);
    this.isRolling = false;
    await this.opponentTurn();
  }

  async onStandClicked(): Promise<void> {
    if (this.state !== 'Playing' || this.isRolling) return;
    this.isRolling = true;
    await this.opponentTurn();
  }

  /**
   * Player chose to take their coins. Terminal. Fires onClaim with the
   * accumulated total and transitions to Finished.
   */
  async onClaimClicked(): Promise<void> {
    if (this.state !== 'PostGame') return;
    this.transitionTo('Finished');
    this.listener.onClaim(this.accumulatedCoins);
  }

  /**
   * Player chose to go double-or-nothing on the next round. Resets dice
   * state, fires onChallengeAccepted, returns to Playing.
   */
  async onChallengeClicked(): Promise<void> {
    if (this.state !== 'PostGame') return;
    if (this.currentRound >= this.script.rounds.length - 1) return;
    this.currentRound++;
    this.playerScore = 0;
    this.opponentScore = 0;
    this.playerBustCount = 0;
    this.isRolling = false;
    this.listener.onScoreChange('player', 0);
    this.listener.onScoreChange('opponent', 0);
    const nextReward = this.script.rounds[this.currentRound].coins;
    this.listener.onChallengeAccepted(this.currentRound, nextReward);
    this.transitionTo('Playing');
    this.listener.onDialogue('start', this.script.dialogue.start);
  }

  private async opponentTurn(): Promise<void> {
    this.listener.onDialogue('opponent_turn', this.script.dialogue.opponent_turn);

    const max = this.script.round.maxScore;
    const forceBust = this.script.rig.forceOpponentBust === true;
    const round = this.script.rounds[this.currentRound] ?? this.script.rounds[this.script.rounds.length - 1];
    const houseWins = round.forceOpponentWin === true;

    // Default: opponent rolls until > playerScore (then stops, having beaten the
    // player). forceOpponentBust: opponent KEEPS rolling past the player until it
    // overshoots — guarantees a gambler bust (winRigged's always-win promise).
    // houseWins (loseRigged): climb until it matches/beats the player OR hits
    // maxScore — rollForOpponent never busts and lands in the winning band.
    while (
      forceBust
        ? this.opponentScore <= max
        : houseWins
          ? (this.opponentScore <= this.playerScore && this.opponentScore < max)
          : this.opponentScore <= this.playerScore
    ) {
      const { faces, sum } = this.rig.rollForOpponent(
        this.opponentScore,
        this.playerScore,
        this.currentRound,
      );
      this.opponentScore += sum;
      await this.listener.onDiceRoll('opponent', faces);
      this.listener.onScoreChange('opponent', this.opponentScore);
      await sleep(this.ticker, this.script.timings.delayBetweenOpponentRolls);
      if (this.opponentScore > max) break;
    }

    if (this.opponentScore > max) {
      this.listener.onDialogue('opponent_bust', this.script.dialogue.opponent_bust);
      this.listener.onBust('opponent');
      await sleep(this.ticker, this.script.timings.delayOnWin);
      this.endOnPlayerWin();
      return;
    }
    if (this.opponentScore > this.playerScore) {
      this.listener.onDialogue('opponent_win', this.script.dialogue.opponent_win);
      await sleep(this.ticker, this.script.timings.delayOnLose);
      // Opponent beats us on a clean round (not a bust). Treat the same as
      // a player bust for end-of-game accounting: rounds 1+ with bustLosesAll
      // drain the accumulated coins.
      this.endOnPlayerLoss();
      return;
    }
    // Tie — opponent matched us.
    if (houseWins) {
      // House wins ties: the gambler matched the player (only at maxScore, when
      // the player had 21). Resolve as a clean opponent win (loss), not a push.
      this.listener.onDialogue('opponent_win', this.script.dialogue.opponent_win);
      await sleep(this.ticker, this.script.timings.delayOnLose);
      this.endOnPlayerLoss();
      return;
    }
    // Original game treats tie as PostGame (player keeps the round); preserve that.
    this.endOnPlayerWin();
  }

  private endOnPlayerWin(): void {
    this.listener.onWin();
    const round = this.script.rounds[this.currentRound];
    this.accumulatedCoins += round.coins;
    this.listener.onRoundWin(this.currentRound, round.coins, this.accumulatedCoins);

    const isFinalRound = this.currentRound >= this.script.rounds.length - 1;
    if (isFinalRound) {
      // No more challenges available — auto-claim.
      this.transitionTo('Finished');
      this.listener.onClaim(this.accumulatedCoins);
      return;
    }
    this.transitionTo('PostGame');
    this.listener.onDialogue('post_game', this.script.dialogue.post_game);
    this.listener.onDialogue('challenge_offer', this.script.dialogue.challenge_offer);
  }

  /**
   * Player lost the round NOT via bust (opponent rolled higher cleanly).
   * Mirrors player-bust handling for terminal accounting.
   */
  private endOnPlayerLoss(): void {
    const round = this.script.rounds[this.currentRound];
    if (round.bustLosesAll && this.accumulatedCoins > 0) {
      const lost = this.accumulatedCoins;
      this.accumulatedCoins = 0;
      this.listener.onDialogue('lose_all', this.script.dialogue.lose_all);
      this.transitionTo('Finished');
      this.listener.onLoseAll(lost);
      return;
    }
    this.transitionTo('Finished');
    this.listener.onLose();
  }

  private endOnPlayerBust(): void {
    const round = this.script.rounds[this.currentRound];
    if (round.bustLosesAll && this.accumulatedCoins > 0) {
      const lost = this.accumulatedCoins;
      this.accumulatedCoins = 0;
      this.listener.onDialogue('lose_all', this.script.dialogue.lose_all);
      this.transitionTo('Finished');
      this.listener.onLoseAll(lost);
      return;
    }
    this.transitionTo('Finished');
    this.listener.onLose();
  }

  private softReset(): void {
    this.playerScore = 0;
    this.opponentScore = 0;
    this.isRolling = false;
    this.listener.onScoreChange('player', 0);
    this.listener.onScoreChange('opponent', 0);
    this.transitionTo('Playing');
  }

  private transitionTo(state: SequenceState): void {
    this.state = state;
    this.listener.onStateChange(state);
  }

  getState(): SequenceState {
    return this.state;
  }

  /** Exposed for the renderer to label the Challenge button with the next reward. */
  getCurrentRound(): number {
    return this.currentRound;
  }

  /** Exposed for the renderer to label the Claim button with the take-now amount. */
  getAccumulatedCoins(): number {
    return this.accumulatedCoins;
  }
}

function sleep(ticker: Ticker, seconds: number): Promise<void> {
  return delay(ticker, seconds * 1000);
}
