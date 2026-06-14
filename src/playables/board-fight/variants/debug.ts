import { board1Config } from '../board/board1';
import { board2Config } from '../board/board2';
import { board3Config } from '../board/board3';
import { board4Config } from '../board/board4';
import { board5Config } from '../board/board5';
import { board6Config } from '../board/board6';
import { board7Config } from '../board/board7';
import type { BoardConfig } from '../board/BoardConfig';
import type { PlayableScript, PlayableEvent } from '../PlayableDirector';

// Debug builds load every scene class — bundle size doesn't matter in dev.
import { FightScene } from '../scenes/FightScene';
import { WeaponRewardScene } from '../scenes/WeaponRewardScene';
import { HeroRewardScene } from '../scenes/HeroRewardScene';
import { RewardDiscoveryScene } from '../scenes/RewardDiscoveryScene';
import { LevelUpScene } from '../scenes/LevelUpScene';
import { GameEndScene } from '../scenes/GameEndScene';
import { NextChapterScene } from '../scenes/NextChapterScene';
import { TreasureChestScene } from '../scenes/TreasureChestScene';
import { DialogueScene } from '../scenes/DialogueScene';
import { LuckyWheelScene } from '../scenes/LuckyWheelScene';
import { SlotReelsScene } from '../scenes/SlotReelsScene';
import { BlackjackScene } from '../scenes/BlackjackScene';
import { ShopScene } from '../scenes/ShopScene';
import { StatChangePopup } from '../board/popups/StatChangePopup';
import { LootToast } from '../board/popups/LootToast';
import { FightProgressBarH } from '../FightProgressBarH';
import { XpHud } from '../hud/XpHud';
import { AtkHud } from '../hud/AtkHud';
import { CoinHud } from '../hud/CoinHud';

const ALL_SCENE_CLASSES = {
  FightScene, WeaponRewardScene, HeroRewardScene, RewardDiscoveryScene,
  LevelUpScene, GameEndScene, NextChapterScene, TreasureChestScene,
  DialogueScene, LuckyWheelScene, SlotReelsScene, BlackjackScene, ShopScene,
  StatChangePopup, LootToast, FightProgressBarH,
  XpHud, AtkHud, CoinHud,
};

// ── Catalog imports (debug: import everything, bundle size irrelevant) ──

import { heroBundle } from '../catalog/heroes';
// Stage 1
import { skeletonBundle } from '../catalog/enemies/stage1/skeleton';
import { skeletonKingBundle } from '../catalog/enemies/stage1/skeletonKing';
import { slimeBundle } from '../catalog/enemies/stage1/slime';
import { skeletonArcherBundle } from '../catalog/enemies/stage1/skeletonArcher';
import { skeletonCommanderBundle } from '../catalog/enemies/stage1/skeletonCommander';
import { skeletonMageBundle } from '../catalog/enemies/stage1/skeletonMage';
import { wolfBundle } from '../catalog/enemies/stage1/wolf';
// Stage 2
import { goblinBalistaBundle } from '../catalog/enemies/stage2/goblinBalista';
import { goblinEngineerBundle } from '../catalog/enemies/stage2/goblinEngineer';
import { goblinGruntBundle } from '../catalog/enemies/stage2/goblinGrunt';
import { goblinHunterBundle } from '../catalog/enemies/stage2/goblinHunter';
import { goblinMageBundle } from '../catalog/enemies/stage2/goblinMage';
import { goblinOgreBundle } from '../catalog/enemies/stage2/goblinOgre';
// Stage 3
import { caveSpiderBundle } from '../catalog/enemies/stage3/caveSpider';
import { redShroomBundle } from '../catalog/enemies/stage3/redShroom';
import { stoneElementalBundle } from '../catalog/enemies/stage3/stoneElemental';
// Stage 4
import { dragonBossBundle } from '../catalog/enemies/stage4/dragonBoss';
import { snowSpiderBundle } from '../catalog/enemies/stage4/snowSpider';
import { trollCultistBundle } from '../catalog/enemies/stage4/trollCultist';
import { trollWarriorBundle } from '../catalog/enemies/stage4/trollWarrior';
import { yetiBundle } from '../catalog/enemies/stage4/yeti';
// Stage 5
import { anubisBundle } from '../catalog/enemies/stage5/anubis';
import { bastetBundle } from '../catalog/enemies/stage5/bastet';
import { desertHornetBundle } from '../catalog/enemies/stage5/desertHornet';
import { mummyGeneralBundle } from '../catalog/enemies/stage5/mummyGeneral';
import { mummyWarriorBundle } from '../catalog/enemies/stage5/mummyWarrior';
// Stage 6
import { bansheeBundle } from '../catalog/enemies/stage6/banshee';
import { bossTreeBundle } from '../catalog/enemies/stage6/bossTree';
import { ghostKnightBundle } from '../catalog/enemies/stage6/ghostKnight';
import { livingTreeBundle } from '../catalog/enemies/stage6/livingTree';

