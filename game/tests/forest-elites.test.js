const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {expand} = require('./_load');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({console, Math, JSON, Date,
  Image:class {constructor(){this.complete=true;this.naturalWidth=1;}},
  setTimeout:()=>1,clearTimeout:()=>{},performance:{now:()=>0}});
context.window=context;
for (const file of expand(['characters','ai','combat','adventure_content']).concat([
  'adventure/js/engine/loot.js','adventure/js/content/stage_guide.js'])) {
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
}
const {AdventureRegistry:registry,AdventureMonsterBridge:bridge,CharacterRegistry,Engine}=context;
const card = value => ({value,color:'RED',isNumberCard:true,isItemCard:false,isBlack:false,isWhite:false});
function setup(t,name,stage) {
  const raw=registry.getMonster(name)||registry.getBoss(name);
  bridge.registerMonsterChar(bridge.applyStageMods(raw,stage));
  t.after(()=>bridge.registerMonsterChar(raw));
  const engine=new Engine();engine.start('Ryan',name);engine.later=()=>{};
  return engine;
}
function defend(engine,name,value,damage) {
  const ai=engine.s.ai;
  return CharacterRegistry.get(name).defend(engine,name,value,damage,card(value),ai,engine.s.player,'ai','RED',{
    heal:(x,n)=>engine.heal(x,n),hurt:(x,n)=>engine.hurt(x,n),
    counter:(x,n)=>engine.counterAttack(ai,x,n),poison:(x,n)=>engine.poison(x,n),
    bleed:(x,n)=>engine.bleed(x,n),clearDebuffs:x=>engine.clearDebuffs(x)});
}

for (const stage of [3,4]) {
  test('forest elite stats and attacks follow Stage '+stage+' without old stage bonuses',()=>{
    const expected=[['ForestDendrobatidFrog',30,4,6],['ForestCapybara',32,2,4],['ForestPiranha',30,4,4]];
    for(const [name,hp,low,high] of expected){
      const mod=bridge.applyStageMods(registry.getMonster(name),stage);
      assert.equal(mod.hp,hp);assert.equal(mod.minStage,3);
      assert.equal(mod.attackDamage(card(2),{playerPoison:2,playerBleed:2}),low);
      assert.equal(mod.attackDamage(card(5),{playerPoison:2,playerBleed:2}),high);
      assert.equal(mod.attackDamage(card(0),{}),0);
      assert.equal(mod.attackDamage(card(7),{}),0);
    }
  });
  test('frog defense poisons and counters its card value on Stage '+stage,t=>{
    const e=setup(t,'ForestDendrobatidFrog',stage);e.s.ai.hp=20;
    const before=e.s.player.hp;
    const result=defend(e,'ForestDendrobatidFrog',3,6);
    assert.equal(result.remaining,6);assert.equal(e.s.player.hp,before-3);
    assert.equal(e.s.player.poison,1);assert.equal(e.s.ai.hp,stage===4?22:20);
  });
  test('capybara caps damage without increasing small hits on Stage '+stage,t=>{
    const e=setup(t,'ForestCapybara',stage),cap=stage===4?1:2;
    for(const incoming of [0,1,2,5,8])assert.equal(defend(e,'ForestCapybara',2,incoming).remaining,Math.min(incoming,cap));
    assert.equal(registry.getMonster('ForestCapybara').handLimit,3);
  });
  test('piranha defense keeps its half counter and Stage4 heals plus two bleed on Stage '+stage,t=>{
    const e=setup(t,'ForestPiranha',stage);e.s.ai.hp=20;
    const before=e.s.player.hp;
    const result=defend(e,'ForestPiranha',2,5);
    assert.equal(result.remaining,5);assert.equal(e.s.player.hp,before-3);
    assert.equal(e.s.player.bleed,stage===4?2:1);assert.equal(e.s.ai.hp,stage===4?21:20);
  });
}

test('forest elite loot includes face ten and universal faces',()=>{
  for(const name of context.AdventureElitePool.forest[3]){
    assert.equal(context.AdventureLoot.isEliteMonster(name),true);
    for(const [face,drop] of [[10,'DrawTwoTrophy'],[11,'SmallPotionTrophy'],[12,'PurifyWaterTrophy']])
      assert.deepEqual(Array.from(context.AdventureLoot.rollMonsterDrop('forest',name,null,face,{elite:true}).drops),[drop]);
  }
});

for(const stage of [1,3,4])for(const poison of [0,1,2]){
  test(`python low attack uses fixed damage and existing poison for draw: stage ${stage}, poison ${poison}`,t=>{
    const e=setup(t,'ForestPython',stage);e.s.player.poison=poison;
    const before=e.h.ai.length;
    const result=e.effect('ForestPython',3,card(3),e.s.ai,e.s.player);
    assert.equal(result.d,stage>=3?3:2);
    assert.equal(e.h.ai.length,before+(poison===2?1:0));
    assert.equal(e.s.player.poison,poison);
    assert.ok(!(e.s.pendingSkillStatuses||[]).some(op=>op.id==='poison'));
  });
}

test('Stage4 python zero heals once while splitting damage and poisoning',t=>{
  const e=setup(t,'ForestPython',4);e.s.ai.hp=20;
  const before=e.s.player.hp;
  const result=defend(e,'ForestPython',0,5);
  assert.equal(result.remaining,3);assert.equal(e.s.player.hp,before-3);
  assert.equal(e.s.ai.hp,21);assert.equal(e.s.player.poison,1);
});

for(const stage of [3,4]){
  test('dryad no longer gains Stage3 damage or Stage4 block on Stage '+stage,t=>{
    const e=setup(t,'ForestDryad',stage),mod=bridge.applyStageMods(registry.getBoss('ForestDryad'),stage);
    assert.equal(mod.attackDamage(card(2)),2);assert.equal(mod.attackDamage(card(5)),4);assert.equal(mod.attackDamage(card(0)),6);
    const before=e.s.player.hp;const result=defend(e,'ForestDryad',2,7);
    assert.equal(result.remaining,3);assert.equal(e.s.ai.lush,1);
    assert.equal(e.s.player.hp,before-(stage===4?1:0));
  });
}

test('Stage4 dryad zero stays immune and counters once',t=>{
  const e=setup(t,'ForestDryad',4),before=e.s.player.hp;
  const result=defend(e,'ForestDryad',0,8);
  assert.equal(result.remaining,0);assert.equal(e.s.player.hp,before-1);
});

test('forest codex text reports the elite and boss rules',()=>{
  const describe=bridge.getAdventureNpcSkillDesc;
  assert.match(describe('ForestDendrobatidFrog',card(5),false,{stage:4}),/4\+玩家.*中毒/);
  assert.doesNotMatch(describe('ForestPython',card(2),false,{stage:4}),/施加/);
  assert.match(describe('ForestPython',card(2),false,{stage:4}),/3🗡️/);
  assert.match(describe('ForestDendrobatidFrog',card(2),true,{stage:4}),/中毒/);
  assert.match(describe('ForestDryad',card(2),true,{stage:4}),/反击1/);
  assert.equal(context.AdventureStageGuide.ForestDryad.length,1);
});
