// Combo Direction B — dice-blackjack cold-open (win-rigged) → board → one scripted spin
// → skeleton fight → blackjack end card.
// DIRECTION B (cold-open) shape: the dice-blackjack scene plays FIRST, full-screen, with
// its own arcade music (leadingEvents, before the board mounts); THEN the board appears,
// the player does ONE scripted spin that lands on a tile and triggers the skeletonIntro
// fight; victory; then the blackjack end card (events). Do not confuse with Direction A,
// where the board comes first and dice-blackjack is an in-`events` mid-game beat.
// Run: node src/playables/board-fight/scripts/codegen.js bj_cold_open_winRigged --skip-active

module.exports = {
  initialState: {
    hp: 182800, maxHp: 182800, atk: 51600,
    hero: 'base',
    weapon: 'warriorBlade',
    // Full lightning build, owned from the start. codegen passes this through to
    // state.skills; the fight fires it via useAllPlayerSkills — no pick needed.
    skills: ['chainLightning', 'thunderstorm', 'thunderGod'],
    // After the cold-open minigame the hero stands on the bj tile (tile 4) — the
    // board "continues" the run from where the blackjack just happened.
    boardTileIndex: 4,
  },
  // The hero enters with a full LIGHTNING BUILD pre-loaded (no level-up pick) — see
  // initialState.skills. allSkills supplies the SkillConfig (icon/rarity) for the
  // in-fight skill bar; only chainLightning has a VFX handler (thunderstorm / thunderGod
  // are tier-upgrade flags it reads → mega bolt + electricity splash).
  allSkills: ['chainLightning', 'thunderstorm', 'thunderGod'],

  fights: {
    // Three skeleton warriors. The hero owns a full lightning build and wipes them
    // with one dramatic mega chain-lightning cast. chainLightning splits step.damage
    // PER living enemy (damage / livingEnemies / 6 bolts), so 270000 / 3 ≈ 90000 each
    // (≈76.5k at -15% variance) > 60000 maxHp → clean visible wipe; die steps follow.
    skeletonIntro: {
      enemies: [
        { enemy: 'skeleton', skin: 'default', maxHp: 60000, melee: true, xFrac: 0.55, yFrac: 0.85 },
        { enemy: 'skeleton', skin: 'default', maxHp: 60000, melee: true, xFrac: 0.70, yFrac: 0.72 },
        { enemy: 'skeleton', skin: 'default', maxHp: 60000, melee: true, xFrac: 0.83, yFrac: 0.95 },
      ],
      steps: [
        // pacing + rage build (melee is flavor; the lightning is the star)
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 22000, melee: true, rageFill: 30, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 1, damage: 20000, melee: true, category: 'combo', rageFill: 30 },
        // one danger beat
        { type: 'attack', side: 'enemy',  actor: 2, target: 0, damage: 9000 },
        // dramatic mega chain-lightning wipe — hits ALL living skeletons
        { type: 'skill',  side: 'player', actor: 0, target: 0, useAllPlayerSkills: true, dramatic: true, damage: 270000 },
        { type: 'die', actor: 0 },
        { type: 'die', actor: 1 },
        { type: 'die', actor: 2 },
      ],
      onVictory: { labelText: 'VICTORY!' },
    },
  },

  board: 'board1',
  // One scripted spin from the bj tile (4). board1 is direction -1 (clockwise =
  // decreasing index), so a 5-hop roll (a 3 + 2): 4 → 3 → 2 → 1 → 0 → 39 lands on
  // tile 39 (a skull/fight tile), which triggers the skeletonIntro fight.
  rolls: [{ hops: 5, major: true }],

  // Decorate the landing tile (39) with an idle skeleton so it reads as a fight tile.
  tileFloats: { 39: 'deco.skeleton' },

  // Single-spin FTUE: pulse the roll button (flag only, no asset cost).
  pulseRollButton: true,

  // Cold-open: the embedded dice-blackjack scene plays full-screen BEFORE the board mounts.
  // music: true makes the embedded scene play its arcade track during the cold-open.
  leadingEvents: [{ type: 'diceBlackjack', rig: 'winRigged', music: true }],

  events: [
    { type: 'fight', fight: 'skeletonIntro' },
    { type: 'endCard' },
  ],
};
