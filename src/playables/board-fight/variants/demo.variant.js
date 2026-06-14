// Demo variant — mirrors m1_board_victory_splash.
// Run: node src/playables/board-fight/scripts/codegen.js demo

module.exports = {
  logoOverlay: true,
  hitsCounter: true,
  xpFlyAfterFights: true,
  initialState: {
    hp: 182800, maxHp: 182800, atk: 51600, coins: 100,
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
    slimeSwarm: {
      enemies: [
        { enemy: 'slime', skin: 'default', maxHp: 55000, melee: true, xFrac: 0.62, yFrac: 0.82 },
        { enemy: 'slime', skin: 'default', maxHp: 55000, melee: true, xFrac: 0.75, yFrac: 0.72 },
        { enemy: 'slime', skin: 'default', maxHp: 55000, melee: true, xFrac: 0.82, yFrac: 0.93 },
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

    // Fight 3: Elite — commander + 2 skeletons
    elitePatrol: {
      eliteFight: true,
      enemies: [
        { enemy: 'skeletonCommander', skin: 'default', maxHp: 80000, melee: true, xFrac: 0.65, yFrac: 0.85 },
        { enemy: 'skeleton', skin: 'default', maxHp: 50000, melee: true, xFrac: 0.78, yFrac: 0.75 },
        { enemy: 'skeleton', skin: 'default', maxHp: 50000, melee: true, xFrac: 0.82, yFrac: 0.93 },
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

    // Boss fight: victory — king + 2 slimes
    bossVictory: {
      bossFight: true,
      enemies: [
        { enemy: 'skeletonKing', skin: 'default', maxHp: 220000, melee: true, maxRage: 100, xFrac: 0.85, yFrac: 0.85 },
        { enemy: 'slime', skin: 'default', maxHp: 45000, melee: true, xFrac: 0.62, yFrac: 0.75 },
        { enemy: 'slime', skin: 'default', maxHp: 45000, melee: true, xFrac: 0.62, yFrac: 0.93 },
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
        { type: 'vignette', on: true },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 55000, melee: true, rageFill: 20, return: false },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 50000, melee: true, category: 'combo', crit: true, rageFill: 20 },
        { type: 'skill', side: 'player', actor: 0, target: 0, useAllPlayerSkills: true, damage: 25000 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, damage: 20000 },
        { type: 'attack', side: 'enemy',  actor: 0, target: 0, dodge: true },
        { type: 'attack', side: 'player', actor: 0, target: 0, damage: 80000, melee: true, category: 'rage', dramatic: true, crit: true },
        { type: 'die', actor: 0 },
        { type: 'vignette', on: false },
      ],
      onVictory: { labelText: 'VICTORY!' },
    },
  },

  board: 'board1',
  // Each fight + each new tile event (treasure/dialogue/lucky wheel/slot/shop/
  // tile-popup/loot) takes its own roll — 11 rolls total to surface every Phase
  // 1/2/3 system. Hops keep the player progressing around the board toward the
  // boss; the final roll keeps `major: true` so the boss reveal triggers.
  rolls: [
    { hops: 4, major: true },  // 1: skeletonIntro fight (lands on tile 33)
    { hops: 2 },               // 2: tilePopup ATK +12% (tile 31)
    { hops: 2 },               // 3: loot +50 coins (tile 29)
    { hops: 3, major: true },  // 4: slimeSwarm fight (tile 26)
    { hops: 2 },               // 5: treasure (tile 24)
    { hops: 2 },               // 6: dialogue / campfire (tile 22)
    { hops: 3, major: true },  // 7: elitePatrol fight (tile 19)
    { hops: 2 },               // 8: luckyWheel (tile 17)
    { hops: 2 },               // 9: slotReels (tile 15)
    { hops: 2 },               // 10: shop (tile 13)
    { hops: 3, major: true },  // 11: bossVictory fight (tile 10)
  ],
  stats: { showXp: true, atkDisplay: 'bar' },
  dynamicLevelUp: true,
  use3dDice: true,
  pulseRollButton: true,
  // CTA: tapping the 2nd skill pick also fires safeInstall() (open store).
  ctaTriggers: [
    { on: 'levelUpChoice', n: 2 },
  ],
  // Boss visible at board center throughout the game; after the final roll,
  // hero arc-hops in front of it before the final fight.
  centerEnemy: 'deco.skeletonKing',
  // Decorative previews on the 4 fight-tiles. (Tile indices computed from
  // cumulative hops from start tile 0, dir -1.)
  tileFloats: {
    33: 'deco.skeleton',
    26: 'deco.slime',
    19: 'deco.skeletonCommander',
    8:  'deco.skeletonKing',
  },
  events: [
    // ── Roll 1: skeleton intro fight ──────────────────────────────────────
    { type: 'fight', fight: 'skeletonIntro' },
    // (auto-chains: levelup + weaponReward — neither requires a roll)
    { type: 'levelup' },
    { type: 'weaponReward', weapon: 'crystalHammer', discovery: true, boardFloat: true },

    // ── Roll 2: tile-popup (Phase 1) — ATK +12% green speech bubble ───────
    { type: 'tilePopup', stat: 'atk', pct: 12 },

    // ── Roll 3: loot (Phase 1) — golden +50 coins toast + particle burst ──
    { type: 'loot', currency: 'coin', amount: 50 },

    // ── Roll 4: slime swarm fight ─────────────────────────────────────────
    { type: 'fight', fight: 'slimeSwarm' },
    { type: 'levelup' },
    { type: 'heroReward', hero: 'fireWizard', discovery: true, boardFloat: true },

    // ── Roll 5: treasure (Phase 2) — single-tap chest + coin reward popup ─
    { type: 'treasure', config: { coins: 250 } },

    // ── Roll 6: dialogue (Phase 2) — campfire-style 2-button decision ─────
    { type: 'dialogue', config: {
      title: 'A Moment To Rest',
      body: 'So tired...',
      options: [
        { label: 'Rest',  resultText: 'Restore 30% HP',
          outcomes: [{ applyDelta: { hpPct: 30 } }] },
        { label: 'Train', resultText: '+10% ATK',
          outcomes: [{ applyDelta: { atkPct: 10 } }] },
      ],
    }},

    // ── Roll 7: elite patrol fight ────────────────────────────────────────
    { type: 'fight', fight: 'elitePatrol' },
    { type: 'levelup' },

    // ── Roll 8: luckyWheel (Phase 3) — highlight-cycle skill grant ────────
    { type: 'luckyWheel', config: {
      prizes: [
        'fireballBarrage', 'chainLightning', 'shurikenFlurry', 'berserk',
        'flameStrike', 'thunderstorm', 'fumaShuriken', 'meteorStorm',
        'thunderGod', 'deadlyStars', 'fireballBarrage', 'chainLightning',
      ],
      winningIndex: 5,
    }},

    // ── Roll 9: slotReels (Phase 3) — 3-reel staggered spin, +300 coins ───
    { type: 'slotReels', config: {
      rewardLevel: 2,
      reward: { coins: 300 },
    }},

    // ── Roll 10: shop (Phase 3) — merchant + 3 cards + reroll/exit ───────
    { type: 'shop', config: {
      style: 'normal',
      items: [
        { kind: 'skill', label: 'Meteor Storm',  description: 'Devastating fire skill',     price: 200,
          effect: { skill: 'meteorStorm' } },
        { kind: 'stat',  label: 'Max HP +20%',   description: 'Permanently increase max HP', price: 150,
          effect: { hpPct: 20 } },
        { kind: 'heal',  label: 'Heal 30%',      description: 'Restore 30% of max HP',       price: 80,
          effect: { hpPct: 30 } },
      ],
    }},

    // ── Roll 11: boss victory + gameEnd ───────────────────────────────────
    { type: 'fight', fight: 'bossVictory' },
    { type: 'gameEnd', image: 'splash screen 2.webp' },
  ],
};
