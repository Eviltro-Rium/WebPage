'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const {loadInto} = require('./_load');
const root = path.resolve(__dirname, '..');
function context() {
  const c = vm.createContext({console, Math, JSON, Date, setTimeout: () => 1, clearTimeout() {}, performance: {now: () => 0}}); c.window = c;
  loadInto(c, ['characters','ai','combat','adventure_content']);
  for (const file of ['map/map','map/csv_loader','deck/adventure_deck','engine/adventure_engine','engine/shop','engine/inventory','engine/rewards','engine/combat_result','engine/sacrifice','save/adventure_save','battle/battle_engine','battle/adventure_battle_items']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'adventure/js/' + file + '.js'), 'utf8'), c, {filename:file});
  }
  return c;
}
function room(c, opts = {}) {
  const e = new c.AdventureEngine(); e.mapName = 'sacrifice-test';
  e.start(new c.AdventureMap([[0,10,1]]), 'Ryan', opts); e.move(0,1); e.enterCurrent(); return e;
}
const count = e => ['hand','deck','discard'].reduce((n,key) => n + e.s.playerPile[key].length, 0);
function restore(c,e) {
  const save = JSON.parse(JSON.stringify(c.AdventureSave.serialize(e)));
  const next = new c.AdventureEngine(); next.restoreFromSave(save,new c.AdventureMap(save.mapLayout)); return next;
}
test('sacrifice is repeatable, locks map movement until leaving, and preserves paid results on reload', () => {
  const c=context(),e=room(c);e.s.player.hp=10;
  assert.equal(e.s.phase,c.AdventurePhase.SACRIFICE);assert.equal(e.move(0,2),false);
  c.FurryGame.CombatRuntime.setRandomSource(()=>.5);
  assert.equal(e.sacrificeForItem().won,false);assert.equal(e.sacrificeForItem().won,false);assert.equal(e.s.player.hp,8);
  const next=restore(c,e);assert.equal(next.s.phase,c.AdventurePhase.SACRIFICE);assert.equal(next.s.player.hp,8);
  assert.equal(next.currentRoom().sacrificeResult.won,false);assert.equal(next.leaveSacrificeRoom(),true);assert.equal(next.canMoveTo(0,2),true);
  assert.equal(next.sacrificeForItem().ok,false,'cannot sacrifice from the map');
});
test('the 1/6 roll awards a legal consumable, and invalid or full attempts never charge health', () => {
  const c=context(),e=room(c,{accessories:['Magician']});e.s.player.hp=12;
  let calls=0;c.FurryGame.CombatRuntime.setRandomSource(()=>{calls++;return 0;});
  const result=e.sacrificeForItem();assert.equal(result.won,true);assert.equal(e.s.player.hp,11);assert.equal(e.s.consumables.length,1);
  assert.notEqual(result.itemName,'DiceController','mutually exclusive items are excluded');
  c.FurryGame.CombatRuntime.setRandomSource(()=>1/6);assert.equal(e.sacrificeForItem().won,false,'upper edge is not a win');
  e.s.consumables=Array(6).fill('FirstAidKit');const hp=e.s.player.hp;
  c.FurryGame.CombatRuntime.setRandomSource(()=>{throw Error('full inventory must not roll');});
  assert.equal(e.sacrificeForItem().ok,false);assert.equal(e.s.player.hp,hp);
  e.s.consumables=[];e.s.player.hp=1;assert.equal(e.sacrificeForItem().kind,'death');assert.equal(e.s.player.hp,0);assert.equal(e.isGameOver(),true);
});
test('upgrade replaces only the chosen physical card, retains its full effect and identity, and survives save and recycling', () => {
  const c=context(),e=room(c,{trophyWhiteCards:['BurnTrophy','BurnTrophy']});e.s.player.hp=10;
  const hand=e.s.playerPile.hand, index=hand.findIndex(card=>card.trophyWhite),original=hand[index];
  original.customEffectData={unchanged:true};const before=JSON.parse(JSON.stringify(original)),total=count(e);
  const ordinary=hand.findIndex(card=>!card.trophyWhite);
  assert.equal(e.sacrificeUpgradeTrophy(ordinary).ok,false);assert.equal(e.s.player.hp,10);
  assert.equal(e.sacrificeUpgradeTrophy(index).ok,true);assert.equal(e.s.player.hp,5);assert.equal(hand[index],original);assert.equal(count(e),total);
  const allowed=new Set(['trophyBlack','color','isBlack','isWhite','chosenColor']);
  for(const key of Object.keys(before))if(!allowed.has(key))assert.deepEqual(original[key],before[key],key);
  assert.equal(original.color,'BLACK');assert.equal(original.isWhite,false);assert.equal(original.trophyEffect,'burn');
  assert.equal(e.sacrificeUpgradeTrophy(index).ok,false);assert.equal(e.s.player.hp,5);
  assert.equal(e.sacrificeUpgradesRemaining(),2);
  const next=restore(c,e),black=next.s.playerPile.hand.find(card=>card.trophyBlack);
  assert.equal(black.trophyEffect,'burn');assert.equal(count(next),total);
  const snap=next.snapshot();assert.equal(snap.trophyWhiteCards.filter(card=>card.trophyBlack).length,1);
  const pile=next.s.playerPile;black.chosenColor='RED';pile.discardFromHand(pile.hand.indexOf(black));assert.equal(black.chosenColor,undefined);
  pile.discard.push(...pile.deck);pile.deck=[];const n=pile.hand.length;pile.draw(pile.discard.length);
  assert.ok(pile.hand.some(card=>card.trophyBlack && card.trophyName==='BurnTrophy'));assert.equal(count(next),total);
});
test('backpack discard removes the selected black variant rather than its same-name white sibling', () => {
  const c=context(),e=room(c,{trophyWhiteCards:['BurnTrophy','BurnTrophy']});
  const index=e.s.playerPile.hand.findIndex(card=>card.trophyWhite);e.sacrificeUpgradeTrophy(index);
  const snapshot=e.snapshot(),at=snapshot.trophyWhiteCards.findIndex(card=>card.trophyBlack);
  assert.equal(e.discardTrophyWhiteCard(at).ok,true);
  assert.equal(e.s.playerPile.hand.filter(card=>card.trophyWhite && !card.trophyBlack).length,1);
  assert.equal(e.s.playerPile.hand.filter(card=>card.trophyBlack).length,0);
});
for(const challenge of [false,true])for(const defend of [false,true])test('upgraded trophy requests a color and retains burn/draw effects: challenge='+challenge+' defend='+defend,()=>{
  const c=context(),e=new c.AdventureBattleEngine(),card=c.AdventureDeck.trophyWhite('BurnTrophy');c.AdventureDeck.upgradeTrophy(card);e.later=()=>{};
  const num=v=>c.FurryGame.Card.number('BLUE',v);
  const config={player:'Ryan',opponent:'CastleWolf',opponent1:'CastleWolf',opponent2:'CastleWolf',testMode:true,discardTop:num(1),playerPile:{deck:[num(4),num(5),num(6)],hand:[card,num(2)],discard:[],handLimit:5}};
  if(challenge)e.startAdventure1v2(config);else e.startAdventure(config);
  e._adventureEngine=room(c);e.events=[];e._invariantBaseline=null;
  e.s.phase=defend?'PLAYER_DEFEND':'PLAYER_PLAY';e.s.busy=false;e.s.selectedCard=0;
  const target=challenge?'ai2':'ai';e.s.attackTarget=target;e.s.lordPlayerTargetIdx=challenge?1:0;
  if(defend){e.s.atkOwner=target;e.s.activeAttacker=target;e.s.atkCard=num(1);e.s.pendingAttack={damage:3};e.s.pendingDefenseDamage=3;}
  const length=e.h.player.length,burn=e.s[target].burn||0;
  c.FurryGame.CombatRuntime.setRandomSource(()=>.9);
  e.dispatch(defend?'doDefend':'doPlay');assert.equal(e.s.needColorChoice,true);assert.equal(e.h.player.length,length,'color choice does not prematurely remove the card');
  e.dispatch('chooseColor',{color:'GREEN'});
  assert.equal(e.s.needColorChoice,false);assert.equal(e.s.discardTop.chosenColor,'GREEN');assert.equal(e.s.discardTop.isBlack,true);
  assert.equal(e.s[target].burn,burn+1);assert.equal(e.h.player.length,length,'one played and one drawn');
  if(challenge)assert.equal(e.s.ai.burn||0,0);
});
test('all map variants keep ordinary counts within their stage range and contain sacrifice and elite rooms',()=>{
  const c=context();
  for(const file of fs.readdirSync(path.join(root,'adventure/maps')).filter(name=>/^stage_.*\.csv$/.test(name))){
    const map=c.AdventureMap.fromCsvText(fs.readFileSync(path.join(root,'adventure/maps',file),'utf8')),counts=map.summary().counts;
    const late=Number(file.slice(6,8))>=3;
    assert.equal(counts.sacrifice,1,file);assert.ok(counts.normal>=(late?4:3)&&counts.normal<=(late?6:5),file);
    if(late)assert.ok(counts.elite>=2,file);
    assert.ok(map.reachableFromStart().some(({room})=>room.type==='sacrifice'),file);
  }
});

