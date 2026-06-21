import { dragonWarriorCards } from './dragon-warrior-cards.js';

export const importedDeckCode = 'AAEBAcClBgrnywKPggOdqQOE+wPlsATEngbQngajoAaVswbRggcK3Ary0AL6/gKVzQPXzgPB0QPO+gXDuAbJ5AaEmQcAAA==';
export const updatedDeckCode = 'AAEBAf0GBI+CA4T7A8jrBZWzBg3y0AL40AL6/gLLuQOVzQObzQPXzgPB0QPO+gXEngajoAbDuAbJ5AYAAA==';

export const questlineDeckCards = Object.freeze([
  {
    id: 'hs-64900', dbfId: 64900, name: '恶魔之种', cost: 1, type: 'spell', deckCount: 1,
    text: '任务线：在你的回合中受到12点伤害。奖励：吸血。对敌方英雄造成3点伤害。',
    mechanics: ['questline', 'lifesteal'],
    effects: [{ type: 'questline', thresholds: [12, 12, 12], rewardDamage: 3, rewardHeal: 3, finalRewardCardId: 'hs-67547' }],
  },
  {
    id: 'hs-59223', dbfId: 59223, name: '亡者复生', cost: 0, type: 'spell', deckCount: 2,
    text: '对你的英雄造成3点伤害。将两个在本局对战中死亡的友方随从移回你的手牌。',
    effects: [{ type: 'selfDamage', amount: 3 }, { type: 'returnDeadFriendlyMinions', amount: 2 }],
  },
  {
    id: 'hs-111177', dbfId: 111177, name: '治疗石', cost: 0, type: 'spell', deckCount: 2,
    text: '可交易。恢复你的英雄在本回合中受到的所有伤害。', mechanics: ['tradeable'],
    effects: [{ type: 'restoreDamageThisTurn' }],
  },
  {
    id: 'hs-117892', dbfId: 117892, name: '咒怨之墓', cost: 0, type: 'spell', deckCount: 0,
    text: '从你的牌库中发现另一张牌，将其变为临时卡牌。', mechanics: ['discover', 'temporary'],
    effects: [{ type: 'discoverFromDeck', amount: 1, temporary: true, excludeSelf: true }],
  },
  {
    id: 'hs-43122', dbfId: 43122, name: '狗头人图书管理员', cost: 1, type: 'minion', attack: 2, health: 1, deckCount: 2,
    text: '战吼：抽一张牌。对你的英雄造成2点伤害。', mechanics: ['battlecry'],
    effects: [{ type: 'draw', target: 'friendlyHero', amount: 1, trigger: 'battlecry' }, { type: 'selfDamage', amount: 2, trigger: 'battlecry' }],
  },
  {
    id: 'hs-49018', dbfId: 49018, name: '晶化师', cost: 1, type: 'minion', attack: 1, health: 3, deckCount: 2,
    text: '战吼：对你的英雄造成5点伤害。获得5点护甲值。', mechanics: ['battlecry'],
    effects: [{ type: 'selfDamage', amount: 5, trigger: 'battlecry' }, { type: 'armor', target: 'friendlyHero', amount: 5, trigger: 'battlecry' }],
  },
  {
    id: 'hs-49423', dbfId: 49423, name: '莫瑞甘的灵界', cost: 1, type: 'spell', deckCount: 1,
    text: '抽三张牌。这些牌为临时牌。', mechanics: ['temporary'],
    effects: [{ type: 'draw', target: 'friendlyHero', amount: 3, temporary: true }],
  },
  {
    id: 'hs-54429', dbfId: 54429, name: '火焰之灾祸', cost: 1, type: 'spell', deckCount: 0,
    text: '消灭你的所有随从。每消灭一个随从，便随机消灭一个敌方随从。',
    effects: [{ type: 'destroyFriendlyAndRandomEnemies' }],
  },
  {
    id: 'hs-59029', dbfId: 59029, name: '活化扫帚', cost: 1, type: 'minion', attack: 1, health: 1, deckCount: 2,
    text: '突袭。战吼：使你的其他随从获得突袭。', keywords: ['rush'], mechanics: ['battlecry'],
    effects: [{ type: 'grantKeyword', target: 'otherFriendlyMinions', keyword: 'rush', trigger: 'battlecry' }],
  },
  {
    id: 'hs-71781', dbfId: 71781, name: '海中向导芬利爵士', cost: 1, type: 'minion', attack: 1, health: 3, deckCount: 0,
    text: '战吼：将你的手牌和牌库底的牌交换。', mechanics: ['battlecry'],
    effects: [{ type: 'swapHandWithDeckBottom', trigger: 'battlecry' }],
  },
  {
    id: 'hs-102212', dbfId: 102212, name: '灵魂炸弹', cost: 1, type: 'spell', deckCount: 2,
    text: '对一个随从和你的英雄各造成4点伤害。',
    effects: [{ type: 'damage', target: 'playerChoice', targetKinds: ['minion'], amount: 4 }, { type: 'selfDamage', amount: 4 }],
  },
  {
    id: 'hs-105539', dbfId: 105539, name: '批量生产', cost: 1, type: 'spell', deckCount: 2,
    text: '抽两张牌。对你的英雄造成3点伤害。将两张本牌的复制洗入你的牌库。',
    effects: [{ type: 'draw', target: 'friendlyHero', amount: 2 }, { type: 'selfDamage', amount: 3 }, { type: 'shuffleCopies', amount: 2 }],
  },
  {
    id: 'hs-102224', dbfId: 102224, name: '异教低阶牧师', cost: 2, type: 'minion', attack: 3, health: 2, deckCount: 0,
    text: '战吼：下个回合你的对手法术的法力值消耗增加（1）点。', mechanics: ['battlecry'],
    effects: [{ type: 'opponentSpellTax', amount: 1, turns: 1, trigger: 'battlecry' }],
  },
  {
    id: 'hs-102435', dbfId: 102435, name: '源质晶簇', cost: 2, type: 'minion', attack: 2, health: 1, deckCount: 2,
    text: '战吼，亡语：抽一张牌，并对你的英雄造成2点伤害。', mechanics: ['battlecry', 'deathrattle'],
    effects: [
      { type: 'draw', target: 'friendlyHero', amount: 1, trigger: 'battlecry' },
      { type: 'selfDamage', amount: 2, trigger: 'battlecry' },
      { type: 'draw', target: 'friendlyHero', amount: 1, trigger: 'deathrattle' },
      { type: 'selfDamage', amount: 2, trigger: 'deathrattle' },
    ],
  },
  {
    id: 'hs-115025', dbfId: 115025, name: '烂苹果', cost: 2, type: 'spell', deckCount: 0,
    text: '为你的英雄恢复12点生命值。在下2个回合中，每回合对你的英雄造成3点伤害。',
    effects: [{ type: 'heal', target: 'friendlyHero', amount: 12 }, { type: 'delayedSelfDamage', amount: 3, turns: 2 }],
  },
  {
    id: 'hs-104853', dbfId: 104853, name: '多米诺效应', cost: 3, type: 'spell', deckCount: 1,
    text: '对一个随从造成2点伤害。向左侧或右侧重复此效果，每次伤害增加1点。',
    effects: [{ type: 'adjacentChainDamage', target: 'playerChoice', targetKinds: ['minion'], amount: 2, step: 1, direction: 'random' }],
  },
  {
    id: 'hs-97614', dbfId: 97614, name: '被禁锢的恐魔', cost: 9, type: 'minion', attack: 4, health: 4, deckCount: 2,
    text: '在本局对战中，你每在你的回合受到一点伤害，本牌的法力值消耗便减少（1）点。',
    costModifier: { rule: 'selfDamageThisGame', amountPer: 1, minimum: 0 }, effects: [],
  },
  {
    id: 'hs-59585', dbfId: 59585, name: '血肉巨人', cost: 10, type: 'minion', attack: 8, health: 8, deckCount: 2,
    text: '你的英雄的生命值每在你的回合中变化一次，本牌的法力值消耗便减少（1）点。',
    costModifier: { rule: 'healthChangedThisGame', amountPer: 1, minimum: 0 }, effects: [],
  },
  {
    id: 'hs-1372', dbfId: 1372, name: '熔核巨人', cost: 20, type: 'minion', attack: 8, health: 8, deckCount: 0,
    text: '你的英雄每缺失一点生命值，本牌的法力值消耗便减少（1）点。',
    costModifier: { rule: 'missingHealth', amountPer: 1, minimum: 0 }, effects: [],
  },
  {
    id: 'hs-67547', dbfId: 67547, name: '枯萎化身塔姆辛', cost: 5, type: 'minion', attack: 7, health: 7, deckCount: 0,
    text: '战吼：在本局对战的剩余时间内，你在你的回合受到的伤害改为伤害你的对手。', mechanics: ['battlecry', 'questReward'],
    effects: [{ type: 'redirectSelfDamage', trigger: 'battlecry' }],
  },
]);

