// 火焰龙战 AI 引擎 v2 — 逐动作重新规划 + 一步模拟
// ================================================================
// 状态辅助
// ================================================================
function hasWeapon(b) { return b.weapon && b.weapon.durability > 0; }
function enemyHP(p) { return p.health + (p.armor || 0); }
function ownHP(b) { return b.health + (b.armor || 0); }

// ================================================================
// 局面评分 — 选择动作后的局面优劣
// ================================================================
function evaluateState(state, playerSide, bossSide) {
  const p = state.solo[playerSide];
  const b = state.solo[bossSide];
  let s = 0;
  // 生命
  s += ownHP(b) * 1.0;
  s -= enemyHP(p) * 1.15;
  // 场攻
  const bReady = (b.board||[]).filter(m=>m.canAttack).reduce((x,m)=>x+m.attack,0);
  const bSleep = (b.board||[]).filter(m=>!m.canAttack&&m.sleeping).reduce((x,m)=>x+m.attack,0);
  const bHp = (b.board||[]).reduce((x,m)=>x+(m.health||0),0);
  const pReady = (p.board||[]).filter(m=>m.canAttack).reduce((x,m)=>x+m.attack,0);
  const pSleep = (p.board||[]).filter(m=>!m.canAttack&&m.sleeping).reduce((x,m)=>x+m.attack,0);
  const pHp = (p.board||[]).reduce((x,m)=>x+(m.health||0),0);
  s += bReady*1.35 + bSleep*1.0 + bHp*0.55;
  s -= pReady*1.50 + pSleep*0.9 + pHp*0.55;
  // 手牌
  s += (b.hand||[]).length * 2.4;
  // 武器
  if (hasWeapon(b)) s += b.weapon.attack * b.weapon.durability * 0.65;
  // 龙协同
  if ((b.hand||[]).some(c=>(c.tribes||[]).includes('dragon'))) s += 1.5;
  return s;
}

// ================================================================
// 实际费用计算
// ================================================================
function getCardCost(state, card, bossSide) {
  const b = state.solo[bossSide];
  let cost = card.cost || 0;
  if (!card.costModifier) return cost;
  const m = card.costModifier;
  if (m.rule === 'holdingAnotherDragon') {
    if ((b.hand||[]).some(c=>c.instanceId!==card.instanceId&&(c.tribes||[]).includes('dragon')))
      cost = Math.max(m.minimum||0, cost-(m.amount||3));
  } else if (m.rule === 'kindredDragon') {
    if ((b.tribesPlayedLastTurn||[]).includes('dragon'))
      cost = Math.max(m.minimum||0, cost-(m.amount||3));
  }
  return Math.max(0, cost);
}

// ================================================================
// 深度克隆
// ================================================================
function cloneState(state) { return JSON.parse(JSON.stringify(state)); }

