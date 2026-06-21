import { encounter, rulesText, starterDeck, cards as baseCards, mechanicTestDeck } from './game-data.js';
import { applyCardOverrides } from './card-overrides.js';
import {
  buildKeywordText,
  consumeMinionAttack,
  createMinionRuntimeState,
  getDisplayKeywords,
  hasKeyword,
  normalizeKeywords,
  resetMinionForTurn,
  summarizeKeywords,
} from './keywords.js';
import { network } from './network.js';
import { hideBattlegroundsView, renderBattlegroundsView } from './battlegrounds-view.js';
import { decideDragonWarriorAction, decideDragonWarriorTurn, mulliganDragonWarrior } from './dragon-warrior-ai.js';
import { dragonWarriorDeck } from './dragon-warrior-cards.js';
import { evaluateCardPlayState } from './mechanics.js';
import { createCardInstance, markCardEnteredHand, recordCardPlayed, clearTurnState } from './mechanic-runtime.js';
import './animations.js';

// ============================================
// 基础游戏配置
// ============================================

const MAX_TURNS = 12;
const baseDeckCountMap = Object.fromEntries(starterDeck.map((entry) => [entry.cardId, entry.count]));
const effectiveCards = applyCardOverrides(baseCards).map((card) => ({
  ...card,
  enabled: card.enabled !== false,
  deckCount: Number.isFinite(card.deckCount) ? card.deckCount : baseDeckCountMap[card.id] ?? 0,
}));
const effectiveCardById = Object.fromEntries(effectiveCards.map((card) => [card.id, card]));
const BOSS_SOLO_SCENARIO = Object.freeze({
  ...encounter,
  scenarioId: 'boss',
  modeLabel: '单关挑战中',
  turnLimit: MAX_TURNS,
  rulesText,
});
const TEST_SOLO_SCENARIO = Object.freeze({
  scenarioId: 'test',
  id: 'solo_test_dummy',
  title: '炉边酒馆',
  subtitle: '本地测试版',
  description: '一个人就能测试出牌、攻击、目标选择和回合流程。',
  modeLabel: '本地测试中',
  turnLimit: null,
  rulesText: '这是一个单人测试场景。对手每个敌方回合都会获得 5 点护甲，并召唤 1 个 2/2 随从。',
  player: {
    ...encounter.player,
  },
  boss: {
    name: '测试陪练',
    heroHealth: 45,
    heroArmor: 0,
    heroPower: {
      name: '固定脚本',
      text: '每回合获得 5 点护甲，并召唤 1 个 2/2 随从。',
      effects: [],
    },
    passive: {
      name: '压力测试',
      text: '每个敌方回合开始时，测试陪练会获得 5 点护甲，并召唤 1 个 2/2 随从。',
    },
    aiBias: {
      style: 'sandbox',
      priorities: ['固定护甲', '固定召唤', '用现有随从正常进攻'],
    },
    turnScript: [],
  },
  objectives: [
    { id: 'sandbox-check', type: 'test', text: '用这局测试出牌、攻击、目标和回合切换。' },
  ],
  testBot: {
    armorPerTurn: 5,
    summonMinion: { name: '测试随从', attack: 2, health: 2 },
  },
});
// 龙战 AI 场景 — boss 使用火焰龙战套牌，AI 驱动决策
const DRAGON_WARRIOR_SCENARIO = Object.freeze({
  scenarioId: 'dragon-warrior',
  id: 'dragon_warrior_ai',
  title: '炉边酒馆',
  subtitle: '龙战 AI 陪练',
  description: '火焰龙战 AI（Vicious Syndicate 套牌）。具备龙锚点保护、火焰法术+火山、格罗玛什斩杀等策略。',
  modeLabel: '龙战陪练中',
  turnLimit: null,
  rulesText: '对手使用完整的火焰龙战套牌，由 AI 决策引擎控制。AI 会主动管理龙条件、火焰法术顺序、格罗玛什斩杀等。',
  player: {
    ...encounter.player,
  },
  boss: {
    name: '龙战高手',
    heroHealth: 30,
    heroArmor: 0,
    heroPower: {
      name: '全副武装！',
      cost: 2,
      text: '获得 2 点护甲值。',
      effects: [
        { type: 'armor', target: 'friendlyHero', amount: 2 },
      ],
    },
    passive: {
      name: '龙族亲和',
      text: '龙战高手精通火焰龙战，采用束搜索 AI 决策。',
    },
    aiBias: {
      style: 'dragon-warrior',
      priorities: ['龙锚点保护', '火焰法术+火山', '晦鳞巢母返费', '格罗玛什斩杀', '乘风浮龙规划'],
    },
    turnScript: '__DRAGON_WARRIOR_AI__',
  },
  objectives: [
    { id: 'dw-practice', type: 'practice', text: '与火焰龙战 AI 练习对战，体验真实的龙战决策。' },
  ],
});

const MECHANICS_TEST_SCENARIO = Object.freeze({
  scenarioId: 'mechanics-test',
  id: 'mechanics_test',
  title: '炉边酒馆',
  subtitle: '机制测试',
  description: '快枪/连击/流放/压轴测试场景。玩家使用4种测试牌。',
  modeLabel: '机制测试中',
  turnLimit: null,
  rulesText: '这个场景用于测试卡牌机制：快枪、连击、流放、压轴。',
  player: {
    ...encounter.player,
  },
  boss: {
    name: '测试陪练',
    heroHealth: 30,
    heroArmor: 0,
    heroPower: { name: '测试', cost: 2, text: '测试', effects: [] },
    passive: { name: '测试', text: '测试Boss。' },
    aiBias: { style: 'sandbox', priorities: [] },
    turnScript: [{ turn: 1, action: 'armor', amount: 2, line: '获得2点护甲' }],
  },
  objectives: [{ id: 'mech-test', type: 'test', text: '测试快枪/连击/流放/压轴。' }],
});

const SOLO_SCENARIOS = Object.freeze({
  boss: BOSS_SOLO_SCENARIO,
  test: TEST_SOLO_SCENARIO,
  'dragon-warrior': DRAGON_WARRIOR_SCENARIO,
  'mechanics-test': MECHANICS_TEST_SCENARIO,
});
const SOLO_PROGRESS_STORAGE_KEY = 'clawteam-lan-hearthstone-solo-progress-v2';
const PVP_PROGRESS_STORAGE_KEY = 'clawteam-lan-hearthstone-pvp-progress-v2';
const BATTLEGROUNDS_PLACEHOLDER_HEROES = Object.freeze([
  {
    id: 'afk',
    name: 'A. F. Kay',
    armorLabel: '15',
    note: '先只接护甲与头像表现，英雄技能后续补齐',
  },
  {
    id: 'patches',
    name: 'Patches the Pirate',
    armorLabel: '12',
    note: '海盗经济流视觉预演',
  },
  {
    id: 'alakir',
    name: "Al'Akir",
    armorLabel: '15',
    note: '战斗剧场会优先展示圣盾与风怒感',
  },
  {
    id: 'ragnaros',
    name: 'Ragnaros',
    armorLabel: '18',
    note: '元素构筑预演英雄',
  },
  {
    id: 'tess',
    name: 'Tess Greymane',
    armorLabel: '17',
    note: '后续可承接对手复制与商店玩法',
  },
  {
    id: 'galakrond',
    name: 'Galakrond',
    armorLabel: '14',
    note: '先作为完整英雄池占位的一部分保留',
  },
]);

const BATTLEGROUNDS_PREVIEW_SCENARIOS = Object.freeze([
  {
    id: 'pirate-economy',
    label: '海盗经济线',
    round: 6,
    gold: 9,
    tavernTier: 4,
    tavernUpgradeCost: 8,
    timerSeconds: 62,
    playerHealth: 37,
    playerArmor: 15,
    opponentHero: {
      name: 'Ragnaros',
      armor: 18,
      health: 34,
      theme: 'elemental',
      note: '上回合铺出双元素成长线',
    },
    shop: [
      {
        tier: 1,
        cost: 3,
        name: 'Minted Corsair',
        tribe: 'Pirate',
        attack: 1,
        health: 3,
        text: 'When you sell this, get a Tavern Coin.',
        tags: ['Economy'],
      },
      {
        tier: 3,
        cost: 3,
        name: 'Peggy Sturdybone',
        tribe: 'Pirate',
        attack: 2,
        health: 1,
        text: 'Whenever a card is added to your hand, give another friendly Pirate +2/+1.',
        tags: ['Scaling'],
      },
      {
        tier: 4,
        cost: 3,
        name: 'Underhanded Dealer',
        tribe: 'Pirate',
        attack: 6,
        health: 6,
        text: 'After you gain Gold, gain +2/+2.',
        tags: ['Scaling'],
      },
      {
        tier: 5,
        cost: 3,
        name: 'Visionary Shipman',
        tribe: 'Pirate',
        attack: 5,
        health: 5,
        text: 'After you gain Gold 5 times, get a random Tavern spell. (5 left!)',
        tags: ['Spell'],
      },
      {
        tier: 5,
        cost: 3,
        name: 'Cannon Corsair',
        tribe: 'Pirate',
        attack: 3,
        health: 7,
        text: 'After you gain Gold, give your other Pirates +1/+1.',
        tags: ['Aura'],
      },
    ],
    reserve: [
      { name: 'Minted Corsair', tribe: 'Pirate', attack: 1, health: 3, tags: ['Coin'] },
      { name: 'Gunpowder Courier', tribe: 'Pirate', attack: 2, health: 6, tags: ['Buff'] },
      { name: 'Tavern Spell', tribe: 'Spell', attack: null, health: null, tags: ['Reserve Prices'] },
    ],
    board: [
      { name: 'Peggy Sturdybone', tribe: 'Pirate', attack: 10, health: 8, tags: ['Support'] },
      { name: 'Underhanded Dealer', tribe: 'Pirate', attack: 14, health: 14, tags: ['Carry'] },
      { name: 'Gunpowder Courier', tribe: 'Pirate', attack: 2, health: 6, tags: ['Buff'] },
      { name: 'Cannon Corsair', tribe: 'Pirate', attack: 9, health: 13, tags: ['Team Buff'] },
      { name: 'Visionary Shipman', tribe: 'Pirate', attack: 7, health: 7, tags: ['Spell Value'] },
    ],
    combat: {
      resultLabel: '上回合获胜',
      resultText: '对手被压到 34 血，海盗经济线已经开始滚雪球。',
      friendly: [
        { name: 'Peggy', tribe: 'Pirate', attack: 10, health: 8, tags: ['Backline'] },
        { name: 'Dealer', tribe: 'Pirate', attack: 14, health: 14, tags: ['Core'] },
        { name: 'Corsair', tribe: 'Pirate', attack: 9, health: 13, tags: ['Buff'] },
      ],
      enemy: [
        { name: 'Waveling', tribe: 'Elemental', attack: 6, health: 1, tags: ['Deathrattle'] },
        { name: 'Nomi', tribe: 'Elemental', attack: 6, health: 6, tags: ['Shop Scaling'] },
        { name: 'Acid Rainfall', tribe: 'Elemental', attack: 8, health: 8, tags: ['Carry'] },
      ],
    },
  },
  {
    id: 'elemental-refresh',
    label: '元素刷新线',
    round: 8,
    gold: 10,
    tavernTier: 5,
    tavernUpgradeCost: 9,
    timerSeconds: 54,
    playerHealth: 33,
    playerArmor: 18,
    opponentHero: {
      name: 'Patches the Pirate',
      armor: 12,
      health: 29,
      theme: 'pirate',
      note: '海盗局面转入战斗回合',
    },
    shop: [
      {
        tier: 3,
        cost: 3,
        name: 'Waveling',
        tribe: 'Elemental',
        attack: 6,
        health: 1,
        text: 'Deathrattle: After the Tavern is Refreshed this game, give its right-most minion +3/+3.',
        tags: ['Deathrattle'],
      },
      {
        tier: 4,
        cost: 3,
        name: 'En-Djinn Blazer',
        tribe: 'Elemental',
        attack: 4,
        health: 4,
        text: 'Battlecry: After the Tavern is Refreshed this game, give its right-most minion +7/+7.',
        tags: ['Battlecry'],
      },
      {
        tier: 5,
        cost: 3,
        name: 'Unleashed Mana Surge',
        tribe: 'Elemental',
        attack: 5,
        health: 4,
        text: 'After you play an Elemental, give your Elementals +2/+2.',
        tags: ['Scaling'],
      },
      {
        tier: 5,
        cost: 3,
        name: 'Nomi, Kitchen Nightmare',
        tribe: 'Elemental',
        attack: 6,
        health: 6,
        text: 'After you play an Elemental, give Elementals in the Tavern +3/+3 this game.',
        tags: ['Shop Buff'],
      },
      {
        tier: 6,
        cost: 3,
        name: 'Acid Rainfall',
        tribe: 'Elemental',
        attack: 8,
        health: 8,
        text: 'After you Refresh 5 times, gain the stats of the right-most minion in the Tavern. (5 left!)',
        tags: ['Carry'],
      },
    ],
    reserve: [
      { name: 'Air Revenant', tribe: 'Elemental', attack: 3, health: 6, tags: ['Spell'] },
      { name: 'Easterly Winds', tribe: 'Spell', attack: null, health: null, tags: ['Generated'] },
      { name: 'Refresh', tribe: 'Action', attack: null, health: null, tags: ['5 left'] },
    ],
    board: [
      { name: 'Waveling', tribe: 'Elemental', attack: 11, health: 6, tags: ['Token Line'] },
      { name: 'En-Djinn Blazer', tribe: 'Elemental', attack: 10, health: 10, tags: ['Battlecry'] },
      { name: 'Mana Surge', tribe: 'Elemental', attack: 9, health: 10, tags: ['Aura'] },
      { name: 'Nomi', tribe: 'Elemental', attack: 6, health: 6, tags: ['Engine'] },
      { name: 'Acid Rainfall', tribe: 'Elemental', attack: 22, health: 22, tags: ['Carry'] },
    ],
    combat: {
      resultLabel: '战斗预演',
      resultText: '中央剧场用来承接后续自动攻击、亡语、复生与战斗日志动画。',
      friendly: [
        { name: 'Waveling', tribe: 'Elemental', attack: 11, health: 6, tags: ['Deathrattle'] },
        { name: 'Acid Rainfall', tribe: 'Elemental', attack: 22, health: 22, tags: ['Carry'] },
        { name: 'Nomi', tribe: 'Elemental', attack: 6, health: 6, tags: ['Engine'] },
      ],
      enemy: [
        { name: 'Peggy', tribe: 'Pirate', attack: 8, health: 6, tags: ['Backline'] },
        { name: 'Dealer', tribe: 'Pirate', attack: 12, health: 12, tags: ['Scaling'] },
        { name: 'Tethys', tribe: 'Pirate', attack: 5, health: 6, tags: ['Value'] },
      ],
    },
  },
  {
    id: 'hybrid-showcase',
    label: '混编展示',
    round: 9,
    gold: 11,
    tavernTier: 6,
    tavernUpgradeCost: '已满本',
    timerSeconds: 48,
    playerHealth: 30,
    playerArmor: 14,
    opponentHero: {
      name: 'Tess Greymane',
      armor: 17,
      health: 26,
      theme: 'hybrid',
      note: '准备接对手复制与战斗承接位',
    },
    shop: [
      {
        tier: 4,
        cost: 3,
        name: 'Flaming Enforcer',
        tribe: 'Demon / Elemental',
        attack: 4,
        health: 5,
        text: 'At the end of your turn, consume the highest-Health minion in the Tavern to gain its stats.',
        tags: ['Hybrid'],
      },
      {
        tier: 6,
        cost: 3,
        name: 'Shore Marauder',
        tribe: 'Elemental / Pirate',
        attack: 4,
        health: 5,
        text: 'Your Pirates and Elementals give an extra +1/+1.',
        tags: ['Bridge'],
      },
      {
        tier: 6,
        cost: 3,
        name: 'Fleet Admiral Tethys',
        tribe: 'Pirate',
        attack: 5,
        health: 6,
        text: 'After you spend 10 Gold, get a random Pirate. (10 left!)',
        tags: ['Value'],
      },
      {
        tier: 5,
        cost: 3,
        name: 'Unleashed Mana Surge',
        tribe: 'Elemental',
        attack: 5,
        health: 4,
        text: 'After you play an Elemental, give your Elementals +2/+2.',
        tags: ['Scaling'],
      },
      {
        tier: 3,
        cost: 3,
        name: 'Stellar Freebooter',
        tribe: 'Pirate',
        attack: 7,
        health: 3,
        text: 'Taunt. Deathrattle: Give another friendly Pirate Health equal to this minion\'s Attack.',
        tags: ['Taunt', 'Deathrattle'],
      },
    ],
    reserve: [
      { name: 'Tavern Coin', tribe: 'Spell', attack: null, health: null, tags: ['Economy'] },
      { name: 'Tavern Coin', tribe: 'Spell', attack: null, health: null, tags: ['Economy'] },
      { name: 'Random Pirate', tribe: 'Generated', attack: null, health: null, tags: ['Tethys'] },
    ],
    board: [
      { name: 'Shore Marauder', tribe: 'Hybrid', attack: 12, health: 11, tags: ['Bridge'] },
      { name: 'Underhanded Dealer', tribe: 'Pirate', attack: 16, health: 16, tags: ['Carry'] },
      { name: 'Unleashed Mana Surge', tribe: 'Elemental', attack: 11, health: 12, tags: ['Aura'] },
      { name: 'Acid Rainfall', tribe: 'Elemental', attack: 24, health: 24, tags: ['Carry'] },
      { name: 'Fleet Admiral Tethys', tribe: 'Pirate', attack: 8, health: 9, tags: ['Value'] },
    ],
    combat: {
      resultLabel: '混编对撞',
      resultText: '这里的布局会作为后续正式战斗动画与结算 HUD 的外观模板。',
      friendly: [
        { name: 'Marauder', tribe: 'Hybrid', attack: 12, health: 11, tags: ['Bridge'] },
        { name: 'Dealer', tribe: 'Pirate', attack: 16, health: 16, tags: ['Carry'] },
        { name: 'Rainfall', tribe: 'Elemental', attack: 24, health: 24, tags: ['Carry'] },
      ],
      enemy: [
        { name: 'Freebooter', tribe: 'Pirate', attack: 7, health: 3, tags: ['Taunt'] },
        { name: 'Blazer', tribe: 'Elemental', attack: 10, health: 10, tags: ['Battlecry'] },
        { name: 'Nomi', tribe: 'Elemental', attack: 6, health: 6, tags: ['Engine'] },
      ],
    },
  },
]);

const BATTLEGROUNDS_TAVERN_ONE_POOL = Object.freeze([
  {
    id: 'bg-t1-minted-corsair',
    tier: 1,
    cost: 3,
    name: 'Minted Corsair',
    tribe: 'Pirate',
    attack: 1,
    health: 3,
    text: 'When you sell this, get a Tavern Coin.',
    tags: ['Economy'],
  },
  {
    id: 'bg-t1-aureate-laureate',
    tier: 1,
    cost: 3,
    name: 'Aureate Laureate',
    tribe: 'Pirate',
    attack: 1,
    health: 1,
    text: 'Divine Shield. Battlecry: Make this minion Golden.',
    tags: ['Divine Shield'],
  },
  {
    id: 'bg-t1-crackling-cyclone',
    tier: 1,
    cost: 3,
    name: 'Crackling Cyclone',
    tribe: 'Elemental',
    attack: 2,
    health: 1,
    text: 'Divine Shield. Windfury.',
    tags: ['Windfury'],
  },
  {
    id: 'bg-t1-dune-dweller',
    tier: 1,
    cost: 3,
    name: 'Dune Dweller',
    tribe: 'Elemental',
    attack: 3,
    health: 2,
    text: 'Battlecry: Give Elementals in the Tavern stats this game.',
    tags: ['Battlecry'],
  },
]);

// ============================================
// DOM元素
// ============================================

const elements = {
  // 大厅相关
  lobbyOverlay: document.getElementById('lobby-overlay'),
  pvpSelect: document.getElementById('pvp-select'),
  createRoomSection: document.getElementById('create-room-section'),
  joinRoomSection: document.getElementById('join-room-section'),
  waitingRoomSection: document.getElementById('waiting-room-section'),

  // 模式选择按钮
  btnPvp: document.getElementById('btn-pvp'),
  btnBattlegrounds: document.getElementById('btn-battlegrounds'),

  // PvP选择页面
  btnCreateRoom: document.getElementById('btn-create-room'),
  btnShowJoin: document.getElementById('btn-show-join'),
  btnStartTest: document.getElementById('btn-start-test'),
  btnDragonWarrior: document.getElementById('btn-dragon-warrior'),
  btnBackFromPvp: document.getElementById('btn-back-from-pvp'),

  // 创建房间
  deckPreview: document.getElementById('deck-preview'),
  btnDoCreate: document.getElementById('btn-do-create'),
  btnBackFromCreate: document.getElementById('btn-back-from-create'),

  // 加入房间
  inputRoomCode: document.getElementById('input-room-code'),
  btnJoinRoom: document.getElementById('btn-join-room'),
  btnBackFromJoin: document.getElementById('btn-back-from-join'),

  // 等待房间
  displayRoomCode: document.getElementById('display-room-code'),
  copyCodeBtn: document.getElementById('copy-code-btn'),
  roomStatus: document.getElementById('room-status'),
  waitingRoomStatus: document.getElementById('waiting-room-status'),
  btnReady: document.getElementById('btn-ready'),
  btnLeaveRoom: document.getElementById('btn-leave-room'),

  // 游戏区域
  gameArea: document.getElementById('game-area'),

  // 原有UI元素
  title: document.getElementById('hero-title'),
  lede: document.querySelector('.lede'),
  connectionStatus: document.getElementById('connection-status'),
  matchStatus: document.getElementById('match-status'),
  turnStatus: document.getElementById('turn-status'),
  lanAddressValue: document.getElementById('lan-address-value'),
  enemyHeroArea: document.getElementById('enemy-hero-area'),
  enemyHeroName: document.getElementById('enemy-hero-name'),
  enemyHeroNote: document.getElementById('enemy-hero-note'),
  enemyHealth: document.getElementById('enemy-health'),
  enemyArmor: document.getElementById('enemy-armor'),
  enemyManaCrystals: document.getElementById('enemy-mana-crystals'),
  enemyMana: document.getElementById('enemy-mana'),
  battlefieldZone: document.getElementById('battlefield-zone'),
  enemyBoardLane: document.getElementById('enemy-board-lane'),
  playerHeroArea: document.getElementById('player-hero-area'),
  playerHeroName: document.getElementById('player-hero-name'),
  playerHeroNote: document.getElementById('player-hero-note'),
  playerHealth: document.getElementById('player-health'),
  playerArmor: document.getElementById('player-armor'),
  playerManaCrystals: document.getElementById('player-mana-crystals'),
  playerMana: document.getElementById('player-mana'),
  playerBoardLane: document.getElementById('player-board-lane'),
  handCards: document.getElementById('hand-cards'),
  deckStack: document.getElementById('deck-stack'),
  deckCount: document.getElementById('deck-count'),
  enemyDeckStack: document.getElementById('enemy-deck-stack'),
  enemyHandCountHint: document.getElementById('enemy-hand-count-hint'),
  enemyDeckCount: document.getElementById('enemy-deck-count'),
  playerWeapon: document.getElementById('player-weapon'),
  playerWeaponAtk: document.querySelector('#player-weapon .weapon-slot__attack'),
  playerWeaponDur: document.querySelector('#player-weapon .weapon-slot__durability'),
  enemyWeapon: document.getElementById('enemy-weapon'),
  enemyWeaponAtk: document.querySelector('#enemy-weapon .weapon-slot__attack'),
  enemyWeaponDur: document.querySelector('#enemy-weapon .weapon-slot__durability'),
  combatTextLayer: document.getElementById('combat-text-layer'),
  combatLog: document.getElementById('combat-log'),
  restartButton: document.getElementById('restart-button'),
  endTurnButton: document.getElementById('end-turn-button'),
  tipList: document.querySelector('.tip-list'),

  // 对战相关
  opponentInfo: document.getElementById('opponent-info'),
  pvpStatus: document.getElementById('pvp-status'),
  pvpTurnIndicator: document.getElementById('pvp-turn-indicator'),
};

// ============================================
// 动画器
// ============================================

const animator = window.ClawHearthstoneAnimations?.createAnimator?.({
  root: document.body,
}) || null;

// ============================================
// 游戏状态
// ============================================

const state = {
  // 通用状态
  meta: null,
  busy: false,
  log: [],

  // 单机模式
  solo: {
    scenarioId: 'boss',
    phase: 'player',
    turn: 1,
    selectedAttackerId: '',
    pendingSpellId: '',
    player: null,
    boss: null,
  },

  // 对战模式
  pvp: {
    mySocketId: null,
    mySlot: null, // 'player1' | 'player2'
    activePlayerId: null,
    turn: 1,
    phase: 'playing',
    winnerId: null,
    selectedAttackerId: '',
    pendingSpellId: '',
    player: null,   // 我的玩家数据（统一格式）
    opponent: null, // 对手数据（统一格式）
  },

  battlegrounds: {
    phase: 'hero-select',
    round: 1,
    previewIndex: 0,
    selectedHeroId: '',
    heroChoices: [],
    gold: 3,
    tavernTier: 1,
    tavernUpgradeCost: 5,
    isFrozen: false,
    timerSeconds: 45,
    playerHealth: 40,
    playerArmor: 0,
    opponentHero: null,
    shopSlots: 3,
    maxBoardSlots: 7,
    maxHandSlots: 10,
    refreshCost: 1,
    reservePreview: [],
    shopPreview: [],
    boardPreview: [],
    combatPreview: null,
    log: [],
  },

  // 当前模式
  mode: 'menu', // 'menu' | 'solo' | 'pvp' | 'battlegrounds'
};

// ============================================
// 工具函数
// ============================================

function cloneValue(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function loadStoredJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / availability errors
  }
}

