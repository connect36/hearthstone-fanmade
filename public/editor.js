import { cards as baseCards, starterDeck } from './game-data.js';
import {
  applyCardOverrides,
  clearCardOverrides,
  saveCardOverrides,
} from './card-overrides.js';
import { buildKeywordText, normalizeKeywords, summarizeKeywords } from './keywords.js';

const deckCountMap = Object.fromEntries(starterDeck.map((entry) => [entry.cardId, entry.count]));

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
  fieldAttack: document.getElementById('field-attack'),
  fieldHealth: document.getElementById('field-health'),
  fieldKeywords: [...document.querySelectorAll('input[name="keywords"]')],
  fieldDamage: document.getElementById('field-damage'),
  fieldDamageTarget: document.getElementById('field-damage-target'),
  fieldHeal: document.getElementById('field-heal'),
  fieldArmor: document.getElementById('field-armor'),
  fieldDraw: document.getElementById('field-draw'),
  fieldSummonCount: document.getElementById('field-summon-count'),
  fieldSummonName: document.getElementById('field-summon-name'),
  fieldSummonAttack: document.getElementById('field-summon-attack'),
  fieldSummonHealth: document.getElementById('field-summon-health'),
  fieldSummonKeywords: [...document.querySelectorAll('input[name="summonKeywords"]')],
  fieldBuffAttack: document.getElementById('field-buff-attack'),
  fieldBuffHealth: document.getElementById('field-buff-health'),
  fieldCondition: document.getElementById('field-condition'),
  fieldConditionType: document.getElementById('field-condition-type'),
  fieldConditionTarget: document.getElementById('field-condition-target'),
  fieldConditionAmount: document.getElementById('field-condition-amount'),
  fieldText: document.getElementById('field-text'),
  fieldEffects: document.getElementById('field-effects'),
  previewCard: document.getElementById('preview-card'),
  previewJson: document.getElementById('preview-json'),
  saveCardButton: document.getElementById('save-card-button'),
  resetCardButton: document.getElementById('reset-card-button'),
  applyAllButton: document.getElementById('apply-all-button'),
  resetAllButton: document.getElementById('reset-all-button'),
  newSpellButton: document.getElementById('new-spell-button'),
  newMinionButton: document.getElementById('new-minion-button'),
};

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

function normalizeCard(card) {
  return {
    ...clone(card),
    keywords: normalizeKeywords(card.keywords),
    enabled: card.enabled !== false,
    deckCount: Number.isFinite(card.deckCount) ? card.deckCount : deckCountMap[card.id] ?? 0,
    autoText: card.type === 'spell' ? true : card.autoText !== false,
  };
}

const state = {
  cards: applyCardOverrides(baseCards).map((card) => {
    const normalized = normalizeCard(card);
    normalized.editorModel = clone(card.editorModel || extractStructuredEffects(normalized));
    return normalized;
  }),
  selectedId: '',
};

function setStatus(text) {
  elements.editorStatus.textContent = text;
}

function selectedCard() {
  return state.cards.find((card) => card.id === state.selectedId) || null;
}

function isBaseCard(cardId) {
  return baseCards.some((card) => card.id === cardId);
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
    if (target === 'playerChoice') return `再由玩家决定目标，恢复 ${amount} 点生命值。`;
    return target === 'enemyHero'
      ? `再为敌方英雄恢复 ${amount} 点生命值。`
      : `再恢复 ${amount} 点生命值。`;
  }

  if (type === 'armor') {
    if (target === 'samePrimary') return `再为相同目标获得 ${amount} 点护甲。`;
    if (target === 'playerChoice') return `再由玩家决定目标，获得 ${amount} 点护甲。`;
    return target === 'enemyHero'
      ? `再使敌方英雄获得 ${amount} 点护甲。`
      : `再获得 ${amount} 点护甲。`;
  }

  if (type === 'draw') {
    if (target === 'samePrimary') return `再使相同目标抽 ${amount} 张牌。`;
    if (target === 'playerChoice') return `再由玩家决定目标，抽 ${amount} 张牌。`;
    return target === 'enemyHero'
      ? `再使敌方抽 ${amount} 张牌。`
      : `再抽 ${amount} 张牌。`;
  }

  return '';
}