// ================================================================
// 模拟执行一个动作，返回新局面 (修改传入的sim)
// ================================================================
function simulateAction(sim, action, bossSide, playerSide) {
  const b = sim.solo[bossSide];
  const p = sim.solo[playerSide];

  if (action.type === 'play') {
    const card = b.hand.find(c=>c.instanceId===action.card?.instanceId);
    if (!card) return null;
    const cost = getCardCost(sim, card, bossSide);
    if (b.mana < cost) return null;
    b.mana -= cost;
    b.hand = b.hand.filter(c=>c.instanceId!==card.instanceId);
    if ((card.tribes||[]).includes('dragon')) b.tribesPlayedThisTurn = [...(b.tribesPlayedThisTurn||[]),'dragon'];
    if (card.spellSchool==='fire') b.playedFireSpellThisTurn = true;
    // 地标
    if (card.type==='location') {
      b.locations = [...(b.locations||[]),{instanceId:'sim-'+Math.random(),sourceId:card.id,durability:card.durability||3,maxDurability:card.durability||3,usedThisTurn:false}];
    } else if (card.type==='minion') {
      const m={...card,side:'boss',maxHealth:card.health,sleeping:true,canAttack:false,divineShield:false};
      if ((card.keywords||[]).includes('charge')) { m.sleeping=false; m.canAttack=true; }
      if ((card.keywords||[]).includes('rush')) { m.sleeping=false; m.canAttack=true; m.rushOnly=true; }
      b.board.push(m);
      // 战吼效果简化模拟
      for (const e of (card.effects||[])) {
        if (e.trigger&&e.trigger!=='battlecry') continue;
        if (e.type==='equipWeapon') b.weapon={attack:Number(e.attack)||2,durability:Number(e.durability)||2};
        if (e.type==='heroGainAttack') b.heroAttackThisTurn=(b.heroAttackThisTurn||0)+(Number(e.amount)||0);
        if (e.type==='refreshMana') b.mana=Math.min(b.maxMana,b.mana+(Number(e.amount)||2));
        if (e.type==='damage' && e.target==='allMinions') {
          for (const m2 of p.board) m2.health-=(Number(e.amount)||1);
          p.board=p.board.filter(m2=>m2.health>0);
        }
        if (e.type==='armor'&&e.target==='friendlyHero') b.armor=(b.armor||0)+(Number(e.amount)||0);
      }
    } else {
      // 法术 — 简化模拟伤害/护甲
      for (const e of (card.effects||[])) {
        if (e.type==='damage'&&e.target==='allMinions') {
          for (const m2 of p.board) m2.health-=(Number(e.amount)||1);
          p.board=p.board.filter(m2=>m2.health>0);
        }
        if (e.type==='armor'&&e.target==='friendlyHero') b.armor=(b.armor||0)+(Number(e.amount)||0);
        if (e.type==='heroGainAttack') b.heroAttackThisTurn=(b.heroAttackThisTurn||0)+(Number(e.amount)||0);
      }
    }
    return sim;
  }

  if (action.type==='heroPower') {
    const cost = action.cost || 2;
    if (b.mana<cost||b.heroPowerUsed) return null;
    b.mana-=cost;
    b.heroPowerUsed=true;
    b.armor=(b.armor||0)+2;
    return sim;
  }

  if (action.type==='attack') {
    const atk = b.board.find(m=>m.instanceId===action.attacker?.instanceId);
    if (!atk||!atk.canAttack) return null;
    if (action.target==='face') {
      const dmg = atk.attack||0;
      if (p.armor>0) { const a=Math.min(p.armor,dmg); p.armor-=a; p.health-=(dmg-a); }
      else p.health-=dmg;
      atk.canAttack=false;
    } else {
      const def = p.board.find(m=>m.instanceId===action.target?.instanceId);
      if (!def) return null;
      const ad=atk.attack||0, dd=def.attack||0;
      def.health-=ad; atk.health-=dd;
      atk.canAttack=false;
      p.board=p.board.filter(m=>m.health>0);
      b.board=b.board.filter(m=>m.health>0);
    }
    return sim;
  }

  if (action.type==='heroAttack') {
    const atk = Math.max(b.heroAttackThisTurn||0, b.weapon?.attack||0);
    if (atk<=0||b.heroAttackUsedThisTurn) return null;
    if (action.target==='face') {
      if (p.armor>0) { const a=Math.min(p.armor,atk); p.armor-=a; p.health-=(atk-a); }
      else p.health-=atk;
    } else {
      const def = p.board.find(m=>m.instanceId===action.target?.instanceId);
      if (!def) return null;
      def.health-=atk;
      p.board=p.board.filter(m=>m.health>0);
    }
    b.heroAttackUsedThisTurn=true;
    if (b.weapon) { b.weapon.durability--; if(b.weapon.durability<=0) b.weapon=null; }
    return sim;
  }

  if (action.type==='location') {
    const loc = b.locations.find(l=>l.instanceId===action.location?.instanceId);
    if (!loc||loc.durability<=0||loc.usedThisTurn) return null;
    if (loc.sourceId==='dw-crimson-abyss') {
      const t = action.target ? b.board.find(m=>m.instanceId===action.target.instanceId) : null;
      if (t) { t.health-=1; t.attack=(t.attack||0)+2; b.board=b.board.filter(m=>m.health>0); }
    } else if (loc.sourceId==='dw-erupting-volcano') {
      const dmg = b.playedFireSpellThisTurn ? 6 : 3;
      let rem = dmg;
      const targets = [{k:'hero',e:p}];
      for (const m of p.board) targets.push({k:'minion',e:m});
      while (rem>0&&targets.length>0) {
        const i=Math.floor(Math.random()*targets.length);
        const t=targets[i];
        const hit=Math.min(rem,t.e.health||99);
        t.e.health-=hit; rem-=hit;
        if (t.e.health<=0) targets.splice(i,1);
      }
      p.board=p.board.filter(m=>m.health>0);
    }
    loc.durability--;
    loc.usedThisTurn=true;
    if (loc.durability<=0) b.locations=b.locations.filter(l=>l.instanceId!==loc.instanceId);
    return sim;
  }

  return null; // endTurn or unknown
}

