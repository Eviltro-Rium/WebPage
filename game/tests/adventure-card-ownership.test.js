'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {loadInto} = require('./_load');
const c = vm.createContext({console, Math, JSON, Date, setTimeout:()=>1, clearTimeout(){}, performance:{now:()=>0}});
c.window = c;
loadInto(c, ['characters', 'ai', 'combat', 'adventure_content']);
for (const file of ['map/map', 'deck/adventure_deck', 'engine/adventure_engine', 'engine/shop', 'engine/inventory', 'engine/rewards', 'engine/combat_result', 'save/adventure_save', 'battle/battle_engine', 'battle/adventure_battle_items']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../adventure/js/' + file + '.js'), 'utf8'), c, {filename:file});
}
const AD = c.AdventureDeck;
const num = value => c.FurryGame.Card.number('RED', value);
const cards = pile => [...pile.deck, ...pile.hand, ...pile.discard];
function battle(name, value, challenge=false) {
  const e = new c.AdventureBattleEngine(); e.later = ()=>{};
  const config = {player:name, opponent:'CastleWolf', opponent1:'CastleWolf', opponent2:'CastleWolf', testMode:true,
    discardTop:num(1), playerPile:{deck:[num(2),num(3),num(4)], hand:[num(value)], discard:[], handLimit:5}};
  if(challenge)e.startAdventure1v2(config);else e.startAdventure(config);
  return e;
}

for (const [name, value] of [['Chan',4],['Chan',7],['Saiki',3],['Saiki',5],['Moze',5],['Blaze',4],['Leon',7]]) {
  for (const target of ['ai','ai2']) test(`${name} ${value} returns the selected ${target} card to NPC discard without changing player ownership`, () => {
    const e = battle(name, value, target==='ai2');
    const before = cards(e.piles.player).map(card=>card.uid).sort();
    const chosen = e.h[target][0], npcCount = cards(e.piles.ai).length + (e.h.ai2 ? e.h.ai2.length : 0);
    const otherHand = target==='ai2' ? e.h.ai.map(card=>card.uid) : null;
    // 直接进入公共手牌技能入口，覆盖所有使用该分支的角色（含历史 Saiki 3）。
    e.s.atkOwner='player'; e.s.atkCard=num(value); e.s.attackTarget=target;
    e.resolveOpponentHandSkill({name, value, owner:'player', targetKey:target, attackCard:e.s.atkCard});
    e.s.selectedAICard=0; e.resolveOpponentHandCard();
    assert.ok(e.piles.ai.discard.some(card=>card.uid===chosen.uid));
    assert.equal(cards(e.piles.player).some(card=>card.uid===chosen.uid),false);
    assert.deepEqual(cards(e.piles.player).map(card=>card.uid).sort(),before);
    assert.equal(cards(e.piles.ai).length + (e.h.ai2 ? e.h.ai2.length : 0),npcCount);
    assert.ok(e.events.some(evt=>evt.type==='discard' && evt.card.uid===chosen.uid && evt.who===target));
    if(otherHand)assert.deepEqual(e.h.ai.map(card=>card.uid),otherHand);
    // 强制回收玩家弃牌库，再抽完，误入牌不能在下一次洗牌后出现。
    const pile=e.piles.player; pile.discard.push(...pile.deck.splice(0));
    e.draw('player',pile.discard.length,false);
    assert.ok(!e.h.player.some(card=>card.npcCard && !card.borrowedFrom));
    assert.equal(c.CombatInvariants.check(e,'ownership',{throw:true}).ok,true);
  });
}

test('Chan 7 real play, target selection and confirmation keep the monster card out of the persistent player pile', () => {
  for(const challenge of [false,true]) {
    const e=battle('Chan',7,challenge),target=challenge?'ai2':'ai';
    e.s.attackTarget=target;e.s.lordPlayerTargetIdx=challenge?1:0;
    e.s.selectedCard=e.h.player.findIndex(card=>card.value===7);
    e.dispatch('doPlay');assert.equal(e.s.phase,'OPPONENT_CARD_CHOICE');
    const chosen=e.h[target][0];
    e.dispatch('chooseAICard',{index:0});e.dispatch('doOpponentCardConfirm');
    assert.ok(e.piles.ai.discard.some(card=>card.uid===chosen.uid));
    const result=e.finishAdventureBattle();
    assert.ok(!cards(result.playerPile).some(card=>card.npcCard));
  }
});

