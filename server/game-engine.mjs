import { ActionTypes, RoomStatus } from './protocol.mjs';
import {
  buildKeywordText,
  consumeMinionAttack,
  createMinionRuntimeState,
  hasKeyword,
  resetMinionForTurn,
} from '../public/keywords.js';

// 独立游戏引擎 - 处理所有游戏逻辑
export class GameEngine {
  constructor() {
    this.uidCounter = 0;
  }

  // 生成唯一ID
  generateUid(prefix = 'entity') {
    this.uidCounter++;
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${this.uidCounter}`;
  }

  // 打乱数组
  shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // 从卡牌数据构建牌库
  // deckData 可以是 cardId 数组 ['cardId1', 'cardId2'] 或对象数组 [{cardId, count}]
  buildDeckFromData(deckData, cardsLookup) {
    const expanded = [];

    // 标准化数据格式
    const entries = [];

    if (Array.isArray(deckData)) {
      // 如果是简单数组，转换为对象格式
      const cardCount = {};
      for (const cardId of deckData) {
        cardCount[cardId] = (cardCount[cardId] || 0) + 1;
      }
      for (const [cardId, count] of Object.entries(cardCount)) {
        entries.push({ cardId, count });
      }
    } else if (typeof deckData === 'object') {
      // 如果是对象数组
      for (const entry of deckData) {
        entries.push({ cardId: entry.cardId || entry.id, count: entry.count || 1 });
      }
    }

    for (const entry of entries) {
      const card = cardsLookup[entry.cardId];
      if (!card || !card.enabled) continue;

      const copies = Math.max(0, Number.parseInt(entry.count ?? 0, 10) || 0);
      for (let i = 0; i < copies; i++) {
        expanded.push({
          ...card,
          instanceId: this.generateUid(`card-${card.id}`)
        });
      }
    }

    // 任务牌不参与洗牌，放在牌库末尾
    const questCards = expanded.filter(c => (c.mechanics || []).includes('questline'));
    const normalCards = expanded.filter(c => !(c.mechanics || []).includes('questline'));
    return [...this.shuffle(normalCards), ...questCards];
  }

  // 创建随从实例
  createMinionInstance(source, ownerSlot, overrides = {}) {
    const attack = overrides.attack ?? source.attack ?? 0;
    const health = overrides.health ?? source.health ?? 1;
    const keywords = overrides.keywords ?? source.keywords;
    const runtimeState = createMinionRuntimeState(keywords, {
      ...overrides,
      sleeping: overrides.sleeping ?? true,
    });

    return {
      instanceId: this.generateUid(`${ownerSlot}-minion`),
      sourceId: source.id || source.name || `${ownerSlot}-token`,
      name: overrides.name || source.name || 'Token',
      text: overrides.text ?? source.text ?? buildKeywordText(keywords),
      effects: structuredClone(overrides.effects ?? source.effects ?? []),
      mechanics: structuredClone(overrides.mechanics ?? source.mechanics ?? []),
      attack,
      health,
      maxHealth: health,
      ...runtimeState
    };
  }

  // 初始化游戏状态
  initializeGameState(room) {
    // 假设cardsLookup是外部传入的或通过import获取
    const cardsLookup = this.getCardsLookup();

    const player1Deck = this.buildDeckFromData(room.hostDeck, cardsLookup);
    const player2Deck = this.buildDeckFromData(room.guestDeck, cardsLookup);

    // 先手玩家随机
    const firstPlayerIsHost = Math.random() < 0.5;

    const state = {
      turn: 1,
      activePlayerId: firstPlayerIsHost ? room.hostPlayerId : room.guestPlayerId,
      phase: 'playing',
      winnerId: null,

      player1: {
        socketId: room.hostPlayerId,
        heroName: '玩家1',
        health: 30,
        armor: 0,
        mana: 1,
        maxMana: 1,
        deck: player1Deck,
        hand: [],
        board: [],
        runtime: { selfDamageThisTurn: 0, selfDamageThisGame: 0, damageTakenThisTurn: 0, healthChangesThisTurn: 0, healthChangesThisGame: 0, questline: null, redirectSelfDamage: false, delayedDamage: [], graveyard: [], spellTax: 0, spellTaxTurns: 0 }
      },

      player2: {
        socketId: room.guestPlayerId,
        heroName: '玩家2',
        health: 30,
        armor: 0,
        mana: 1,
        maxMana: 1,
        deck: player2Deck,
        hand: [],
        board: [],
        runtime: { selfDamageThisTurn: 0, selfDamageThisGame: 0, damageTakenThisTurn: 0, healthChangesThisTurn: 0, healthChangesThisGame: 0, questline: null, redirectSelfDamage: false, delayedDamage: [], graveyard: [], spellTax: 0, spellTaxTurns: 0 }
      },

      actionLog: [],
      pendingSpell: null,
      selectedAttacker: null
    };

    // 任务牌必定在起始手牌 — 抽牌前先提出来
    function pullQuestlinesToHand(player, normalDrawCount) {
      const questCards = [];
      player.deck = player.deck.filter(card => {
        const isQuest = (card.mechanics || []).includes('questline');
        if (isQuest) { questCards.push(card); return false; }
        return true;
      });
      // 任务牌放最左边
      player.hand.push(...questCards);
      // 从牌库补抽剩余牌
      for (let i = 0; i < normalDrawCount; i++) {
        if (player.deck.length > 0) {
          player.hand.push(player.deck.shift());
        }
      }
    }

    const firstPlayer = firstPlayerIsHost ? state.player1 : state.player2;
    const firstPlayerId = firstPlayer.socketId;
    const secondPlayer = firstPlayerIsHost ? state.player2 : state.player1;

    pullQuestlinesToHand(firstPlayer, 3);
    pullQuestlinesToHand(secondPlayer, 4);

    this.log(state, '对战开始！');
    this.log(state, firstPlayerIsHost ? '玩家1 先手' : '玩家2 先手');
    this.beginTurn(state, firstPlayerId, {
      increaseMana: false,
      drawCard: true,
      readyBoard: true,
      logTurn: true
    });

    return state;
  }

  // 获取卡牌查找表（需要外部注入）
  getCardsLookup() {
    // 这个方法会被外部覆盖或注入
    throw new Error('Cards lookup not configured');
  }

  // 日志
  log(state, message) {
    state.actionLog = [...state.actionLog.slice(-19), message];
  }

  // 根据socketId获取玩家
  getPlayerBySocketId(state, socketId) {
    if (state.player1.socketId === socketId) return { player: state.player1, slot: 'player1' };
    if (state.player2.socketId === socketId) return { player: state.player2, slot: 'player2' };
    return null;
  }

  // 获取对手
  getOpponent(state, socketId) {
    if (state.player1.socketId === socketId) return state.player2;
    if (state.player2.socketId === socketId) return state.player1;
    return null;
  }

  // 获取slot
  getPlayerSlot(state, socketId) {
    if (state.player1.socketId === socketId) return 'player1';
    if (state.player2.socketId === socketId) return 'player2';
    return null;
  }

  getOpponentSlot(slot) {
    return slot === 'player1' ? 'player2' : 'player1';
  }

  normalizeTargetRef(targetRef) {
    if (!targetRef || typeof targetRef !== 'object') return null;
    if (!targetRef.side || !targetRef.kind) return null;
    if (targetRef.kind === 'hero') {
      return { side: targetRef.side, kind: 'hero' };
    }
    if (targetRef.kind === 'minion') {
      const minionId = targetRef.minionId || targetRef.id;
      if (!minionId) return null;
      return { side: targetRef.side, kind: 'minion', minionId };
    }
    return null;
  }

  getTargetEntity(state, targetRef) {
    const normalizedTargetRef = this.normalizeTargetRef(targetRef);
    if (!normalizedTargetRef) return null;
    if (!state[normalizedTargetRef.side]) return null;
    if (normalizedTargetRef.kind === 'hero') {
      return state[normalizedTargetRef.side];
    }
    return state[normalizedTargetRef.side].board.find(
      (minion) => minion.instanceId === normalizedTargetRef.minionId
    ) || null;
  }

  isValidBoardTarget(state, targetRef) {
    const normalizedTargetRef = this.normalizeTargetRef(targetRef);
    if (!normalizedTargetRef) return false;
    const targetPlayer = state[normalizedTargetRef.side];
    if (!targetPlayer) return false;
    if (normalizedTargetRef.kind === 'hero') return true;
    return targetPlayer.board.some((minion) => minion.instanceId === normalizedTargetRef.minionId);
  }

  effectNeedsExplicitTarget(effect) {
    if (effect.type === 'conditional') {
      return (effect.effects || []).some((nestedEffect) => this.effectNeedsExplicitTarget(nestedEffect));
    }
    return ['enemyMinion', 'friendlyMinion', 'playerChoice'].includes(effect.target);
  }

  cardNeedsExplicitTarget(card) {
    return (card.effects || []).some((effect) => this.effectNeedsExplicitTarget(effect));
  }

  isValidSpellTargetForEffect(state, effect, actorSlot, targetRef) {
    const normalizedTargetRef = this.normalizeTargetRef(targetRef);
    if (!normalizedTargetRef || !this.isValidBoardTarget(state, normalizedTargetRef)) {
      return false;
    }

    // 检查 targetKinds 约束（如灵魂炸弹只能选随从）
    if (effect.targetKinds && Array.isArray(effect.targetKinds) && effect.targetKinds.length > 0) {
      if (!effect.targetKinds.includes(normalizedTargetRef.kind)) {
        return false;
      }
    }

    const opponentSlot = this.getOpponentSlot(actorSlot);
    switch (effect.target) {
      case 'playerChoice':
        if (effect.type === 'adjacentChainDamage') {
          return normalizedTargetRef.kind === 'minion';
        }
        if (['damage', 'heal'].includes(effect.type)) {
          return normalizedTargetRef.kind === 'hero' || normalizedTargetRef.kind === 'minion';
        }
        if (['armor', 'draw'].includes(effect.type)) {
          return normalizedTargetRef.kind === 'hero';
        }
        return false;
      case 'enemyHero':
        return normalizedTargetRef.kind === 'hero' && normalizedTargetRef.side === opponentSlot;
      case 'friendlyHero':
        return normalizedTargetRef.kind === 'hero' && normalizedTargetRef.side === actorSlot;
      case 'enemyMinion':
        return normalizedTargetRef.kind === 'minion' && normalizedTargetRef.side === opponentSlot;
      case 'friendlyMinion':
        return normalizedTargetRef.kind === 'minion' && normalizedTargetRef.side === actorSlot;
      default:
        return false;
    }
  }

  spellTargetMatchesAnyEffect(state, effects, actorSlot, targetRef) {
    return (effects || []).some((effect) => {
      if (effect.type === 'conditional') {
        return this.spellTargetMatchesAnyEffect(state, effect.effects, actorSlot, targetRef);
      }
      if (!this.effectNeedsExplicitTarget(effect)) return false;
      return this.isValidSpellTargetForEffect(state, effect, actorSlot, targetRef);
    });
  }

  // 伤害计算
  dealDamage(target, amount) {
    if (amount <= 0) return 0;

    const absorbed = Math.min(target.armor, amount);
    target.armor -= absorbed;
    const healthLoss = amount - absorbed;
    target.health -= healthLoss;
    return healthLoss;
  }

  // 清理死亡随从
  cleanDeadMinions(board) {
    return board.filter(minion => minion.health > 0);
  }

  getTauntMinions(board) {
    return (board || []).filter((minion) => minion.health > 0 && hasKeyword(minion, 'taunt'));
  }

  canAttackTarget(state, attackerSlot, targetRef) {
    const normalizedTargetRef = this.normalizeTargetRef(targetRef);
    if (!normalizedTargetRef) return false;
    const opponentSlot = this.getOpponentSlot(attackerSlot);
    if (normalizedTargetRef.side !== opponentSlot) return false;

    const tauntMinions = this.getTauntMinions(state[opponentSlot].board);
    if (!tauntMinions.length) return this.isValidBoardTarget(state, normalizedTargetRef);
    if (normalizedTargetRef.kind !== 'minion') return false;
    return tauntMinions.some((minion) => minion.instanceId === normalizedTargetRef.minionId);
  }

  healHeroFromLifesteal(state, ownerSlot, amount) {
    if (amount <= 0) return 0;
    const hero = state[ownerSlot];
    const maxHealth = hero.maxHealth || 30;
    const before = hero.health;
    hero.health = Math.min(maxHealth, hero.health + amount);
    const restored = hero.health - before;
    if (restored > 0) this.recordHeroHealthChange(state, hero);
    return restored;
  }

  recordHeroHealthChange(state, hero) {
    if (!hero?.runtime || hero.socketId !== state.activePlayerId) return;
    hero.runtime.healthChangesThisTurn = (hero.runtime.healthChangesThisTurn || 0) + 1;
    hero.runtime.healthChangesThisGame = (hero.runtime.healthChangesThisGame || 0) + 1;
  }

  dealDamageToHero(state, targetHero, amount, ownerSlot = null, source = null) {
    if (amount <= 0) return 0;
    const before = targetHero.health;
    this.dealDamage(targetHero, amount);
    const healthLost = before - targetHero.health;
    // 追踪生命值变化（用于血肉巨人等动态费用）
    if (healthLost > 0) this.recordHeroHealthChange(state, targetHero);
    if (ownerSlot && source && hasKeyword(source, 'lifesteal')) {
      this.healHeroFromLifesteal(state, ownerSlot, amount);
    }
    return amount;
  }

  dealDamageToMinion(state, targetMinion, amount, ownerSlot = null, source = null) {
    if (!targetMinion || amount <= 0) return 0;

    if (targetMinion.divineShield) {
      targetMinion.divineShield = false;
      return 0;
    }

    const actualDamage = Math.min(amount, Math.max(targetMinion.health, 0));
    targetMinion.health -= amount;

    if (actualDamage > 0 && source && hasKeyword(source, 'poisonous')) {
      targetMinion.health = 0;
    }

    if (actualDamage > 0 && ownerSlot && source && hasKeyword(source, 'lifesteal')) {
      this.healHeroFromLifesteal(state, ownerSlot, actualDamage);
    }

    return actualDamage;
  }

  triggerDeathrattles(state, slot, dyingMinions) {
    const player = state[slot];
    for (const minion of dyingMinions) {
      // 添加到墓地
      player.runtime.graveyard.push({
        name: minion.name,
        sourceId: minion.sourceId,
        instanceId: minion.instanceId,
        attack: minion.attack,
        health: minion.maxHealth || minion.health,
        keywords: minion.keywords || [],
      });
      const deathrattleEffects = (minion.effects || []).filter(e => e.trigger === 'deathrattle');
      if (deathrattleEffects.length > 0) {
        this.log(state, `${minion.name} 的亡语触发`);
        // 亡语效果以死亡的随从拥有者作为 actor
        this.applyEffects(state, deathrattleEffects, slot, null, { trigger: 'deathrattle', sourceCard: minion });
      }
    }
  }

  processBoardDeaths(state, slot) {
    const survivors = [];
    const deadMinions = [];
    for (const minion of state[slot].board) {
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
        this.log(state, `${minion.name} 触发了复生，以 1 点生命重新站起`);
      } else {
        deadMinions.push(minion);
      }
    }
    state[slot].board = survivors;
    // 触发亡语（在随从被移除前）
    if (deadMinions.length > 0) {
      this.triggerDeathrattles(state, slot, deadMinions);
    }
  }

  processAllDeaths(state) {
    this.processBoardDeaths(state, 'player1');
    this.processBoardDeaths(state, 'player2');
    state.player1.board = this.cleanDeadMinions(state.player1.board);
    state.player2.board = this.cleanDeadMinions(state.player2.board);
  }

  drawCards(player, amount = 1) {
    let drawn = 0;
    for (let index = 0; index < amount; index++) {
      if (player.deck.length <= 0 || player.hand.length >= 10) break;
      player.hand.push(player.deck.shift());
      drawn++;
    }
    return drawn;
  }

  getEffectiveCardCost(player, card) {
    const baseCost = Math.max(0, Number(card?.cost) || 0);
    const modifier = card?.costModifier;
    const runtime = player.runtime || {};
    let cost = baseCost;
    if (modifier) {
      let progress = 0;
      if (modifier.rule === 'missingHealth') progress = Math.max(0, 30 - player.health);
      if (modifier.rule === 'selfDamageThisGame') progress = runtime.selfDamageThisGame || 0;
      if (modifier.rule === 'healthChangedThisTurn' || modifier.rule === 'healthChangedThisGame') {
        progress = runtime.healthChangesThisGame ?? runtime.healthChangesThisTurn ?? 0;
      }
      cost = Math.max(Number(modifier.minimum) || 0, baseCost - progress * (Number(modifier.amountPer) || 1));
    }
    // 对手法术税
    if (card?.type === 'spell' && (runtime.spellTax || 0) > 0) {
      cost += runtime.spellTax;
    }
    return Math.max(0, cost);
  }

  addCardToHand(player, cardId, options = {}) {
    const source = this.getCardsLookup()[cardId];
    if (!source || player.hand.length >= 10) return false;
    player.hand.push({
      ...structuredClone(source),
      instanceId: this.generateUid(`card-${source.id}`),
      temporary: options.temporary === true,
    });
    return true;
  }

  advanceQuestline(state, actorSlot, amount) {
    const player = state[actorSlot];
    const opponent = state[this.getOpponentSlot(actorSlot)];
    const quest = player.runtime?.questline;
    if (!quest || quest.completed || amount <= 0) return;
    quest.progress += amount;
    while (!quest.completed && quest.progress >= quest.thresholds[quest.stage]) {
      quest.progress -= quest.thresholds[quest.stage];
      quest.stage += 1;
      if (quest.stage < quest.thresholds.length) {
        // 使用每阶段独立的奖励值（如果有）
        const stageReward = (quest.stages && quest.stages[quest.stage - 1])
          ? quest.stages[quest.stage - 1]
          : { rewardDamage: quest.rewardDamage, damageTarget: 'enemyHero', damageLifesteal: false };
        const rd = Number(stageReward.rewardDamage) || 0;
        const dmgTarget = stageReward.damageTarget || 'enemyHero';
        const dmgLifesteal = stageReward.damageLifesteal === true;

        // 伤害奖励
        if (rd > 0) {
          if (dmgTarget === 'enemyHero') {
            this.dealDamage(opponent, rd);
          } else if (dmgTarget === 'friendlyHero') {
            this.dealDamage(player, rd);
          }
          // 吸血：同时治疗己方英雄
          if (dmgLifesteal) {
            const before = player.health;
            player.health = Math.min(30, player.health + rd);
            if (player.health !== before) this.recordHeroHealthChange(state, player);
          }
        }
        this.log(state, `${player.heroName} 完成任务线第 ${quest.stage} 阶段`);
      } else {
        quest.completed = true;
        this.addCardToHand(player, quest.finalRewardCardId || 'hs-67547');
        this.log(state, `${player.heroName} 完成任务线，获得枯萎化身塔姆辛`);
      }
    }
  }

  applySelfDamage(state, actorSlot, amount) {
    const player = state[actorSlot];
    const opponent = state[this.getOpponentSlot(actorSlot)];
    const numericAmount = Math.max(0, Number(amount) || 0);
    if (!numericAmount) return;
    if (player.runtime?.redirectSelfDamage) {
      this.dealDamage(opponent, numericAmount);
      // 伤害虽已转移，但本次自伤的计数仍要累加（治疗石、任务进度等依赖此计数）
      player.runtime.selfDamageThisTurn += numericAmount;
      player.runtime.selfDamageThisGame += numericAmount;
      player.runtime.damageTakenThisTurn += numericAmount;
      this.advanceQuestline(state, actorSlot, numericAmount);
      this.log(state, `${player.heroName} 将 ${numericAmount} 点自伤转移给对手`);
      return;
    }
    this.dealDamageToHero(state, player, numericAmount);
    player.runtime.selfDamageThisTurn += numericAmount;
    player.runtime.selfDamageThisGame += numericAmount;
    player.runtime.damageTakenThisTurn += numericAmount;
    // healthChangesThisTurn 已在 dealDamageToHero() 中追踪
    this.advanceQuestline(state, actorSlot, numericAmount);
    this.log(state, `${player.heroName} 受到 ${numericAmount} 点自伤`);
  }

  beginTurn(state, playerId, options = {}) {
    const playerState = this.getPlayerBySocketId(state, playerId);
    if (!playerState) return { player: null, drawn: 0 };

    const { player } = playerState;
    const shouldIncreaseMana = options.increaseMana ?? true;
    const shouldDraw = options.drawCard ?? true;
    const shouldReadyBoard = options.readyBoard ?? true;
    const shouldLog = options.logTurn ?? true;

    if (shouldIncreaseMana) {
      player.maxMana = Math.min(10, player.maxMana + 1);
    }
    player.mana = player.maxMana;
    player.runtime ||= { selfDamageThisTurn: 0, selfDamageThisGame: 0, damageTakenThisTurn: 0, healthChangesThisTurn: 0, healthChangesThisGame: 0, questline: null, redirectSelfDamage: false, delayedDamage: [], graveyard: [], spellTax: 0, spellTaxTurns: 0 };
    player.runtime.healthChangesThisGame ??= player.runtime.healthChangesThisTurn || 0;
    player.runtime.selfDamageThisTurn = 0;
    player.runtime.damageTakenThisTurn = 0;
    player.runtime.healthChangesThisTurn = 0;
    // 法术税：在对手的回合应生效，回合结束时清理
    // 不在此处清理，在 executeEndTurn 中处理
    for (const delayed of player.runtime.delayedDamage || []) {
      if (delayed.turnsRemaining > 0) {
        this.applySelfDamage(state, playerState.slot, delayed.amount);
        delayed.turnsRemaining -= 1;
      }
    }
    player.runtime.delayedDamage = (player.runtime.delayedDamage || []).filter((entry) => entry.turnsRemaining > 0);

    const drawn = shouldDraw ? this.drawCards(player, 1) : 0;

    if (shouldReadyBoard) {
      for (const minion of player.board) {
        resetMinionForTurn(minion);
      }
    }

    if (shouldLog) {
      this.log(state, `第 ${state.turn} 回合开始，${player.heroName} 的回合`);
      if (drawn > 0) {
        this.log(state, `${player.heroName} 抽了 ${drawn} 张牌`);
      }
    }

    return { player, drawn };
  }

  // 验证出牌操作
  validatePlayCard(state, playerId, payload) {
    const playerState = this.getPlayerBySocketId(state, playerId);
    if (!playerState) return { valid: false, reason: 'Player not found' };

    const { player, slot } = playerState;
    if (!player) return { valid: false, reason: 'Player not found' };

    const card = player.hand.find(c => c.instanceId === payload.cardInstanceId);
    if (!card) return { valid: false, reason: 'Card not in hand' };
    if (this.getEffectiveCardCost(player, card) > player.mana) return { valid: false, reason: 'Not enough mana' };
    if (card.type === 'minion' && player.board.length >= 7) {
      return { valid: false, reason: 'Board is full' };
    }

    const targetRef = this.normalizeTargetRef(payload.targetRef);

    // 检查是否需要目标（法术 + 有目标战吼的随从）
    const needsTarget = this.cardNeedsExplicitTarget(card);
    if (needsTarget && !targetRef) {
      return { valid: false, reason: 'Target required' };
    }

    if (targetRef) {
      const targetValid = this.spellTargetMatchesAnyEffect(state, card.effects, slot, targetRef);
      if (!targetValid) {
        return { valid: false, reason: 'Invalid target' };
      }
    }

    // 法术和随从的战吼都需要目标验证（已在上面处理）
    if (card.type === 'spell') {
      // 法术额外验证已在上面的通用验证完成
    }

    return { valid: true, card, player, slot, targetRef };
  }

  // 验证攻击操作
  validateAttack(state, playerId, payload) {
    const playerState = this.getPlayerBySocketId(state, playerId);
    if (!playerState) return { valid: false, reason: 'Player not found' };

    const { player, slot } = playerState;
    if (!player) return { valid: false, reason: 'Player not found' };

    const attacker = player.board.find(m => m.instanceId === payload.attackerId);
    if (!attacker) return { valid: false, reason: 'Attacker not found' };
    if (!attacker.canAttack) return { valid: false, reason: 'Already attacked' };
    if (attacker.sleeping) return { valid: false, reason: 'Minion is sleeping' };

    const targetRef = this.normalizeTargetRef(payload.targetRef);
    if (!targetRef) return { valid: false, reason: 'No target' };
    if (!this.isValidAttackTargetRef(state, targetRef, slot)) {
      return { valid: false, reason: 'Invalid target' };
    }

    return { valid: true, attacker, player, slot, targetRef };
  }

  // 验证攻击目标引用
  isValidAttackTargetRef(state, targetRef, attackerSlot) {
    const normalizedTargetRef = this.normalizeTargetRef(targetRef);
    if (!normalizedTargetRef) return false;
    return this.canAttackTarget(state, attackerSlot, normalizedTargetRef);
  }

  // 处理出牌
  executePlayCard(state, playerId, payload) {
    const validation = this.validatePlayCard(state, playerId, payload);
    if (!validation.valid) return { success: false, reason: validation.reason };

    const { card, player, slot, targetRef } = validation;

    // 消耗法力
    player.mana -= this.getEffectiveCardCost(player, card);

    // 从手牌移除
    player.hand = player.hand.filter(c => c.instanceId !== card.instanceId);

    if (card.type === 'minion') {
      // 召唤随从
      const minion = this.createMinionInstance(card, slot);
      player.board.push(minion);
      this.log(state, `${player.heroName} 召唤了 ${card.name}`);
      this.applyEffects(state, card.effects, slot, targetRef, { trigger: 'battlecry', sourceCard: card });
    } else {
      // 使用法术
      this.log(state, `${player.heroName} 施放了 ${card.name}`);
      this.applyEffects(state, card.effects, slot, targetRef, { trigger: 'onPlay', sourceCard: card });
    }

    // 检查胜负
    if (this.checkGameOver(state)) {
      return { success: true, gameOver: true };
    }

    return { success: true, gameOver: false };
  }

  // 处理攻击
  executeAttack(state, playerId, payload) {
    const validation = this.validateAttack(state, playerId, payload);
    if (!validation.valid) return { success: false, reason: validation.reason };

    const { attacker, slot, targetRef } = validation;
    const targetSlot = targetRef.side;
    const targetPlayer = state[targetSlot];

    attacker.sleeping = false;

    if (targetRef.kind === 'hero') {
      // 攻击英雄
      const damage = this.dealDamageToHero(state, targetPlayer, attacker.attack, slot, attacker);
      consumeMinionAttack(attacker);
      this.log(state, `${attacker.name} 攻击了 ${targetPlayer.heroName}，造成 ${damage} 点伤害`);
    } else {
      // 攻击随从
      const target = targetPlayer.board.find(m => m.instanceId === targetRef.minionId);
      if (target) {
        this.dealDamageToMinion(state, target, attacker.attack, slot, attacker);
        this.dealDamageToMinion(state, attacker, target.attack, targetSlot, target);
        consumeMinionAttack(attacker);
        this.log(state, `${attacker.name} 与 ${target.name} 交战`);

        // 清理死亡随从
        this.processAllDeaths(state);
      }
    }

    // 检查胜负
    if (this.checkGameOver(state)) {
      return { success: true, gameOver: true };
    }

    return { success: true, gameOver: false };
  }

  // 结束回合
  executeEndTurn(state, playerId) {
    const playerState = this.getPlayerBySocketId(state, playerId);
    if (!playerState) return { success: false, reason: 'Player not found' };

    const { player } = playerState;
    if (!player) return { success: false, reason: 'Player not found' };

    const temporaryCount = player.hand.filter((card) => card.temporary).length;
    if (temporaryCount > 0) {
      player.hand = player.hand.filter((card) => !card.temporary);
      this.log(state, `${player.heroName} 的 ${temporaryCount} 张临时牌已消失`);
    }

    // 清理法术税（本方回合结束，对手施加的法术税到期）
    player.runtime.spellTaxTurns = Math.max(0, (player.runtime.spellTaxTurns || 0) - 1);
    if (player.runtime.spellTaxTurns === 0) {
      player.runtime.spellTax = 0;
    }

    const opponent = this.getOpponent(state, playerId);

    // 切换活跃玩家
    state.activePlayerId = opponent.socketId;
    state.turn++;

    // 清除选中状态
    state.selectedAttacker = null;
    state.pendingSpell = null;
    this.beginTurn(state, opponent.socketId, {
      increaseMana: true,
      drawCard: true,
      readyBoard: true,
      logTurn: true
    });

    return { success: true, gameOver: false };
  }

  describeTarget(state, targetRef) {
    const targetEntity = this.getTargetEntity(state, targetRef);
    if (!targetEntity) return '目标';
    return targetRef.kind === 'hero' ? targetEntity.heroName : targetEntity.name;
  }

  resolveEffectTargetRef(effect, actorSlot, primaryTarget = null) {
    const opponentSlot = this.getOpponentSlot(actorSlot);
    const normalizedPrimary = this.normalizeTargetRef(primaryTarget);

    switch (effect.target) {
      case 'samePrimary':
      case 'playerChoice':
        return normalizedPrimary;
      case 'enemyHero':
        return { side: opponentSlot, kind: 'hero' };
      case 'friendlyHero':
        return { side: actorSlot, kind: 'hero' };
      case 'enemyMinion':
        if (normalizedPrimary?.kind === 'minion' && normalizedPrimary.side === opponentSlot) {
          return normalizedPrimary;
        }
        return null;
      case 'friendlyMinion':
        if (normalizedPrimary?.kind === 'minion' && normalizedPrimary.side === actorSlot) {
          return normalizedPrimary;
        }
        return null;
      default:
        if (effect.type === 'damage') {
          return { side: opponentSlot, kind: 'hero' };
        }
        return { side: actorSlot, kind: 'hero' };
    }
  }

  // 应用效果
  applyEffects(state, effects, actorSlot, primaryTarget = null, context = { trigger: 'onPlay', sourceCard: null }) {
    const actorPlayer = state[actorSlot];

    for (const effect of effects || []) {
      if (effect.trigger && effect.trigger !== (context.trigger || 'onPlay')) continue;

      if (effect.type === 'conditional') {
        // 条件效果简化处理
        const controlsMinion = actorPlayer.board.length > 0;
        const controlsNoMinion = !controlsMinion;

        if (effect.condition === 'controlsMinion' && controlsMinion) {
          this.applyEffects(state, effect.effects, actorSlot, primaryTarget, context);
        }
        if (effect.condition === 'controlsNoMinion' && controlsNoMinion) {
          this.applyEffects(state, effect.effects, actorSlot, primaryTarget, context);
        }
        continue;
      }

      if (effect.type === 'questline') {
        const thresholds = Array.isArray(effect.thresholds) && effect.thresholds.length ? effect.thresholds.map(Number) : [12, 12, 12];
        // 支持每阶段独立的 stages 数组
        const stages = Array.isArray(effect.stages) && effect.stages.length
          ? effect.stages.map(s => ({
              threshold: Number(s.threshold) || 12,
              rewardDamage: Number(s.rewardDamage) || 0,
              damageTarget: s.damageTarget || 'enemyHero',
              damageLifesteal: s.damageLifesteal === true,
            }))
          : thresholds.map(t => ({
              threshold: t,
              rewardDamage: Number(effect.rewardDamage) || 0,
              damageTarget: 'enemyHero',
              damageLifesteal: (Number(effect.rewardDamage) || 0) > 0,
            }));
        actorPlayer.runtime.questline = {
          thresholds,
          stages,
          stage: 0,
          progress: 0,
          finalRewardCardId: effect.finalRewardCardId || 'hs-67547',
          completed: false,
        };
        this.log(state, `${actorPlayer.heroName} 开启了任务线”恶魔之种”`);
        continue;
      }

      if (effect.type === 'selfDamage') {
        this.applySelfDamage(state, actorSlot, effect.amount);
        continue;
      }

      if (effect.type === 'redirectSelfDamage') {
        actorPlayer.runtime.redirectSelfDamage = true;
        this.log(state, `${actorPlayer.heroName} 获得枯萎化身效果`);
        continue;
      }

      if (effect.type === 'delayedSelfDamage') {
        actorPlayer.runtime.delayedDamage.push({ amount: Number(effect.amount) || 0, turnsRemaining: Number(effect.turns) || 0 });
        continue;
      }

      if (effect.type === 'shuffleCopies' && context.sourceCard) {
        const amount = Math.max(0, Number(effect.amount) || 0);
        for (let index = 0; index < amount; index += 1) {
          actorPlayer.deck.push({ ...structuredClone(context.sourceCard), instanceId: this.generateUid(`card-${context.sourceCard.id}`), temporary: false });
        }
        actorPlayer.deck = this.shuffle(actorPlayer.deck);
        continue;
      }

      if (effect.type === 'restoreDamageThisTurn') {
        const before = actorPlayer.health;
        actorPlayer.health = Math.min(30, actorPlayer.health + (actorPlayer.runtime.damageTakenThisTurn || 0));
        if (actorPlayer.health !== before) this.recordHeroHealthChange(state, actorPlayer);
        continue;
      }

      if (effect.type === 'discoverFromDeck') {
        const index = actorPlayer.deck.findIndex((card) => !effect.excludeSelf || card.id !== context.sourceCard?.id);
        if (index >= 0 && actorPlayer.hand.length < 10) {
          const [card] = actorPlayer.deck.splice(index, 1);
          actorPlayer.hand.push({ ...card, temporary: effect.temporary === true });
        }
        continue;
      }

      if (effect.type === 'returnDeadFriendlyMinions') {
        const amount = Math.max(1, Number(effect.amount) || 1);
        const graveyard = actorPlayer.runtime.graveyard || [];
        let returned = 0;
        for (let i = graveyard.length - 1; i >= 0 && returned < amount; i--) {
          if (actorPlayer.hand.length >= 10) break;
          const dead = graveyard[i];
          actorPlayer.hand.push({
            instanceId: this.generateUid(`returned-${dead.sourceId}`),
            sourceId: dead.sourceId,
            name: dead.name,
            cost: 0,
            type: 'minion',
            attack: dead.attack,
            health: dead.health,
            keywords: dead.keywords || [],
            text: '',
            effects: [],
            mechanics: [],
          });
          graveyard.splice(i, 1);
          returned++;
        }
        if (returned > 0) {
          this.log(state, `${actorPlayer.heroName} 将 ${returned} 个死亡的友方随从移回手牌`);
        }
        continue;
      }

      if (effect.type === 'destroyFriendlyAndRandomEnemies') {
        const opponent = state[this.getOpponentSlot(actorSlot)];
        const friendlyCount = actorPlayer.board.length;
        for (const minion of actorPlayer.board) {
          minion.health = 0;
        }
        for (let i = 0; i < friendlyCount; i++) {
          const aliveEnemies = opponent.board.filter(m => m.health > 0);
          if (aliveEnemies.length === 0) break;
          const target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
          target.health = 0;
          this.log(state, `${target.name} 被火焰之灾祸消灭`);
        }
        this.processAllDeaths(state);
        this.log(state, `${actorPlayer.heroName} 施放了火焰之灾祸`);
        continue;
      }

      if (effect.type === 'grantKeyword') {
        const keyword = effect.keyword;
        if (!keyword) continue;
        let targetBoard;
        if (effect.target === 'otherFriendlyMinions') {
          targetBoard = actorPlayer.board.filter(m => m.instanceId !== (context.sourceCard?.instanceId));
        } else {
          targetBoard = actorPlayer.board;
        }
        for (const minion of targetBoard) {
          if (minion.health <= 0) continue;
          const kw = minion.keywords || [];
          if (!kw.includes(keyword)) {
            const wasSleeping = minion.sleeping;
            minion.keywords = [...kw, keyword];
            // Rush: 只有原本在沉睡（本回合刚召唤）的随从才设为可攻击但不能打英雄
            if (keyword === 'rush') {
              minion.sleeping = false;
              const runtime = createMinionRuntimeState(minion.keywords, {
                sleeping: false,
                attacksThisTurn: minion.attacksThisTurn ?? 0,
              });
              // 之前回合就在场的随从保留完整攻击权限
              if (!wasSleeping) {
                runtime.canAttack = true;
              }
              Object.assign(minion, runtime);
            } else {
              const runtime = createMinionRuntimeState(minion.keywords, {
                sleeping: minion.sleeping,
                attacksThisTurn: minion.attacksThisTurn,
              });
              Object.assign(minion, runtime);
            }
          }
        }
        this.log(state, `${actorPlayer.heroName} 的随从获得了${keyword}`);
        continue;
      }

      if (effect.type === 'repeatAoeWhileMinionDies') {
        const amount = Number(effect.amount) || 1;
        let keepGoing = true;
        let iterations = 0;
        const maxIterations = 100;
        while (keepGoing && iterations < maxIterations) {
          keepGoing = false;
          iterations++;
          const allMinions = [...state.player1.board, ...state.player2.board];
          for (const minion of allMinions) {
            if (minion.health <= 0) continue;
            const before = minion.health;
            this.dealDamageToMinion(state, minion, amount);
            if (minion.health <= 0 && before > 0) keepGoing = true;
          }
          this.processAllDeaths(state);
        }
        this.log(state, `${actorPlayer.heroName} 的亵渎触发了 ${iterations} 次`);
        continue;
      }

      if (effect.type === 'swapHandWithDeckBottom') {
        const handSize = actorPlayer.hand.length;
        const bottomCards = actorPlayer.deck.splice(Math.max(0, actorPlayer.deck.length - handSize), handSize);
        const oldHand = [...actorPlayer.hand];
        actorPlayer.hand = bottomCards;
        actorPlayer.deck.push(...oldHand);
        this.log(state, `${actorPlayer.heroName} 将手牌与牌库底交换`);
        continue;
      }

      if (effect.type === 'opponentSpellTax') {
        const opponent = state[this.getOpponentSlot(actorSlot)];
        opponent.runtime.spellTax = (opponent.runtime.spellTax || 0) + (Number(effect.amount) || 0);
        opponent.runtime.spellTaxTurns = Number(effect.turns) || 1;
        this.log(state, `对手下回合法术消耗增加 ${opponent.runtime.spellTax} 点`);
        continue;
      }

      if (effect.type === 'adjacentChainDamage') {
        const normalizedTarget = this.normalizeTargetRef(primaryTarget);
        if (!normalizedTarget || normalizedTarget.kind !== 'minion') continue;
        const board = state[normalizedTarget.side].board;
        const startIndex = board.findIndex((minion) => minion.instanceId === normalizedTarget.minionId);
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
            direction = 'right';
          }
        }
        if (direction === 'right' && !hasRight && hasLeft) direction = 'left';
        if (direction === 'left' && !hasLeft && hasRight) direction = 'right';

        let amount = Math.max(1, Number(effect.amount) || 1);
        if (direction === 'left') {
          for (let index = startIndex; index >= 0; index -= 1) {
            this.dealDamageToMinion(state, board[index], amount);
            amount += Number(effect.step) || 1;
          }
        } else {
          for (let index = startIndex; index < board.length; index += 1) {
            this.dealDamageToMinion(state, board[index], amount);
            amount += Number(effect.step) || 1;
          }
        }
        this.processAllDeaths(state);
        this.log(state, `${actorPlayer.heroName} 触发了多米诺效应`);
        continue;
      }

      if (effect.type === 'destroy') {
        const targetRef = this.resolveEffectTargetRef(effect, actorSlot, primaryTarget);
        const targetEntity = this.getTargetEntity(state, targetRef);
        if (!targetRef || targetRef.kind !== 'minion' || !targetEntity) continue;
        targetEntity.health = 0;
        this.processAllDeaths(state);
        this.log(state, `${actorPlayer.heroName} 消灭了一个随从`);
        continue;
      }

      if (effect.type === 'restoreMana') {
        if (effect.condition === 'heroDamagedThisTurn' && (actorPlayer.runtime?.damageTakenThisTurn || 0) <= 0) continue;
        actorPlayer.mana = Math.min(actorPlayer.maxMana, actorPlayer.mana + (Number(effect.amount) || 0));
        continue;
      }

      if (effect.type === 'setNextHeroPowerCost') {
        actorPlayer.runtime.nextHeroPowerCost = Math.max(0, Number(effect.amount) || 0);
        continue;
      }

      if (effect.type === 'damage') {
        const targetRef = this.resolveEffectTargetRef(effect, actorSlot, primaryTarget);
        const targetEntity = this.getTargetEntity(state, targetRef);
        if (!targetRef || !targetEntity) continue;
        const amount = Number(effect.amount) || 0;
        if (targetRef.kind === 'hero') {
          const actualDamage = this.dealDamageToHero(state, targetEntity, amount);
          this.log(
            state,
            `${actorPlayer.heroName} 的法术对 ${targetEntity.heroName} 造成了 ${actualDamage} 点伤害`
          );
        } else {
          this.dealDamageToMinion(state, targetEntity, amount);
          this.log(state, `${this.describeTarget(state, targetRef)} 受到了 ${amount} 点伤害`);
          this.processAllDeaths(state);
        }
        continue;
      }

      if (effect.type === 'heal') {
        const targetRef = this.resolveEffectTargetRef(effect, actorSlot, primaryTarget);
        const targetEntity = this.getTargetEntity(state, targetRef);
        if (!targetRef || !targetEntity) continue;
        const maxHealth = targetEntity.maxHealth || 30;
        const before = targetEntity.health;
        targetEntity.health = Math.min(maxHealth, targetEntity.health + (Number(effect.amount) || 0));
        const amount = targetEntity.health - before;
        if (targetRef.side === actorSlot && targetRef.kind === 'hero' && amount > 0) {
          this.recordHeroHealthChange(state, actorPlayer);
        }
        this.log(state, `${this.describeTarget(state, targetRef)} 恢复了 ${amount} 点生命值`);
        continue;
      }

      if (effect.type === 'armor') {
        const targetRef = this.resolveEffectTargetRef(effect, actorSlot, primaryTarget);
        const targetEntity = this.getTargetEntity(state, targetRef);
        if (!targetRef || !targetEntity || targetRef.kind !== 'hero') continue;
        const amount = Number(effect.amount) || 0;
        targetEntity.armor += amount;
        this.log(state, `${targetEntity.heroName} 获得了 ${amount} 点护甲`);
        continue;
      }

      if (effect.type === 'draw') {
        const targetRef = this.resolveEffectTargetRef(effect, actorSlot, primaryTarget);
        const targetEntity = this.getTargetEntity(state, targetRef);
        if (!targetRef || !targetEntity || targetRef.kind !== 'hero') continue;
        const targetPlayer = state[targetRef.side];
        const amount = Number(effect.amount) || 0;
        let drawn = 0;
        for (let i = 0; i < amount; i++) {
          if (targetPlayer.deck.length > 0 && targetPlayer.hand.length < 10) {
            const drawnCard = targetPlayer.deck.shift();
            targetPlayer.hand.push({ ...drawnCard, temporary: effect.temporary === true });
            drawn++;
          }
        }
        if (drawn > 0) {
          this.log(state, `${targetPlayer.heroName} 抽了 ${drawn} 张牌`);
        }
        continue;
      }

      if (effect.type === 'summon' && effect.target === 'friendlyBoard') {
        const amount = Number(effect.amount) || 1;
        const minionSpec = effect.minion || { name: 'Token', attack: 1, health: 1 };

        let summoned = 0;
        for (let i = 0; i < amount; i++) {
          if (actorPlayer.board.length < 7) {
            const minion = this.createMinionInstance(minionSpec, actorSlot);
            minion.sleeping = true;
            minion.canAttack = false;
            actorPlayer.board.push(minion);
            summoned++;
          }
        }
        if (summoned > 0) {
          this.log(state, `${actorPlayer.heroName} 召唤了 ${summoned} 个 ${minionSpec.name}`);
        }
        continue;
      }

      if (effect.type === 'buff' && effect.target === 'friendlyMinions') {
        const attackBonus = Number(effect.attack) || 0;
        const healthBonus = Number(effect.health) || 0;

        for (const minion of actorPlayer.board) {
          minion.attack += attackBonus;
          minion.health += healthBonus;
          minion.maxHealth += healthBonus;
        }
        this.log(state, `${actorPlayer.heroName} 的随从获得了 +${attackBonus}/+${healthBonus}`);
        continue;
      }
    }
  }

  // 检查游戏结束
  checkGameOver(state) {
    if (state.player1.health <= 0) {
      state.winnerId = state.player2.socketId;
      state.phase = 'ended';
      this.log(state, `${state.player2.heroName} 获胜！`);
      return true;
    }

    if (state.player2.health <= 0) {
      state.winnerId = state.player1.socketId;
      state.phase = 'ended';
      this.log(state, `${state.player1.heroName} 获胜！`);
      return true;
    }

    return false;
  }

  // 处理玩家操作
  processAction(room, playerId, action) {
    const state = room.gameState;

    // 验证是当前行动玩家
    if (state.activePlayerId !== playerId) {
      return { valid: false, reason: 'Not your turn', room };
    }

    // 验证游戏未结束
    if (state.phase === 'ended') {
      return { valid: false, reason: 'Game is over', room };
    }

    let result;

    switch (action.type) {
      case ActionTypes.PLAY_CARD:
        result = this.executePlayCard(state, playerId, action.payload || {});
        break;

      case ActionTypes.ATTACK:
        result = this.executeAttack(state, playerId, action.payload || {});
        break;

      case ActionTypes.END_TURN:
        result = this.executeEndTurn(state, playerId);
        break;

      default:
        return { valid: false, reason: 'Unknown action type', room };
    }

    if (!result.success) {
      return { valid: false, reason: result.reason, room };
    }

    return {
      valid: true,
      state,
      gameOver: result.gameOver,
      room
    };
  }
}