// Battle BGs
import battleBgStage1 from '../catalog/battleBgs/stage1';
import battleBgStage2 from '../catalog/battleBgs/stage2';
import battleBgStage3 from '../catalog/battleBgs/stage3';
import battleBgStage4 from '../catalog/battleBgs/stage4';
import battleBgStage5 from '../catalog/battleBgs/stage5';
import battleBgStage6 from '../catalog/battleBgs/stage6';
import battleBgStage7 from '../catalog/battleBgs/stage7';
import battleBgStage7Island from '../catalog/battleBgs/stage7Island';

// Weapons
import { WARRIORS_BLADE } from '../catalog/weapons/warriorBlade';
import { NINJA_KATANA, ninjaKatanaUIData } from '../catalog/weapons/ninjaKatana';
import { CRYSTAL_HAMMER } from '../catalog/weapons/crystalHammer';
import { DEADEYES_BLADE } from '../catalog/weapons/deadeyeBlade';
import { DUELIST_SPEAR } from '../catalog/weapons/duelistSpear';
import { EMBER_STAFF } from '../catalog/weapons/emberStaff';
import { GLACIAL_HAMMER } from '../catalog/weapons/glacialHammer';
import { NATURE_STAFF } from '../catalog/weapons/natureStaff';
import { PLAGUE_BLADE } from '../catalog/weapons/plagueBlade';
import { RADIANT_HAMMER } from '../catalog/weapons/radiantHammer';
import { SERRATED_EDGE } from '../catalog/weapons/serratedEdge';
import { STORM_STAFF } from '../catalog/weapons/stormStaff';
import { VAMPIRIC_EDGE } from '../catalog/weapons/vampiricEdge';

// Skills
import { CHAIN_LIGHTNING } from '../catalog/skills/chainLightning';
import { THUNDERSTORM } from '../catalog/skills/thunderstorm';
import { THUNDER_GOD } from '../catalog/skills/thunderGod';
import { FIREBALL_BARRAGE } from '../catalog/skills/fireballBarrage';
import { FLAME_STRIKE } from '../catalog/skills/flameStrike';
import { METEOR_STORM } from '../catalog/skills/meteorStorm';
import { SHURIKEN_FLURRY } from '../catalog/skills/shurikenFlurry';
import { FUMA_SHURIKEN } from '../catalog/skills/fumaShuriken';
import { DEADLY_STARS } from '../catalog/skills/deadlyStars';
import { BERSERK } from '../catalog/skills/berserk';
import { gameEndImage } from './demo.generated';
import nextChapterBanner from 'assets/Splash/end_banner.webp';
import { CORVUS } from '../catalog/heroes/corvus';

import type { FightSceneConfig } from '../fight/FightStep';
import type { WeaponConfig, SpineAssets } from '@shared/SpineCharacter';

const ALL_WEAPONS: { name: string; config: WeaponConfig }[] = [
  { name: 'WarriorBlade', config: WARRIORS_BLADE },
  { name: 'NinjaKatana', config: NINJA_KATANA },
  { name: 'CrystalHammer', config: CRYSTAL_HAMMER },
  { name: 'DeadeyeBlade', config: DEADEYES_BLADE },
  { name: 'DuelistSpear', config: DUELIST_SPEAR },
  { name: 'EmberStaff', config: EMBER_STAFF },
  { name: 'GlacialHammer', config: GLACIAL_HAMMER },
  { name: 'NatureStaff', config: NATURE_STAFF },
  { name: 'PlagueBlade', config: PLAGUE_BLADE },
  { name: 'RadiantHammer', config: RADIANT_HAMMER },
  { name: 'SerratedEdge', config: SERRATED_EDGE },
  { name: 'StormStaff', config: STORM_STAFF },
  { name: 'VampiricEdge', config: VAMPIRIC_EDGE },
];

const ALL_SKILLS = [
  CHAIN_LIGHTNING, THUNDERSTORM, THUNDER_GOD,
  FIREBALL_BARRAGE, FLAME_STRIKE, METEOR_STORM,
  SHURIKEN_FLURRY, FUMA_SHURIKEN, DEADLY_STARS,
  BERSERK,
];

// ── Enemy & BG data for debug scenes ──

interface EnemyEntry { name: string; bundle: SpineAssets; }
interface StageData {
  label: string;
  enemies: EnemyEntry[];
  bg: string;
}