for (const [name,drawn] of [['DrawTwoTrophy',2],['GreenMagicTrophy',0],['ZeroTrophy',2]]) {
  test('upgrading '+name+' preserves its original draw/skill branch',()=>{
    const c=context(),card=c.AdventureDeck.trophyWhite(name),e=new c.AdventureBattleEngine();
    c.AdventureDeck.upgradeTrophy(card);const num=v=>c.FurryGame.Card.number('RED',v);e.later=()=>{};
    e.startAdventure({player:'Ryan',opponent:'CastleWolf',testMode:true,discardTop:num(1),playerPile:{hand:[card,num(2)],deck:[num(3),num(4),num(5)],discard:[],handLimit:5}});
    e._adventureEngine=room(c);e.s.phase='PLAYER_PLAY';e.s.busy=false;e.s.selectedCard=0;e._invariantBaseline=null;
    const before=e.h.player.length;e.dispatch('doPlay');e.dispatch('chooseColor',{color:'GREEN'});
    assert.equal(e.h.player.length,before-1+drawn);
    if(name==='ZeroTrophy')assert.ok(e.s.pendingAttack && e.s.pendingAttack.damage>0,'zero skill still resolves');
  });
}

test('each stage allows three upgrades across re-entry, reload and same-stage map changes', () => {
  const c=context(),e=room(c,{trophyWhiteCards:Array(5).fill('BurnTrophy')});
  e.s.player.hp=40;
  for(let i=0;i<3;i++){
    const index=e.s.playerPile.hand.findIndex(card=>card.trophyWhite&&!card.isBlack);
    assert.equal(e.sacrificeUpgradeTrophy(index).ok,true);
    assert.equal(e.sacrificeUpgradesRemaining(),2-i);
    e.leaveSacrificeRoom();e.enterCurrent();
  }
  const next=restore(c,e),hp=next.s.player.hp;
  const index=next.s.playerPile.hand.findIndex(card=>card.trophyWhite&&!card.isBlack);
  assert.equal(next.sacrificeUpgradeTrophy(index).ok,false);
  assert.equal(next.s.player.hp,hp);
  assert.equal(next.s.playerPile.hand[index].isWhite,true);
  assert.equal(next.snapshot().sacrificeUpgradesRemaining,0);
  next.continueTo(new c.AdventureMap([[0,10,1]]),{stage:1});next.move(0,1);next.enterCurrent();
  assert.equal(next.sacrificeUpgradesRemaining(),0,'same layer cannot refresh its allowance');
  next.continueTo(new c.AdventureMap([[0,10,1]]),{stage:2});next.move(0,1);next.enterCurrent();
  assert.equal(next.sacrificeUpgradesRemaining(),3);
  assert.equal(next.sacrificeUpgradeTrophy(index).ok,true);
  assert.equal(restore(c,next).sacrificeUpgradesRemaining(),2);
});