// ================================================================
// 生成合法动作
// ================================================================
function generateLegalActions(state, playerSide, bossSide, bossHeroPower) {
  const b = state.solo[bossSide];
  const p = state.solo[playerSide];
  const actions = [];
  // 出牌
  for (const card of (b.hand||[])) {
    const cost = getCardCost(state, card, bossSide);
    if (cost > b.mana) continue;
    if (card.type==='minion' && b.board.length>=7) continue;
    const targets = findTargets(card, state, bossSide, playerSide);
    if (targets.length===0) {
      actions.push({type:'play',card,target:null,cost,score:scorePlay(card,null,state,bossSide,playerSide)});
    } else {
      for (const t of targets) {
        actions.push({type:'play',card,target:t,cost,score:scorePlay(card,t,state,bossSide,playerSide)});
      }
    }
  }
  // 英雄技能
  if (bossHeroPower && !b.heroPowerUsed && b.mana>=(bossHeroPower.cost||2)) {
    actions.push({type:'heroPower',cost:bossHeroPower.cost||2,score:scoreHeroPowerAct(b,p,bossHeroPower)});
  }
  // 随从攻击
  for (const m of (b.board||[])) {
    if (!m.canAttack) continue;
    actions.push({type:'attack',attacker:m,target:'face',score:scoreAttackFace(m,state,bossSide,playerSide)});
    for (const em of (p.board||[])) {
      actions.push({type:'attack',attacker:m,target:em,score:scoreAttackTrade(m,em,state,bossSide,playerSide)});
    }
  }
  // 英雄攻击
  const heroAtk = Math.max(b.heroAttackThisTurn||0, b.weapon?.attack||0);
  if (heroAtk>0 && !b.heroAttackUsedThisTurn) {
    actions.push({type:'heroAttack',target:'face',score:scoreHeroFace(state,bossSide,playerSide)});
    for (const em of (p.board||[])) {
      actions.push({type:'heroAttack',target:em,score:scoreHeroTrade(em,state,bossSide,playerSide)});
    }
  }
  // 地标
  for (const loc of (b.locations||[])) {
    if (loc.durability<=0||loc.usedThisTurn) continue;
    if (loc.sourceId==='dw-crimson-abyss') {
      for (const m of b.board) actions.push({type:'location',location:loc,target:m,score:scoreCrimson(m,state,bossSide)});
    } else if (loc.sourceId==='dw-erupting-volcano') {
      actions.push({type:'location',location:loc,target:'random',score:scoreVolcano(state,bossSide,playerSide)});
    }
  }
  // 结束回合
  actions.push({type:'endTurn',score:0});
  return actions;
}

// ================================================================
// 目标查找
// ================================================================
function findTargets(card, state, bossSide, playerSide) {
  const p = state.solo[playerSide];
  const b = state.solo[bossSide];
  const targets = [];
  for (const e of (card.effects||[])) {
    const walk = (eff) => {
      if (eff.type==='conditional') { for (const s of (eff.effects||[])) walk(s); return; }
      if (eff.target==='playerChoice') {
        const kinds = eff.targetKinds||['minion','hero'];
        if (kinds.includes('minion')) {
          for (const m of p.board) targets.push({side:playerSide,kind:'minion',id:m.instanceId});
          for (const m of b.board) targets.push({side:bossSide,kind:'minion',id:m.instanceId});
        }
        if (kinds.includes('hero')) {
          targets.push({side:playerSide,kind:'hero'});
          targets.push({side:bossSide,kind:'hero'});
        }
      }
      if (eff.target==='enemyMinion') for (const m of p.board) targets.push({side:playerSide,kind:'minion',id:m.instanceId});
      if (eff.target==='friendlyMinion') for (const m of b.board) targets.push({side:bossSide,kind:'minion',id:m.instanceId});
      if (eff.target==='allMinions') {} // no target needed
    };
    walk(e);
  }
  return targets;
}