const STAGES: StageData[] = [
  {
    label: 'Stage 1 — Graveyard',
    bg: battleBgStage1,
    enemies: [
      { name: 'Skeleton Warrior', bundle: skeletonBundle },
      { name: 'Skeleton King', bundle: skeletonKingBundle },
      { name: 'Slime', bundle: slimeBundle },
      { name: 'Skeleton Archer', bundle: skeletonArcherBundle },
      { name: 'Skeleton Commander', bundle: skeletonCommanderBundle },
      { name: 'Skeleton Mage', bundle: skeletonMageBundle },
      { name: 'Wolf', bundle: wolfBundle },
    ],
  },
  {
    label: 'Stage 2 — Goblin Camp',
    bg: battleBgStage2,
    enemies: [
      { name: 'Goblin Balista', bundle: goblinBalistaBundle },
      { name: 'Goblin Engineer', bundle: goblinEngineerBundle },
      { name: 'Goblin Grunt', bundle: goblinGruntBundle },
      { name: 'Goblin Hunter', bundle: goblinHunterBundle },
      { name: 'Goblin Mage', bundle: goblinMageBundle },
      { name: 'Goblin Ogre', bundle: goblinOgreBundle },
    ],
  },
  {
    label: 'Stage 3 — Cave',
    bg: battleBgStage3,
    enemies: [
      { name: 'Cave Spider', bundle: caveSpiderBundle },
      { name: 'Red Shroom', bundle: redShroomBundle },
      { name: 'Stone Elemental', bundle: stoneElementalBundle },
    ],
  },
  {
    label: 'Stage 4 — Ice Mountains',
    bg: battleBgStage4,
    enemies: [
      { name: 'Dragon Boss', bundle: dragonBossBundle },
      { name: 'Snow Spider', bundle: snowSpiderBundle },
      { name: 'Troll Cultist', bundle: trollCultistBundle },
      { name: 'Troll Warrior', bundle: trollWarriorBundle },
      { name: 'Yeti', bundle: yetiBundle },
    ],
  },
  {
    label: 'Stage 5 — Desert',
    bg: battleBgStage5,
    enemies: [
      { name: 'Anubis', bundle: anubisBundle },
      { name: 'Bastet', bundle: bastetBundle },
      { name: 'Desert Hornet', bundle: desertHornetBundle },
      { name: 'Mummy General', bundle: mummyGeneralBundle },
      { name: 'Mummy Warrior', bundle: mummyWarriorBundle },
    ],
  },
  {
    label: 'Stage 6 — Haunted Forest',
    bg: battleBgStage6,
    enemies: [
      { name: 'Banshee', bundle: bansheeBundle },
      { name: 'Boss Tree', bundle: bossTreeBundle },
      { name: 'Ghost Knight', bundle: ghostKnightBundle },
      { name: 'Living Tree', bundle: livingTreeBundle },
    ],
  },
  {
    label: 'Stage 7 — Ocean',
    bg: battleBgStage7,
    enemies: [],
  },
];

const ALL_BATTLE_BGS: { name: string; data: string }[] = [
  { name: 'Stage 1', data: battleBgStage1 },
  { name: 'Stage 2', data: battleBgStage2 },
  { name: 'Stage 3', data: battleBgStage3 },
  { name: 'Stage 4', data: battleBgStage4 },
  { name: 'Stage 5', data: battleBgStage5 },
  { name: 'Stage 6', data: battleBgStage6 },
  { name: 'Stage 7', data: battleBgStage7 },
  { name: 'Stage 7 Island', data: battleBgStage7Island },
];

const defaultState = {
  hp: 182800,
  maxHp: 182800,
  atk: 51600,
  skills: [] as string[],
  weapon: 'WarriorBlade' as string,
  weaponConfig: WARRIORS_BLADE,
  heroSkin: 'Base',
  boardTileIndex: 0,
};

// ── Fight configs ──

const skeletonFight: FightSceneConfig = {
  bossFight: true,
  background: battleBgStage1,
  players: [{ spine: heroBundle, skin: 'Base', maxHp: 182800, hp: 182800, maxRage: 100, melee: true }],
  enemies: [{ spine: skeletonKingBundle, skin: 'default', maxHp: 165300, melee: true, maxRage: 100 }],
  steps: [
    { type: 'attack', side: 'player', actor: 0, target: 0, damage: 51600, melee: true, rageFill: 30, return: false },
    { type: 'attack', side: 'player', actor: 0, target: 0, damage: 45000, melee: true, category: 'combo', return: false },
    { type: 'attack', side: 'player', actor: 0, target: 0, damage: 38000, melee: true, category: 'combo', rageFill: 40 },
    { type: 'skill', side: 'player', actor: 0, target: 0, usePlayerSkill: true, damage: 25000 },
    { type: 'attack', side: 'enemy', actor: 0, target: 0, damage: 12000, rageFill: 40 },
    { type: 'attack', side: 'enemy', actor: 0, target: 0, dodge: true },
    { type: 'attack', side: 'enemy', actor: 0, target: 0, damage: 25000, melee: true, category: 'rage', dramatic: true },
    { type: 'attack', side: 'player', actor: 0, target: 0, damage: 80000, melee: true, category: 'rage', dramatic: true, crit: true, rageFill: 30 },
    { type: 'die', actor: 0 },
  ],
  onVictory: { labelText: 'VICTORY!', holdMs: 2000 },
};