function clearStoredJson(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function uid(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2)}`;
}

function shuffle(list) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function isQuestlineCard(card) {
  return (card.mechanics || []).includes('questline');
}

function buildDeck() {
  const scenario = getSoloScenario();
  if (scenario.scenarioId === 'mechanics-test') {
    const deck = [];
    for (const entry of mechanicTestDeck) {
      const card = effectiveCardById[entry.cardId];
      if (!card) continue;
      for (let i = 0; i < (entry.count || 1); i++) {
        deck.push({ ...card, instanceId: uid(`mt-${card.id}-${i}`) });
      }
    }
    return shuffle(deck);
  }
  const questCards = [];
  const normalCards = [];
  for (const base of effectiveCards) {
    if (!base.enabled) continue;
    const copies = Math.max(0, Number.parseInt(base.deckCount ?? 0, 10) || 0);
    if (!copies) continue;
    for (let count = 0; count < copies; count += 1) {
      const instance = { ...base, instanceId: uid(`card-${base.id}`) };
      if (isQuestlineCard(base)) {
        questCards.push(instance);
      } else {
        normalCards.push(instance);
      }
    }
  }
  // 任务牌不参与洗牌，放在牌库末尾（起始抽牌前会提到手牌）
  return [...shuffle(normalCards), ...questCards];
}

function cloneMinion(source, side, overrides = {}) {
  const attack = overrides.attack ?? source.attack ?? 0;
  const health = overrides.health ?? source.health ?? 1;
  const keywords = overrides.keywords ?? source.keywords;
  const runtimeState = createMinionRuntimeState(keywords, {
    ...overrides,
    sleeping: overrides.sleeping ?? true,
  });
  return {
    instanceId: uid(`${side}-minion`),
    side,
    sourceId: source.id || source.name || `${side}-token`,
    name: overrides.name || source.name || 'Nameless Minion',
    text: overrides.text ?? source.text ?? buildKeywordText(keywords),
    effects: cloneValue(overrides.effects ?? source.effects ?? []),
    mechanics: cloneValue(overrides.mechanics ?? source.mechanics ?? []),
    attack,
    health,
    maxHealth: health,
    ...runtimeState,
  };
}

function keywordBadgesMarkup(entity, className = 'board-minion__keywords') {
  const keywords = getDisplayKeywords(entity);
  if (!keywords.length) return '';
  return `
    <span class="${className}">
      ${keywords
        .map((keyword) => `<span class="keyword-pill keyword-pill--${keyword}">${keywordLabel(keyword)}</span>`)
        .join('')}
    </span>
  `;
}

function keywordLabel(keyword) {
  return summarizeKeywords([keyword]) || keyword;
}

function resolveCardText(card) {
  if (card.text) return card.text;
  if (card.type === 'minion') return buildKeywordText(card.keywords);
  return '';
}

function getSoloScenario() {
  return SOLO_SCENARIOS[state.solo.scenarioId] || BOSS_SOLO_SCENARIO;
}

function getSoloTurnLimit() {
  const turnLimit = getSoloScenario().turnLimit;
  return Number.isFinite(turnLimit) ? turnLimit : null;
}

function updateAppUrl(mode = 'menu', extra = {}) {
  const url = new URL(window.location.href);
  url.pathname = '/';
  url.search = '';

  if (mode === 'solo') {
    url.searchParams.set('mode', 'solo');
    url.searchParams.set('scenario', extra.scenarioId || state.solo.scenarioId || 'boss');
  } else if (mode === 'pvp') {
    url.searchParams.set('mode', 'pvp');
    const roomId = extra.roomId || network.roomId;
    if (roomId) {
      url.searchParams.set('room', roomId);
    }
  } else if (mode === 'battlegrounds') {
    url.searchParams.set('mode', 'battlegrounds');
  }

  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}

function saveSoloProgress() {
  if (state.mode !== 'solo' || !state.solo.player || !state.solo.boss) return;
  saveStoredJson(SOLO_PROGRESS_STORAGE_KEY, {
    version: 1,
    savedAt: Date.now(),
    scenarioId: state.solo.scenarioId,
    solo: cloneValue(state.solo),
  });
}

function savePvpProgress(status = null) {
  const roomId = network.roomId;
  const snapshot = state.mode === 'pvp' ? cloneValue(state.pvp) : null;
  if (!roomId && !snapshot) return;
  saveStoredJson(PVP_PROGRESS_STORAGE_KEY, {
    version: 1,
    savedAt: Date.now(),
    roomId,
    status: status || (snapshot ? 'playing' : 'waiting'),
    snapshot,
  });
}

function clearPvpProgress() {
  clearStoredJson(PVP_PROGRESS_STORAGE_KEY);
}

function restoreSoloProgress(snapshot) {
  if (!snapshot?.solo || !snapshot?.scenarioId || !SOLO_SCENARIOS[snapshot.scenarioId]) {
    return false;
  }

  state.solo.scenarioId = snapshot.scenarioId;
  state.solo.phase = snapshot.solo.phase || 'player';
  state.solo.turn = Number(snapshot.solo.turn) || 1;
  state.solo.selectedAttackerId = snapshot.solo.selectedAttackerId || '';
  state.solo.pendingSpellId = snapshot.solo.pendingSpellId || '';
  state.solo.busy = false;
  state.solo.log = Array.isArray(snapshot.solo.log) ? snapshot.solo.log : [];
  state.solo.player = snapshot.solo.player || null;
  state.solo.boss = snapshot.solo.boss || null;
  state.mode = 'solo';
  hideLobbyOverlay();
  updateAppUrl('solo', { scenarioId: snapshot.scenarioId });
  renderSolo();
  return true;
}

function attemptInitialResume() {
  if (state.mode !== 'menu') return;

  const url = new URL(window.location.href);
  const requestedMode = url.searchParams.get('mode');

  if (requestedMode === 'solo') {
    const scenarioId = url.searchParams.get('scenario') || 'boss';
    const soloSnapshot = loadStoredJson(SOLO_PROGRESS_STORAGE_KEY);
    if (soloSnapshot?.scenarioId === scenarioId && restoreSoloProgress(soloSnapshot)) {
      showToast('已恢复上次单人进度');
      return;
    }
    startSoloMode(scenarioId);
    return;
  }

  if (requestedMode === 'battlegrounds') {
    startBattlegroundsMode();
    return;
  }

  if (requestedMode === 'pvp') {
    savePvpProgress('resume-requested');
    return;
  }

  const soloSnapshot = loadStoredJson(SOLO_PROGRESS_STORAGE_KEY);
  if (soloSnapshot && restoreSoloProgress(soloSnapshot)) {
    showToast('已恢复上次单人进度');
  }
}

// ============================================
// 大厅UI管理
// ============================================

function showLobbyOverlay(options = {}) {
  const preserveUrl = options.preserveUrl === true;
  clearOpeningAnnouncement();
  elements.lobbyOverlay.style.display = 'flex';
  hideBattlegroundsView(elements.gameArea);
  if (elements.gameArea) {
    elements.gameArea.style.display = '';
  }
  elements.pvpTurnIndicator.style.display = 'none';
  state.mode = 'menu';
  if (!preserveUrl) {
    updateAppUrl('menu');
  }
  showPvPSelect();
}

function hideLobbyOverlay() {
  elements.lobbyOverlay.style.display = 'none';
}

function showPvPSelect() {
  hideAllLobbySections();
  elements.pvpSelect.style.display = 'block';
}

function showCreateRoomSection() {
  hideAllLobbySections();
  elements.createRoomSection.style.display = 'block';
  updateDeckPreview();
}

function showJoinRoomSection() {
  hideAllLobbySections();
  elements.joinRoomSection.style.display = 'block';
  elements.inputRoomCode.value = '';
}

function showWaitingRoom(roomId, isHost = false) {
  hideAllLobbySections();
  elements.waitingRoomSection.style.display = 'block';
  elements.displayRoomCode.textContent = roomId || '????';
  updateAppUrl('pvp', { roomId });
  savePvpProgress('waiting');

  if (isHost) {
    elements.waitingRoomStatus.textContent = '等待对手加入...';
    elements.roomStatus.innerHTML = '<p>等待对手加入房间...</p><div class="loading-dots"></div>';
    elements.btnReady.style.display = 'none';
  } else {
    elements.waitingRoomStatus.textContent = '已加入房间';
    elements.roomStatus.innerHTML = '<p>等待房主开始...</p><div class="loading-dots"></div>';
    elements.btnReady.style.display = 'inline-flex';
  }
}

function updateWaitingRoomFromState(roomState) {
  showWaitingRoom(roomState.roomId, roomState.isHost);
  savePvpProgress(roomState.hostReady && roomState.guestReady ? 'starting' : 'waiting');

  if (!roomState.guestPlayerId) {
    elements.waitingRoomStatus.textContent = '等待对手加入...';
    elements.roomStatus.innerHTML = '<p>等待对手加入房间...</p><div class="loading-dots"></div>';
    elements.btnReady.style.display = 'none';
    return;
  }

  if (roomState.hostReady && roomState.guestReady) {
    elements.waitingRoomStatus.textContent = '双方已准备';
    elements.roomStatus.innerHTML = '<p>正在开始对战...</p><div class="loading-dots"></div>';
    elements.btnReady.style.display = 'none';
    return;
  }

  if (roomState.isHost) {
    elements.waitingRoomStatus.textContent = '对手已加入';
    if (roomState.hostReady) {
      elements.roomStatus.innerHTML = '<p>你已准备，等待对手...</p><div class="loading-dots"></div>';
      elements.btnReady.style.display = 'none';
      return;
    }
    if (roomState.guestReady) {
      elements.roomStatus.innerHTML = '<p>对手已准备!</p><p>点击准备开始游戏</p>';
    } else {
      elements.roomStatus.innerHTML = '<p>对手已加入!</p><p>点击准备开始游戏</p>';
    }
    elements.btnReady.style.display = 'inline-flex';
    return;
  }

  elements.waitingRoomStatus.textContent = '已加入房间';
  if (roomState.guestReady) {
    elements.roomStatus.innerHTML = '<p>你已准备，等待房主开始...</p><div class="loading-dots"></div>';
    elements.btnReady.style.display = 'none';
    return;
  }
  if (roomState.hostReady) {
    elements.roomStatus.innerHTML = '<p>房主已准备!</p><p>点击准备开始游戏</p>';
  } else {
    elements.roomStatus.innerHTML = '<p>等待房主准备，或先点击准备。</p>';
  }
  elements.btnReady.style.display = 'inline-flex';
}

function hideAllLobbySections() {
  elements.pvpSelect.style.display = 'none';
  elements.createRoomSection.style.display = 'none';
  elements.joinRoomSection.style.display = 'none';
  elements.waitingRoomSection.style.display = 'none';
}

function updateDeckPreview() {
  const deck = loadDeckFromEditor();
  const deckList = document.getElementById('deck-card-list');
  if (deckList) {
    // 统计卡牌数量
    const cardCount = {};
    for (const cardId of deck) {
      cardCount[cardId] = (cardCount[cardId] || 0) + 1;
    }

    deckList.innerHTML = Object.entries(cardCount)
      .map(([cardId, count]) => {
        const card = effectiveCardById[cardId];
        const name = card ? card.name : cardId;
        return `<li>${name} x${count}</li>`;
      })
      .join('');
  }

  const deckCount = document.getElementById('deck-total-count');
  if (deckCount) {
    deckCount.textContent = deck.length;
  }
}

function loadDeckFromEditor() {
  try {
    const overrides = JSON.parse(localStorage.getItem('cardOverrides') || '{}');
    const customCards = JSON.parse(localStorage.getItem('customCards') || '[]');

    // 构建当前启用的卡组
    const deck = [];

    for (const [cardId, override] of Object.entries(overrides)) {
      if (override.enabled !== false && override.deckCount > 0) {
        for (let i = 0; i < override.deckCount; i++) {
          deck.push(cardId);
        }
      }
    }

    // 添加自定义卡牌
    for (const card of customCards) {
      if (card.enabled !== false && card.deckCount > 0) {
        for (let i = 0; i < card.deckCount; i++) {
          deck.push(card.id);
        }
      }
    }

    // 如果没有自定义卡组，使用默认起始卡组
    if (deck.length === 0) {
      for (const entry of starterDeck) {
        for (let i = 0; i < entry.count; i++) {
          deck.push(entry.cardId);
        }
      }
    }

    return deck;
  } catch {
    // 回退到默认起始卡组
    const deck = [];
    for (const entry of starterDeck) {
      for (let i = 0; i < entry.count; i++) {
        deck.push(entry.cardId);
      }
    }
    return deck;
  }
}

// ============================================
// 大厅事件绑定
// ============================================

function setupLobbyEvents() {
  // 点击"局域网对战" -> 进入PvP选择页面
  elements.btnPvp?.addEventListener('click', () => {
    showPvPSelect();
  });

  elements.btnBattlegrounds?.addEventListener('click', () => {
    startBattlegroundsMode();
  });

  // PvP选择页面 - 创建房间
  elements.btnCreateRoom?.addEventListener('click', () => {
    showCreateRoomSection();
  });

  // PvP选择页面 - 显示加入房间
  elements.btnShowJoin?.addEventListener('click', () => {
    showJoinRoomSection();
  });

  elements.btnStartTest?.addEventListener('click', () => {
    startSoloMode('test');
  });

  elements.btnDragonWarrior?.addEventListener('click', () => {
    startSoloMode('dragon-warrior');
  });

  // PvP选择页面 - 返回大厅
  elements.btnBackFromPvp?.addEventListener('click', () => {
    hideAllLobbySections();
  });

  // 创建房间 - 确认创建
  elements.btnDoCreate?.addEventListener('click', () => {
    const deck = loadDeckFromEditor();
    if (deck.length < 10) {
      alert('卡组至少需要10张牌');
      return;
    }
    network.createRoom(deck);
  });

  elements.btnBackFromCreate?.addEventListener('click', showPvPSelect);

  // 加入房间
  elements.btnJoinRoom?.addEventListener('click', () => {
    const roomCode = elements.inputRoomCode.value.trim().toUpperCase();
    if (roomCode.length !== 4) {
      alert('请输入4位房间号');
      return;
    }
    const deck = loadDeckFromEditor();
    network.joinRoom(roomCode, deck);
  });

  elements.btnBackFromJoin?.addEventListener('click', showPvPSelect);

  // 等待房间
  elements.copyCodeBtn?.addEventListener('click', () => {
    const code = elements.displayRoomCode.textContent;
    navigator.clipboard.writeText(code).then(() => {
      elements.copyCodeBtn.textContent = '已复制!';
      setTimeout(() => {
        elements.copyCodeBtn.textContent = '复制房间号';
      }, 2000);
    });
  });

  // 准备按钮
  elements.btnReady?.addEventListener('click', () => {
    network.setReady();
    elements.btnReady.style.display = 'none';
    elements.waitingRoomStatus.textContent = '等待对手准备...';
    elements.roomStatus.innerHTML = '<p>你已准备，等待对手...</p><div class="loading-dots"></div>';
  });

  elements.btnLeaveRoom?.addEventListener('click', () => {
    clearPvpProgress();
    network.leaveRoom();
    showPvPSelect();
  });
}

// ============================================
// 网络事件处理
// ============================================

function setupNetworkListeners() {
  network.on('connected', () => {
    console.log('Connected to server');
    elements.connectionStatus.textContent = '已连接';
  });

  network.on('session', () => {
    window.setTimeout(() => {
      attemptInitialResume();
    }, 120);
  });

  network.on('disconnected', () => {
    console.log('Disconnected from server');
    elements.connectionStatus.textContent = '未连接';
    if (state.mode === 'pvp') {
      showToast('与服务器断开连接');
      setTimeout(() => showLobbyOverlay(), 2000);
    }
  });

  network.on('room_created', (data) => {
    console.log('Room created:', data);
    savePvpProgress('waiting');
    showWaitingRoom(data.roomId, true); // 房主视角
  });

  network.on('room_state', (data) => {
    console.log('Room state:', data);
    updateWaitingRoomFromState(data);
  });

  network.on('room_joined', (data) => {
    console.log('Room joined:', data);
    savePvpProgress('waiting');
    showWaitingRoom(data.roomId, false);
  });

  network.on('game_started', (data) => {
    console.log('=== GAME STARTED ===', data);
    startPvpMode(data.state);
  });

  network.on('state_update', (stateData) => {
    console.log('State update:', stateData);
    updatePvpState(stateData);
  });

  network.on('action_rejected', (data) => {
    console.log('Action rejected:', data);
    showToast(data.reason || '操作被拒绝');
  });

  network.on('player_disconnected', (data) => {
    console.log('Player disconnected:', data);
    const myPlayerId = state.pvp.mySocketId || network.playerId;
    showToast(`对手断线！${data.winnerId === myPlayerId ? '你获胜了！' : '你输了'}`);
    clearPvpProgress();
    if (data.winnerId === myPlayerId) {
      endPvpGame(true);
    } else {
      endPvpGame(false);
    }
  });

  network.on('room_not_found', (data) => {
    clearPvpProgress();
    alert(`房间 ${data.roomId} 不存在`);
  });

  network.on('room_closed', (data) => {
    clearPvpProgress();
    showToast('房间已关闭');
    showLobbyOverlay();
  });

  network.on('error', (data) => {
    console.error('Network error:', data);
    showToast(data.message || '网络错误');
  });
}

// ============================================
// 单机模式
// ============================================

function ensureQuestlineInOpeningHand(scenario) {
  // 把任务牌从牌库提到手牌最前面
  const deck = state.solo.player.deck;
  const hand = state.solo.player.hand;
  const questIndices = [];
  for (let i = deck.length - 1; i >= 0; i--) {
    if (isQuestlineCard(deck[i])) {
      questIndices.push(i);
    }
  }
  for (const idx of questIndices) {
    const [questCard] = deck.splice(idx, 1);
    hand.unshift(questCard);
  }
  // 任务牌不占手牌上限，从手牌上限中扣除
  const normalDraw = Math.max(0, (scenario.player.handSize || 3) - questIndices.length);
  return { questCount: questIndices.length, normalDraw };
}

function startSoloMode(scenarioId = 'boss') {
  state.solo.scenarioId = SOLO_SCENARIOS[scenarioId] ? scenarioId : 'boss';
  const scenario = getSoloScenario();
  state.mode = 'solo';
  hideLobbyOverlay();
  updateAppUrl('solo', { scenarioId: state.solo.scenarioId });

  initSoloState();
  const { normalDraw } = ensureQuestlineInOpeningHand(scenario);
  drawCards(normalDraw);
  if (getSoloTurnLimit()) {
    pushSoloLog(`战斗开始。目标：在 ${getSoloTurnLimit()} 回合内击败 ${state.solo.boss.heroName}。`);
  } else {
    pushSoloLog(`测试开始。你现在可以单人测试 ${state.solo.boss.heroName} 的回合流程。`);
  }
  pushSoloLog(`对手情报：${scenario.boss.passive.text}`);
  renderSolo();
}

function initSoloState() {
  const scenario = getSoloScenario();
  const playerDeck = buildDeck();

  _handDomIds.clear();
  elements.handCards.style.minHeight = '';
  state.solo.phase = 'player';
  state.solo.turn = 1;
  state.solo.selectedAttackerId = '';
  state.solo.pendingSpellId = '';
  state.solo.busy = false;
  state.solo.log = [];

  state.solo.player = {
    heroName: scenario.player.heroName,
    health: scenario.player.heroHealth,
    maxHealth: scenario.player.heroHealth,
    armor: scenario.player.heroArmor,
    mana: 1,
    maxMana: 1,
    deck: playerDeck,
    hand: [],
    board: [],
    heroPowerUsed: false,
    // 武器
    weapon: null,
    heroAttackThisTurn: 0,
    // 地标
    locations: [],
    // 延系 / 火焰法术追踪
    tribesPlayedThisTurn: [],
    tribesPlayedLastTurn: [],
    spellSchoolsPlayedThisTurn: [],
    playedFireSpellThisTurn: false,
    runtime: {
      selfDamageThisTurn: 0,
      selfDamageThisGame: 0,
      damageTakenThisTurn: 0,
      healthChangesThisTurn: 0,
      healthChangesThisGame: 0,
      questline: null,
      redirectSelfDamage: false,
      delayedDamage: [],
      cardsPlayedThisTurn: [],
      spellsPlayedThisTurn: [],
      minionsDiedThisTurn: [],
      deadFriendlyMinions: [],
    },
  };

  const isDragonWarrior = (scenario.scenarioId || state.solo?.scenarioId) === 'dragon-warrior';

  if (isDragonWarrior) {
    // 龙战 boss：拥有完整的牌库和手牌系统
    const bossDeck = buildDragonWarriorBossDeck();
    const bossHand = [];
    // 初始抽 4 张（后手）
    for (let i = 0; i < 4; i++) {
      if (bossDeck.length) bossHand.push(bossDeck.pop());
    }
    // 固定牌序模式：跳过调度，保持教学曲线
    // 期望起手: 载蛋雏龙、黑暗龙骑士、龙巢守护者、晦鳞巢母
    pushSoloLog(`${scenario.boss.name} 以固定教学牌序开始对局。`);
    state.solo.boss = {
      heroName: scenario.boss.name,
      health: scenario.boss.heroHealth,
      maxHealth: scenario.boss.heroHealth,
      armor: scenario.boss.heroArmor,
      mana: 1,
      maxMana: 1,
      deck: bossDeck,
      hand: bossHand,
      board: [],
      heroPowerUsed: false,
      weapon: null,
      heroAttackThisTurn: 0,
      heroAttackUsedThisTurn: false,
      locations: [],
      tribesPlayedThisTurn: [],
      tribesPlayedLastTurn: [],
      spellSchoolsPlayedThisTurn: [],
      playedFireSpellThisTurn: false,
      runtime: {
        selfDamageThisTurn: 0,
        selfDamageThisGame: 0,
        damageTakenThisTurn: 0,
        healthChangesThisTurn: 0,
        healthChangesThisGame: 0,
        questline: null,
        redirectSelfDamage: false,
        delayedDamage: [],
        deadFriendlyMinions: [],
      },
    };
  } else {
    state.solo.boss = {
      heroName: scenario.boss.name,
      health: scenario.boss.heroHealth,
      maxHealth: scenario.boss.heroHealth,
      armor: scenario.boss.heroArmor,
      mana: 1,
      maxMana: 1,
      board: [],
    };
  }
}

// 龙战高手固定抽牌顺序 — 精确到每张牌（含2张副本时的区分）
// 数值越高 → 排越后面 → pop() 越先抽到
const DW_DRAW_ORDER = [
  // 起手4张 (pop顺序: 29→28→27→26)
  'dw-egg-carrier',           // 1st draw → 起手
  'dw-dark-dragon-knight',    // 2nd draw → 起手
  'dw-dragon-nest-guardian',  // 3rd draw → 起手
  'dw-dark-scale-matron',     // 4th draw → 起手
  // Turn 1-4 抽牌 (pop: 25→24→23→22)
  'dw-flower-vendor',         // T1
  'dw-windrider-dragon',      // T2 ★ 乘风浮龙进手
  'dw-shadow-flame-infusion', // T3
  'dw-prescient-whelp',       // T4 ★ 先觉蜿变幼龙进手
  // Turn 5+ 抽牌 (pop: 21→20→...)
  'dw-egg-carrier',           // T5 第二张载蛋雏龙
  'dw-dark-dragon-knight',    // T6 第二张黑暗龙骑士
  'dw-dragon-nest-guardian',  // T7 第二张龙巢守护者
  'dw-dark-scale-matron',     // T8 第二张晦鳞巢母
  'dw-scorching-fissure',     // T9
  'dw-preemptive-strike',     // T10
  'dw-windrider-dragon',      // T11 第二张乘风浮龙
  'dw-flower-vendor',         // T12 第二张鲜花商贩
  'dw-shadow-flame-infusion', // T13
  'dw-prescient-whelp',       // T14 第二张先觉幼龙
  'dw-scorching-fissure',     // T15
  'dw-preemptive-strike',     // T16
  'dw-erupting-volcano',      // T17
  'dw-erupting-volcano',      // T18
  'dw-field-announcer',       // T19
  'dw-field-announcer',       // T20
  'dw-searing-flame',         // T21
  'dw-searing-flame',         // T22
  'dw-crimson-abyss',         // T23
  'dw-crimson-abyss',         // T24
  'dw-eternal-pain',          // T25
  'dw-grommash',              // T26 — 最后抽到
];

function buildDragonWarriorBossDeck() {
  // 按 DW_DRAW_ORDER 顺序构建牌库，index 0 = 最后抽，index 29 = 最先抽
  const deck = [];
  const usedCount = {};
  for (const cardId of DW_DRAW_ORDER) {
    const card = effectiveCardById[cardId];
    if (!card) continue;
    usedCount[cardId] = (usedCount[cardId] || 0) + 1;
    deck.push({ ...card, instanceId: uid(`dw-${cardId}-${usedCount[cardId]}`) });
  }
  // DW_DRAW_ORDER[0]=最先抽 → 反转后 push 顺序变成 pop 顺序
  deck.reverse();
  return deck;
}

// ============================================
// 对战模式
// ============================================

function startPvpMode(gameState) {
  const mySlot = gameState.mySlot;
  const myPlayer = gameState.myPlayer || (mySlot === 'player1' ? gameState.player1 : gameState.player2) || null;
  const opponentPlayer = gameState.opponentPlayer || (mySlot === 'player1' ? gameState.player2 : gameState.player1) || null;

  state.mode = 'pvp';
  state.pvp.mySlot = mySlot;
  state.pvp.mySocketId = myPlayer?.socketId || network.playerId;
  state.pvp.activePlayerId = gameState.activePlayerId;
  state.pvp.turn = gameState.turn;
  state.pvp.phase = gameState.phase;
  state.pvp.winnerId = gameState.winnerId;
  state.pvp.selectedAttackerId = '';
  state.pvp.pendingSpellId = '';
  state.pvp.player = myPlayer;
  state.pvp.opponent = opponentPlayer;
  state.pvp.log = gameState.actionLog || [];

  // 隐藏大厅，显示游戏界面
  hideLobbyOverlay();
  updateAppUrl('pvp', { roomId: network.roomId });
  savePvpProgress('playing');

  renderPvp();
  showOpeningAnnouncement(state.pvp.activePlayerId === state.pvp.mySocketId);
  animator?.turnBanner?.(
    state.pvp.activePlayerId === state.pvp.mySocketId ? '你的回合' : '对手先行动',
    { durationMs: 1200 }
  );
}

// ============================================
// 酒馆战棋模式
// ============================================

function buildBattlegroundsShopPreview(seed = 0) {
  const scenario = BATTLEGROUNDS_PREVIEW_SCENARIOS[seed % BATTLEGROUNDS_PREVIEW_SCENARIOS.length];
  return scenario.shop.map((card) => ({ ...card }));
}

function buildBattlegroundsBoardPreview(seed = 0) {
  const scenario = BATTLEGROUNDS_PREVIEW_SCENARIOS[seed % BATTLEGROUNDS_PREVIEW_SCENARIOS.length];
  return scenario.board.map((card) => ({ ...card }));
}

function buildBattlegroundsReservePreview(seed = 0) {
  const scenario = BATTLEGROUNDS_PREVIEW_SCENARIOS[seed % BATTLEGROUNDS_PREVIEW_SCENARIOS.length];
  return scenario.reserve.map((card) => ({ ...card }));
}

function buildBattlegroundsCombatPreview(seed = 0) {
  const scenario = BATTLEGROUNDS_PREVIEW_SCENARIOS[seed % BATTLEGROUNDS_PREVIEW_SCENARIOS.length];
  return {
    ...scenario.combat,
    friendly: scenario.combat.friendly.map((card) => ({ ...card })),
    enemy: scenario.combat.enemy.map((card) => ({ ...card })),
  };
}

function cloneBattlegroundsCombatMinion(card, side, index) {
  const attack = Number(card?.attack) || 0;
  const health = Number(card?.health) || 0;
  const maxHealth = Number(card?.maxHealth);
  return {
    ...card,
    instanceId: card?.instanceId || `bg-combat-${side}-${index}`,
    combatSide: side,
    combatIndex: index,
    startingHealth: health,
    health,
    maxHealth: Number.isFinite(maxHealth) ? Math.max(maxHealth, health) : health,
    attack,
    alive: health > 0,
    highlighted: false,
    damageTaken: 0,
  };
}

function getBattlegroundsCombatSourceBoard(sourceBoard = [], side) {
  return sourceBoard.map((card, index) => cloneBattlegroundsCombatMinion(card, side, index));
}

function findBattlegroundsNextLivingIndex(board, startIndex = 0) {
  if (!Array.isArray(board) || !board.length) return -1;
  for (let index = Math.max(0, startIndex); index < board.length; index += 1) {
    if (board[index]?.health > 0) return index;
  }
  for (let index = 0; index < Math.max(0, startIndex); index += 1) {
    if (board[index]?.health > 0) return index;
  }
  return -1;
}

function sumBattlegroundsBoardAttack(board) {
  return (board || []).reduce((total, minion) => total + Math.max(0, Number(minion?.attack) || 0), 0);
}

function applyBattlegroundsHeroDamage(hero, amount) {
  if (!hero || amount <= 0) {
    return { absorbed: 0, healthLoss: 0, total: 0 };
  }
  const absorbed = Math.min(Number(hero.armor) || 0, amount);
  hero.armor = Math.max(0, (Number(hero.armor) || 0) - absorbed);
  const healthLoss = amount - absorbed;
  hero.health = Math.max(0, (Number(hero.health) || 0) - healthLoss);
  return { absorbed, healthLoss, total: amount };
}

function createBattlegroundsInstance(card, source = 'shop') {
  return {
    ...card,
    instanceId: `bg-${source}-${Math.random().toString(36).slice(2, 10)}`,
  };
}

function captureBattlegroundsElementRects(selector, attributeName) {
  if (!elements.gameArea) return {};
  return Array.from(elements.gameArea.querySelectorAll(selector)).reduce((accumulator, element) => {
    const key = element.getAttribute(attributeName);
    if (!key) return accumulator;
    accumulator[key] = element.getBoundingClientRect();
    return accumulator;
  }, {});
}

function captureBattlegroundsPoint(selector) {
  const element = elements.gameArea?.querySelector(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function animateBattlegroundsReflow(previousRects, selector, attributeName, options = {}) {
  if (!previousRects || !elements.gameArea) return;
  for (const element of elements.gameArea.querySelectorAll(selector)) {
    const key = element.getAttribute(attributeName);
    const previousRect = key ? previousRects[key] : null;
    if (!previousRect || typeof element.animate !== 'function') continue;

    const nextRect = element.getBoundingClientRect();
    const dx = previousRect.left - nextRect.left;
    const dy = previousRect.top - nextRect.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

    element.animate(
      [
        { transform: `translate3d(${dx}px, ${dy}px, 0)` },
        { transform: 'translate3d(0, 0, 0)' },
      ],
      {
        duration: options.durationMs || 320,
        easing: options.easing || 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        fill: 'both',
      }
    );
  }
}

function pulseBattlegroundsStats(selector) {
  if (!selector || !elements.gameArea) return;
  for (const chip of elements.gameArea.querySelectorAll(selector)) {
    animator?.pulseStat?.(chip, { durationMs: 260 });
  }
}

function runBattlegroundsAnimationPlan(plan) {
  if (!plan) return;
  window.requestAnimationFrame(() => {
    plan.reflows?.forEach((entry) => {
      animateBattlegroundsReflow(entry.previousRects, entry.selector, entry.attributeName, entry.options);
    });

    if (plan.transfer?.targetSelector && plan.transfer.fromPoint) {
      animator?.flingCard?.(plan.transfer.targetSelector, {
        from: plan.transfer.fromPoint,
        durationMs: plan.transfer.durationMs || 360,
        lift: plan.transfer.lift ?? 28,
        rotate: plan.transfer.rotate ?? 4,
      });
      window.setTimeout(() => pulseBattlegroundsStats(plan.transfer.statSelector), 110);
    }
  });
}

function drawBattlegroundsTavernOneShop(count = 3) {
  const nextShop = [];
  for (let index = 0; index < count; index += 1) {
    const baseCard = BATTLEGROUNDS_TAVERN_ONE_POOL[Math.floor(Math.random() * BATTLEGROUNDS_TAVERN_ONE_POOL.length)];
    nextShop.push(createBattlegroundsInstance(baseCard));
  }
  return nextShop;
}

function applyBattlegroundsPreviewScenario(index = 0) {
  const scenario = BATTLEGROUNDS_PREVIEW_SCENARIOS[index % BATTLEGROUNDS_PREVIEW_SCENARIOS.length];
  state.battlegrounds.previewIndex = index % BATTLEGROUNDS_PREVIEW_SCENARIOS.length;
  state.battlegrounds.round = scenario.round;
  state.battlegrounds.gold = scenario.gold;
  state.battlegrounds.tavernTier = scenario.tavernTier;
  state.battlegrounds.tavernUpgradeCost = scenario.tavernUpgradeCost;
  state.battlegrounds.timerSeconds = scenario.timerSeconds;
  state.battlegrounds.playerHealth = scenario.playerHealth;
  state.battlegrounds.playerArmor = scenario.playerArmor;
  state.battlegrounds.opponentHero = { ...scenario.opponentHero };
  state.battlegrounds.reservePreview = buildBattlegroundsReservePreview(index);
  state.battlegrounds.shopPreview = buildBattlegroundsShopPreview(index).map((card) => ({
    ...card,
    frozen: state.battlegrounds.isFrozen,
  }));
  state.battlegrounds.boardPreview = buildBattlegroundsBoardPreview(index);
  state.battlegrounds.combatPreview = buildBattlegroundsCombatPreview(index);
}

function initBattlegroundsState() {
  state.battlegrounds.phase = 'hero-select';
  state.battlegrounds.previewIndex = 0;
  state.battlegrounds.selectedHeroId = '';
  state.battlegrounds.heroChoices = shuffle(BATTLEGROUNDS_PLACEHOLDER_HEROES).slice(0, 4);
  state.battlegrounds.isFrozen = false;
  state.battlegrounds.shopSlots = 3;
  state.battlegrounds.maxBoardSlots = 7;
  state.battlegrounds.maxHandSlots = 10;
  state.battlegrounds.refreshCost = 1;
  applyBattlegroundsPreviewScenario(0);
  state.battlegrounds.log = [
    '已进入酒馆战棋独立路由。',
    'S12 赛季末海盗 / 元素首期池已接到视觉壳里，等待你核对。',
    '当前仍然不做淘汰 / 出局，后续再补。',
  ];
}

function startBattlegroundsMode() {
  state.mode = 'battlegrounds';
  hideLobbyOverlay();
  updateAppUrl('battlegrounds');
  initBattlegroundsState();
  renderBattlegrounds();
}

function selectBattlegroundsHero(heroId) {
  state.battlegrounds.selectedHeroId = heroId;
  renderBattlegrounds();
}

function enterBattlegroundsTierOneRecruit() {
  const selectedHero = state.battlegrounds.heroChoices.find((hero) => hero.id === state.battlegrounds.selectedHeroId) || null;
  state.battlegrounds.phase = 'recruit';
  state.battlegrounds.round = 1;
  state.battlegrounds.gold = 3;
  state.battlegrounds.tavernTier = 1;
  state.battlegrounds.tavernUpgradeCost = 5;
  state.battlegrounds.timerSeconds = 107;
  state.battlegrounds.playerHealth = 40;
  state.battlegrounds.playerArmor = Number(selectedHero?.armorLabel || 0) || 0;
  state.battlegrounds.reservePreview = [];
  state.battlegrounds.boardPreview = [];
  state.battlegrounds.shopSlots = 3;
  state.battlegrounds.refreshCost = 1;
  state.battlegrounds.combatPreview = null;
  state.battlegrounds.opponentHero = {
    name: 'Next Opponent',
    armor: 0,
    health: 40,
    theme: 'neutral',
    note: '首回合不展示战斗对撞，只完成一级酒馆招募。',
  };
  state.battlegrounds.shopPreview = drawBattlegroundsTavernOneShop(state.battlegrounds.shopSlots).map((card) => ({
    ...card,
    frozen: state.battlegrounds.isFrozen,
  }));
  state.battlegrounds.log = [
    `已锁定英雄：${selectedHero?.name || '未知英雄'}`,
    '一级酒馆已展开：3 金币、3 个商店随从、空战队、空手牌。',
    '当前可进行刷新、冻结、购买和上场操作。',
  ];
}

function confirmBattlegroundsHero() {
  if (!state.battlegrounds.selectedHeroId) return;
  enterBattlegroundsTierOneRecruit();
  renderBattlegrounds();
}

function refreshBattlegroundsShell() {
  if (state.battlegrounds.phase !== 'recruit') return;
  if (state.battlegrounds.gold < state.battlegrounds.refreshCost) {
    state.battlegrounds.log = [
      '金币不足，无法刷新一级酒馆。',
      `当前金币：${state.battlegrounds.gold}`,
    ];
    renderBattlegrounds();
    return;
  }
  if (state.battlegrounds.isFrozen) {
    state.battlegrounds.log = [
      '酒馆已冻结，先取消冻结再刷新。',
      '冻结状态会保留当前商店。',
    ];
    renderBattlegrounds();
    return;
  }

  state.battlegrounds.gold -= state.battlegrounds.refreshCost;
  state.battlegrounds.shopPreview = drawBattlegroundsTavernOneShop(state.battlegrounds.shopSlots).map((card) => ({
    ...card,
    frozen: false,
  }));
  state.battlegrounds.log = [
    '已刷新一级酒馆商店。',
    `剩余金币：${state.battlegrounds.gold}`,
  ];
  renderBattlegrounds();
}

function toggleBattlegroundsFreeze() {
  if (state.battlegrounds.phase !== 'recruit') return;
  state.battlegrounds.isFrozen = !state.battlegrounds.isFrozen;
  state.battlegrounds.shopPreview = state.battlegrounds.shopPreview.map((card) => ({
    ...card,
    frozen: state.battlegrounds.isFrozen,
  }));
  state.battlegrounds.log = [
    state.battlegrounds.isFrozen ? '已切换到冻结预览状态。' : '已取消冻结预览状态。',
    '正式冻结逻辑会在招募引擎接入后替换当前占位行为。',
  ];
  renderBattlegrounds();
}

function buyBattlegroundsShopCard(shopIndex) {
  if (state.battlegrounds.phase !== 'recruit') return;
  const selectedCard = state.battlegrounds.shopPreview[shopIndex];
  if (!selectedCard) return;
  if (state.battlegrounds.gold < (selectedCard.cost ?? 3)) {
    state.battlegrounds.log = [
      `${selectedCard.name} 购买失败：金币不足。`,
      `当前金币：${state.battlegrounds.gold}`,
    ];
    renderBattlegrounds();
    return;
  }
  if (state.battlegrounds.reservePreview.length >= state.battlegrounds.maxHandSlots) {
    state.battlegrounds.log = ['手牌已满，暂时无法购买新的随从。'];
    renderBattlegrounds();
    return;
  }

  const handRectsBefore = captureBattlegroundsElementRects('[data-bg-hand-id]', 'data-bg-hand-id');
  const shopPoint = captureBattlegroundsPoint(`[data-bg-shop-id="${selectedCard.instanceId}"]`);
  const purchasedCard = createBattlegroundsInstance(selectedCard, 'hand');
  state.battlegrounds.gold -= selectedCard.cost ?? 3;
  state.battlegrounds.reservePreview = [...state.battlegrounds.reservePreview, purchasedCard];
  state.battlegrounds.shopPreview = state.battlegrounds.shopPreview.map((card, index) => (
    index === shopIndex ? null : card
  ));
  state.battlegrounds.log = [
    `已购买 ${selectedCard.name}，进入手牌。`,
    `剩余金币：${state.battlegrounds.gold}`,
  ];
  renderBattlegrounds({
    reflows: [
      {
        previousRects: handRectsBefore,
        selector: '[data-bg-hand-id]',
        attributeName: 'data-bg-hand-id',
      },
    ],
    transfer: {
      fromPoint: shopPoint,
      targetSelector: `[data-bg-hand-id="${purchasedCard.instanceId}"]`,
      statSelector: `[data-bg-hand-id="${purchasedCard.instanceId}"] [data-bg-stat-kind]`,
      durationMs: 380,
    },
  });
}

function playBattlegroundsHandCard(handIndex) {
  if (state.battlegrounds.phase !== 'recruit') return;
  const selectedCard = state.battlegrounds.reservePreview[handIndex];
  if (!selectedCard) return;
  if (state.battlegrounds.boardPreview.length >= state.battlegrounds.maxBoardSlots) {
    state.battlegrounds.log = ['战队已满，无法继续上场。'];
    renderBattlegrounds();
    return;
  }

  const boardRectsBefore = captureBattlegroundsElementRects('[data-bg-board-id]', 'data-bg-board-id');
  const handRectsBefore = captureBattlegroundsElementRects('[data-bg-hand-id]', 'data-bg-hand-id');
  const handPoint = captureBattlegroundsPoint(`[data-bg-hand-id="${selectedCard.instanceId}"]`);
  const boardedCard = createBattlegroundsInstance(selectedCard, 'board');
  state.battlegrounds.boardPreview = [...state.battlegrounds.boardPreview, boardedCard];
  state.battlegrounds.reservePreview = state.battlegrounds.reservePreview.filter((_, index) => index !== handIndex);
  state.battlegrounds.log = [
    `已将 ${selectedCard.name} 上场。`,
    `当前战队随从数：${state.battlegrounds.boardPreview.length}`,
  ];
  renderBattlegrounds({
    reflows: [
      {
        previousRects: boardRectsBefore,
        selector: '[data-bg-board-id]',
        attributeName: 'data-bg-board-id',
      },
      {
        previousRects: handRectsBefore,
        selector: '[data-bg-hand-id]',
        attributeName: 'data-bg-hand-id',
      },
    ],
    transfer: {
      fromPoint: handPoint,
      targetSelector: `[data-bg-board-id="${boardedCard.instanceId}"]`,
      statSelector: `[data-bg-board-id="${boardedCard.instanceId}"] [data-bg-stat-kind]`,
      durationMs: 420,
      lift: 36,
      rotate: 3,
    },
  });
}

function resolveBattlegroundsCombat() {
  const previewIndex = state.battlegrounds.previewIndex % BATTLEGROUNDS_PREVIEW_SCENARIOS.length;
  const scenario = BATTLEGROUNDS_PREVIEW_SCENARIOS[previewIndex];
  const recruitBoard = getBattlegroundsCombatSourceBoard(state.battlegrounds.boardPreview, 'friendly');
  const enemySourceBoard = state.battlegrounds.combatPreview?.enemy?.length
    ? state.battlegrounds.combatPreview.enemy
    : scenario.combat.enemy;
  const friendlyBoard = recruitBoard;
  const enemyBoard = getBattlegroundsCombatSourceBoard(enemySourceBoard, 'enemy');
  const friendlyHero = {
    name: 'You',
    health: Number(state.battlegrounds.playerHealth) || 0,
    armor: Number(state.battlegrounds.playerArmor) || 0,
  };
  const enemyHero = {
    name: state.battlegrounds.opponentHero?.name || 'Opponent',
    health: Number(state.battlegrounds.opponentHero?.health) || 0,
    armor: Number(state.battlegrounds.opponentHero?.armor) || 0,
  };
  const steps = [];
  let attackerSide = sumBattlegroundsBoardAttack(friendlyBoard) >= sumBattlegroundsBoardAttack(enemyBoard)
    ? 'friendly'
    : 'enemy';
  let friendlyCursor = 0;
  let enemyCursor = 0;
  let safety = 0;

  while (safety < 40) {
    const attackerBoard = attackerSide === 'friendly' ? friendlyBoard : enemyBoard;
    const defenderBoard = attackerSide === 'friendly' ? enemyBoard : friendlyBoard;
    const attackerCursor = attackerSide === 'friendly' ? friendlyCursor : enemyCursor;
    const attackerIndex = findBattlegroundsNextLivingIndex(attackerBoard, attackerCursor);
    const defenderIndex = findBattlegroundsNextLivingIndex(defenderBoard, 0);
    if (attackerIndex < 0 || defenderIndex < 0) break;

    const attacker = attackerBoard[attackerIndex];
    const defender = defenderBoard[defenderIndex];
    const attack = Math.max(0, Number(attacker.attack) || 0);
    const counter = Math.max(0, Number(defender.attack) || 0);
    const attackerHealthBefore = Number(attacker.health) || 0;
    const defenderHealthBefore = Number(defender.health) || 0;

    attacker.highlighted = true;
    defender.highlighted = true;

    defender.health = Math.max(0, defenderHealthBefore - attack);
    attacker.health = Math.max(0, attackerHealthBefore - counter);
    attacker.damageTaken = Math.max(0, attacker.startingHealth - attacker.health);
    defender.damageTaken = Math.max(0, defender.startingHealth - defender.health);
    attacker.alive = attacker.health > 0;
    defender.alive = defender.health > 0;

    steps.push({
      stepIndex: safety,
      attackerSide,
      attackerIndex,
      attackerId: attacker.instanceId,
      attackerName: attacker.name,
      attackerAttack: attack,
      attackerHealthBefore,
      attackerHealthAfter: attacker.health,
      defenderSide: attackerSide === 'friendly' ? 'enemy' : 'friendly',
      defenderIndex,
      defenderId: defender.instanceId,
      defenderName: defender.name,
      defenderAttack: counter,
      defenderHealthBefore,
      defenderHealthAfter: defender.health,
      defenderDefeated: defender.health <= 0,
      attackerDefeated: attacker.health <= 0,
    });

    if (attackerSide === 'friendly') {
      friendlyCursor = attackerIndex + 1;
    } else {
      enemyCursor = attackerIndex + 1;
    }
    attackerSide = attackerSide === 'friendly' ? 'enemy' : 'friendly';
    safety += 1;
  }

  const friendlyFinalBoard = friendlyBoard.filter((minion) => minion.health > 0);
  const enemyFinalBoard = enemyBoard.filter((minion) => minion.health > 0);
  const friendlyDamageToEnemyHero = enemyFinalBoard.length === 0 ? sumBattlegroundsBoardAttack(friendlyFinalBoard) : 0;
  const enemyDamageToFriendlyHero = friendlyFinalBoard.length === 0 ? sumBattlegroundsBoardAttack(enemyFinalBoard) : 0;
  const friendlyHeroDamage = applyBattlegroundsHeroDamage(friendlyHero, enemyDamageToFriendlyHero);
  const enemyHeroDamage = applyBattlegroundsHeroDamage(enemyHero, friendlyDamageToEnemyHero);

  let winnerSide = null;
  if (friendlyHero.health <= 0 && enemyHero.health <= 0) {
    winnerSide = null;
  } else if (enemyHero.health <= 0 && friendlyHero.health > 0) {
    winnerSide = 'friendly';
  } else if (friendlyHero.health <= 0 && enemyHero.health > 0) {
    winnerSide = 'enemy';
  } else if (friendlyHero.health !== enemyHero.health) {
    winnerSide = friendlyHero.health > enemyHero.health ? 'friendly' : 'enemy';
  } else if (friendlyFinalBoard.length !== enemyFinalBoard.length) {
    winnerSide = friendlyFinalBoard.length > enemyFinalBoard.length ? 'friendly' : 'enemy';
  } else if (sumBattlegroundsBoardAttack(friendlyFinalBoard) !== sumBattlegroundsBoardAttack(enemyFinalBoard)) {
    winnerSide = sumBattlegroundsBoardAttack(friendlyFinalBoard) > sumBattlegroundsBoardAttack(enemyFinalBoard)
      ? 'friendly'
      : 'enemy';
  }

  const resultLabel = winnerSide === 'friendly'
    ? '你赢了这场战斗'
    : winnerSide === 'enemy'
      ? '你输了这场战斗'
      : '战斗打成平局';
  const resultText = [
    friendlyDamageToEnemyHero > 0
      ? `我方剩余随从对敌方英雄造成 ${friendlyDamageToEnemyHero} 点伤害。`
      : '我方没有留出足够的斩杀伤害。',
    enemyDamageToFriendlyHero > 0
      ? `敌方剩余随从对我方英雄造成 ${enemyDamageToFriendlyHero} 点伤害。`
      : '敌方没有打出额外的英雄伤害。',
    `最终血量：我方 ${friendlyHero.health} / ${state.battlegrounds.playerHealth}，${enemyHero.name} ${enemyHero.health} / ${state.battlegrounds.opponentHero?.health ?? enemyHero.health}.`,
  ].join(' ');

  const lastStep = steps[steps.length - 1] || null;

  return {
    phase: 'combat',
    previewIndex,
    starterSide: steps[0]?.attackerSide || null,
    currentStepIndex: steps.length > 0 ? steps.length - 1 : -1,
    currentAttackerSide: lastStep?.attackerSide || null,
    currentAttackerIndex: lastStep?.attackerIndex ?? null,
    highlightedMinionId: lastStep?.attackerId || null,
    currentDefenderSide: lastStep?.defenderSide || null,
    currentDefenderIndex: lastStep?.defenderIndex ?? null,
    highlightedTargetMinionId: lastStep?.defenderId || null,
    resultLabel,
    resultText,
    friendlyHero: {
      ...friendlyHero,
      damageTaken: friendlyHeroDamage.healthLoss,
    },
    enemyHero: {
      ...enemyHero,
      damageTaken: enemyHeroDamage.healthLoss,
    },
    friendlyInitialBoard: recruitBoard.map((minion) => ({ ...minion })),
    enemyInitialBoard: getBattlegroundsCombatSourceBoard(enemySourceBoard, 'enemy').map((minion) => ({ ...minion })),
    friendlyFinalBoard: friendlyFinalBoard.map((minion) => ({ ...minion })),
    enemyFinalBoard: enemyFinalBoard.map((minion) => ({ ...minion })),
    friendlyBoard: friendlyFinalBoard.map((minion) => ({ ...minion })),
    enemyBoard: enemyFinalBoard.map((minion) => ({ ...minion })),
    steps,
    winnerSide,
  };
}

function startBattlegroundsCombat() {
  if (state.battlegrounds.phase !== 'recruit') return;

  const resolvedCombat = resolveBattlegroundsCombat();
  state.battlegrounds.phase = 'combat';
  state.battlegrounds.playerHealth = resolvedCombat.friendlyHero.health;
  state.battlegrounds.playerArmor = resolvedCombat.friendlyHero.armor;
  state.battlegrounds.opponentHero = {
    ...state.battlegrounds.opponentHero,
    health: resolvedCombat.enemyHero.health,
    armor: resolvedCombat.enemyHero.armor,
  };
  state.battlegrounds.boardPreview = resolvedCombat.friendlyFinalBoard.map((minion) => ({ ...minion }));
  state.battlegrounds.combatPreview = resolvedCombat;
  state.battlegrounds.log = [
    '已进入自动战斗阶段。',
    resolvedCombat.resultText,
  ];
  renderBattlegrounds();
}

function advanceBattlegroundsPreview() {
  const nextIndex = (state.battlegrounds.previewIndex + 1) % BATTLEGROUNDS_PREVIEW_SCENARIOS.length;
  applyBattlegroundsPreviewScenario(nextIndex);
  state.battlegrounds.phase = 'recruit';
  state.battlegrounds.log = [
    `已推进到第 ${state.battlegrounds.round} 回合的「${BATTLEGROUNDS_PREVIEW_SCENARIOS[nextIndex].label}」演示。`,
    '这个按钮后续会替换成真实的回合流转与战斗结算。',
  ];
  renderBattlegrounds();
}

function renderBattlegrounds(animationPlan = null) {
  const combatPreview = state.battlegrounds.combatPreview || null;
  const isCombatPhase = state.battlegrounds.phase === 'combat';
  const phaseLabel = state.battlegrounds.phase === 'hero-select'
    ? '英雄选择'
    : isCombatPhase
      ? '战斗阶段'
      : '招募 / 战斗预演';
  renderBattlegroundsView({
    host: elements.gameArea,
    snapshot: {
      ...state.battlegrounds,
      previewLabel: BATTLEGROUNDS_PREVIEW_SCENARIOS[state.battlegrounds.previewIndex]?.label || '战棋预演',
      phaseLabel,
      timerLabel: `${state.battlegrounds.timerSeconds}s`,
      combatPhase: isCombatPhase,
      combatCurrentAttackerSide: combatPreview?.currentAttackerSide ?? null,
      combatCurrentAttackerIndex: combatPreview?.currentAttackerIndex ?? null,
      combatHighlightedMinionId: combatPreview?.highlightedMinionId ?? null,
      combatHighlightedTargetMinionId: combatPreview?.highlightedTargetMinionId ?? null,
      combatResultLabel: combatPreview?.resultLabel ?? '',
      combatResultText: combatPreview?.resultText ?? '',
      combatFriendlyBoard: combatPreview?.friendlyFinalBoard || state.battlegrounds.boardPreview,
      combatEnemyBoard: combatPreview?.enemyFinalBoard || [],
      combatSteps: combatPreview?.steps || [],
    },
    callbacks: {
      onBack: () => showLobbyOverlay(),
      onSelectHero: selectBattlegroundsHero,
      onConfirmHero: confirmBattlegroundsHero,
      onStartCombat: startBattlegroundsCombat,
      onRefreshShell: refreshBattlegroundsShell,
      onToggleFreeze: toggleBattlegroundsFreeze,
      onBuyShopCard: buyBattlegroundsShopCard,
      onPlayHandCard: playBattlegroundsHandCard,
      onAdvancePreview: advanceBattlegroundsPreview,
    },
  });
  runBattlegroundsAnimationPlan(animationPlan);

  elements.title.textContent = '炉边酒馆 · 酒馆战棋';
  elements.matchStatus.textContent = '战棋实验场';
  elements.turnStatus.textContent = `第 ${state.battlegrounds.round} 回合`;
}

function updatePvpState(gameState) {
  const mySlot = gameState.mySlot || state.pvp.mySlot;
  const myPlayer = gameState.myPlayer || (mySlot === 'player1' ? gameState.player1 : gameState.player2) || null;
  const opponentPlayer = gameState.opponentPlayer || (mySlot === 'player1' ? gameState.player2 : gameState.player1) || null;
  const previousTurn = state.pvp.turn;
  const previousActivePlayerId = state.pvp.activePlayerId;
  const previousHandCount = state.pvp.player?.hand?.length ?? 0;
  const previousAttackerId = state.pvp.selectedAttackerId;
  const previousPendingSpellId = state.pvp.pendingSpellId;

  state.pvp.mySlot = mySlot;
  state.pvp.mySocketId = myPlayer?.socketId || state.pvp.mySocketId || network.playerId;
  state.pvp.activePlayerId = gameState.activePlayerId;
  state.pvp.turn = gameState.turn;
  state.pvp.phase = gameState.phase;
  state.pvp.winnerId = gameState.winnerId;
  state.pvp.player = myPlayer;
  state.pvp.opponent = opponentPlayer;
  state.pvp.log = gameState.actionLog || [];

  state.pvp.selectedAttackerId = (state.pvp.player?.board || []).some((minion) => minion.instanceId === previousAttackerId)
    ? previousAttackerId
    : '';
  state.pvp.pendingSpellId = (state.pvp.player?.hand || []).some((card) => card.instanceId === previousPendingSpellId)
    ? previousPendingSpellId
    : '';

  if (state.pvp.activePlayerId !== state.pvp.mySocketId) {
    state.pvp.selectedAttackerId = '';
    state.pvp.pendingSpellId = '';
  }

  if (state.pvp.phase === 'ended') {
    const won = state.pvp.winnerId === state.pvp.mySocketId;
    endPvpGame(won);
  } else {
    updateAppUrl('pvp', { roomId: network.roomId });
    savePvpProgress('playing');
    renderPvp();
    if (
      previousActivePlayerId &&
      (previousTurn !== state.pvp.turn || previousActivePlayerId !== state.pvp.activePlayerId)
    ) {
      animator?.turnBanner?.(
        state.pvp.activePlayerId === state.pvp.mySocketId ? '你的回合' : '对手回合',
        { durationMs: 900 }
      );
    }
    const currentHandCount = state.pvp.player?.hand?.length ?? 0;
    if (currentHandCount > previousHandCount) {
      // 只让新抽到的卡入场，不再对整个手牌容器做位移/缩放。
      const addedCount = currentHandCount - previousHandCount;
      const handCardElements = [...elements.handCards.querySelectorAll('.game-card')];
      handCardElements.slice(-addedCount).forEach((cardEl, index) => {
        animator?.drawCard?.(cardEl, { delayMs: index * 60 });
      });
    }
  }
}

function endPvpGame(won) {
  state.pvp.phase = 'ended';
  savePvpProgress('ended');

  if (won) {
    animator?.victory?.('你获胜了！');
    elements.pvpTurnIndicator.textContent = '胜利!';
    elements.pvpTurnIndicator.className = 'pvp-turn-indicator victory';
  } else {
    animator?.defeat?.('你输了');
    elements.pvpTurnIndicator.textContent = '失败';
    elements.pvpTurnIndicator.className = 'pvp-turn-indicator defeat';
  }

  renderPvp();
}

function isMyTurn() {
  if (state.mode !== 'pvp') return false;
  return state.pvp.activePlayerId === state.pvp.mySocketId;
}

function pvpPlayCard(cardInstance) {
  if (!isMyTurn() || state.busy) return;
  if (getEffectiveCardCostPvp(cardInstance) > state.pvp.player.mana) return;

  const needsTarget = cardInstance.type === 'spell' && cardNeedsExplicitTargetPvp(cardInstance);

  if (needsTarget) {
    state.pvp.pendingSpellId = state.pvp.pendingSpellId === cardInstance.instanceId ? '' : cardInstance.instanceId;
    state.pvp.selectedAttackerId = '';
    renderPvp();
    return;
  }

  network.playCard(cardInstance.instanceId, null);
  state.pvp.pendingSpellId = '';
}

function pvpResolveSpellTarget(targetRef) {
  if (!state.pvp.pendingSpellId) return;

  const card = state.pvp.player.hand.find((entry) => entry.instanceId === state.pvp.pendingSpellId);
  if (!card) return;
  if (getEffectiveCardCostPvp(card) > state.pvp.player.mana) return;

  if (!canCardTarget(card, state.pvp.mySlot, targetRef)) return;

  network.playCard(card.instanceId, targetRef);
  state.pvp.pendingSpellId = '';
  renderPvp();
}

function pvpSelectAttacker(minionId) {
  if (!isMyTurn() || state.busy) return;
  if (state.pvp.pendingSpellId) return;

  const minion = state.pvp.player.board.find(m => m.instanceId === minionId);
  if (!minion || !minion.canAttack || minion.sleeping) return;

  state.pvp.selectedAttackerId = state.pvp.selectedAttackerId === minionId ? '' : minionId;
  renderPvp();
}

function pvpAttack(targetRef) {
  if (!isMyTurn() || state.busy) return;
  if (!state.pvp.selectedAttackerId) return;
  const attacker = state.pvp.player.board.find((minion) => minion.instanceId === state.pvp.selectedAttackerId);
  if (!attacker || !canPvpAttackTarget(attacker, state.pvp.opponent.board, targetRef)) return;

  network.attack(state.pvp.selectedAttackerId, targetRef);
  state.pvp.selectedAttackerId = '';
  renderPvp();
}

function pvpEndTurn() {
  if (!isMyTurn() || state.busy) return;
  network.endTurn();
}

// ============================================
// Solo 辅助函数
// ============================================

function getScriptForTurn(turn) {
  const scenario = getSoloScenario();
  if (scenario.testBot) {
    return {
      turn,
      action: 'sandboxCycle',
      amount: scenario.testBot.armorPerTurn,
      minion: scenario.testBot.summonMinion,
      line: '获得 5 点护甲，并召唤 1 个 2/2 随从。',
    };
  }
  // 龙战等AI场景不通过传统脚本
  if (typeof scenario.boss.turnScript === 'string') return null;
  if (!Array.isArray(scenario.boss.turnScript)) return null;
  return scenario.boss.turnScript.find((entry) => entry.turn === turn) || null;
}

function describeBossMove(turn = state.solo.turn) {
  const scenario = getSoloScenario();
  // 龙战等 AI 场景不显示虚假的下一手
  if (typeof scenario.boss.turnScript === 'string') return '';
  const script = getScriptForTurn(turn);
  if (!script) {
    return `${scenario.boss.heroPower.name}: ${scenario.boss.heroPower.text}`;
  }
  switch (script.action) {
    case 'armor': return `预计获得 ${script.amount} 点护甲`;
    case 'summon': return `预计召唤 ${script.minion?.name || '随从'}`;
    case 'damageHero': return `预计对你造成 ${script.amount} 点伤害`;
    case 'aoe': return `预计清场，对我方随从造成 ${script.amount} 点伤害`;
    case 'finalPush': return `预计发动最后冲锋，造成 ${script.amount} 点伤害`;
    case 'sandboxCycle': return `预计获得 ${script.amount} 点护甲，并召唤 1 个 ${script.minion?.attack || 2}/${script.minion?.health || 2} 随从`;
    default: return script.line || '准备下一轮攻势';
  }
}

function getSelectedAttacker() {
  return state.solo.player.board.find((minion) => minion.instanceId === state.solo.selectedAttackerId) || null;
}

function addArmor(target, amount) {
  target.armor += amount;
}

function restoreHealth(target, amount) {
  const before = target.health;
  target.health = Math.min(target.maxHealth, target.health + amount);
  return target.health - before;
}

function recordPlayerHealthChangeSolo() {
  if (state.solo.phase !== 'player') return;
  const runtime = ensureSoloRuntime('player');
  if (!runtime) return;
  runtime.healthChangesThisTurn = (runtime.healthChangesThisTurn || 0) + 1;
  runtime.healthChangesThisGame = (runtime.healthChangesThisGame || 0) + 1;
}

function dealDamage(target, amount) {
  if (amount <= 0) return 0;
  const absorbed = Math.min(target.armor, amount);
  target.armor -= absorbed;
  const healthLoss = amount - absorbed;
  const before = target.health;
  target.health -= healthLoss;
  // 追踪生命值变化（用于血肉巨人等动态费用，仅玩家回合计数）
  if (before !== target.health && target === state.solo.player) {
    recordPlayerHealthChangeSolo();
  }
  return healthLoss;
}

function ensureSoloRuntime(side = 'player') {
  const hero = state.solo[side];
  if (!hero) return null;
  hero.runtime ||= {
    selfDamageThisTurn: 0,
    selfDamageThisGame: 0,
    damageTakenThisTurn: 0,
    healthChangesThisTurn: 0,
    healthChangesThisGame: 0,
    questline: null,
    redirectSelfDamage: false,
    delayedDamage: [],
    deadFriendlyMinions: [],
  };
  hero.runtime.healthChangesThisTurn ||= 0;
  hero.runtime.healthChangesThisGame ??= hero.runtime.healthChangesThisTurn;
  return hero.runtime;
}

function getEffectiveCardCostSolo(card) {
  const baseCost = Math.max(0, Number(card?.cost) || 0);
  const modifier = card?.costModifier;
  if (!modifier) return baseCost;

  // 龙战 boss 的手牌检查
  const scenario = getSoloScenario();
  const isDW = scenario.scenarioId === 'dragon-warrior';
  const bossHand = isDW ? (state.solo.boss?.hand || []) : [];

  const runtime = ensureSoloRuntime('player');
  let progress = 0;
  if (modifier.rule === 'missingHealth') {
    progress = Math.max(0, (state.solo.player.maxHealth || 30) - state.solo.player.health);
  } else if (modifier.rule === 'selfDamageThisGame') {
    progress = runtime?.selfDamageThisGame || 0;
  } else if (modifier.rule === 'healthChangedThisTurn' || modifier.rule === 'healthChangedThisGame') {
    progress = runtime?.healthChangesThisGame || 0;
  } else if (modifier.rule === 'holdingAnotherDragon') {
    const hand = isDW && bossHand.length ? bossHand : (state.solo.player?.hand || []);
    const hasOtherDragon = hand.some(c => c.instanceId !== card.instanceId && (c.tribes || []).includes('dragon'));
    progress = hasOtherDragon ? Number(modifier.amount) || 3 : 0;
  } else if (modifier.rule === 'kindredDragon') {
    const tribes = isDW ? (state.solo.boss?.tribesPlayedLastTurn || []) : [];
    const playedDragonLastTurn = tribes.includes('dragon');
    progress = playedDragonLastTurn ? Number(modifier.amount) || 3 : 0;
  }
  return Math.max(Number(modifier.minimum) || 0, baseCost - progress * (Number(modifier.amountPer) || 1));
}

function addCardToSoloHand(cardId, options = {}) {
  const source = effectiveCardById[cardId];
  if (!source) return false;
  const inst = {
    ...cloneValue(source),
    instanceId: uid(`card-${source.id}`),
    temporary: options.temporary === true,
  };
  return addCardInstanceToHand(inst, 'player');
}

function advanceQuestlineSolo(amount) {
  const runtime = ensureSoloRuntime('player');
  const quest = runtime?.questline;
  if (!quest || quest.completed || amount <= 0) return;
  quest.progress += amount;
  while (!quest.completed && quest.progress >= quest.thresholds[quest.stage]) {
    quest.progress -= quest.thresholds[quest.stage];
    quest.stage += 1;
    if (quest.stage < quest.thresholds.length) {
      const damage = quest.rewardDamage || 0;
      if (damage > 0) {
        dealDamage(state.solo.boss, damage);
        const before = state.solo.player.health;
        state.solo.player.health = Math.min(state.solo.player.maxHealth, state.solo.player.health + (quest.rewardHeal || damage));
        if (state.solo.player.health !== before) recordPlayerHealthChangeSolo();
        pushSoloLog(`任务线第 ${quest.stage} 阶段完成：对敌方英雄造成 ${damage} 点伤害，并恢复等量生命。`);
      }
    } else {
      quest.completed = true;
      if (addCardToSoloHand(quest.finalRewardCardId)) {
        pushSoloLog('任务线完成：枯萎化身塔姆辛已加入手牌。');
      }
    }
  }
}

function applySelfDamageSolo(actorSide, amount) {
  const numericAmount = Math.max(0, Number(amount) || 0);
  if (!numericAmount) return 0;
  const runtime = ensureSoloRuntime(actorSide);
  if (actorSide === 'player' && runtime?.redirectSelfDamage && state.solo.phase === 'player') {
    dealDamage(state.solo.boss, numericAmount);
    // 伤害虽已转移，但本次自伤的计数仍要累加（治疗石、任务进度等依赖此计数）
    runtime.damageTakenThisTurn += numericAmount;
    runtime.selfDamageThisTurn += numericAmount;
    runtime.selfDamageThisGame += numericAmount;
    advanceQuestlineSolo(numericAmount);
    pushSoloLog(`枯萎化身将 ${numericAmount} 点自伤转移给了 ${state.solo.boss.heroName}。`);
    return numericAmount;
  }
  const hero = state.solo[actorSide];
  dealDamage(hero, numericAmount);
  if (runtime) {
    runtime.damageTakenThisTurn += numericAmount;
    // healthChangesThisTurn 已在 dealDamage() 中追踪，此处不再重复
    if (actorSide === 'player' && state.solo.phase === 'player') {
      runtime.selfDamageThisTurn += numericAmount;
      runtime.selfDamageThisGame += numericAmount;
      advanceQuestlineSolo(numericAmount);
    }
  }
  pushSoloLog(`${hero.heroName} 受到 ${numericAmount} 点自伤。`);
  return numericAmount;
}

function cleanBoard(board) {
  return board.filter((minion) => minion.health > 0);
}

function removeDeadMinions(side) {
  state.solo[side].board = cleanBoard(state.solo[side].board);
}

function capBoard(side, incomingMinions) {
  const board = state.solo[side].board;
  const limit = getSoloScenario().player.maxBoardSize;
  const space = Math.max(0, limit - board.length);
  return incomingMinions.slice(0, space);
}

function wakeBoard(side) {
  for (const minion of state.solo[side].board) {
    resetMinionForTurn(minion);
    minion.rushOnly = false;
  }
}

const newlyDrawnCardIds = new Set();

function drawCards(amount) {
  let drawn = 0;
  newlyDrawnCardIds.clear();
  while (drawn < amount && state.solo.player.deck.length && state.solo.player.hand.length < 10) {
    const nextCard = state.solo.player.deck.shift();
    if (addCardInstanceToHand(nextCard, 'player')) {
      newlyDrawnCardIds.add(nextCard.instanceId);
      drawn += 1;
    }
  }
  return drawn;
}

function animateCardDraws() {
  if (newlyDrawnCardIds.size === 0) return;
  const deckRect = elements.deckStack?.getBoundingClientRect();
  let stagger = 0;
  for (const cardId of newlyDrawnCardIds) {
    const cardEl = document.querySelector(`[data-card-id="${cardId}"]`);
    if (cardEl && deckRect) {
      const cardRect = cardEl.getBoundingClientRect();
      const dx = deckRect.left - cardRect.left;
      const dy = deckRect.top - cardRect.top;
      cardEl.style.setProperty('--flip-from-x', `${dx}px`);
      cardEl.style.setProperty('--flip-from-y', `${dy}px`);
      cardEl.style.animationDelay = `${stagger}ms`;
      cardEl.classList.add('anim-card-flip-in');
      cardEl.addEventListener('animationend', () => {
        cardEl.classList.remove('anim-card-flip-in');
        cardEl.style.removeProperty('--flip-from-x');
        cardEl.style.removeProperty('--flip-from-y');
        cardEl.style.animationDelay = '';
      }, { once: true });
      stagger += 60;
    }
  }
  newlyDrawnCardIds.clear();
}

function enemyPassiveBonus() {
  if (state.solo.scenarioId !== 'boss') return 0;
  return state.solo.boss.board.length === 0 ? 1 : 0;
}

function healHeroWithLifestealSolo(side, amount) {
  if (amount <= 0) return 0;
  const hero = state.solo[side];
  const before = hero.health;
  hero.health = Math.min(hero.maxHealth || 30, hero.health + amount);
  return hero.health - before;
}

function dealMinionDamageSolo(attacker, attackerSide, defender, amount) {
  if (!defender || amount <= 0) return 0;

  if (defender.divineShield) {
    defender.divineShield = false;
    return 0;
  }

  const beforeHealth = defender.health;
  const actualDamage = Math.min(amount, Math.max(defender.health, 0));
  defender.health -= amount;

  if (actualDamage > 0 && attacker && hasKeyword(attacker, 'poisonous')) {
    defender.health = 0;
  }

  if (actualDamage > 0 && attacker && hasKeyword(attacker, 'lifesteal')) {
    healHeroWithLifestealSolo(attackerSide, actualDamage);
  }

  // 激怒：受伤时触发 enrageAttackBuff (格罗玛什)
  if (actualDamage > 0 && defender.health < (defender.maxHealth || defender.health + actualDamage)) {
    for (const e of (defender.effects || [])) {
      if (e.type === 'enrageAttackBuff') {
        const buff = Number(e.amount) || 6;
        if (!defender._enraged) {
          defender._enraged = true;
          defender.attack = (defender.attack || 0) + buff;
          pushSoloLog(`${defender.name} 受伤激怒，攻击力提升至 ${defender.attack}！`);
        }
      }
    }
  }

  return actualDamage;
}

function dealHeroDamageSolo(attacker, attackerSide, hero, amount) {
  if (!hero || amount <= 0) return 0;
  dealDamage(hero, amount);
  if (attacker && hasKeyword(attacker, 'lifesteal')) {
    healHeroWithLifestealSolo(attackerSide, amount);
  }
  return amount;
}

function resolveRebornSolo(side) {
  const survivors = [];
  for (const minion of state.solo[side].board) {
    if (minion.health > 0) {
      survivors.push(minion);
      continue;
    }
    if (side === 'player' && !minion.deathRecorded) {
      minion.deathRecorded = true;
      ensureSoloRuntime('player').deadFriendlyMinions.push({ sourceId: minion.sourceId, name: minion.name });
    }
    if (!minion.deathrattleTriggered && (minion.effects || []).some((effect) => effect.trigger === 'deathrattle')) {
      minion.deathrattleTriggered = true;
      applyEffectsSolo(minion.effects, side, {
        primaryTarget: null,
        primaryTargets: {},
        chosenTarget: null,
        trigger: 'deathrattle',
        sourceCard: minion,
      });
      pushSoloLog(`${minion.name} 的亡语触发。`);
    }
    if (minion.rebornAvailable) {
      Object.assign(
        minion,
        createMinionRuntimeState(minion.keywords, {
          sleeping: true,
          attacksThisTurn: 0,
          rebornAvailable: false,
        })
      );
      minion.health = 1;
      survivors.push(minion);
      pushSoloLog(`${minion.name} 触发了复生，以 1 点生命重新站起。`);
      continue;
    }
  }
  state.solo[side].board = survivors;
}

function processSoloDeaths(...sides) {
  for (const side of sides) {
    resolveRebornSolo(side);
    removeDeadMinionsSolo(side);
  }
}

function getTauntMinionsSolo(side) {
  return state.solo[side].board.filter((minion) => minion.health > 0 && hasKeyword(minion, 'taunt'));
}

function canAttackTargetSolo(attacker, defenderSide, defenderType, defenderId = '') {
  if (!attacker || !attacker.canAttack) return false;
  if (attacker.rushOnly && defenderType === 'hero') return false;
  const tauntMinions = getTauntMinionsSolo(defenderSide);
  if (!tauntMinions.length) return true;
  if (defenderType !== 'minion') return false;
  return tauntMinions.some((minion) => minion.instanceId === defenderId);
}

function summonMinions(side, minionSpec, amount = 1) {
  const incoming = [];
  for (let count = 0; count < amount; count += 1) {
    incoming.push(cloneMinion(minionSpec, side));
  }
  const landed = capBoard(side, incoming);
  state.solo[side].board.push(...landed);
  return landed.length;
}

// ============================================
// Solo 游戏逻辑
// ============================================

function defaultHeroTargetSide(effectType, actorSide) {
  if (effectType === 'damage') return actorSide === 'player' ? 'boss' : 'player';
  return actorSide === 'player' ? 'player' : 'boss';
}

function createHeroTargetRef(side) {
  return { side, kind: 'hero' };
}

function createMinionTargetRef(side, id) {
  return { side, kind: 'minion', id };
}

function sameTargetRef(left, right) {
  return Boolean(
    left && right &&
    left.side === right.side &&
    left.kind === right.kind &&
    (left.kind !== 'minion' || left.id === right.id)
  );
}

function getTargetEntitySolo(targetRef) {
  if (!targetRef) return null;
  if (targetRef.kind === 'hero') return state.solo[targetRef.side];
  return state.solo[targetRef.side].board.find((minion) => minion.instanceId === targetRef.id) || null;
}

function describeTargetRefSolo(targetRef) {
  const entity = getTargetEntitySolo(targetRef);
  if (!entity) return '目标';
  return targetRef.kind === 'hero' ? entity.heroName : entity.name;
}

function getPendingSpellSolo() {
  return state.solo.player?.hand.find((card) => card.instanceId === state.solo.pendingSpellId) || null;
}

function clearPendingSpellSolo() {
  state.solo.pendingSpellId = '';
}

function effectNeedsExplicitTargetSolo(effect) {
  if (effect.type === 'conditional') {
    return (effect.effects || []).some((nestedEffect) => effectNeedsExplicitTargetSolo(nestedEffect));
  }
  return ['enemyMinion', 'friendlyMinion', 'playerChoice'].includes(effect.target);
}

function cardNeedsExplicitTargetSolo(card) {
  const walk = (effects) =>
    (effects || []).some((effect) => {
      if (effect.type === 'conditional') return walk(effect.effects || []);
      return effectNeedsExplicitTargetSolo(effect);
    });
  return walk(card.effects);
}

function isValidEffectTargetSolo(effect, actorSide, targetRef) {
  if (!targetRef) return false;

  // 检查 targetKinds 约束
  if (effect.targetKinds && Array.isArray(effect.targetKinds) && effect.targetKinds.length > 0) {
    if (!effect.targetKinds.includes(targetRef.kind)) {
      return false;
    }
  }

  const opponentSide = actorSide === 'player' ? 'boss' : 'player';
  if (effect.target === 'playerChoice') {
    if (effect.type === 'adjacentChainDamage') {
      return targetRef.kind === 'minion';
    }
    if (['damage', 'heal'].includes(effect.type)) {
      return targetRef.kind === 'hero' || targetRef.kind === 'minion';
    }
    if (['armor', 'draw'].includes(effect.type)) {
      return targetRef.kind === 'hero';
    }
    return false;
  }
  if (effect.target === 'enemyHero') {
    return targetRef.kind === 'hero' && targetRef.side === opponentSide;
  }
  if (effect.target === 'friendlyHero') {
    return targetRef.kind === 'hero' && targetRef.side === actorSide;
  }
  if (effect.target === 'enemyMinion') {
    return targetRef.kind === 'minion' && targetRef.side === opponentSide;
  }
  if (effect.target === 'friendlyMinion') {
    return targetRef.kind === 'minion' && targetRef.side === actorSide;
  }
  return false;
}

function canCardTargetSolo(card, actorSide, targetRef) {
  const walk = (effects) =>
    (effects || []).some((effect) => {
      if (effect.type === 'conditional') return walk(effect.effects);
      if (!effectNeedsExplicitTargetSolo(effect)) return false;
      return isValidEffectTargetSolo(effect, actorSide, targetRef);
    });
  return walk(card.effects);
}

function resolveEffectTargetSolo(effect, actorSide, context) {
  if (effect.target === 'samePrimary') {
    return (
      context.primaryTarget ||
      context.primaryTargets[effect.type] ||
      createHeroTargetRef(defaultHeroTargetSide(effect.type, actorSide))
    );
  }
  if (effect.target === 'playerChoice') {
    if (context.chosenTarget && isValidEffectTargetSolo(effect, actorSide, context.chosenTarget)) {
      return context.chosenTarget;
    }
    return createHeroTargetRef(defaultHeroTargetSide(effect.type, actorSide));
  }
  if (effect.target === 'enemyHero') {
    return createHeroTargetRef(actorSide === 'player' ? 'boss' : 'player');
  }
  if (effect.target === 'friendlyHero') {
    return createHeroTargetRef(actorSide === 'player' ? 'player' : 'boss');
  }
  if (effect.target === 'enemyMinion') {
    if (context.chosenTarget && isValidEffectTargetSolo(effect, actorSide, context.chosenTarget)) {
      return context.chosenTarget;
    }
    return null;
  }
  if (effect.target === 'friendlyMinion') {
    if (context.chosenTarget && isValidEffectTargetSolo(effect, actorSide, context.chosenTarget)) {
      return context.chosenTarget;
    }
    return null;
  }
  if (['damage', 'heal', 'armor', 'draw'].includes(effect.type)) {
    return createHeroTargetRef(defaultHeroTargetSide(effect.type, actorSide));
  }
  return null;
}

function applyEffectsSolo(effects, actorSide, context = { primaryTarget: null, primaryTargets: {}, chosenTarget: null, trigger: 'onPlay', sourceCard: null }) {
  for (const effect of effects || []) {
    if (effect.trigger && effect.trigger !== (context.trigger || 'onPlay')) continue;

    if (effect.type === 'conditional') {
      const hero = state.solo[actorSide];
      const hand = hero?.hand || [];
      const controlsMinion = (hero?.board || hero === state.solo.player ? state.solo.player.board.length : state.solo.boss.board.length) > 0;
      const controlsNoMinion = !controlsMinion;
      const holdsDragon = hand.some(c => (c.tribes || []).includes('dragon'));
      const thisId = context.sourceCard?.instanceId;
      const holdsAnotherDragon = hand.some(c => c.instanceId !== thisId && (c.tribes || []).includes('dragon'));
      const holdHighCostMinion = hand.some(c => c.type === 'minion' && getEffectiveCardCostSolo(c) >= 5);

      let condMet = false;
      if (effect.condition === 'controlsMinion' && controlsMinion) condMet = true;
      if (effect.condition === 'controlsNoMinion' && controlsNoMinion) condMet = true;
      if (effect.condition === 'holdingDragon' && holdsDragon) condMet = true;
      if (effect.condition === 'holdingAnotherDragon' && holdsAnotherDragon) condMet = true;
      if (effect.condition === 'holdingHighCostMinion' && holdHighCostMinion) condMet = true;

      if (condMet) applyEffectsSolo(effect.effects, actorSide, context);
      continue;
    }

    if (effect.type === 'questline' && actorSide === 'player') {
      const runtime = ensureSoloRuntime('player');
      runtime.questline = {
        thresholds: Array.isArray(effect.thresholds) && effect.thresholds.length ? effect.thresholds.map(Number) : [12, 12, 12],
        stage: 0,
        progress: 0,
        rewardDamage: Number(effect.rewardDamage) || 0,
        rewardHeal: Number(effect.rewardHeal) || 0,
        finalRewardCardId: effect.finalRewardCardId || 'hs-67547',
        completed: false,
      };
      pushSoloLog('任务线“恶魔之种”已开启。');
      continue;
    }

    if (effect.type === 'selfDamage') {
      applySelfDamageSolo(actorSide, effect.amount);
      continue;
    }

    if (effect.type === 'redirectSelfDamage' && actorSide === 'player') {
      ensureSoloRuntime('player').redirectSelfDamage = true;
      pushSoloLog('枯萎化身生效：你的回合中的自伤会转移给对手。');
      continue;
    }

    if (effect.type === 'delayedSelfDamage' && actorSide === 'player') {
      ensureSoloRuntime('player').delayedDamage.push({
        amount: Number(effect.amount) || 0,
        turnsRemaining: Number(effect.turns) || 0,
      });
      continue;
    }

    if (effect.type === 'shuffleCopies' && actorSide === 'player' && context.sourceCard) {
      const amount = Math.max(0, Number(effect.amount) || 0);
      for (let index = 0; index < amount; index += 1) {
        state.solo.player.deck.push({
          ...cloneValue(context.sourceCard),
          instanceId: uid(`card-${context.sourceCard.id || context.sourceCard.sourceId}`),
          temporary: false,
        });
      }
      state.solo.player.deck = shuffle(state.solo.player.deck);
      pushSoloLog(`将 ${amount} 张${context.sourceCard.name}洗入牌库。`);
      continue;
    }

    if (effect.type === 'restoreDamageThisTurn' && actorSide === 'player') {
      const runtime = ensureSoloRuntime('player');
      const before = state.solo.player.health;
      state.solo.player.health = Math.min(state.solo.player.maxHealth, state.solo.player.health + runtime.damageTakenThisTurn);
      const restored = state.solo.player.health - before;
      if (restored > 0) recordPlayerHealthChangeSolo();
      pushSoloLog(`治疗石恢复了 ${restored} 点生命值。`);
      continue;
    }

    if (effect.type === 'discoverFromDeck' && actorSide === 'player') {
      const sourceIndex = state.solo.player.deck.findIndex((card) => !effect.excludeSelf || card.id !== context.sourceCard?.id);
      if (sourceIndex >= 0 && state.solo.player.hand.length < 10) {
        const [discovered] = state.solo.player.deck.splice(sourceIndex, 1);
        addCardInstanceToHand({ ...discovered, temporary: effect.temporary === true }, 'player');
        pushSoloLog(`你从牌库中发现了 ${discovered.name}${effect.temporary ? '（临时）' : ''}。`);
      }
      continue;
    }

    if (effect.type === 'returnDeadFriendlyMinions' && actorSide === 'player') {
      const runtime = ensureSoloRuntime('player');
      const amount = Math.max(0, Number(effect.amount) || 0);
      const returned = runtime.deadFriendlyMinions.splice(Math.max(0, runtime.deadFriendlyMinions.length - amount));
      let added = 0;
      for (const dead of returned) {
        if (addCardToSoloHand(dead.sourceId)) added += 1;
      }
      pushSoloLog(`亡者复生将 ${added} 个友方随从移回手牌。`);
      continue;
    }

    if (effect.type === 'grantKeyword' && effect.target === 'otherFriendlyMinions') {
      const board = state.solo[actorSide].board;
      for (const minion of board) {
        if (context.sourceCard && minion.sourceId === context.sourceCard.id) continue;
        const hadRush = hasKeyword(minion, 'rush');
        minion.keywords = normalizeKeywords([...(minion.keywords || []), effect.keyword]);
        if (effect.keyword === 'rush' && !hadRush) {
          const wasSleeping = minion.sleeping;
          minion.sleeping = false;
          minion.canAttack = true;
          // 只有本回合刚召唤的随从（原本在沉睡）才限制不能打英雄
          if (wasSleeping) {
            minion.rushOnly = true;
          }
        }
      }
      continue;
    }

    if (effect.type === 'swapHandWithDeckBottom' && actorSide === 'player') {
      const oldHand = [...state.solo.player.hand];
      const count = oldHand.length;
      const replacement = state.solo.player.deck.splice(Math.max(0, state.solo.player.deck.length - count));
      state.solo.player.hand = replacement;
      state.solo.player.deck.push(...oldHand.map((card) => ({ ...card, temporary: false })));
      pushSoloLog(`芬利将 ${oldHand.length} 张手牌与牌库底交换。`);
      continue;
    }

    if (effect.type === 'destroyFriendlyAndRandomEnemies') {
      const friendly = state.solo[actorSide];
      const enemySide = actorSide === 'player' ? 'boss' : 'player';
      const destroyed = friendly.board.length;
      friendly.board.forEach((minion) => { minion.health = 0; });
      state.solo[enemySide].board.slice(0, destroyed).forEach((minion) => { minion.health = 0; });
      processSoloDeaths(actorSide, enemySide);
      pushSoloLog(`火焰之灾祸消灭了 ${destroyed} 个友方随从，并尝试消灭等量敌方随从。`);
      continue;
    }

    if (effect.type === 'repeatAoeWhileMinionDies') {
      const amount = Math.max(1, Number(effect.amount) || 1);
      for (let wave = 0; wave < 20; wave += 1) {
        const before = state.solo.player.board.length + state.solo.boss.board.length;
        state.solo.player.board.forEach((minion) => dealMinionDamageSolo(null, actorSide, minion, amount));
        state.solo.boss.board.forEach((minion) => dealMinionDamageSolo(null, actorSide, minion, amount));
        processSoloDeaths('player', 'boss');
        const after = state.solo.player.board.length + state.solo.boss.board.length;
        if (after >= before) break;
      }
      pushSoloLog('亵渎完成了连续伤害结算。');
      continue;
    }

    if (effect.type === 'adjacentChainDamage') {
      const targetRef = context.chosenTarget;
      if (!targetRef || targetRef.kind !== 'minion') continue;
      const board = state.solo[targetRef.side].board;
      const startIndex = board.findIndex((minion) => minion.instanceId === targetRef.id);
      if (startIndex < 0) continue;

      // 炉石规则：两边都有随从时随机选方向，玩家不能选择
      const hasLeft = startIndex > 0;
      const hasRight = startIndex < board.length - 1;
      let direction = effect.direction;
      if (!direction || direction === 'random') {
        if (hasLeft && hasRight) {
          direction = Math.random() < 0.5 ? 'left' : 'right';
        } else if (hasRight) {
          direction = 'right';
        } else if (hasLeft) {
          direction = 'left';
        } else {
          direction = 'right'; // 只有目标自己
        }
      }
      // 指定方向没有随从时自动换边（边缘目标）
      if (direction === 'right' && !hasRight && hasLeft) direction = 'left';
      if (direction === 'left' && !hasLeft && hasRight) direction = 'right';

      const dirText = direction === 'left' ? '左侧' : '右侧';
      let amount = Math.max(1, Number(effect.amount) || 1);
      if (direction === 'left') {
        for (let index = startIndex; index >= 0; index -= 1) {
          dealMinionDamageSolo(null, actorSide, board[index], amount);
          amount += Number(effect.step) || 1;
        }
      } else {
        for (let index = startIndex; index < board.length; index += 1) {
          dealMinionDamageSolo(null, actorSide, board[index], amount);
          amount += Number(effect.step) || 1;
        }
      }
      pushSoloLog(`多米诺效应沿${dirText}传播：2→${amount - Number(effect.step) || 1} 点递增伤害结算完成。`);
      processSoloDeaths(targetRef.side);
      continue;
    }

    // ── 地标效果 ──────────────────────────────────────────

    if (effect.type === 'locationPingBuff') {
      const targetRef = resolveEffectTargetSolo(effect, actorSide, context);
      const targetEntity = getTargetEntitySolo(targetRef);
      if (!targetRef || !targetEntity) continue;
      // 造成1点伤害
      dealMinionDamageSolo(null, actorSide, targetEntity, Number(effect.damage) || 1);
      // +2攻击
      targetEntity.attack = (targetEntity.attack || 0) + (Number(effect.attackBuff) || 2);
      pushSoloLog(`赤红深渊：${targetEntity.name || '随从'} 受到1点伤害，攻击力+${effect.attackBuff || 2}。`);
      processSoloDeaths(targetRef.side);
      continue;
    }

    if (effect.type === 'locationRandomDamage') {
      const opponentSide = actorSide === 'player' ? 'boss' : 'player';
      const enemyBoard = state.solo[opponentSide].board;
      const enemyHero = state.solo[opponentSide];
      const fireActive = state.solo[actorSide].playedFireSpellThisTurn;
      const dmg = fireActive ? (Number(effect.fireAmount) || 6) : (Number(effect.baseAmount) || 3);
      // 随机分配到敌方角色（英雄+随从）
      const pool = [];
      pool.push({ kind: 'hero', entity: enemyHero, label: enemyHero.heroName });
      for (const m of enemyBoard) pool.push({ kind: 'minion', entity: m, label: m.name });
      let remaining = dmg;
      while (remaining > 0 && pool.length > 0) {
        const idx = Math.floor(Math.random() * pool.length);
        const target = pool[idx];
        const hit = Math.min(remaining, target.entity.health || 99);
        if (target.kind === 'hero') {
          dealDamage(target.entity, hit);
        } else {
          dealMinionDamageSolo(null, actorSide, target.entity, hit);
        }
        remaining -= hit;
        if (target.entity.health <= 0) pool.splice(idx, 1);
      }
      pushSoloLog(`喷发火山：随机对敌方造成 ${dmg} 点伤害${fireActive ? '（火焰法术强化）' : ''}。`);
      processSoloDeaths(opponentSide);
      continue;
    }

    // ── 发现效果（三选一） ──────────────────────────────

    if (effect.type === 'discoverDragonWithDarkGift') {
      const hero = state.solo[actorSide];
      if (!hero.hand || hero.hand.length >= 10) continue;
      const pool = effectiveCards.filter(c => c.enabled !== false && (c.tribes || []).includes('dragon'));
      if (pool.length === 0) continue;
      const options = generateDiscoverOptions(pool, 3);
      const best = pickBestDiscover(options, state, actorSide);
      if (best) {
        addCardInstanceToHand(best, actorSide);
        pushSoloLog(`${hero.heroName} 从3个龙中选择了 ${best.displayName}（攻${best.attack}/血${best.health}）。`);
      }
      continue;
    }

    if (effect.type === 'discoverWarriorWithDarkGift') {
      const hero = state.solo[actorSide];
      if (!hero.hand || hero.hand.length >= 10) continue;
      const pool = effectiveCards.filter(c => c.enabled !== false && c.type === 'minion');
      if (pool.length === 0) continue;
      const options = generateDiscoverOptions(pool, 3);
      const best = pickBestDiscover(options, state, actorSide);
      if (best) {
        addCardInstanceToHand(best, actorSide);
        pushSoloLog(`${hero.heroName} 从3个战士随从中选择了 ${best.displayName}（攻${best.attack}/血${best.health}）。`);
      }
      continue;
    }

    if (effect.type === 'rewindableRandomWeapons') {
      const hero = state.solo[actorSide];
      const opponent = state.solo[actorSide === 'player' ? 'boss' : 'player'];
      // 保存完整快照
      const snap = {
        heroWeapon: hero.weapon ? { ...hero.weapon } : null,
        heroHealth: hero.health,
        heroArmor: hero.armor,
        oppWeapon: opponent.weapon ? { ...opponent.weapon } : null,
      };
      // 第一次随机
      const wpn1 = rollRandomWeapon();
      const wpn2 = rollRandomWeapon();
      const buffedWpn = {
        attack: wpn1.attack + (effect.buff?.attack || 1),
        durability: wpn1.durability + (effect.buff?.durability || 1),
      };
      // AI 决定是否回溯：评估第一次结果
      const ownValue = buffedWpn.attack * buffedWpn.durability * 0.65;
      const oppValue = wpn2.attack * wpn2.durability * 0.72;
      const oldOwnValue = (snap.heroWeapon ? snap.heroWeapon.attack * snap.heroWeapon.durability * 0.65 : 0);
      const timelineValue = ownValue - oppValue - oldOwnValue;
      // 如果第一次结果太差，回溯（重新随机）
      if (timelineValue < -1.0) {
        const newWpn1 = rollRandomWeapon();
        const newWpn2 = rollRandomWeapon();
        hero.weapon = {
          attack: newWpn1.attack + (effect.buff?.attack || 1),
          durability: newWpn1.durability + (effect.buff?.durability || 1),
        };
        opponent.weapon = { attack: newWpn2.attack, durability: newWpn2.durability };
        pushSoloLog(`现场播报员：回溯！第一次 ${wpn1.attack}/${wpn1.durability} 不理想，重新随机 → 我方 ${hero.weapon.attack}/${hero.weapon.durability}，对手 ${opponent.weapon.attack}/${opponent.weapon.durability}。`);
      } else {
        hero.weapon = buffedWpn;
        opponent.weapon = { attack: wpn2.attack, durability: wpn2.durability };
        pushSoloLog(`现场播报员：我方 ${hero.weapon.attack}/${hero.weapon.durability}，对手 ${opponent.weapon.attack}/${opponent.weapon.durability}。`);
      }
      continue;
    }

    if (effect.type === 'destroy') {
      const targetRef = resolveEffectTargetSolo(effect, actorSide, context);
      const targetEntity = getTargetEntitySolo(targetRef);
      if (!targetRef || targetRef.kind !== 'minion' || !targetEntity) continue;
      targetEntity.health = 0;
      pushSoloLog(`${describeTargetRefSolo(targetRef)} 被消灭。`);
      processSoloDeaths(targetRef.side);
      continue;
    }

    if (effect.type === 'restoreMana') {
      const hero = state.solo[actorSide];
      const runtime = ensureSoloRuntime(actorSide);
      if (effect.condition === 'heroDamagedThisTurn' && (runtime?.damageTakenThisTurn || 0) <= 0) continue;
      const before = hero.mana;
      hero.mana = Math.min(hero.maxMana, hero.mana + (Number(effect.amount) || 0));
      pushSoloLog(`${hero.heroName} 复原了 ${hero.mana - before} 个法力水晶。`);
      continue;
    }

    if (effect.type === 'setNextHeroPowerCost') {
      const runtime = ensureSoloRuntime(actorSide);
      runtime.nextHeroPowerCost = Math.max(0, Number(effect.amount) || 0);
      pushSoloLog(`${state.solo[actorSide].heroName} 的下一个英雄技能费用变为 ${runtime.nextHeroPowerCost}。`);
      continue;
    }

    // ── 龙战新效果类型 ──────────────────────────────────────

    if (effect.type === 'equipWeapon') {
      const hero = state.solo[actorSide];
      hero.weapon = { attack: Number(effect.attack) || 1, durability: Number(effect.durability) || 1 };
      pushSoloLog(`${hero.heroName} 装备了 ${hero.weapon.attack}/${hero.weapon.durability} 武器。`);
      continue;
    }

    if (effect.type === 'heroGainAttack') {
      const hero = state.solo[actorSide];
      hero.heroAttackThisTurn = (hero.heroAttackThisTurn || 0) + (Number(effect.amount) || 0);
      pushSoloLog(`${hero.heroName} 在本回合中获得 +${Number(effect.amount) || 0} 攻击力。`);
      continue;
    }

    if (effect.type === 'refreshMana') {
      const hero = state.solo[actorSide];
      const amount = Math.min(Number(effect.amount) || 0, hero.maxMana - hero.mana);
      hero.mana += amount;
      pushSoloLog(`${hero.heroName} 复原了 ${amount} 个法力水晶。`);
      continue;
    }

    if (effect.type === 'overflowDamage') {
      const targetRef = context.chosenTarget || resolveEffectTargetSolo(effect, actorSide, context);
      const targetEntity = getTargetEntitySolo(targetRef);
      if (!targetRef || !targetEntity) continue;
      // 只能对受伤随从使用
      if (targetEntity.maxHealth && targetEntity.health >= targetEntity.maxHealth) continue;
      const dmg = Number(effect.amount) || 8;
      const remaining = targetEntity.health;
      dealMinionDamageSolo(null, actorSide, targetEntity, dmg);
      pushSoloLog(`烈火炙烤对 ${targetEntity.name || describeTargetRefSolo(targetRef)} 造成 ${dmg} 点伤害。`);
      // 溢出伤害回手
      if (dmg > remaining) {
        const overflow = dmg - remaining;
        const hero = state.solo[actorSide];
        if (hero.hand && hero.hand.length < 10) {
          const searingCopy = {
            ...effectiveCardById['dw-searing-flame'],
            instanceId: uid('searing-return'),
            cost: 1,
            effects: [{ type: 'overflowDamage', target: 'playerChoice', targetKinds: ['minion'], targetCondition: 'damaged', amount: overflow }],
          };
          addCardInstanceToHand(searingCopy, actorSide);
          pushSoloLog(`烈火炙烤溢出 ${overflow} 点伤害，回手一张新牌。`);
        }
      }
      processSoloDeaths(targetRef.side);
      continue;
    }

    if (effect.type === 'addRandomCard') {
      const hero = state.solo[actorSide];
      if (!hero.hand || hero.hand.length >= 10) continue;
      // 从卡池中挑符合条件的龙
      const poolCards = (effectiveCards || []).filter(c =>
        c.enabled !== false && (c.tribes || []).includes(effect.tribe || 'dragon') &&
        (!effect.maxCost || c.cost <= effect.maxCost)
      );
      if (poolCards.length > 0) {
        const pick = poolCards[Math.floor(Math.random() * poolCards.length)];
        addCardInstanceToHand({ ...pick, instanceId: uid(`random-${pick.id}`) }, actorSide);
        pushSoloLog(`${hero.heroName} 随机获得了一张 ${pick.name}。`);
      }
      continue;
    }

    if (effect.type === 'drawMinion') {
      const hero = state.solo[actorSide];
      if (!hero.deck || !hero.hand) continue;
      for (let i = hero.deck.length - 1; i >= 0; i--) {
        if (hero.deck[i].type === 'minion') {
          const [drawn] = hero.deck.splice(i, 1);
          if (addCardInstanceToHand(drawn, actorSide))
            pushSoloLog(`${hero.heroName} 抽了一张随从牌：${drawn.name}。`);
          break;
        }
      }
      continue;
    }

    if (effect.type === 'enrageAttackBuff') {
      // 受伤时触发：格罗玛什
      const sourceCard = context.sourceCard;
      if (sourceCard && sourceCard.health < (sourceCard.maxHealth || sourceCard.health)) {
        sourceCard.attack = (sourceCard.attack || 0) + (Number(effect.amount) || 6);
        pushSoloLog(`${sourceCard.name} 受伤激怒，攻击力提升至 ${sourceCard.attack}。`);
      }
      // 持续检查：每次渲染时更新
      continue;
    }

    // 永时困苦：造成1伤，存活抽牌，死亡召唤
    if (effect.type === 'damageOrDrawOrSummon') {
      const targetRef = context.chosenTarget || resolveEffectTargetSolo(effect, actorSide, context);
      const targetEntity = getTargetEntitySolo(targetRef);
      if (!targetRef || !targetEntity) continue;
      const dmg = Number(effect.amount) || 1;
      dealMinionDamageSolo(null, actorSide, targetEntity, dmg);
      processSoloDeaths(targetRef.side);
      const hero = state.solo[actorSide];
      if (targetEntity.health > 0) {
        // 存活：抽牌
        if (hero.deck && hero.deck.length && hero.hand && hero.hand.length < 10) {
          addCardInstanceToHand(hero.deck.pop(), 'player');
          pushSoloLog(`永时困苦：目标存活，${hero.heroName} 抽了一张牌。`);
        }
      } else {
        // 死亡：随机召唤1费随从
        const oneCostMinions = (effectiveCards || []).filter(c => c.type === 'minion' && c.cost === 1 && c.enabled !== false);
        if (oneCostMinions.length > 0 && hero.board && hero.board.length < 7) {
          const pick = oneCostMinions[Math.floor(Math.random() * oneCostMinions.length)];
          hero.board.push({ ...pick, instanceId: uid(`summon-${pick.id}`), side: actorSide, sleeping: true, canAttack: false });
          pushSoloLog(`永时困苦：目标死亡，随机召唤了 ${pick.name}。`);
        }
      }
      continue;
    }

    if (effect.type === 'damage') {
      const amount = Number(effect.amount) || 0;
      // 全场随从伤害 (灼热裂隙)
      if (effect.target === 'allMinions') {
        for (const m of state.solo.player.board) dealMinionDamageSolo(null, actorSide, m, amount);
        for (const m of state.solo.boss.board) dealMinionDamageSolo(null, actorSide, m, amount);
        processSoloDeaths('player', 'boss');
        pushSoloLog(`全场随从受到了 ${amount} 点伤害。`);
        continue;
      }
      const targetRef = resolveEffectTargetSolo(effect, actorSide, context);
      const targetEntity = getTargetEntitySolo(targetRef);
      if (!targetRef || !targetEntity) continue;
      context.primaryTarget = context.primaryTarget || targetRef;
      context.primaryTargets.damage = context.primaryTargets.damage || targetRef;
      if (targetRef.kind === 'hero') {
        dealDamage(targetEntity, amount);
        pushSoloLog(
          actorSide === 'player'
            ? `法术命中 ${describeTargetRefSolo(targetRef)}，造成 ${amount} 点伤害。`
            : `${state.solo.boss.heroName} 的技能命中 ${targetRef.side === 'player' ? '你' : describeTargetRefSolo(targetRef)}，造成 ${amount} 点伤害。`
        );
        animator?.hit?.(targetHeroAreaSolo(targetRef.side));
        animator?.pulseStat?.(targetHealthPillSolo(targetRef.side));
        floatCombatTextOnTarget(targetHeroAreaSolo(targetRef.side), amount, 'damage');
      } else {
        dealMinionDamageSolo(null, actorSide, targetEntity, amount);
        pushSoloLog(`${describeTargetRefSolo(targetRef)} 受到了 ${amount} 点伤害。`);
        animator?.hit?.(getTargetAreaSolo(targetRef));
        floatCombatTextOnTarget(getTargetAreaSolo(targetRef), amount, 'damage');
        processSoloDeaths(targetRef.side);
      }
      continue;
    }

    if (effect.type === 'heal') {
      const targetRef = resolveEffectTargetSolo(effect, actorSide, context);
      const targetEntity = getTargetEntitySolo(targetRef);
      if (!targetRef || !targetEntity) continue;
      context.primaryTarget = context.primaryTarget || targetRef;
      context.primaryTargets.heal = context.primaryTargets.heal || targetRef;
      const healed = restoreHealth(targetEntity, Number(effect.amount) || 0);
      if (targetRef.side === 'player' && targetRef.kind === 'hero' && healed > 0) {
        recordPlayerHealthChangeSolo();
      }
      pushSoloLog(`${describeTargetRefSolo(targetRef)} 恢复了 ${healed} 点生命值。`);
      animator?.heal?.(getTargetAreaSolo(targetRef));
      floatCombatTextOnTarget(getTargetAreaSolo(targetRef), healed, 'heal');
      if (targetRef.kind === 'hero') {
        animator?.pulseStat?.(targetHealthPillSolo(targetRef.side));
      }
      continue;
    }

    if (effect.type === 'armor') {
      const targetRef = resolveEffectTargetSolo(effect, actorSide, context);
      if (!targetRef || targetRef.kind !== 'hero') continue;
      context.primaryTarget = context.primaryTarget || targetRef;
      context.primaryTargets.armor = context.primaryTargets.armor || targetRef;
      const amount = Number(effect.amount) || 0;
      addArmor(state.solo[targetRef.side], amount);
      pushSoloLog(`${state.solo[targetRef.side].heroName} 获得 ${amount} 点护甲。`);
      floatCombatTextOnTarget(targetArmorPillSolo(targetRef.side), amount, 'armor');
      animator?.pulseStat?.(targetArmorPillSolo(targetRef.side));
      continue;
    }

    if (effect.type === 'summon' && effect.target === 'friendlyBoard') {
      const side = actorSide === 'player' ? 'player' : 'boss';
      const amount = Number(effect.amount) || 1;
      const landed = summonMinions(side, effect.minion || { name: 'Token', attack: 1, health: 1 }, amount);
      pushSoloLog(actorSide === 'player' ? `你召唤了 ${landed} 个 ${effect.minion?.name || '随从'}。` : `${state.solo.boss.heroName} 召唤了 ${landed} 个 ${effect.minion?.name || '随从'}。`);
      continue;
    }

    if (effect.type === 'buffSelf') {
      const source = context.sourceCard;
      if (source) {
        source.attack = (source.attack || 0) + (Number(effect.attack) || 0);
        source.health = (source.health || 0) + (Number(effect.health) || 0);
        if (!source.maxHealth) source.maxHealth = source.health;
        else source.maxHealth += (Number(effect.health) || 0);
        pushSoloLog(`${source.name} 获得 +${effect.attack || 0}/+${effect.health || 0}。`);
      }
      continue;
    }

    if (effect.type === 'buff' && effect.target === 'friendlyMinions') {
      const side = actorSide === 'player' ? 'player' : 'boss';
      for (const minion of state.solo[side].board) {
        minion.attack += Number(effect.attack) || 0;
        minion.health += Number(effect.health) || 0;
        minion.maxHealth += Number(effect.health) || 0;
      }
      pushSoloLog(actorSide === 'player' ? '你的随从获得了强化。' : `${state.solo.boss.heroName} 强化了场上的随从。`);
      continue;
    }

    if (effect.type === 'draw') {
      const targetRef = resolveEffectTargetSolo(effect, actorSide, context);
      if (!targetRef || targetRef.kind !== 'hero') continue;
      context.primaryTarget = context.primaryTarget || targetRef;
      context.primaryTargets.draw = context.primaryTargets.draw || targetRef;
      if (targetRef.side === 'player' && actorSide === 'player') {
        const count = drawCardsSolo(Number(effect.amount) || 0);
        if (count) pushSoloLog(`你抽了 ${count} 张牌。`);
      }
    }
  }
}

function targetHeroAreaSolo(side) {
  return side === 'player' ? elements.playerHeroArea : elements.enemyHeroArea;
}

function targetHealthPillSolo(side) {
  return side === 'player' ? elements.playerHealth : elements.enemyHealth;
}

function targetArmorPillSolo(side) {
  return side === 'player' ? elements.playerArmor : elements.enemyArmor;
}

function getTargetAreaSolo(targetRef) {
  if (!targetRef) return null;
  if (targetRef.kind === 'hero') return targetHeroAreaSolo(targetRef.side);
  return `[data-minion-id="${targetRef.id}"]`;
}

function removeDeadMinionsSolo(side) {
  state.solo[side].board = cleanBoard(state.solo[side].board);
}

function drawCardsSolo(amount) {
  let drawn = 0;
  while (drawn < amount && state.solo.player.deck.length && state.solo.player.hand.length < 10) {
    const nextCard = state.solo.player.deck.shift();
    if (addCardInstanceToHand(nextCard, 'player')) {
      newlyDrawnCardIds.add(nextCard.instanceId);
      drawn += 1;
    }
  }
  return drawn;
}

function resolveCardSolo(cardInstance, chosenDamageTarget = null) {
  const effectiveCost = getEffectiveCardCostSolo(cardInstance);

  // ── 机制检测（卡牌离开手牌前） ──────────────────────────
  const evalResult = evaluateCardPlayState(cardInstance, 'player', state, {
    hand: state.solo.player.hand,
    currentTurn: state.solo.turn,
    currentMana: state.solo.player.mana,
    maxMana: state.solo.player.maxMana,
    phase: state.solo.phase,
    busy: state.solo.busy,
    gameOver: isSoloGameOver(),
    maxBoardSize: getSoloScenario().player?.maxBoardSize || 7,
    boardSize: state.solo.player.board.length,
    runtime: state.solo.player.runtime || { cardsPlayedThisTurn: [] },
    effectiveCost,
  });
  const triggeredMechanics = [...evalResult.activeMechanics];

  state.solo.player.mana -= effectiveCost;
  state.solo.player.hand = state.solo.player.hand.filter((card) => card.instanceId !== cardInstance.instanceId);
  clearPendingSpellSolo();

  // 机制日志
  for (const mech of triggeredMechanics) {
    if (mech === 'quickdraw') pushSoloLog(`快枪触发：${cardInstance.name}`);
    else if (mech === 'combo') pushSoloLog(`连击触发：${cardInstance.name}`);
    else if (mech === 'outcast') pushSoloLog(`流放触发：${cardInstance.name}`);
    else if (mech === 'finale') pushSoloLog(`压轴触发：${cardInstance.name}`);
    else if (mech === 'manathirst') pushSoloLog(`法力渴求触发：${cardInstance.name}`);
  }

  // ── 执行机制效果 ────────────────────────────────────────
  executeMechanicEffects(cardInstance, triggeredMechanics, chosenDamageTarget);

  // ── 记录出牌（结算完成后） ──────────────────────────────
  const rt = ensureSoloRuntime('player');
  if (rt) {
    const entry = { instanceId: cardInstance.instanceId, type: cardInstance.type, spellSchool: cardInstance.spellSchool || null, tribes: cardInstance.tribes || [], sourceId: cardInstance.id };
    rt.cardsPlayedThisTurn = [...(rt.cardsPlayedThisTurn || []), entry];
    if (cardInstance.type === 'spell') rt.spellsPlayedThisTurn = [...(rt.spellsPlayedThisTurn || []), cardInstance.instanceId];
  }
  animator?.pulseStat?.(elements.playerMana);

  if (cardInstance.type === 'minion') {
    const landed = capBoard('player', [cloneMinion(cardInstance, 'player')]);
    if (landed.length) {
      if (hasKeyword(landed[0], 'rush')) {
        landed[0].sleeping = false;
        landed[0].canAttack = true;
        landed[0].rushOnly = true;
      }
      state.solo.player.board.push(...landed);
      pushSoloLog(`你打出了 ${cardInstance.name}。`);
      applyEffectsSolo(cardInstance.effects, 'player', {
        primaryTarget: null,
        primaryTargets: {},
        chosenTarget: chosenDamageTarget,
        trigger: 'battlecry',
        sourceCard: cardInstance,
      });
    } else {
      pushSoloLog(`你的战场已满，${cardInstance.name} 无法登场。`);
    }
  } else {
    pushSoloLog(`你施放了 ${cardInstance.name}。`);
    applyEffectsSolo(cardInstance.effects, 'player', {
      primaryTarget: null,
      primaryTargets: {},
      chosenTarget: chosenDamageTarget,
      trigger: 'onPlay',
      sourceCard: cardInstance,
    });
  }

  if (!checkSoloOutcome()) {
    renderSolo();
  }
}

// ── 机制效果执行 ──────────────────────────────────────────────
function executeMechanicEffects(cardInstance, triggeredMechanics, chosenTarget) {
  if (!triggeredMechanics || triggeredMechanics.length === 0) return;
  const bonus = cardInstance.bonusMechanicEffects;
  if (!bonus) return;
  for (const mech of triggeredMechanics) {
    const effects = bonus[mech];
    if (effects && Array.isArray(effects) && effects.length > 0) {
      applyEffectsSolo(effects, 'player', {
        primaryTarget: null, primaryTargets: {}, chosenTarget: chosenTarget || null,
        trigger: 'onPlay', sourceCard: cardInstance,
      });
    }
  }
}

// ── 统一手牌进入追踪 ──────────────────────────────────────────
function addCardInstanceToHand(card, side = 'player') {
  if (!card) return false;
  const hero = state.solo[side];
  if (!hero.hand) return false;
  if (hero.hand.length >= 10) return false;
  markCardEnteredHand(card, state.solo.turn);
  hero.hand.push(card);
  return true;
}

// ── 可交易 ──────────────────────────────────────────────────

function tradeCardSolo(cardId) {
  if (state.solo.phase !== 'player' || state.solo.busy) return;
  if (state.solo.player.mana < 1) {
    pushSoloLog('法力值不足，无法交易。');
    renderSolo();
    return;
  }
  const index = state.solo.player.hand.findIndex(c => c.instanceId === cardId);
  if (index < 0) return;

  const card = state.solo.player.hand[index];

  // 播放交换动画
  const cardEl = document.querySelector(`[data-card-id="${cardId}"]`);
  if (cardEl) {
    cardEl.classList.add('anim-trade-out');
  }

  // 消耗 1 法力
  state.solo.player.mana -= 1;

  // 洗回牌库并抽一张
  state.solo.player.hand.splice(index, 1);
  state.solo.player.deck.push({ ...card, instanceId: card.instanceId, temporary: false });
  state.solo.player.deck = shuffle(state.solo.player.deck);
  drawCardsSolo(1);

  pushSoloLog(`你将 ${card.name} 洗回牌库并抽了一张牌。`);
  renderSolo();
}

function tradeCardPvp(cardId) {
  if (!state.pvp?.player) return;
  const player = state.pvp.player;
  if (player.mana < 1) return;
  const index = player.hand.findIndex(c => c.instanceId === cardId);
  if (index < 0) return;

  const card = player.hand[index];
  const cardEl = document.querySelector(`[data-card-id="${cardId}"]`);
  if (cardEl) cardEl.classList.add('anim-trade-out');

  player.mana -= 1;
  player.hand.splice(index, 1);
  player.deck.push({ ...card, instanceId: card.instanceId, temporary: false });
  // PvP 洗牌由服务端处理，这里先本地操作
  if (typeof network !== 'undefined' && network.sendAction) {
    network.sendAction({ type: 'trade_card', cardInstanceId: cardId });
  }
  renderPvp();
}

// ── 出牌 ──────────────────────────────────────────────────

function playCardSolo(cardInstance) {
  if (state.solo.phase !== 'player' || state.solo.busy) return;
  if (getEffectiveCardCostSolo(cardInstance) > state.solo.player.mana) return;
  if (cardInstance.type === 'minion' && state.solo.player.board.length >= getSoloScenario().player.maxBoardSize) return;

  // 法术和带目标战吼/亡语的随从都需要进入选目标状态
  if (cardNeedsExplicitTargetSolo(cardInstance)) {
    state.solo.pendingSpellId = state.solo.pendingSpellId === cardInstance.instanceId ? '' : cardInstance.instanceId;
    state.solo.selectedAttackerId = '';
    state.solo.pendingCardId = cardInstance.instanceId;
    renderSolo();
    return;
  }

  resolveCardSolo(cardInstance, null);
}

function resolvePendingSpellTargetSolo(targetRef) {
  const card = getPendingSpellSolo();
  if (!card) {
    clearPendingSpellSolo();
    renderSolo();
    return;
  }
  if (getEffectiveCardCostSolo(card) > state.solo.player.mana) {
    clearPendingSpellSolo();
    renderSolo();
    return;
  }
  if (!canCardTargetSolo(card, 'player', targetRef)) return;
  resolveCardSolo(card, targetRef);
}

function applyBossScriptSolo(script) {
  const scenario = getSoloScenario();
  if (script?.line) {
    pushSoloLog(`${state.solo.boss.heroName}: ${script.line}`);
    animator?.flashMessage?.(script.line, { durationMs: 900 });
  }

  if (!script) {
    applyEffectsSolo(scenario.boss.heroPower.effects, 'boss');
    return;
  }

  switch (script.action) {
    case 'armor': {
      addArmor(state.solo.boss, Number(script.amount) || 0);
      pushSoloLog(`${state.solo.boss.heroName} 叠起了 ${script.amount} 点护甲。`);
      animator?.pulseStat?.(elements.enemyArmor);
      break;
    }
    case 'summon': {
      const landed = summonMinions('boss', script.minion || { name: '寒雾侍从', attack: 1, health: 3 });
      pushSoloLog(`${state.solo.boss.heroName} 召唤了 ${landed} 个 ${script.minion?.name || '随从'}。`);
      break;
    }
    case 'damageHero':
    case 'finalPush': {
      const amount = (Number(script.amount) || 0) + enemyPassiveBonus();
      dealDamage(state.solo.player, amount);
      pushSoloLog(`${state.solo.boss.heroName} 对你造成了 ${amount} 点伤害。`);
      animator?.hit?.(elements.playerHeroArea);
      animator?.pulseStat?.(elements.playerHealth);
      break;
    }
    case 'sandboxCycle': {
      const armorAmount = Number(script.amount) || 0;
      addArmor(state.solo.boss, armorAmount);
      pushSoloLog(`${state.solo.boss.heroName} 获得了 ${armorAmount} 点护甲。`);
      animator?.pulseStat?.(elements.enemyArmor);
      const landed = summonMinions(
        'boss',
        script.minion || { name: '测试随从', attack: 2, health: 2 },
        1
      );
      pushSoloLog(
        landed
          ? `${state.solo.boss.heroName} 召唤了 ${landed} 个 ${script.minion?.name || '测试随从'}。`
          : `${state.solo.boss.heroName} 想召唤随从，但战场已经满了。`
      );
      break;
    }
    case 'aoe': {
      for (const minion of state.solo.player.board) {
        dealMinionDamageSolo(null, 'boss', minion, Number(script.amount) || 0);
      }
      processSoloDeaths('player');
      pushSoloLog(`${state.solo.boss.heroName} 的寒潮扫过了你的战场。`);
      animator?.hit?.(elements.playerBoardLane);
      break;
    }
    default: {
      applyEffectsSolo(scenario.boss.heroPower.effects, 'boss');
      break;
    }
  }
}

function pickEnemyAttackTargetSolo() {
  const tauntMinions = getTauntMinionsSolo('player');
  if (tauntMinions.length) {
    const sortedTaunts = [...tauntMinions].sort(
      (left, right) => left.health - right.health || left.attack - right.attack
    );
    return { side: 'player', type: 'minion', minionId: sortedTaunts[0].instanceId };
  }
  if (!state.solo.player.board.length) return { side: 'player', type: 'hero' };
  const sorted = [...state.solo.player.board].sort((left, right) => left.health - right.health || left.attack - right.attack);
  return { side: 'player', type: 'minion', minionId: sorted[0].instanceId };
}

function resolveMinionCombatSolo(attacker, defenderSide, defenderType, defenderId) {
  if (!attacker || !attacker.canAttack) return;
  if (!canAttackTargetSolo(attacker, defenderSide, defenderType, defenderId)) return;

  if (defenderType === 'hero') {
    const defender = state.solo[defenderSide];
    // 攻击前冲动画
    const attackerEl = document.querySelector(`[data-minion-id="${attacker.instanceId}"]`);
    const defenderEl = targetHeroAreaSolo(defenderSide);
    if (attackerEl) attackerEl.classList.add('anim-attack-lunge');
    if (defenderEl) defenderEl.classList.add('anim-attack-shake');
    dealHeroDamageSolo(attacker, attacker.side, defender, attacker.attack);
    consumeMinionAttack(attacker);
    pushSoloLog(`${attacker.name} 攻击了 ${defender.heroName}，造成 ${attacker.attack} 点伤害。`);
    animator?.hit?.(targetHeroAreaSolo(defenderSide));
    animator?.pulseStat?.(targetHealthPillSolo(defenderSide));
    floatCombatTextOnTarget(targetHeroAreaSolo(defenderSide), attacker.attack, 'damage');
    if (hasKeyword(attacker, 'lifesteal')) {
      animator?.heal?.(targetHeroAreaSolo(attacker.side));
      animator?.pulseStat?.(targetHealthPillSolo(attacker.side));
      floatCombatTextOnTarget(targetHeroAreaSolo(attacker.side), attacker.attack, 'heal');
    }
    if (attackerEl) setTimeout(() => attackerEl.classList.remove('anim-attack-lunge'), 360);
    if (defenderEl) setTimeout(() => defenderEl.classList.remove('anim-attack-shake'), 310);
    checkSoloOutcome();
    return;
  }

  const defender = state.solo[defenderSide].board.find((minion) => minion.instanceId === defenderId);
  if (!defender) return;

  dealMinionDamageSolo(attacker, attacker.side, defender, attacker.attack);
  dealMinionDamageSolo(defender, defenderSide, attacker, defender.attack);
  consumeMinionAttack(attacker);

  // 攻击前冲 + 震动
  const atkEl = document.querySelector(`[data-minion-id="${attacker.instanceId}"]`);
  const defEl = document.querySelector(`[data-minion-id="${defender.instanceId}"]`);
  if (atkEl) atkEl.classList.add('anim-attack-lunge');
  if (defEl) defEl.classList.add('anim-attack-shake');

  pushSoloLog(`${attacker.name} 与 ${defender.name} 交战。`);
  animator?.hit?.(`[data-minion-id="${attacker.instanceId}"]`);
  animator?.hit?.(`[data-minion-id="${defender.instanceId}"]`);
  floatCombatTextOnTarget(`[data-minion-id="${attacker.instanceId}"]`, defender.attack, 'damage');
  floatCombatTextOnTarget(`[data-minion-id="${defender.instanceId}"]`, attacker.attack, 'damage');
  if (hasKeyword(attacker, 'lifesteal')) {
    animator?.heal?.(targetHeroAreaSolo(attacker.side));
    animator?.pulseStat?.(targetHealthPillSolo(attacker.side));
    floatCombatTextOnTarget(targetHeroAreaSolo(attacker.side), attacker.attack, 'heal');
  }
  if (hasKeyword(defender, 'lifesteal')) {
    animator?.heal?.(targetHeroAreaSolo(defenderSide));
    animator?.pulseStat?.(targetHealthPillSolo(defenderSide));
    floatCombatTextOnTarget(targetHeroAreaSolo(defenderSide), defender.attack, 'heal');
  }
  if (atkEl) setTimeout(() => atkEl.classList.remove('anim-attack-lunge'), 360);
  if (defEl) setTimeout(() => defEl.classList.remove('anim-attack-shake'), 310);

  processSoloDeaths(attacker.side, defenderSide);
  checkSoloOutcome();
}

async function sleepSolo(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function resolveEnemyTurnSolo() {
  const turnLimit = getSoloTurnLimit();
  const temporaryCount = state.solo.player.hand.filter((card) => card.temporary).length;
  if (temporaryCount > 0) {
    state.solo.player.hand = state.solo.player.hand.filter((card) => !card.temporary);
    pushSoloLog(`回合结束，弃掉了 ${temporaryCount} 张临时牌。`);
  }
  state.solo.busy = true;
  state.solo.phase = 'enemy';
  state.solo.selectedAttackerId = '';
  renderSolo();

  animator?.turnBanner?.(`${state.solo.boss.heroName} 回合 ${state.solo.turn}`, { durationMs: 820 });

  // ── 龙战 AI 分支 ──────────────────────────────────────────
  const scenario = getSoloScenario();
  if (scenario.scenarioId === 'dragon-warrior') {
    await resolveDragonWarriorBossTurn();
  } else {
    // 原有 boss 脚本逻辑
    wakeBoard('boss');
    await sleepSolo(420);
    const script = getScriptForTurn(state.solo.turn);
    applyBossScriptSolo(script);
    renderSolo();
    if (checkSoloOutcome()) return;
    await sleepSolo(450);
    for (const minion of [...state.solo.boss.board]) {
      while (minion.canAttack && minion.health > 0) {
        const target = pickEnemyAttackTargetSolo();
        resolveMinionCombatSolo(minion, target.side, target.type, target.minionId);
        renderSolo();
        if (checkSoloOutcome()) return;
        await sleepSolo(300);
      }
    }
  }

  if (checkSoloOutcome()) return;

  if (turnLimit && state.solo.turn >= turnLimit && state.solo.boss.health > 0) {
    markSoloDefeat(`${state.solo.boss.heroName} 拖过了第 ${turnLimit} 回合，你没能完成这场测试/挑战。`);
    return;
  }

  // ── 下回合准备 ──────────────────────────────────────────
  state.solo.turn += 1;
  state.solo.player.maxMana = Math.min(10, state.solo.turn);
  state.solo.player.mana = state.solo.player.maxMana;
  state.solo.boss.maxMana = Math.min(10, state.solo.turn);
  state.solo.boss.mana = state.solo.boss.maxMana;
  if (state.solo.boss.tribesPlayedThisTurn) {
    state.solo.boss.tribesPlayedLastTurn = [...state.solo.boss.tribesPlayedThisTurn];
    state.solo.boss.tribesPlayedThisTurn = [];
  }
  state.solo.boss.heroAttackThisTurn = 0;
  state.solo.boss.heroAttackUsedThisTurn = false;
  state.solo.boss.heroPowerUsed = false;
  state.solo.boss.playedFireSpellThisTurn = false;
  state.solo.boss.spellSchoolsPlayedThisTurn = [];
  wakeBoard('player');
  state.solo.phase = 'player';
  state.solo.player.heroPowerUsed = false;
  const runtime = ensureSoloRuntime('player');
  runtime.selfDamageThisTurn = 0;
  runtime.damageTakenThisTurn = 0;
  runtime.healthChangesThisTurn = 0;
  runtime.cardsPlayedThisTurn = [];
  runtime.spellsPlayedThisTurn = [];
  runtime.minionsDiedThisTurn = [];
  for (const delayed of runtime.delayedDamage) {
    if (delayed.turnsRemaining <= 0) continue;
    applySelfDamageSolo('player', delayed.amount);
    delayed.turnsRemaining -= 1;
  }
  runtime.delayedDamage = runtime.delayedDamage.filter((entry) => entry.turnsRemaining > 0);
  if (checkSoloOutcome()) return;
  const drawn = drawCards(1);
  if (drawn) {
    pushSoloLog(`回合开始，你抽了 ${drawn} 张牌。`);
  }
  state.solo.busy = false;
  renderSolo();
  animator?.turnBanner?.(`你的回合 ${state.solo.turn}`, { durationMs: 760 });
}

// ── 黑暗之赐 / 随机武器 / 回溯 ──────────────────────────────

const DARK_GIFTS = [
  { id: 'fear', name: '醒来吧，恐惧', attackBuff: 3, keywords: ['lifesteal'] },
  { id: 'wrapped', name: '裹得严实', healthBuff: 4, keywords: ['taunt'] },
  { id: 'rested', name: '充分休息', attackBuff: 2, healthBuff: 2, keywords: ['elusive'] },
  { id: 'sleepwalker', name: '梦游者', keywords: ['charge'] },
  { id: 'harpy', name: '鹰身人之爪', keywords: ['divine_shield', 'windfury'] },
  { id: 'lingering', name: '萦绕不去的恐惧', keywords: ['reborn'] },
  { id: 'shortclaw', name: '短爪', costMod: -2, attackBuff: -2 },
  { id: 'brutal', name: '粗暴唤醒', keywords: ['battlecry_twice'] },
  { id: 'nightmare', name: '活体梦魇', description: '召唤时生成2/2复制' },
  { id: 'dream', name: '美梦', attackBuff: 4, healthBuff: 5, description: '置入牌库顶' },
];

function generateDiscoverOptions(pool, count = 3) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const options = [];
  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const card = shuffled[i];
    const gift = DARK_GIFTS[Math.floor(Math.random() * DARK_GIFTS.length)];
    const modified = {
      ...card,
      instanceId: uid(`discover-${card.id}-${i}`),
      darkGift: gift,
      displayName: `${card.name} · ${gift.name}`,
      attack: Math.max(0, (card.attack || 0) + (gift.attackBuff || 0)),
      health: Math.max(1, (card.health || 1) + (gift.healthBuff || 0)),
      cost: Math.max(0, (card.cost || 0) + (gift.costMod || 0)),
      keywords: [...(card.keywords || []), ...(gift.keywords || [])],
    };
    options.push(modified);
  }
  return options;
}

function pickBestDiscover(options, state, bossSide) {
  if (options.length === 0) return null;
  const boss = state.solo[bossSide];
  let best = options[0];
  let bestScore = -Infinity;
  for (const opt of options) {
    let s = 0;
    // 优先龙
    if ((opt.tribes || []).includes('dragon')) s += 4;
    // 优先能当回合打出的
    if (opt.cost <= boss.mana) s += 3;
    // 优先高血量（面对快攻）
    s += (opt.health || 0) * 0.5;
    // 优先强礼物
    if ((opt.keywords || []).includes('lifesteal')) s += 3;
    if ((opt.keywords || []).includes('taunt')) s += 2.5;
    if ((opt.keywords || []).includes('charge')) s += 3;
    if ((opt.keywords || []).includes('divine_shield') && (opt.keywords || []).includes('windfury')) s += 5;
    if ((opt.keywords || []).includes('reborn')) s += 2;
    if (s > bestScore) { bestScore = s; best = opt; }
  }
  return best;
}

function rollDarkGift() {
  return DARK_GIFTS[Math.floor(Math.random() * DARK_GIFTS.length)];
}

const RANDOM_WEAPONS = [
  { attack: 2, durability: 2 }, { attack: 3, durability: 2 }, { attack: 1, durability: 4 },
  { attack: 4, durability: 1 }, { attack: 2, durability: 3 },
];

function rollRandomWeapon() {
  return RANDOM_WEAPONS[Math.floor(Math.random() * RANDOM_WEAPONS.length)];
}

function takeBossSnapshot(boss) {
  return {
    health: boss.health, armor: boss.armor, mana: boss.mana,
    hand: boss.hand.map(c => ({ ...c })), board: boss.board.map(m => ({ ...m })),
    deck: [...(boss.deck || [])], weapon: boss.weapon ? { ...boss.weapon } : null,
    locations: boss.locations.map(l => ({ ...l })),
    heroPowerUsed: boss.heroPowerUsed,
  };
}

function restoreBossSnapshot(boss, snap) {
  boss.health = snap.health; boss.armor = snap.armor; boss.mana = snap.mana;
  boss.hand = snap.hand.map(c => ({ ...c }));
  boss.board = snap.board.map(m => ({ ...m }));
  boss.deck = [...snap.deck];
  boss.weapon = snap.weapon ? { ...snap.weapon } : null;
  boss.locations = snap.locations.map(l => ({ ...l }));
  boss.heroPowerUsed = snap.heroPowerUsed;
}

// ── Boss 动作执行 ──────────────────────────────────────────────
async function executeBossAction(action, boss, bossHeroPower) {
  switch (action.type) {
    case 'play': {
      const card = boss.hand.find(c => c.instanceId === action.card?.instanceId);
      if (!card) break;
      let cost = card.cost;
      if (card.costModifier) {
        const mod = card.costModifier;
        if (mod.rule === 'holdingAnotherDragon') {
          if (boss.hand.some(c => c.instanceId !== card.instanceId && (c.tribes || []).includes('dragon')))
            cost = Math.max(mod.minimum || 0, cost - (mod.amount || 0));
        } else if (mod.rule === 'kindredDragon') {
          if ((boss.tribesPlayedLastTurn || []).includes('dragon'))
            cost = Math.max(mod.minimum || 0, cost - (mod.amount || 0));
        }
      }
      if (boss.mana < cost) break;
      boss.mana -= cost;
      boss.hand = boss.hand.filter(c => c.instanceId !== card.instanceId);
      if ((card.tribes || []).includes('dragon')) boss.tribesPlayedThisTurn.push('dragon');
      if (card.spellSchool === 'fire') boss.playedFireSpellThisTurn = true;
      if (card.spellSchool) boss.spellSchoolsPlayedThisTurn.push(card.spellSchool);

      if (card.type === 'location') {
        boss.locations.push({
          instanceId: uid(`loc-${card.id}`), sourceId: card.id, name: card.name,
          durability: card.durability || 3, maxDurability: card.durability || 3,
          effects: card.effects || [], usedThisTurn: false,
        });
        pushSoloLog(`${boss.heroName} 打出了地标 ${card.name}（${card.durability || 3} 耐久）。`);
      } else if (card.type === 'minion') {
        boss.board.push({
          ...card, side: 'boss', maxHealth: card.health,
          sleeping: !(card.keywords || []).includes('charge'),
          canAttack: (card.keywords || []).includes('charge') || (card.keywords || []).includes('rush'),
          rushOnly: (card.keywords || []).includes('rush'), divineShield: false,
        });
        pushSoloLog(`${boss.heroName} 打出了 ${card.name}。`);
        applyEffectsSolo(card.effects.filter(e => e.trigger === 'battlecry' || !e.trigger), 'boss', {
          primaryTarget: null, primaryTargets: {}, chosenTarget: action.target,
          trigger: 'battlecry', sourceCard: card,
        });
      } else {
        pushSoloLog(`${boss.heroName} 施放了 ${card.name}。`);
        applyEffectsSolo(card.effects, 'boss', {
          primaryTarget: null, primaryTargets: {}, chosenTarget: action.target,
          trigger: 'onPlay', sourceCard: card,
        });
      }
      break;
    }
    case 'attack': {
      // AI 返回的 attacker 来自 clone，必须找到真实 boss 随从
      const realAttacker = boss.board.find(m => m.instanceId === action.attacker?.instanceId);
      if (!realAttacker || !realAttacker.canAttack) break;
      if (action.target === 'face') {
        const atk = realAttacker.attack;
        dealDamage(state.solo.player, atk);
        consumeMinionAttack(realAttacker);
        pushSoloLog(`${realAttacker.name} 攻击了你的英雄，造成 ${atk} 点伤害。`);
      } else {
        const realDefender = state.solo.player.board.find(m => m.instanceId === action.target?.instanceId);
        if (realDefender && realDefender.health > 0) {
          resolveMinionCombatSolo(realAttacker, 'boss', 'player', realDefender.instanceId);
        }
      }
      break;
    }
    case 'heroAttack': {
      if (boss.heroAttackUsedThisTurn) break;
      const heroAtk = Math.max(boss.heroAttackThisTurn || 0, boss.weapon?.attack || 0);
      if (heroAtk <= 0) break;
      if (action.target === 'face') {
        dealDamage(state.solo.player, heroAtk);
        boss.heroAttackUsedThisTurn = true;
        animateWeaponSwing('enemy');
        if (boss.weapon) { boss.weapon.durability--; if (boss.weapon.durability <= 0) boss.weapon = null; }
        pushSoloLog(`${boss.heroName} 用武器攻击了你的英雄，造成 ${heroAtk} 点伤害。`);
      }
      break;
    }
    case 'heroPower': {
      if (!bossHeroPower || boss.heroPowerUsed || boss.mana < (bossHeroPower.cost || 2)) break;
      boss.mana -= (bossHeroPower.cost || 2);
      boss.heroPowerUsed = true;
      pushSoloLog(`${boss.heroName} 使用了英雄技能：${bossHeroPower.name}。`);
      applyEffectsSolo(bossHeroPower.effects, 'boss', {
        primaryTarget: null, primaryTargets: {}, chosenTarget: null,
        trigger: 'onPlay', sourceCard: null,
      });
      break;
    }
    case 'location': {
      const realLoc = boss.locations.find(l => l.instanceId === action.location?.instanceId);
      if (!realLoc || realLoc.durability <= 0 || realLoc.usedThisTurn) break;
      if (realLoc.sourceId === 'dw-crimson-abyss') {
        const realTarget = boss.board.find(m => m.instanceId === action.target?.instanceId);
        if (!realTarget || realTarget.health <= 0) break;
        dealMinionDamageSolo(null, 'boss', realTarget, 1);
        realTarget.attack = (realTarget.attack || 0) + 2;
        pushSoloLog(`赤红深渊：对 ${realTarget.name} 造成1点伤害，攻击力+2。`);
        processSoloDeaths('boss');
      } else if (realLoc.sourceId === 'dw-erupting-volcano') {
        const fireActive = boss.playedFireSpellThisTurn;
        const perShot = fireActive ? 6 : 3;
        const targets = [{ kind: 'hero', entity: state.solo.player }];
        for (const m of state.solo.player.board) targets.push({ kind: 'minion', entity: m });
        let remaining = perShot;
        while (remaining > 0 && targets.length > 0) {
          const idx = Math.floor(Math.random() * targets.length);
          const t = targets[idx];
          const hit = Math.min(remaining, t.entity.health || 99);
          if (t.kind === 'hero') dealDamage(t.entity, hit);
          else dealMinionDamageSolo(null, 'boss', t.entity, hit);
          remaining -= hit;
          if (t.entity.health <= 0) targets.splice(idx, 1);
        }
        pushSoloLog(`喷发火山：随机对敌方造成 ${perShot} 点伤害${fireActive ? '（火焰强化）' : ''}。`);
        processSoloDeaths('player');
      }
      realLoc.durability--;
      realLoc.usedThisTurn = true;
      if (realLoc.durability <= 0) {
        boss.locations = boss.locations.filter(l => l.instanceId !== realLoc.instanceId);
        pushSoloLog(`${realLoc.name} 耐久耗尽，已移除。`);
      }
      break;
    }
  }
}

// ── 龙战 AI Boss 回合 ──────────────────────────────────────────
async function resolveDragonWarriorBossTurn() {
  const boss = state.solo.boss;

  // 回合开始：抽牌、加费、唤醒
  boss.maxMana = Math.min(10, state.solo.turn);
  boss.mana = boss.maxMana;
  if (boss.deck.length && boss.hand.length < 10) {
    const drawn = boss.deck.pop();
    addCardInstanceToHand(drawn, 'boss');
  }
  wakeBoard('boss');
  renderSolo();
  await sleepSolo(400);

  // 重置地标冷却
  for (const loc of boss.locations) loc.usedThisTurn = false;

  // AI 决策 — 每次请求单个动作，执行后重新评估
  const bossHeroPower = getSoloScenario().boss?.heroPower || null;
  const MAX_ACTIONS = 25;

  let prevKey = '';
  let stuckCount = 0;

  for (let step = 0; step < MAX_ACTIONS; step++) {
    if (checkSoloOutcome()) return;

    const action = decideDragonWarriorAction(state, 'player', 'boss', bossHeroPower);
    if (!action) break;

    // 输出候选
    if (action._candidates && action._candidates.length > 0) {
      pushSoloLog(`AI 候选: ${action._candidates.map(c=>`${c.action}[${c.score}]`).join(' | ')}`);
    }

    if (action.type === 'endTurn') break;

    // 斩杀序列
    if (action.type === 'lethal') {
      for (const la of (action.plan || [])) {
        if (checkSoloOutcome()) return;
        await executeBossAction(la, boss, bossHeroPower);
        renderSolo();
        await sleepSolo(200);
      }
      break;
    }

    // 防卡死：同一动作连续出现3次 → 跳过
    const actionKey = `${action.type}|${action.card?.instanceId || action.attacker?.instanceId || action.location?.instanceId || ''}|${action.target === 'face' ? 'face' : (action.target?.instanceId || '')}`;
    if (actionKey === prevKey) {
      stuckCount++;
      if (stuckCount >= 3) {
        pushSoloLog(`AI 卡死在 ${describeAction(action)}，强制结束回合。`);
        break;
      }
    } else {
      stuckCount = 0;
    }
    prevKey = actionKey;

    const manaBefore = boss.mana;
    const handBefore = boss.hand.length;
    await executeBossAction(action, boss, bossHeroPower);
    // 如果执行后状态没变，说明动作不合法（比如费用变了），跳过
    if (boss.mana === manaBefore && boss.hand.length === handBefore && action.type === 'play') {
      pushSoloLog(`跳过无效动作: ${describeAction(action)}`);
      continue;
    }

    renderSolo();
    await sleepSolo(200);
  }

  // 回合结束：鲜花商贩 buff
  const flowerVendor = boss.board.find(m => m.sourceId === 'dw-flower-vendor');
  if (flowerVendor) {
    const otherDragons = boss.board.filter(m => m.instanceId !== flowerVendor.instanceId && (m.tribes || []).includes('dragon'));
    if (otherDragons.length > 0) {
      const target = otherDragons[Math.floor(Math.random() * otherDragons.length)];
      target.attack = (target.attack || 0) + 1;
      target.health += 1;
      if (!target.maxHealth) target.maxHealth = target.health;
      else target.maxHealth += 1;
      pushSoloLog(`鲜花商贩使 ${target.name} 获得+1/+1。`);
    }
  }
}

function pushSoloLog(text) {
  state.solo.log = [...state.solo.log.slice(-17), text];
}

function checkSoloOutcome() {
  if (state.solo.boss.health <= 0) {
    markSoloVictory(`你击败了 ${state.solo.boss.heroName}。`);
    return true;
  }
  if (state.solo.player.health <= 0) {
    markSoloDefeat(`${state.solo.player.heroName} 倒下了，酒馆失守。`);
    return true;
  }
  return false;
}

function markSoloVictory(message) {
  state.solo.phase = 'won';
  state.solo.busy = false;
  state.solo.selectedAttackerId = '';
  clearPendingSpellSolo();
  pushSoloLog(message);
  animator?.victory?.(message);
  renderSolo();
}

function markSoloDefeat(message) {
  state.solo.phase = 'lost';
  state.solo.busy = false;
  state.solo.selectedAttackerId = '';
  clearPendingSpellSolo();
  pushSoloLog(message);
  animator?.defeat?.(message);
  renderSolo();
}

function isSoloGameOver() {
  return state.solo.phase === 'won' || state.solo.phase === 'lost';
}

function playerCanPlaySolo(card) {
  if (state.solo.phase !== 'player' || state.solo.busy || isSoloGameOver()) return false;
  if (getEffectiveCardCostSolo(card) > state.solo.player.mana) return false;
  if (card.type === 'minion' && state.solo.player.board.length >= getSoloScenario().player.maxBoardSize) return false;

  // 亡者复生等：如果本局没有友方随从死亡则禁用
  const hasRaiseDead = (card.effects || []).some((e) => e.type === 'returnDeadFriendlyMinions');
  if (hasRaiseDead) {
    const runtime = ensureSoloRuntime('player');
    if (!runtime || !runtime.deadFriendlyMinions || runtime.deadFriendlyMinions.length === 0) {
      return false;
    }
  }

  // 指向性法术：场上没有随从时禁止释放（只限「仅能指向随从」的牌）
  if (cardOnlyTargetsMinionsSolo(card)) {
    const totalMinions = state.solo.player.board.length + state.solo.boss.board.length;
    if (totalMinions === 0) return false;
  }

  return true;
}

function cardOnlyTargetsMinionsSolo(card) {
  const walk = (effects) =>
    (effects || []).every((effect) => {
      if (effect.type === 'conditional') return walk(effect.effects || []);
      // 不需要显式目标的类型 — 不影响禁用逻辑
      if (!effectNeedsExplicitTargetSolo(effect)) return true;
      // 有 targetKinds 且只包含 minion → 只能指随从
      if (effect.targetKinds && Array.isArray(effect.targetKinds) && effect.targetKinds.length > 0) {
        return effect.targetKinds.every((k) => k === 'minion');
      }
      // 明确指向随从的目标类型
      if (effect.target === 'enemyMinion' || effect.target === 'friendlyMinion') return true;
      // playerChoice 但没有 targetKinds → 可以指向英雄或随从 → 不禁用
      if (effect.target === 'playerChoice' && (!effect.targetKinds || effect.targetKinds.length === 0)) {
        return false;
      }
      return true;
    });
  // 至少有一个 effect 需要显式目标才算指向性牌
  const needsTarget = (card.effects || []).some((e) => {
    if (e.type === 'conditional') return (e.effects || []).some((ne) => effectNeedsExplicitTargetSolo(ne));
    return effectNeedsExplicitTargetSolo(e);
  });
  if (!needsTarget) return false;
  return walk(card.effects);
}

// ── 英雄技能 ──────────────────────────────────────────────────

function getHeroPowerCostSolo() {
  const runtime = ensureSoloRuntime('player');
  if (runtime?.nextHeroPowerCost !== undefined && runtime.nextHeroPowerCost !== null) {
    return Math.max(0, Number(runtime.nextHeroPowerCost));
  }
  const scenario = getSoloScenario();
  return Math.max(0, Number(scenario.player?.heroPower?.cost) || 2);
}

function usePlayerHeroPowerSolo() {
  if (state.mode !== 'solo') return;
  if (state.solo.phase !== 'player' || state.solo.busy) return;
  if (state.solo.player.heroPowerUsed) return;

  const scenario = getSoloScenario();
  const power = scenario.player?.heroPower;
  if (!power) return;

  const cost = getHeroPowerCostSolo();
  if (state.solo.player.mana < cost) return;

  state.solo.player.mana -= cost;
  state.solo.player.heroPowerUsed = true;

  // 消耗巡游向导给予的减费效果
  const runtime = ensureSoloRuntime('player');
  if (runtime?.nextHeroPowerCost !== undefined) {
    runtime.nextHeroPowerCost = undefined;
  }

  animator?.pulseStat?.(elements.playerMana);
  pushSoloLog(`你使用了英雄技能：${power.name}。`);

  // 翻转动画
  const btn = document.getElementById('hero-power-btn');
  if (btn) btn.classList.add('is-used');

  applyEffectsSolo(power.effects, 'player', {
    primaryTarget: null,
    primaryTargets: {},
    chosenTarget: null,
    trigger: 'onPlay',
    sourceCard: null,
  });

  if (!checkSoloOutcome()) {
    renderSolo();
  }
}

function renderHeroPowerSolo() {
  const btn = document.getElementById('hero-power-btn');
  if (!btn) return;
  const scenario = getSoloScenario();
  const power = scenario.player?.heroPower;
  if (!power) {
    btn.style.display = 'none';
    return;
  }

  btn.style.display = '';
  const cost = getHeroPowerCostSolo();
  const baseCost = Number(power.cost) || 2;
  const canUse =
    state.solo.phase === 'player' &&
    !state.solo.busy &&
    !state.solo.player.heroPowerUsed &&
    state.solo.player.mana >= cost &&
    !isSoloGameOver();

  const costEl = btn.querySelector('.hero-power-btn__cost');
  if (costEl) {
    costEl.textContent = cost;
    // 费用为 0 时高亮显示
    costEl.classList.toggle('is-discounted', cost === 0 && cost < baseCost);
  }

  btn.disabled = !canUse;
  btn.classList.toggle('is-locked', !canUse && !state.solo.player.heroPowerUsed);

  if (!state.solo.player.heroPowerUsed) {
    btn.classList.remove('is-used');
  }
  btn.setAttribute('aria-label', `${power.name} — ${power.text}`);
}

// ── 武器渲染 ──────────────────────────────────────────────

const _prevPlayerWeapon = { key: '' };
const _prevEnemyWeapon = { key: '' };

function renderWeaponSlotsSolo() {
  const playerWpn = state.solo.player?.weapon;
  const enemyWpn = state.solo.boss?.weapon;

  // 玩家武器
  updateWeaponSlot(elements.playerWeapon, elements.playerWeaponAtk, elements.playerWeaponDur,
    playerWpn, _prevPlayerWeapon, 'player');
  // 敌方武器
  updateWeaponSlot(elements.enemyWeapon, elements.enemyWeaponAtk, elements.enemyWeaponDur,
    enemyWpn, _prevEnemyWeapon, 'enemy');
}

function updateWeaponSlot(slotEl, atkEl, durEl, weapon, prev, side) {
  if (!slotEl) return;
  const key = weapon ? `${weapon.attack}/${weapon.durability}` : '';

  if (key && key !== prev.key) {
    // 新装备或武器变化 → 装备动画
    slotEl.style.display = '';
    slotEl.dataset.side = side;
    atkEl.textContent = weapon.attack;
    durEl.textContent = weapon.durability;
    slotEl.classList.remove('anim-weapon-swing', 'anim-weapon-break');
    slotEl.classList.add('anim-weapon-equip');
    slotEl.addEventListener('animationend', () => slotEl.classList.remove('anim-weapon-equip'), { once: true });
  } else if (key && key === prev.key) {
    // 武器未变，更新耐久显示
    atkEl.textContent = weapon.attack;
    durEl.textContent = weapon.durability;
  } else if (!key && prev.key) {
    // 武器消失 → 破碎动画
    slotEl.classList.remove('anim-weapon-equip', 'anim-weapon-swing');
    slotEl.classList.add('anim-weapon-break');
    slotEl.addEventListener('animationend', () => {
      slotEl.classList.remove('anim-weapon-break');
      slotEl.style.display = 'none';
    }, { once: true });
  } else {
    slotEl.style.display = 'none';
  }

  prev.key = key;
}

// 触发攻击挥砍动画 (由 heroAttack 调用)
function animateWeaponSwing(side) {
  const slot = side === 'player' ? elements.playerWeapon : elements.enemyWeapon;
  if (!slot || slot.style.display === 'none') return;
  slot.classList.remove('anim-weapon-equip', 'anim-weapon-break');
  slot.classList.add('anim-weapon-swing');
  slot.addEventListener('animationend', () => slot.classList.remove('anim-weapon-swing'), { once: true });
}

// ── 敌方手牌/牌库计数（龙战等 boss 专用） ──────────────────

function renderEnemyHandSolo() {
  const row = document.getElementById('enemy-stats-row');
  if (!row) return;

  const scenario = getSoloScenario();
  const isDW = scenario.scenarioId === 'dragon-warrior';
  const boss = state.solo.boss;
  const hasHand = isDW && boss.hand !== undefined;

  row.style.display = hasHand ? '' : 'none';
  if (!hasHand) return;

  const handCount = (boss.hand || []).length;
  const deckCount = (boss.deck || []).length;

  if (elements.enemyHandCountHint) elements.enemyHandCountHint.textContent = handCount;
  if (elements.enemyDeckCount) elements.enemyDeckCount.textContent = deckCount;
  if (elements.enemyDeckStack) {
    elements.enemyDeckStack.classList.toggle('is-empty', deckCount === 0);
    elements.enemyDeckStack.style.display = '';
  }
}

// ============================================
// PvP 辅助函数（复用Solo的逻辑）
// ============================================

function getEffectiveCardCostPvp(card) {
  const baseCost = Math.max(0, Number(card?.cost) || 0);
  const modifier = card?.costModifier;
  if (!modifier) return baseCost;
  const player = state.pvp.player || {};
  const runtime = player.runtime || {};
  let progress = 0;
  if (modifier.rule === 'missingHealth') progress = Math.max(0, 30 - (player.health || 0));
  if (modifier.rule === 'selfDamageThisGame') progress = runtime.selfDamageThisGame || 0;
  if (modifier.rule === 'healthChangedThisTurn' || modifier.rule === 'healthChangedThisGame') {
    progress = runtime.healthChangesThisGame ?? runtime.healthChangesThisTurn ?? 0;
  }
  return Math.max(Number(modifier.minimum) || 0, baseCost - progress * (Number(modifier.amountPer) || 1));
}

function effectNeedsExplicitTargetPvP(effect) {
  if (effect.type === 'conditional') {
    return (effect.effects || []).some((nestedEffect) => effectNeedsExplicitTargetPvP(nestedEffect));
  }
  return ['enemyMinion', 'friendlyMinion', 'playerChoice'].includes(effect.target);
}

function cardNeedsExplicitTargetPvp(card) {
  const walk = (effects) =>
    (effects || []).some((effect) => {
      if (effect.type === 'conditional') return walk(effect.effects);
      return effectNeedsExplicitTargetPvP(effect);
    });
  return walk(card.effects);
}

function getOpponentSlotPvP(actorSide) {
  return actorSide === 'player1' ? 'player2' : 'player1';
}

function getPvpPendingSpell() {
  return state.pvp.player?.hand.find((card) => card.instanceId === state.pvp.pendingSpellId) || null;
}

function getVisibleDeckCount(player) {
  if (Number.isFinite(player?.deckCount)) return player.deckCount;
  if (Array.isArray(player?.deck)) return player.deck.length;
  return 0;
}

function getTauntMinionsFromBoard(board) {
  return (board || []).filter((minion) => minion.health > 0 && hasKeyword(minion, 'taunt'));
}

function canPvpAttackTarget(attacker, opponentBoard, targetRef) {
  if (!attacker || !targetRef) return false;
  const tauntMinions = getTauntMinionsFromBoard(opponentBoard);
  if (!tauntMinions.length) return true;
  if (targetRef.kind !== 'minion') return false;
  return tauntMinions.some((minion) => minion.instanceId === (targetRef.minionId || targetRef.id));
}

function clearOpeningAnnouncement() {
  document.querySelector('.opening-announcement')?.remove();
}

function showOpeningAnnouncement(isFirst) {
  clearOpeningAnnouncement();

  const announcement = document.createElement('div');
  announcement.className = 'opening-announcement';
  announcement.innerHTML = `
    <div class="opening-announcement__card ${isFirst ? 'is-first' : 'is-second'}">
      <p class="opening-announcement__eyebrow">对战开始</p>
      <h2 class="opening-announcement__title">${isFirst ? '你是先手' : '你是后手'}</h2>
      <p class="opening-announcement__body">
        ${isFirst ? '你先行动，开局手牌 4 张。' : '对手先行动，你开局手牌 4 张，等到你的第一个回合会抽到第 5 张。'}
      </p>
    </div>
  `;

  document.body.appendChild(announcement);
  requestAnimationFrame(() => {
    announcement.classList.add('is-visible');
  });

  window.setTimeout(() => {
    announcement.classList.remove('is-visible');
    window.setTimeout(() => announcement.remove(), 420);
  }, 2200);
}

function isValidSpellTargetPvP(effect, actorSide, targetRef) {
  if (!targetRef) return false;
  const opponentSide = getOpponentSlotPvP(actorSide);

  if (effect.target === 'playerChoice') {
    if (['damage', 'heal'].includes(effect.type)) {
      return targetRef.kind === 'hero' || targetRef.kind === 'minion';
    }
    if (['armor', 'draw'].includes(effect.type)) {
      return targetRef.kind === 'hero';
    }
    return false;
  }
  if (effect.target === 'enemyHero') return targetRef.kind === 'hero' && targetRef.side === opponentSide;
  if (effect.target === 'friendlyHero') return targetRef.kind === 'hero' && targetRef.side === actorSide;
  if (effect.target === 'enemyMinion') return targetRef.kind === 'minion' && targetRef.side === opponentSide;
  if (effect.target === 'friendlyMinion') return targetRef.kind === 'minion' && targetRef.side === actorSide;
  return false;
}

function canCardTarget(card, actorSide, targetRef) {
  const walk = (effects) =>
    (effects || []).some((effect) => {
      if (effect.type === 'conditional') return walk(effect.effects);
      if (!effectNeedsExplicitTargetPvP(effect)) return false;
      return isValidSpellTargetPvP(effect, actorSide, targetRef);
    });
  return walk(card.effects);
}

function createHeroTargetRefPvP(side) {
  return { side, kind: 'hero' };
}

function createMinionTargetRefPvP(side, id) {
  return { side, kind: 'minion', id, minionId: id };
}

// ============================================
// 法力水晶 & 浮动数字渲染
// ============================================

function renderManaCrystals(container, current, max, tempCount = 0) {
  if (!container) return;
  let html = '';
  for (let i = 0; i < max; i++) {
    let cls = 'mana-crystal';
    if (i < current) cls += ' is-filled';
    else if (i < current + tempCount) cls += ' is-temp';
    else if (i >= max - (max - current - tempCount)) cls += ' is-spent';
    html += `<span class="${cls}"></span>`;
  }
  container.innerHTML = html;
}

function renderArmorPill(element, value) {
  if (!element) return;
  const armor = Math.max(0, Number(value) || 0);
  element.textContent = armor;
  element.hidden = armor === 0;
}

function floatCombatText(x, y, value, type = 'damage') {
  const layer = elements.combatTextLayer;
  if (!layer) return;
  const el = document.createElement('span');
  el.className = `combat-text combat-text--${type}`;
  el.textContent = type === 'heal' ? `+${value}` : type === 'armor' ? `+${value}` : `-${value}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  layer.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function floatCombatTextOnTarget(targetEl, value, type = 'damage') {
  if (!targetEl) return;
  // 支持传入 CSS 选择器字符串
  const el = typeof targetEl === 'string' ? document.querySelector(targetEl) : targetEl;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (!rect) return;
  const x = rect.left + rect.width / 2 - 18 + (Math.random() - 0.5) * 20;
  const y = rect.top - 4;
  floatCombatText(x, y, value, type);
}