// ================================================================
// 行动评分
// ================================================================
function scorePlay(card, target, state, bossSide, playerSide) {
  const b=state.solo[bossSide]; const p=state.solo[playerSide];
  let s=3;
  // 减费感受
  const cost = getCardCost(state,card,bossSide);
  if (cost < (card.cost||0)) s+=2;
  // 龙锚点
  const dragonsBefore = (b.hand||[]).filter(c=>(c.tribes||[]).includes('dragon')).length;
  const isDragon = (card.tribes||[]).includes('dragon');
  const needsDragon = needsDragonCond(card);
  const dragonsAfter = dragonsBefore - (isDragon?1:0);
  if (needsDragon && dragonsAfter===0 && dragonsBefore===1 && isDragon) s-=4;
  if (needsDragon && dragonsAfter>0) s+=1;
  // 高价值牌
  if (card.id==='dw-dark-scale-matron'&&dragonsAfter>0) s+=4.5;
  if (card.id==='dw-dark-scale-matron'&&dragonsAfter===0) s-=2.5;
  if (card.id==='dw-dragon-nest-guardian'&&dragonsAfter>0) s+=3;
  if (card.id==='dw-prescient-whelp'&&dragonsAfter>0) s+=5;
  if (card.id==='dw-windrider-dragon') s+=4;
  if (card.id==='dw-grommash') { if(hasSelfDmgTool(b)) s+=6; else s+=1; }
  // 火焰法术+火山
  if (card.spellSchool==='fire'&&(b.locations||[]).some(l=>l.sourceId==='dw-erupting-volcano'&&l.durability>0)) s+=3;
  // 目标评分
  if (target) {
    if (target.kind==='hero') {
      if (target.side===playerSide) {
        const remaining = p.health+p.armor;
        if (remaining<=5) s+=10; // 接近斩杀
        else if (remaining<=10) s+=4;
      }
    } else {
      const m = (target.side===playerSide?p.board:b.board).find(m=>m.instanceId===target.id);
      if (m) {
        if ((m.keywords||[]).some(k=>['taunt','windfury','lifesteal','poisonous'].includes(k))) s+=6;
        if (m.attack>=4) s+=4;
        if (m.health<=2) s+=2;
      }
    }
  }
  // 剩余法力浪费
  const rem = b.mana - cost;
  if (rem > 2) s -= 0.45 * rem;
  return s;
}

function needsDragonCond(card) {
  return (card.effects||[]).some(e=>{
    if (e.type==='conditional') return ['holdingDragon','holdingAnotherDragon'].includes(e.condition);
    return false;
  }) || (card.costModifier?.rule==='holdingAnotherDragon');
}

function hasSelfDmgTool(b) {
  return (b.hand||[]).some(c=>['dw-crimson-abyss','dw-scorching-fissure','dw-eternal-pain'].includes(c.id)) ||
    (b.locations||[]).some(l=>l.sourceId==='dw-crimson-abyss'&&l.durability>0) ||
    hasWeapon(b);
}

function scoreCrimson(target, state, bossSide) {
  let s=3;
  if (target.sourceId==='dw-grommash'&&target.health===target.maxHealth) s+=10;
  if (target.canAttack&&target.attack>0) s+=2;
  return s;
}

function scoreVolcano(state, bossSide, playerSide) {
  const b=state.solo[bossSide]; const p=state.solo[playerSide];
  const fire=b.playedFireSpellThisTurn; const dmg=fire?6:3;
  let s=2;
  const nb=(p.board||[]).length;
  if (nb===0) s+=dmg*1.2; else if (nb===1) s+=dmg*0.9; else s+=dmg*0.5;
  if (fire) s+=4;
  return s;
}

function scoreAttackFace(attacker, state, bossSide, playerSide) {
  const p=state.solo[playerSide];
  let s=3;
  if (enemyHP(p)<=attacker.attack) s=100;
  else if (enemyHP(p)<=attacker.attack*2) s=15;
  // 如果对手有高威胁随从，打脸减分
  const threats = (p.board||[]).filter(m=>m.attack>=4||(m.keywords||[]).some(k=>['taunt','windfury','lifesteal'].includes(k)));
  if (threats.length>0) s-=5;
  return s;
}

