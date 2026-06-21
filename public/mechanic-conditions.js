// 机制条件判断 — 独立模块，所有系统共用
// ================================================================

// 快枪 Quickdraw：本回合进入手牌
export function checkQuickdraw(cardInstance, currentTurn) {
  return cardInstance.enteredHandTurn === currentTurn;
}

// 连击 Combo：本回合此前使用过其他牌
export function checkCombo(runtime) {
  return runtime.cardsPlayedThisTurn.length >= 1;
}

// 流放 Outcast：处于手牌最左或最右
export function checkOutcast(cardInstance, handArray) {
  if (!handArray || handArray.length === 0) return false;
  if (handArray.length === 1) return true;
  const index = handArray.findIndex(c => c.instanceId === cardInstance.instanceId);
  return index === 0 || index === handArray.length - 1;
}

// 压轴 Finale：打出后恰好用光剩余法力
export function checkFinale(cardEffectiveCost, currentMana) {
  return cardEffectiveCost === currentMana;
}

// 法力渴求 Manathirst：达到指定最大法力水晶数
export function checkManathirst(maxMana, threshold) {
  return maxMana >= threshold;
}

// 手中有龙 HoldingDragon
export function checkHoldingDragon(hand, selfInstanceId) {
  return hand.some(c => c.instanceId !== selfInstanceId && (c.tribes || []).includes('dragon'));
}

// 本回合打过龙 Kindred
export function checkKindredDragon(runtime) {
  return runtime.cardsPlayedThisTurn.some(c => (c.tribes || []).includes('dragon'));
}

// 已受伤 Damaged
export function checkDamaged(entity) {
  return entity.health < (entity.maxHealth || entity.health);
}

// 英雄本回合受过伤害
export function checkHeroDamagedThisTurn(runtime) {
  return runtime.damageTakenThisTurn > 0;
}

// 法术迸发 Spellburst：本回合施放过法术
export function checkSpellburst(runtime) {
  return runtime.spellsPlayedThisTurn.length >= 1;
}

// 狂乱 Frenzy：受到伤害后存活且未触发过
export function checkFrenzy(minion) {
  return checkDamaged(minion) && !minion._frenzyTriggered;
}

// 荣誉消灭 Honorable Kill：造成的伤害恰好等于目标生命
export function checkHonorableKill(damageDealt, targetHealth) {
  return damageDealt === targetHealth;
}

// 过量治疗 Overheal：治疗量超过目标缺失生命
export function checkOverheal(healAmount, missingHealth) {
  return healAmount > missingHealth;
}