function updateDeckDisplay(count) {
  if (elements.deckStack) {
    elements.deckStack.classList.toggle('is-empty', count <= 0);
  }
  if (elements.deckCount) {
    elements.deckCount.textContent = count > 0 ? count : '疲劳';
  }
}

// ============================================
// 渲染函数
// ============================================

function renderSolo() {
  if (state.mode !== 'solo') return;
  const scenario = getSoloScenario();
  elements.pvpTurnIndicator.style.display = 'none';

  elements.title.textContent = `${scenario.title} · ${scenario.subtitle}`;
  elements.lede.textContent = `${scenario.description} 同一局域网中的电脑、手机、平板都可以直接打开这个页面试玩。`;

  renderStatusSolo();
  renderHeroPanelsSolo();
  renderHeroPowerSolo();
  renderWeaponSlotsSolo();
  renderEnemyHandSolo();
  renderBoardSolo();
  renderHandSolo();
  animateCardDraws();
  renderLogSolo();
  renderButtonsSolo();
  renderTipsSolo();
  saveSoloProgress();
}

function renderStatusSolo() {
  const scenario = getSoloScenario();
  const turnLimit = getSoloTurnLimit();
  if (state.solo.phase === 'won') {
    elements.matchStatus.textContent = '胜利';
    elements.turnStatus.textContent = `第 ${state.solo.turn} 回合结束`;
    return;
  }

  if (state.solo.phase === 'lost') {
    elements.matchStatus.textContent = '失败';
    elements.turnStatus.textContent = turnLimit
      ? `对手顶住了第 ${Math.min(state.solo.turn, turnLimit)} 回合`
      : `第 ${state.solo.turn} 回合结束`;
    return;
  }

  elements.matchStatus.textContent = state.solo.busy
    ? `${state.solo.boss.heroName} 行动中`
    : scenario.modeLabel;

  if (getPendingSpellSolo()) {
    elements.turnStatus.textContent = `第 ${state.solo.turn} 回合 · 选择法术目标`;
  } else if (getSelectedAttacker()) {
    elements.turnStatus.textContent = `第 ${state.solo.turn} 回合 · 选择攻击目标`;
  } else {
    elements.turnStatus.textContent = state.solo.phase === 'player'
      ? `第 ${state.solo.turn} 回合 · 你的回合`
      : `第 ${state.solo.turn} 回合 · ${state.solo.boss.heroName} 回合`;
  }
}

