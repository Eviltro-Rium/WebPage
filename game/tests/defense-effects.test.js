const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { loadInto } = require('./_load');
const context = vm.createContext({console, Math, JSON, Date, setTimeout:()=>1, clearTimeout:()=>{}});
context.window = context;
loadInto(context, ['characters','ai','combat','adventure_content']);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../online_game/online_match.js'),'utf8'),context);
const Card = context.FurryGame.Card;
function setup() {
  const engine = new context.Engine();
  engine.start1v2('Vixraps','Blaze','Blaze');
  engine.events=[]; engine.later=()=>{};
  return engine;
}
function defend(engine, defenderKey, opponentKey, value=2) {
  const defender=engine.s[defenderKey], opponent=engine.s[opponentKey];
  return context.CharacterRegistry.get('Vixraps').defend(engine,'Vixraps',value,6,Card.number('RED',value),defender,opponent,defenderKey,'RED',{
    heal:(x,n)=>engine.heal(x,n), burn:(x,n)=>engine.burn(x,n),
    counter:(x,n)=>engine.counterAttack(defender,x,n), hurt:(x,n)=>engine.hurt(x,n)
  });
}
for (const [defenderKey,opponentKey] of [['player','ai'],['player','ai2'],['ai','player'],['ai2','player']]) {
  test('Vixraps defense2 heals 2 then doubles burn: '+defenderKey+' vs '+opponentKey,()=>{
    const engine=setup();engine.s[defenderKey]=engine.character('Vixraps',defenderKey!=='player');
    engine.s[defenderKey].hp=40;engine.s[opponentKey].burn=2;
    assert.equal(defend(engine,defenderKey,opponentKey).remaining,6);
    assert.equal(engine.s[opponentKey].burn,4);assert.equal(engine.s[defenderKey].hp,42);
    const burn=engine.events.filter(e=>e.type==='buff'&&e.kind==='burn');assert.equal(burn.length,1);
    assert.equal(burn[0].target,opponentKey);assert.equal(burn[0].stacksBefore,2);assert.equal(burn[0].stacks,4);
    assert.equal(burn[0].statusAfter.burn,4);
    const heal=engine.events.find(e=>e.type==='heal');assert.equal(heal.target,defenderKey);assert.ok(heal.id<burn[0].id);
    assert.equal((engine.s.pendingSkillStatuses||[]).length,0,'defense does not join attack queue');
  });
}
test('Vixraps defense2 heals flat 2 and respects the burn cap',()=>{
  for(const [burn,expected,events]of [[0,0,0],[3,5,1],[5,5,0]]){
    const engine=setup();engine.s.player.hp=40;engine.s.ai.burn=burn;defend(engine,'player','ai');
    assert.equal(engine.s.ai.burn,expected);assert.equal(engine.s.player.hp,42);
    assert.equal(engine.events.filter(e=>e.type==='buff'&&e.kind==='burn').length,events);
  }
});
test('defense2 against NPC2 heals flat and doubles only the attacker',()=>{
  const engine=setup();engine.s.player.hp=40;engine.s.ai.burn=1;engine.s.ai2.burn=2;
  engine.s.atkOwner='ai2';engine.s.activeAttacker='ai2';engine.s.atkCard=Card.number('RED',3);
  engine.s.discardTop=engine.s.atkCard;engine.s.pendingAttack={damage:5};engine.s.phase='PLAYER_DEFEND';engine.s.busy=false;
  engine.h.player=[Card.number('RED',2)];engine.s.selectedCard=0;
  engine.defend1v2();assert.equal(engine.s.ai2.burn,4);assert.equal(engine.s.ai.burn,1);assert.equal(engine.s.player.hp,42);
  engine.acknowledgeEvents(engine.ver);assert.equal(engine.s.player.hp,37);assert.equal(engine.s.ai2.burn,4);
});
test('unreported legacy status writes flush before the next heal, existing burn events are not duplicated',()=>{
  const engine=setup();engine.s.player.hp=40;
  engine.resolveDefenseSkill(()=>{engine.s.ai.burn=2;engine.heal(engine.s.player,1);engine.burn(engine.s.ai,1);});
  const buffs=engine.events.filter(e=>e.type==='buff'&&e.kind==='burn');assert.equal(buffs.length,2);
  assert.equal(buffs[0].stacks,2);assert.equal(buffs[1].stacks,3);assert.equal(engine.events[1].type,'heal');
  assert.equal(buffs[0].statusAfter.burn,2);assert.equal(buffs[1].statusAfter.burn,3);
});
test('nested boundaries and exceptions restore emit and never repeat status feedback',()=>{
  const engine=setup(),emit=engine.emit;
  assert.throws(()=>engine.resolveDefenseSkill(()=>{engine.resolveDefenseSkill(()=>engine.burn(engine.s.ai,1));throw new Error('test failure');}),/test failure/);
  assert.equal(engine.emit,emit);assert.equal(engine._resolvingDefenseSkill,false);
  assert.equal(engine.events.filter(e=>e.kind==='burn').length,1);
});
for(const defenderActor of ['host','guest'])test('online defense2 commits and projects target for '+defenderActor,()=>{
  const first=defenderActor==='host'?'guest':'host';
  const match=new context.OnlineMatchHost(defenderActor==='host'?'Vixraps':'Blaze',defenderActor==='guest'?'Vixraps':'Blaze',first);
  const attacker=first==='host'?'player':'ai',defender=defenderActor==='host'?'player':'ai';
  match.engine.s[attacker].burn=2;match.engine.s[defender].hp=40;
  match.engine.h[attacker]=[Card.number('RED',3)];match.engine.h[defender]=[Card.number('RED',2)];match.engine.s.discardTop=Card.number('RED',1);
  match.dispatch(first,'selectCard',{index:0});assert.ok(match.dispatch(first,'doPlay').ok);
  match.dispatch(defenderActor,'selectCard',{index:0});const result=match.dispatch(defenderActor,'doDefend');assert.ok(result.ok);
  assert.equal(match.engine.s[attacker].burn,4);assert.equal(match.engine.s[defender].hp,37);
  const events=match.eventsForViewer(result.events,defenderActor,defenderActor);
  const buff=events.find(e=>e.kind==='burn'&&e.operation==='multiply');assert.ok(buff);assert.equal(buff.target,'ai');assert.equal(buff.statusAfter.burn,4);
  const opposite=match.eventsForViewer(result.events,first,defenderActor).find(e=>e.operation==='multiply');assert.equal(opposite.target,'player');assert.equal(opposite.statusAfter.burn,4);
});
test('UI reads defense event status snapshots instead of later final status',async()=>{
  const {JSDOM}=require('jsdom');const dom=new JSDOM('<body></body>',{runScripts:'outside-only'});const w=dom.window;
  w.GameUI=function(){};w.FurryGame={CombatRuntime:{wait:async()=>{}}};
  w.eval(fs.readFileSync(path.join(__dirname,'../js/ui/events.js'),'utf8'));
  const ui=new w.GameUI();ui.state={player:{hp:40,burn:5},ai:{hp:80,burn:5}};
  const frames=[],floats=[];ui._eventTarget=e=>e.target;ui.playFloatingText=(text,_,side)=>floats.push({text,side});
  ui._updateHpBar=()=>{};ui._updateBuffs=(side,ch)=>frames.push({side,burn:ch.burn});ui.showError=error=>{throw Error(error);};
  await ui._playEvents([{id:1,type:'buff',desc:'[灼伤]翻倍至4层',target:'ai',kind:'burn',stacks:4,statusAfter:{burn:4}},
    {id:2,type:'heal',desc:'+4❤️',target:'player',hpAfter:44,statusAfter:{burn:0}}]);
  assert.deepEqual(frames,[{side:'ai',burn:4},{side:'player',burn:0}]);assert.equal(floats.length,2);dom.window.close();
});
