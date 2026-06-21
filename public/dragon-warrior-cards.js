// 火焰龙战 30 张卡牌数据
// 来源: Vicious Syndicate Fire Dragon Warrior
// 套牌代码: AAECAQcCi6AE0LIHDuPmBqr8Bqv8BveDB+iHB9KXB7etB4+xB+yyB4S9B7XAB5XCB5vCB5zCBwAA

export const dragonWarriorCards = Object.freeze([
  // ================================================================
  // 1 费
  // ================================================================

  {
    id: 'dw-dark-dragon-knight', name: '黑暗的龙骑士', cost: 1, type: 'minion',
    attack: 1, health: 1, tribes: ['demon'], deckCount: 0,
    text: '战吼：如果你的手牌中有龙牌，发现一张具有黑暗之赐的龙牌。',
    mechanics: ['battlecry'],
    effects: [{
      type: 'conditional',
      condition: 'holdingDragon',
      effects: [{ type: 'discoverDragonWithDarkGift', amount: 1, trigger: 'battlecry' }],
    }],
  },

  {
    id: 'dw-egg-carrier', name: '载蛋雏龙', cost: 1, type: 'minion',
    attack: 1, health: 2, tribes: ['dragon'], deckCount: 0,
    text: '战吼：随机将一张法力值消耗小于或等于（3）点的龙牌置入你的手牌。',
    mechanics: ['battlecry'],
    effects: [{ type: 'addRandomCard', tribe: 'dragon', maxCost: 3, amount: 1, trigger: 'battlecry' }],
  },

  {
    id: 'dw-eternal-pain', name: '永时困苦', cost: 1, type: 'spell',
    spellSchool: 'shadow', deckCount: 0,
    text: '对一个随从造成1点伤害。如果目标存活，抽一张牌。如果目标死亡，随机召唤一个法力值消耗为（1）点的随从。',
    effects: [{
      type: 'damageOrDrawOrSummon',
      target: 'playerChoice', targetKinds: ['minion'],
      amount: 1, summonCost: 1,
    }],
  },

  {
    id: 'dw-crimson-abyss', name: '赤红深渊', cost: 1, type: 'location',
    durability: 3, deckCount: 0,
    text: '对一个友方随从造成1点伤害，并使其获得+2攻击力。',
    effects: [{
      type: 'locationPingBuff',
      target: 'friendlyMinion',
      damage: 1, attackBuff: 2,
    }],
  },

  {
    id: 'dw-searing-flame', name: '烈火炙烤', cost: 1, type: 'spell',
    spellSchool: 'fire', deckCount: 0,
    text: '对一个受伤的随从造成8点伤害。如果溢出伤害，将一张伤害值为溢出值的烈火炙烤置入你的手牌。',
    effects: [{
      type: 'overflowDamage',
      target: 'playerChoice', targetKinds: ['minion'],
      targetCondition: 'damaged',
      amount: 8,
    }],
  },

  // ================================================================
  // 2 费
  // ================================================================

  {
    id: 'dw-dragon-nest-guardian', name: '龙巢守护者', cost: 2, type: 'minion',
    attack: 2, health: 3, deckCount: 0,
    text: '战吼：如果你的手牌中有龙牌，装备一把2/2的武器。',
    mechanics: ['battlecry'],
    effects: [{
      type: 'conditional',
      condition: 'holdingDragon',
      effects: [{ type: 'equipWeapon', attack: 2, durability: 2, trigger: 'battlecry' }],
    }],
  },

  {
    id: 'dw-flower-vendor', name: '鲜花商贩', cost: 2, type: 'minion',
    attack: 1, health: 4, tribes: ['dragon'], deckCount: 0,
    text: '在你的回合结束时，随机使另一个友方龙获得+1/+1。',
    effects: [{
      type: 'endOfTurnBuffRandomFriendlyDragon',
      attackBuff: 1, healthBuff: 1,
    }],
  },

  {
    id: 'dw-shadow-flame-infusion', name: '影焰晕染', cost: 2, type: 'spell',
    spellSchool: 'fire', deckCount: 0,
    text: '造成2点伤害。发现一张具有黑暗之赐的战士随从牌。',
    effects: [
      { type: 'damage', target: 'playerChoice', amount: 2 },
      { type: 'discoverWarriorWithDarkGift', amount: 1 },
    ],
  },

  {
    id: 'dw-preemptive-strike', name: '先行打击', cost: 2, type: 'spell',
    deckCount: 0,
    text: '造成3点伤害。如果你的手牌中有法力值消耗大于或等于（5）点的随从牌，抽一张随从牌。',
    effects: [
      { type: 'damage', target: 'playerChoice', amount: 3 },
      { type: 'conditional',
        condition: 'holdingHighCostMinion',
        effects: [{ type: 'drawMinion', amount: 1 }],
      },
    ],
  },

  {
    id: 'dw-scorching-fissure', name: '灼热裂隙', cost: 2, type: 'spell',
    spellSchool: 'fire', deckCount: 0,
    text: '对所有随从造成1点伤害。在本回合中，使你的英雄获得+3攻击力。',
    effects: [
      { type: 'damage', target: 'allMinions', amount: 1 },
      { type: 'heroGainAttack', amount: 3, duration: 'thisTurn' },
    ],
  },

  // ================================================================
  // 3 费
  // ================================================================

  {
    id: 'dw-dark-scale-matron', name: '晦鳞巢母', cost: 3, type: 'minion',
    attack: 4, health: 3, tribes: ['dragon'], deckCount: 0,
    text: '战吼：如果你的手牌中有另一张龙牌，复原2个法力水晶。',
    mechanics: ['battlecry'],
    effects: [{
      type: 'conditional',
      condition: 'holdingAnotherDragon',
      effects: [{ type: 'refreshMana', amount: 2, trigger: 'battlecry' }],
    }],
  },

  {
    id: 'dw-erupting-volcano', name: '喷发火山', cost: 3, type: 'location',
    durability: 3, deckCount: 0,
    text: '随机对敌方造成3点伤害。如果你在本回合中施放过火焰法术，则改为6点。',
    effects: [{
      type: 'locationRandomDamage',
      baseAmount: 3, fireAmount: 6,
      targetSide: 'enemy',
    }],
  },

  // ================================================================
  // 4 费
  // ================================================================

  {
    id: 'dw-field-announcer', name: '现场播报员', cost: 4, type: 'minion',
    attack: 3, health: 3, tribes: ['dragon'], deckCount: 0,
    text: '战吼：双方各装备一把随机武器。你的武器获得+1/+1。可回溯。',
    mechanics: ['battlecry', 'rewind'],
    effects: [{ type: 'rewindableRandomWeapons', trigger: 'battlecry', buff: { attack: 1, durability: 1 } }],
  },

  // ================================================================
  // 7 费 (可减至 4)
  // ================================================================

  {
    id: 'dw-prescient-whelp', name: '先觉蜿变幼龙', cost: 7, type: 'minion',
    attack: 5, health: 8, tribes: ['dragon'], keywords: ['elusive'], deckCount: 0,
    text: '扰魔。如果你的手牌中有另一张龙牌，本牌的法力值消耗为（4）点。',
    costModifier: { rule: 'holdingAnotherDragon', amount: 3, minimum: 4 },
  },

  // ================================================================
  // 8 费 (可减至 5)
  // ================================================================

  {
    id: 'dw-windrider-dragon', name: '乘风浮龙', cost: 8, type: 'minion',
    attack: 6, health: 6, tribes: ['dragon'], deckCount: 0,
    text: '战吼：造成5点伤害。获得5点护甲值。如果你在上个回合使用过龙牌，本牌的法力值消耗为（5）点。',
    mechanics: ['battlecry'],
    effects: [
      { type: 'damage', target: 'playerChoice', amount: 5, trigger: 'battlecry' },
      { type: 'armor', target: 'friendlyHero', amount: 5, trigger: 'battlecry' },
    ],
    costModifier: { rule: 'kindredDragon', amount: 3, minimum: 5 },
  },

  // ================================================================
  // 8 费 传说
  // ================================================================

  {
    id: 'dw-grommash', name: '格罗玛什·地狱咆哮', cost: 8, type: 'minion',
    attack: 4, health: 9, keywords: ['charge'], deckCount: 0,
    text: '冲锋。受伤时获得+6攻击力。',
    mechanics: ['enrage'],
    effects: [{
      type: 'enrageAttackBuff',
      amount: 6,
    }],
  },
]);