function scoreAttackTrade(attacker, defender, state, bossSide, playerSide) {
  let s=4;
  if ((defender.keywords||[]).some(k=>['taunt'].includes(k))) s+=8;
  if ((defender.keywords||[]).some(k=>['windfury','lifesteal','poisonous'].includes(k))) s+=6;
  if (defender.attack>=4) s+=4;
  if (defender.health<=2) s+=2;
  if (attacker.attack>defender.health) s+=2;
  if (defender.attack>=attacker.health) s-=3;
  return s;
}

function scoreHeroFace(state, bossSide, playerSide) {
  const b=state.solo[bossSide]; const p=state.solo[playerSide];
  const atk=Math.max(b.heroAttackThisTurn||0,b.weapon?.attack||0);
  if (enemyHP(p)<=atk) return 100;
  if ((p.board||[]).length===0) return 10;
  return 4;
}

function scoreHeroTrade(defender, state, bossSide, playerSide) {
  const b=state.solo[bossSide]; const atk=Math.max(b.heroAttackThisTurn||0,b.weapon?.attack||0);
  let s=3;
  if ((defender.keywords||[]).includes('taunt')) s+=6;
  if (atk>defender.health) s+=3;
  if (defender.attack>=4) s-=2;
  if (ownHP(b)<=10) s-=4;
  return s;
}

function scoreHeroPowerAct(boss, player, heroPower) {
  let s=2;
  if (ownHP(boss)<=15) s+=4; // 残血时叠甲重要
  if (boss.mana>5) s-=1; // 法力充裕时有更优选择
  return s;
}

// ================================================================
// 斩杀搜索
// ================================================================
function searchLethal(state, playerSide, bossSide, allActions) {
  const p=state.solo[playerSide]; const b=state.solo[bossSide];
  const enemyHp = enemyHP(p);
  let reachable = 0, mana = b.mana;
  const used = new Set();
  const plan = [];

  // 场攻
  for (const m of (b.board||[])) {
    if (m.canAttack) { reachable+=m.attack; used.add(m.instanceId); plan.push({type:'attack',attacker:m,target:'face',reason:`场攻${m.attack}`}); }
  }
  // 英雄攻击
  const hAtk = Math.max(b.heroAttackThisTurn||0, b.weapon?.attack||0);
  if (hAtk>0 && !b.heroAttackUsedThisTurn) { reachable+=hAtk; plan.push({type:'heroAttack',target:'face',reason:`英雄${hAtk}`}); }
  // 格罗玛什
  const grom = (b.hand||[]).find(c=>c.id==='dw-grommash');
  if (grom) {
    const gc = getCardCost(state,grom,bossSide);
    const crimson = (b.locations||[]).find(l=>l.sourceId==='dw-crimson-abyss'&&l.durability>0);
    if (crimson && mana>=gc) { reachable+=12; plan.push({type:'play',card:grom,target:null,reason:'格罗玛什+地标12'}); mana-=gc; }
    const fissure = (b.hand||[]).find(c=>c.id==='dw-scorching-fissure');
    if (fissure && mana>=gc+getCardCost(state,fissure,bossSide)) { reachable+=13; plan.push({type:'play',card:grom,target:null,reason:'格罗10+裂隙3=13'}); mana-=gc+getCardCost(state,fissure,bossSide); }
  }
  // 直伤
  for (const c of (b.hand||[])) {
    const cost = getCardCost(state,c,bossSide);
    if (cost>mana) continue;
    for (const e of (c.effects||[])) {
      if (e.type==='damage' && (e.target==='enemyHero'||e.target==='playerChoice')) {
        reachable+=Number(e.amount)||0; plan.push({type:'play',card:c,target:{side:playerSide,kind:'hero'},reason:`直伤${e.amount}`}); mana-=cost;
      }
    }
  }
  // 火山(空场)
  const volcano = (b.locations||[]).find(l=>l.sourceId==='dw-erupting-volcano'&&l.durability>0&&!l.usedThisTurn);
  if (volcano && (p.board||[]).length===0) { const vd=b.playedFireSpellThisTurn?6:3; reachable+=vd; plan.push({type:'location',location:volcano,target:'random',reason:`火山${vd}`}); }

  return reachable>=enemyHp ? plan : null;
}

