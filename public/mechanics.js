// 统一卡牌状态评估 — 所有系统共用
import {
  checkQuickdraw, checkCombo, checkOutcast, checkFinale,
  checkManathirst,
} from './mechanic-conditions.js';

const MECH_DEFS = {
  quickdraw: { name: '快枪', fn: checkQuickdraw },
  combo: { name: '连击', fn: checkCombo },
  outcast: { name: '流放', fn: checkOutcast },
  finale: { name: '压轴', fn: checkFinale },
  manathirst: { name: '法力渴求', fn: checkManathirst },
  spellburst: { name: '法术迸发', fn: () => false },
  frenzy: { name: '暴怒', fn: () => false },
  honorableKill: { name: '荣誉消灭', fn: () => false },
  overheal: { name: '过量治疗', fn: () => false },
  corrupt: { name: '腐蚀', fn: (card) => card.corrupted === true },
};

export function evaluateCardPlayState(card, side, state, options = {}) {
  const {
    hand = [], currentTurn = 1, currentMana = 0, maxMana = 0,
    phase = 'player', busy = false, gameOver = false, maxBoardSize = 7,
    effectiveCost,
  } = options;

  const cost = effectiveCost !== undefined ? effectiveCost : (card.cost || 0);
  const runtime = options.runtime || { cardsPlayedThisTurn: [], spellsPlayedThisTurn: [], damageTakenThisTurn: 0 };

  const result = {
    playable: false, reason: '',
    activeMechanics: [], inactiveMechanics: [],
    effectiveCost: cost, visualState: 'is-locked',
  };

  if (phase !== 'player' || busy || gameOver) { result.reason = '不是你的回合'; return result; }
  if (cost > currentMana) { result.reason = '法力不足'; return result; }
  if (card.type === 'minion' && (options.boardSize || 0) >= maxBoardSize) { result.reason = '场地已满'; return result; }
  if (options.needsTarget && !options.availableTargets) { result.reason = '没有合法目标'; return result; }
  if (options.requiresDeadFriendlyMinion && !options.hasDeadFriendlyMinion) { result.reason = '没有友方随从死亡过'; return result; }
  if (options.minionOnlyTarget && !options.totalBoardMinions) { result.reason = '场上没有随从'; return result; }

  result.playable = true;
  result.visualState = 'is-playable';

  // 检查机制（仅手牌可评估的机制进入 active/inactive）
  const HAND_EVAL_MECHANICS = new Set(['quickdraw','combo','outcast','finale','manathirst','corrupt']);
  const mechanics = card.mechanics || [];
  for (const mech of mechanics) {
    const def = MECH_DEFS[mech];
    if (!def || !HAND_EVAL_MECHANICS.has(mech)) continue;
    let active = false;
    if (mech === 'quickdraw') active = def.fn(card, currentTurn);
    else if (mech === 'combo') active = def.fn(runtime);
    else if (mech === 'outcast') active = def.fn(card, hand);
    else if (mech === 'finale') active = def.fn(cost, currentMana);
    else if (mech === 'manathirst') active = def.fn(maxMana, card.manathirstThreshold || 5);
    else if (mech === 'corrupt') active = def.fn(card);

    if (active) result.activeMechanics.push(mech);
    else result.inactiveMechanics.push(mech);
  }
  if (result.activeMechanics.length > 0 && result.playable) {
    result.visualState = 'is-trigger-ready';
  }

  return result;
}

export function getActiveMechanicLabels(card, hand, runtime, currentTurn, currentMana, maxMana) {
  const r = { playable: true, activeMechanics: [], inactiveMechanics: [], visualState: 'is-playable', effectiveCost: card.cost || 0, reason: '' };
  const HAND_EVAL_MECHANICS = new Set(['quickdraw','combo','outcast','finale','manathirst','corrupt']);
  const mechanics = card.mechanics || [];
  for (const mech of mechanics) {
    const def = MECH_DEFS[mech];
    if (!def || !HAND_EVAL_MECHANICS.has(mech)) continue;
    let active = false;
    if (mech === 'quickdraw') active = def.fn(card, currentTurn);
    else if (mech === 'combo') active = def.fn(runtime);
    else if (mech === 'outcast') active = def.fn(card, hand);
    else if (mech === 'finale') active = def.fn(card.cost || 0, currentMana);
    else if (mech === 'manathirst') active = def.fn(maxMana, card.manathirstThreshold || 5);
    else if (mech === 'corrupt') active = def.fn(card);
    if (active) r.activeMechanics.push(mech);
    else r.inactiveMechanics.push(mech);
  }
  return r.activeMechanics.map(m => MECH_DEFS[m]?.name || m);
}