export const additionalRecordedCards = Object.freeze([
  {
    id: 'hs-43128', dbfId: 43128, name: '黑暗契约', cost: 1, type: 'spell', deckCount: 2,
    text: '消灭一个友方随从。为你的英雄恢复8点生命值。',
    effects: [
      { type: 'destroy', target: 'friendlyMinion' },
      { type: 'heal', target: 'friendlyHero', amount: 8 },
    ],
  },
  {
    id: 'hs-59035', dbfId: 59035, name: '巡游向导', cost: 1, type: 'minion', attack: 1, health: 1, deckCount: 2,
    text: '战吼：你的下一个英雄技能的法力值消耗为（0）点。', mechanics: ['battlecry'],
    effects: [{ type: 'setNextHeroPowerCost', amount: 0, trigger: 'battlecry' }],
  },
  {
    id: 'hs-95688', dbfId: 95688, dbfIds: [95688, 42471], name: '亵渎', cost: 2, type: 'spell', deckCount: 1,
    text: '对所有随从造成1点伤害，如果有随从死亡，则再次施放该法术。',
    aliases: ['核心版亵渎', '旧版亵渎'],
    effects: [{ type: 'repeatAoeWhileMinionDies', amount: 1 }],
  },
  {
    id: 'hs-56523', dbfId: 56523, name: '黑眼', cost: 3, type: 'minion', attack: 3, health: 4, deckCount: 2,
    text: '战吼：如果你的英雄在本回合受到过伤害，复原3个法力水晶。', mechanics: ['battlecry'],
    effects: [{ type: 'restoreMana', amount: 3, condition: 'heroDamagedThisTurn', trigger: 'battlecry' }],
  },
]);

