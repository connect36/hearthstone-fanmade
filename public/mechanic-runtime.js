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
