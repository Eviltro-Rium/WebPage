'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {loadInto}=require('./_load');
const ctx=vm.createContext({console,Math,JSON,Date,setTimeout:()=>1,clearTimeout:()=>{},performance:{now:()=>0}});ctx.window=ctx;
loadInto(ctx,['characters','ai','combat','adventure_content']);
for(const file of ['adventure/js/map/map.js','adventure/js/deck/adventure_deck.js','adventure/js/engine/adventure_engine.js','adventure/js/engine/loot.js','adventure/js/engine/shop.js','adventure/js/engine/rewards.js','adventure/js/engine/inventory.js','adventure/js/engine/combat_result.js','adventure/js/save/adventure_save.js','adventure/js/battle/battle_engine.js','adventure/js/battle/adventure_battle_items.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx,{filename:file});
const Card=ctx.FurryGame.Card,num=v=>Card.number('RED',v),R=ctx.AdventureRegistry;
function battle(){const e=new ctx.AdventureBattleEngine();e.later=()=>{};e.startAdventure({player:'Ryan',opponent:'CastleWolf',testMode:true,discardTop:num(1),playerPile:{deck:[num(4),num(5),num(6)],hand:[num(2)],discard:[],handLimit:5}});e.s.player.hp=20;e.s.ai.hp=12;e.events=[];return e;}
function smith(){const e=new ctx.AdventureEngine();e.mapName='stage_01_castle_1';e.start(new ctx.AdventureMap([[0,5]]),'Ryan',{gold:100});e.move(0,1);e.enterCurrent();return e;}
function tokens(e,values){for(const key of Object.keys(e.s.currency.tokens))e.s.currency.tokens[key]=0;Object.assign(e.s.currency.tokens,values);}
function reload(e){const data=JSON.parse(JSON.stringify(ctx.AdventureSave.serialize(e)));const next=new ctx.AdventureEngine();next.restoreFromSave(data,ctx.AdventureMap.fromGrid(data.mapLayout));return next;}

test('Vampire costs 7 gold and drains 5; the forged trophy drains 3 and costs grass plus a mandatory wild token',()=>{
 assert.equal(R.getItem('Vampire').price,7);assert.equal(R.getItem('Vampire').vampireAmount,5);
 const def=R.getItem('VampireTrophy');assert.equal(def.trophyKind,'forge');assert.equal(def.drainAmount,3);assert.deepEqual([...def.beastTradeCost],['cao','wuneng']);
 const e=smith();assert.ok(e._forgeTrophyPool().some(def=>def.name==='VampireTrophy'));assert.equal(ctx.AdventureLoot.getDropRule('VampireTrophy'),null);
 assert.ok(fs.existsSync(path.join(__dirname,'..',def.icon.replace(/^\.\.\//,''))));
});
test('Vampire consumable deals 5 and heals only actual HP lost',()=>{
 for(const [enemyHp,expected]of [[12,5],[2,2]]){
  const e=battle();e.s.ai.hp=enemyHp;e._adventureEngine=smith();e._adventureEngine.s.consumables=['Vampire'];
  e.useAdventureCombatItem(0);assert.equal(e.s.ai.hp,Math.max(0,enemyHp-5));assert.equal(e.s.player.hp,20+expected);assert.equal(e._adventureEngine.s.consumables.length,0);
 }
});
for(const defending of [false,true])test('Vampire trophy drains 3, draws one and retains the current play/defense flow: defending='+defending,()=>{
 const e=battle(),card=ctx.AdventureDeck.trophyWhite('VampireTrophy');e.h.player.splice(0,e.h.player.length,card);e.s.selectedCard=0;e._invariantBaseline=null;
 if(defending){e.s.phase='PLAYER_DEFEND';e.s.atkOwner='ai';e.s.atkCard=num(3);e.s.pendingAttack={damage:4};e.s.pendingDefenseDamage=4;}
 else{e.s.phase='PLAYER_PLAY';e.s.busy=false;}
 e.dispatch(defending?'doDefend':'doPlay');assert.equal(e.s.ai.hp,9);assert.equal(e.s.player.hp,23);assert.equal(e.h.player.length,1);
 assert.equal(e.piles.player.discard.filter(c=>c.trophyName==='VampireTrophy').length,1);
 assert.equal(e.s.phase,defending?'PLAYER_DEFEND':'PLAYER_PLAY');
 if(defending)assert.equal(e.s.pendingAttack.damage,4);
});
test('trophy guard mitigation reduces both damage and healing and can target the second NPC',()=>{
 const e=battle();e.s.ai.guard=2;const card=ctx.AdventureDeck.trophyWhite('VampireTrophy');
 e.useTrophyWhite(card,e.s.ai,'player');assert.equal(e.s.ai.hp,11);assert.equal(e.s.player.hp,21);assert.equal(e.s.ai.guard,0);
 const c=new ctx.AdventureBattleEngine();c.later=()=>{};c.startAdventure1v2({player:'Ryan',opponent1:'CastleWolf',opponent2:'CastleWolf',testMode:true});
 c.s.player.hp=20;c.s.ai2.hp=10;const first=c.s.ai.hp;c.useTrophyWhite(card,c.s.ai2,'player');assert.equal(c.s.ai2.hp,7);assert.equal(c.s.ai.hp,first);assert.equal(c.s.player.hp,23);
});
test('blacksmith has three independent forge offers and preserves sold-out slots through re-entry and reload',()=>{
 const e=smith(),room=e.currentRoom();assert.equal(room.blacksmithTrophySlots.length,3);assert.ok(room.blacksmithTrophySlots.every(name=>e._isForgeTrophy(name)));
 room.blacksmithTrophySlots=['VampireTrophy',null,'DrawTwoTrophy'];e.leaveBlacksmith();e.enterCurrent();
 assert.equal(JSON.stringify(room.blacksmithTrophySlots),JSON.stringify(['VampireTrophy',null,'DrawTwoTrophy']));
 const next=reload(e);assert.equal(JSON.stringify(next.currentRoom().blacksmithTrophySlots),JSON.stringify(room.blacksmithTrophySlots));assert.equal(next.snapshot().roomInfo.blacksmithTrophies.length,3);
});
test('legacy one-slot saves retain their sold-out first slot and stock only the two new slots once',()=>{
 const e=smith();const saved=ctx.AdventureSave.serialize(e);delete saved.rooms['0,1'].blacksmithTrophySlots;saved.rooms['0,1'].blacksmithTrophySlot=null;
 const next=new ctx.AdventureEngine();next.restoreFromSave(saved,ctx.AdventureMap.fromGrid(saved.mapLayout));
 const slots=next.currentRoom().blacksmithTrophySlots;assert.equal(slots.length,3);assert.equal(slots[0],null);assert.ok(slots.slice(1).every(name=>next._isForgeTrophy(name)));
 const again=reload(next);assert.equal(JSON.stringify(again.currentRoom().blacksmithTrophySlots),JSON.stringify(slots));
});
test('buy and refresh operate only on the selected trophy slot and prevent automatic restock or repeat charges',()=>{
 const e=smith(),room=e.currentRoom();room.blacksmithTrophySlots=['ZeroTrophy','VampireTrophy','DrawTwoTrophy'];tokens(e,{cao:1,wuneng:1});
 const hand=e.s.playerPile.hand.length;assert.equal(e.buyBlacksmithTrophy(1).ok,true);assert.equal(e.s.currency.tokens.cao,0);assert.equal(e.s.currency.tokens.wuneng,0);
 assert.equal(e.s.playerPile.hand.length,hand+1);assert.ok(e.s.trophyWhiteCards.includes('VampireTrophy'));assert.equal(room.blacksmithTrophySlots[1],null);assert.equal(e.s.blacksmithSelectedSlot,'trophy:1');
 assert.equal(e.buyBlacksmithTrophy(1).message,'sold-out');e.leaveBlacksmith();e.enterCurrent();assert.equal(room.blacksmithTrophySlots[1],null);
 const gold=e.s.currency.gold;assert.equal(e.refreshBlacksmithTrophy(1).ok,true);assert.equal(e.s.currency.gold,gold-2);assert.equal(room.blacksmithTrophySlots[0],'ZeroTrophy');assert.equal(room.blacksmithTrophySlots[2],'DrawTwoTrophy');
 for(const bad of [-1,3,0.5,'1']){const before=e.s.currency.gold;assert.equal(e.refreshBlacksmithTrophy(bad).ok,false);assert.equal(e.buyBlacksmithTrophy(bad).ok,false);assert.equal(e.s.currency.gold,before);}
});
test('typed tokens cannot replace the explicit wild-token cost; delayed payment keeps the selected slot identity',()=>{
 const e=smith(),room=e.currentRoom();room.blacksmithTrophySlots=['VampireTrophy','DrawTwoTrophy','VampireTrophy'];tokens(e,{cao:2,huo:2});assert.equal(e.buyBlacksmithTrophy(2).ok,false);
 tokens(e,{cao:1,wuneng:2});assert.equal(e.buyBlacksmithTrophy(2).needBeastChoice,true);assert.equal(e.s.pendingBeastPayment.context.index,2);
 assert.equal(e.confirmBeastPayment(0).ok,true);assert.equal(room.blacksmithTrophySlots[0],'VampireTrophy');assert.equal(room.blacksmithTrophySlots[2],null);
});
test('a changed offer refunds delayed payment rather than forging from another matching slot',()=>{
 const e=smith(),room=e.currentRoom();room.blacksmithTrophySlots=['VampireTrophy',null,'VampireTrophy'];tokens(e,{cao:1,wuneng:2});
 const before=JSON.stringify(e.s.currency.tokens);e.buyBlacksmithTrophy(2);room.blacksmithTrophySlots[2]='DrawTwoTrophy';assert.equal(e.confirmBeastPayment(0).ok,false);
 assert.equal(JSON.stringify(e.s.currency.tokens),before);assert.ok(!e.s.trophyWhiteCards.includes('VampireTrophy'));
});

for (const [name, effect, cost] of [
 ['GreenMagicTrophy', 'greenMagic', ['cao', 'ben']],
 ['PurpleMagicTrophy', 'purpleMagic', ['shui', 'huo']]
]) {
 test(name + ' is forge-only, charges the specified beast tokens and enters the player deck', () => {
  const def=R.getItem(name),e=smith();
  assert.equal(def.trophyKind,'forge');assert.equal(def.trophyEffect,effect);assert.equal(def.drawCount,0);
  assert.deepEqual([...def.beastTradeCost],cost);assert.ok(fs.existsSync(path.join(__dirname,'..',def.icon.replace(/^\.\.\//,''))));
  assert.ok(e._forgeTrophyPool().some(item=>item.name===name));assert.equal(ctx.AdventureLoot.getDropRule(name),null);
  e.currentRoom().blacksmithTrophySlots[1]=name;tokens(e,Object.fromEntries(cost.map(key=>[key,1])));
  assert.equal(e.buyBlacksmithTrophy(1).ok,true);assert.ok(e.s.trophyWhiteCards.includes(name));
  for(const key of cost)assert.equal(e.s.currency.tokens[key],0);
 });
 for (const defending of [false,true]) test(name + ' heals, clears the appropriate statuses and bridges without drawing: defending=' + defending, () => {
  const e=battle(),card=ctx.AdventureDeck.trophyWhite(name);
  e.s.player.burn=2;e.s.player.guard=2;e.s.ai.guard=2;e.s.ai.burn=1;
  e.h.player.splice(0,e.h.player.length,card,num(4));e.s.selectedCard=0;e._invariantBaseline=null;
  if(defending){e.s.phase='PLAYER_DEFEND';e.s.atkOwner='ai';e.s.atkCard=num(3);e.s.pendingAttack={damage:4};e.s.pendingDefenseDamage=4;}
  else{e.s.phase='PLAYER_PLAY';e.s.busy=false;}
  e.dispatch(defending?'doDefend':'doPlay');
  assert.equal(e.s.player.hp,23);assert.equal(e.h.player.length,1);assert.equal(e.h.player[0].value,4);
  assert.equal(e.s.phase,defending?'PLAYER_DEFEND':'PLAYER_PLAY');assert.equal(e.s.ai.burn,1);assert.equal(e.s.player.guard,2);
  assert.equal(e.s.player.burn,effect==='greenMagic'?0:2);assert.equal(e.s.ai.guard,effect==='purpleMagic'?0:2);
  assert.equal(e.piles.player.discard.filter(c=>c.trophyName===name).length,1);
  assert.match(e.itemEffectDesc(card,'player'),/不抽牌.*继续搭桥/);
 });
}

test('purple magic targets only the chosen opponent in a challenge room',()=>{
 const e=new ctx.AdventureBattleEngine();e.later=()=>{};
 e.startAdventure1v2({player:'Ryan',opponent1:'CastleWolf',opponent2:'CastleWolf',testMode:true});
 e.s.player.hp=20;e.s.ai.guard=2;e.s.ai2.guard=2;
 const card=ctx.AdventureDeck.trophyWhite('PurpleMagicTrophy');e.h.player.splice(0,e.h.player.length,card,num(4));
 e.s.phase='PLAYER_PLAY';e.s.busy=false;e.s.selectedCard=0;e.s.lordPlayerTargetIdx=1;e._invariantBaseline=null;
 ctx.FurryGame.CombatRuntime.setRandomSource(()=>0.9);
 try { e.dispatch('doPlay');assert.equal(e.s.ai.guard,2);assert.equal(e.s.ai2.guard,0);assert.equal(e.s.player.hp,23);assert.equal(e.h.player.length,1); }
 finally { ctx.FurryGame.CombatRuntime.setRandomSource(null); }
});
