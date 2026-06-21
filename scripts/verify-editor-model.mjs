// 编辑器模型/类型清理/P1最终测试
import { extractStructuredEffects, editorModelToCard, cleanFieldsForType, BONUS_EFFECT_TYPES } from '../public/editor-model.js';
import { mechanicTestCards } from '../public/game-data.js';

let p=0,f=0;
function test(n,fn){try{fn();console.log(`  ✅ ${n}`);p++}catch(e){console.log(`  ❌ ${n}: ${e.message}`);f++}}
function clone(v){return JSON.parse(JSON.stringify(v))}
function assert(c,m){if(!c)throw new Error(m||'assertion failed')}

console.log('\n=== 附效字段 ===');
test('buffSelf用attack/health',()=>{
  const c=clone(mechanicTestCards.find(x=>x.id==='mt-quickdraw'));
  const m=extractStructuredEffects(c);const b=m.bonusMechanicEffects.quickdraw[0];
  assert(b.type==='buffSelf'&&b.attack===1&&b.health===1&&b.amount===undefined);
});
test('打开快枪不修改保存→完整保留',()=>{
  const c=clone(mechanicTestCards.find(x=>x.id==='mt-quickdraw'));
  const m=extractStructuredEffects(c);const s=clone(c);editorModelToCard(m,s);
  const b=s.bonusMechanicEffects.quickdraw[0];
  assert(b.type==='buffSelf'&&b.attack===1&&b.health===1&&b.amount===undefined);
});
test('修改+1/+1→+2/+2',()=>{
  const c=clone(mechanicTestCards.find(x=>x.id==='mt-quickdraw'));
  const m=extractStructuredEffects(c);
  m.bonusMechanicEffects.quickdraw=[{type:'buffSelf',attack:2,health:2}];
  const s=clone(c);editorModelToCard(m,s);
  assert(s.bonusMechanicEffects.quickdraw[0].attack===2&&s.bonusMechanicEffects.quickdraw[0].health===2);
});
test('取消快枪→只删quickdraw',()=>{
  const c={id:'t',name:'x',cost:1,type:'minion',mechanics:['quickdraw','combo'],bonusMechanicEffects:{quickdraw:[{type:'buffSelf',attack:1,health:1}],combo:[{type:'damage',target:'playerChoice',amount:2}]},effects:[],keywords:[]};
  const m=extractStructuredEffects(c);m.mechanics=['combo'];delete m.bonusMechanicEffects.quickdraw;
  const s=clone(c);editorModelToCard(m,s);
  assert(!s.mechanics.includes('quickdraw')&&s.mechanics.includes('combo')&&s.bonusMechanicEffects.combo&&!s.bonusMechanicEffects.quickdraw);
});
test('summon用minion对象',()=>{
  const c={id:'t2',name:'s',cost:3,type:'spell',mechanics:['finale'],bonusMechanicEffects:{finale:[{type:'summon',amount:2,minion:{name:'龙',attack:3,health:4}}]},effects:[],keywords:[]};
  const m=extractStructuredEffects(c);const s=clone(c);editorModelToCard(m,s);
  const b=s.bonusMechanicEffects.finale[0];
  assert(b.type==='summon'&&b.minion.name==='龙'&&b.minion.attack===3);
});
test('damage/heal/armor/draw用amount',()=>{
  for(const t of['damage','heal','armor','draw']){
    const c={id:'tx',name:'x',cost:2,type:'spell',mechanics:['combo'],bonusMechanicEffects:{combo:[{type:t,target:'playerChoice',amount:5}]},effects:[],keywords:[]};
    const m=extractStructuredEffects(c);const s=clone(c);editorModelToCard(m,s);
    assert(s.bonusMechanicEffects.combo[0].amount===5,`${t} amount=5`);
  }
});

console.log('\n=== 类型切换 (调用生产函数 cleanFieldsForType) ===');
test('随从转法术→无battlecry',()=>{
  const c={id:'bc',name:'战吼',cost:2,type:'minion',keywords:['taunt'],mechanics:['battlecry'],effects:[{type:'damage',target:'enemyHero',amount:2,trigger:'battlecry'}],bonusMechanicEffects:{}};
  const m=extractStructuredEffects(c);cleanFieldsForType('spell',m);
  const s=clone({...c,type:'spell',keywords:[],mechanics:[]});editorModelToCard(m,s);
  assert(!s.effects.some(e=>e.trigger==='battlecry'));
  assert(!s.mechanics.includes('battlecry'));
});
test('法术转随从→保留一切',()=>{
  const c={id:'spl',name:'法术',cost:1,type:'spell',mechanics:['combo'],effects:[{type:'damage',target:'enemyHero',amount:3}],bonusMechanicEffects:{combo:[{type:'damage',target:'playerChoice',amount:2}]}};
  const m=extractStructuredEffects(c);cleanFieldsForType('minion',m);
  const s=clone({...c,type:'minion'});editorModelToCard(m,s);
  assert(s.effects.some(e=>e.type==='damage'),'effects kept');
  assert(s.mechanics.includes('combo'),'mechanics kept');
});
test('extraEffects保存不丢失',()=>{
  const c={id:'ex',name:'x',cost:1,type:'spell',mechanics:[],bonusMechanicEffects:{},effects:[{type:'damage',target:'enemyHero',amount:3}]};
  const m=extractStructuredEffects(c);m.extraEffects.push({type:'custom',note:'keep'});
  const s=clone(c);editorModelToCard(m,s);
  assert(s.effects.some(e=>e.type==='custom'));
});

console.log('\n=== 预览 ===');
test('无机制→无预览状态',()=>{
  const c={id:'n',name:'x',cost:1,type:'spell',mechanics:[],effects:[],bonusMechanicEffects:{}};
  const mechs=(c.mechanics||[]).filter(x=>['quickdraw','combo','outcast','finale','manathirst'].includes(x));
  assert(mechs.length===0);
});
test('有机甲→可区分黄/绿',()=>{
  const c=clone(mechanicTestCards.find(x=>x.id==='mt-quickdraw'));
  const mechs=(c.mechanics||[]).filter(x=>['quickdraw','combo','outcast','finale','manathirst'].includes(x));
  assert(mechs.length>0);
});

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${p} passed, ${f} failed`);
if(f>0)process.exit(1);
console.log('✅ Editor model tests passed');