function renderHeroPanelsSolo() {
  const nextMove = describeBossMove();
  const selectedAttacker = getSelectedAttacker();
  const pendingSpell = getPendingSpellSolo();
  const enemyHeroCanBeAttacked = Boolean(selectedAttacker && canAttackTargetSolo(selectedAttacker, 'boss', 'hero'));

  elements.enemyHeroName.textContent = state.solo.boss.heroName;
  elements.enemyHeroNote.textContent = state.solo.phase === 'won'
    ? `${state.solo.boss.heroName} 已被击败。`
    : state.solo.phase === 'lost'
      ? `${state.solo.boss.heroName} 守住了这张桌子。`
      : nextMove ? `下一手：${nextMove}` : state.solo.boss.heroName;
  elements.enemyHealth.textContent = Math.max(0, state.solo.boss.health);
  renderArmorPill(elements.enemyArmor, state.solo.boss.armor);
  renderManaCrystals(elements.enemyManaCrystals, state.solo.boss.mana, state.solo.boss.maxMana);

  elements.playerHeroName.textContent = state.solo.player.heroName;
  const runtime = ensureSoloRuntime('player');
  const quest = runtime.questline;
  const questLabel = quest
    ? quest.completed
      ? ' · 任务线已完成'
      : ` · 任务线 ${quest.stage + 1}/${quest.thresholds.length}：${quest.progress}/${quest.thresholds[quest.stage]}`
    : '';
  elements.playerHeroNote.textContent = `牌库 ${state.solo.player.deck.length} 张 · 手牌 ${state.solo.player.hand.length} 张 · 本局自伤 ${runtime.selfDamageThisGame}${questLabel}`;
  elements.playerHealth.textContent = Math.max(0, state.solo.player.health);
  renderArmorPill(elements.playerArmor, state.solo.player.armor);
  renderManaCrystals(elements.playerManaCrystals, state.solo.player.mana, state.solo.player.maxMana);
  updateDeckDisplay(state.solo.player.deck.length);

  elements.enemyHeroArea.classList.toggle('is-targetable', enemyHeroCanBeAttacked);
  elements.enemyHeroArea.classList.toggle('is-spell-targetable', pendingSpell && canCardTargetSolo(pendingSpell, 'player', createHeroTargetRef('boss')));
  elements.playerHeroArea.classList.toggle('is-targetable', false);
  elements.playerHeroArea.classList.toggle('is-spell-targetable', pendingSpell && canCardTargetSolo(pendingSpell, 'player', createHeroTargetRef('player')));
}

