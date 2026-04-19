import { encounter, rulesText, starterDeck, cards as baseCards } from './game-data.js';
import { applyCardOverrides } from './card-overrides.js';
import {
  buildKeywordText,
  consumeMinionAttack,
  createMinionRuntimeState,
  getDisplayKeywords,
  hasKeyword,
  resetMinionForTurn,
  summarizeKeywords,
} from './keywords.js';
import { network } from './network.js';
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
const SOLO_SCENARIOS = Object.freeze({
  boss: BOSS_SOLO_SCENARIO,
  test: TEST_SOLO_SCENARIO,
});
const SOLO_PROGRESS_STORAGE_KEY = 'clawteam-lan-hearthstone-solo-progress-v2';
const PVP_PROGRESS_STORAGE_KEY = 'clawteam-lan-hearthstone-pvp-progress-v2';

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

  // PvP选择页面
  btnCreateRoom: document.getElementById('btn-create-room'),
  btnShowJoin: document.getElementById('btn-show-join'),
  btnStartTest: document.getElementById('btn-start-test'),
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
  enemyMana: document.getElementById('enemy-mana'),
  battlefieldZone: document.getElementById('battlefield-zone'),
  enemyBoardLane: document.getElementById('enemy-board-lane'),
  playerHeroArea: document.getElementById('player-hero-area'),
  playerHeroName: document.getElementById('player-hero-name'),
  playerHeroNote: document.getElementById('player-hero-note'),
  playerHealth: document.getElementById('player-health'),
  playerArmor: document.getElementById('player-armor'),
  playerMana: document.getElementById('player-mana'),
  playerBoardLane: document.getElementById('player-board-lane'),
  handCards: document.getElementById('hand-cards'),
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

  // 当前模式
  mode: 'menu', // 'menu' | 'solo' | 'pvp'
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