function describePrimaryDamage(amount, target) {
  if (amount <= 0) return '';
  if (target === 'enemyHero') return `对敌方英雄造成 ${amount} 点伤害。`;
  if (target === 'enemyMinion') return `对一个敌方随从造成 ${amount} 点伤害。`;
  if (target === 'friendlyHero') return `对你的英雄造成 ${amount} 点伤害。`;
  if (target === 'friendlyMinion') return `对一个友方随从造成 ${amount} 点伤害。`;
  if (target === 'playerChoice') return `造成 ${amount} 点伤害。`;
  return `造成 ${amount} 点伤害。`;
}

function extractStructuredEffects(card) {
  const model = {
    keywords: normalizeKeywords(card.keywords),
    damage: 0,
    damageTarget: 'enemyHero',
    heal: 0,
    armor: 0,
    draw: 0,
    summonCount: 0,
    summonName: '',
    summonAttack: 1,
    summonHealth: 1,
    summonKeywords: [],
    buffAttack: 0,
    buffHealth: 0,
    condition: '',
    conditionType: '',
    conditionTarget: 'enemyHero',
    conditionAmount: 0,
    extraEffects: [],
  };

  for (const effect of card.effects || []) {
    if (effect.type === 'damage' && model.damage === 0) {
      model.damage = Number(effect.amount) || 0;
      model.damageTarget = effect.target || 'enemyHero';
      continue;
    }

    if (effect.type === 'heal' && effect.target === 'friendlyHero') {
      model.heal = Number(effect.amount) || 0;
      continue;
    }

    if (effect.type === 'armor' && effect.target === 'friendlyHero') {
      model.armor = Number(effect.amount) || 0;
      continue;
    }

    if (effect.type === 'draw' && effect.target === 'friendlyHero') {
      model.draw = Number(effect.amount) || 0;
      continue;
    }

    if (effect.type === 'summon' && effect.target === 'friendlyBoard') {
      model.summonCount = Number(effect.amount) || 0;
      model.summonName = effect.minion?.name || '';
      model.summonAttack = Number(effect.minion?.attack) || 1;
      model.summonHealth = Number(effect.minion?.health) || 1;
      model.summonKeywords = normalizeKeywords(effect.minion?.keywords);
      continue;
    }

    if (effect.type === 'buff' && effect.target === 'friendlyMinions') {
      model.buffAttack = Number(effect.attack) || 0;
      model.buffHealth = Number(effect.health) || 0;
      continue;
    }

    if (effect.type === 'conditional') {
      const nested = Array.isArray(effect.effects) ? effect.effects[0] : null;
      if (nested && ['damage', 'heal', 'armor', 'draw'].includes(nested.type)) {
        model.condition = effect.condition || '';
        model.conditionType = nested.type;
        model.conditionTarget = nested.target || 'enemyHero';
        model.conditionAmount = Number(nested.amount) || 0;
        continue;
      }
    }

    model.extraEffects.push(clone(effect));
  }

  return model;
}

function getEditorModel(card) {
  if (!card.editorModel) {
    card.editorModel = extractStructuredEffects(card);
  }
  return card.editorModel;
}

function usesForcedAutoText(card) {
  return card.type === 'spell';
}

function buildGeneratedText(card, model) {
  if (card.type === 'minion') {
    return buildKeywordText(model.keywords);
  }

  const parts = [];
  if (model.damage > 0) parts.push(describePrimaryDamage(model.damage, model.damageTarget));
  if (model.heal > 0) parts.push(`恢复 ${model.heal} 点生命值。`);
  if (model.armor > 0) parts.push(`获得 ${model.armor} 点护甲。`);
  if (model.draw > 0) parts.push(`抽 ${model.draw} 张牌。`);
  if (model.summonCount > 0) {
    const summonKeywords = summarizeKeywords(model.summonKeywords);
    parts.push(
      `召唤 ${model.summonCount} 个 ${model.summonAttack}/${model.summonHealth} ${model.summonName || '随从'}${summonKeywords ? `（${summonKeywords}）` : ''}。`
    );
  }
  if (model.buffAttack > 0 || model.buffHealth > 0) {
    parts.push(`你所有随从获得 +${model.buffAttack}/+${model.buffHealth}。`);
  }
  if (model.condition && model.conditionType && model.conditionAmount > 0) {
    const prefix = describeConditionalPrefix(model.condition);
    const effectText = describeConditionalEffect(
      model.conditionType,
      model.conditionAmount,
      model.conditionTarget
    );
    if (prefix && effectText) {
      parts.push(`${prefix}${effectText}`);
    }
  }
  return parts.join(' ');
}