export const deckCollections = Object.freeze([
  {
    id: 'questline-self-damage-v1',
    name: '任务术 · 第一套',
    label: '原始任务术',
    hero: '拉法姆',
    format: '狂野',
    code: importedDeckCode,
    entries: [
      [1372, 2], [95688, 1], [43122, 2], [49018, 2], [49423, 1], [54429, 1],
      [59029, 2], [59223, 2], [59585, 2], [64900, 1], [71781, 1], [97614, 2],
      [102212, 1], [102224, 1], [102435, 1], [104853, 1], [105539, 2], [111177, 2],
      [115025, 1], [117892, 2],
    ].map(([dbfId, count]) => ({ cardId: `hs-${dbfId}`, count })),
  },
  {
    id: 'darkglare-questline-v2',
    name: '黑眼任务术 · 当前套牌',
    label: '本次新卡组',
    hero: '古尔丹',
    format: '狂野',
    code: updatedDeckCode,
    entries: [
      [43122, 2], [43128, 2], [49018, 2], [49423, 1], [56523, 2], [59029, 2],
      [59035, 2], [59223, 2], [59585, 2], [64900, 1], [95688, 1], [97614, 2],
      [102212, 2], [102435, 2], [104853, 1], [105539, 2], [111177, 2],
    ].map(([dbfId, count]) => ({ cardId: `hs-${dbfId}`, count })),
  },
]);

export const currentDeckCollection = deckCollections[1];

export const cards = Object.freeze([
  ...questlineDeckCards,
  ...additionalRecordedCards,
  ...dragonWarriorCards,
  {
    id: 'ember-bolt',
    name: '余烬箭',
    cost: 1,
    type: 'spell',
    text: '造成 3 点伤害。',
    effects: [{ type: 'damage', target: 'enemyHero', amount: 3 }],
  },
  {
    id: 'frost-mend',
    name: '霜愈术',
    cost: 1,
    type: 'spell',
    text: '恢复 4 点生命值。',
    effects: [{ type: 'heal', target: 'friendlyHero', amount: 4 }],
  },
  {
    id: 'forge-shield',
    name: '熔炉护盾',
    cost: 2,
    type: 'spell',
    text: '获得 4 点护甲。',
    effects: [{ type: 'armor', target: 'friendlyHero', amount: 4 }],
  },
  {
    id: 'tavern-recruit',
    name: '酒馆新兵',
    cost: 2,
    type: 'minion',
    attack: 2,
    health: 2,
    text: '',
    effects: [],
  },
  {
    id: 'banner-knight',
    name: '战旗骑士',
    cost: 3,
    type: 'minion',
    attack: 3,
    health: 3,
    text: '',
    effects: [],
  },
  {
    id: 'hearthguard',
    name: '炉卫',
    cost: 4,
    type: 'minion',
    attack: 2,
    health: 5,
    text: '',
    effects: [],
  },
  {
    id: 'reinforce',
    name: '增援',
    cost: 2,
    type: 'spell',
    text: '召唤两个 1/1 酒馆新兵。',
    effects: [
      {
        type: 'summon',
        target: 'friendlyBoard',
        amount: 2,
        minion: { name: '酒馆新兵', attack: 1, health: 1 },
      },
    ],
  },
  {
    id: 'rally-the-crowd',
    name: '号角集结',
    cost: 3,
    type: 'spell',
    text: '你所有随从获得 +1/+1。',
    effects: [{ type: 'buff', target: 'friendlyMinions', attack: 1, health: 1 }],
  },
  {
    id: 'spirit-brew',
    name: '精神麦酒',
    cost: 2,
    type: 'spell',
    text: '抽 2 张牌，并恢复 2 点生命值。',
    effects: [
      { type: 'draw', target: 'friendlyHero', amount: 2 },
      { type: 'heal', target: 'friendlyHero', amount: 2 },
    ],
  },
  {
    id: 'last-stand',
    name: '背水一击',
    cost: 4,
    type: 'spell',
    text: '造成 4 点伤害。如果你的场上没有随从，再造成 4 点。',
    effects: [
      { type: 'damage', target: 'enemyHero', amount: 4 },
      {
        type: 'conditional',
        condition: 'controlsNoMinion',
        effects: [{ type: 'damage', target: 'enemyHero', amount: 4 }],
      },
    ],
  },
]);

