// Rogue Defeat S3 FightsOnly — same as rogueDefeatS3 but no board, fights-only with progress bar.
// Run: node src/playables/board-fight/scripts/codegen.js m3_fight_defeat_rollsSurvived

module.exports = {
  logoOverlay: true,
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
    // Fight 1: Single cave spider — easy intro
    spiderIntro: {
      background: 'stage3',
      enemies: [
        { enemy: 'caveSpider', skin: 'default', maxHp: 100000, melee: true },
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

    // Fight 2: 3 red shrooms — mid difficulty
    shroomSwarm: {
      background: 'stage3',
      enemies: [
        { enemy: 'redShroom', skin: 'default', maxHp: 55000, melee: true, xFrac: 0.62, yFrac: 0.82 },
        { enemy: 'redShroom', skin: 'default', maxHp: 55000, melee: true, xFrac: 0.75, yFrac: 0.72 },
        { enemy: 'redShroom', skin: 'default', maxHp: 55000, melee: true, xFrac: 0.82, yFrac: 0.93 },
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

    // Fight 3: Elite — stone elemental + 2 cave spiders
    elementalElite: {
      background: 'stage3',
      eliteFight: true,
      enemies: [
        { enemy: 'stoneElemental', skin: 'default', maxHp: 80000, melee: true, xFrac: 0.65, yFrac: 0.85 },
        { enemy: 'caveSpider', skin: 'default', maxHp: 50000, melee: true, xFrac: 0.78, yFrac: 0.75 },
        { enemy: 'caveSpider', skin: 'default', maxHp: 50000, melee: true, xFrac: 0.82, yFrac: 0.93 },
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

    // Boss fight: defeat — ancient construct + 2 red shrooms, player dies
    bossDefeat: {
      background: 'stage3',
      bossFight: true,
      enemies: [
        { enemy: 'ancientConstruct', skin: 'default', maxHp: 220000, melee: true, maxRage: 100, xFrac: 0.85, yFrac: 0.85 },
        { enemy: 'redShroom', skin: 'default', maxHp: 45000, melee: true, xFrac: 0.62, yFrac: 0.75 },
        { enemy: 'redShroom', skin: 'default', maxHp: 45000, melee: true, xFrac: 0.62, yFrac: 0.93 },
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

  showFightProgress: true,
  stats: { showXp: true, atkDisplay: 'bar' },
  dynamicLevelUp: true,
  events: [
    { type: 'levelup', layout: 'horizontal' },
    { type: 'fight', fight: 'spiderIntro' },
    { type: 'levelup', layout: 'horizontal' },
    { type: 'weaponReward', weapon: 'crystalHammer' },
    { type: 'fight', fight: 'shroomSwarm' },
    { type: 'levelup', layout: 'horizontal' },
    { type: 'heroReward', hero: 'lance' },
    { type: 'fight', fight: 'elementalElite' },
    { type: 'levelup', layout: 'horizontal' },
    { type: 'fight', fight: 'bossDefeat' },
    { type: 'nextChapter', image: 'end_banner.webp', victoryText: 'DEFEAT', buttonText: 'Try Again!', buttonColor: 0xcc2222 },
  ],
};
