// 编辑器模型转换 — 独立可测试模块
import { normalizeKeywords } from './keywords.js';

const KNOWN_MECHANICS = ['quickdraw','combo','outcast','finale','manathirst','spellburst','frenzy','honorableKill','overheal','corrupt','battlecry','deathrattle','questline','tradeable','temporary','discover','questReward'];

function normalizeMechanics(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : String(input).split(/[,\s，、]+/).filter(Boolean);
  return [...new Set(arr.filter(m => KNOWN_MECHANICS.includes(m)))];
}

// ── 附效结构定义 ──────────────────────────────────────────
export const BONUS_EFFECT_TYPES = ['damage','heal','armor','draw','summon','buffSelf'];

export function createEmptyBonusEffect(type = 'damage') {
  return { type, target: 'playerChoice', amount: 1 };
}

// ── 提取结构化编辑模型 ─────────────────────────────────────
export function extractStructuredEffects(card) {
  const groupsByTrigger = new Map();
  const unhandled = [];
  const handled = new WeakSet();

  function ensureGroup(trigger) {
    const key = trigger || 'onPlay';
    if (!groupsByTrigger.has(key)) groupsByTrigger.set(key, createEmptyEffectGroup(key));
    return groupsByTrigger.get(key);
  }

  for (const effect of (card.effects || [])) {
    if (effect.type === 'conditional') {
      for (const sub of (effect.effects || [])) {
        const grp = ensureGroup(sub.trigger || effect.trigger || 'onPlay');
        grp.condition = effect.condition || '';
        mergeEffectIntoGroup(grp, sub);
        handled.add(sub);
      }
      handled.add(effect);
      continue;
    }
    const trigger = effect.trigger || 'onPlay';
    const grp = ensureGroup(trigger);
    mergeEffectIntoGroup(grp, effect);
    handled.add(effect);
  }

  for (const effect of (card.effects || [])) {
    if (!handled.has(effect)) unhandled.push(clone(effect));
  }

  const triggerOrder = ['onPlay','battlecry','deathrattle'];
  const triggerGroups = triggerOrder
    .filter(t => groupsByTrigger.has(t))
    .map(t => groupsByTrigger.get(t));

  return {
    keywords: normalizeKeywords(card.keywords),
    mechanics: normalizeMechanics(card.mechanics || []),
    bonusMechanicEffects: clone(card.bonusMechanicEffects || {}),
    manathirstThreshold: card.manathirstThreshold ?? 5,
    questlineEnabled: !!(card.effects || []).some(e => e.type === 'questline'),
    questStages: (card.effects || []).filter(e => e.type === 'questline').map(e => ({
      threshold: (e.thresholds || [12])[0] || 12,
      rewardDamage: e.rewardDamage || 0,
      damageTarget: 'enemyHero',
      damageLifesteal: (e.rewardDamage || 0) > 0,
    })),
    questFinalReward: (card.effects || []).find(e => e.type === 'questline')?.finalRewardCardId || 'hs-67547',
    costRule: card.costModifier?.rule || '',
    costMinimum: card.costModifier?.minimum || 0,
    triggerGroups,
    extraEffects: unhandled,
  };
}

// ── 从编辑器模型构建卡牌数据 ────────────────────────────────
export function editorModelToCard(model, card) {
  const effects = [];
  for (const group of (model.triggerGroups || [])) {
    const groupEffects = groupToEffects(group);
    if (groupEffects.length > 0) {
      if (group.condition) {
        effects.push({ type: 'conditional', condition: group.condition, effects: groupEffects.map(e => ({ ...e, trigger: e.trigger || group.trigger })) });
      } else {
        effects.push(...groupEffects.map(e => ({ ...e, trigger: e.trigger || group.trigger })));
      }
    }
  }
  for (const extra of (model.extraEffects || [])) {
    if (!effects.some(e => e.type === extra.type && JSON.stringify(e) === JSON.stringify(extra))) {
      effects.push(clone(extra));
    }
  }
  const questEffects = effects.filter(e => e.type === 'questline');
  if (!model.questlineEnabled) {
    for (const q of questEffects) effects.splice(effects.indexOf(q), 1);
  }

  card.effects = effects;
  card.keywords = card.type === 'minion' ? normalizeKeywords(model.keywords) : [];
  card.mechanics = [...(model.mechanics || [])];
  card.bonusMechanicEffects = clone(model.bonusMechanicEffects || {});
  if (card.mechanics.includes('manathirst')) {
    card.manathirstThreshold = model.manathirstThreshold ?? 5;
  } else {
    delete card.manathirstThreshold;
  }
  if (model.costRule) {
    card.costModifier = { rule: model.costRule, amount: 1, minimum: model.costMinimum || 0 };
  } else {
    delete card.costModifier;
  }
  return card;
}