const slimeFight: FightSceneConfig = {
  characterScale: 0.10,
  background: battleBgStage1,
  players: [{ spine: heroBundle, skin: 'Base', maxHp: 182800, hp: 182800, maxRage: 100, melee: true }],
  enemies: [
    { spine: slimeBundle, skin: 'default', maxHp: 45000, melee: true, xFrac: 0.65, yFrac: 0.85 },
    { spine: slimeBundle, skin: 'default', maxHp: 45000, melee: true, xFrac: 0.78, yFrac: 0.75 },
    { spine: slimeBundle, skin: 'default', maxHp: 45000, melee: true, xFrac: 0.80, yFrac: 0.92 },
  ],
  steps: [
    { type: 'attack', side: 'player', actor: 0, target: 0, damage: 30000, melee: true, rageFill: 20, return: false },
    { type: 'attack', side: 'player', actor: 0, target: 1, damage: 28000, melee: true, category: 'combo', return: false },
    { type: 'attack', side: 'player', actor: 0, target: 2, damage: 32000, melee: true, category: 'combo', rageFill: 30 },
    { type: 'skill', side: 'player', actor: 0, target: 0, usePlayerSkill: true, damage: 20000 },
    { type: 'attack', side: 'enemy', actor: 0, target: 0, damage: 8000 },
    { type: 'attack', side: 'enemy', actor: 1, target: 0, dodge: true },
    { type: 'attack', side: 'player', actor: 0, target: 0, damage: 50000, melee: true, crit: true },
    { type: 'die', actor: 0 },
    { type: 'attack', side: 'player', actor: 0, target: 1, damage: 50000, melee: true, rageFill: 20 },
    { type: 'die', actor: 1 },
    { type: 'attack', side: 'player', actor: 0, target: 2, damage: 50000, melee: true, category: 'rage', dramatic: true },
    { type: 'die', actor: 2 },
  ],
  onVictory: { labelText: 'VICTORY!' },
};

// ── Debug scene events ──

const vsLoopFight: FightSceneConfig = {
  ...skeletonFight,
  debugVsLoop: true,
  steps: [],
};

const weaponTestFight: FightSceneConfig = {
  background: battleBgStage1,
  players: [{ spine: heroBundle, skin: 'Base', maxHp: 999999, hp: 999999, maxRage: 100, melee: true }],
  enemies: [
    { spine: skeletonKingBundle, skin: 'default', maxHp: 999999, melee: true, maxRage: 100 },
  ],
  debugLoop: true,
  steps: [
    { type: 'attack', side: 'player', actor: 0, target: 0, damage: 10000, melee: true, rageFill: 50, return: false },
    { type: 'attack', side: 'player', actor: 0, target: 0, damage: 10000, melee: true, category: 'combo', rageFill: 50 },
    { type: 'attack', side: 'player', actor: 0, target: 0, damage: 10000, melee: true, category: 'rage', dramatic: true },
    { type: 'attack', side: 'enemy', actor: 0, target: 0, damage: 5000 },
  ],
  onVictory: { labelText: 'VICTORY!' },
};

const allSkillsFight: FightSceneConfig = {
  background: battleBgStage1,
  players: [{ spine: heroBundle, skin: 'Base', maxHp: 182800, hp: 182800, maxRage: 100, melee: true }],
  enemies: [
    { spine: slimeBundle, skin: 'default', maxHp: 999999, melee: true, xFrac: 0.65, yFrac: 0.85 },
    { spine: skeletonBundle, skin: 'default', maxHp: 999999, melee: true, xFrac: 0.78, yFrac: 0.75 },
    { spine: slimeBundle, skin: 'default', maxHp: 999999, melee: true, xFrac: 0.8, yFrac: 0.92 },
  ],
  debugLoop: true,
  steps: [
    { type: 'attack', side: 'player', actor: 0, target: 0, damage: 10000, melee: true, rageFill: 50, return: false },
    { type: 'attack', side: 'player', actor: 0, target: 1, damage: 10000, melee: true, category: 'combo', return: false },
    { type: 'attack', side: 'player', actor: 0, target: 2, damage: 10000, melee: true, category: 'combo', rageFill: 50 },
    { type: 'skill', side: 'player', actor: 0, target: 0, useAllPlayerSkills: true, damage: 20000 },
    { type: 'attack', side: 'enemy', actor: 0, target: 0, damage: 5000 },
  ],
  onVictory: { labelText: 'VICTORY!' },
};

// ── Enemy & BG lookup maps (string ID → bundle/data) ──

const ENEMY_MAP: Record<string, SpineAssets> = {};
for (const stage of STAGES) {
  for (const enemy of stage.enemies) {
    ENEMY_MAP[enemy.name] = enemy.bundle;
  }
}

const BG_MAP: Record<string, string> = {};
for (const bg of ALL_BATTLE_BGS) {
  BG_MAP[bg.name] = bg.data;
}

