const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const gameRoot = path.resolve(__dirname, '..');
const { expand } = require('./_load');
const context = vm.createContext({
  console,
  Math,
  JSON,
  Date,
  Image: class Image {
    constructor() {
      this.complete = true;
      this.naturalWidth = 1;
    }
  },
  setTimeout: () => 1,
  clearTimeout: () => {},
  performance: { now: () => 0 }
});
context.window = context;

const sources = expand(['characters', 'ai', 'combat', 'adventure_content']).concat([
  'adventure/js/engine/loot.js',
  'adventure/js/deck/adventure_deck.js',
  'adventure/js/battle/battle_engine.js',
  'adventure/js/battle/adventure_battle_items.js'
]);

for (const relative of sources) {
  const file = path.join(gameRoot, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { AdventureRegistry, AdventureLoot, AdventureMonsterBridge, Engine, CharacterRegistry } = context;
const getMonster = name => AdventureRegistry.getMonster(name) || AdventureRegistry.getBoss(name);
const { applyStageMods } = AdventureMonsterBridge;

function numCard(value, color = 'RED') {
  return { value, isNumberCard: true, isItemCard: false, color, isBlack: false, isWhite: false };
}

function blackCard() {
  return { value: -1, isNumberCard: false, isItemCard: true, color: 'BLACK', isBlack: true, isWhite: false };
}


const bossName = 'FrozenMammoth';
function staged(stage) { return applyStageMods(AdventureRegistry.getBoss(bossName), stage); }
function battle(stage = 1) {
  AdventureMonsterBridge.registerMonsterChar(staged(stage));
  const e = new Engine(); e.start('Ryan', bossName); e.later = () => {};
  e.events = []; e.s.player.guard = 0; e.s.player.fly = 0;
  e.s.ai.guard = 0; e.s.ai.fly = 0;
  return e;
}
function attack(e, value) {
  const c=numCard(value); e.s.atkCard=c; e.s.atkOwner='ai';
  const r=e.effect(bossName,value,c,e.s.ai,e.s.player);
  e.s.pendingAttack=Object.assign({damage:r.d},r);
  return r;
}
function defend(e,value,damage) {
  return CharacterRegistry.get(bossName).defend(e,bossName,value,damage,numCard(value),e.s.ai,e.s.player,'ai','RED',{
    bleed:(target,n)=>e.bleed(target,n), heal:(target,n)=>e.heal(target,n), hurt:(target,n)=>e.counterAttack(target,n),
    clearDebuffs:target=>e.clearDebuffs(target)
  });
}

test('Mammoth is available in every ocean boss pool, with an existing icon',()=>{
  const m=staged(1); assert.equal(m.hp,45); assert.equal(m.handLimit,3); assert.equal(m.whiteZeros,2);
  assert.equal(m.kind,'冻洋猛犸');
  assert.ok(fs.existsSync(path.resolve(gameRoot,'adventure',m.icon)));
  for(const stage of ['*',2,3,4]) assert.ok(context.AdventureBossPool.ocean[stage].includes(bossName));
});
for(const v of [1,2,3])test('Mammoth attack '+v+' deals 2, then grants guard and applies corresponding bleed',()=>{
  const e=battle(),hp=e.s.player.hp,r=attack(e,v);
  assert.equal(r.d,2); assert.equal(e.s.ai.guard,0); assert.equal(e.s.player.bleed,0);
  const damage=e.prepareAttackSettlement(r.d,'player');
  assert.equal(e.s.player.bleed,0);
  e.settlePreparedHit(e.s.ai,e.s.player,{damage,bleed:0});
  e.performAttack({type:'aoe',commitAttackEffects:true,target:'player'});
  assert.equal(e.s.player.hp,hp-2); assert.equal(e.s.player.bleed,v); assert.equal(e.s.ai.guard,2);
  const hit=e.events.findIndex(x=>x.type==='hit'),bleed=e.events.findIndex(x=>x.type==='buff'&&x.kind==='bleed');
  assert.ok(hit>=0&&bleed>hit);
});
for(const v of [4,5,6])test('Mammoth attack '+v+' uses opponent bleed, with hypothermia after damage',()=>{
  const e=battle(); e.s.player.bleed=2; e.s.ai.bleed=3;
  const r=attack(e,v); assert.equal(r.d,5); assert.equal(r.hypothermiaTarget,'player'); assert.equal(r.hypothermiaAmount,1);
  const damage=e.prepareAttackSettlement(r.d,'player'); assert.equal(damage,5); assert.equal(e.s.player.hypothermia,0);
  e.settlePreparedHit(e.s.ai,e.s.player,{damage,bleed:0});
  e.performAttack({type:'aoe',commitAttackEffects:true,target:'player',hypothermiaTarget:r.hypothermiaTarget,hypothermiaAmount:r.hypothermiaAmount});
  assert.equal(e.s.player.hypothermia,1); assert.equal(e.s.ai.hypothermia,0);
});
test('Mammoth 0 applies hypothermia and 4 guard before its unblockable damage, once',()=>{
  const e=battle(),r=attack(e,0); assert.equal(r.d,3); assert.equal(r.unblock,true);
  assert.equal(e.s.player.hypothermia,0); assert.equal(e.s.ai.guard,0);
  assert.equal(e.prepareAttackSettlement(r.d,'player'),3);
  assert.equal(e.s.player.hypothermia,1); assert.equal(e.s.ai.guard,4);
  e.prepareAttackSettlement(r.d,'player'); e.commitAttackStatuses('afterDamage');
  assert.equal(e.s.player.hypothermia,1); assert.equal(e.s.ai.guard,4);
  assert.ok(!r.hypothermiaAmount,'no second deferred hypothermia application');
});
test('Mammoth formula recalculates if defense clears target bleed',()=>{
  const e=battle(); e.s.player.bleed=3; const r=attack(e,4); assert.equal(r.d,6);
  e.clearDebuffs(e.s.player); assert.equal(e.prepareAttackSettlement(r.d,'player'),3);
});
test('Mammoth 1/2/3 defense blocks half rounded up and bleeds the attacker',()=>{
  for(const v of [1,2,3]) { const e=battle(),out=defend(e,v,5);
    assert.equal(out.remaining,2); assert.equal(e.s.player.bleed,1); assert.equal(e.s.ai.bleed,0);
    assert.equal(staged(1).defendBlock(numCard(v),4),2);
  }
});
test('Mammoth 0 defense is fully immune, gains 2 guard and applies 2 bleed',()=>{
  const e=battle(),out=defend(e,0,12);
  assert.equal(out.remaining,0); assert.equal(e.s.ai.guard,2); assert.equal(e.s.player.bleed,2);
});
test('Mammoth stages are cumulative; undefined attacks and defenses gain no effects',()=>{
  for(const stage of [1,2,3,4]) {
    const m=staged(stage); assert.equal(m.hp,stage>=2?55:45);
    for(const v of [0,1,2,3,4,5,6])assert.equal(m.attackDamage(numCard(v),{playerBleed:2}), (v===0?3:v<=3?2:5)+(stage>=3?1:0));
    assert.equal(m.defendBleed(numCard(1)),stage>=4?2:1);
    assert.equal(m.defendBleed(numCard(0)),stage>=4?3:2);
    for(const v of [4,5,6,7]) { assert.equal(m.defendBleed(numCard(v)),0); assert.equal(m.defendImmune(numCard(v)),false); }
    assert.equal(m.attackDamage(numCard(7),{}),0); assert.equal(m.attackDamage(blackCard(),{}),0);
  }
  const e=battle(4),out=defend(e,0,6);assert.equal(out.remaining,0);assert.equal(e.s.player.bleed,3);
});
test('Mammoth all 12 loot faces match the documented outcomes',()=>{
  for(let roll=1;roll<=12;roll++) {
    const result=AdventureLoot.rollMonsterDrop('ocean',bossName,()=>(roll-1)/12);
    assert.equal(result.roll,roll);
    assert.deepEqual(Array.from(result.drops),roll<=3?['PiercingTrophy']:roll<=5?['GuardTrophy']:roll===6?['HypothermiaTrophy']:[]);
  }
});
test('Mammoth skill descriptions include scaling, hypothermia, guard, immunity and stage buffs',()=>{
  const desc=(v,def,stage=1)=>AdventureMonsterBridge.getAdventureNpcSkillDesc(bossName,numCard(v),def,{stage});
  assert.match(desc(2,false),/2层\[流血\]/); assert.match(desc(2,false),/2层\[守护\]/);
  assert.match(desc(4,false),/3\+/); assert.match(desc(4,false),/流血/);assert.match(desc(4,false),/失温/);
  assert.match(desc(0,false),/不可防御/); assert.match(desc(0,false),/4层\[守护\]/);
  assert.match(desc(0,true),/免疫所有伤害/);assert.match(desc(0,true),/2层\[守护\]/);
  assert.match(desc(1,true,4),/2层\[流血\]/);assert.match(desc(0,true,4),/3层\[流血\]/);
  assert.match(desc(1,true),/半数伤害（向上取整）/);
});

for(const testMode of [false,true])test('Mammoth starts in '+(testMode?'test':'normal')+' adventure boss battle with stage modifiers',()=>{
  const e=new context.AdventureBattleEngine();
  e.startAdventure({player:'Ryan',opponent:bossName,stage:3,testMode,
    playerPile:{deck:[numCard(1),numCard(2),numCard(3)],hand:[numCard(4)],discard:[],handLimit:5}});
  e.later=()=>{};
  assert.equal(e.s.ai.maxHp,55);assert.equal(e.s.ai.hp,55);assert.equal(e.h.ai.length,3);
  const pile=e._npcPile || e.piles.ai;
  assert.ok(pile,'NPC has an isolated pile');
  const zeroCount=[...pile.deck,...pile.discard,...e.h.ai].filter(c=>c.isNumberCard&&c.value===0).length;
  assert.equal(zeroCount,2,'Boss deck has exactly two white 0 cards');
  e.s.player.bleed=2;const r=attack(e,4);assert.equal(r.d,6);assert.equal(e.prepareAttackSettlement(r.d,'player'),6);
});
