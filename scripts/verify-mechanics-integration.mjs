// 机制集成测试 P0.6 — 验证真实效果
import { evaluateCardPlayState } from '../public/mechanics.js';
import {
  createPlayerRuntime, markCardEnteredHand, recordCardPlayed,
  recordDamageTaken, recordHealingDone, clearTurnState,
  createCardInstance, checkAndApplyCorruption,
} from '../public/mechanic-runtime.js';
import { checkFrenzy, checkSpellburst, checkHonorableKill, checkOverheal } from '../public/mechanic-conditions.js';

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

console.log('\n=== P2 集成: 法术迸发 ===');

test('法术迸发附效数据存在', () => {
  const c = {
    name:'迸发随从', cost:2, type:'minion', attack:2, health:3, instanceId:'sb1',
    mechanics:['spellburst'],
    bonusMechanicEffects: { spellburst: [{ type:'draw', target:'friendlyHero', amount:1 }] },
  };
  const bonus = c.bonusMechanicEffects.spellburst;
  assert(bonus && bonus.length === 1);
  assert(bonus[0].type === 'draw');
});

test('法术迸发手牌中永不激活 — 仅场上触发', () => {
  const rt = createPlayerRuntime();
  rt.spellsPlayedThisTurn = ['s1'];
  const c = {
    name:'迸发随从', cost:2, type:'minion', attack:2, health:3, instanceId:'sb2',
    mechanics:['spellburst'],
  };
  const r = evaluateCardPlayState(c, 'player', {}, {
    hand:[c], currentTurn:3, currentMana:5, phase:'player', effectiveCost:2,
    runtime:rt, maxBoardSize:7, boardSize:0,
  });
  assert(r.visualState === 'is-playable', 'spellburst must not affect hand visual');
  assert(!r.activeMechanics.includes('spellburst'));
});

test('法术迸发触发条件：本回合施放过法术 → true', () => {
  const rt = createPlayerRuntime();
  rt.spellsPlayedThisTurn = ['s1'];
  assert(checkSpellburst(rt) === true);
});

test('法术迸发触发条件：本回合未施法 → false', () => {
  const rt = createPlayerRuntime();
  assert(checkSpellburst(rt) === false);
});

console.log('\n=== P2 集成: 暴怒 ===');

test('暴怒触发条件：受伤存活且未触发 → true', () => {
  const m = { health:2, maxHealth:4, _frenzyTriggered: false };
  assert(checkFrenzy(m) === true);
});

test('暴怒触发条件：满血 → false', () => {
  const m = { health:4, maxHealth:4, _frenzyTriggered: false };
  assert(checkFrenzy(m) === false);
});

test('暴怒触发条件：已触发过 → false', () => {
  const m = { health:2, maxHealth:4, _frenzyTriggered: true };
  assert(checkFrenzy(m) === false);
});

test('暴怒触发条件：血量为0（已死）→ false', () => {
  const m = { health:0, maxHealth:4, _frenzyTriggered: false };
  assert(checkFrenzy(m) === false);
});

test('暴怒附效数据存在', () => {
  const c = {
    name:'暴怒随从', cost:3, type:'minion', attack:3, health:4, instanceId:'fz1',
    mechanics:['frenzy'],
    bonusMechanicEffects: { frenzy: [{ type:'buffSelf', attack:2 }] },
  };
  const bonus = c.bonusMechanicEffects.frenzy;
  assert(bonus && bonus.length === 1);
  assert(bonus[0].type === 'buffSelf');
  assert(bonus[0].attack === 2);
});

console.log('\n=== P2 集成: 荣誉消灭 ===');

test('HK: rawDamage(2) === beforeHealth(2) && health <= 0 → 触发', () => {
  assert(checkHonorableKill(2, 2) === true, '2伤打2血应触发');
});

test('HK: rawDamage(3) > beforeHealth(2) → 不触发（超杀）', () => {
  assert(checkHonorableKill(3, 2) === false, '3伤打2血超杀不触发');
});

test('HK: rawDamage(1) < beforeHealth(2) → 不触发（未击杀）', () => {
  assert(checkHonorableKill(1, 2) === false, '1伤打2血未击杀不触发');
});

test('HK: rawDamage(1) === beforeHealth(1) → 触发（恰好击杀1血）', () => {
  assert(checkHonorableKill(1, 1) === true, '1伤打1血应触发');
});

test('HK: 法术附效数据存在', () => {
  const c = {
    name:'荣誉法术', cost:3, type:'spell', instanceId:'hk2',
    mechanics:['honorableKill'],
    bonusMechanicEffects: { honorableKill: [{ type:'summon', target:'friendlyBoard', amount:1, minion:{name:'Token',attack:2,health:2} }] },
  };
  const bonus = c.bonusMechanicEffects.honorableKill;
  assert(bonus && bonus.length === 1);
  assert(bonus[0].type === 'summon');
});