const BOARD_MAP: Record<string, BoardConfig> = {
  board1: board1Config,
  board2: board2Config,
  board3: board3Config,
  board4: board4Config,
  board5: board5Config,
  board6: board6Config,
  board7: board7Config,
};

function setBoardParam(boardName: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('board', boardName);
  window.location.href = url.toString();
}

function getSelectedBoard(): BoardConfig {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('board');
  if (name && BOARD_MAP[name]) {
    return BOARD_MAP[name];
  }
  return board1Config;
}

function setEnemyParam(enemyName: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('enemy', enemyName);
  window.location.href = url.toString();
}

function setBgParam(bgName: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('bg', bgName);
  window.location.href = url.toString();
}

function getSelectedEnemy(): SpineAssets {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('enemy');
  if (name && ENEMY_MAP[name]) return ENEMY_MAP[name];
  return skeletonBundle;
}

function getSelectedBg(): string {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('bg');
  if (name && BG_MAP[name]) return BG_MAP[name];
  return battleBgStage1;
}

function makeEnemyTestFight(enemyBundle: SpineAssets, bg: string): FightSceneConfig {
  return {
    players: [{ spine: heroBundle, skin: 'Base', maxHp: 999999, hp: 999999, maxRage: 100, melee: true }],
    enemies: [{ spine: enemyBundle, skin: 'default', maxHp: 999999, melee: true }],
    background: bg,
    debugLoop: true,
    steps: [
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 10000, melee: true, rageFill: 50, return: false },
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 10000, melee: true, category: 'combo', rageFill: 50 },
      { type: 'attack', side: 'player', actor: 0, target: 0, damage: 10000, melee: true, category: 'rage', dramatic: true },
      { type: 'attack', side: 'enemy', actor: 0, target: 0, damage: 5000 },
    ],
    onVictory: { labelText: 'VICTORY!' },
  };
}

