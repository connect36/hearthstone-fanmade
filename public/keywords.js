export const KEYWORD_DEFINITIONS = Object.freeze([
  { id: 'taunt', label: '嘲讽' },
  { id: 'poisonous', label: '剧毒' },
  { id: 'divineShield', label: '圣盾' },
  { id: 'lifesteal', label: '吸血' },
  { id: 'windfury', label: '风怒' },
  { id: 'reborn', label: '复生' },
]);

export const KEYWORD_LABELS = Object.freeze(
  Object.fromEntries(KEYWORD_DEFINITIONS.map((entry) => [entry.id, entry.label]))
);

const KEYWORD_IDS = new Set(KEYWORD_DEFINITIONS.map((entry) => entry.id));
const KEYWORD_ORDER = Object.freeze(
  Object.fromEntries(KEYWORD_DEFINITIONS.map((entry, index) => [entry.id, index]))
);

export function normalizeKeywords(input) {
  if (!input) return [];

  const values = Array.isArray(input)
    ? input
    : String(input)
        .split(/[,\s，、]+/)
        .map((value) => value.trim())
        .filter(Boolean);

  const seen = new Set();
  const normalized = [];

  for (const keyword of values) {
    if (!KEYWORD_IDS.has(keyword) || seen.has(keyword)) continue;
    seen.add(keyword);
    normalized.push(keyword);
  }

  return normalized.sort((left, right) => (KEYWORD_ORDER[left] ?? 999) - (KEYWORD_ORDER[right] ?? 999));
}

export function summarizeKeywords(input) {
  return normalizeKeywords(input)
    .map((keyword) => KEYWORD_LABELS[keyword] || keyword)
    .join(' · ');
}

export function buildKeywordText(input) {
  const labels = normalizeKeywords(input).map((keyword) => KEYWORD_LABELS[keyword] || keyword);
  return labels.length ? `${labels.join('。')}。` : '';
}

export function getMaxAttacksPerTurn(input) {
  return normalizeKeywords(input).includes('windfury') ? 2 : 1;
}

export function hasKeyword(entity, keyword) {
  if (!entity) return false;
  const keywords = normalizeKeywords(entity.keywords);
  if (!keywords.includes(keyword)) return false;
  if (keyword === 'divineShield') return entity.divineShield !== false;
  if (keyword === 'reborn') return entity.rebornAvailable !== false;
  return true;
}

export function getDisplayKeywords(entity) {
  const keywords = normalizeKeywords(entity?.keywords);
  return keywords.filter((keyword) => hasKeyword(entity, keyword));
}

export function createMinionRuntimeState(inputKeywords, overrides = {}) {
  const keywords = normalizeKeywords(overrides.keywords ?? inputKeywords);
  const maxAttacksPerTurn = overrides.maxAttacksPerTurn ?? getMaxAttacksPerTurn(keywords);
  const attacksThisTurn = overrides.attacksThisTurn ?? 0;
  const sleeping = overrides.sleeping ?? true;
  const divineShield = overrides.divineShield ?? keywords.includes('divineShield');
  const rebornAvailable = overrides.rebornAvailable ?? keywords.includes('reborn');
  const canAttack =
    overrides.canAttack ?? (!sleeping && attacksThisTurn < maxAttacksPerTurn);

  return {
    keywords,
    divineShield,
    rebornAvailable,
    attacksThisTurn,
    maxAttacksPerTurn,
    canAttack,
  };
}

export function refreshMinionAttackState(minion) {
  if (!minion) return minion;
  minion.maxAttacksPerTurn = getMaxAttacksPerTurn(minion.keywords);
  minion.canAttack =
    minion.health > 0 &&
    !minion.sleeping &&
    (minion.attacksThisTurn ?? 0) < minion.maxAttacksPerTurn;
  return minion;
}

export function resetMinionForTurn(minion) {
  if (!minion) return minion;
  minion.sleeping = false;
  minion.attacksThisTurn = 0;
  return refreshMinionAttackState(minion);
}

export function consumeMinionAttack(minion) {
  if (!minion) return minion;
  minion.sleeping = false;
  minion.attacksThisTurn = (minion.attacksThisTurn ?? 0) + 1;
  return refreshMinionAttackState(minion);
}