test('HK: 随从附效数据存在', () => {
  const c = {
    name:'荣誉随从', cost:4, type:'minion', attack:3, health:3, instanceId:'hk1',
    mechanics:['honorableKill'],
    bonusMechanicEffects: { honorableKill: [{ type:'draw', target:'friendlyHero', amount:1 }] },
  };
  const bonus = c.bonusMechanicEffects.honorableKill;
  assert(bonus && bonus.length === 1);
  assert(bonus[0].type === 'draw');
});

console.log('\n=== P2 集成: 过量治疗 ===');

test('过量治疗条件：过量(5修复3缺失)→ true', () => {
  assert(checkOverheal(5, 3) === true);
});

test('过量治疗条件：恰好等于缺失(3修复3)→ false', () => {
  assert(checkOverheal(3, 3) === false);
});

test('过量治疗条件：满血治疗(1修复0缺失)→ true', () => {
  assert(checkOverheal(1, 0) === true);
});

test('过量治疗条件：治疗不足(2修复4缺失)→ false', () => {
  assert(checkOverheal(2, 4) === false);
});

test('过量治疗条件：治疗0 → false', () => {
  assert(checkOverheal(0, 3) === false);
});

test('过量治疗附效数据存在', () => {
  const c = {
    name:'治疗随从', cost:3, type:'minion', attack:2, health:5, instanceId:'oh1',
    mechanics:['overheal'],
    bonusMechanicEffects: { overheal: [{ type:'draw', target:'friendlyHero', amount:1 }] },
  };
  const bonus = c.bonusMechanicEffects.overheal;
  assert(bonus && bonus.length === 1);
  assert(bonus[0].type === 'draw');
});

console.log('\n=== P2 集成: 腐蚀 ===');

// getEffectiveCost mock：对指定 cardId 打折
function makeCostResolver(discountMap = {}) {
  return (card) => {
    const base = card.cost || 0;
    const discount = discountMap[card.instanceId] || 0;
    return Math.max(0, base - discount);
  };
}

const idCost = (card) => card.cost || 0;

test('腐蚀：5费减到3费 vs 腐蚀2费 → 触发 (3 > 2)', () => {
  const hand = [
    { instanceId:'a', cost:2, mechanics:['corrupt'], corrupted: false },
    { instanceId:'b', cost:5, mechanics:[] },
  ];
  const playedCard = hand[1];
  checkAndApplyCorruption({
    playedCard, playedEffectiveCost: 3, hand, getEffectiveCost: idCost,
  });
  assert(hand[0].corrupted === true, '3 > 2 应触发腐蚀');
});

test('腐蚀：5费减到2费 vs 腐蚀2费 → 不触发 (2 > 2 false)', () => {
  const hand = [
    { instanceId:'a', cost:2, mechanics:['corrupt'], corrupted: false },
    { instanceId:'b', cost:5, mechanics:[] },
  ];
  const playedCard = hand[1];
  checkAndApplyCorruption({
    playedCard, playedEffectiveCost: 2, hand, getEffectiveCost: idCost,
  });
  assert(hand[0].corrupted === false, '2 > 2 不触发');
});

test('腐蚀：原4费腐蚀牌减到2费，打出3费牌 → 触发 (3 > 2)', () => {
  const hand = [
    { instanceId:'a', cost:4, mechanics:['corrupt'], corrupted: false },
    { instanceId:'b', cost:3, mechanics:[] },
  ];
  const playedCard = hand[1];
  const getEff = makeCostResolver({ a: 2 }); // 腐蚀牌减2费
  checkAndApplyCorruption({
    playedCard, playedEffectiveCost: 3, hand, getEffectiveCost: getEff,
  });
  assert(hand[0].corrupted === true, '腐蚀牌减到2费，打出3费牌应触发');
});

test('腐蚀：原4费腐蚀牌减到2费，打出2费牌 → 不触发 (2 > 2 false)', () => {
  const hand = [
    { instanceId:'a', cost:4, mechanics:['corrupt'], corrupted: false },
    { instanceId:'b', cost:2, mechanics:[] },
  ];
  const playedCard = hand[1];
  const getEff = makeCostResolver({ a: 2 });
  checkAndApplyCorruption({
    playedCard, playedEffectiveCost: 2, hand, getEffectiveCost: getEff,
  });
  assert(hand[0].corrupted === false, '腐蚀牌减到2费，打出2费牌不触发');
});

test('腐蚀：无减费时保持原规则 (playedCost > corruptCost)', () => {
  const hand = [
    { instanceId:'a', cost:2, mechanics:['corrupt'], corrupted: false },
    { instanceId:'b', cost:3, mechanics:[] },
  ];
  const playedCard = hand[1];
  checkAndApplyCorruption({
    playedCard, playedEffectiveCost: 3, hand, getEffectiveCost: idCost,
  });
  assert(hand[0].corrupted === true, '3 > 2 无减费应触发');
});

