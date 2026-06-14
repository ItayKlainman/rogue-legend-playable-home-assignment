// Rogue Defeat variant — base hero, board stage 1, boss defeat ending.
// Run: node src/playables/board-fight/scripts/codegen.js m1_board_defeat_rollsSurvived

module.exports = {
  logoOverlay: true,
  hitsCounter: true,
  xpFlyAfterFights: true,
  initialState: {
    hp: 182800, maxHp: 182800, atk: 51600,
    hero: 'base',
    weapon: 'warriorBlade',
  },
  allSkills: [
    'chainLightning', 'thunderstorm', 'thunderGod',
    'fireballBarrage', 'flameStrike', 'meteorStorm',
    'shurikenFlurry', 'fumaShuriken', 'deadlyStars',
    'berserk',
  ],

  fights: {
    // Fight 1: Single skeleton warrior — easy intro, player dominates
    skeletonIntro: {
      enemies: [
        { enemy: 'skeleton', skin: 'default', maxHp: 100000, melee: true },
      ],
      steps: [
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 35000, melee: true, rageFill: 25, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 30000, melee: true, category: 'combo', rageFill: 25 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 8000 },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 45000, melee: true, crit: true },
        { type: 'die', actor: 0 },
      ],
      onVictory: { labelText: 'VICTORY!' },
    },

    // Fight 2: 3 slimes — mid difficulty, player drops to ~50% HP
    // Player rage: 20+15+15+15+20+15 = 100
    // Skills always placed AFTER player melee attacks
    // return: false only before combos
    slimeSwarm: {
      enemies: [
        { enemy: 'slime', skin: 'default', maxHp: 55000, melee: true, xFrac: 0.62, yFrac: 0.82 },
        { enemy: 'slime', skin: 'default', maxHp: 55000, melee: true, xFrac: 0.75, yFrac: 0.72 },
        { enemy: 'slime', skin: 'default', maxHp: 55000, melee: true, xFrac: 0.82, yFrac: 0.93 },
      ],
      steps: [
        // Round 1: player opener → skill → enemies respond
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 28000, melee: true, rageFill: 20, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 1, damage: 25000, melee: true, category: 'combo', rageFill: 15 },
        { type: 'skill', side: 'player', actor: 0, target: 0, useAllPlayerSkills: true, damage: 15000 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 18000 },
        { type: 'attack', side: 'enemy',  actor: 1, target: 0, damage: 20000 },
        { type: 'attack', side: 'enemy',  actor: 2, target: 0, damage: 22000 },
        // Round 2: clear slime 0
        { type: 'attack', side: 'player', actor: 0, target: 2, damage: 26000, melee: true, rageFill: 15, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 35000, melee: true, category: 'combo', crit: true, rageFill: 15 },
        { type: 'die', actor: 0 },
        { type: 'attack', side: 'enemy',  actor: 2, target: 0, dodge: true },
        { type: 'attack', side: 'enemy',  actor: 1, target: 0, damage: 24000 },
        { type: 'attack', side: 'enemy',  actor: 2, target: 0, damage: 22000 },
        // Round 3: clear slime 1
        { type: 'attack', side: 'player', actor: 0, target: 1, damage: 32000, melee: true, rageFill: 20, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 1, damage: 30000, melee: true, category: 'combo', rageFill: 15 },
        { type: 'skill', side: 'player', actor: 0, target: 1, useAllPlayerSkills: true, damage: 20000 },
        { type: 'die', actor: 1 },
        // Rage finisher on slime 2
        { type: 'attack', side: 'player', actor: 0, target: 2, damage: 45000, melee: true, category: 'rage', dramatic: true },
        { type: 'skill', side: 'player', actor: 0, target: 2, useAllPlayerSkills: true, damage: 18000 },
        { type: 'die', actor: 2 },
      ],
      onVictory: { labelText: 'VICTORY!' },
    },

    // Fight 3: Elite — commander at middle (index 0, yFrac 0.85), skeletons at top/bottom
    // Player rage: 20+15+15+15+20+15 = 100
    // Melee-only damage >= maxHp for each enemy
    elitePatrol: {
      eliteFight: true,
      enemies: [
        { enemy: 'skeletonCommander', skin: 'default', maxHp: 80000, melee: true, xFrac: 0.65, yFrac: 0.85 },
        { enemy: 'skeleton', skin: 'default', maxHp: 50000, melee: true, xFrac: 0.78, yFrac: 0.75 },
        { enemy: 'skeleton', skin: 'default', maxHp: 50000, melee: true, xFrac: 0.82, yFrac: 0.93 },
      ],
      steps: [
        // Round 1: player opener → skill → enemies respond
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 32000, melee: true, rageFill: 20, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 1, damage: 30000, melee: true, category: 'combo', rageFill: 15 },
        { type: 'skill', side: 'player', actor: 0, target: 0, useAllPlayerSkills: true, damage: 20000 },
        { type: 'attack', side: 'enemy',  actor: 1, target: 0, damage: 20000 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 28000 },
        { type: 'attack', side: 'enemy',  actor: 2, target: 0, dodge: true },
        // Round 2: clear skeleton 1
        { type: 'attack', side: 'player', actor: 0, target: 1, damage: 28000, melee: true, rageFill: 15 },
        { type: 'die', actor: 1 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 30000 },
        { type: 'attack', side: 'enemy',  actor: 2, target: 0, damage: 25000 },
        // Round 3: clear skeleton 2 (melee attack before skill)
        { type: 'attack', side: 'player', actor: 0, target: 2, damage: 55000, melee: true, crit: true, rageFill: 15 },
        { type: 'skill', side: 'player', actor: 0, target: 2, useAllPlayerSkills: true, damage: 22000 },
        { type: 'die', actor: 2 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 26000 },
        // Round 4: finish commander with rage
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 35000, melee: true, rageFill: 20, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 32000, melee: true, category: 'combo', crit: true, rageFill: 15 },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 50000, melee: true, category: 'rage', dramatic: true, crit: true },
        { type: 'die', actor: 0 },
      ],
      onVictory: { labelText: 'VICTORY!' },
    },

    // Boss fight: king at middle (index 0, yFrac 0.85), slimes at top/bottom
    // King rage: 50+50 = 100 (1 rage attack only)
    // Player rage: 15+15+15+15+20 = 80 (doesn't reach 100, player dies first)
    bossDefeat: {
      bossFight: true,
      enemies: [
        { enemy: 'skeletonKing', skin: 'default', maxHp: 220000, melee: true, maxRage: 100, xFrac: 0.85, yFrac: 0.85 },
        { enemy: 'slime', skin: 'default', maxHp: 45000, melee: true, xFrac: 0.62, yFrac: 0.75 },
        { enemy: 'slime', skin: 'default', maxHp: 45000, melee: true, xFrac: 0.62, yFrac: 0.93 },
      ],
      steps: [
        // Round 1: same aggressive opener → skill → enemies respond → clear slime 1
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 35000, melee: true, rageFill: 15, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 1, damage: 40000, melee: true, category: 'combo', return: false },
        { type: 'attack', side: 'player', actor: 0, target: 2, damage: 38000, melee: true, category: 'combo', rageFill: 15 },
        { type: 'skill', side: 'player', actor: 0, target: 0, useAllPlayerSkills: true, damage: 22000 },
        { type: 'attack', side: 'enemy',  actor: 1, target: 0, damage: 18000 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 30000, rageFill: 50 },
        { type: 'attack', side: 'enemy',  actor: 2, target: 0, dodge: true },
        { type: 'attack', side: 'player', actor: 0, target: 1, damage: 45000, melee: true, crit: true, rageFill: 15 },
        { type: 'die', actor: 1 },
        // Round 2: king punishes, clear slime 2
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 35000, rageFill: 50 },
        { type: 'attack', side: 'enemy',  actor: 2, target: 0, damage: 22000 },
        { type: 'attack', side: 'player', actor: 0, target: 2, damage: 42000, melee: true, rageFill: 15 },
        { type: 'die', actor: 2 },
        // Round 3: king rages (50+50=100), player fights back
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 45000, category: 'rage', dramatic: true },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 38000, melee: true, rageFill: 20, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 35000, melee: true, category: 'combo', crit: true },
        { type: 'skill', side: 'player', actor: 0, target: 0, useAllPlayerSkills: true, damage: 25000 },
        // Round 4: king finishes the player — no clutch dodge, no second rage
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 25000 },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 30000, melee: true },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 40000, dramatic: true },
        { type: 'die', side: 'player', actor: 0 },
      ],
      onVictory: { labelText: '' },
    },
  },

  board: 'board1',
  rolls: [
    { hops: 3, major: true },
    { hops: 11, major: true },
    { hops: 10, major: true },
    { hops: 12, major: true },
  ],
  stats: { showXp: true, atkDisplay: 'bar' },
  dynamicLevelUp: true,
  use3dDice: true,
  pulseRollButton: true,
  centerEnemy: 'deco.skeletonKing',
  // Enemy idle decorations previewing each fight's opponent at its tile.
  // Rolls [3,11,10,12] from tile 0 (dir -1) land on: 37 → 26 → 16 → 4.
  tileFloats: {
    37: 'deco.skeleton',
    26: 'deco.slime',
    16: 'deco.skeletonCommander',
  },
  events: [
    { type: 'fight', fight: 'skeletonIntro' },
    { type: 'levelup' },
    { type: 'weaponReward', weapon: 'crystalHammer', discovery: true },
    { type: 'fight', fight: 'slimeSwarm' },
    { type: 'levelup' },
    { type: 'heroReward', hero: 'fireWizard', discovery: true },
    { type: 'fight', fight: 'elitePatrol' },
    { type: 'levelup' },
    { type: 'fight', fight: 'bossDefeat' },
    { type: 'nextChapter', image: 'end_banner.webp', victoryText: 'DEFEAT', buttonText: 'Try Again!', buttonColor: 0xcc2222 },
  ],
};