function buildDeck() {
  const expanded = [];
  for (const base of effectiveCards) {
    if (!base.enabled) continue;
    const copies = Math.max(0, Number.parseInt(base.deckCount ?? 0, 10) || 0);
    if (!copies) continue;
    for (let count = 0; count < copies; count += 1) {
      expanded.push({
        ...base,
        instanceId: uid(`card-${base.id}`),
      });
    }
  }
  return shuffle(expanded);
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

  elements.btnStartTest?.addEventListener('click', () => {
    startSoloMode('test');
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

function startSoloMode(scenarioId = 'boss') {
  state.solo.scenarioId = SOLO_SCENARIOS[scenarioId] ? scenarioId : 'boss';
  const scenario = getSoloScenario();
  state.mode = 'solo';
  hideLobbyOverlay();
  updateAppUrl('solo', { scenarioId: state.solo.scenarioId });

  initSoloState();
  drawCards(scenario.player.handSize);
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
  };

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
    if ((state.pvp.player?.hand?.length ?? 0) > previousHandCount) {
      animator?.drawCard?.(elements.handCards);
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
  if (cardInstance.cost > state.pvp.player.mana) return;

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
  if (card.cost > state.pvp.player.mana) return;

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
  return scenario.boss.turnScript.find((entry) => entry.turn === turn) || null;
}

function describeBossMove(turn = state.solo.turn) {
  const scenario = getSoloScenario();
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

function dealDamage(target, amount) {
  if (amount <= 0) return 0;
  const absorbed = Math.min(target.armor, amount);
  target.armor -= absorbed;
  const healthLoss = amount - absorbed;
  target.health -= healthLoss;
  return healthLoss;
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
  }
}

function drawCards(amount) {
  let drawn = 0;
  while (drawn < amount && state.solo.player.deck.length && state.solo.player.hand.length < 10) {
    const nextCard = state.solo.player.deck.shift();
    state.solo.player.hand.push(nextCard);
    drawn += 1;
  }
  return drawn;
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

  const actualDamage = Math.min(amount, Math.max(defender.health, 0));
  defender.health -= amount;

  if (actualDamage > 0 && attacker && hasKeyword(attacker, 'poisonous')) {
    defender.health = 0;
  }

  if (actualDamage > 0 && attacker && hasKeyword(attacker, 'lifesteal')) {
    healHeroWithLifestealSolo(attackerSide, actualDamage);
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
  const opponentSide = actorSide === 'player' ? 'boss' : 'player';
  if (effect.target === 'playerChoice') {
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

function applyEffectsSolo(effects, actorSide, context = { primaryTarget: null, primaryTargets: {}, chosenTarget: null }) {
  for (const effect of effects || []) {
    if (effect.type === 'conditional') {
      const controlsMinion = actorSide === 'player' ? state.solo.player.board.length > 0 : state.solo.boss.board.length > 0;
      const controlsNoMinion = !controlsMinion;
      if (effect.condition === 'controlsMinion' && controlsMinion) {
        applyEffectsSolo(effect.effects, actorSide, context);
      }
      if (effect.condition === 'controlsNoMinion' && controlsNoMinion) {
        applyEffectsSolo(effect.effects, actorSide, context);
      }
      continue;
    }

    if (effect.type === 'damage') {
      const targetRef = resolveEffectTargetSolo(effect, actorSide, context);
      const targetEntity = getTargetEntitySolo(targetRef);
      if (!targetRef || !targetEntity) continue;
      context.primaryTarget = context.primaryTarget || targetRef;
      context.primaryTargets.damage = context.primaryTargets.damage || targetRef;
      const amount = Number(effect.amount) || 0;
      if (targetRef.kind === 'hero') {
        dealDamage(targetEntity, amount);
        pushSoloLog(
          actorSide === 'player'
            ? `法术命中 ${describeTargetRefSolo(targetRef)}，造成 ${amount} 点伤害。`
            : `${state.solo.boss.heroName} 的技能命中 ${targetRef.side === 'player' ? '你' : describeTargetRefSolo(targetRef)}，造成 ${amount} 点伤害。`
        );
        animator?.hit?.(targetHeroAreaSolo(targetRef.side));
        animator?.pulseStat?.(targetHealthPillSolo(targetRef.side));
      } else {
        dealMinionDamageSolo(null, actorSide, targetEntity, amount);
        pushSoloLog(`${describeTargetRefSolo(targetRef)} 受到了 ${amount} 点伤害。`);
        animator?.hit?.(getTargetAreaSolo(targetRef));
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
      pushSoloLog(`${describeTargetRefSolo(targetRef)} 恢复了 ${healed} 点生命值。`);
      animator?.heal?.(getTargetAreaSolo(targetRef));
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
        const drawn = drawCardsSolo(Number(effect.amount) || 0);
        pushSoloLog(`你抽了 ${drawn} 张牌。`);
        animator?.drawCard?.(elements.handCards);
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
    state.solo.player.hand.push(nextCard);
    drawn += 1;
  }
  return drawn;
}

function resolveCardSolo(cardInstance, chosenDamageTarget = null) {
  state.solo.player.mana -= cardInstance.cost;
  state.solo.player.hand = state.solo.player.hand.filter((card) => card.instanceId !== cardInstance.instanceId);
  clearPendingSpellSolo();
  animator?.pulseStat?.(elements.playerMana);

  if (cardInstance.type === 'minion') {
    const landed = capBoard('player', [cloneMinion(cardInstance, 'player')]);
    if (landed.length) {
      state.solo.player.board.push(...landed);
      pushSoloLog(`你打出了 ${cardInstance.name}。`);
    } else {
      pushSoloLog(`你的战场已满，${cardInstance.name} 无法登场。`);
    }
  } else {
    pushSoloLog(`你施放了 ${cardInstance.name}。`);
    applyEffectsSolo(cardInstance.effects, 'player', {
      primaryTarget: null,
      primaryTargets: {},
      chosenTarget: chosenDamageTarget,
    });
  }

  animator?.flingCard?.(`[data-card-id="${cardInstance.instanceId}"]`, {
    to: elements.battlefieldZone,
  });

  if (!checkSoloOutcome()) {
    renderSolo();
  }
}

function playCardSolo(cardInstance) {
  if (state.solo.phase !== 'player' || state.solo.busy) return;
  if (cardInstance.cost > state.solo.player.mana) return;
  if (cardInstance.type === 'minion' && state.solo.player.board.length >= getSoloScenario().player.maxBoardSize) return;

  if (cardInstance.type === 'spell' && cardNeedsExplicitTargetSolo(cardInstance)) {
    state.solo.pendingSpellId = state.solo.pendingSpellId === cardInstance.instanceId ? '' : cardInstance.instanceId;
    state.solo.selectedAttackerId = '';
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
  if (card.cost > state.solo.player.mana) {
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
    dealHeroDamageSolo(attacker, attacker.side, defender, attacker.attack);
    consumeMinionAttack(attacker);
    pushSoloLog(`${attacker.name} 攻击了 ${defender.heroName}，造成 ${attacker.attack} 点伤害。`);
    animator?.hit?.(targetHeroAreaSolo(defenderSide));
    animator?.pulseStat?.(targetHealthPillSolo(defenderSide));
    if (hasKeyword(attacker, 'lifesteal')) {
      animator?.heal?.(targetHeroAreaSolo(attacker.side));
      animator?.pulseStat?.(targetHealthPillSolo(attacker.side));
    }
    checkSoloOutcome();
    return;
  }

  const defender = state.solo[defenderSide].board.find((minion) => minion.instanceId === defenderId);
  if (!defender) return;

  dealMinionDamageSolo(attacker, attacker.side, defender, attacker.attack);
  dealMinionDamageSolo(defender, defenderSide, attacker, defender.attack);
  consumeMinionAttack(attacker);

  pushSoloLog(`${attacker.name} 与 ${defender.name} 交战。`);
  animator?.hit?.(`[data-minion-id="${attacker.instanceId}"]`);
  animator?.hit?.(`[data-minion-id="${defender.instanceId}"]`);
  if (hasKeyword(attacker, 'lifesteal')) {
    animator?.heal?.(targetHeroAreaSolo(attacker.side));
    animator?.pulseStat?.(targetHealthPillSolo(attacker.side));
  }
  if (hasKeyword(defender, 'lifesteal')) {
    animator?.heal?.(targetHeroAreaSolo(defenderSide));
    animator?.pulseStat?.(targetHealthPillSolo(defenderSide));
  }

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
  state.solo.busy = true;
  state.solo.phase = 'enemy';
  state.solo.selectedAttackerId = '';
  renderSolo();

  animator?.turnBanner?.(`${state.solo.boss.heroName} 回合 ${state.solo.turn}`, { durationMs: 820 });
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

  if (turnLimit && state.solo.turn >= turnLimit && state.solo.boss.health > 0) {
    markSoloDefeat(`${state.solo.boss.heroName} 拖过了第 ${turnLimit} 回合，你没能完成这场测试/挑战。`);
    return;
  }

  state.solo.turn += 1;
  state.solo.player.maxMana = Math.min(10, state.solo.turn);
  state.solo.player.mana = state.solo.player.maxMana;
  state.solo.boss.maxMana = Math.min(10, state.solo.turn);
  state.solo.boss.mana = state.solo.boss.maxMana;
  wakeBoard('player');
  const drawn = drawCards(1);
  if (drawn) {
    pushSoloLog(`回合开始，你抽了 ${drawn} 张牌。`);
    animator?.drawCard?.(elements.handCards);
  }
  state.solo.phase = 'player';
  state.solo.busy = false;
  renderSolo();
  animator?.turnBanner?.(`你的回合 ${state.solo.turn}`, { durationMs: 760 });
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
  if (card.cost > state.solo.player.mana) return false;
  if (card.type === 'minion' && state.solo.player.board.length >= getSoloScenario().player.maxBoardSize) return false;
  return true;
}

// ============================================
// PvP 辅助函数（复用Solo的逻辑）
// ============================================

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
  renderBoardSolo();
  renderHandSolo();
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
      : `下一手：${nextMove}`;
  elements.enemyHealth.textContent = Math.max(0, state.solo.boss.health);
  elements.enemyArmor.textContent = Math.max(0, state.solo.boss.armor);
  elements.enemyMana.textContent = `${state.solo.boss.mana} / ${state.solo.boss.maxMana}`;

  elements.playerHeroName.textContent = state.solo.player.heroName;
  elements.playerHeroNote.textContent = `牌库 ${state.solo.player.deck.length} 张 · 手牌 ${state.solo.player.hand.length} 张`;
  elements.playerHealth.textContent = Math.max(0, state.solo.player.health);
  elements.playerArmor.textContent = Math.max(0, state.solo.player.armor);
  elements.playerMana.textContent = `${state.solo.player.mana} / ${state.solo.player.maxMana}`;

  elements.enemyHeroArea.classList.toggle('is-targetable', enemyHeroCanBeAttacked || (pendingSpell && canCardTargetSolo(pendingSpell, 'player', createHeroTargetRef('boss'))));
  elements.enemyHeroArea.classList.toggle('is-spell-targetable', pendingSpell && canCardTargetSolo(pendingSpell, 'player', createHeroTargetRef('boss')));
  elements.playerHeroArea.classList.toggle('is-targetable', pendingSpell && canCardTargetSolo(pendingSpell, 'player', createHeroTargetRef('player')));
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
      return createMinionMarkupSolo(minion, 'player', canAttack, selected, spellTargetable);
    }).join('')}
  `;

  elements.enemyBoardLane.innerHTML = `
    <div class="lane-label">敌方随从区</div>
    ${state.solo.boss.board.map((minion) => {
      const targetRef = createMinionTargetRef('boss', minion.instanceId);
      const spellTargetable = pendingSpell ? canCardTargetSolo(pendingSpell, 'player', targetRef) : false;
      const attackTargetable = Boolean(attacker && canAttackTargetSolo(attacker, 'boss', 'minion', minion.instanceId));
      return createMinionMarkupSolo(minion, 'boss', pendingSpell ? spellTargetable : attackTargetable, false, spellTargetable);
    }).join('')}
  `;
}

function createMinionMarkupSolo(minion, ownerSide, canAttack, selected, spellTargetable) {
  const textValue = minion.text || buildKeywordText(minion.keywords);
  const text = textValue ? `<span class="board-minion__text">${textValue}</span>` : '';
  const isEnemy = ownerSide === 'boss';
  const keywords = keywordBadgesMarkup(minion);

  return `
    <button
      type="button"
      class="board-minion ${isEnemy ? 'board-minion--enemy' : ''} ${canAttack ? 'is-ready' : ''} ${selected ? 'is-selected' : ''} ${spellTargetable ? 'is-spell-targetable' : ''}"
      data-minion-id="${minion.instanceId}"
      ${canAttack || spellTargetable ? '' : 'disabled'}
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

function renderHandSolo() {
  elements.handCards.innerHTML = state.solo.player.hand.map((card) => {
    const playable = playerCanPlaySolo(card);
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

    return `
      <button
        type="button"
        class="game-card ${playable ? 'is-playable' : 'is-locked'} ${pending ? 'is-selected' : ''}"
        data-card-id="${card.instanceId}"
        ${playable ? '' : 'disabled'}
      >
        <span class="game-card__cost">${card.cost}</span>
        <span class="game-card__name">${card.name}</span>
        <span class="game-card__type">${card.type === 'minion' ? '随从' : '法术'}</span>
        ${effectText}
        <span class="game-card__details">${details}</span>
      </button>
    `;
  }).join('');
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
  elements.endTurnButton.disabled = state.solo.phase !== 'player' || state.solo.busy || isSoloGameOver();
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
  elements.enemyArmor.textContent = Math.max(0, state.pvp.opponent.armor);
  elements.enemyMana.textContent = `${state.pvp.opponent.mana} / ${state.pvp.opponent.maxMana}`;

  // 我的信息 (player)
  elements.playerHeroName.textContent = state.pvp.player.heroName;
  elements.playerHeroNote.textContent = `牌库 ${getVisibleDeckCount(state.pvp.player)} 张 · 手牌 ${state.pvp.player.hand.length} 张`;
  elements.playerHealth.textContent = Math.max(0, state.pvp.player.health);
  elements.playerArmor.textContent = Math.max(0, state.pvp.player.armor);
  elements.playerMana.textContent = `${state.pvp.player.mana} / ${state.pvp.player.maxMana}`;

  // 目标高亮
  const canTargetEnemyHeroWithSpell = Boolean(pendingSpell && canCardTarget(pendingSpell, state.pvp.mySlot, enemyHeroTarget));
  const canTargetFriendlyHeroWithSpell = Boolean(pendingSpell && canCardTarget(pendingSpell, state.pvp.mySlot, friendlyHeroTarget));

  elements.enemyHeroArea.classList.toggle('is-targetable', enemyHeroCanBeAttacked || canTargetEnemyHeroWithSpell);
  elements.enemyHeroArea.classList.toggle('is-spell-targetable', canTargetEnemyHeroWithSpell);
  elements.playerHeroArea.classList.toggle('is-targetable', canTargetFriendlyHeroWithSpell);
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
          class="board-minion board-minion--enemy ${spellTargetable ? 'is-spell-targetable' : ''}"
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
  const isMyTurn = isMyTurn();

  elements.handCards.innerHTML = state.pvp.player.hand.map((card) => {
    const playable = isMyTurn && card.cost <= state.pvp.player.mana;
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
        class="game-card ${playable ? 'is-playable' : 'is-locked'} ${pending ? 'is-selected' : ''}"
        data-card-id="${card.instanceId}"
        ${playable ? '' : 'disabled'}
      >
        <span class="game-card__cost">${card.cost}</span>
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

  if (state.mode === 'solo') {
    renderSolo();
    return;
  }

  if (state.mode === 'pvp') {
    renderPvp();
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