function renderBoardSolo() {
  const selected = Boolean(getSelectedAttacker());
  const pendingSpell = getPendingSpellSolo();
  const attacker = getSelectedAttacker();

  elements.playerBoardLane.innerHTML = `
    <div class="lane-label">玩家随从区</div>
    ${state.solo.player.board.map((minion) => {
      const targetRef = createMinionTargetRef('player', minion.instanceId);
      const spellTargetable = pendingSpell ? canCardTargetSolo(pendingSpell, 'player', targetRef) : false;
      const canAttack = minion.canAttack && state.solo.phase === 'player' && !state.solo.busy;
      const selected = state.solo.selectedAttackerId === minion.instanceId;
      return createMinionMarkupSolo(minion, 'player', canAttack, selected, spellTargetable, false);
    }).join('')}
  `;

  elements.enemyBoardLane.innerHTML = `
    <div class="lane-label">敌方随从区</div>
    ${state.solo.boss.board.map((minion) => {
      const targetRef = createMinionTargetRef('boss', minion.instanceId);
      const spellTargetable = pendingSpell ? canCardTargetSolo(pendingSpell, 'player', targetRef) : false;
      const attackTargetable = Boolean(attacker && canAttackTargetSolo(attacker, 'boss', 'minion', minion.instanceId));
      return createMinionMarkupSolo(minion, 'boss', false, false, spellTargetable, attackTargetable);
    }).join('')}
  `;
}

