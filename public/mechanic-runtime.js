// 运行时状态管理 — 每方独立维护
// ================================================================

export function createPlayerRuntime() {
  return {
    cardsPlayedThisTurn: [],
    spellsPlayedThisTurn: [],
    minionsDiedThisTurn: [],
    damageTakenThisTurn: 0,
    healingDoneThisTurn: 0,
    turnNumber: 0,
  };
}

export function createCardInstance(cardData, turnNumber) {
  return {
    ...cardData,
    instanceId: cardData.instanceId || '',
    enteredHandTurn: turnNumber,
    drawnTurn: turnNumber,
    infusedCount: 0,
    forged: false,
    corrupted: false,
    temporaryUntilTurn: null,
  };
}

export function markCardEnteredHand(cardInstance, currentTurn) {
  cardInstance.enteredHandTurn = currentTurn;
}

export function clearTurnState(runtime) {
  runtime.cardsPlayedThisTurn = [];
  runtime.spellsPlayedThisTurn = [];
  runtime.minionsDiedThisTurn = [];
  runtime.damageTakenThisTurn = 0;
  runtime.healingDoneThisTurn = 0;
}

export function recordCardPlayed(runtime, card) {
  runtime.cardsPlayedThisTurn.push({
    instanceId: card.instanceId,
    sourceId: card.id || card.sourceId,
    type: card.type,
    spellSchool: card.spellSchool || null,
    tribes: card.tribes || [],
  });
  if (card.type === 'spell') {
    runtime.spellsPlayedThisTurn.push(card.instanceId);
  }
}

export function recordMinionDied(runtime, minion) {
  runtime.minionsDiedThisTurn.push({
    instanceId: minion.instanceId,
    sourceId: minion.id || minion.sourceId,
  });
}

export function recordDamageTaken(runtime, amount) {
  runtime.damageTakenThisTurn += amount;
}

export function recordHealingDone(runtime, amount) {
  runtime.healingDoneThisTurn += amount;
}

// ── 腐蚀 ────────────────────────────────────────────────────
// 手牌中带有 corrupt 的卡牌，当打出费用更高的牌时变为"已腐蚀"。
// 比较双方当前实时费用（playedEffectiveCost），而非原始 card.cost。
// getEffectiveCost 用于计算手牌中腐蚀牌的当前费用（含减费效果）。
export function checkAndApplyCorruption({ playedCard, playedEffectiveCost, hand, getEffectiveCost }) {
  if (!hand?.length) return;
  const playedCost = playedEffectiveCost ?? (playedCard.cost || 0);
  for (const card of hand) {
    if (card.instanceId === playedCard.instanceId) continue;
    if ((card.mechanics || []).includes('corrupt') && !card.corrupted) {
      const corruptCardCost = getEffectiveCost ? getEffectiveCost(card) : (card.cost || 0);
      if (playedCost > corruptCardCost) {
        card.corrupted = true;
      }
    }
  }
}