test('discard boundary routes NPC cards back but permits real player whites and borrowed cards', () => {
  const e=battle('Ryan',3);
  const npc=AD.num('WHITE',2,true,{npcCard:true}),white=AD.num('WHITE',2,true);
  e.discardToBottom(npc,'player');e.discardToBottom(white,'player');
  assert.ok(e.piles.ai.discard.some(card=>card.uid===npc.uid));
  assert.ok(e.piles.player.discard.some(card=>card.uid===white.uid));
});

test('map save recovery removes marked foreign cards from every player zone while preserving whites, trophies and legal borrowing', () => {
  const e=new c.AdventureEngine();e.mapName='ownership-test';e.start(new c.AdventureMap([[0,1]]),'Chan',{trophyWhiteCards:['BurnTrophy']});
  const white=AD.num('WHITE',2,true), borrowed=AD.num('WHITE',3,true,{npcCard:true,borrowedFrom:'ai',borrowedMonster:true});
  e.s.playerPile.hand.push(white,borrowed);
  const npc=()=>AD.num('WHITE',1,true,{npcCard:true});
  e.s.playerPile.deck.push(npc());e.s.playerPile.hand.push(npc());e.s.playerPile.discard.push(npc());e.s.magazineReserve=[npc()];
  const save=JSON.parse(JSON.stringify(c.AdventureSave.serialize(e))),next=new c.AdventureEngine();
  next.restoreFromSave(save,new c.AdventureMap(save.mapLayout));
  assert.ok(!cards(next.s.playerPile).some(AD.isForeignNpcCard));assert.equal(next.s.magazineReserve.length,0);
  assert.ok(next.s.playerPile.hand.some(card=>card.uid===white.uid));assert.ok(next.s.playerPile.hand.some(card=>card.uid===borrowed.uid));
  assert.ok(cards(next.s.playerPile).some(card=>card.trophyWhite));
});

test('battle restore returns misplaced cards to the shared NPC discard and repairs a misplaced active top', () => {
  const e=battle('Chan',7,true),npc=e.h.ai2.splice(0,1)[0],top=e.h.ai.splice(0,1)[0];
  e.piles.player.deck.push(npc);e.piles.player.discard.push(top);
  e.s.discardTop=JSON.parse(JSON.stringify(top));e.tableTopOwner=e.s.discardTopOwner='player';
  const data=JSON.parse(JSON.stringify({s:e.s,piles:e.piles,events:e.events,ver:e.ver,tableTopOwner:e.tableTopOwner,testMode:true}));
  const next=new c.AdventureBattleEngine();next.later=()=>{};next.restoreSession(data,null,false);
  assert.ok(!cards(next.piles.player).some(AD.isForeignNpcCard));
  assert.ok(next.piles.ai.discard.some(card=>card.uid===npc.uid));
  assert.equal(next.piles.ai.discard.at(-1).uid,top.uid);assert.equal(next.tableTopOwner,'ai');
  assert.equal(next.piles.ai.discard,next.piles.ai2.discard);
  assert.equal(c.CombatInvariants.check(next,'restore',{throw:true}).ok,true);
});

test('map recovery removes NPC contamination before count normalization so no real player cards are deleted', () => {
  const e=new c.AdventureEngine();e.mapName='ownership-count';e.start(new c.AdventureMap([[0,1]]),'Chan');
  const pile=e.s.playerPile,top=pile.deck.pop();pile.discard.push(top);
  e.s.discardTop=new AD.DiscardTop(top);e.s.discardTopOwner='player';
  const original=cards(pile).map(card=>card.uid).sort();
  for(const zone of ['deck','hand','discard'])pile[zone].push(AD.num('WHITE',2,true,{npcCard:true}));
  const data=JSON.parse(JSON.stringify(c.AdventureSave.serialize(e))),next=new c.AdventureEngine();
  next.restoreFromSave(data,new c.AdventureMap(data.mapLayout));
  assert.deepEqual(cards(next.s.playerPile).map(card=>card.uid).sort(),original);
  assert.equal(next.s.discardTop.get().uid,top.uid);
});

test('legacy Chan seven keep prompt cannot transfer a monster card into the player hand', () => {
  const e=battle('Chan',7),chosen=e.h.ai.splice(0,1)[0];
  e.s.pendingOpponentSkill={name:'Chan',value:7,owner:'player',targetKey:'ai',attackCard:num(7)};
  e.s.chanSevenKeepMode=true;e.s.chanSevenChosenCard=chosen;e.s.phase='PLAYER_SEVEN_CHOICE';
  e.chanSevenChoice(true);
  assert.ok(e.piles.ai.discard.some(card=>card.uid===chosen.uid));
  assert.ok(!e.h.player.some(card=>card.uid===chosen.uid));
});