function syncAutoText(card) {
  if (!usesForcedAutoText(card) && card.autoText === false) return card.text || '';
  const generatedText = buildGeneratedText(card, getEditorModel(card));
  card.text = generatedText;
  return generatedText;
}

function renderList() {
  elements.cardList.innerHTML = state.cards
    .map((card) => {
      const active = card.id === state.selectedId ? 'is-active' : '';
      const disabled = card.enabled ? '' : 'is-disabled';
      const keywordSummary = card.type === 'minion' ? summarizeKeywords(card.keywords) : '';
      const stats = card.type === 'minion'
        ? `${card.attack}/${card.health}${keywordSummary ? ` · ${keywordSummary}` : ''}`
        : '法术';
      const status = card.enabled ? `牌组 ${card.deckCount}` : '已禁用';
      return `
        <button type="button" class="card-list-item ${active} ${disabled}" data-card-id="${card.id}">
          <strong>${card.name}</strong>
          <span class="card-list-item__meta">费用 ${card.cost} · ${stats} · ${status}</span>
        </button>
      `;
    })
    .join('');
}

function renderEditor() {
  const card = selectedCard();
  if (!card) return;

  const model = clone(getEditorModel(card));
  const resolvedText = syncAutoText(card);
  elements.editorTitle.textContent = `编辑：${card.name}`;
  elements.fieldId.value = card.id;
  elements.fieldName.value = card.name || '';
  elements.fieldCost.value = String(card.cost ?? 0);
  elements.fieldType.value = card.type || 'spell';
  elements.fieldEnabled.value = String(card.enabled !== false);
  elements.fieldDeckCount.value = String(card.deckCount ?? 0);
  elements.fieldAutoText.value = String(usesForcedAutoText(card) ? true : card.autoText !== false);
  elements.fieldAutoText.disabled = usesForcedAutoText(card);
  elements.fieldAttack.value = String(card.attack ?? 0);
  elements.fieldHealth.value = String(card.health ?? 1);
  writeKeywordCheckboxes(elements.fieldKeywords, model.keywords);
  elements.fieldDamage.value = String(model.damage);
  elements.fieldDamageTarget.value = model.damageTarget || 'enemyHero';
  elements.fieldHeal.value = String(model.heal);
  elements.fieldArmor.value = String(model.armor);
  elements.fieldDraw.value = String(model.draw);
  elements.fieldSummonCount.value = String(model.summonCount);
  elements.fieldSummonName.value = model.summonName;
  elements.fieldSummonAttack.value = String(model.summonAttack);
  elements.fieldSummonHealth.value = String(model.summonHealth);
  writeKeywordCheckboxes(elements.fieldSummonKeywords, model.summonKeywords);
  elements.fieldBuffAttack.value = String(model.buffAttack);
  elements.fieldBuffHealth.value = String(model.buffHealth);
  elements.fieldCondition.value = model.condition;
  elements.fieldConditionType.value = model.conditionType;
  elements.fieldConditionTarget.value = model.conditionTarget;
  elements.fieldConditionAmount.value = String(model.conditionAmount);
  elements.fieldText.value =
    usesForcedAutoText(card) || card.autoText !== false ? resolvedText : card.text || resolvedText;
  elements.fieldText.readOnly = usesForcedAutoText(card) || card.autoText !== false;
  elements.fieldEffects.value = JSON.stringify(model.extraEffects, null, 2);
}

