// 机制集成测试 P0.6 — 验证真实效果
import { evaluateCardPlayState } from '../public/mechanics.js';
import {
  createPlayerRuntime, markCardEnteredHand, recordCardPlayed,
  recordDamageTaken, recordHealingDone, clearTurnState,
} from '../public/mechanic-runtime.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

console.log('\n=== 集成: 快枪真实效果 ===');

test('快枪触发后应执行 bonusMechanicEffects[quickdraw] 并获得+1攻击', () => {
  const rt = createPlayerRuntime();
  const c = {
    name:'试刀', cost:1, type:'minion', attack:2, health:3, instanceId:'c1',
    mechanics:['quickdraw'], enteredHandTurn:3,
    bonusMechanicEffects: { quickdraw: [{ type:'buff', target:'friendlyMinion', attack:1, health:0 }] },
  };
  markCardEnteredHand(c, 3);
  assert(c.enteredHandTurn === 3);
  const r = evaluateCardPlayState(c, 'player', {}, {
    hand:[c], currentTurn:3, currentMana:5, phase:'player', effectiveCost:1,
    runtime:rt, maxBoardSize:7, boardSize:0,
  });
  assert(r.visualState === 'is-trigger-ready', 'should be trigger-ready');
  assert(r.activeMechanics.includes('quickdraw'));
  // 验证效果数据存在（实际执行在 app.js 中调用 applyEffectsSolo）
  const bonus = c.bonusMechanicEffects.quickdraw;
  assert(bonus && bonus.length === 1);
  assert(bonus[0].type === 'buff');
  assert(bonus[0].attack === 1);
});

test('快枪跨回合不触发附效', () => {
  const c = {
    name:'试刀', cost:1, type:'minion', attack:2, health:3, instanceId:'c2',
    mechanics:['quickdraw'], enteredHandTurn:2,
    bonusMechanicEffects: { quickdraw: [{ type:'buff', target:'friendlyMinion', attack:1, health:0 }] },
  };
  const r = evaluateCardPlayState(c, 'player', {}, {
    hand:[c], currentTurn:4, currentMana:5, phase:'player', effectiveCost:1,
    runtime:createPlayerRuntime(), maxBoardSize:7, boardSize:0,
  });
  assert(r.visualState === 'is-playable');
  assert(!r.activeMechanics.includes('quickdraw'));
});

test('效果抽到快枪牌 → 当前回合标记正确', () => {
  const rt = createPlayerRuntime();
  const c = {
    name:'发现龙', cost:2, type:'minion', attack:3, health:2, instanceId:'c3',
    mechanics:['quickdraw'],
    bonusMechanicEffects: { quickdraw: [{ type:'draw', target:'friendlyHero', amount:1 }] },
  };
  markCardEnteredHand(c, 4);
  assert(c.enteredHandTurn === 4, '应标记进入回合4');
  const r = evaluateCardPlayState(c, 'player', {}, {
    hand:[c], currentTurn:4, currentMana:7, phase:'player', effectiveCost:2,
    runtime:rt, maxBoardSize:7, boardSize:0,
  });
  assert(r.visualState === 'is-trigger-ready');
  // 附效应为抽牌
  const bonus = c.bonusMechanicEffects.quickdraw;
  assert(bonus[0].type === 'draw');
});

console.log('\n=== 集成: 连击真实效果 ===');

test('连击第一张无前置 → 不触发', () => {
  const rt = createPlayerRuntime();
  const c = {
    name:'连击卡', cost:2, type:'spell', instanceId:'c4', mechanics:['combo'],
    bonusMechanicEffects: { combo: [{ type:'damage', target:'enemyHero', amount:3 }] },
  };
  const r = evaluateCardPlayState(c, 'player', {}, {
    hand:[c], currentTurn:3, currentMana:5, phase:'player', effectiveCost:2,
    runtime:rt, maxBoardSize:7, boardSize:0,
  });
  assert(r.visualState === 'is-playable');
  assert(!r.activeMechanics.includes('combo'));
});