for(const hp of [1,4,5]) for(const cross of [false,true]) test('upgrade at '+hp+' HP, revival cross='+cross,()=>{
  const c=context(),e=room(c,{trophyWhiteCards:['BurnTrophy'],accessories:cross?['RevivalCross']:[]});
  e.s.player.hp=hp;
  const index=e.s.playerPile.hand.findIndex(card=>card.trophyWhite),card=e.s.playerPile.hand[index];
  const result=e.sacrificeUpgradeTrophy(index);
  assert.equal(result.ok,true);
  assert.equal(e.s.player.hp,cross?10:0);
  assert.equal(e.s.player.alive,cross);
  assert.equal(e.isGameOver(),!cross);
  assert.equal(e.hasAccessory('RevivalCross'),false);
  assert.equal(card.isBlack,cross);
  assert.equal(e.sacrificeUpgradesRemaining(),cross?2:3);
  if(cross){
    const next=restore(c,e);
    assert.equal(next.s.player.hp,10);
    assert.equal(next.hasAccessory('RevivalCross'),false);
    assert.equal(next.sacrificeUpgradesRemaining(),2);
  }else{
    assert.equal(e.leaveSacrificeRoom(),false);
    assert.equal(e.sacrificeForItem().ok,false);
    assert.equal(e.sacrificeUpgradeTrophy(index).ok,false);
  }
});

