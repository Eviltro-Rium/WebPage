'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {loadInto}=require('./_load');
const root=path.resolve(__dirname,'..');
function context(){
 const ctx=vm.createContext({console,Math,JSON,Date,setTimeout:()=>1,clearTimeout:()=>{},performance:{now:()=>0},
  localStorage:{_s:{},setItem(k,v){this._s[k]=String(v);},getItem(k){return this._s[k]||null;},removeItem(k){delete this._s[k];}}});
 ctx.window=ctx;loadInto(ctx,['characters','ai','combat','adventure_content']);
 for(const file of ['adventure/js/map/map.js','adventure/js/deck/adventure_deck.js','adventure/js/engine/adventure_engine.js','adventure/js/engine/loot.js','adventure/js/engine/shop.js','adventure/js/engine/rewards.js','adventure/js/engine/inventory.js','adventure/js/engine/combat_result.js','adventure/js/save/adventure_save.js','adventure/js/battle/battle_engine.js','adventure/js/battle/adventure_battle_items.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
 return ctx;
}
const ctx=context(),Card=ctx.FurryGame.Card;
const num=(v,color='WHITE')=>Card.number(color,v,color==='WHITE');
const magic=()=>Object.assign(Card.item('WHITE','magic'),{npcCard:true});
function battle(){const e=new ctx.AdventureBattleEngine();e.later=()=>{};
 e.startAdventure({player:'Ryan',opponent:'CorruptedRyan',stage:4,playerPile:{deck:[num(1,'RED'),num(2,'RED')],hand:[num(3,'RED')],discard:[],handLimit:5}});
 e.events=[];return e;}
function skill(e,value,color='RED'){
 const card=num(value);card.chosenColor=color;e.s.atkCard=card;e.s.atkOwner='ai';
 return e.effect('CorruptedRyan',value,card,e.s.ai,e.s.player);
}
function run(stage=4,scene='castle'){
 const e=new ctx.AdventureEngine();e.mapName='stage_04_'+scene+'_1';e.start(new ctx.AdventureMap([[0,2]]),'Ryan',{stage,scene});e.move(0,1);e.enterCurrent();return e;
}

test('final enemy is a 50 HP Boss with three cards and never enters scene encounter pools',()=>{
 const e=battle();assert.equal(e.s.ai.maxHp,50);assert.equal(e.getHandLimit('ai'),3);assert.equal(e.h.ai.length,3);
 for(const scene of ['castle','forest','desert','ocean','volcano']){
  const map=run(4,scene);assert.notEqual(map.s.combat.enemy.name,'CorruptedRyan');assert.ok(!map._encounterNames('boss').includes('CorruptedRyan'));
 }
});
test('low attacks discard exactly the smallest nonzero number, then draw with owned-pile events',()=>{
 const e=battle(),zero=num(0),seven=num(7),two=num(2),m=magic();
 e.h.ai.splice(0,e.h.ai.length,zero,seven,m,two);e.piles.ai.deck.splice(0,e.piles.ai.deck.length,num(6),num(5),num(4),num(3));
 const before=e.piles.ai.discard.length;const r=skill(e,1);assert.equal(r.d,4);
 assert.equal(e.piles.ai.discard.length,before+1);assert.equal(e.piles.ai.discard.at(-1).uid,two.uid);
 assert.ok(e.h.ai.some(c=>c.uid===zero.uid));assert.ok(e.h.ai.some(c=>c.uid===m.uid));
 assert.equal(e.events.filter(x=>x.type==='discard').length,1);assert.equal(e.events.filter(x=>x.type==='draw').length,1);
});
test('low attack with no eligible number leaves hand and deck intact',()=>{
 const e=battle();e.h.ai.splice(0,e.h.ai.length,num(0),magic());const deck=e.piles.ai.deck.length;
 assert.equal(skill(e,2).d,4);assert.equal(e.piles.ai.deck.length,deck);assert.equal(e.h.ai.length,2);
 e.h.ai.length=0;assert.equal(skill(e,3).d,4);assert.equal(e.h.ai.length,0);
});
for(const [color,status]of [['RED','magmaVein'],['YELLOW','crit'],['BLUE','diving'],['GREEN','lush']])test(color+' high skill uses inherited color and grants its status only once',()=>{
 const e=battle();const r=skill(e,4,color);assert.equal(r.d,4);
 e.commitAttackStatuses('afterDamage');assert.ok(e.s.ai[status]);
 const amount=e.s.ai[status];e.commitAttackStatuses('afterDamage');assert.equal(e.s.ai[status],amount);
});
test('seven sums remaining numeric hand; empty hand draws one and causes no damage',()=>{
 const e=battle();e.h.ai.splice(0,e.h.ai.length,num(3),num(6),magic());assert.equal(skill(e,7).d,9);
 assert.match(ctx.AdventureMonsterBridge.getAdventureNpcSkillDesc('CorruptedRyan',num(7),false),/数字之和/);
 e.h.ai.length=0;assert.equal(skill(e,7).d,0);assert.equal(e.h.ai.length,1);
});
test('zero cleanses and draws exactly two; only the two drawn numbers count, magic is zero',()=>{
 const e=battle();e.h.ai.splice(0,e.h.ai.length,num(7));e.piles.ai.deck.splice(0,e.piles.ai.deck.length,magic(),num(5));
 e.s.ai.poison=2;e.s.ai.burn=3;const r=skill(e,0);assert.equal(r.d,5);assert.equal(e.h.ai.length,3);
 e.commitAttackStatuses('beforeDamage');assert.equal(e.s.ai.poison,0);assert.equal(e.s.ai.burn,0);
 assert.equal(e.piles.ai.deck.length,0);
});
for(const v of [1,2,3,0])test('defense '+v+' implements counter/heal or full immunity and hypnosis',()=>{
 const e=battle();e.s.ai.hp=40;e.s.atkCard=num(4,'RED');e.s.atkOwner='player';e.s.pendingAttack={damage:6};e.rememberAttackDebuffs('ai');
 e.s.pendingSkillStatuses=[{target:'ai',id:'poison',method:'poison',args:[2],timing:'beforeDamage'}];
 const mod=ctx.CharacterRegistry.get('CorruptedRyan');const r=mod.defend(e,'CorruptedRyan',v,6,num(v),e.s.ai,e.s.player,'ai','RED',{
  heal:(x,n)=>e.heal(x,n),counter:(x,n)=>e.counterAttack(e.s.ai,x,n),cancelAttackDebuffs:(o,r)=>e.cancelAttackDebuffs(o,r)});
 if(v===0){assert.equal(r.remaining,0);assert.equal(e.s.player.hypnosis,true);assert.equal(e.s.pendingSkillStatuses.length,0);assert.equal(e.s.ai.hp,40);}
 else{assert.equal(r.remaining,6);assert.equal(e.s.ai.hp,42);assert.equal(e.s.queuedCounterHits[0].damage,2);}
});
test('black cards heal once across color staging/resume; other cards and dead Boss do not heal',()=>{
 const e=battle();e.s.ai.hp=40;const black=Card.item('BLACK','drawTwo');e.s.atkOwner='player';e.setDiscardTop(black,'player');assert.equal(e.s.ai.hp,42);
 e._skipNextDiscardTop=true;black.chosenColor='RED';e.setDiscardTop(black,'player');assert.equal(e.s.ai.hp,42);
 e.setDiscardTop(num(4,'RED'),'player');assert.equal(e.s.ai.hp,42);
 e.s.ai.alive=false;e.setDiscardTop(Card.item('BLACK','black'),'player');assert.equal(e.s.ai.hp,42);
});
test('all five Stage4 scene Bosses lead to one refresh-safe awakening, without stage healing or another scene',()=>{
 for(const scene of ['castle','forest','desert','ocean','volcano']){
  const e=run(4,scene);e.onCombatEnd('win');assert.equal(e.s.phase,ctx.AdventurePhase.COMBAT_SETTLE);assert.equal(e.s.pendingCombatReward.stage,'boss-exit');assert.equal(e.completeAdventure(),false);
  const hp=e.s.player.hp;assert.equal(e.awakenFinalEnemy(),true);assert.equal(e.awakenFinalEnemy(),false);
  assert.equal(e.s.combat.enemy.name,'CorruptedRyan');assert.equal(e.s.stage,4);assert.equal(e.s.scene,scene);assert.equal(e.s.player.hp,hp);assert.equal(e.s.pendingMapReturnEffects,null);
  const save=ctx.AdventureSave.serialize(e),restored=new ctx.AdventureEngine();restored.restoreFromSave(save,ctx.AdventureMap.fromGrid(save.mapLayout));
  assert.equal(restored.s.finalEnemyAwakened,true);assert.equal(restored.s.activeCombat.enemy,'CorruptedRyan');assert.notEqual(restored.enterCurrent(),false);assert.equal(restored.s.combat.enemy.name,'CorruptedRyan');
  restored.onCombatEnd('win');assert.equal(restored.s.phase,ctx.AdventurePhase.CLEAR);assert.equal(restored.s.finalEnemyDefeated,true);assert.equal(restored.s.activeCombat,null);
  assert.equal(restored.completeAdventure(),true);assert.equal(restored.events.filter(x=>x.type==='adventureVictory').length,1);
  const won=ctx.AdventureSave.serialize(restored),reload=new ctx.AdventureEngine();reload.restoreFromSave(won,ctx.AdventureMap.fromGrid(won.mapLayout));assert.equal(reload.s.phase,ctx.AdventurePhase.CLEAR);assert.equal(reload.awakenFinalEnemy(),false);
 }
});
test('earlier floors cannot awaken the final enemy; final defeat is a loss rather than a win',()=>{
 for(const stage of [1,2,3]){const e=run(stage);e.onCombatEnd('win');assert.equal(e.awakenFinalEnemy(),false);}
 const e=run();e.onCombatEnd('win');e.awakenFinalEnemy();e.onCombatEnd('lose');assert.equal(e.s.phase,ctx.AdventurePhase.GAME_OVER);assert.equal(e.s.finalEnemyDefeated,false);
});

test('restored Stage4 settlement exposes awakening and launches through the map callback, clearing the old battle checkpoint',async()=>{
 const {JSDOM}=require('jsdom');const dom=new JSDOM('<body><div id="adventure-container"></div><div id="game-container"></div></body>');
 const c=context();c.document=dom.window.document;
 for(const file of ['adventure/js/battle/adventure_battle_controller.js','adventure/js/ui/adventure_ui.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c,{filename:file});
 try {
  const e=new c.AdventureEngine();e.mapName='stage_04_forest_1';e.start(new c.AdventureMap([[0,2]]),'Ryan',{stage:4,scene:'forest'});e.move(0,1);e.enterCurrent();e.onCombatEnd('win');
  let clears=0,launches=0;c.AdventureBattleSession={clear(){clears++;}};
  const ui=Object.create(c.AdventureUI.prototype);
  Object.assign(ui,{eng:e,_clearMapClickTimer(){},_stopTipsRotation(){},_updateBackground(){},_persistAdventure(){},_startBridgeCombat(){launches++;return Promise.resolve(true);}});
  assert.equal(c.AdventureBattleController.resumeSettlement(e,()=>ui.render()),true);
  const button=c.document.getElementById('adv-settle-next');assert.equal(button.textContent,'唤醒堕落 Ryan');
  button.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(launches,1);assert.ok(clears>0);assert.equal(e.s.combat.enemy.name,'CorruptedRyan');assert.equal(c.AdventureSave.load().activeCombat.enemy,'CorruptedRyan');
  assert.equal(c.document.getElementById('adv-settle-overlay'),null);
 }finally{dom.window.close();}
});

test('final encounter ignores an obsolete scene-Boss battle snapshot and resumes the final encounter lock',async()=>{
 const c=context();vm.runInContext(fs.readFileSync(path.join(root,'adventure/js/ui/adventure_ui.js'),'utf8'),c);
 const e=new c.AdventureEngine();e.mapName='stage_04_castle_1';e.start(new c.AdventureMap([[0,2]]),'Ryan',{stage:4});e.move(0,1);e.enterCurrent();e.onCombatEnd('win');e.awakenFinalEnemy();
 const ui=Object.create(c.AdventureUI.prototype);let passed='unset';Object.assign(ui,{eng:e,_startBridgeCombat:async session=>{passed=session;return true;}});
 assert.equal(await ui._resumeLockedCombat({characterName:'Ryan',enemy:'CastleChameleon',battle:{s:{}}},'Ryan'),true);
 assert.equal(passed,null);assert.equal(e.s.combat.enemy.name,'CorruptedRyan');
});

test('final battle snapshot retains health, statuses, and exact owned piles across restore',()=>{
 const e=battle();e.s.ai.hp=23;e.s.ai.crit=2;e.s.ai.hypnosis=true;
 const saved=JSON.parse(JSON.stringify({s:e.s,piles:e.piles,events:e.events,ver:e.ver,tableTopOwner:e.tableTopOwner,pendingSettlement:e.pendingSettlement}));
 const restored=new ctx.AdventureBattleEngine();restored.later=()=>{};restored.restoreSession(saved,null,false);
 assert.equal(restored.s.ai.name,'CorruptedRyan');assert.equal(restored.s.ai.hp,23);assert.equal(restored.s.ai.crit,2);assert.equal(restored.s.ai.hypnosis,true);
 assert.equal(restored.getHandLimit('ai'),3);assert.equal(JSON.stringify(restored.piles),JSON.stringify(e.piles));
});

for(const value of [7,0])test('real AI attack executes final skill '+value+' and reaches player defense',()=>{
 const e=battle();e.s.phase='AI_TURN';e.s.busy=true;e.s.aiTurnStarted=true;e.s.aiHasPlayed=false;e.s.discardTop=num(2,'RED');
 e.h.ai.splice(0,e.h.ai.length,...(value===7?[num(7),num(4),num(2)]:[num(0)]));
 e.piles.ai.deck.splice(0,e.piles.ai.deck.length,num(1),num(2),num(6),num(5));
 e.aiTurn();assert.equal(e.s.phase,'PLAYER_DEFEND');assert.equal(e.s.pendingAttack.damage,value===7?6:11);
 assert.equal(e.events.filter(x=>x.type==='aiPlay').length,1);
});

test('actual black-card attack heals once even when choosing its color requires a second command',()=>{
 const e=battle();e.s.ai.hp=40;e.s.phase='PLAYER_PLAY';e.s.busy=false;e.s.selectedCard=0;e.s.discardTop=num(2,'RED');
 e.h.player.splice(0,e.h.player.length,Card.item('BLACK','drawTwo'),num(3,'RED'));
 e.dispatch('doPlay');if(e.s.needColorChoice)e.dispatch('chooseColor',{color:'BLUE'});
 assert.equal(e.s.ai.hp,42);assert.equal(e.events.filter(x=>x.type==='heal'&&x.kind==='passive'&&x.who==='ai').length,1);
});

test('actual zero defense cancels queued debuffs and applies hypnosis without a counter',()=>{
 const e=battle(),attack=num(4,'RED');e.h.ai.splice(0,e.h.ai.length,num(0));e.s.atkCard=attack;e.s.atkOwner='player';e.s.phase='AI_DEFEND';e.s.pendingAttack={damage:6};
 e.s.discardTop=attack;e.rememberAttackDebuffs('ai');
 e.s.pendingSkillStatuses=[{target:'ai',id:'poison',method:'poison',args:[2],timing:'beforeDamage'}];
 e.aiDefend(attack,6);assert.equal(e.s.player.hypnosis,true);assert.equal(e.s.ai.poison,0);
 assert.equal(e.s.pendingSkillStatuses.length,0);assert.equal(e.pendingSettlement.damage,0);
});

test('a previously completed legacy run retains its victory checkpoint',()=>{
 const e=run();const save=ctx.AdventureSave.serialize(e);save.phase=ctx.AdventurePhase.CLEAR;
 save.rooms['0,1'].cleared=true;delete save.finalEnemyAwakened;delete save.finalEnemyDefeated;
 const restored=new ctx.AdventureEngine();restored.restoreFromSave(save,ctx.AdventureMap.fromGrid(save.mapLayout));
 assert.equal(restored.s.phase,ctx.AdventurePhase.CLEAR);assert.equal(restored.s.finalEnemyDefeated,true);assert.equal(restored.awakenFinalEnemy(),false);
});
