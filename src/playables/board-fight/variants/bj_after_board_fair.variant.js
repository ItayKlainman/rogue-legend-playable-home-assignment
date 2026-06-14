// Combo Direction A — board → spin to a fight tile → fight → spin to the bj tile →
// dice-blackjack (fair — plays out per RNG, NO forced outcome) → blackjack end card.
//
// The hero starts at tile 14 and runs CLOCKWISE (board1 is direction -1 = decreasing index):
//   spin 1 = 6 hops: 14 → 8  → lands on the (skull) fight tile → skeletonIntro fight
//   spin 2 = 4 hops:  8 → 4  → lands on the bj tile → embedded dice-blackjack (fair)
//   → blackjack end card (auto-chains; requiresRoll(endCard) === false).
// Run: node src/playables/board-fight/scripts/codegen.js bj_after_board_fair --skip-active

module.exports = {
  initialState: {
    hp: 182800, maxHp: 182800, atk: 51600,
    hero: 'base',
    weapon: 'warriorBlade',
    // Full lightning build, owned from the start. codegen passes this through to
    // state.skills; the fight fires it via useAllPlayerSkills — no pick needed.
    skills: ['chainLightning', 'thunderstorm', 'thunderGod'],
    // Start near the "end of the board" so the two clockwise spins land on the
    // painted fight tile (8) then the bj tile (4). (Codegen emits this now.)
    boardTileIndex: 14,
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
  // Two scripted spins, clockwise (direction -1) from start tile 14:
  //   spin 1: 6 hops → tile 8 (fight); spin 2: 4 hops → tile 4 (bj).
  rolls: [
    { hops: 6, major: true },
    { hops: 4, major: true },
  ],

  // Decorate the fight tile (8) with an idle skeleton so it reads as a fight tile.
  tileFloats: { 8: 'deco.skeleton' },

  // Single-spin FTUE: pulse the roll button (flag only, no asset cost).
  pulseRollButton: true,

  events: [
    { type: 'fight', fight: 'skeletonIntro' },
    { type: 'diceBlackjack', rig: 'fair' },
    { type: 'endCard' },
  ],
};
