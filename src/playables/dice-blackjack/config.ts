// All tunables for the dice-blackjack playable. Mirrors the schema of
// pocketroll's DiceBlackjackMinigameData.cs, plus playable-specific rigging
// and timing knobs that aren't in the live game.
//
// Multi-round: each variant carries a 3-step Double-or-Nothin' ladder.
// Per-round retry rules live on RoundConfig so a single variant can be
// winnable early and brutal later (the loseRigged "let them taste victory
// before draining the coins" pattern).

export type DialogueKey =
  | 'start'
  | 'player_blackjack'
  | 'player_bust'
  | 'opponent_turn'
  | 'opponent_bust'
  | 'opponent_win'
  | 'post_game'
  | 'challenge_offer'
  | 'lose_all';

export interface RoundConfig {
  /** Coins awarded for winning this round. */
  coins: number;
  /** Max number of player reroll attempts when the next roll would bust. */
  retryLosingRollCount: number;
  /** 0..100 — chance per retry that a reroll actually fires. */
  retryChance: number;
  /**
   * If true, a player bust on this round drains accumulated coins to 0 and
   * fires onLoseAll. False = normal terminal lose with whatever they hadn't
   * yet earned (effectively 0 on the first round).
   */
  bustLosesAll: boolean;
  /**
   * Force the player to bust on this round. Each rollForPlayer returns the
   * highest sum that doesn't accidentally land on maxScore (no fake
   * blackjacks). Loserigged round 1+ uses this for a deterministic loss.
   */
  forcePlayerBust?: boolean;
  /**
   * Force the opponent to NEVER bust on this round. rollForOpponent retries
   * any roll that would push the gambler past maxScore. Combined with
   * forcePlayerBust → if the player happens to STAND instead of busting,
   * the gambler still wins cleanly. Loserigged round 1+ uses this.
   */
  forceOpponentNeverBust?: boolean;
  /**
   * "House always wins": the gambler climbs to a believable total that MATCHES
   * or BEATS the player (varied 17–21) without ever busting, and a tie resolves
   * as a player LOSS. The player still plays a natural hand (their own busts also
   * lose) — so the loss feels earned, not robotic. loseRigged uses this on every
   * round to be unwinnable while looking real. Supersedes forcePlayerBust /
   * forceOpponentNeverBust on the same round.
   */
  forceOpponentWin?: boolean;
  /**
   * Bar the player from landing EXACTLY on maxScore (no blackjack). rollForPlayer
   * rerolls ONLY the exact-maxScore result and keeps everything else — so the
   * player rolls a natural hand and CAN bust (go over), they just never hit 21.
   * The player rolls freely (no hold). Paired with forceOpponentWin: because a
   * standing player is therefore always < maxScore, the gambler can always land
   * STRICTLY above them → no ties.
   */
  forcePlayerNeverBlackjack?: boolean;
}

export interface BlackjackScript {
  rounds: RoundConfig[];
  round: {
    /** Target score (21). */
    maxScore: number;
  };
  rig: {
    /** If true, the player always re-rolls busts up to the round's retryLosingRollCount. */
    playerAlwaysRerollsBust: boolean;
    opponentOvershootRetries: number;
    /** 0..100 — chance per retry that the opponent commits to "stay safe". */
    opponentOvershootChance: number;
    /** Soft-reset round 0 once if the player busts on their first roll. */
    resetOnFirstBust: boolean;
    /**
     * If true, the opponent KEEPS rolling past the player's score until they
     * bust (overshoot maxScore). Combined with opponentOvershootRetries=0, this
     * guarantees the gambler busts whenever the player doesn't blackjack —
     * the rule for winRigged "always win" creative.
     */
    forceOpponentBust?: boolean;
    /**
     * If true, player rolls retry up to 99 times to avoid bust (effectively
     * infinite — at worst case <0.001% chance of busting after 99 rerolls).
     * Used by winRigged so the player NEVER terminates with a bust outcome.
     */
    forcePlayerNeverBust?: boolean;
  };
  timings: {
    delayBetweenPlayerRolls: number;
    delayBetweenOpponentRolls: number;
    delayOnBlackjack: number;
    delayOnWin: number;
    delayOnLose: number;
    endCardDelayMs: number;
    /** Pause after onRoundWin coin-count animation before showing claim/challenge buttons. */
    postGameRevealMs: number;
    /** Pause on the drained 0-coin display before resolving to the end card. */
    loseAllDrainMs: number;
  };
  dialogue: Record<DialogueKey, string>;
}

export type VariantName = 'winRigged' | 'loseRigged' | 'fair';

// Snappy timings — pauses cut to the bone. Dice playbackRate stays inside the
// 1.7–2.0× chop ceiling documented in BlackjackDice.ts; the snap comes from
// collapsing the WAIT time between actions, not from speeding the tumble.
const SHARED_TIMINGS = {
  delayBetweenPlayerRolls: 0.14,    // was 0.4 → 0.22 → 0.14
  delayBetweenOpponentRolls: 0.22,  // was 0.6 → 0.32 → 0.22
  delayOnBlackjack: 0.75,           // was 1.2 → 0.9 → 0.75
  delayOnWin: 0.5,                  // was 1.0 → 0.65 → 0.5
  delayOnLose: 0.5,                 // was 0.9 → 0.65 → 0.5
  endCardDelayMs: 900,              // was 1200 → 1000 → 900
  postGameRevealMs: 380,            // was 600 → 420 → 380
  loseAllDrainMs: 800,              // was 1200 → 900 → 800
};