export const starterDeck = Object.freeze(
  currentDeckCollection.entries.map((entry) => ({ ...entry }))
);

export const cardPool = Object.freeze(cards.map((card) => card.id));

export const encounter = Object.freeze({
  id: 'single_boss_01',
  mode: 'solo-boss',
  title: '霜灶酒馆',
  subtitle: '只有一关的炉石风 Boss 战',
  description: '守住你的酒馆，击败寒炉督战者·柯沃。',
  player: {
    heroName: '旅店英雄',
    heroHealth: 30,
    heroArmor: 0,
    handSize: 3,
    maxBoardSize: 7,
    deck: starterDeck,
    cardPool,
    heroPower: {
      name: '生命分流',
      cost: 2,
      text: '抽一张牌。对你的英雄造成 2 点伤害。',
      effects: [
        { type: 'draw', target: 'friendlyHero', amount: 1 },
        { type: 'selfDamage', amount: 2 },
      ],
    },
  },
  boss: {
    id: 'kovo-the-frostwarden',
    name: '寒炉督战者·柯沃',
    heroHealth: 34,
    heroArmor: 3,
    heroPower: {
      name: '寒气压制',
      cost: 2,
      text: '对敌方英雄造成 2 点伤害。',
      effects: [{ type: 'damage', target: 'enemyHero', amount: 2 }],
    },
    passive: {
      name: '冷场压迫',
      text: '如果场上没有友方随从，柯沃的下一次攻击额外造成 1 点伤害。',
    },
    aiBias: {
      style: 'tempo-control',
      priorities: [
        '优先清理敌方随从，避免被铺场滚雪球。',
        '若己方空场，优先使用召唤和护甲动作。',
        '血量低于 12 时改为偏防守，优先护甲和补刀。',
        '若对手已经有 3 个以上随从，优先使用范围伤害。',
      ],
    },
    turnScript: [
      { turn: 1, action: 'armor', amount: 3, line: '先喝一口热酒，立住场面。' },
      { turn: 2, action: 'summon', minion: { name: '寒雾侍从', attack: 1, health: 3 } },
      { turn: 3, action: 'damageHero', amount: 3, line: '冰风刮脸，先压血线。' },
      {
        turn: 4,
        action: 'aoe',
        amount: 2,
        target: 'enemyMinions',
        line: '把桌面掀了，清掉前排。',
      },
      { turn: 5, action: 'armor', amount: 4 },
      { turn: 6, action: 'damageHero', amount: 4, line: '第二波寒潮，逼你交资源。' },
      { turn: 7, action: 'summon', minion: { name: '裂冰护卫', attack: 3, health: 2 } },
      { turn: 8, action: 'damageHero', amount: 5, line: '进入狂怒阶段，伤害开始加码。' },
      { turn: 9, action: 'aoe', amount: 2, target: 'enemyMinions' },
      { turn: 10, action: 'damageHero', amount: 6 },
      { turn: 11, action: 'summon', minion: { name: '寒霜酒桶', attack: 2, health: 4 } },
      { turn: 12, action: 'finalPush', amount: 7, line: '最后一轮，直接冲脸。' },
    ],
  },
  objectives: [
    { id: 'defeat-boss', type: 'win', text: '击败寒炉督战者·柯沃。' },
    { id: 'survive-12-turns', type: 'soft-turn-limit', text: '坚持到第 12 回合后若 Boss 未死则失败。' },
  ],
  ui: {
    supportsDesktop: true,
    supportsMobile: true,
    touchFriendly: true,
    hint: '桌面和手机都可以加入同一局域网房间进行对战。',
  },
});

export const rulesText = [
  '这是一个单关 Boss 战。',
  '你的目标是在 12 回合内击败寒炉督战者·柯沃。',
  '卡牌效果只使用伤害、治疗、护甲、召唤、增益和抽牌这些简化动作。',
  'Boss 会按回合脚本行动，前期稳场，中后期转为清场和冲脸。',
].join(' ');

export const cardById = Object.freeze(
  Object.fromEntries(cards.map((card) => [card.id, card]))
);