const debugEvents: Record<string, { events: PlayableEvent[]; skills: string[]; board?: boolean }> = {
  board: {
    events: [],
    skills: [],
    board: true,
  },
  vs: {
    events: [{ type: 'fight', config: vsLoopFight }],
    skills: [],
  },
  fight: {
    events: [{ type: 'fight', config: skeletonFight }],
    skills: ['chainLightning', 'thunderstorm', 'thunderGod', 'fireballBarrage', 'flameStrike', 'meteorStorm', 'berserk'],
  },
  allSkills: {
    events: [{ type: 'fight', config: allSkillsFight }],
    skills: ['chainLightning', 'thunderstorm', 'thunderGod', 'fireballBarrage', 'flameStrike', 'meteorStorm', 'shurikenFlurry', 'fumaShuriken', 'deadlyStars', 'berserk'],
  },
  weapons: {
    events: [{ type: 'fight', config: weaponTestFight }],
    skills: [],
  },
  enemies: {
    events: [{ type: 'fight', config: makeEnemyTestFight(getSelectedEnemy(), getSelectedBg()) }],
    skills: [],
  },
  fightSlime: {
    events: [{ type: 'fight', config: slimeFight }],
    skills: ['shurikenFlurry', 'fumaShuriken', 'deadlyStars', 'fireballBarrage', 'berserk'],
  },
  weaponReward: {
    events: [{ type: 'weaponReward', config: {
      displaySprite: ninjaKatanaUIData,
      weaponConfig: NINJA_KATANA,
      weaponId: 'NinjaKatana',
    }}],
    skills: [],
  },
  levelup: {
    events: [{ type: 'levelup', config: {
      skills: [[CHAIN_LIGHTNING, FIREBALL_BARRAGE, DEADLY_STARS], [THUNDERSTORM, BERSERK, FLAME_STRIKE]],
    }}],
    skills: [],
  },
  levelupH: {
    events: [{ type: 'levelup', config: {
      skills: [[CHAIN_LIGHTNING, FIREBALL_BARRAGE, DEADLY_STARS], [THUNDERSTORM, BERSERK, FLAME_STRIKE]],
      layout: 'horizontal',
    }}],
    skills: [],
  },
  heroReward: {
    events: [{ type: 'heroReward', config: {
      heroConfig: CORVUS,
      heroBundle: heroBundle,
    }}],
    skills: [],
  },
  gameEnd: {
    events: [{ type: 'gameEnd', config: {
      displayImage: gameEndImage,
    }}],
    skills: [],
  },
  nextChapter: {
    events: [{ type: 'nextChapter', config: {
      bannerImage: nextChapterBanner,
    }}],
    skills: [],
  },
  tilePopup: {
    events: [
      { type: 'tilePopup', stat: 'atk', pct: 12 },
      { type: 'tilePopup', stat: 'hp', pct: -5 },
      { type: 'tilePopup', stat: 'def', pct: 8 },
    ],
    skills: [],
    board: true,
  },
  loot: {
    events: [
      { type: 'loot', currency: 'coin', amount: 50 },
      { type: 'loot', currency: 'coin', amount: 250 },
    ],
    skills: [],
    board: true,
  },
  tilesPhase1: {
    events: [
      { type: 'tilePopup', stat: 'atk', pct: 12 },
      { type: 'loot', currency: 'coin', amount: 50 },
      { type: 'tilePopup', stat: 'hp', pct: -5 },
      { type: 'loot', currency: 'coin', amount: 250 },
    ],
    skills: [],
    board: true,
  },
  treasure: {
    events: [{ type: 'treasure', config: { coins: 250 } }],
    skills: [],
    board: true,
  },
  dialogue: {
    events: [{ type: 'dialogue', config: {
      title: 'A Moment To Rest',
      body: 'So tired...',
      options: [
        { label: 'Rest', resultText: 'Restore 30% HP', tint: 0x4a8c4a,
          outcomes: [{ applyDelta: { hpPct: 30 } }] },
        { label: 'Train', resultText: '+1 ATK skill', tint: 0x4a6a8c,
          outcomes: [{ applyDelta: { atkPct: 10 } }] },
      ],
    }}],
    skills: [],
    board: true,
  },
  dialogueChoice: {
    events: [{ type: 'dialogue', config: {
      title: 'A Mysterious Merchant',
      body: 'He offers a deal you can\'t refuse.',
      options: [
        { label: 'Buy', resultText: '-200 coins, +30% HP', tint: 0x8c4a4a,
          outcomes: [{ applyDelta: { coins: -200, hpPct: 30 } }] },
        { label: 'Walk away', resultText: 'No effect', tint: 0x666666,
          outcomes: [] },
      ],
    }}],
    skills: [],
    board: true,
  },
  luckyWheel: {
    events: [{ type: 'luckyWheel', config: {
      prizes: [
        'fireballBarrage', 'chainLightning', 'shurikenFlurry', 'berserk',
        'flameStrike', 'thunderstorm', 'fumaShuriken', 'meteorStorm',
        'thunderGod', 'deadlyStars', 'fireballBarrage', 'chainLightning',
      ],
      winningIndex: 5,
    }}],
    skills: [],
    board: true,
  },
  slotReels: {
    events: [{ type: 'slotReels', config: {
      rewardLevel: 2,
      reward: { coins: 300 },
    }}],
    skills: [],
    board: true,
  },
  blackjack: {
    events: [{ type: 'blackjack', config: {} }],
    skills: [],
    board: true,
  },
  shop: {
    events: [{ type: 'shop', config: {
      style: 'normal',
      items: [
        { kind: 'skill', label: 'Fireball Barrage', description: 'Hurl flaming projectiles', price: 100, effect: { skill: 'fireballBarrage' } },
        { kind: 'stat', label: 'Max HP +20%', description: 'Permanently increase max HP', price: 80, effect: { hpPct: 20 } },
        { kind: 'heal', label: 'Heal 30%', description: 'Restore 30% of max HP', price: 50, effect: { hpPct: 30 } },
      ],
    }}],
    skills: [],
    board: true,
  },
  shopBlackMarket: {
    events: [{ type: 'shop', config: {
      style: 'blackMarket',
      items: [
        { kind: 'skill', label: 'Meteor Storm', description: 'Devastating skill', price: 200, effect: { skill: 'meteorStorm' } },
        { kind: 'stat', label: 'ATK +15%', description: 'Permanent attack boost', price: 120, effect: { atkPct: 15 } },
        { kind: 'heal', label: 'Heal 50%', description: 'Restore 50% of max HP', price: 80, effect: { hpPct: 50 } },
      ],
    }}],
    skills: [],
    board: true,
  },
};

export const DEBUG_SCENE_NAMES: string[] = Object.keys(debugEvents);

// ── Collapsible debug panel helper ──

function createDebugPanel(titleText: string): { panel: HTMLDivElement; body: HTMLDivElement } {
  const panel = document.createElement('div');
  panel.style.cssText = `
    position: fixed; top: 8px; right: 8px; z-index: 9999;
    background: rgba(15,15,25,0.92); border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px; font-family: sans-serif;
    font-size: 12px; color: #ddd; user-select: none;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; cursor: pointer;
  `;

  const title = document.createElement('span');
  title.textContent = titleText;
  title.style.cssText = 'font-weight: bold; font-size: 13px; color: #fff;';

  const arrow = document.createElement('span');
  arrow.textContent = '\u25BC';
  arrow.style.cssText = 'font-size: 10px; color: #999; transition: transform 0.2s;';

  header.appendChild(title);
  header.appendChild(arrow);
  panel.appendChild(header);

  const body = document.createElement('div');
  body.style.cssText = `
    padding: 0 12px 10px 12px;
    max-height: 80vh; overflow-y: auto;
    max-width: 220px;
  `;
  panel.appendChild(body);

  let collapsed = false;
  header.addEventListener('click', () => {
    collapsed = !collapsed;
    body.style.display = collapsed ? 'none' : 'block';
    arrow.style.transform = collapsed ? 'rotate(-90deg)' : '';
    if (collapsed) {
      panel.style.maxWidth = 'none';
    } else {
      panel.style.maxWidth = '';
    }
  });

  document.body.appendChild(panel);
  return { panel, body };
}

