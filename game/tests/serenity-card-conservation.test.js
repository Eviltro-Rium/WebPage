const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {loadInto} = require('./_load');

function setup() {
  const ctx = vm.createContext({console, Math, JSON, Date, setTimeout:()=>1, clearTimeout:()=>{}, performance:{now:()=>0}});
  ctx.window = ctx;
  loadInto(ctx, ['characters','ai','combat','adventure_content']);
  for (const file of ['adventure/js/map/map.js','adventure/js/deck/adventure_deck.js',
    'adventure/js/engine/adventure_engine.js','adventure/js/engine/shop.js','adventure/js/engine/rewards.js',
    'adventure/js/engine/inventory.js','adventure/js/engine/combat_result.js',
    'adventure/js/save/adventure_save.js','adventure/js/battle/battle_engine.js','adventure/js/battle/adventure_battle_items.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx,{filename:file});
  }
  return ctx;
}
const size = pile => pile.deck.length + pile.hand.length + pile.discard.length;
const clone = value => JSON.parse(JSON.stringify(value));

for (const owner of ['player','ai']) test('classic Serenity 0 conserves the shared deck for '+owner, () => {
  const ctx=setup(),engine=new ctx.Engine();engine.later=()=>{};
  engine.start(owner==='player'?'Serenity':'Ryan',owner==='ai'?'Serenity':'Ryan');
  const actor=engine.s[owner],target=engine.s[owner==='player'?'ai':'player'];actor.bloodthirst=true;
  const count=()=>engine.deck.length+engine.discardBottom.length+engine.h.player.length+engine.h.ai.length+(engine.s.discardTop?1:0);
  const before=count();engine.effect('Serenity',0,ctx.AdventureDeck.num('RED',0),actor,target);
  assert.equal(count(),before);assert.equal(engine.h[owner].length,4);
});

test('old stage-three Serenity saves recover missing base cards and recorded trophies exactly once', () => {
  const ctx=setup(),map=()=>new ctx.AdventureMap([[0,1],[1,2]]);
  const original=new ctx.AdventureEngine();
  original.start(map(),'Serenity',{stage:3,trophyWhiteCards:['ZeroTrophy','BurnTrophy','BurnTrophy']});
  original._initializeDiscardTop();
  const expected=size(original.s.playerPile), saved=ctx.AdventureSave.serialize(original);
  delete saved.serenityDiscardRecoveryVersion;
  saved.playerPile.deck.splice(0,25);
  const trophyIndex=saved.playerPile.hand.findIndex(card=>card.trophyName==='BurnTrophy');
  saved.playerPile.hand.splice(trophyIndex,1);
  assert.equal(size(saved.playerPile),expected-26);
  const remainingHand=clone(saved.playerPile.hand), remainingDeck=clone(saved.playerPile.deck);
  const restored=new ctx.AdventureEngine();restored.restoreFromSave(saved,map());
  assert.equal(size(restored.s.playerPile),expected);
  assert.deepEqual(clone(restored.s.playerPile.hand),remainingHand,'do not replace or draw a new hand');
  assert.deepEqual(clone(restored.s.playerPile.deck),remainingDeck,'preserve the draw order');
  assert.equal(restored.s.playerPile.discard.at(-1).uid,saved.discardTop.uid,'keep the active top on top');
  const recovered=restored.events.find(event=>event.type==='deckRecovered');assert.equal(recovered.extra.count,26);
  const all=[...restored.s.playerPile.deck,...restored.s.playerPile.hand,...restored.s.playerPile.discard];
  assert.equal(new Set(all.map(card=>card.uid)).size,all.length,'recovered cards have unique identities');
  const again=new ctx.AdventureEngine();again.restoreFromSave(ctx.AdventureSave.serialize(restored),map());
  assert.equal(size(again.s.playerPile),expected);assert.ok(!again.events.some(event=>event.type==='deckRecovered'));
});

test('old active fights defer recovery until returning to the map', () => {
  const ctx=setup(),map=()=>new ctx.AdventureMap([[0,1],[1,2]]),engine=new ctx.AdventureEngine();
  engine.start(map(),'Serenity');const saved=ctx.AdventureSave.serialize(engine),expected=size(saved.playerPile);
  delete saved.serenityDiscardRecoveryVersion;saved.playerPile.deck.splice(0,22);
  saved.activeCombat={enemy:'CastleWolf',pos:{r:0,c:1}};saved.phase=ctx.AdventurePhase.PLAYER_PLAY;
  const restored=new ctx.AdventureEngine();restored.restoreFromSave(saved,map());
  assert.equal(size(restored.s.playerPile),expected-22);assert.equal(restored.s.serenityDiscardRecoveryVersion,0);
  restored.s.activeCombat=null;restored.s.combat=null;restored.s.phase=ctx.AdventurePhase.MAP;
  restored.onCombatReturnToMap();assert.equal(size(restored.s.playerPile),expected);
  restored.onCombatReturnToMap();assert.equal(size(restored.s.playerPile),expected);
});

test('recovery preserves nonstandard collections and never repairs new-version custom fixtures', () => {
  const ctx=setup(),map=()=>new ctx.AdventureMap([[0,1],[1,2]]),engine=new ctx.AdventureEngine();
  engine.start(map(),'Serenity');const saved=ctx.AdventureSave.serialize(engine);
  saved.playerPile.deck.splice(0,25);const count=size(saved.playerPile);
  const current=new ctx.AdventureEngine();current.restoreFromSave(saved,map());assert.equal(size(current.s.playerPile),count);
  delete saved.serenityDiscardRecoveryVersion;saved.playerPile.hand.push(ctx.AdventureDeck.num('RED',99));
  const custom=new ctx.AdventureEngine();custom.restoreFromSave(saved,map());assert.equal(size(custom.s.playerPile),count+1);
});

test('deck metadata generation and recovery do not consume reward randomness', () => {
  const ctx=setup(),random=()=>assert.fail('metadata repair must not reroll RNG');
  const engine=new ctx.AdventureEngine();engine.start(new ctx.AdventureMap([[0,1],[1,2]]),'Serenity');
  const saved=ctx.AdventureSave.serialize(engine);delete saved.serenityDiscardRecoveryVersion;saved.playerPile.deck.splice(0,21);
  ctx.FurryGame.CombatRuntime.setRandomSource(random);
  try { const restored=new ctx.AdventureEngine();restored.restoreFromSave(saved,new ctx.AdventureMap([[0,1],[1,2]])); }
  finally {ctx.FurryGame.CombatRuntime.resetRandomSource();}
});

for (const bloodthirst of [false,true]) test('Serenity 0 conserves both isolated piles; bloodthirst=' + bloodthirst, () => {
  const ctx=setup(), engine=new ctx.AdventureBattleEngine();engine.later=()=>{};
  engine.startAdventure({player:'Serenity',opponent:'CastleWolf',playerState:{hp:40,maxHp:75,bloodthirst}});
  engine.draw('player',5);
  const playerCount=size(engine.piles.player), npcCount=size(engine.piles.ai), discarded=engine.h.player.length;
  engine.events=[];
  engine.effect('Serenity',0,ctx.AdventureDeck.num('RED',0),engine.s.player,engine.s.ai);
  assert.equal(size(engine.piles.player),playerCount,'discarded player cards must remain physical');
  assert.equal(size(engine.piles.ai),npcCount,'discarded opponent cards must remain physical');
  assert.equal(engine.h.player.length,4);
  const batches=engine.events.filter(event=>event.type==='discardMany');
  assert.equal(batches.find(event=>event.who==='player').cards.length,discarded);
  assert.equal(batches.length,bloodthirst?2:1);
});

for (const target of ['ai','ai2']) test('bloodthirst 0 in challenge rooms preserves the shared NPC pile and only changes '+target, () => {
  const ctx=setup(),engine=new ctx.AdventureBattleEngine();engine.later=()=>{};
  engine.startAdventure1v2({player:'Serenity',opponent1:'CastleWolf',opponent2:'CastleFox',
    playerState:{hp:25,maxHp:75,bloodthirst:true}});
  engine.draw('player',5);
  const other=target==='ai'?'ai2':'ai';
  const otherHand=clone(engine.h[other]), count=size(engine.piles.ai)+engine.h.ai2.length;
  const playerCount=size(engine.piles.player);
  engine.effect('Serenity',0,ctx.AdventureDeck.num('RED',0),engine.s.player,engine.s[target]);
  assert.equal(size(engine.piles.player),playerCount);
  assert.equal(size(engine.piles.ai)+engine.h.ai2.length,count);
  assert.deepEqual(clone(engine.h[other]),otherHand);
});

test('repeated ZeroTrophy uses keep all player cards through three stages, room returns and reloads', () => {
  const ctx=setup(), map=()=>new ctx.AdventureMap([[0,1],[1,2]]);
  let adventure=new ctx.AdventureEngine();adventure.start(map(),'Serenity',{trophyWhiteCards:['ZeroTrophy']});
  const expected=size(adventure.s.playerPile);
  const identities=pile=>[...pile.deck,...pile.hand,...pile.discard].map(card=>card.uid).sort();
  const initialIds=identities(adventure.s.playerPile);
  for (let stage=1;stage<=3;stage++) {
    if(stage>1)adventure.continueTo(map(),{stage,scene:'castle'});
    for(let room=0;room<4;room++) {
      const engine=new ctx.AdventureBattleEngine();engine.later=()=>{};
      engine.startAdventure({player:'Serenity',opponent:'CastleWolf',stage,
        playerState:{hp:25,maxHp:75,bloodthirst:true},playerPile:clone(adventure.s.playerPile)});
      const pile=engine.piles.player;
      let zero;
      for(const list of [pile.hand,pile.deck,pile.discard]) {
        const index=list.findIndex(card=>card.trophyName==='ZeroTrophy');
        if(index>=0){zero=list.splice(index,1)[0];break;}
      }
      assert.ok(zero,'the same trophy must remain available');
      engine.setDiscardTop(zero,'player');engine.s.atkOwner='player';engine.s.atkCard=zero;
      engine.useTrophyWhite(zero,engine.s.ai);
      assert.equal(size(pile),expected,'stage '+stage+' room '+room+' immediately after the skill');
      assert.deepEqual(identities(pile),initialIds,'preserve each original physical card, not just the count');
      adventure.applyBattleResult(engine.finishAdventureBattle());
      adventure.s.phase=ctx.AdventurePhase.MAP;
      const saved=ctx.AdventureSave.serialize(adventure);
      adventure=new ctx.AdventureEngine();adventure.restoreFromSave(saved,map());
      assert.equal(size(adventure.s.playerPile),expected);
      assert.deepEqual(identities(adventure.s.playerPile),initialIds);
    }
  }
});

test('Serenity 0 recycles an exhausted player deck instead of deleting the discarded hand', () => {
  const ctx=setup(),engine=new ctx.AdventureBattleEngine();engine.later=()=>{};
  const cards=[1,2,3,4,5].map(value=>ctx.AdventureDeck.num('RED',value));
  engine.startAdventure({player:'Serenity',opponent:'CastleWolf',playerState:{hp:40,maxHp:75},
    playerPile:{deck:[],hand:cards,discard:[],handLimit:5},discardTop:null});
  engine.effect('Serenity',0,ctx.AdventureDeck.num('RED',0),engine.s.player,engine.s.ai);
  assert.equal(size(engine.piles.player),5);
  assert.equal(engine.h.player.length,4);
});
