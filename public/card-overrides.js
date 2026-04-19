const STORAGE_KEY = 'clawteam-lan-hearthstone-card-overrides-v1';

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizeOverrideList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((item) => item && item.id);
  if (typeof raw === 'object') return Object.values(raw).filter((item) => item && item.id);
  return [];
}

export function loadCardOverrides() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeOverrideList(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveCardOverrides(cardList) {
  const normalized = normalizeOverrideList(cardList).map((item) => clone(item));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearCardOverrides() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function applyCardOverrides(baseCards) {
  const overrides = new Map(loadCardOverrides().map((card) => [card.id, card]));
  const mergedCards = baseCards.map((card) => {
    const override = overrides.get(card.id);
    return override ? { ...clone(card), ...clone(override) } : clone(card);
  });

  for (const override of overrides.values()) {
    if (!baseCards.some((card) => card.id === override.id)) {
      mergedCards.push(clone(override));
    }
  }

  return mergedCards;
}

export { STORAGE_KEY };