const SHARED_DIALOGUE: Record<DialogueKey, string> = {
  start: 'Care for a roll, traveler?',
  player_blackjack: 'BLACKJACK! Lucky one, eh?',
  player_bust: "BUST! Let's give it another go...",
  opponent_turn: 'My turn now!',
  opponent_bust: 'BUST! Well played.',
  opponent_win: 'Better luck next round!',
  post_game: 'You won! Care to risk it all?',
  challenge_offer: "But are you brave enough to try again? Double or nothin'.",
  lose_all: 'BUST! Your winnings vanish into the dust...',
};

// ---- Reward ladder --------------------------------------------------------
// Mirrors the first three tiers of DiceBlackjackShopTokensReward.cs in the
// live Unity game (80 → 160 → 240 → ...). We use 80 → 160 → 320 because the
// playable advertises a stronger doubling-feel than the game's exact rates.

const WIN_RIGGED_ROUNDS: RoundConfig[] = [
  { coins: 80,  retryLosingRollCount: 3, retryChance: 100, bustLosesAll: false },
  { coins: 160, retryLosingRollCount: 3, retryChance: 100, bustLosesAll: false },
  { coins: 320, retryLosingRollCount: 3, retryChance: 100, bustLosesAll: false },
];

const LOSE_RIGGED_ROUNDS: RoundConfig[] = [
  // Unwinnable but REAL: the player rolls freely and naturally — they can bust
  // (go over 21) like a normal hand — but forcePlayerNeverBlackjack rerolls only
  // the exact-21 result so they can NEVER land on a blackjack. If they stand
  // under 21, forceOpponentWin lands the gambler STRICTLY above them (varied,
  // never busting); because the player is never exactly 21 there are no ties.
  // The player loses every round — by their own bust or by getting edged out —
  // without the tell-tale "I keep hitting 21" or "the gambler is always 21".
  { coins: 80,  retryLosingRollCount: 0, retryChance: 0, bustLosesAll: true, forcePlayerNeverBlackjack: true, forceOpponentWin: true },
  { coins: 160, retryLosingRollCount: 0, retryChance: 0, bustLosesAll: true, forcePlayerNeverBlackjack: true, forceOpponentWin: true },
  { coins: 320, retryLosingRollCount: 0, retryChance: 0, bustLosesAll: true, forcePlayerNeverBlackjack: true, forceOpponentWin: true },
];

const FAIR_ROUNDS: RoundConfig[] = [
  { coins: 80,  retryLosingRollCount: 0, retryChance: 0, bustLosesAll: true },
  { coins: 160, retryLosingRollCount: 0, retryChance: 0, bustLosesAll: true },
  { coins: 320, retryLosingRollCount: 0, retryChance: 0, bustLosesAll: true },
];

// ---- Variant scripts ------------------------------------------------------

// Always-win rigging: player never busts (forcePlayerNeverBust) AND opponent
// always busts (forceOpponentBust + opponentOvershootRetries:0). Player either
// hits 21 (blackjack) or stands and the gambler keeps rolling until overshoot.
export const SCRIPT_WIN_RIGGED: BlackjackScript = {
  rounds: WIN_RIGGED_ROUNDS,
  round: { maxScore: 21 },
  rig: {
    playerAlwaysRerollsBust: true,
    opponentOvershootRetries: 0,
    opponentOvershootChance: 0,
    resetOnFirstBust: true,
    forceOpponentBust: true,
    forcePlayerNeverBust: true,
  },
  timings: SHARED_TIMINGS,
  dialogue: SHARED_DIALOGUE,
};

// Round 0 is winnable (same rig as winRigged), but rounds 1+ strip the player
// of their reroll cushion AND drain accumulated coins on bust. The player
// almost certainly busts somewhere in rounds 1/2.
export const SCRIPT_LOSE_RIGGED: BlackjackScript = {
  rounds: LOSE_RIGGED_ROUNDS,
  round: { maxScore: 21 },
  rig: {
    playerAlwaysRerollsBust: true,
    opponentOvershootRetries: 2,
    opponentOvershootChance: 70,
    // First-bust soft reset only applies on round 0; the FSM enforces that.
    resetOnFirstBust: true,
  },
  timings: SHARED_TIMINGS,
  dialogue: {
    ...SHARED_DIALOGUE,
    player_bust: 'BUST! Tough luck, traveler.',
  },
};

// No rigging on either side — pure RNG. Will end in win or loss roughly
// fairly given the dice math (busts are common at maxScore=21).
export const SCRIPT_FAIR: BlackjackScript = {
  rounds: FAIR_ROUNDS,
  round: { maxScore: 21 },
  rig: {
    playerAlwaysRerollsBust: false,
    opponentOvershootRetries: 0,
    opponentOvershootChance: 0,
    resetOnFirstBust: false,
  },
  timings: SHARED_TIMINGS,
  dialogue: SHARED_DIALOGUE,
};

/** Default kept for tests + back-compat — points at the win-rigged variant. */
export const DEFAULT_SCRIPT: BlackjackScript = SCRIPT_WIN_RIGGED;

export const SCRIPTS_BY_VARIANT: Record<VariantName, BlackjackScript> = {
  winRigged: SCRIPT_WIN_RIGGED,
  loseRigged: SCRIPT_LOSE_RIGGED,
  fair: SCRIPT_FAIR,
};

export function isVariantName(s: string): s is VariantName {
  return s === 'winRigged' || s === 'loseRigged' || s === 'fair';
}
