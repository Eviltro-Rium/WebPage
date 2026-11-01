'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {loadInto}=require('./_load');
const ctx=vm.createContext({console,Math,JSON,Date,setTimeout:()=>1,clearTimeout(){},performance:{now:()=>0}});ctx.window=ctx;
loadInto(ctx,['characters','ai','combat','adventure_content']);
for(const file of ['map/map','deck/adventure_deck','engine/adventure_engine','engine/shop','engine/rewards','engine/inventory','engine/combat_result','save/adventure_save','battle/battle_engine','battle/adventure_battle_items'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../adventure/js',file+'.js'),'utf8'),ctx,{filename:file});
function adventure(){const e=new ctx.AdventureEngine();e.start(new ctx.AdventureMap([[0,1]]),'Ryan',{consumables:['Obsidian'],trophyWhiteCards:['BurnTrophy','GreenMagicTrophy']});return e;}
function total(p){return p.hand.length+p.deck.length+p.discard.length;}
test('obsidian is a five-gold consumable usable on the map and in battle',()=>{const d=ctx.AdventureRegistry.getItem('Obsidian');assert.equal(d.price,5);assert.equal(d.useScene,'both');assert.ok(fs.existsSync(path.join(__dirname,'../icons/items_icons/obsidian.webp')));});
test('map selection can be cancelled, rejects normal cards, upgrades one white trophy and preserves card count across saves',()=>{
 const e=adventure(),p=e.s.playerPile,index=p.hand.findIndex(c=>c.trophyWhite),normal=p.hand.findIndex(c=>!c.trophyWhite),card=p.hand[index],n=total(p);
 let result=e.useConsumable(0);assert.equal(result.pending,true);assert.equal(e.selectHandDiscardIndex(normal).ok,false);assert.equal(e.cancelHandDiscard().ok,true);assert.deepEqual([...e.s.consumables],['Obsidian']);assert.equal(card.isBlack,false);
 result=e.useConsumable(0);e.selectHandDiscardIndex(index);result=e.confirmHandDiscard();assert.equal(result.ok,true);assert.equal(result.upgradedIndex,index);assert.equal(card.isBlack,true);assert.equal(card.trophyEffect,'burn');assert.equal(total(p),n);assert.equal(e.s.consumables.length,0);
 const save=JSON.parse(JSON.stringify(ctx.AdventureSave.serialize(e))),next=new ctx.AdventureEngine();next.restoreFromSave(save,new ctx.AdventureMap(save.mapLayout));assert.ok(next.s.playerPile.hand.some(c=>c.trophyBlack&&c.trophyName==='BurnTrophy'));assert.equal(total(next.s.playerPile),n);
});
test('no eligible hand trophy does not consume obsidian, including an already upgraded trophy',()=>{
 const e=adventure();for(const card of e.s.playerPile.hand)if(card.trophyWhite)ctx.AdventureDeck.upgradeTrophy(card);const result=e.useConsumable(0);assert.equal(result.ok,false);assert.match(result.message,/没有可升级/);assert.equal(e.s.consumables.length,1);
});
for(const defend of [false,true])for(const challenge of [false,true])test(`combat selection upgrades in place and resumes the same phase: defend=${defend} challenge=${challenge}`,()=>{
 const a=adventure(),e=new ctx.AdventureBattleEngine(),n=v=>ctx.FurryGame.Card.number('RED',v),card=ctx.AdventureDeck.trophyWhite('BurnTrophy');e.later=()=>{};
 const config={player:'Ryan',opponent:'CastleWolf',opponent1:'CastleWolf',opponent2:'CastleWolf',testMode:true,discardTop:n(1),playerPile:{deck:[n(3),n(4)],hand:[card,n(2)],discard:[],handLimit:5}};
 if(challenge)e.startAdventure1v2(config);else e.startAdventure(config);e._adventureEngine=a;e.s.phase=defend?'PLAYER_DEFEND':'PLAYER_PLAY';e.s.busy=false;if(defend){e.s.pendingAttack={damage:3};e.s.atkOwner='ai';e.s.atkCard=n(1);}
 const phase=e.s.phase,cardBefore=e.h.player[0],size=e.h.player.length;e.useAdventureCombatItem(0);assert.equal(e.s.phase,'PLAYER_DISCARD');assert.deepEqual([...e.s.pendingHandDiscard.legalIndices],[0]);e.cancelDiscard();assert.equal(e.s.phase,phase);assert.equal(a.s.consumables.length,1);
 e.useAdventureCombatItem(0);e.s.selectedCards=[0];e.confirmDiscard();assert.equal(e.s.phase,phase);assert.equal(e.h.player.length,size);assert.equal(e.h.player[0],cardBefore);assert.equal(cardBefore.isBlack,true);assert.equal(cardBefore.trophyEffect,'burn');assert.equal(a.s.consumables.length,0);assert.ok(e.events.some(evt=>evt.type==='trophyUpgrade'&&evt.handIndex===0));
});
