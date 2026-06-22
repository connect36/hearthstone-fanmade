import { cards as baseCards, currentDeckCollection, starterDeck } from './game-data.js';
import {
  applyCardOverrides,
  clearCardOverrides,
  saveCardOverrides,
} from './card-overrides.js';
import { buildKeywordText, normalizeKeywords, summarizeKeywords } from './keywords.js';
import { extractStructuredEffects, editorModelToCard, cleanFieldsForType, BONUS_EFFECT_TYPES, createEmptyBonusEffect, MECHANIC_TYPE_RESTRICTIONS } from './editor-model.js';

const deckCountMap = Object.fromEntries(starterDeck.map((entry) => [entry.cardId, entry.count]));

// ── DOM 元素引用 ──────────────────────────────────────────────

const elements = {
  cardList: document.getElementById('card-list'),
  editorTitle: document.getElementById('editor-title'),
  editorStatus: document.getElementById('editor-status'),
  form: document.getElementById('card-form'),
  fieldId: document.getElementById('field-id'),
  fieldName: document.getElementById('field-name'),
  fieldCost: document.getElementById('field-cost'),
  fieldType: document.getElementById('field-type'),
  fieldEnabled: document.getElementById('field-enabled'),
  fieldDeckCount: document.getElementById('field-deck-count'),
  fieldAutoText: document.getElementById('field-auto-text'),
  // 随从专属
  minionFields: document.getElementById('minion-fields'),
  fieldAttack: document.getElementById('field-attack'),
  fieldHealth: document.getElementById('field-health'),
  fieldKeywords: [...document.querySelectorAll('input[name="keywords"]')],
  // 手动机制选择
  fieldMechanics: [...document.querySelectorAll('input[name="mechanics"]')],
  fieldManathirstThreshold: document.getElementById('field-manathirst-threshold'),
  mechanicBonusFields: document.getElementById('mechanic-bonus-fields'),
  bonusEffectsContainer: document.getElementById('bonus-effects-container'),
  mechanicTypeHint: document.getElementById('mechanic-type-hint'),
  // 派生机制徽章
  derivedMechanics: document.getElementById('derived-mechanics'),
  // 任务线
  questlineFields: document.getElementById('questline-fields'),
  fieldQuestlineEnabled: document.getElementById('field-questline-enabled'),
  questStagesContainer: document.getElementById('quest-stages-container'),
  addQuestStageButton: document.getElementById('add-quest-stage-button'),
  // 动态费用
  fieldCostRule: document.getElementById('field-cost-rule'),
  fieldCostMinimum: document.getElementById('field-cost-minimum'),
  // 效果组
  effectGroupsContainer: document.getElementById('effect-groups-container'),
  addEffectGroupButton: document.getElementById('add-effect-group-button'),
  // 高级 JSON
  fieldEffects: document.getElementById('field-effects'),
  // 文本
  fieldText: document.getElementById('field-text'),
  // 预览
  previewCard: document.getElementById('preview-card'),
  previewJson: document.getElementById('preview-json'),
  // 按钮
  saveCardButton: document.getElementById('save-card-button'),
  resetCardButton: document.getElementById('reset-card-button'),
  applyAllButton: document.getElementById('apply-all-button'),
  resetAllButton: document.getElementById('reset-all-button'),
  newSpellButton: document.getElementById('new-spell-button'),
  newMinionButton: document.getElementById('new-minion-button'),
  loadQuestlineDeckButton: document.getElementById('load-questline-deck-button'),
};

// ── 工具函数 ──────────────────────────────────────────────────

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function toNumber(value, fallback = 0) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readKeywordCheckboxes(inputs) {
  return normalizeKeywords(
    inputs.filter((input) => input.checked).map((input) => input.value)
  );
}

function writeKeywordCheckboxes(inputs, keywords) {
  const active = new Set(normalizeKeywords(keywords));
  for (const input of inputs) {
    input.checked = active.has(input.value);
  }
}

function readThresholds(value) {
  return String(value || '')
    .split(/[,，\s]+/)
    .map((entry) => toNumber(entry))
    .filter((entry) => entry > 0);
}

function normalizeCard(card) {
  return {
    ...clone(card),
    keywords: normalizeKeywords(card.keywords),
    mechanics: normalizeMechanics(card.mechanics),
    enabled: card.enabled !== false,
    deckCount: Number.isFinite(card.deckCount) ? card.deckCount : deckCountMap[card.id] ?? 0,
    autoText: card.autoText ?? !card.dbfId,
  };
}

const KNOWN_MECHANICS = ['quickdraw','combo','outcast','finale','manathirst','spellburst','frenzy','honorableKill','overheal','corrupt','battlecry','deathrattle','questline','tradeable','temporary','discover','questReward'];

function normalizeMechanics(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : String(input).split(/[,\s，、]+/).filter(Boolean);
  return [...new Set(arr.filter(m => KNOWN_MECHANICS.includes(m)))];
}

// ── mechanics 标签 ──────────────────────────────────────────
const MECHANIC_LABELS = {
  battlecry: '战吼', deathrattle: '亡语', questline: '任务线',
  tradeable: '可交易', temporary: '临时牌', discover: '发现',
  lifesteal: '吸血', questReward: '任务奖励',
  quickdraw: '快枪', combo: '连击', outcast: '流放', finale: '压轴', manathirst: '法力渴求',
  spellburst: '法术迸发', frenzy: '暴怒', honorableKill: '荣誉消灭', overheal: '过量治疗', corrupt: '腐蚀',
};

// ── Toast 通知 ────────────────────────────────────────────────