// ── 机制类型限制 ──────────────────────────────────────────
// 仅允许在特定卡牌类型上的机制（结算触发类必须在场上）
export const MECHANIC_TYPE_RESTRICTIONS = {
  spellburst: ['minion'],       // 法术迸发：随从在场，法术触发
  frenzy: ['minion'],           // 暴怒：随从受伤触发
  overheal: ['minion'],         // 过量治疗：随从被治疗触发
  honorableKill: ['minion', 'spell'],  // 荣誉消灭：随从攻击或法术伤害
};

// ── 类型清理 ──────────────────────────────────────────────

export function cleanFieldsForType(cardType, model) {
  if (cardType === 'spell') {
    model.keywords = [];
    model.mechanics = (model.mechanics || []).filter(m => {
      // 移除仅限随从的结算触发机制
      const allowed = MECHANIC_TYPE_RESTRICTIONS[m];
      if (allowed) return allowed.includes(cardType);
      return m !== 'battlecry' && m !== 'deathrattle';
    });
    // 同时清除不合法机制的 bonusMechanicEffects
    const legalMechanics = new Set(model.mechanics);
    if (model.bonusMechanicEffects) {
      for (const key of Object.keys(model.bonusMechanicEffects)) {
        if (!legalMechanics.has(key)) delete model.bonusMechanicEffects[key];
      }
    }
    for (const group of (model.triggerGroups || [])) {
      if (group.trigger === 'battlecry' || group.trigger === 'deathrattle') group.trigger = 'onPlay';
    }
  }
  return model;
}

// ── 辅助函数 ──────────────────────────────────────────────

function clone(v) {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

function createEmptyEffectGroup(trigger = 'onPlay') {
  return {
    trigger,
    condition: '',
    selfDamage: 0, damage: 0, damageTarget: 'enemyHero',
    heal: 0, armor: 0, draw: 0, summonCount: 0,
    summonName: '', summonAttack: 1, summonHealth: 1, summonKeywords: [],
    buffAttack: 0, buffHealth: 0,
    delayedSelfDamage: 0, delayedTurns: 0, shuffleCopies: 0,
    chainDamage: 0, chainDamageStep: 1, chainDirection: 'random',
    extra: [],
  };
}

function mergeEffectIntoGroup(group, effect) {
  if (effect.type === 'selfDamage') group.selfDamage = Number(effect.amount) || 0;
  else if (effect.type === 'damage') { group.damage = Number(effect.amount) || 0; group.damageTarget = effect.target || 'enemyHero'; }
  else if (effect.type === 'heal') group.heal = Number(effect.amount) || 0;
  else if (effect.type === 'armor') group.armor = Number(effect.amount) || 0;
  else if (effect.type === 'draw') group.draw = Number(effect.amount) || 0;
  else if (effect.type === 'summon') {
    group.summonCount = Number(effect.amount) || 0;
    group.summonName = effect.minion?.name || '';
    group.summonAttack = effect.minion?.attack || 1;
    group.summonHealth = effect.minion?.health || 1;
    group.summonKeywords = normalizeKeywords(effect.minion?.keywords);
  }
  else if (effect.type === 'adjacentChainDamage') { group.chainDamage = Number(effect.amount) || 0; group.chainDamageStep = Number(effect.step) || 1; group.chainDirection = effect.direction || 'random'; }
  else if (effect.type === 'delayedSelfDamage') { group.delayedSelfDamage = Number(effect.amount) || 0; group.delayedTurns = Number(effect.turns) || 0; }
  else if (effect.type === 'shuffleCopies') group.shuffleCopies = Number(effect.amount) || 0;
  else { group.extra.push(clone(effect)); return; }
}

function groupToEffects(group) {
  const effects = [];
  if (group.selfDamage) effects.push({ type: 'selfDamage', amount: group.selfDamage });
  if (group.damage) effects.push({ type: 'damage', target: group.damageTarget || 'enemyHero', amount: group.damage });
  if (group.heal) effects.push({ type: 'heal', target: 'friendlyHero', amount: group.heal });
  if (group.armor) effects.push({ type: 'armor', target: 'friendlyHero', amount: group.armor });
  if (group.draw) effects.push({ type: 'draw', target: 'friendlyHero', amount: group.draw });
  if (group.summonCount) {
    effects.push({
      type: 'summon', target: 'friendlyBoard', amount: group.summonCount,
      minion: { name: group.summonName || 'Token', attack: group.summonAttack || 1, health: group.summonHealth || 1, keywords: group.summonKeywords || [] },
    });
  }
  if (group.chainDamage) effects.push({ type: 'adjacentChainDamage', target: 'playerChoice', targetKinds: ['minion'], amount: group.chainDamage, step: group.chainDamageStep, direction: group.chainDirection || 'random' });
  if (group.delayedSelfDamage) effects.push({ type: 'delayedSelfDamage', amount: group.delayedSelfDamage, turns: group.delayedTurns || 1 });
  if (group.shuffleCopies) effects.push({ type: 'shuffleCopies', amount: group.shuffleCopies });
  for (const extra of (group.extra || [])) effects.push(clone(extra));
  return effects;
}
