export const cards = Object.freeze([
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

export const starterDeck = Object.freeze([
  { cardId: 'ember-bolt', count: 2 },
  { cardId: 'frost-mend', count: 2 },
  { cardId: 'forge-shield', count: 2 },
  { cardId: 'tavern-recruit', count: 2 },
  { cardId: 'banner-knight', count: 1 },
  { cardId: 'hearthguard', count: 1 },
  { cardId: 'reinforce', count: 1 },
  { cardId: 'rally-the-crowd', count: 1 },
]);

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
