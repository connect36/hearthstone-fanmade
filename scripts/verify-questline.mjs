import assert from 'node:assert/strict';

import { cards, cardById, currentDeckCollection, deckCollections, starterDeck } from '../public/game-data.js';
import { GameEngine } from '../server/game-engine.mjs';

const deckTotal = starterDeck.reduce((total, entry) => total + entry.count, 0);
assert.equal(deckTotal, 30, '任务术预设必须正好为 30 张');
assert.equal(starterDeck.length, 17, '当前黑眼任务术预设应包含 17 种卡');
assert.equal(deckCollections.length, 2, '应保留原始任务术和当前黑眼任务术两套归档');
assert.equal(currentDeckCollection.entries.reduce((sum, entry) => sum + entry.count, 0), 30);
for (const cardId of ['hs-43128', 'hs-56523', 'hs-59035', 'hs-95688']) {
  assert.ok(cardById[cardId], `缺少新卡牌条目：${cardId}`);
}
assert.equal(cardById['hs-42471'], undefined, '旧版亵渎不应保留为重复卡牌条目');
assert.deepEqual(cardById['hs-95688'].dbfIds, [95688, 42471], '亵渎应保留两个历史 DBF ID');

const engine = new GameEngine();
engine.getCardsLookup = () => cardById;

const runtime = () => ({
  selfDamageThisTurn: 0,
  selfDamageThisGame: 0,
  damageTakenThisTurn: 0,
  healthChangesThisTurn: 0,
  healthChangesThisGame: 0,
  questline: null,
  redirectSelfDamage: false,
  delayedDamage: [],
});

const state = {
  turn: 1,
  activePlayerId: 'p1',
  actionLog: [],
  player1: {
    socketId: 'p1', heroName: '任务术玩家', health: 100, armor: 0,
    mana: 10, maxMana: 10, deck: [], hand: [], board: [], runtime: runtime(),
  },
  player2: {
    socketId: 'p2', heroName: '测试对手', health: 100, armor: 0,
    mana: 10, maxMana: 10, deck: [], hand: [], board: [], runtime: runtime(),
  },
};

engine.applyEffects(state, cardById['hs-64900'].effects, 'player1', null, {
  trigger: 'onPlay',
  sourceCard: cardById['hs-64900'],
});
assert.deepEqual(state.player1.runtime.questline.thresholds, [12, 12, 12]);

engine.applySelfDamage(state, 'player1', 12);
assert.equal(state.player1.runtime.questline.stage, 1);
engine.applySelfDamage(state, 'player1', 12);
assert.equal(state.player1.runtime.questline.stage, 2);
engine.applySelfDamage(state, 'player1', 12);
assert.equal(state.player1.runtime.questline.completed, true);
assert.equal(state.player1.hand.some((card) => card.id === 'hs-67547'), true, '完成任务线后应获得塔姆辛');

state.player1.health = 20;
assert.equal(engine.getEffectiveCardCost(state.player1, cardById['hs-1372']), 10, '熔核巨人应按缺失生命减费');
state.player1.runtime.selfDamageThisGame = 5;
assert.equal(engine.getEffectiveCardCost(state.player1, cardById['hs-97614']), 4, '被禁锢的恐魔应按本局自伤减费');
state.player1.runtime.healthChangesThisTurn = 4;
state.player1.runtime.healthChangesThisGame = 4;
assert.equal(engine.getEffectiveCardCost(state.player1, cardById['hs-59585']), 6, '血肉巨人应按生命变化次数减费');
engine.beginTurn(state, 'p1', { increaseMana: false, drawCard: false, readyBoard: false, logTurn: false });
assert.equal(state.player1.runtime.healthChangesThisTurn, 0, '回合生命变化计数应重置');
assert.equal(state.player1.runtime.healthChangesThisGame, 4, '本局生命变化计数不应重置');
assert.equal(engine.getEffectiveCardCost(state.player1, cardById['hs-59585']), 6, '血肉巨人减费应跨回合保留');

assert.equal(cards.some((card) => card.id === 'hs-67547'), true);
console.log('Questline verification passed: 17-type/30-card preset, 3-stage questline, final reward, and dynamic costs.');