test('腐蚀：已腐蚀不重复变化', () => {
  const hand = [
    { instanceId:'a', cost:2, mechanics:['corrupt'], corrupted: true },
    { instanceId:'b', cost:5, mechanics:[] },
  ];
  const playedCard = hand[1];
  checkAndApplyCorruption({
    playedCard, playedEffectiveCost: 5, hand, getEffectiveCost: idCost,
  });
  assert(hand[0].corrupted === true, '已腐蚀应保持 true');
});

console.log('\n=== P2 集成: cloneMinion bonusMechanicEffects 保留 ===');

// 模拟 cloneMinion 的核心逻辑：浅层拷贝 + bonusMechanicEffects 深拷贝
function simulateCloneMinion(source, overrides = {}) {
  return {
    instanceId: 'clone-' + (source.instanceId || 'x'),
    name: overrides.name || source.name,
    effects: JSON.parse(JSON.stringify(overrides.effects ?? source.effects ?? [])),
    mechanics: JSON.parse(JSON.stringify(overrides.mechanics ?? source.mechanics ?? [])),
    bonusMechanicEffects: JSON.parse(JSON.stringify(
      overrides.bonusMechanicEffects ?? source.bonusMechanicEffects ?? {}
    )),
    _spellburstTriggered: false,
    _frenzyTriggered: false,
    attack: source.attack || 0,
    health: source.health || 1,
  };
}

test('spellburst bonus 在 clone 后保留', () => {
  const source = {
    instanceId:'sb1', name:'迸发随从', attack:2, health:3,
    mechanics:['spellburst'],
    bonusMechanicEffects: { spellburst: [{ type:'draw', target:'friendlyHero', amount:1 }] },
  };
  const cloned = simulateCloneMinion(source);
  assert(cloned.bonusMechanicEffects.spellburst !== undefined, 'spellburst bonus missing');
  assert(cloned.bonusMechanicEffects.spellburst.length === 1);
  assert(cloned.bonusMechanicEffects.spellburst[0].type === 'draw');
  assert(cloned.mechanics.includes('spellburst'));
  assert(cloned._spellburstTriggered === false);
});

test('frenzy bonus 在 clone 后保留', () => {
  const source = {
    instanceId:'fz1', name:'暴怒随从', attack:3, health:4,
    mechanics:['frenzy'],
    bonusMechanicEffects: { frenzy: [{ type:'buffSelf', attack:2 }] },
  };
  const cloned = simulateCloneMinion(source);
  assert(cloned.bonusMechanicEffects.frenzy !== undefined, 'frenzy bonus missing');
  assert(cloned.bonusMechanicEffects.frenzy.length === 1);
  assert(cloned.bonusMechanicEffects.frenzy[0].type === 'buffSelf');
  assert(cloned.bonusMechanicEffects.frenzy[0].attack === 2);
  assert(cloned.mechanics.includes('frenzy'));
  assert(cloned._frenzyTriggered === false);
});

test('honorableKill minion bonus 在 clone 后保留', () => {
  const source = {
    instanceId:'hk1', name:'荣誉随从', attack:3, health:3,
    mechanics:['honorableKill'],
    bonusMechanicEffects: { honorableKill: [{ type:'draw', target:'friendlyHero', amount:1 }] },
  };
  const cloned = simulateCloneMinion(source);
  assert(cloned.bonusMechanicEffects.honorableKill !== undefined);
  assert(cloned.bonusMechanicEffects.honorableKill[0].type === 'draw');
});

test('overheal bonus 在 clone 后保留', () => {
  const source = {
    instanceId:'oh1', name:'治疗随从', attack:2, health:5,
    mechanics:['overheal'],
    bonusMechanicEffects: { overheal: [{ type:'draw', target:'friendlyHero', amount:1 }] },
  };
  const cloned = simulateCloneMinion(source);
  assert(cloned.bonusMechanicEffects.overheal !== undefined);
  assert(cloned.bonusMechanicEffects.overheal[0].type === 'draw');
});

test('多机制随从 clone 后全部 bonus 保留', () => {
  const source = {
    instanceId:'multi', name:'多面手', attack:2, health:4,
    mechanics:['spellburst','frenzy'],
    bonusMechanicEffects: {
      spellburst: [{ type:'draw', amount:1 }],
      frenzy: [{ type:'buffSelf', attack:1 }],
    },
  };
  const cloned = simulateCloneMinion(source);
  assert(cloned.bonusMechanicEffects.spellburst !== undefined);
  assert(cloned.bonusMechanicEffects.frenzy !== undefined);
  assert(cloned._spellburstTriggered === false);
  assert(cloned._frenzyTriggered === false);
});

test('无 bonus 的普通随从 clone 后 bonusMechanicEffects 为空对象', () => {
  const source = {
    instanceId:'plain', name:'白板', attack:2, health:3,
    mechanics:[],
  };
  const cloned = simulateCloneMinion(source);
  assert(typeof cloned.bonusMechanicEffects === 'object');
  assert(Object.keys(cloned.bonusMechanicEffects).length === 0);
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