function renderPreview() {
  const card = selectedCard();
  if (!card) return;

  const model = clone(getEditorModel(card));
  const derivedText =
    usesForcedAutoText(card) || card.autoText !== false
      ? syncAutoText(card)
      : card.text?.trim() || buildGeneratedText(card, model);
  const effectText = derivedText ? `<div class="preview-card__text">${derivedText}</div>` : '';
  const keywordMarkup = summarizeKeywords(card.keywords)
    ? `
      <div class="preview-card__keywords">
        ${normalizeKeywords(card.keywords)
          .map((keyword) => `<span class="preview-card__keyword">${summarizeKeywords([keyword])}</span>`)
          .join('')}
      </div>
    `
    : '';
  const statMarkup =
    card.type === 'minion'
      ? `<div class="preview-card__stats"><span>攻 ${card.attack}</span><span>血 ${card.health}</span></div>`
      : '';

  elements.previewCard.innerHTML = `
    <span class="preview-card__cost">${card.cost}</span>
    <div class="preview-card__name">${card.name}</div>
    <div class="preview-card__meta">${card.type === 'minion' ? '随从' : '法术'} · ${card.id} · ${card.enabled ? '启用' : '禁用'} · 牌组 ${card.deckCount}</div>
    ${keywordMarkup}
    ${effectText}
    ${statMarkup}
  `;

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

function readStructuredModelFromForm(extraEffects) {
  return {
    keywords: readKeywordCheckboxes(elements.fieldKeywords),
    damage: toNumber(elements.fieldDamage.value),
    damageTarget: elements.fieldDamageTarget.value || 'enemyHero',
    heal: toNumber(elements.fieldHeal.value),
    armor: toNumber(elements.fieldArmor.value),
    draw: toNumber(elements.fieldDraw.value),
    summonCount: toNumber(elements.fieldSummonCount.value),
    summonName: elements.fieldSummonName.value.trim(),
    summonAttack: toNumber(elements.fieldSummonAttack.value, 1),
    summonHealth: Math.max(1, toNumber(elements.fieldSummonHealth.value, 1)),
    summonKeywords: readKeywordCheckboxes(elements.fieldSummonKeywords),
    buffAttack: toNumber(elements.fieldBuffAttack.value),
    buffHealth: toNumber(elements.fieldBuffHealth.value),
    condition: elements.fieldCondition.value,
    conditionType: elements.fieldConditionType.value,
    conditionTarget: elements.fieldConditionTarget.value || 'enemyHero',
    conditionAmount: toNumber(elements.fieldConditionAmount.value),
    extraEffects,
  };
}

function buildEffectsFromModel(cardType, model) {
  const effects = [];

  if (cardType === 'spell') {
    if (model.damage > 0) {
      effects.push({ type: 'damage', target: model.damageTarget || 'enemyHero', amount: model.damage });
    }
    if (model.heal > 0) effects.push({ type: 'heal', target: 'friendlyHero', amount: model.heal });
    if (model.armor > 0) effects.push({ type: 'armor', target: 'friendlyHero', amount: model.armor });
    if (model.draw > 0) effects.push({ type: 'draw', target: 'friendlyHero', amount: model.draw });
    if (model.summonCount > 0) {
      effects.push({
        type: 'summon',
        target: 'friendlyBoard',
        amount: model.summonCount,
        minion: {
          name: model.summonName || '自定义随从',
          attack: model.summonAttack,
          health: model.summonHealth,
          keywords: model.summonKeywords,
        },
      });
    }
    if (model.buffAttack > 0 || model.buffHealth > 0) {
      effects.push({
        type: 'buff',
        target: 'friendlyMinions',
        attack: model.buffAttack,
        health: model.buffHealth,
      });
    }
    if (model.condition && model.conditionType && model.conditionAmount > 0) {
      effects.push({
        type: 'conditional',
        condition: model.condition,
        effects: [
          {
            type: model.conditionType,
            target: model.conditionTarget,
            amount: model.conditionAmount,
          },
        ],
      });
    }
  }

  return [...effects, ...model.extraEffects];
}

function updateSelectedCardFromForm() {
  const card = selectedCard();
  if (!card) return false;

  let extraEffects;
  try {
    extraEffects = JSON.parse(elements.fieldEffects.value.trim() || '[]');
    if (!Array.isArray(extraEffects)) throw new Error('Extra effects must be an array');
  } catch {
    setStatus('额外效果 JSON 无法解析');
    return false;
  }

  card.name = elements.fieldName.value.trim() || card.name;
  card.cost = toNumber(elements.fieldCost.value);
  card.type = elements.fieldType.value;
  card.enabled = elements.fieldEnabled.value === 'true';
  card.deckCount = Math.max(0, toNumber(elements.fieldDeckCount.value));
  card.autoText = usesForcedAutoText(card) ? true : elements.fieldAutoText.value === 'true';
  card.attack = toNumber(elements.fieldAttack.value);
  card.health = Math.max(1, toNumber(elements.fieldHealth.value, 1));
  card.editorModel = readStructuredModelFromForm(extraEffects);
  card.keywords = card.type === 'minion' ? normalizeKeywords(card.editorModel.keywords) : [];
  card.effects = buildEffectsFromModel(card.type, card.editorModel);

  const generatedText = buildGeneratedText(card, card.editorModel);
  if (usesForcedAutoText(card) || card.autoText) {
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

function resetCurrentCard() {
  const index = state.cards.findIndex((card) => card.id === state.selectedId);
  const base = baseCards.find((card) => card.id === state.selectedId);
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

function createTemplateCard(type) {
  const id = `custom-${type}-${Date.now()}`;
  const card =
    type === 'spell'
      ? {
          id,
          name: '自定义法术',
          cost: 2,
          type: 'spell',
          text: '',
          effects: [{ type: 'damage', target: 'enemyHero', amount: 3 }],
          enabled: true,
          deckCount: 1,
          autoText: true,
          editorModel: {
            keywords: [],
            damage: 3,
            damageTarget: 'enemyHero',
            heal: 0,
            armor: 0,
            draw: 0,
            summonCount: 0,
            summonName: '',
            summonAttack: 1,
            summonHealth: 1,
            summonKeywords: [],
            buffAttack: 0,
            buffHealth: 0,
            condition: '',
            conditionType: '',
            conditionTarget: 'enemyHero',
            conditionAmount: 0,
            extraEffects: [],
          },
        }
      : {
          id,
          name: '自定义随从',
          cost: 3,
          type: 'minion',
          attack: 3,
          health: 4,
          keywords: [],
          text: '',
          effects: [],
          enabled: true,
          deckCount: 1,
          autoText: true,
          editorModel: {
            keywords: [],
            damage: 0,
            damageTarget: 'enemyHero',
            heal: 0,
            armor: 0,
            draw: 0,
            summonCount: 0,
            summonName: '',
            summonAttack: 1,
            summonHealth: 1,
            summonKeywords: [],
            buffAttack: 0,
            buffHealth: 0,
            condition: '',
            conditionType: '',
            conditionTarget: 'enemyHero',
            conditionAmount: 0,
            extraEffects: [],
          },
        };

  state.cards.unshift(card);
  state.selectedId = card.id;
  saveCardOverrides(state.cards);
  setStatus(`已创建${type === 'spell' ? '法术' : '随从'}模板`);
  render();
}

elements.cardList.addEventListener('click', (event) => {
  const target = event.target.closest('[data-card-id]');
  if (!target) return;
  state.selectedId = target.dataset.cardId || '';
  setStatus('未保存');
  render();
});

function handleFormMutation() {
  if (!updateSelectedCardFromForm()) return;
  setStatus('编辑中');
  renderList();
  renderPreview();
}

elements.form.addEventListener('input', handleFormMutation);
elements.form.addEventListener('change', handleFormMutation);

elements.saveCardButton.addEventListener('click', () => {
  if (!updateSelectedCardFromForm()) return;
  saveCardOverrides(state.cards);
  setStatus('这张卡已保存到游戏');
  renderList();
  renderPreview();
});

elements.applyAllButton.addEventListener('click', () => {
  if (!updateSelectedCardFromForm()) return;
  saveCardOverrides(state.cards);
  setStatus('全部修改已保存，回游戏重新开始即可生效');
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

elements.newSpellButton.addEventListener('click', () => {
  createTemplateCard('spell');
});

elements.newMinionButton.addEventListener('click', () => {
  createTemplateCard('minion');
});

render();
setStatus('未保存');
