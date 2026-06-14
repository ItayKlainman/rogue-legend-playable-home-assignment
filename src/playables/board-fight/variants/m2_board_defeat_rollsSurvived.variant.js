// Rogue Defeat S2 — base hero, board stage 2, boss defeat, nextChapter ending.
// Run: node src/playables/board-fight/scripts/codegen.js m2_board_defeat_rollsSurvived

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
    // Fight 1: Single goblin grunt — easy intro, player dominates
    goblinIntro: {
      background: 'stage2',
      enemies: [
        { enemy: 'goblinGrunt', skin: 'default', maxHp: 100000, melee: true },
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

    // Fight 2: 3 goblin mages — mid difficulty
    goblinMageSwarm: {
      background: 'stage2',
      enemies: [
        { enemy: 'goblinMage', skin: 'default', maxHp: 55000, melee: true, xFrac: 0.62, yFrac: 0.82 },
        { enemy: 'goblinMage', skin: 'default', maxHp: 55000, melee: true, xFrac: 0.75, yFrac: 0.72 },
        { enemy: 'goblinMage', skin: 'default', maxHp: 55000, melee: true, xFrac: 0.82, yFrac: 0.93 },
      ],
      steps: [
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 28000, melee: true, rageFill: 20, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 1, damage: 25000, melee: true, category: 'combo', rageFill: 15 },
        { type: 'skill', side: 'player', actor: 0, target: 0, useAllPlayerSkills: true, damage: 15000 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 18000 },
        { type: 'attack', side: 'enemy',  actor: 1, target: 0, damage: 20000 },
        { type: 'attack', side: 'enemy',  actor: 2, target: 0, damage: 22000 },
        { type: 'attack', side: 'player', actor: 0, target: 2, damage: 26000, melee: true, rageFill: 15, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 35000, melee: true, category: 'combo', crit: true, rageFill: 15 },
        { type: 'die', actor: 0 },
        { type: 'attack', side: 'enemy',  actor: 2, target: 0, dodge: true },
        { type: 'attack', side: 'enemy',  actor: 1, target: 0, damage: 24000 },
        { type: 'attack', side: 'enemy',  actor: 2, target: 0, damage: 22000 },
        { type: 'attack', side: 'player', actor: 0, target: 1, damage: 32000, melee: true, rageFill: 20, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 1, damage: 30000, melee: true, category: 'combo', rageFill: 15 },
        { type: 'skill', side: 'player', actor: 0, target: 1, useAllPlayerSkills: true, damage: 20000 },
        { type: 'die', actor: 1 },
        { type: 'attack', side: 'player', actor: 0, target: 2, damage: 45000, melee: true, category: 'rage', dramatic: true },
        { type: 'skill', side: 'player', actor: 0, target: 2, useAllPlayerSkills: true, damage: 18000 },
        { type: 'die', actor: 2 },
      ],
      onVictory: { labelText: 'VICTORY!' },
    },

    // Fight 3: Elite — balista + 2 grunts
    eliteAmbush: {
      background: 'stage2',
      eliteFight: true,
      enemies: [
        { enemy: 'goblinBalista', skin: 'default', maxHp: 80000, melee: true, xFrac: 0.65, yFrac: 0.85 },
        { enemy: 'goblinGrunt', skin: 'default', maxHp: 50000, melee: true, xFrac: 0.78, yFrac: 0.75 },
        { enemy: 'goblinGrunt', skin: 'default', maxHp: 50000, melee: true, xFrac: 0.82, yFrac: 0.93 },
      ],
      steps: [
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 32000, melee: true, rageFill: 20, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 1, damage: 30000, melee: true, category: 'combo', rageFill: 15 },
        { type: 'skill', side: 'player', actor: 0, target: 0, useAllPlayerSkills: true, damage: 20000 },
        { type: 'attack', side: 'enemy',  actor: 1, target: 0, damage: 20000 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 28000 },
        { type: 'attack', side: 'enemy',  actor: 2, target: 0, dodge: true },
        { type: 'attack', side: 'player', actor: 0, target: 1, damage: 28000, melee: true, rageFill: 15 },
        { type: 'die', actor: 1 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 30000 },
        { type: 'attack', side: 'enemy',  actor: 2, target: 0, damage: 25000 },
        { type: 'attack', side: 'player', actor: 0, target: 2, damage: 55000, melee: true, crit: true, rageFill: 15 },
        { type: 'skill', side: 'player', actor: 0, target: 2, useAllPlayerSkills: true, damage: 22000 },
        { type: 'die', actor: 2 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 26000 },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 35000, melee: true, rageFill: 20, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 32000, melee: true, category: 'combo', crit: true, rageFill: 15 },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 50000, melee: true, category: 'rage', dramatic: true, crit: true },
        { type: 'die', actor: 0 },
      ],
      onVictory: { labelText: 'VICTORY!' },
    },

    // Boss fight: defeat — ogre + 2 goblin mages, player dies
    bossDefeat: {
      background: 'stage2',
      bossFight: true,
      enemies: [
        { enemy: 'goblinOgre', skin: 'default', maxHp: 220000, melee: true, maxRage: 100, xFrac: 0.85, yFrac: 0.85 },
        { enemy: 'goblinMage', skin: 'default', maxHp: 45000, melee: true, xFrac: 0.62, yFrac: 0.75 },
        { enemy: 'goblinMage', skin: 'default', maxHp: 45000, melee: true, xFrac: 0.62, yFrac: 0.93 },
      ],
      steps: [
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 35000, melee: true, rageFill: 15, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 1, damage: 40000, melee: true, category: 'combo', return: false },
        { type: 'attack', side: 'player', actor: 0, target: 2, damage: 38000, melee: true, category: 'combo', rageFill: 15 },
        { type: 'skill', side: 'player', actor: 0, target: 0, useAllPlayerSkills: true, damage: 22000 },
        { type: 'attack', side: 'enemy',  actor: 1, target: 0, damage: 18000 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 30000, rageFill: 50 },
        { type: 'attack', side: 'enemy',  actor: 2, target: 0, dodge: true },
        { type: 'attack', side: 'player', actor: 0, target: 1, damage: 45000, melee: true, crit: true, rageFill: 15 },
        { type: 'die', actor: 1 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 35000, rageFill: 50 },
        { type: 'attack', side: 'enemy',  actor: 2, target: 0, damage: 22000 },
        { type: 'attack', side: 'player', actor: 0, target: 2, damage: 42000, melee: true, rageFill: 15 },
        { type: 'die', actor: 2 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 45000, category: 'rage', dramatic: true },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 38000, melee: true, rageFill: 20, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 35000, melee: true, category: 'combo', crit: true },
        { type: 'skill', side: 'player', actor: 0, target: 0, useAllPlayerSkills: true, damage: 25000 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 25000 },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 30000, melee: true },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 40000, dramatic: true },
        { type: 'die', side: 'player', actor: 0 },
      ],
      onVictory: { labelText: '' },
    },
  },

  board: 'board2',
  rolls: [
    { hops: 3, major: true },
    { hops: 10, major: true },
    { hops: 9, major: true },
    { hops: 11, major: true },
  ],
  stats: { showXp: true, atkDisplay: 'bar' },
  dynamicLevelUp: true,
  use3dDice: true,
  pulseRollButton: true,
  centerEnemy: { id: 'deco.goblinOgre', scale: 0.22 },
  // Rolls [3,10,9,11] from tile 0 (dir -1) land on: 37 → 27 → 18 → 7.
  tileFloats: {
    37: 'deco.goblinGrunt',
    27: 'deco.goblinMage',
    18: 'deco.goblinBalista',
  },
  events: [
    { type: 'fight', fight: 'goblinIntro' },
    { type: 'levelup' },
    { type: 'weaponReward', weapon: 'crystalHammer', discovery: true },
    { type: 'fight', fight: 'goblinMageSwarm' },
    { type: 'levelup' },
    { type: 'heroReward', hero: 'lance', discovery: true },
    { type: 'fight', fight: 'eliteAmbush' },
    { type: 'levelup' },
    { type: 'fight', fight: 'bossDefeat' },
    { type: 'nextChapter', image: 'end_banner.webp', victoryText: 'DEFEAT', buttonText: 'Try Again!', buttonColor: 0xcc2222 },
  ],
};