test('fatal item sacrifice revives once then grants the item, and death clears the saved run',()=>{
  const c=context(),e=room(c,{accessories:['RevivalCross']});e.s.player.hp=1;
  c.FurryGame.CombatRuntime.setRandomSource(()=>0);
  const result=e.sacrificeForItem();
  assert.equal(result.won,true);assert.equal(e.s.player.hp,10);
  assert.equal(e.s.consumables.length,1);assert.equal(e.hasAccessory('RevivalCross'),false);
  const data=new Map();c.localStorage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  assert.equal(c.AdventureSave.save(e),true);assert.equal(data.size,1);
  e.s.player.hp=1;
  const dead=e.sacrificeForItem();assert.equal(dead.kind,'death');assert.equal(e.s.consumables.length,1);
  assert.equal(c.AdventureSave.save(e),false);assert.equal(data.size,0);
});

test('old saves start with three upgrade chances and old result cards are not rendered',()=>{
  const {JSDOM}=require('jsdom'),dom=new JSDOM('<main id="app"></main>'),c=context();
  c.document=dom.window.document;c.matchMedia=()=>({matches:true});
  for(const file of ['adventure_ui','adventure_ui_sacrifice'])vm.runInContext(fs.readFileSync(path.join(root,'adventure/js/ui/'+file+'.js'),'utf8'),c);
  const e=room(c,{trophyWhiteCards:['BurnTrophy']});
  const save=JSON.parse(JSON.stringify(c.AdventureSave.serialize(e)));delete save.sacrificeUpgradesByStage;
  const next=new c.AdventureEngine();next.restoreFromSave(save,new c.AdventureMap(save.mapLayout));
  assert.equal(next.sacrificeUpgradesRemaining(),3);
  const index=next.s.playerPile.hand.findIndex(card=>card.trophyWhite);
  next.currentRoom().sacrificeResult={kind:'upgrade',message:'升级完成。',card:c.AdventureDeck.clone(next.s.playerPile.hand[index])};
  next.s.player.hp=1;
  const rendered=[];c.renderCard=card=>{rendered.push(card);return c.document.createElement('div');};
  const ui=new c.AdventureUI(c.document.querySelector('#app'));ui.eng=next;
  ui._sacrificeCardIndex=index;ui._sacrificeSelectedCard=next.s.playerPile.hand[index];
  const page=ui._buildSacrificePage(next.snapshot());
  assert.equal(rendered.length,1,'only eligible hand cards are rendered');
  assert.equal(page.querySelector('.adv-sacrifice-result').children.length,1,'text result only');
  assert.equal(page.querySelector('#adv-sacrifice-item').disabled,false);
  assert.equal(page.querySelector('#adv-sacrifice-upgrade').disabled,false);
  next.s.sacrificeUpgradesByStage[1]=3;
  const exhausted=ui._buildSacrificePage(next.snapshot());
  assert.equal(exhausted.querySelector('#adv-sacrifice-upgrade').disabled,true);
  assert.match(exhausted.textContent,/本层剩余 0 \/ 3/);
  dom.window.close();
});