// ── Debug Skill Toggle Panel ──

const SKILL_FAMILIES: { label: string; ids: string[] }[] = [
  { label: '⚡ Lightning', ids: ['chainLightning', 'thunderstorm', 'thunderGod'] },
  { label: '🔥 Fire', ids: ['fireballBarrage', 'flameStrike', 'meteorStorm'] },
  { label: '✦ Shuriken', ids: ['shurikenFlurry', 'fumaShuriken', 'deadlyStars'] },
  { label: '💪 Misc', ids: ['berserk'] },
];

const SKILL_NAMES: Record<string, string> = {
  chainLightning: 'Chain Lightning',
  thunderstorm: 'Thunderstorm',
  thunderGod: 'Thunder God',
  fireballBarrage: 'Fireball Barrage',
  flameStrike: 'Flame Strike',
  meteorStorm: 'Meteor Storm',
  shurikenFlurry: 'Shuriken Flurry',
  fumaShuriken: 'Fuma Shuriken',
  deadlyStars: 'Deadly Stars',
  berserk: 'Berserk',
};

function getDebugState(): { skills: string[] } {
  return (window as any).__debugState;
}

function createSkillTogglePanel(initialSkills: string[]) {
  const { body } = createDebugPanel('Skills');

  for (const family of SKILL_FAMILIES) {
    const familyLabel = document.createElement('div');
    familyLabel.textContent = family.label;
    familyLabel.style.cssText = 'font-size: 11px; color: #999; margin-top: 6px; margin-bottom: 2px;';
    body.appendChild(familyLabel);

    for (const id of family.ids) {
      const row = document.createElement('label');
      row.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 2px 0; cursor: pointer;';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = initialSkills.includes(id);
      cb.style.cssText = 'margin: 0; cursor: pointer;';
      cb.addEventListener('change', () => {
        const state = getDebugState();
        if (!state) return;
        if (cb.checked) {
          if (!state.skills.includes(id)) state.skills.push(id);
        } else {
          const idx = state.skills.indexOf(id);
          if (idx >= 0) state.skills.splice(idx, 1);
        }
        console.log('[debug] Active skills:', [...state.skills]);
      });

      const label = document.createElement('span');
      label.textContent = SKILL_NAMES[id] ?? id;

      row.appendChild(cb);
      row.appendChild(label);
      body.appendChild(row);
    }
  }
}

function createWeaponSwitcherPanel(state: typeof defaultState) {
  const { body } = createDebugPanel('Weapons');

  let activeBtn: HTMLElement | null = null;

  for (const weapon of ALL_WEAPONS) {
    const btn = document.createElement('button');
    btn.textContent = weapon.name;
    btn.style.cssText = `
      display: block; width: 100%; padding: 6px 10px; margin: 3px 0;
      background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
      border-radius: 4px; color: #ddd; font-size: 12px; cursor: pointer;
      text-align: left; transition: background 0.15s;
    `;
    btn.addEventListener('mouseenter', () => {
      if (btn !== activeBtn) btn.style.background = 'rgba(255,255,255,0.15)';
    });
    btn.addEventListener('mouseleave', () => {
      if (btn !== activeBtn) btn.style.background = 'rgba(255,255,255,0.08)';
    });
    btn.addEventListener('click', async () => {
      state.weapon = weapon.name;
      state.weaponConfig = weapon.config;
      const hero = (window as any).__debugHero;
      if (hero) await hero.equipWeapon(weapon.config);
      if (activeBtn) {
        activeBtn.style.background = 'rgba(255,255,255,0.08)';
        activeBtn.style.borderColor = 'rgba(255,255,255,0.15)';
        activeBtn.style.color = '#ddd';
      }
      activeBtn = btn;
      btn.style.background = 'rgba(46,202,172,0.3)';
      btn.style.borderColor = '#2ecaac';
      btn.style.color = '#fff';
      console.log(`[debug] Equipped weapon: ${weapon.name}`);
    });

    if (weapon.name === state.weapon) {
      activeBtn = btn;
      btn.style.background = 'rgba(46,202,172,0.3)';
      btn.style.borderColor = '#2ecaac';
      btn.style.color = '#fff';
    }

    body.appendChild(btn);
  }
}

// ── Enemy & BG Switcher Panel ──

