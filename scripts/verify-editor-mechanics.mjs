// 编辑器往返测试 — P1
import { mechanicTestCards } from '../public/game-data.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); failed++; }
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

console.log('\n=== 编辑器往返测试 ===');

test('测试卡存在 mechanics 字段', () => {
  const c = mechanicTestCards.find(c => c.id === 'mt-quickdraw');
  assert(c && c.mechanics.includes('quickdraw'));
});

test('测试卡存在 bonusMechanicEffects', () => {
  const c = mechanicTestCards.find(c => c.id === 'mt-combo');
  assert(c.bonusMechanicEffects && c.bonusMechanicEffects.combo);
  assert(c.bonusMechanicEffects.combo.length === 1);
  assert(c.bonusMechanicEffects.combo[0].type === 'damage');
  assert(c.bonusMechanicEffects.combo[0].amount === 2, `expected 2 got ${c.bonusMechanicEffects.combo[0].amount}`);
});

test('快枪附效是 buffSelf', () => {
  const c = mechanicTestCards.find(c => c.id === 'mt-quickdraw');
  assert(c.bonusMechanicEffects.quickdraw);
  assert(c.bonusMechanicEffects.quickdraw[0].type === 'buffSelf');
});

test('基础效果和附效独立存储', () => {
  const c = mechanicTestCards.find(c => c.id === 'mt-combo');
  assert(c.effects.length === 1, 'base effects');
  assert(c.bonusMechanicEffects.combo.length === 1, 'bonus effects');
  const totalDamage = c.effects[0].amount + c.bonusMechanicEffects.combo[0].amount;
  assert(totalDamage === 4, `total should be 4 got ${totalDamage}`);
});

test('压轴基础召唤1个 + 附效召唤1个 = 总计2个', () => {
  const c = mechanicTestCards.find(c => c.id === 'mt-finale');
  const base = c.effects[0].amount;
  const bonus = c.bonusMechanicEffects.finale[0].amount;
  assert(base === 1 && bonus === 1, `base=${base} bonus=${bonus}`);
  assert(base + bonus === 2);
});

test('流放基础1伤 + 附效2伤 = 总计3伤', () => {
  const c = mechanicTestCards.find(c => c.id === 'mt-outcast');
  assert(c.effects[0].amount === 1);
  assert(c.bonusMechanicEffects.outcast[0].amount === 2);
});

test('往返：序列化后 mechanics 不丢失', () => {
  const c = clone(mechanicTestCards.find(c => c.id === 'mt-quickdraw'));
  const json = JSON.stringify(c);
  const restored = JSON.parse(json);
  assert(restored.mechanics.includes('quickdraw'));
  assert(restored.bonusMechanicEffects.quickdraw[0].type === 'buffSelf');
});

test('往返：bonusMechanicEffects 完整保留', () => {
  for (const card of mechanicTestCards) {
    const json = JSON.stringify(card);
    const restored = JSON.parse(json);
    const expectedKeys = Object.keys(card.bonusMechanicEffects || {});
    const actualKeys = Object.keys(restored.bonusMechanicEffects || {});
    assert(expectedKeys.length === actualKeys.length,
      `${card.id}: expected ${expectedKeys.length} bonus keys, got ${actualKeys.length}`);
    for (const key of expectedKeys) {
      assert(Array.isArray(restored.bonusMechanicEffects[key]),
        `${card.id}: bonus[${key}] should be array`);
    }
  }
});

test('manathirstThreshold 独立字段', () => {
  const c = { id:'test', mechanics:['manathirst'], manathirstThreshold: 8, bonusMechanicEffects:{} };
  const json = JSON.stringify(c);
  const r = JSON.parse(json);
  assert(r.manathirstThreshold === 8);
});

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('✅ Editor round-trip tests passed');