function createMinionMarkupSolo(minion, ownerSide, canAttack, selected, spellTargetable, attackTargetable = false) {
  const textValue = minion.text || buildKeywordText(minion.keywords);
  const text = textValue ? `<span class="board-minion__text">${textValue}</span>` : '';
  const isEnemy = ownerSide === 'boss';
  const keywords = keywordBadgesMarkup(minion);
  const interactive = canAttack || spellTargetable || attackTargetable;

  return `
    <button
      type="button"
      class="board-minion ${isEnemy ? 'board-minion--enemy' : ''} ${canAttack ? 'is-ready' : ''} ${attackTargetable ? 'is-targetable' : ''} ${selected ? 'is-selected' : ''} ${spellTargetable ? 'is-spell-targetable' : ''}"
      data-minion-id="${minion.instanceId}"
      ${interactive ? '' : 'disabled'}
    >
      <span class="board-minion__name">${minion.name}</span>
      ${keywords}
      ${text}
      <span class="board-minion__stats">
        <strong>${minion.attack}</strong>
        <strong>${Math.max(0, minion.health)}</strong>
      </span>
    </button>
  `;
}

function isCardTradeable(card) {
  return (card.mechanics || []).includes('tradeable');
}

function buildHandCardHTML(card) {
  const effectiveCost = getEffectiveCardCostSolo(card);
  const evalResult = evaluateCardPlayState(card, 'player', state, {
    hand: state.solo.player?.hand || [],
    currentTurn: state.solo.turn,
    currentMana: state.solo.player?.mana || 0,
    maxMana: state.solo.player?.maxMana || 0,
    phase: state.solo.phase,
    busy: state.solo.busy,
    gameOver: isSoloGameOver(),
    maxBoardSize: getSoloScenario().player?.maxBoardSize || 7,
    boardSize: (state.solo.player?.board || []).length,
    runtime: state.solo.player?.runtime || { cardsPlayedThisTurn: [] },
    needsTarget: cardNeedsExplicitTargetSolo(card),
    availableTargets: state.solo.player.board.length + state.solo.boss.board.length,
    requiresDeadFriendlyMinion: (card.effects || []).some(e => e.type === 'returnDeadFriendlyMinions'),
    hasDeadFriendlyMinion: (state.solo.player?.runtime?.deadFriendlyMinions || []).length > 0,
    minionOnlyTarget: cardOnlyTargetsMinionsSolo(card),
    totalBoardMinions: state.solo.player.board.length + state.solo.boss.board.length,
    effectiveCost,
  });
  const playable = evalResult.playable;
  const visualState = evalResult.visualState;
  const pending = state.solo.pendingSpellId === card.instanceId;
  const textValue = resolveCardText(card);
  const effectText = textValue ? `<span class="game-card__text">${textValue}</span>` : '';
  const details = card.type === 'minion'
    ? `${card.attack}/${card.health} 随从${summarizeKeywords(card.keywords) ? ` · ${summarizeKeywords(card.keywords)}` : ''}`
    : card.effects.map((effect) => {
        if (effect.type === 'damage') return `伤害 ${effect.amount}`;
        if (effect.type === 'heal') return `治疗 ${effect.amount}`;
        if (effect.type === 'armor') return `护甲 ${effect.amount}`;
        if (effect.type === 'draw') return `抽牌 ${effect.amount}`;
        if (effect.type === 'buff') return `增益 +${effect.attack}/+${effect.health}`;
        if (effect.type === 'summon') return `召唤 x${effect.amount}`;
        return effect.type;
      }).join(' · ');

  const tradeableBtn = isCardTradeable(card)
    ? `<button type="button" class="game-card__trade" data-trade-id="${card.instanceId}" title="可交易 — 消耗1点法力值，洗回牌库并抽一张牌">↻</button>`
    : '';

  return `
    <button
      type="button"
      class="game-card ${playable ? visualState : 'is-locked'} ${pending ? 'is-selected' : ''}"
      data-card-id="${card.instanceId}"
      ${playable ? '' : 'disabled'}
    >
      ${tradeableBtn}
      <span class="game-card__cost">${effectiveCost}</span>
      <span class="game-card__name">${card.name}</span>
      <span class="game-card__type">${card.type === 'minion' ? '随从' : '法术'}</span>
      ${effectText}
      <span class="game-card__details">${details}</span>
    </button>
  `;
}

