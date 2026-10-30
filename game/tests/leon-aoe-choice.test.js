'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {loadInto}=require('./_load');
const ctx=vm.createContext({console,Math,JSON,Date,setTimeout:()=>1,clearTimeout:()=>{},performance:{now:()=>0}});ctx.window=ctx;
loadInto(ctx,['characters','ai','combat','adventure_content']);
for(const file of ['adventure/js/deck/adventure_deck.js','adventure/js/engine/loot.js','adventure/js/battle/battle_engine.js','adventure/js/battle/adventure_battle_items.js','adventure/js/battle/dice_controller.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx,{filename:file});
const Card=ctx.FurryGame.Card,num=(v,color='RED')=>Card.number(color,v,color==='WHITE');
function setup({challenge=true,trophy=false}={}){
 const e=new ctx.AdventureBattleEngine();e.later=()=>{};
 const config={player:'Leon',opponent:'CastleWolf',opponent1:'CastleWolf',opponent2:'CastleWolf',stage:1,testMode:true,discardTop:num(2),
  playerPile:{deck:[num(4),num(5),num(6)],hand:[trophy?ctx.AdventureDeck.trophyWhite('ZeroTrophy'):num(0)],discard:[],handLimit:5}};
 if(challenge)e.startAdventure1v2(config);else e.startAdventure(config);
 e.s.ai.hp=e.s.ai.maxHp=30;e.h.ai.splice(0,e.h.ai.length,num(1,'WHITE'),num(2,'WHITE'));
 if(challenge){e.s.ai2.hp=e.s.ai2.maxHp=30;e.h.ai2.splice(0,e.h.ai2.length,num(3,'WHITE'),num(4,'WHITE'));}
 e.events=[];e._invariantBaseline=null;e.s.phase='PLAYER_PLAY';e.s.busy=false;e.s.selectedCard=0;
 return e;
}
function release(e){e.dispatch('doPlay');return e.s.pendingLeonZeroDiscard;}
const choose=(e,cards)=>e.dispatch('chooseLeonZeroDiscard',{cards});
const total=e=>['player','ai'].reduce((sum,key)=>sum+e.piles[key].deck.length+e.piles[key].discard.length+e.h[key].length,0)+(e.h.ai2||[]).length;

test('challenge Leon AOE waits for player choice across both opponents, then discards only those cards before one damage settlement',()=>{
 const e=setup(),a=e.h.ai[1].uid,b=e.h.ai2[0].uid,unselected=[e.h.ai[0].uid,e.h.ai2[1].uid],before=total(e),hp=e.s.player.hp;
 const pending=release(e);assert.equal(e.s.phase,'LEON_ZERO_DISCARD');assert.equal(pending.count,2);assert.equal(pending.groups.length,2);
 assert.equal(e.s.ai.hp,30);assert.equal(e.s.ai2.hp,30);assert.equal(e.s.player.hp,hp);assert.equal(e.h.ai.length+e.h.ai2.length,4);
 choose(e,[{target:'ai',index:1},{target:'ai2',index:0}]);
 assert.deepEqual([e.h.ai[0].uid,e.h.ai2[0].uid],unselected);assert.equal(e.h.ai.length+e.h.ai2.length,2);
 assert.ok(e.piles.ai.discard.some(c=>c.uid===a));assert.ok(e.piles.ai.discard.some(c=>c.uid===b));assert.equal(total(e),before);
 assert.equal(e.s.ai.hp,23);assert.equal(e.s.ai2.hp,23);assert.equal(e.s.ai.burn,2);assert.equal(e.s.ai2.burn,2);assert.equal(e.s.player.hp,hp-4);
 assert.equal(e.s.pendingLeonZeroDiscard,null);assert.equal(e.s.pendingDialog,null);
 const settled=JSON.stringify([e.s.ai,e.s.ai2,e.s.player,e.piles]);assert.throws(()=>choose(e,[{target:'ai',index:0},{target:'ai2',index:0}]),/当前没有/);
 assert.equal(JSON.stringify([e.s.ai,e.s.ai2,e.s.player,e.piles]),settled);
});
test('both chosen cards may come from one opponent and are discarded as one batch',()=>{
 const e=setup();release(e);choose(e,[{target:'ai2',index:0},{target:'ai2',index:1}]);
 assert.equal(e.h.ai.length,2);assert.equal(e.h.ai2.length,0);const batches=e.events.filter(x=>x.type==='discardMany');
 assert.equal(batches.length,1);assert.equal(batches[0].who,'ai2');assert.equal(batches[0].cards.length,2);
});
test('incomplete, duplicate, foreign and out-of-range selections do not mutate hands or apply damage',()=>{
 const e=setup();release(e);const before=JSON.stringify([e.h,e.s.player,e.s.ai,e.s.ai2,e.piles]);
 for(const cards of [[],[{target:'ai',index:0}],[{target:'ai',index:0},{target:'ai',index:0}],[{target:'player',index:0},{target:'ai',index:0}],[{target:'ai',index:99},{target:'ai2',index:0}]]){
  assert.throws(()=>choose(e,cards));assert.equal(JSON.stringify([e.h,e.s.player,e.s.ai,e.s.ai2,e.piles]),before);assert.equal(e.s.phase,'LEON_ZERO_DISCARD');
 }
});
test('one available card requires choosing one; empty hands continue without opening a dialog',()=>{
 const e=setup();e.h.ai.splice(1);e.h.ai2.length=0;release(e);assert.equal(e.s.pendingLeonZeroDiscard.count,1);
 choose(e,[{target:'ai',index:0}]);assert.equal(e.h.ai.length,0);assert.equal(e.s.ai.hp,23);assert.equal(e.s.ai2.hp,23);
 const empty=setup();empty.h.ai.length=empty.h.ai2.length=0;release(empty);assert.equal(empty.s.pendingLeonZeroDiscard,null);assert.equal(empty.s.ai.hp,23);assert.equal(empty.s.ai2.hp,23);
});
test('a defeated opponent cannot be selected or counted for self damage',()=>{
 const e=setup();e.s.ai2.alive=false;e.s.ai2.hp=0;e.s.trophyDropHandled.ai2=true;e.s.eliminatedHandled={ai2:true};const hp=e.s.player.hp;release(e);
 assert.equal(e.s.pendingLeonZeroDiscard.groups.length,1);assert.equal(e.s.pendingLeonZeroDiscard.groups[0].key,'ai');
 assert.throws(()=>choose(e,[{target:'ai2',index:0},{target:'ai',index:0}]));choose(e,[{target:'ai',index:0},{target:'ai',index:1}]);
 assert.equal(e.s.player.hp,hp-2);assert.equal(e.h.ai2.length,2);
});
test('pending challenge selection survives a JSON restore and resolves only once',()=>{
 const e=setup();release(e);const state=JSON.parse(JSON.stringify({s:e.s,piles:e.piles,events:e.events,ver:e.ver,tableTopOwner:e.tableTopOwner}));
 const restored=new ctx.AdventureBattleEngine();restored.later=()=>{};restored.restoreSession(state,null,false);
 assert.equal(restored.s.phase,'LEON_ZERO_DISCARD');assert.equal(restored.s.pendingLeonZeroDiscard.groups.length,2);
 choose(restored,[{target:'ai',index:0},{target:'ai2',index:1}]);assert.equal(restored.s.ai.hp,23);assert.equal(restored.s.ai2.hp,23);
});
for(const challenge of [false,true])test('Zero trophy uses player choice without a second random discard, challenge='+challenge,()=>{
 const e=setup({challenge,trophy:true});release(e);assert.equal(e.s.phase,'LEON_ZERO_DISCARD');
 choose(e,[{target:'ai',index:0},{target:challenge?'ai2':'ai',index:1}]);
 assert.equal(e.h.ai.length+(e.h.ai2||[]).length,challenge?2:0);assert.equal(e.s.pendingLeonZeroDiscard,null);
 if(!challenge)assert.equal(e.s.pendingAttack.damage,7);
});

test('defeating both opponents after selection can pause for loot dice without selecting or discarding twice',()=>{
 const e=setup();e.s.ai.hp=e.s.ai2.hp=6;e._adventureEngine={s:{consumables:['DiceController'],accessories:[]}};
 ctx.FurryGame.CombatRuntime.setRandomSource(()=>0.01);
 try{
  release(e);choose(e,[{target:'ai',index:0},{target:'ai2',index:1}]);
  assert.equal(e.s.phase,'DICE_CHOICE');assert.equal(e.s.pendingLeonZeroDiscard,null);
  for(let i=0;i<2;i++){assert.ok(e.s.pendingDiceControl);e.dispatch('chooseDiceControl',{use:false});}
  assert.equal(e.s.phase,'GAME_OVER');assert.equal(e.s.trophyRolls.length,2);assert.equal(e.s.pendingLeonZeroDiscard,null);
  assert.equal(e.s.player.hp,66);assert.equal(e.h.player.filter(c=>c.trophyWhite).length,2);
 }finally{ctx.FurryGame.CombatRuntime.resetRandomSource();}
});