function showToast(message, success = false) {
  const existing = document.querySelector('.editor-toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'editor-toast' + (success ? ' is-success' : '');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── 状态 ──────────────────────────────────────────────────────

const state = {
  cards: applyCardOverrides(baseCards).map((card) => {
    const normalized = normalizeCard(card);
    normalized.editorModel = clone(card.editorModel || extractStructuredEffects(normalized));
    return normalized;
  }),
  selectedId: '',
  previousType: '', // 追踪上一次卡牌类型，用于切换清理
};

const requestedCardId = new URLSearchParams(window.location.search).get('card');
if (requestedCardId && state.cards.some((card) => card.id === requestedCardId)) {
  state.selectedId = requestedCardId;
}

function setStatus(text) {
  elements.editorStatus.textContent = text;
}

function selectedCard() {
  return state.cards.find((card) => card.id === state.selectedId) || null;
}

// ── 效果组默认值 ──────────────────────────────────────────────

function createEmptyEffectGroup(trigger = 'onPlay') {
  return {
    trigger,
    selfDamage: 0,
    damage: 0, damageTarget: 'enemyHero',
    heal: 0,
    armor: 0,
    draw: 0,
    summonCount: 0, summonName: '', summonAttack: 1, summonHealth: 1, summonKeywords: [],
    buffAttack: 0, buffHealth: 0,
    delayedSelfDamage: 0, delayedTurns: 0,
    shuffleCopies: 0,
    // 多米诺效应 — 连锁伤害
    chainDamage: 0, chainDamageStep: 1, chainDirection: 'random',
    condition: '', conditionType: '', conditionTarget: 'enemyHero', conditionAmount: 0,
  };
}

function createDefaultEditorModel(cardType) {
  return {
    keywords: [],
    questlineEnabled: false,
    questStages: [
      { threshold: 12, rewardDamage: 3, damageTarget: 'enemyHero', damageLifesteal: true },
      { threshold: 12, rewardDamage: 3, damageTarget: 'enemyHero', damageLifesteal: true },
      { threshold: 12, rewardDamage: 0, damageTarget: 'enemyHero', damageLifesteal: false },
    ],
    questFinalReward: 'hs-67547',
    costRule: '',
    costMinimum: 0,
    triggerGroups: [createEmptyEffectGroup(cardType === 'minion' ? 'battlecry' : 'onPlay')],
    extraEffects: [],
  };
}

function createEmptyQuestStage() {
  return {
    threshold: 12,
    rewardDamage: 0, damageTarget: 'enemyHero', damageLifesteal: false,
  };
}

// ── mechanics 处理 ──────────────────────────────────────────

function deriveMechanicsFromCard(card, existingMechanics = []) {
  const derived = new Set();

  // 从 effects 派生
  for (const effect of (card.effects || [])) {
    if (effect.trigger === 'battlecry') derived.add('battlecry');
    if (effect.trigger === 'deathrattle') derived.add('deathrattle');
    if (effect.type === 'questline') derived.add('questline');
    if (effect.type === 'discoverFromDeck' || effect.type === 'discover') derived.add('discover');
    if (effect.temporary === true) derived.add('temporary');
    if (effect.type === 'redirectSelfDamage') derived.add('questReward');
  }

  // 从 draw 效果中的 temporary 派生
  for (const effect of (card.effects || [])) {
    if (effect.type === 'draw' && effect.temporary === true) derived.add('temporary');
    if (effect.type === 'tradeable' || effect.mechanic === 'tradeable') derived.add('tradeable');
  }

  // 从关键词派生（如 minion 的 lifesteal 关键词应反映在 mechanics）
  for (const kw of normalizeKeywords(card.keywords)) {
    if (kw === 'lifesteal') derived.add('lifesteal');
  }

  // 保留已有的已知 mechanics 值（即使未从 effects 派生出来）
  // 这防止 lifesteal、questReward、tradeable 等在保存时丢失
  for (const m of (existingMechanics || [])) {
    if (MECHANIC_LABELS[m] && !derived.has(m)) {
      derived.add(m);
    }
  }

  return [...derived];
}

function updateDerivedMechanicsDisplay(model, card) {
  const mechanics = card.mechanics || [];
  const container = elements.derivedMechanics;
  if (!container) return;

  const badges = container.querySelectorAll('.mechanic-badge');
  for (const badge of badges) {
    const mechanic = badge.dataset.mechanic;
    if (mechanics.includes(mechanic)) {
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }
}


// ── 任务线阶段 DOM 渲染 ──────────────────────────────────────

const TARGET_OPTIONS = [
  ['enemyHero', '敌方英雄'], ['friendlyHero', '己方英雄'],
  ['enemyMinion', '敌方随从'], ['friendlyMinion', '己方随从'],
];

function targetSelectHTML(className, selected, stageIndex) {
  return `<select class="${className}" data-stage-index="${stageIndex}">
    ${TARGET_OPTIONS.map(([val, label]) =>
      `<option value="${val}" ${val === selected ? 'selected' : ''}>${label}</option>`
    ).join('')}
  </select>`;
}

function buildQuestStageHTML(stage, index, totalStages) {
  const isLast = index === totalStages - 1;
  const removeBtn = totalStages > 2
    ? `<button type="button" class="remove-stage-button" data-stage-index="${index}">✕</button>`
    : '';

  return `
    <div class="quest-stage" data-stage-index="${index}">
      <div class="quest-stage-header">
        <span class="group-label">${isLast ? `阶段 ${index + 1}（最终）` : `阶段 ${index + 1}`}</span>
        ${removeBtn}
      </div>
      <div class="quest-stage-body">
        <label>
          <span>任务需求（伤害量）</span>
          <input type="number" class="stage-threshold" data-stage-index="${index}" value="${stage.threshold || 12}" min="1" max="99" />
        </label>
        ${isLast ? `
        <label class="form-span">
          <span>最终奖励牌 ID</span>
          <input type="text" id="field-quest-final-reward" class="stage-final-reward" value="${stage._finalReward || 'hs-67547'}" placeholder="hs-67547" />
        </label>
        ` : `
        <label>
          <span>奖励伤害</span>
          <input type="number" class="stage-reward-damage" data-stage-index="${index}" value="${stage.rewardDamage || 0}" min="0" max="99" />
        </label>
        <label>
          <span>伤害目标</span>
          ${targetSelectHTML('stage-damage-target', stage.damageTarget || 'enemyHero', index)}
        </label>
        <label class="form-span">
          <label class="keyword-option" style="display:inline-flex;align-items:center;gap:6px">
            <input type="checkbox" class="stage-damage-lifesteal" data-stage-index="${index}" ${stage.damageLifesteal ? 'checked' : ''} />
            <span style="color:var(--text)">吸血（伤害同时治疗己方英雄等量生命）</span>
          </label>
        </label>
        `}
      </div>
    </div>`;
}

function renderQuestStages(model) {
  const container = elements.questStagesContainer;
  if (!container) return;
  const stages = model.questStages || [];
  // 把 finalReward 存到最后一个 stage 上方便渲染
  const stagesWithFinal = stages.map((s, i) => {
    if (i === stages.length - 1) {
      return { ...s, _finalReward: model.questFinalReward || 'hs-67547' };
    }
    return s;
  });
  container.innerHTML = stagesWithFinal.map((s, i) => buildQuestStageHTML(s, i, stages.length)).join('');
}

function readQuestStagesFromDOM() {
  const stageEls = elements.questStagesContainer.querySelectorAll('.quest-stage');
  const stages = [];
  for (const el of stageEls) {
    const threshold = parseInt(el.querySelector('.stage-threshold')?.value, 10) || 12;
    const rewardDamage = parseInt(el.querySelector('.stage-reward-damage')?.value, 10) || 0;
    const damageTarget = el.querySelector('.stage-damage-target')?.value || 'enemyHero';
    const damageLifesteal = el.querySelector('.stage-damage-lifesteal')?.checked || false;
    stages.push({ threshold, rewardDamage, damageTarget, damageLifesteal });
  }
  return stages;
}

function readQuestFinalRewardFromDOM() {
  const el = document.getElementById('field-quest-final-reward');
  return el ? el.value.trim() || 'hs-67547' : 'hs-67547';
}

// ── 效果组 DOM 渲染模板 ──────────────────────────────────────

function buildEffectGroupHTML(group, index, totalGroups, cardType) {
  const triggerOpts = cardType === 'spell'
    ? '<option value="onPlay">使用时</option>'
    : '<option value="onPlay">使用时</option><option value="battlecry">战吼</option><option value="deathrattle">亡语</option>';

  const selectedTrigger = (['onPlay', 'battlecry', 'deathrattle'].includes(group.trigger))
    ? group.trigger : 'onPlay';

  const removeBtn = totalGroups > 1
    ? `<button type="button" class="remove-group-button" data-group-index="${index}">✕ 移除此组</button>`
    : '';

  return `
    <div class="effect-group" data-group-index="${index}">
      <div class="effect-group-header">
        <span class="group-label">效果组 ${index + 1}</span>
        <select class="group-trigger" data-group-index="${index}">
          ${triggerOpts.replace(`value="${selectedTrigger}"`, `value="${selectedTrigger}" selected`)}
        </select>
        ${removeBtn}
      </div>
      <div class="effect-group-body">
        <label>
          <span>对己方英雄造成伤害</span>
          <input type="number" class="group-self-damage" data-group-index="${index}" value="${group.selfDamage || 0}" min="0" max="99" />
        </label>
        <label>
          <span>伤害量</span>
          <input type="number" class="group-damage" data-group-index="${index}" value="${group.damage || 0}" min="0" max="99" />
        </label>
        <label>
          <span>伤害目标</span>
          <select class="group-damage-target" data-group-index="${index}">
            ${['enemyHero','enemyMinion','friendlyHero','friendlyMinion','playerChoice'].map(t =>
              `<option value="${t}" ${group.damageTarget === t ? 'selected' : ''}>${
                {enemyHero:'敌方英雄',enemyMinion:'敌方随从',friendlyHero:'己方英雄',friendlyMinion:'己方随从',playerChoice:'由玩家决定'}[t]
              }</option>`
            ).join('')}
          </select>
        </label>
        <label>
          <span>治疗量</span>
          <input type="number" class="group-heal" data-group-index="${index}" value="${group.heal || 0}" min="0" max="99" />
        </label>
        <label>
          <span>护甲量</span>
          <input type="number" class="group-armor" data-group-index="${index}" value="${group.armor || 0}" min="0" max="99" />
        </label>
        <label>
          <span>抽牌量</span>
          <input type="number" class="group-draw" data-group-index="${index}" value="${group.draw || 0}" min="0" max="20" />
        </label>
        <label>
          <span>延迟自伤：每次伤害</span>
          <input type="number" class="group-delayed-damage" data-group-index="${index}" value="${group.delayedSelfDamage || 0}" min="0" max="99" />
        </label>
        <label>
          <span>延迟自伤：持续回合</span>
          <input type="number" class="group-delayed-turns" data-group-index="${index}" value="${group.delayedTurns || 0}" min="0" max="20" />
        </label>
        <label>
          <span>洗入本牌复制数量</span>
          <input type="number" class="group-shuffle-copies" data-group-index="${index}" value="${group.shuffleCopies || 0}" min="0" max="20" />
        </label>
        <label>
          <span>连锁伤害（多米诺效应）</span>
          <input type="number" class="group-chain-damage" data-group-index="${index}" value="${group.chainDamage || 0}" min="0" max="99" />
        </label>
        <label>
          <span>连锁伤害递增</span>
          <input type="number" class="group-chain-step" data-group-index="${index}" value="${group.chainDamageStep || 1}" min="0" max="20" />
        </label>
        <label>
          <span>连锁方向</span>
          <select class="group-chain-direction" data-group-index="${index}">
            <option value="random" ${!group.chainDirection || group.chainDirection === 'random' ? 'selected' : ''}>随机（炉石规则）</option>
            <option value="right" ${group.chainDirection === 'right' ? 'selected' : ''}>向右</option>
            <option value="left" ${group.chainDirection === 'left' ? 'selected' : ''}>向左</option>
          </select>
        </label>
        <label>
          <span>召唤数量</span>
          <input type="number" class="group-summon-count" data-group-index="${index}" value="${group.summonCount || 0}" min="0" max="7" />
        </label>
        <label>
          <span>召唤名称</span>
          <input type="text" class="group-summon-name" data-group-index="${index}" value="${group.summonName || ''}" />
        </label>
        <label>
          <span>召唤攻击</span>
          <input type="number" class="group-summon-attack" data-group-index="${index}" value="${group.summonAttack || 1}" min="0" max="30" />
        </label>
        <label>
          <span>召唤生命</span>
          <input type="number" class="group-summon-health" data-group-index="${index}" value="${group.summonHealth || 1}" min="1" max="60" />
        </label>
        <label class="form-span">
          <span>召唤随从关键词</span>
          <div class="keyword-checkboxes summon-keywords-group" data-group-index="${index}">
            ${['taunt','rush','poisonous','divineShield','lifesteal','windfury','reborn'].map(kw => {
              const has = (group.summonKeywords || []).includes(kw);
              return `<label class="keyword-option"><input type="checkbox" name="summonKeywords-${index}" value="${kw}" ${has ? 'checked' : ''} /> ${{
                taunt:'嘲讽',rush:'突袭',poisonous:'剧毒',divineShield:'圣盾',lifesteal:'吸血',windfury:'风怒',reborn:'复生'
              }[kw]}</label>`;
            }).join('')}
          </div>
        </label>
        <label>
          <span>群体增攻</span>
          <input type="number" class="group-buff-attack" data-group-index="${index}" value="${group.buffAttack || 0}" min="0" max="20" />
        </label>
        <label>
          <span>群体增血</span>
          <input type="number" class="group-buff-health" data-group-index="${index}" value="${group.buffHealth || 0}" min="0" max="20" />
        </label>
        <label>
          <span>条件触发</span>
          <select class="group-condition" data-group-index="${index}">
            <option value="">无</option>
            <option value="controlsMinion" ${group.condition === 'controlsMinion' ? 'selected' : ''}>如果你的场上有随从</option>
            <option value="controlsNoMinion" ${group.condition === 'controlsNoMinion' ? 'selected' : ''}>如果你的场上没有随从</option>
          </select>
        </label>
        <label>
          <span>条件奖励类型</span>
          <select class="group-condition-type" data-group-index="${index}">
            <option value="">无</option>
            ${['damage','heal','armor','draw'].map(t =>
              `<option value="${t}" ${group.conditionType === t ? 'selected' : ''}>${{damage:'额外伤害',heal:'额外治疗',armor:'额外护甲',draw:'额外抽牌'}[t]}</option>`
            ).join('')}
          </select>
        </label>
        <label>
          <span>条件目标</span>
          <select class="group-condition-target" data-group-index="${index}">
            ${['enemyHero','friendlyHero','samePrimary','playerChoice'].map(t =>
              `<option value="${t}" ${group.conditionTarget === t ? 'selected' : ''}>${
                {enemyHero:'敌方英雄',friendlyHero:'己方英雄',samePrimary:'相同目标',playerChoice:'由玩家决定'}[t]
              }</option>`
            ).join('')}
          </select>
        </label>
        <label>
          <span>条件奖励值</span>
          <input type="number" class="group-condition-amount" data-group-index="${index}" value="${group.conditionAmount || 0}" min="0" max="99" />
        </label>
      </div>
    </div>`;
}

function renderEffectGroups(model, cardType) {
  const container = elements.effectGroupsContainer;
  if (!container) return;
  const groups = model.triggerGroups || [];
  container.innerHTML = groups.map((g, i) => buildEffectGroupHTML(g, i, groups.length, cardType)).join('');
}

// ── 从 DOM 读取效果组 ────────────────────────────────────────

function readEffectGroupFromDOM(groupEl) {
  const getVal = (cls) => {
    const el = groupEl.querySelector(`.${cls}`);
    return el ? el.value : '';
  };
  const getNum = (cls, fallback = 0) => toNumber(getVal(cls), fallback);

  const summonKwContainer = groupEl.querySelector('.summon-keywords-group');
  const summonKeywords = summonKwContainer
    ? normalizeKeywords(
        [...summonKwContainer.querySelectorAll('input[type="checkbox"]')]
          .filter(inp => inp.checked).map(inp => inp.value)
      )
    : [];

  return {
    trigger: getVal('group-trigger') || 'onPlay',
    selfDamage: getNum('group-self-damage'),
    damage: getNum('group-damage'),
    damageTarget: getVal('group-damage-target') || 'enemyHero',
    heal: getNum('group-heal'),
    armor: getNum('group-armor'),
    draw: getNum('group-draw'),
    summonCount: getNum('group-summon-count'),
    summonName: getVal('group-summon-name').trim(),
    summonAttack: getNum('group-summon-attack', 1),
    summonHealth: Math.max(1, getNum('group-summon-health', 1)),
    summonKeywords,
    buffAttack: getNum('group-buff-attack'),
    buffHealth: getNum('group-buff-health'),
    delayedSelfDamage: getNum('group-delayed-damage'),
    delayedTurns: getNum('group-delayed-turns'),
    shuffleCopies: getNum('group-shuffle-copies'),
    chainDamage: getNum('group-chain-damage'),
    chainDamageStep: getNum('group-chain-step', 1),
    chainDirection: getVal('group-chain-direction') || 'random',
    condition: getVal('group-condition'),
    conditionType: getVal('group-condition-type'),
    conditionTarget: getVal('group-condition-target') || 'enemyHero',
    conditionAmount: getNum('group-condition-amount'),
  };
}

function readAllEffectGroupsFromDOM() {
  const groupEls = elements.effectGroupsContainer.querySelectorAll('.effect-group');
  return [...groupEls].map(el => readEffectGroupFromDOM(el));
}

// ── 从表单读取完整模型 ──────────────────────────────────────

function readStructuredModelFromForm(extraEffects) {
  const questlineEnabled = elements.fieldQuestlineEnabled.value === 'true';
  return {
    keywords: readKeywordCheckboxes(elements.fieldKeywords),
    questlineEnabled,
    questStages: questlineEnabled ? readQuestStagesFromDOM() : [],
    questFinalReward: readQuestFinalRewardFromDOM(),
    costRule: elements.fieldCostRule.value || '',
    costMinimum: Math.max(0, toNumber(elements.fieldCostMinimum.value)),
    triggerGroups: readAllEffectGroupsFromDOM(),
    extraEffects,
  };
}

// ── 从 model 构建 effects 数组 ──────────────────────────────

function buildEffectsFromModel(cardType, model) {
  const effects = [];

  // 任务线（每阶段独立配置 + 目标 + 吸血）
  if (model.questlineEnabled && model.questStages && model.questStages.length) {
    const stages = model.questStages.map(s => ({
      threshold: s.threshold || 12,
      rewardDamage: s.rewardDamage || 0,
      damageTarget: s.damageTarget || 'enemyHero',
      damageLifesteal: s.damageLifesteal === true,
    }));
    effects.push({
      type: 'questline',
      thresholds: stages.map(s => s.threshold),
      rewardDamage: stages[0]?.rewardDamage || 0,
      rewardHeal: stages[0]?.rewardHeal || 0,
      stages,
      finalRewardCardId: model.questFinalReward || 'hs-67547',
    });
  }

  // 每个效果组
  for (const group of (model.triggerGroups || [])) {
    const trigger = group.trigger === 'onPlay' ? undefined : group.trigger;

    if (group.selfDamage > 0) {
      effects.push({
        type: 'selfDamage',
        amount: group.selfDamage,
        ...(trigger ? { trigger } : {}),
      });
    }

    if (group.delayedSelfDamage > 0 && group.delayedTurns > 0) {
      effects.push({
        type: 'delayedSelfDamage',
        amount: group.delayedSelfDamage,
        turns: group.delayedTurns,
        ...(trigger ? { trigger } : {}),
      });
    }

    if (group.shuffleCopies > 0) {
      effects.push({
        type: 'shuffleCopies',
        amount: group.shuffleCopies,
        ...(trigger ? { trigger } : {}),
      });
    }

    if (group.chainDamage > 0) {
      effects.push({
        type: 'adjacentChainDamage',
        target: 'playerChoice',
        targetKinds: ['minion'],
        amount: group.chainDamage,
        step: group.chainDamageStep || 1,
        direction: group.chainDirection || 'random',
        ...(trigger ? { trigger } : {}),
      });
    }

    if (group.damage > 0) {
      effects.push({
        type: 'damage',
        target: group.damageTarget || 'enemyHero',
        amount: group.damage,
        ...(trigger ? { trigger } : {}),
      });
    }

    if (group.heal > 0) {
      effects.push({
        type: 'heal',
        target: 'friendlyHero',
        amount: group.heal,
        ...(trigger ? { trigger } : {}),
      });
    }

    if (group.armor > 0) {
      effects.push({
        type: 'armor',
        target: 'friendlyHero',
        amount: group.armor,
        ...(trigger ? { trigger } : {}),
      });
    }

    if (group.draw > 0) {
      effects.push({
        type: 'draw',
        target: 'friendlyHero',
        amount: group.draw,
        ...(trigger ? { trigger } : {}),
      });
    }

    if (group.summonCount > 0) {
      effects.push({
        type: 'summon',
        target: 'friendlyBoard',
        amount: group.summonCount,
        minion: {
          name: group.summonName || '自定义随从',
          attack: group.summonAttack,
          health: group.summonHealth,
          keywords: group.summonKeywords,
        },
        ...(trigger ? { trigger } : {}),
      });
    }

    if (group.buffAttack > 0 || group.buffHealth > 0) {
      effects.push({
        type: 'buff',
        target: 'friendlyMinions',
        attack: group.buffAttack,
        health: group.buffHealth,
        ...(trigger ? { trigger } : {}),
      });
    }

    if (group.condition && group.conditionType && group.conditionAmount > 0) {
      effects.push({
        type: 'conditional',
        condition: group.condition,
        effects: [{
          type: group.conditionType,
          target: group.conditionTarget,
          amount: group.conditionAmount,
        }],
        ...(trigger ? { trigger } : {}),
      });
    }
  }

  // 合并 extraEffects，去重
  const existingKeys = new Set(
    effects.map(e => `${e.type}|${e.trigger || 'onPlay'}|${e.target || ''}|${e.amount || ''}`)
  );

  for (const extra of (model.extraEffects || [])) {
    const key = `${extra.type}|${extra.trigger || 'onPlay'}|${extra.target || ''}|${extra.amount || ''}`;
    if (!existingKeys.has(key)) {
      effects.push(clone(extra));
      existingKeys.add(key);
    }
  }

  return effects;
}

// ── 自动文本生成 ─────────────────────────────────────────────

function describePrimaryDamage(amount, target) {
  if (amount <= 0) return '';
  if (target === 'enemyHero') return `对敌方英雄造成 ${amount} 点伤害。`;
  if (target === 'enemyMinion') return `对一个敌方随从造成 ${amount} 点伤害。`;
  if (target === 'friendlyHero') return `对你的英雄造成 ${amount} 点伤害。`;
  if (target === 'friendlyMinion') return `对一个友方随从造成 ${amount} 点伤害。`;
  if (target === 'playerChoice') return `造成 ${amount} 点伤害。`;
  return `造成 ${amount} 点伤害。`;
}

function describeConditionalPrefix(condition) {
  if (condition === 'controlsNoMinion') return '如果你的场上没有随从，';
  if (condition === 'controlsMinion') return '如果你的场上有随从，';
  return '';
}

function describeConditionalEffect(type, amount, target) {
  if (!type || amount <= 0) return '';
  if (type === 'damage') {
    if (target === 'samePrimary') return `再对相同目标造成 ${amount} 点伤害。`;
    if (target === 'playerChoice') return `再造成 ${amount} 点伤害。`;
    if (target === 'enemyHero') return `再对敌方英雄造成 ${amount} 点伤害。`;
    return target === 'friendlyHero'
      ? `再对你的英雄造成 ${amount} 点伤害。`
      : `再造成 ${amount} 点伤害。`;
  }
  if (type === 'heal') {
    if (target === 'samePrimary') return `再为相同目标恢复 ${amount} 点生命值。`;
    return target === 'enemyHero'
      ? `再为敌方英雄恢复 ${amount} 点生命值。`
      : `再恢复 ${amount} 点生命值。`;
  }
  if (type === 'armor') {
    if (target === 'samePrimary') return `再为相同目标获得 ${amount} 点护甲。`;
    return target === 'enemyHero'
      ? `再使敌方英雄获得 ${amount} 点护甲。`
      : `再获得 ${amount} 点护甲。`;
  }
  if (type === 'draw') {
    if (target === 'samePrimary') return `再使相同目标抽 ${amount} 张牌。`;
    return target === 'enemyHero'
      ? `再使敌方抽 ${amount} 张牌。`
      : `再抽 ${amount} 张牌。`;
  }
  return '';
}

function buildGeneratedText(card, model) {
  const parts = [];

  // 随从关键词
  if (card.type === 'minion') {
    const kwText = buildKeywordText(model.keywords);
    if (kwText) parts.push(kwText);
  }

  // 任务线
  if (model.questlineEnabled && model.questStages && model.questStages.length) {
    const thresholds = model.questStages.map(s => s.threshold).join('/');
    parts.push(`任务线：在你的回合中受到 ${thresholds} 点伤害。`);

    const targetLabel = { enemyHero: '敌方英雄', friendlyHero: '己方英雄', enemyMinion: '敌方随从', friendlyMinion: '己方随从' };
    const stageDescs = model.questStages.map((s, i) => {
      const isLast = i === model.questStages.length - 1;
      if (isLast) return `最终获得${model.questFinalReward || '奖励牌'}`;
      if (s.rewardDamage > 0) {
        let dmgText = `对${targetLabel[s.damageTarget] || '敌方英雄'}造成${s.rewardDamage}点伤害`;
        if (s.damageLifesteal) dmgText += '，吸血';
        return `阶段${i+1}：${dmgText}`;
      }
      return `阶段${i+1}`;
    }).filter(Boolean);
    if (stageDescs.length) parts.push(`奖励：${stageDescs.join('；')}。`);
  }

  // 动态费用
  if (model.costRule === 'missingHealth') parts.push('你的英雄每缺失一点生命值，本牌的法力值消耗便减少（1）点。');
  if (model.costRule === 'selfDamageThisGame') parts.push('本局每在你的回合受到一点伤害，本牌的法力值消耗便减少（1）点。');
  if (model.costRule === 'healthChangedThisGame' || model.costRule === 'healthChangedThisTurn') {
    parts.push('你的英雄的生命值每在你的回合中变化一次，本牌的法力值消耗便减少（1）点。');
  }

  // 按 trigger 分组生成效果文本
  const groupsByTrigger = new Map();
  for (const group of (model.triggerGroups || [])) {
    const key = group.trigger || 'onPlay';
    if (!groupsByTrigger.has(key)) groupsByTrigger.set(key, []);
    groupsByTrigger.get(key).push(group);
  }

  const triggerLabels = { battlecry: '战吼：', deathrattle: '亡语：' };
  const triggerOrder = ['onPlay', 'battlecry', 'deathrattle'];

  for (const trigger of triggerOrder) {
    const groups = groupsByTrigger.get(trigger);
    if (!groups) continue;
    const prefix = triggerLabels[trigger] || '';

    for (const group of groups) {
      if (group.selfDamage > 0) parts.push(`${prefix}对你的英雄造成 ${group.selfDamage} 点伤害。`);
      if (group.damage > 0) parts.push(`${prefix}${describePrimaryDamage(group.damage, group.damageTarget)}`);
      if (group.heal > 0) parts.push(`${prefix}恢复 ${group.heal} 点生命值。`);
      if (group.armor > 0) parts.push(`${prefix}获得 ${group.armor} 点护甲。`);
      if (group.draw > 0) parts.push(`${prefix}抽 ${group.draw} 张牌。`);
      if (group.delayedSelfDamage > 0 && group.delayedTurns > 0) {
        parts.push(`${prefix}在下 ${group.delayedTurns} 个回合中，每回合对你的英雄造成 ${group.delayedSelfDamage} 点伤害。`);
      }
      if (group.shuffleCopies > 0) parts.push(`${prefix}将 ${group.shuffleCopies} 张本牌的复制洗入你的牌库。`);
      if (group.chainDamage > 0) {
        parts.push(`${prefix}对一个随从造成 ${group.chainDamage} 点伤害。向相邻随从重复此效果，每次伤害增加 ${group.chainDamageStep || 1} 点。`);
      }
      if (group.summonCount > 0) {
        const sKw = summarizeKeywords(group.summonKeywords);
        parts.push(`${prefix}召唤 ${group.summonCount} 个 ${group.summonAttack}/${group.summonHealth} ${group.summonName || '随从'}${sKw ? `（${sKw}）` : ''}。`);
      }
      if (group.buffAttack > 0 || group.buffHealth > 0) {
        parts.push(`${prefix}你所有随从获得 +${group.buffAttack}/+${group.buffHealth}。`);
      }
      if (group.condition && group.conditionType && group.conditionAmount > 0) {
        const condPrefix = describeConditionalPrefix(group.condition);
        const condEffect = describeConditionalEffect(group.conditionType, group.conditionAmount, group.conditionTarget);
        if (condPrefix && condEffect) {
          parts.push(`${prefix}${condPrefix}${condEffect}`);
        }
      }
    }
  }

  // 其他 trigger
  for (const [trigger, groups] of groupsByTrigger) {
    if (triggerOrder.includes(trigger)) continue;
    for (const group of groups) {
      // 简单处理：不确定的 trigger 只用基本描述
      if (group.damage > 0) parts.push(`${trigger}: ${describePrimaryDamage(group.damage, group.damageTarget)}`);
    }
  }

  return parts.join(' ');
}

function syncAutoText(card) {
  if (card.autoText === false) return card.text || '';
  const generatedText = buildGeneratedText(card, getEditorModel(card));
  card.text = generatedText;
  return generatedText;
}

// ── 类型切换时的字段清理 ────────────────────────────────────

function applyCardTypeDisables(cardType) {
  const isSpell = cardType === 'spell';
  if (elements.minionFields) {
    elements.minionFields.classList.toggle('is-disabled', isSpell);
  }
  // 禁用法术牌不能使用的结算触发机制复选框
  for (const input of elements.fieldMechanics) {
    const allowed = MECHANIC_TYPE_RESTRICTIONS[input.value];
    if (allowed) {
      input.disabled = !allowed.includes(cardType);
      if (input.disabled) input.checked = false;
    }
  }
}

// ── Schema 校验 ──────────────────────────────────────────────

function validateModel(cardType, model) {
  const errors = [];
  if (cardType === 'spell') {
    if (model.keywords.length > 0) {
      errors.push('法术牌不能有随从关键词');
    }
    for (const group of model.triggerGroups) {
      if (group.trigger === 'battlecry' || group.trigger === 'deathrattle') {
        errors.push('法术牌不能使用战吼/亡语触发器');
      }
    }
  }
  if (model.questlineEnabled && (!model.questStages || model.questStages.length < 2)) {
    errors.push('启用任务线但阶段数不足（至少需要2个阶段）');
  }
  return errors;
}

// ── 渲染 ─────────────────────────────────────────────────────

function renderList() {
  const selectedId = state.selectedId;
  elements.cardList.innerHTML = state.cards
    .map((card) => {
      const active = card.id === selectedId ? 'is-active' : '';
      const disabled = card.enabled ? '' : 'is-disabled';
      const keywordSummary = card.type === 'minion' ? summarizeKeywords(card.keywords) : '';
      const mechanicSummary = normalizeMechanics(card.mechanics)
        .map((m) => MECHANIC_LABELS[m] || m)
        .join(' · ');
      const stats = card.type === 'minion'
        ? `${card.attack}/${card.health}${keywordSummary ? ` · ${keywordSummary}` : ''}`
        : '法术';
      const status = card.enabled ? `牌组 ${card.deckCount}` : '已禁用';
      return `
        <button type="button" class="card-list-item ${active} ${disabled}" data-card-id="${card.id}">
          <strong>${card.name}</strong>
          <span class="card-list-item__meta">费用 ${card.cost} · ${stats}${mechanicSummary ? ` · ${mechanicSummary}` : ''} · ${status}</span>
        </button>`;
    })
    .join('');
}

function renderEditor() {
  const card = selectedCard();
  if (!card) return;

  const model = clone(getEditorModel(card));
  const resolvedText = syncAutoText(card);
  const isSpell = card.type === 'spell';

  elements.editorTitle.textContent = `编辑：${card.name}`;
  elements.fieldId.value = card.id;
  elements.fieldName.value = card.name || '';
  elements.fieldCost.value = String(card.cost ?? 0);
  elements.fieldType.value = card.type || 'spell';
  elements.fieldEnabled.value = String(card.enabled !== false);
  elements.fieldDeckCount.value = String(card.deckCount ?? 0);
  elements.fieldAutoText.value = String(card.autoText !== false);
  elements.fieldAttack.value = String(card.attack ?? 0);
  elements.fieldHealth.value = String(card.health ?? 1);
  writeKeywordCheckboxes(elements.fieldKeywords, model.keywords);

  // 手动机制
  const activeMechanics = new Set(model.mechanics || []);
  for (const input of elements.fieldMechanics) {
    input.checked = activeMechanics.has(input.value);
  }
  if (elements.fieldManathirstThreshold) {
    elements.fieldManathirstThreshold.value = String(model.manathirstThreshold || 5);
  }
  // 法术禁用提示：结算触发机制仅限随从
  if (elements.mechanicTypeHint) {
    const restricted = Object.entries(MECHANIC_TYPE_RESTRICTIONS)
      .filter(([, types]) => !types.includes(card.type))
      .map(([mech]) => mech);
    if (restricted.length) {
      elements.mechanicTypeHint.textContent = `法术牌不能使用以下机制（仅限随从）：${restricted.join('、')}`;
      elements.mechanicTypeHint.style.display = '';
    } else {
      elements.mechanicTypeHint.style.display = 'none';
    }
  }
  renderBonusEffectFields(model);

  // 任务线
  elements.fieldQuestlineEnabled.value = String(model.questlineEnabled);
  if (elements.questStagesContainer) {
    elements.questStagesContainer.style.display = model.questlineEnabled ? '' : 'none';
  }
  if (elements.addQuestStageButton) {
    elements.addQuestStageButton.style.display = model.questlineEnabled ? '' : 'none';
  }
  renderQuestStages(model);

  // 费用
  elements.fieldCostRule.value = model.costRule || '';
  elements.fieldCostMinimum.value = String(model.costMinimum || 0);

  // 效果组
  renderEffectGroups(model, card.type);
  applyCardTypeDisables(card.type);

  // 派生 mechanics
  updateDerivedMechanicsDisplay(model, card);

  // 高级 JSON 和文本
  elements.fieldEffects.value = JSON.stringify(model.extraEffects, null, 2);
  elements.fieldText.value = card.autoText !== false ? resolvedText : card.text || resolvedText;
  elements.fieldText.readOnly = card.autoText !== false;
}

function renderPreview() {
  const card = selectedCard();
  if (!card) return;

  const model = clone(getEditorModel(card));
  const derivedText = card.autoText !== false
    ? syncAutoText(card)
    : card.text?.trim() || buildGeneratedText(card, model);
  const effectText = derivedText ? `<div class="preview-card__text">${derivedText}</div>` : '';
  const keywordMarkup = summarizeKeywords(card.keywords)
    ? `<div class="preview-card__keywords">${normalizeKeywords(card.keywords)
        .map((kw) => `<span class="preview-card__keyword">${summarizeKeywords([kw])}</span>`)
        .join('')}</div>`
    : '';
  const statMarkup = card.type === 'minion'
    ? `<div class="preview-card__stats"><span>攻 ${card.attack}</span><span>血 ${card.health}</span></div>`
    : '';

  // 机制预览
  const mechs = (card.mechanics || []).filter(m => ['quickdraw','combo','outcast','finale','manathirst'].includes(m));
  const mechLabels = mechs.map(m => MECHANIC_LABELS[m] || m).join(' · ');
  const mechMarkup = mechLabels ? `<div class="preview-card__mechanics">${mechLabels}</div>` : '';

  // 预览切换
  const toggleEl = document.getElementById('preview-state-toggle');
  const showActive = toggleEl && toggleEl.value === 'active';
  const hasMechanics = mechs.length > 0;
  const stateClass = !hasMechanics ? '' : (showActive ? 'preview-card--ready' : 'preview-card--playable');

  elements.previewCard.innerHTML = `
    <div class="preview-card ${stateClass}">
      <span class="preview-card__cost">${card.cost}</span>
      <div class="preview-card__name">${card.name}</div>
      <div class="preview-card__meta">${card.type === 'minion' ? '随从' : '法术'} · ${card.id} · ${card.enabled ? '启用' : '禁用'} · 牌组 ${card.deckCount}</div>
      ${keywordMarkup}
      ${mechMarkup}
      ${effectText}
      ${statMarkup}
    </div>`;

  elements.previewJson.textContent = JSON.stringify(card, null, 2);
}

function render() {
  if (!state.selectedId && state.cards.length) {
    state.selectedId = state.cards[0].id;
  }
  renderList();
  renderEditor();
  renderPreview();
}

// ── 机制附效渲染（结构化） ─────────────────────────────────

function effTypeFields(mech, ef) {
  let f = '';
  if (ef.type === 'buffSelf') {
    f = `<label style="flex:1">攻<input type="number" name="bonus-attack-${mech}" value="${ef.attack||1}" min="0" max="30" style="width:48px"/></label>
         <label style="flex:1">血<input type="number" name="bonus-health-${mech}" value="${ef.health||1}" min="0" max="30" style="width:48px"/></label>`;
  } else if (ef.type === 'summon') {
    f = `<label style="flex:1">数量<input type="number" name="bonus-amount-${mech}" value="${ef.amount||1}" min="1" max="7" style="width:44px"/></label>
         <label style="flex:1">名称<input type="text" name="bonus-name-${mech}" value="${ef.minion?.name||ef.name||'Token'}" style="width:56px"/></label>
         <label style="flex:1">攻<input type="number" name="bonus-attack-${mech}" value="${ef.minion?.attack||ef.attack||1}" min="0" max="30" style="width:40px"/></label>
         <label style="flex:1">血<input type="number" name="bonus-health-${mech}" value="${ef.minion?.health||ef.health||1}" min="1" max="60" style="width:40px"/></label>`;
  } else {
    const topts = ['playerChoice','enemyHero','friendlyHero','friendlyMinion'].map(t=>`<option value="${t}" ${(ef.target||'playerChoice')===t?'selected':''}>${t}</option>`).join('');
    f = `<select name="bonus-target-${mech}" style="flex:2">${topts}</select>
         <label style="flex:1">数值<input type="number" name="bonus-amount-${mech}" value="${ef.amount||1}" min="0" max="30" style="width:48px"/></label>`;
  }
  return f;
}

function renderBonusEffectFields(model) {
  if (!elements.bonusEffectsContainer) return;
  const mlist = model.mechanics || [];
  if (mlist.length === 0) { elements.mechanicBonusFields.style.display = 'none'; return; }
  elements.mechanicBonusFields.style.display = '';
  const cur = model.bonusMechanicEffects || {};
  elements.bonusEffectsContainer.innerHTML = mlist.map(mech => {
    const ef = (cur[mech] || [{ type:'damage',target:'playerChoice',amount:1 }])[0];
    const topts = BONUS_EFFECT_TYPES.map(t => `<option value="${t}" ${ef.type===t?'selected':''}>${t}</option>`).join('');
    return `<div class="form-span" style="margin-bottom:6px;padding:6px;border:1px solid rgba(255,255,255,0.1);border-radius:6px">
      <strong>${MECHANIC_LABELS[mech]||mech}</strong>
      <div style="display:flex;gap:6px;margin-top:4px;align-items:center;flex-wrap:wrap">
        <select name="bonus-type-${mech}" style="flex:1;min-width:70px">${topts}</select>
        ${effTypeFields(mech, ef)}
      </div>
    </div>`;
  }).join('');
}

function readBonusEffectsFromForm(model) {
  const bonus = {};
  for (const mech of (model.mechanics || [])) {
    const te = document.querySelector(`select[name="bonus-type-${mech}"]`);
    if (!te) continue;
    const t = te.value;
    const ef = { type: t };
    if (t === 'buffSelf') {
      ef.attack = Number(document.querySelector(`input[name="bonus-attack-${mech}"]`)?.value) || 0;
      ef.health = Number(document.querySelector(`input[name="bonus-health-${mech}"]`)?.value) || 0;
    } else if (t === 'summon') {
      ef.amount = Number(document.querySelector(`input[name="bonus-amount-${mech}"]`)?.value) || 1;
      ef.minion = {
        name: document.querySelector(`input[name="bonus-name-${mech}"]`)?.value || 'Token',
        attack: Number(document.querySelector(`input[name="bonus-attack-${mech}"]`)?.value) || 1,
        health: Number(document.querySelector(`input[name="bonus-health-${mech}"]`)?.value) || 1,
      };
    } else {
      ef.target = document.querySelector(`select[name="bonus-target-${mech}"]`)?.value || 'playerChoice';
      ef.amount = Number(document.querySelector(`input[name="bonus-amount-${mech}"]`)?.value) || 1;
    }
    bonus[mech] = [ef, ...((model.bonusMechanicEffects||{})[mech]||[]).slice(1)];
  }
  return bonus;
}

// ── 保存逻辑 ────────────────────────────────────────────────

function updateSelectedCardFromForm() {
  const card = selectedCard();
  if (!card) return false;

  let extraEffects;
  try {
    extraEffects = JSON.parse(elements.fieldEffects.value.trim() || '[]');
    if (!Array.isArray(extraEffects)) throw new Error('Extra effects must be an array');
  } catch {
    setStatus('额外效果 JSON 无法解析');
    showToast('额外效果 JSON 无法解析');
    return false;
  }

  const oldType = card.type;
  const newType = elements.fieldType.value;

  card.name = elements.fieldName.value.trim() || card.name;
  card.cost = toNumber(elements.fieldCost.value);
  card.type = newType;
  card.enabled = elements.fieldEnabled.value === 'true';
  card.deckCount = Math.max(0, toNumber(elements.fieldDeckCount.value));
  card.autoText = elements.fieldAutoText.value === 'true';

  // 随从专属
  card.attack = toNumber(elements.fieldAttack.value);
  card.health = Math.max(1, toNumber(elements.fieldHealth.value, 1));

  // 读取新模型
  card.editorModel = readStructuredModelFromForm(extraEffects);

  // 读取手动机制
  card.editorModel.mechanics = elements.fieldMechanics.filter(i => i.checked).map(i => i.value);
  card.editorModel.manathirstThreshold = toNumber(elements.fieldManathirstThreshold?.value) || 5;
  card.editorModel.bonusMechanicEffects = readBonusEffectsFromForm(card.editorModel);

  // 使用模块化转换写入卡牌最终数据
  editorModelToCard(card.editorModel, card);

  // 类型切换清理
  if (oldType !== newType) {
    card.editorModel = cleanFieldsForType(newType, card.editorModel);
  }

  // Schema 校验
  const errors = validateModel(card.type, card.editorModel);
  if (errors.length > 0) {
    showToast(errors.join('；'));
    // 不阻止保存，但给警告
  }

  // 关键词
  card.keywords = card.type === 'minion' ? normalizeKeywords(card.editorModel.keywords) : [];

  // 构建 effects
  card.effects = buildEffectsFromModel(card.type, card.editorModel);

  // 派生 mechanics
  card.mechanics = deriveMechanicsFromCard(card, card.mechanics);

  // 费用修正
  card.costModifier = card.editorModel.costRule
    ? { rule: card.editorModel.costRule, amountPer: 1, minimum: card.editorModel.costMinimum }
    : null;

  // 自动文本
  const generatedText = buildGeneratedText(card, card.editorModel);
  if (card.autoText) {
    card.text = generatedText;
    elements.fieldText.value = generatedText;
    elements.fieldText.readOnly = true;
  } else {
    const manualText = elements.fieldText.value.trim();
    card.text = manualText || generatedText;
    elements.fieldText.readOnly = false;
  }

  return true;
}

// ── 重置 ─────────────────────────────────────────────────────

function resetCurrentCard() {
  const index = state.cards.findIndex((c) => c.id === state.selectedId);
  const base = baseCards.find((c) => c.id === state.selectedId);
  if (index < 0) return;

  if (!base) {
    state.cards.splice(index, 1);
    state.selectedId = state.cards[0]?.id || '';
    setStatus('自定义卡已删除');
    render();
    return;
  }

  const normalized = normalizeCard(base);
  normalized.editorModel = extractStructuredEffects(normalized);
  state.cards[index] = normalized;
  setStatus('这张卡已重置');
  render();
}

// ── 新建模板卡 ──────────────────────────────────────────────

function isCardIdTaken(id) {
  return state.cards.some((card) => card.id === id);
}

function createTemplateCard(type) {
  const id = `custom-${type}-${Date.now()}`;
  // 去重：如果 ID 已存在，递增时间戳直到唯一
  let candidateId = id;
  let retries = 0;
  while (isCardIdTaken(candidateId) && retries < 100) {
    candidateId = `custom-${type}-${Date.now() + retries}`;
    retries++;
  }
  if (isCardIdTaken(candidateId)) {
    showToast('无法生成唯一卡牌ID，请稍后再试');
    return;
  }
  const model = createDefaultEditorModel(type);
  const card = type === 'spell'
    ? {
        id: candidateId, name: '自定义法术', cost: 2, type: 'spell', text: '', keywords: [],
        effects: [{ type: 'damage', target: 'enemyHero', amount: 3 }],
        enabled: true, deckCount: 1, autoText: true,
        editorModel: model,
      }
    : {
        id: candidateId, name: '自定义随从', cost: 3, type: 'minion', attack: 3, health: 4,
        keywords: [], text: '', effects: [],
        enabled: true, deckCount: 1, autoText: true,
        editorModel: model,
      };

  // 确保新卡的 effects 和 editorModel 一致
  card.effects = buildEffectsFromModel(card.type, card.editorModel);
  card.mechanics = deriveMechanicsFromCard(card, []);

  state.cards.unshift(card);
  state.selectedId = card.id;
  saveCardOverrides(state.cards);
  setStatus(`已创建${type === 'spell' ? '法术' : '随从'}模板`);
  render();
}

// ── 事件绑定 ────────────────────────────────────────────────

elements.cardList.addEventListener('click', (event) => {
  const target = event.target.closest('[data-card-id]');
  if (!target) return;
  state.selectedId = target.dataset.cardId || '';
  state.previousType = '';
  setStatus('未保存');
  render();
});

elements.form.addEventListener('input', (event) => {
  // 效果组内部字段变化时，重新读取整个表单
  if (event.target.closest('.effect-group-body') || event.target.closest('.effect-group-header')) {
    handleFormMutation();
    return;
  }
  handleFormMutation();
});

elements.form.addEventListener('change', (event) => {
  handleFormMutation();
});

// 任务线：启用/禁用切换
elements.fieldQuestlineEnabled.addEventListener('change', () => {
  const enabled = elements.fieldQuestlineEnabled.value === 'true';
  if (elements.questStagesContainer) {
    elements.questStagesContainer.style.display = enabled ? '' : 'none';
  }
  if (elements.addQuestStageButton) {
    elements.addQuestStageButton.style.display = enabled ? '' : 'none';
  }
  handleFormMutation();
});

// 任务线：添加阶段
elements.addQuestStageButton.addEventListener('click', () => {
  const card = selectedCard();
  if (!card) return;
  if (!updateSelectedCardFromForm()) return;
  const model = card.editorModel;
  model.questStages.push(createEmptyQuestStage());
  model.questlineEnabled = true;
  elements.fieldQuestlineEnabled.value = 'true';
  renderEditor();
  renderPreview();
  setStatus('已添加任务阶段');
});

// 任务线：移除阶段
elements.questStagesContainer.addEventListener('click', (event) => {
  const removeBtn = event.target.closest('.remove-stage-button');
  if (!removeBtn) return;
  const index = Number(removeBtn.dataset.stageIndex);
  if (Number.isNaN(index)) return;

  const card = selectedCard();
  if (!card) return;
  if (!updateSelectedCardFromForm()) return;
  const model = card.editorModel;
  if (model.questStages.length <= 2) {
    showToast('任务线至少需要2个阶段');
    return;
  }
  model.questStages.splice(index, 1);
  renderEditor();
  renderPreview();
  setStatus('已移除任务阶段');
});

// 类型切换时清理
elements.fieldType.addEventListener('change', () => {
  const newType = elements.fieldType.value;
  const card = selectedCard();
  if (card && card.type !== newType) {
    card.type = newType;
    card.editorModel = cleanFieldsForType(newType, card.editorModel || getEditorModel(card));
  }
  handleFormMutation();
});

// 添加效果组
elements.addEffectGroupButton.addEventListener('click', () => {
  const card = selectedCard();
  if (!card) return;
  // 先同步当前表单
  if (!updateSelectedCardFromForm()) return;
  const model = card.editorModel;
  const cardType = card.type;
  model.triggerGroups.push(createEmptyEffectGroup(cardType === 'minion' ? 'battlecry' : 'onPlay'));
  renderEditor();
  renderPreview();
  setStatus('已添加效果组');
});

// 效果组容器事件委托（移除按钮）
elements.effectGroupsContainer.addEventListener('click', (event) => {
  const removeBtn = event.target.closest('.remove-group-button');
  if (!removeBtn) return;
  const index = Number(removeBtn.dataset.groupIndex);
  if (Number.isNaN(index)) return;

  const card = selectedCard();
  if (!card) return;
  if (!updateSelectedCardFromForm()) return;
  const model = card.editorModel;
  if (model.triggerGroups.length <= 1) {
    showToast('至少保留一个效果组');
    return;
  }
  model.triggerGroups.splice(index, 1);
  renderEditor();
  renderPreview();
  setStatus('已移除效果组');
});

function handleFormMutation() {
  if (!updateSelectedCardFromForm()) return;
  setStatus('编辑中');
  renderList();
  renderPreview();
}

function saveStateCards() {
  // 保存前去重，确保没有重复 ID
  const seen = new Set();
  const deduped = [];
  for (const card of state.cards) {
    if (seen.has(card.id)) {
      console.warn(`跳过重复卡牌: ${card.id} (${card.name})`);
      continue;
    }
    seen.add(card.id);
    deduped.push(card);
  }
  if (deduped.length < state.cards.length) {
    state.cards = deduped;
    showToast(`已自动去除 ${state.cards.length - deduped.length} 张重复卡牌`);
  }
  saveCardOverrides(state.cards);
}

elements.saveCardButton.addEventListener('click', () => {
  if (!updateSelectedCardFromForm()) return;
  saveStateCards();
  setStatus('这张卡已保存到游戏');
  showToast('已保存', true);
  renderList();
  renderPreview();
});

elements.applyAllButton.addEventListener('click', () => {
  if (!updateSelectedCardFromForm()) return;
  saveStateCards();
  setStatus('全部修改已保存，回游戏重新开始即可生效');
  showToast('全部已保存', true);
  renderList();
  renderPreview();
});

elements.resetCardButton.addEventListener('click', () => {
  resetCurrentCard();
  saveCardOverrides(state.cards);
});

elements.resetAllButton.addEventListener('click', () => {
  state.cards = baseCards.map((card) => {
    const normalized = normalizeCard(card);
    normalized.editorModel = extractStructuredEffects(normalized);
    return normalized;
  });
  clearCardOverrides();
  setStatus('已清空全部覆盖，游戏会恢复默认卡牌');
  render();
});

elements.newSpellButton.addEventListener('click', () => createTemplateCard('spell'));
elements.newMinionButton.addEventListener('click', () => createTemplateCard('minion'));

elements.loadQuestlineDeckButton.addEventListener('click', () => {
  const presetCounts = new Map(currentDeckCollection.entries.map((entry) => [entry.cardId, entry.count]));
  state.cards = state.cards.map((card) => ({
    ...card,
    deckCount: presetCounts.get(card.id) || 0,
  }));
  saveCardOverrides(state.cards);
  setStatus(`已载入${currentDeckCollection.name}：${currentDeckCollection.entries.length} 种卡，共 30 张`);
  render();
});

// ── 启动 ─────────────────────────────────────────────────────

render();
setStatus('未保存');