// ================================================================
// 主决策入口 — 逐动作重新规划
// ================================================================
export function decideDragonWarriorTurn(state, playerSide, bossSide, bossHeroPower) {
  const plan = [];
  const MAX_ACTIONS = 15;

  for (let step = 0; step < MAX_ACTIONS; step++) {
    const b = state.solo[bossSide];
    const p = state.solo[playerSide];
    if (p.health <= 0 || b.health <= 0) break;

    // 1. 生成当前状态的合法动作
    const actions = generateLegalActions(state, playerSide, bossSide, bossHeroPower);
    if (actions.length <= 1) break; // only endTurn

    // 2. 斩杀搜索
    const lethalPlan = searchLethal(state, playerSide, bossSide, actions);
    if (lethalPlan && lethalPlan.length > 0) {
      plan.push(...lethalPlan);
      break;
    }

    // 3. 模拟每个候选动作，选最优
    let bestAction = null, bestScore = -Infinity;
    const candidates = [];
    const nonEndTurn = actions.filter(a => a.type !== 'endTurn');

    for (const action of nonEndTurn) {
      const sim = cloneState(state);
      const ok = simulateAction(sim, action, bossSide, playerSide);
      if (!ok) continue;
      const score = evaluateState(sim, playerSide, bossSide);
      candidates.push({action,score});
      if (score > bestScore) { bestScore = score; bestAction = action; }
    }

    // 4. 输出前三个候选
    candidates.sort((a,b)=>b.score-a.score);
    const top3 = candidates.slice(0, 3).map(c => {
      const desc = describeAction(c.action);
      return {action:desc,score:c.score.toFixed(1)};
    });

    // 5. 如果最佳动作是 endTurn 或找不到，结束
    if (!bestAction) break;

    // 6. 执行最佳动作
    plan.push({...bestAction, _score: bestScore, _candidates: top3});

    // 真实执行 (app.js 侧会调用 applyRealAction)
    // 这里只记录 plan，实际执行在 resolveDragonWarriorBossTurn
    // 但我们需要更新 state 以便下一步模拟
    const simReal = simulateAction(state, bestAction, bossSide, playerSide);
    if (!simReal) break;

    // 如果打出了返费牌，继续循环使用剩余法力
    // 如果打出了抽牌/发现，手牌已变，继续循环
  }

  return plan;
}

function describeAction(action) {
  if (action.type==='play') return `出${action.card?.name||'?'}${action.target?('→'+(action.target.kind==='hero'?'英雄':(action.target.side||''))):''}`;
  if (action.type==='attack') return `${action.attacker?.name||'?'}→${action.target==='face'?'脸':(action.target?.name||'?')}`;
  if (action.type==='heroAttack') return `英雄攻击→${action.target==='face'?'脸':(action.target?.name||'?')}`;
  if (action.type==='heroPower') return '英雄技能·叠甲';
  if (action.type==='location') return `地标·${action.location?.sourceId||'?'}`;
  if (action.type==='endTurn') return '结束回合';
  return '?';
}

// ================================================================
// 起手留牌
// ================================================================
export function mulliganDragonWarrior(hand, isFirst, opponentSpeed) {
  const keep=[], mull=[];
  for (const card of hand) {
    let ok=false;
    if (card.id==='dw-egg-carrier') ok=true;
    if (card.id==='dw-dark-dragon-knight' && hand.some(c=>c.instanceId!==card.instanceId&&(c.tribes||[]).includes('dragon'))) ok=true;
    if (card.id==='dw-dragon-nest-guardian' && hand.some(c=>c.instanceId!==card.instanceId&&(c.tribes||[]).includes('dragon'))) ok=true;
    if (card.id==='dw-dark-scale-matron' && hand.some(c=>c.instanceId!==card.instanceId&&(c.tribes||[]).includes('dragon')) && hand.some(c=>c.cost<=2)) ok=true;
    if (opponentSpeed==='aggro') { if (['dw-eternal-pain','dw-scorching-fissure','dw-shadow-flame-infusion'].includes(card.id)) ok=true; }
    if (card.id==='dw-grommash') ok=false;
    if (card.id==='dw-searing-flame') ok=false;
    (ok?keep:mull).push(card);
  }
  return {keep,mulligan:mull};
}