// 手牌增量渲染 — 只追加新卡、移除已出卡、原地更新状态
const _handDomIds = new Set();
const _exitingCards = new WeakSet();

function renderHandSolo() {
  const container = elements.handCards;
  const handIds = new Set(state.solo.player.hand.map(c => c.instanceId));

  // 1. 处理不在手牌中的卡 — 播放退出动画后延迟移除
  for (const el of [...container.children]) {
    const id = el.dataset?.cardId;
    if (id && !handIds.has(id) && !_exitingCards.has(el)) {
      // 本局手牌架只允许因更高的新卡扩展，不会因打出一张长文字卡而回缩。
      // 这样下方按钮区也不会在出牌完成时向上跳动。
      const currentTrackHeight = container.getBoundingClientRect().height;
      const lockedTrackHeight = Number.parseFloat(container.style.minHeight) || 0;
      if (currentTrackHeight > lockedTrackHeight) {
        container.style.minHeight = `${currentTrackHeight}px`;
      }
      _exitingCards.add(el);
      _handDomIds.delete(id);
      el.style.pointerEvents = 'none';

      // 下一帧再收拢，确保浏览器能从卡牌当前尺寸平滑过渡。
      // 不再对原手牌播放纵向 fling，避免“先下后上”的视觉抖动。
      requestAnimationFrame(() => {
        if (!el.parentNode) return;
        // 收缩宽度前锁住卡牌高度。否则文字会在过渡中被挤成细长的多行，
        // 短暂撑高整个手牌轨道，造成“手牌区突然向下拉长”的抖动。
        const exitHeight = el.getBoundingClientRect().height;
        el.style.setProperty('--hand-card-exit-height', `${exitHeight}px`);
        el.classList.add('is-exiting');
        // 等 flex-basis 折叠过渡结束后从 DOM 移除
        const onDone = (e) => {
          if (e.propertyName !== 'flex-basis') return;
          el.removeEventListener('transitionend', onDone);
          if (el.parentNode) el.remove();
        };
        el.addEventListener('transitionend', onDone);
        // fallback: 超时兜底清理
        setTimeout(() => {
          if (el.parentNode) {
            el.removeEventListener('transitionend', onDone);
            el.remove();
          }
        }, 400);
      });
    }
  }

  // 2. 追加新卡 / 原地更新已有卡
  for (const card of state.solo.player.hand) {
    if (_handDomIds.has(card.instanceId)) {
      // 已有 — 只更新费用和可玩状态
      const el = container.querySelector(`[data-card-id="${card.instanceId}"]`);
      if (el) {
        const cost = getEffectiveCardCostSolo(card);
        const evalR = evaluateCardPlayState(card, 'player', state, {
          hand: state.solo.player?.hand || [],
          currentTurn: state.solo.turn,
          currentMana: state.solo.player?.mana || 0,
          maxMana: state.solo.player?.maxMana || 0,
          phase: state.solo.phase,
          busy: state.solo.busy,
          gameOver: isSoloGameOver(),
          maxBoardSize: getSoloScenario().player?.maxBoardSize || 7,
          boardSize: (state.solo.player?.board || []).length,
          runtime: state.solo.player?.runtime || { cardsPlayedThisTurn: [] },
          needsTarget: cardNeedsExplicitTargetSolo(card),
          availableTargets: state.solo.player.board.length + state.solo.boss.board.length,
          requiresDeadFriendlyMinion: (card.effects || []).some(e => e.type === 'returnDeadFriendlyMinions'),
          hasDeadFriendlyMinion: (state.solo.player?.runtime?.deadFriendlyMinions || []).length > 0,
          minionOnlyTarget: cardOnlyTargetsMinionsSolo(card),
          totalBoardMinions: state.solo.player.board.length + state.solo.boss.board.length,
          effectiveCost: cost,
        });
        const playable = evalR.playable;
        const visualState = evalR.visualState;
        const pending = state.solo.pendingSpellId === card.instanceId;
        el.className = `game-card ${playable ? visualState : 'is-locked'} ${pending ? 'is-selected' : ''}`;
        if (playable) el.removeAttribute('disabled'); else el.setAttribute('disabled', '');
        const costEl = el.querySelector('.game-card__cost');
        if (costEl) costEl.textContent = cost;
      }
    } else {
      // 新卡 — 追加到 DOM
      container.insertAdjacentHTML('beforeend', buildHandCardHTML(card));
      _handDomIds.add(card.instanceId);
    }
  }
}

