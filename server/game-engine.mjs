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

    return this.shuffle(expanded);
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
        board: []
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
        board: []
      },

      actionLog: [],
      pendingSpell: null,
      selectedAttacker: null
    };

    // 先手玩家抽3张，后手玩家抽4张
    const firstPlayer = firstPlayerIsHost ? state.player1 : state.player2;
    const firstPlayerId = firstPlayer.socketId;
    const secondPlayer = firstPlayerIsHost ? state.player2 : state.player1;

    for (let i = 0; i < 3; i++) {
      if (firstPlayer.deck.length > 0) {
        firstPlayer.hand.push(firstPlayer.deck.shift());
      }
    }
    for (let i = 0; i < 4; i++) {
      if (secondPlayer.deck.length > 0) {
        secondPlayer.hand.push(secondPlayer.deck.shift());
      }
    }

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

    const opponentSlot = this.getOpponentSlot(actorSlot);
    switch (effect.target) {
      case 'playerChoice':
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
    return hero.health - before;
  }

  dealDamageToHero(state, targetHero, amount, ownerSlot = null, source = null) {
    if (amount <= 0) return 0;
    this.dealDamage(targetHero, amount);
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

  processBoardDeaths(state, slot) {
    const survivors = [];
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
      }
    }
    state[slot].board = survivors;
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
    if (card.cost > player.mana) return { valid: false, reason: 'Not enough mana' };
    if (card.type === 'minion' && player.board.length >= 7) {
      return { valid: false, reason: 'Board is full' };
    }

    const targetRef = this.normalizeTargetRef(payload.targetRef);

    if (card.type === 'spell') {
      if (this.cardNeedsExplicitTarget(card) && !targetRef) {
        return { valid: false, reason: 'Target required' };
      }

      if (targetRef && !this.spellTargetMatchesAnyEffect(state, card.effects, slot, targetRef)) {
        return { valid: false, reason: 'Invalid target' };
      }
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
    player.mana -= card.cost;

    // 从手牌移除
    player.hand = player.hand.filter(c => c.instanceId !== card.instanceId);

    if (card.type === 'minion') {
      // 召唤随从
      const minion = this.createMinionInstance(card, slot);
      player.board.push(minion);
      this.log(state, `${player.heroName} 召唤了 ${card.name}`);
    } else {
      // 使用法术
      this.log(state, `${player.heroName} 施放了 ${card.name}`);
      this.applyEffects(state, card.effects, slot, targetRef);
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
  applyEffects(state, effects, actorSlot, primaryTarget = null) {
    const actorPlayer = state[actorSlot];

    for (const effect of effects || []) {
      if (effect.type === 'conditional') {
        // 条件效果简化处理
        const controlsMinion = actorPlayer.board.length > 0;
        const controlsNoMinion = !controlsMinion;

        if (effect.condition === 'controlsMinion' && controlsMinion) {
          this.applyEffects(state, effect.effects, actorSlot, primaryTarget);
        }
        if (effect.condition === 'controlsNoMinion' && controlsNoMinion) {
          this.applyEffects(state, effect.effects, actorSlot, primaryTarget);
        }
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
            targetPlayer.hand.push(targetPlayer.deck.shift());
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