function createBoardSwitcherPanel() {
  const params = new URLSearchParams(window.location.search);
  const currentBoard = params.get('board') ?? 'board1';

  const { body } = createDebugPanel('Board Map');

  const btnStyle = `
    display: block; width: 100%; padding: 5px 8px; margin: 2px 0;
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
    border-radius: 4px; color: #ddd; font-size: 11px; cursor: pointer;
    text-align: left; transition: background 0.15s;
  `;
  const activeCSS = 'background: rgba(46,202,172,0.3); border-color: #2ecaac; color: #fff;';

  for (const name of Object.keys(BOARD_MAP)) {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.style.cssText = btnStyle + (name === currentBoard ? activeCSS : '');
    btn.addEventListener('click', () => setBoardParam(name));
    body.appendChild(btn);
  }
}

function createEnemySwitcherPanel() {
  const params = new URLSearchParams(window.location.search);
  const currentEnemy = params.get('enemy') ?? 'Skeleton Warrior';
  const currentBg = params.get('bg') ?? 'Stage 1';

  const { body } = createDebugPanel('Enemies & Backgrounds');

  const btnStyle = `
    display: block; width: 100%; padding: 5px 8px; margin: 2px 0;
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
    border-radius: 4px; color: #ddd; font-size: 11px; cursor: pointer;
    text-align: left; transition: background 0.15s;
  `;
  const activeCSS = 'background: rgba(46,202,172,0.3); border-color: #2ecaac; color: #fff;';

  // BG section
  const bgLabel = document.createElement('div');
  bgLabel.textContent = 'Battle Background';
  bgLabel.style.cssText = 'font-size: 11px; color: #999; margin-top: 4px; margin-bottom: 4px; font-weight: bold;';
  body.appendChild(bgLabel);

  for (const bg of ALL_BATTLE_BGS) {
    const btn = document.createElement('button');
    btn.textContent = bg.name;
    btn.style.cssText = btnStyle + (bg.name === currentBg ? activeCSS : '');
    btn.addEventListener('click', () => setBgParam(bg.name));
    body.appendChild(btn);
  }

  // Enemy section by stage
  for (const stage of STAGES) {
    if (stage.enemies.length === 0) continue;
    const stageLabel = document.createElement('div');
    stageLabel.textContent = stage.label;
    stageLabel.style.cssText = 'font-size: 11px; color: #999; margin-top: 8px; margin-bottom: 4px; font-weight: bold;';
    body.appendChild(stageLabel);

    for (const enemy of stage.enemies) {
      const btn = document.createElement('button');
      btn.textContent = enemy.name;
      btn.style.cssText = btnStyle + (enemy.name === currentEnemy ? activeCSS : '');
      btn.addEventListener('click', () => setEnemyParam(enemy.name));
      body.appendChild(btn);
    }
  }
}

/**
 * Reads `?scene=<name>` from the URL and returns a script that jumps
 * directly to that scene.  Returns null if no debug param is set.
 */
export function getDebugScript(): PlayableScript | null {
  const params = new URLSearchParams(window.location.search);
  const sceneName = params.get('scene');
  if (!sceneName) return null;

  const entry = debugEvents[sceneName];
  if (!entry) {
    console.warn(
      `[debug] Unknown scene "${sceneName}". Valid: ${Object.keys(debugEvents).join(', ')}`,
    );
    return null;
  }

  console.log(`[debug] Jumping directly to scene: ${sceneName}`);

  const state = { ...defaultState, skills: [...entry.skills] };

  // Show skill toggle panel for allSkills debug scene
  if (sceneName === 'allSkills') {
    createSkillTogglePanel(entry.skills);
  }

  // Show weapon switcher for weapons debug scene
  if (sceneName === 'weapons') {
    createWeaponSwitcherPanel(state);
  }

  // Show enemy & BG switcher for enemies debug scene
  if (sceneName === 'enemies') {
    createEnemySwitcherPanel();
  }

  // Show board switcher for board debug scene
  if (sceneName === 'board') {
    createBoardSwitcherPanel();
  }

  // Tile-events need rolls so the player actually lands on tiles for
  // overlays to fire. Each non-fight event auto-chains, but the FIRST event in
  // the script needs a roll to trigger onLanded. Pre-fill with [3, 3, ...].
  const tileEventScene = sceneName === 'tilePopup' || sceneName === 'loot' || sceneName === 'tilesPhase1'
    || sceneName === 'treasure' || sceneName === 'dialogue' || sceneName === 'dialogueChoice'
    || sceneName === 'luckyWheel' || sceneName === 'slotReels' || sceneName === 'blackjack'
    || sceneName === 'shop' || sceneName === 'shopBlackMarket';
  const rolls = entry.board
    ? (tileEventScene ? Array(99).fill(3) : Array(99).fill(null))
    : undefined;

  return {
    initialState: state,
    board: entry.board ? getSelectedBoard() : undefined,
    rolls,
    debugWeapons: entry.board ? ALL_WEAPONS : undefined,
    stats: entry.board ? { showXp: true, atkDisplay: 'bar', showCoins: tileEventScene } : undefined,
    allSkills: ALL_SKILLS,
    sceneClasses: ALL_SCENE_CLASSES,
    events: entry.events,
  };
}