function renderLogSolo() {
  elements.combatLog.innerHTML = state.solo.log.map((entry) => `<li>${entry}</li>`).join('');
}

function renderTipsSolo() {
  const scenario = getSoloScenario();
  elements.tipList.innerHTML = `
    <li>${scenario.rulesText}</li>
    ${(scenario.objectives || []).map((objective) => `<li>${objective.text}</li>`).join('')}
    <li>点击手牌出牌，点击己方随从后再点敌方随从或 Boss 头像进行攻击。</li>
    <li>如果法术有目标，先点法术，再点英雄或随从完成施放。</li>
    <li>这个版本用轻量动画做反馈，UI 和操作在手机与电脑上都可直接玩。</li>
    <li>如果你想手动改卡牌数值或效果，打开 <a href="/editor">/editor</a> 编辑器保存后再重新开始。</li>
  `;
}

function renderButtonsSolo() {
  const canEnd = state.solo.phase === 'player' && !state.solo.busy && !isSoloGameOver();
  elements.endTurnButton.disabled = !canEnd;

  // 绿色：无可执行动作（所有随从已攻击 + 手牌无可用 + 英雄技能已用或不够费）
  if (canEnd) {
    const hasAttackers = state.solo.player.board.some(m => m.canAttack);
    const hasPlayable = state.solo.player.hand.some(c => {
      if (getEffectiveCardCostSolo(c) > state.solo.player.mana) return false;
      if (c.type === 'minion' && state.solo.player.board.length >= getSoloScenario().player.maxBoardSize) return false;
      if ((c.effects || []).some(e => e.type === 'returnDeadFriendlyMinions')) {
        const rt = ensureSoloRuntime('player');
        if (!rt?.deadFriendlyMinions?.length) return false;
      }
      if (cardOnlyTargetsMinionsSolo(c)) {
        if (state.solo.player.board.length + state.solo.boss.board.length === 0) return false;
      }
      return true;
    });
    const heroPower = getSoloScenario().player?.heroPower;
    const canHeroPower = heroPower && !state.solo.player.heroPowerUsed && state.solo.player.mana >= (heroPower.cost || 2);
    const hasActions = hasAttackers || hasPlayable || canHeroPower;

    elements.endTurnButton.classList.toggle('is-ready', !hasActions);
  } else {
    elements.endTurnButton.classList.remove('is-ready');
  }
}

function renderPvp() {
  if (state.mode !== 'pvp') return;

  elements.title.textContent = '炉边酒馆 · 局域网对战';
  elements.lede.textContent = '与局域网内的对手进行双人对战';
  elements.pvpTurnIndicator.style.display = 'block';

  if (!state.pvp.player || !state.pvp.opponent) {
    elements.matchStatus.textContent = '载入对局';
    elements.turnStatus.textContent = '同步中';
    return;
  }

  renderHeroPanelsPvP();
  renderBoardPvP();
  renderHandPvP();
  renderLogPvP();
  renderStatusPvP();
  renderButtonsPvP();
  savePvpProgress(state.pvp.phase === 'ended' ? 'ended' : 'playing');
}

function renderHeroPanelsPvP() {
  const isMyTurn = isMyTurn();
  const pendingSpell = getPvpPendingSpell();
  const selectedAttacker = state.pvp.player.board.find((minion) => minion.instanceId === state.pvp.selectedAttackerId);
  const enemyHeroTarget = createHeroTargetRefPvP(getOpponentSlotPvP(state.pvp.mySlot));
  const friendlyHeroTarget = createHeroTargetRefPvP(state.pvp.mySlot);
  const enemyHeroCanBeAttacked = Boolean(
    selectedAttacker &&
    canPvpAttackTarget(
      selectedAttacker,
      state.pvp.opponent.board,
      createHeroTargetRefPvP(getOpponentSlotPvP(state.pvp.mySlot))
    )
  );

  // 对手信息 (enemy)
  elements.enemyHeroName.textContent = state.pvp.opponent.heroName;
  elements.enemyHeroNote.textContent = isMyTurn ? '你的回合，轮到你行动。' : '等待对手行动...';
  elements.enemyHealth.textContent = Math.max(0, state.pvp.opponent.health);
  renderArmorPill(elements.enemyArmor, state.pvp.opponent.armor);
  renderManaCrystals(elements.enemyManaCrystals, state.pvp.opponent.mana, state.pvp.opponent.maxMana);

  // 我的信息 (player)
  elements.playerHeroName.textContent = state.pvp.player.heroName;
  elements.playerHeroNote.textContent = `牌库 ${getVisibleDeckCount(state.pvp.player)} 张 · 手牌 ${state.pvp.player.hand.length} 张`;
  elements.playerHealth.textContent = Math.max(0, state.pvp.player.health);
  renderArmorPill(elements.playerArmor, state.pvp.player.armor);
  renderManaCrystals(elements.playerManaCrystals, state.pvp.player.mana, state.pvp.player.maxMana);
  updateDeckDisplay(state.pvp.player.deck?.length || 0);

  // 目标高亮
  const canTargetEnemyHeroWithSpell = Boolean(pendingSpell && canCardTarget(pendingSpell, state.pvp.mySlot, enemyHeroTarget));
  const canTargetFriendlyHeroWithSpell = Boolean(pendingSpell && canCardTarget(pendingSpell, state.pvp.mySlot, friendlyHeroTarget));

  elements.enemyHeroArea.classList.toggle('is-targetable', enemyHeroCanBeAttacked);
  elements.enemyHeroArea.classList.toggle('is-spell-targetable', canTargetEnemyHeroWithSpell);
  elements.playerHeroArea.classList.toggle('is-targetable', false);
  elements.playerHeroArea.classList.toggle('is-spell-targetable', canTargetFriendlyHeroWithSpell);

  // PvP状态
  if (state.pvp.phase === 'ended') {
    const won = state.pvp.winnerId === state.pvp.mySocketId;
    elements.pvpTurnIndicator.textContent = won ? '胜利!' : '失败';
    elements.pvpTurnIndicator.className = `pvp-turn-indicator ${won ? 'victory' : 'defeat'}`;
  } else {
    elements.pvpTurnIndicator.textContent = isMyTurn ? '你的回合' : '对手回合';
    elements.pvpTurnIndicator.className = `pvp-turn-indicator ${isMyTurn ? 'my-turn' : 'opponent-turn'}`;
  }
}

function renderBoardPvP() {
  const selectedAttacker = state.pvp.player.board.find((minion) => minion.instanceId === state.pvp.selectedAttackerId);
  const pendingSpell = getPvpPendingSpell();
  const isMyTurn = isMyTurn();
  const opponentSlot = getOpponentSlotPvP(state.pvp.mySlot);

  // 我的随从
  elements.playerBoardLane.innerHTML = `
    <div class="lane-label">你的随从</div>
    ${state.pvp.player.board.map((minion) => {
      const canAttack = minion.canAttack && isMyTurn && !minion.sleeping;
      const selected = state.pvp.selectedAttackerId === minion.instanceId;
      const targetRef = createMinionTargetRefPvP(state.pvp.mySlot, minion.instanceId);
      const spellTargetable = pendingSpell ? canCardTarget(pendingSpell, state.pvp.mySlot, targetRef) : false;
      const keywords = keywordBadgesMarkup(minion);
      const text = minion.text || buildKeywordText(minion.keywords);
      return `
        <button
          type="button"
          class="board-minion ${canAttack ? 'is-ready' : ''} ${selected ? 'is-selected' : ''} ${spellTargetable ? 'is-spell-targetable' : ''}"
          data-minion-id="${minion.instanceId}"
          ${canAttack || spellTargetable ? '' : 'disabled'}
        >
          <span class="board-minion__name">${minion.name}</span>
          ${keywords}
          ${text ? `<span class="board-minion__text">${text}</span>` : ''}
          <span class="board-minion__stats">
            <strong>${minion.attack}</strong>
            <strong>${Math.max(0, minion.health)}</strong>
          </span>
        </button>
      `;
    }).join('')}
  `;

  // 对手随从
  elements.enemyBoardLane.innerHTML = `
    <div class="lane-label">对手随从</div>
    ${state.pvp.opponent.board.map((minion) => {
      const targetRef = createMinionTargetRefPvP(opponentSlot, minion.instanceId);
      const attackTargetable = Boolean(selectedAttacker && canPvpAttackTarget(selectedAttacker, state.pvp.opponent.board, targetRef));
      const targetable = attackTargetable || Boolean(pendingSpell && canCardTarget(pendingSpell, state.pvp.mySlot, targetRef));
      const spellTargetable = Boolean(pendingSpell && canCardTarget(pendingSpell, state.pvp.mySlot, targetRef));
      const keywords = keywordBadgesMarkup(minion);
      const text = minion.text || buildKeywordText(minion.keywords);
      return `
        <button
          type="button"
          class="board-minion board-minion--enemy ${attackTargetable ? 'is-targetable' : ''} ${spellTargetable ? 'is-spell-targetable' : ''}"
          data-minion-id="${minion.instanceId}"
          ${targetable ? '' : 'disabled'}
        >
          <span class="board-minion__name">${minion.name}</span>
          ${keywords}
          ${text ? `<span class="board-minion__text">${text}</span>` : ''}
          <span class="board-minion__stats">
            <strong>${minion.attack}</strong>
            <strong>${Math.max(0, minion.health)}</strong>
          </span>
        </button>
      `;
    }).join('')}
  `;
}

function renderHandPvP() {
  const myTurn = isMyTurn();
  const pvpRuntime = state.pvp.player?.runtime || { cardsPlayedThisTurn: [] };

  elements.handCards.innerHTML = state.pvp.player.hand.map((card) => {
    const effectiveCost = getEffectiveCardCostPvp(card);
    const evalResult = evaluateCardPlayState(card, 'player', state, {
      hand: state.pvp.player?.hand || [],
      currentTurn: state.pvp.turn || 1,
      currentMana: state.pvp.player?.mana || 0,
      maxMana: state.pvp.player?.maxMana || 0,
      phase: myTurn ? 'player' : 'enemy',
      busy: state.busy || false,
      gameOver: state.pvp.phase === 'ended',
      maxBoardSize: 7,
      boardSize: (state.pvp.player?.board || []).length,
      runtime: pvpRuntime,
      effectiveCost,
    });
    const playable = evalResult.playable;
    const visualState = evalResult.visualState;
    const pending = state.pvp.pendingSpellId === card.instanceId;
    const textValue = resolveCardText(card);
    const effectText = textValue ? `<span class="game-card__text">${textValue}</span>` : '';
    const details = card.type === 'minion'
      ? `${card.attack}/${card.health} 随从${summarizeKeywords(card.keywords) ? ` · ${summarizeKeywords(card.keywords)}` : ''}`
      : card.effects.map((effect) => {
          if (effect.type === 'damage') return `伤害 ${effect.amount}`;
          if (effect.type === 'heal') return `治疗 ${effect.amount}`;
          if (effect.type === 'armor') return `护甲 ${effect.amount}`;
          if (effect.type === 'draw') return `抽牌 ${effect.amount}`;
          if (effect.type === 'buff') return `增益 +${effect.attack}/+${effect.health}`;
          if (effect.type === 'summon') return `召唤 x${effect.amount}`;
          return effect.type;
        }).join(' · ');

    return `
      <button
        type="button"
        class="game-card ${playable ? visualState : 'is-locked'} ${pending ? 'is-selected' : ''}"
        data-card-id="${card.instanceId}"
        ${playable ? '' : 'disabled'}
      >
        <span class="game-card__cost">${effectiveCost}</span>
        <span class="game-card__name">${card.name}</span>
        <span class="game-card__type">${card.type === 'minion' ? '随从' : '法术'}</span>
        ${effectText}
        <span class="game-card__details">${details}</span>
      </button>
    `;
  }).join('');
}

function renderLogPvP() {
  elements.combatLog.innerHTML = state.pvp.log.slice(-18).map((entry) => `<li>${entry}</li>`).join('');
}

function renderStatusPvP() {
  if (state.pvp.phase === 'ended') {
    elements.matchStatus.textContent = state.pvp.winnerId === state.pvp.mySocketId ? '胜利' : '失败';
    elements.turnStatus.textContent = `第 ${state.pvp.turn} 回合结束`;
    return;
  }

  elements.matchStatus.textContent = isMyTurn() ? '你的回合' : '等待对手';
  elements.turnStatus.textContent = `第 ${state.pvp.turn} 回合`;
}

function renderButtonsPvP() {
  elements.endTurnButton.disabled = !isMyTurn() || state.busy;
}

// ============================================
// 事件处理
// ============================================

function setupEventHandlers() {
  // 手牌点击
  elements.handCards.addEventListener('click', (event) => {
    // 可交易按钮 — 洗回牌库换一张
    const tradeBtn = event.target.closest('.game-card__trade');
    if (tradeBtn) {
      event.stopPropagation();
      const cardId = tradeBtn.dataset.tradeId;
      if (state.mode === 'solo') {
        tradeCardSolo(cardId);
      } else if (state.mode === 'pvp') {
        tradeCardPvp(cardId);
      }
      return;
    }

    const button = event.target.closest('[data-card-id]');
    if (!button) return;

    const card = state.mode === 'solo'
      ? state.solo.player.hand.find((entry) => entry.instanceId === button.dataset.cardId)
      : state.pvp.player.hand.find((entry) => entry.instanceId === button.dataset.cardId);

    if (!card) return;

    if (state.mode === 'solo') {
      playCardSolo(card);
    } else if (state.mode === 'pvp') {
      pvpPlayCard(card);
    }
  });

  // 玩家随从点击
  elements.playerBoardLane.addEventListener('click', (event) => {
    const button = event.target.closest('[data-minion-id]');
    if (!button) return;

    if (state.mode === 'solo') {
      if (getPendingSpellSolo()) {
        resolvePendingSpellTargetSolo(createMinionTargetRef('player', button.dataset.minionId));
        return;
      }
      const minion = state.solo.player.board.find((entry) => entry.instanceId === button.dataset.minionId);
      if (!minion || !minion.canAttack) return;
      state.solo.selectedAttackerId = state.solo.selectedAttackerId === minion.instanceId ? '' : minion.instanceId;
      renderSolo();
    } else if (state.mode === 'pvp') {
      if (state.pvp.pendingSpellId) {
        pvpResolveSpellTarget(createMinionTargetRefPvP(state.pvp.mySlot, button.dataset.minionId));
        return;
      }
      pvpSelectAttacker(button.dataset.minionId);
    }
  });

  // 敌方随从点击
  elements.enemyBoardLane.addEventListener('click', (event) => {
    const button = event.target.closest('[data-minion-id]');
    if (!button) return;

    if (state.mode === 'solo') {
      if (getPendingSpellSolo()) {
        resolvePendingSpellTargetSolo(createMinionTargetRef('boss', button.dataset.minionId));
        return;
      }
      const attacker = getSelectedAttacker();
      if (!attacker) return;
      resolveMinionCombatSolo(attacker, 'boss', 'minion', button.dataset.minionId);
      state.solo.selectedAttackerId = '';
      renderSolo();
    } else if (state.mode === 'pvp') {
      if (state.pvp.pendingSpellId) {
        const opponentSlot = state.pvp.mySlot === 'player1' ? 'player2' : 'player1';
        pvpResolveSpellTarget(createMinionTargetRefPvP(opponentSlot, button.dataset.minionId));
        return;
      }
      if (state.pvp.selectedAttackerId) {
        const opponentSlot = state.pvp.mySlot === 'player1' ? 'player2' : 'player1';
        pvpAttack(createMinionTargetRefPvP(opponentSlot, button.dataset.minionId));
      }
    }
  });

  // 敌方英雄点击
  elements.enemyHeroArea.addEventListener('click', () => {
    if (state.mode === 'solo') {
      if (getPendingSpellSolo()) {
        resolvePendingSpellTargetSolo(createHeroTargetRef('boss'));
        return;
      }
      const attacker = getSelectedAttacker();
      if (!attacker) return;
      resolveMinionCombatSolo(attacker, 'boss', 'hero');
      state.solo.selectedAttackerId = '';
      renderSolo();
    } else if (state.mode === 'pvp') {
      if (state.pvp.pendingSpellId) {
        const opponentSlot = state.pvp.mySlot === 'player1' ? 'player2' : 'player1';
        pvpResolveSpellTarget(createHeroTargetRefPvP(opponentSlot));
        return;
      }
      if (state.pvp.selectedAttackerId) {
        const opponentSlot = state.pvp.mySlot === 'player1' ? 'player2' : 'player1';
        pvpAttack(createHeroTargetRefPvP(opponentSlot));
      }
    }
  });

  // 己方英雄点击
  elements.playerHeroArea.addEventListener('click', () => {
    if (state.mode === 'solo') {
      if (!getPendingSpellSolo()) return;
      resolvePendingSpellTargetSolo(createHeroTargetRef('player'));
    } else if (state.mode === 'pvp') {
      if (state.pvp.pendingSpellId) {
        pvpResolveSpellTarget(createHeroTargetRefPvP(state.pvp.mySlot));
      }
    }
  });

  // 结束回合按钮
  elements.endTurnButton.addEventListener('click', () => {
    if (state.mode === 'solo') {
      if (state.solo.phase !== 'player' || state.solo.busy || isSoloGameOver()) return;
      void resolveEnemyTurnSolo();
    } else if (state.mode === 'pvp') {
      pvpEndTurn();
    }
  });

  // 英雄技能按钮
  const heroPowerBtn = document.getElementById('hero-power-btn');
  if (heroPowerBtn) {
    heroPowerBtn.addEventListener('click', () => {
      if (state.mode === 'solo') {
        usePlayerHeroPowerSolo();
      }
    });
  }

  // 重新开始按钮
  elements.restartButton.addEventListener('click', () => {
    if (state.mode === 'solo') {
      startSoloMode(state.solo.scenarioId || 'boss');
    } else if (state.mode === 'pvp') {
      if (network.isInRoom()) {
        clearPvpProgress();
        network.leaveRoom();
      }
      showLobbyOverlay();
    }
  });
}

// ============================================
// Toast 提示
// ============================================

function showToast(message) {
  // 移除已有的toast
  const existingToast = document.querySelector('.toast-message');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.textContent = message;
  document.body.appendChild(toast);

  // 动画显示
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // 3秒后移除
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function render() {
  const preferredUrl = state.meta?.urls?.find((url) => !url.includes('127.0.0.1')) || state.meta?.urls?.[0];
  if (preferredUrl) {
    elements.lanAddressValue.textContent = preferredUrl;
  }

  if (state.mode !== 'battlegrounds') {
    hideBattlegroundsView(elements.gameArea);
  }

  if (state.mode === 'solo') {
    renderSolo();
    return;
  }

  if (state.mode === 'pvp') {
    renderPvp();
    return;
  }

  if (state.mode === 'battlegrounds') {
    renderBattlegrounds();
    return;
  }

  elements.matchStatus.textContent = '大厅';
  elements.turnStatus.textContent = '等待开始';
}

// ============================================
// 初始化
// ============================================

async function loadMeta() {
  try {
    const response = await fetch('/api/meta', { cache: 'no-store' });
    state.meta = await response.json();
  } catch {
    state.meta = null;
  }
  render();
}

function init() {
  // 设置大厅事件
  setupLobbyEvents();

  // 设置网络监听
  setupNetworkListeners();

  // 设置游戏事件
  setupEventHandlers();

  // 连接到服务器
  network.connect().catch((err) => {
    console.warn('Failed to connect to server:', err);
    // 不影响单机模式
  });

  // 加载元数据
  void loadMeta();

  // 显示大厅
  showLobbyOverlay({ preserveUrl: true });

  window.setTimeout(() => {
    if (state.mode === 'menu') {
      attemptInitialResume();
    }
  }, 300);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 导出供调试用
window.__gameState = state;
window.__network = network;
