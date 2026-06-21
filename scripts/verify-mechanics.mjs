// 机制验证测试 — P0/P0.5
import { evaluateCardPlayState, getActiveMechanicLabels } from '../public/mechanics.js';
import { normalizeKeywords, hasKeyword, getMaxAttacksPerTurn } from '../public/keywords.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const makeHand = (cards) => cards;
const makeRuntime = (played = []) => ({ cardsPlayedThisTurn: played, spellsPlayedThisTurn: [], damageTakenThisTurn: 0 });

console.log('\n=== P0: 基础关键词 ===');
test('normalizeKeywords filters unknown', () => {
  const r = normalizeKeywords(['taunt', 'unknown', 'rush']);
  assert(r.length === 2, 'should keep taunt and rush only');
});
test('normalizeKeywords keeps charge', () => {
  const r = normalizeKeywords(['charge', 'elusive', 'stealth', 'immune', 'megaWindfury']);
  assert(r.length === 5, 'all 5 new keywords kept');
});
test('hasKeyword divineShield respects runtime', () => {
  const m = { keywords: ['divineShield'], divineShield: false };
  assert(!hasKeyword(m, 'divineShield'), 'divineShield consumed should return false');
});
test('getMaxAttacksPerTurn megaWindfury → 4', () => {
  assert(getMaxAttacksPerTurn(['megaWindfury']) === 4);
});
test('getMaxAttacksPerTurn windfury → 2', () => {
  assert(getMaxAttacksPerTurn(['windfury']) === 2);
});
test('getMaxAttacksPerTurn normal → 1', () => {
  assert(getMaxAttacksPerTurn([]) === 1);
});
test('normalizeKeywords preserves all 12 registered', () => {
  const all12 = ['taunt','rush','charge','poisonous','divineShield','lifesteal','windfury','megaWindfury','reborn','stealth','elusive','immune'];
  const r = normalizeKeywords(all12);
  assert(r.length === 12, `expected 12, got ${r.length}`);
});

console.log('\n=== P1: 视觉状态 ===');
test('is-locked when not player turn', () => {
  const r = evaluateCardPlayState({ cost: 2, instanceId:'c1' }, 'player', {}, { phase:'enemy', effectiveCost:2 });
  assert(r.visualState === 'is-locked' && !r.playable);
});
test('is-locked when mana insufficient', () => {
  const r = evaluateCardPlayState({ cost:5, instanceId:'c1' }, 'player', {}, { phase:'player', currentMana:3, effectiveCost:5 });
  assert(r.visualState === 'is-locked');
});
test('is-playable when all conditions met', () => {
  const r = evaluateCardPlayState({ cost:2, instanceId:'c1' }, 'player', {}, { phase:'player', currentMana:5, effectiveCost:2, maxBoardSize:7, boardSize:0 });
  assert(r.visualState === 'is-playable' && r.playable);
});

console.log('\n=== P1: 快枪 ===');
test('quickdraw active when enteredHandTurn === currentTurn', () => {
  const c = { cost:1, instanceId:'c1', mechanics:['quickdraw'], enteredHandTurn:3 };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[c], currentTurn:3, currentMana:5, phase:'player', effectiveCost:1, runtime:makeRuntime() });
  assert(r.visualState === 'is-trigger-ready');
  assert(r.activeMechanics.includes('quickdraw'));
});
test('quickdraw inactive when turn passed', () => {
  const c = { cost:1, instanceId:'c1', mechanics:['quickdraw'], enteredHandTurn:3 };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[c], currentTurn:4, currentMana:5, phase:'player', effectiveCost:1, runtime:makeRuntime() });
  assert(r.visualState === 'is-playable');
  assert(r.inactiveMechanics.includes('quickdraw'));
});
test('quickdraw locked when active but mana insufficient', () => {
  const c = { cost:5, instanceId:'c1', mechanics:['quickdraw'], enteredHandTurn:3 };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[c], currentTurn:3, currentMana:2, phase:'player', effectiveCost:5, runtime:makeRuntime() });
  assert(r.visualState === 'is-locked');
});

console.log('\n=== P1: 连击 ===');
test('combo active when card already played', () => {
  const c = { cost:2, instanceId:'c2', mechanics:['combo'] };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[c], currentTurn:3, currentMana:5, phase:'player', effectiveCost:2, runtime:makeRuntime([{instanceId:'prev'}] ) });
  assert(r.visualState === 'is-trigger-ready');
  assert(r.activeMechanics.includes('combo'));
});
test('combo inactive without prior card', () => {
  const c = { cost:2, instanceId:'c2', mechanics:['combo'] };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[c], currentTurn:3, currentMana:5, phase:'player', effectiveCost:2, runtime:makeRuntime([]) });
  assert(r.visualState === 'is-playable');
  assert(r.inactiveMechanics.includes('combo'));
});