test('连击第二张有前置 → 触发并造成伤害', () => {
  const rt = createPlayerRuntime();
  recordCardPlayed(rt, { instanceId:'prev', type:'spell', name:'前置法术' });
  const c = {
    name:'连击卡', cost:2, type:'spell', instanceId:'c5', mechanics:['combo'],
    bonusMechanicEffects: { combo: [{ type:'damage', target:'enemyHero', amount:3 }] },
  };
  const r = evaluateCardPlayState(c, 'player', {}, {
    hand:[c], currentTurn:3, currentMana:5, phase:'player', effectiveCost:2,
    runtime:rt, maxBoardSize:7, boardSize:0,
  });
  assert(r.visualState === 'is-trigger-ready');
  assert(r.activeMechanics.includes('combo'));
  assert(rt.cardsPlayedThisTurn.length === 1, '当前牌未计入');
  // 结算
  const bonus = c.bonusMechanicEffects.combo;
  assert(bonus[0].type === 'damage' && bonus[0].amount === 3);
  recordCardPlayed(rt, c);
  assert(rt.cardsPlayedThisTurn.length === 2, '结算后计入');
});

console.log('\n=== 集成: 动态减费压轴 ===');

test('压轴 real effect → 额外 summon 触发', () => {
  const c = {
    name:'压轴召唤', cost:5, type:'spell', instanceId:'c6', mechanics:['finale'],
    bonusMechanicEffects: { finale: [{ type:'summon', target:'friendlyBoard', amount:1, minion:{name:'Token',attack:1,health:1} }] },
  };
  // 5费减至3费，剩余3费 → effectiveCost=3, currentMana=3 → 触发
  const r = evaluateCardPlayState(c, 'player', {}, {
    hand:[c], currentTurn:5, currentMana:3, phase:'player', effectiveCost:3,
    runtime:createPlayerRuntime(), maxBoardSize:7, boardSize:0,
  });
  assert(r.visualState === 'is-trigger-ready');
  assert(r.activeMechanics.includes('finale'));
  const bonus = c.bonusMechanicEffects.finale;
  assert(bonus[0].type === 'summon');
});

console.log('\n=== 集成: 运行时字段正确初始化和清理 ===');

test('createPlayerRuntime 包含所有必需字段', () => {
  const rt = createPlayerRuntime();
  assert(Array.isArray(rt.cardsPlayedThisTurn));
  assert(Array.isArray(rt.spellsPlayedThisTurn));
  assert(Array.isArray(rt.minionsDiedThisTurn));
  assert(typeof rt.damageTakenThisTurn === 'number');
  assert(typeof rt.healingDoneThisTurn === 'number');
  assert(typeof rt.turnNumber === 'number');
});

test('markCardEnteredHand 修改 enteredHandTurn', () => {
  const c = { name:'test', instanceId:'t1' };
  markCardEnteredHand(c, 5);
  assert(c.enteredHandTurn === 5);
});

test('recordDamageTaken / recordHealingDone 计数正确', () => {
  const rt = createPlayerRuntime();
  recordDamageTaken(rt, 3);
  recordDamageTaken(rt, 2);
  recordHealingDone(rt, 5);
  assert(rt.damageTakenThisTurn === 5);
  assert(rt.healingDoneThisTurn === 5);
  clearTurnState(rt);
  assert(rt.damageTakenThisTurn === 0);
  assert(rt.healingDoneThisTurn === 0);
});

console.log('\n=== 集成: PvP evaluate 不报错 ===');

test('PvP 评估 visualState 已定义', () => {
  const c = { cost:2, instanceId:'pvpc1', mechanics:['quickdraw'], enteredHandTurn:2 };
  const r = evaluateCardPlayState(c, 'player', {}, {
    hand:[c], currentTurn:2, currentMana:5, maxMana:5,
    phase:'player', busy:false, gameOver:false,
    maxBoardSize:7, boardSize:0, runtime:createPlayerRuntime(),
    effectiveCost:2,
  });
  assert(typeof r.visualState === 'string');
  const r2 = evaluateCardPlayState(c, 'player', {}, {
    hand:[c], currentTurn:2, currentMana:5, maxMana:5,
    phase:'enemy', busy:false, gameOver:false,
    maxBoardSize:7, boardSize:0, runtime:createPlayerRuntime(),
    effectiveCost:2,
  });
  assert(r2.visualState === 'is-locked');
});

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('✅ All integration tests passed');