// 龙战套牌：卡牌 id 数组，count 表示数量
export const dragonWarriorDeck = [
  { cardId: 'dw-dark-dragon-knight', count: 2 },
  { cardId: 'dw-egg-carrier', count: 2 },
  { cardId: 'dw-eternal-pain', count: 1 },
  { cardId: 'dw-crimson-abyss', count: 2 },
  { cardId: 'dw-searing-flame', count: 2 },
  { cardId: 'dw-dragon-nest-guardian', count: 2 },
  { cardId: 'dw-flower-vendor', count: 2 },
  { cardId: 'dw-shadow-flame-infusion', count: 2 },
  { cardId: 'dw-preemptive-strike', count: 2 },
  { cardId: 'dw-scorching-fissure', count: 2 },
  { cardId: 'dw-dark-scale-matron', count: 2 },
  { cardId: 'dw-erupting-volcano', count: 2 },
  { cardId: 'dw-field-announcer', count: 2 },
  { cardId: 'dw-prescient-whelp', count: 2 },
  { cardId: 'dw-windrider-dragon', count: 2 },
  { cardId: 'dw-grommash', count: 1 },
];

// 所有可用的龙族随从（用于发现和随机生成）
export const dragonPool = [
  'dw-egg-carrier',          // 载蛋雏龙 1/2
  'dw-flower-vendor',        // 鲜花商贩 1/4
  'dw-dark-scale-matron',    // 晦鳞巢母 4/3
  'dw-field-announcer',      // 现场播报员 3/3
  'dw-prescient-whelp',      // 先觉蜿变幼龙 5/8
  'dw-windrider-dragon',     // 乘风浮龙 6/6
];

// 低费龙池（≤3费，用于载蛋雏龙生成）
export const lowCostDragonPool = [
  'dw-egg-carrier',          // 载蛋雏龙 1/2
  'dw-flower-vendor',        // 鲜花商贩 1/4
];