console.log('\n=== P1: 流放 ===');
test('outcast active at leftmost', () => {
  const c = { cost:1, instanceId:'c3', mechanics:['outcast'] };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[c, {instanceId:'other'}], currentTurn:3, currentMana:5, phase:'player', effectiveCost:1, runtime:makeRuntime() });
  assert(r.visualState === 'is-trigger-ready');
  assert(r.activeMechanics.includes('outcast'));
});
test('outcast active at rightmost', () => {
  const c = { cost:1, instanceId:'c3', mechanics:['outcast'] };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[{instanceId:'other'}, c], currentTurn:3, currentMana:5, phase:'player', effectiveCost:1, runtime:makeRuntime() });
  assert(r.visualState === 'is-trigger-ready');
});
test('outcast inactive in middle', () => {
  const c = { cost:1, instanceId:'c3', mechanics:['outcast'] };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[{instanceId:'a'}, c, {instanceId:'b'}], currentTurn:3, currentMana:5, phase:'player', effectiveCost:1, runtime:makeRuntime() });
  assert(r.visualState === 'is-playable');
});
test('outcast active when only one card', () => {
  const c = { cost:1, instanceId:'c3', mechanics:['outcast'] };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[c], currentTurn:3, currentMana:5, phase:'player', effectiveCost:1, runtime:makeRuntime() });
  assert(r.visualState === 'is-trigger-ready');
});

console.log('\n=== P1: 压轴 ===');
test('finale active when cost equals remaining mana', () => {
  const c = { cost:3, instanceId:'c4', mechanics:['finale'] };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[c], currentTurn:3, currentMana:3, phase:'player', effectiveCost:3, runtime:makeRuntime() });
  assert(r.visualState === 'is-trigger-ready');
  assert(r.activeMechanics.includes('finale'));
});
test('finale inactive when cost less than remaining mana', () => {
  const c = { cost:3, instanceId:'c4', mechanics:['finale'] };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[c], currentTurn:3, currentMana:5, phase:'player', effectiveCost:3, runtime:makeRuntime() });
  assert(r.visualState === 'is-playable');
});
test('finale uses effectiveCost not baseCost', () => {
  const c = { cost:5, instanceId:'c4', mechanics:['finale'] };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[c], currentTurn:5, currentMana:3, phase:'player', effectiveCost:3, runtime:makeRuntime() });
  assert(r.visualState === 'is-trigger-ready', 'was: '+r.visualState+', expected is-trigger-ready');
});

console.log('\n=== P1: 法力渴求 ===');
test('manathirst active when maxMana >= threshold', () => {
  const c = { cost:3, instanceId:'c5', mechanics:['manathirst'], manathirstThreshold:5 };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[c], currentTurn:5, currentMana:5, maxMana:6, phase:'player', effectiveCost:3, runtime:makeRuntime() });
  assert(r.visualState === 'is-trigger-ready');
});
test('manathirst inactive when maxMana below threshold', () => {
  const c = { cost:3, instanceId:'c5', mechanics:['manathirst'], manathirstThreshold:5 };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[c], currentTurn:3, currentMana:3, maxMana:3, phase:'player', effectiveCost:3, runtime:makeRuntime() });
  assert(r.visualState === 'is-playable');
});

console.log('\n=== P1: 费用不足时黄色不可见 ===');
test('quickdraw mana-insufficient stays locked', () => {
  const c = { cost:5, instanceId:'c6', mechanics:['quickdraw'], enteredHandTurn:3 };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[c], currentTurn:3, currentMana:2, phase:'player', effectiveCost:5, runtime:makeRuntime() });
  assert(r.visualState === 'is-locked');
});
test('combo mana-insufficient stays locked', () => {
  const c = { cost:5, instanceId:'c7', mechanics:['combo'] };
  const r = evaluateCardPlayState(c, 'player', {}, { hand:[c], currentTurn:3, currentMana:2, phase:'player', effectiveCost:5, runtime:makeRuntime([{instanceId:'prev'}] ) });
  assert(r.visualState === 'is-locked');
});

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('✅ All mechanics tests passed');
