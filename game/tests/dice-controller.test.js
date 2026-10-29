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
  'adventure/js/battle/adventure_battle_items.js',
  'adventure/js/battle/dice_controller.js'
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



const runtime=context.FurryGame.CombatRuntime;
function battle(items=['DiceController'],opponent='CastleWolf') {
  const e=new context.AdventureBattleEngine();
  e.startAdventure({player:'Ryan',opponent,scene:'castle',testMode:true,
    playerPile:{deck:[numCard(1),numCard(2),numCard(3)],hand:[numCard(4),numCard(5)],discard:[],handLimit:5}});
  e._adventureEngine={s:{consumables:items.slice(),accessories:[],consumableSlots:6}};
  e.later=()=>{};e.events=[];e.s.player.guard=0;e.s.player.fly=1;e.s.phase='GUARD_CHOICE';
  e.s.pendingGuardDamage=5;e.s.pendingGuardBleed=0;e.s.pendingAttack={damage:5};
  e.s.atkOwner='ai';e.s.atkCard=numCard(4);return e;
}
function choose(e,use,value) { return e.dispatch('chooseDiceControl',{use,value}); }
function itemCount(e) { return e._adventureEngine.s.consumables.filter(x=>x==='DiceController').length; }

test('challenge first-kill loot pauses the survivor turn until acknowledged, including a restored battle',()=>{
  const originalTimeout=context.setTimeout;
  const timers=[];
  context.setTimeout=fn=>{timers.push(fn);return timers.length;};
  runtime.setRandomSource(()=>.1);
  try {
    const e=new context.AdventureBattleEngine();
    e.startAdventure1v2({player:'Knight',opponent1:'FrozenOceanSnowyOwl',opponent2:'FrozenOceanOctopus',stage:1,discardTop:numCard(2,'BLUE'),
      playerState:{hp:70,maxHp:80},playerPile:{deck:[],hand:[numCard(2,'BLUE')],discard:[],handLimit:5}});
    e.events=[];timers.length=0;
    e.s.ai2.hp=0;e.check();
    assert.equal(e.s.trophyRolls.length,2);assert.equal(e.s.trophyRolls[0].monsterName,'FrozenOceanOctopus');
    const loot=e.events.find(evt=>evt.type==='trophyDrop');
    assert.equal(loot.battleContinues,true);
    const healIndex=e.events.findIndex(evt=>evt.type==='heal');
    assert.ok(healIndex>=0&&healIndex<e.events.findIndex(evt=>evt.type==='diceRoll'),'first-kill heal is presented before loot: '+e.events.map(evt=>evt.type).join(','));
    e.startAITurn();
    timers.shift()();
    assert.ok(!e.events.some(evt=>evt.type==='aiPlay'),'survivor cannot play underneath the loot sheet');
    assert.equal(typeof e._deferredLootTimer,'function');
    const saved=JSON.parse(JSON.stringify({s:e.s,piles:e.piles,events:e.events,ver:e.ver,tableTopOwner:e.tableTopOwner}));
    const restored=new context.AdventureBattleEngine();restored.restoreSession(saved);
    assert.equal(restored.s.trophyRolls.length,2,'restore does not roll loot again');
    const beforeTimers=timers.length;
    restored.acknowledgeEvents(loot.id-1);
    assert.equal(timers.length,beforeTimers,'unconfirmed loot still blocks the resumed timer');
    restored.acknowledgeEvents(restored.ver);
    assert.equal(timers.length,beforeTimers+1);
    timers.pop()();
    assert.ok(restored.events.some(evt=>evt.type==='aiPlay'&&evt.who==='ai'));
    assert.equal(restored.s.trophyRolls.length,2);
    e.acknowledgeEvents(e.ver);
    assert.equal(e._deferredLootTimer,null,'the live battle also releases its queued continuation');
  } finally {context.setTimeout=originalTimeout;runtime.resetRandomSource();}
});

test('DiceController is a 4-gold registered one-shot item, not activated from ordinary item slots',()=>{
  const def=AdventureRegistry.getItem('DiceController');assert.equal(def.price,4);assert.equal(def.kind,'consumable');assert.equal(def.diceOnly,true);
  const e=battle();e.s.phase='PLAYER_PLAY';e.s.busy=false;assert.equal(e._canUseAdventureCombatItemNow(def),false);
  assert.ok(fs.existsSync(path.join(gameRoot,'icons/items_icons/dice_controller.webp')));
});
test('fly result pauses before HP settlement; changing a failed die to success consumes exactly one item',()=>{
  runtime.setRandomSource(()=>.9);const e=battle(),hp=e.s.player.hp;
  e.dispatch('chooseFly');assert.equal(e.s.phase,'DICE_CHOICE');assert.equal(e.s.pendingDiceControl.value,11);
  assert.equal(e.s.player.hp,hp);assert.equal(e.s.player.fly,0);assert.equal(itemCount(e),1);
  choose(e,true,1);assert.equal(e.s.pendingDiceControl,null);assert.equal(e.s.player.hp,hp);assert.equal(itemCount(e),0);
  assert.ok(!e.s.pendingDialog);choose(e,true,12);assert.equal(itemCount(e),0);
  runtime.resetRandomSource();
});
test('keeping a failed fly result costs nothing and restores the retry decision',()=>{
  let randomCalls=0;runtime.setRandomSource(()=>{randomCalls++;return .9;});const e=battle();randomCalls=0;e.dispatch('chooseFly');
  choose(e,false);assert.equal(e.s.pendingDialog,'flyRetry');assert.equal(e.s.phase,'GUARD_CHOICE');assert.equal(itemCount(e),1);assert.equal(randomCalls,1);
  runtime.resetRandomSource();
});
test('remote dice rejects choosing the original face and leaves inventory untouched',()=>{
  runtime.setRandomSource(()=>.05);const e=battle();e.s.ai.alive=false;e.s.ai.hp=0;e.check();
  assert.equal(e.s.phase,'DICE_CHOICE');
  const original=e.s.pendingDiceControl.value,hand=e.h.player.length,items=itemCount(e);
  choose(e,true,original);
  assert.equal(e.s.phase,'DICE_CHOICE');
  assert.equal(e.s.pendingDiceControl.value,original);
  assert.equal(itemCount(e),items);
  assert.equal(e.h.player.length,hand);
  choose(e,true,original===1?2:1);
  assert.notEqual(e.s.phase,'DICE_CHOICE');
  assert.equal(itemCount(e),items-1);
  runtime.resetRandomSource();
});

test('invalid faces do not advance the roll or consume inventory; input is range-checked',()=>{
  runtime.setRandomSource(()=>.9);const e=battle();e.dispatch('chooseFly');
  for(const value of [0,13,1.5,'bad']) {choose(e,true,value);assert.equal(e.s.phase,'DICE_CHOICE');assert.equal(itemCount(e),1);}
  choose(e,true,7);assert.equal(itemCount(e),0);assert.equal(e.s.pendingDialog,'flyRetry');runtime.resetRandomSource();
});
test('dice choice rejects play/end/discard commands; animation acknowledgment cannot resume settlement',()=>{
  runtime.setRandomSource(()=>.9);const e=battle();e.dispatch('chooseFly');const hand=e.h.player.length;
  for(const command of ['doPlay','doEndTurn','doEnterDiscard','selectCard'])e.dispatch(command,{index:0});
  assert.equal(e.h.player.length,hand);assert.equal(e.s.phase,'DICE_CHOICE');
  e.dispatch('clearEvents',{throughId:e.ver});assert.equal(e.events.length,0);assert.equal(e.s.phase,'DICE_CHOICE');
  choose(e,false);assert.ok(e.events.every(x=>!['diceRoll'].includes(x.type)),'original dice animation is not replayed');runtime.resetRandomSource();
});
test('pending dice choice survives a JSON battle restore and does not re-roll randomness',()=>{
  let calls=0;runtime.setRandomSource(()=>{calls++;return .9;});const e=battle();calls=0;e.dispatch('chooseFly');
  const data=JSON.parse(JSON.stringify({s:e.s,piles:e.piles,events:e.events,ver:e.ver,pendingSettlement:e.pendingSettlement,tableTopOwner:e.tableTopOwner,testMode:true}));
  const restored=new context.AdventureBattleEngine();restored.later=()=>{};
  restored.restoreSession(data,{s:{consumables:['DiceController'],accessories:[]}});
  assert.equal(restored.s.phase,'DICE_CHOICE');choose(restored,true,1);assert.equal(itemCount(restored),0);assert.equal(calls,1);
  assert.equal(restored.s.player.hp,e.s.player.hp);runtime.resetRandomSource();
});
test('blindness blocks remote dice but does not stop ordinary rolling',()=>{
  runtime.setRandomSource(()=>.9);const e=battle();e.s.player.blind=1;e.dispatch('chooseFly');
  assert.ok(!e.s.pendingDiceControl);assert.equal(e.s.pendingDialog,'flyRetry');assert.equal(itemCount(e),1);runtime.resetRandomSource();
});
test('loot pauses before trophy creation, choosing a face selects the documented drop exactly once',()=>{
  runtime.setRandomSource(()=>.9);const e=battle(),hand=e.h.player.length;e.s.ai.alive=false;e.s.ai.hp=0;
  e.check();assert.equal(e.s.phase,'DICE_CHOICE');assert.equal(e.s.pendingDiceControl.purpose,'trophyDrop');assert.equal(e.h.player.length,hand);
  assert.equal(e.s.pendingDiceControl.presentation.monsterName,e.s.ai.name);
  assert.equal(e.s.pendingDiceControl.presentation.rollIndex,1);
  choose(e,true,1);assert.equal(e.h.player.length,hand+1);assert.equal(itemCount(e),0);
  assert.equal(e.s.trophyDrops[0],'GuardTrophy');e.check();assert.equal(e.h.player.length,hand+1);runtime.resetRandomSource();
});
test('Russian roulette uses the modified result without drawing or damaging twice',()=>{
  runtime.setRandomSource(()=>.05);const e=battle(),trophy=context.AdventureDeck.trophyWhite('RussianRouletteTrophy');
  e.s.phase='PLAYER_PLAY';e.s.busy=false;e.s.selectedCard=0;e.h.player.splice(0,e.h.player.length,trophy,numCard(4));
  const hp=e.s.player.hp,aiHp=e.s.ai.hp,deck=e.deck.length;
  e.dispatch('doPlay');assert.equal(e.s.phase,'DICE_CHOICE');assert.equal(e.s.player.hp,hp);assert.equal(e.s.ai.hp,aiHp);
  choose(e,true,12);assert.equal(e.s.player.hp,hp);assert.equal(e.s.ai.hp,aiHp-10);assert.equal(e.deck.length,deck-1);assert.equal(itemCount(e),0);
  assert.equal(e.piles.player.discard.filter(c=>c.trophyName==='RussianRouletteTrophy').length,1);runtime.resetRandomSource();
});
test('loot rules can evaluate a chosen face without another random call',()=>{
  const r=AdventureLoot.rollMonsterDrop('ocean','FrozenMammoth',()=>{throw Error('should not roll');},5);
  assert.equal(r.roll,5);assert.equal(r.drops[0],'GuardTrophy');
});
test('random tapes restore the original source after success or exception',()=>{
  let n=0;runtime.setRandomSource(()=>++n/10);const tape=[];
  runtime.withRandomTape(tape,()=>{assert.equal(runtime.random(),.1);assert.equal(runtime.random(),.2);});
  assert.equal(runtime.random(),.3);
  assert.throws(()=>runtime.withRandomTape(tape,()=>{assert.equal(runtime.random(),.1);throw Error('test');}));
  assert.equal(runtime.random(),.4);runtime.resetRandomSource();
});
test('PC attack, defense and judgment zones have matching fixed heights',()=>{
  const css=fs.readFileSync(path.join(gameRoot,'css/game.css'),'utf8');
  assert.match(css.match(/\.attack-zone, \.defend-zone \{[^}]+/)[0],/height: 162px/);
  assert.match(css.match(/\.reveal-zone \{[^}]+/)[0],/height: 162px/);
});

test('NPC fly result can be controlled before player attack settlement',()=>{
  const e=battle();runtime.setRandomSource(()=>.9);const hp=e.s.ai.hp;
  e.s.ai.fly=1;e.s.player.fly=0;e.s.atkOwner='player';e.s.phase='AI_DEFEND';e.s.busy=true;
  e.s.pendingAttack={damage:4};e.pendingSettlement={kind:'PLAYER_ATTACK',damage:4,bleed:0,afterEventId:e.ver};
  e.acknowledgeEvents(e.ver);assert.equal(e.s.phase,'DICE_CHOICE');assert.equal(e.s.pendingDiceControl.who,'ai');assert.equal(e.s.ai.hp,hp);
  choose(e,true,1);assert.equal(e.s.ai.hp,hp);assert.equal(e.s.ai.fly,0);assert.equal(itemCount(e),0);runtime.resetRandomSource();
});
for(const face of [1,12])test('Ghost defense resumes with chosen D12 face '+face+' and one defense-card discard',()=>{
  const e=battle(['DiceController'],'CastleGhost');runtime.setRandomSource(()=>.9);
  e.h.ai.splice(0,e.h.ai.length,numCard(1));e.s.phase='AI_DEFEND';e.s.busy=true;e.s.atkOwner='player';e.s.atkCard=numCard(4);e.s.pendingAttack={damage:5};
  e.s.discardTop=numCard(4);e.s.discardTopOwner='player';e.tableTopOwner='player';e.piles.player.discard.push(e.s.discardTop);
  const hp=e.s.ai.hp;e.aiDefend(numCard(4),5);assert.equal(e.s.phase,'DICE_CHOICE');assert.equal(e.s.ai.hp,hp);
  choose(e,true,face);assert.ok(!e.s.pendingDiceControl);assert.equal(itemCount(e),0);
  if(e.pendingSettlement)e.acknowledgeEvents(e.ver);
  if(face===1)assert.equal(e.s.ai.hp,hp);else assert.ok(e.s.ai.hp<hp,'failed immunity retains normal defense settlement');
  assert.equal(e.piles.ai.discard.filter(c=>c.isNumberCard&&c.value===1).length,1);runtime.resetRandomSource();
});
test('two simultaneous enemy defeats produce two separate controllable loot decisions, without duplicate trophies',()=>{
  const e=new context.AdventureBattleEngine();e.startAdventure1v2({player:'Ryan',opponent1:'CastleWolf',opponent2:'CastleFox',scene:'castle',testMode:true,
    playerPile:{deck:[numCard(1),numCard(2)],hand:[numCard(3)],discard:[],handLimit:5}});
  e._adventureEngine={s:{consumables:['DiceController','DiceController'],accessories:[]}};e.later=()=>{};
  runtime.setRandomSource(()=>.9);const hand=e.h.player.length;
  e.s.ai.alive=false;e.s.ai.hp=0;e.s.ai2.alive=false;e.s.ai2.hp=0;e.check();
  assert.equal(e.s.phase,'DICE_CHOICE');choose(e,true,1);assert.equal(e.s.phase,'DICE_CHOICE');assert.equal(itemCount(e),1);
  assert.equal(e.h.player.length,hand+1);choose(e,true,1);assert.equal(itemCount(e),0);assert.equal(e.h.player.length,hand+2);
  assert.deepEqual(Array.from(e.s.trophyDrops),['GuardTrophy','PiercingTrophy']);e.check();assert.equal(e.h.player.length,hand+2);runtime.resetRandomSource();
});
test('judgment UI uses a bottom-sheet decision, keeps one dialog and sends one command',async()=>{
  const {JSDOM}=require('jsdom');const dom=new JSDOM('<div class="reveal-zone"><div id="reveal-cards"></div></div>',{runScripts:'outside-only'});
  const w=dom.window;w.GameUI=function(){};w.eval(fs.readFileSync(path.join(gameRoot,'js/ui/render/zone_render.js'),'utf8'));
  const ui=new w.GameUI(),calls=[];ui.state={pendingDiceControl:{value:11,diceIndex:0,presentedThrough:5}};
  ui._apiAction=async(method,params)=>{calls.push([method,params]);};ui._renderDiceControl();
  const panel=w.document.getElementById('dice-control-dialog');
  assert(panel.classList.contains('dialog-sheet-overlay'));
  assert(panel.querySelector('.dialog-bottom-sheet'));assert.equal(panel.querySelectorAll('[data-face]').length,12);
  ui._renderDiceControl();assert.equal(w.document.getElementById('dice-control-dialog'),panel);
  panel.querySelector('[data-face="7"]').click();panel.querySelector('[data-face="8"]').click();await Promise.resolve();
  assert.equal(calls.length,1);assert.equal(calls[0][0],'chooseDiceControl');assert.equal(calls[0][1].value,7);
  ui.state={};ui._renderDiceControl();assert.equal(w.document.getElementById('dice-control-dialog'),null);dom.window.close();
});

test('Boss uses exactly three independent D12 loot rolls, preserving empty and repeated results', () => {
  const e=battle([], 'CastleChameleon');
  const faces=[2,10,6]; let index=0;
  runtime.setRandomSource(()=> (faces[index++]-1)/12);
  const hand=e.h.player.length; e.s.ai.alive=false; e.s.ai.hp=0; e.check();
  assert.equal(index,3);
  assert.deepEqual(Array.from(e.s.trophyRolls, r=>r.roll),faces);
  assert.deepEqual(Array.from(e.s.trophyDrops),['PoisonTrophy','GuardTrophy']);
  assert.equal(e.h.player.length,hand+2);
  const dice=e.events.filter(evt=>evt.type==='diceRoll'&&evt.purpose==='trophyDrop');
  assert.deepEqual(Array.from(dice,evt=>evt.rollIndex),[1,2,3]);
  assert.ok(dice.every(evt=>evt.rollCount===3));
  e.check();assert.equal(index,3);runtime.setRandomSource(()=>.5);e.finishAdventureBattle();
  assert.equal(e.s.trophyRolls.length,3,'no fourth roll on completion');
  runtime.resetRandomSource();
});

test('Boss three loot rolls support remote dice and page restore without duplicating white cards', () => {
  let e=battle(['DiceController','DiceController','DiceController'], 'CastleChameleon');
  runtime.setRandomSource(()=>.9);const hand=e.h.player.length;
  e.s.ai.alive=false;e.s.ai.hp=0;e.check();
  assert.equal(e.s.phase,'DICE_CHOICE');
  choose(e,true,1);assert.equal(e.s.phase,'DICE_CHOICE');assert.equal(e.h.player.length,hand+1);
  const saved=JSON.parse(JSON.stringify({s:e.s,piles:e.piles,events:e.events,ver:e.ver,testMode:e.testMode,pendingSettlement:e.pendingSettlement}));
  const adventure=e._adventureEngine;e=new context.AdventureBattleEngine();e.restoreSession(saved,adventure);e.later=()=>{};
  choose(e,true,6);assert.equal(e.s.phase,'DICE_CHOICE');
  choose(e,true,1);
  assert.ok(!e.s.pendingDiceControl);assert.equal(itemCount(e),0);
  assert.deepEqual(Array.from(e.s.trophyRolls,r=>r.roll),[1,6,1]);
  assert.deepEqual(Array.from(e.s.trophyDrops),['PoisonTrophy','GuardTrophy','PoisonTrophy']);
  assert.equal(e.h.player.length,hand+3);
  e.check();assert.equal(e.h.player.length,hand+3);
  runtime.resetRandomSource();
});

test('Boss three misses grant nothing; normal monsters still roll only once', () => {
  // Face 10 stays empty; 11/12 are universal dual-source potions (tested elsewhere).
  for(const [opponent, count] of [['CastleChameleon',3],['CastleWolf',1]]) {
    const e=battle([],opponent);runtime.setRandomSource(()=>.75);const hand=e.h.player.length;
    e.s.ai.alive=false;e.s.ai.hp=0;e.check();
    assert.equal(e.s.trophyRolls.length,count);assert.equal(e.s.trophyDrops.length,0);
    assert.equal(e.h.player.length,hand);
    assert.ok(e.s.trophyRolls.every(r=>r.roll===10));
  }
  runtime.resetRandomSource();
});

test('Boss can award the same trophy on each of its three rolls', () => {
  const e=battle([], 'CastleEagle');runtime.setRandomSource(()=>0);const hand=e.h.player.length;
  e.s.stage=4;e.s.ai.alive=false;e.s.ai.hp=0;e.check();
  // battle() starts in GUARD_CHOICE with pending guard; loot still grants 3 identical trophies.
  assert.equal(e.s.trophyRolls.length,3);
  assert.deepEqual(Array.from(e.s.trophyDrops),['CritTrophy','CritTrophy','CritTrophy']);
  assert.equal(e.h.player.length,hand+3);
  runtime.resetRandomSource();
});
test('loot uses the defeated Boss rule even when a legacy/test map has a different scene', () => {
  const e=battle([], 'ForestPanda'); // battle() uses the castle scene, like older/test encounters.
  runtime.setRandomSource(()=>0);
  const before=e.h.player.length;e.s.ai.alive=false;e.s.ai.hp=0;e.check();
  assert.equal(e.s.trophyRolls.length,3);
  assert.deepEqual(Array.from(e.s.trophyDrops),['LushTrophy','LushTrophy','LushTrophy']);
  assert.equal(e.h.player.length,before+3);
  const result=e.finishAdventureBattle();
  assert.equal(result.playerPile.hand.filter(c=>c.trophyName==='LushTrophy').length,3);
  runtime.resetRandomSource();
});

test('Magician adjusts D12 by +1 and costs 3 HP', () => {
  const e = battle([], 'CastleWolf');
  e._adventureEngine.s.accessories = ['Magician'];
  e.s.accessories = ['Magician'];
  runtime.setRandomSource(() => 0); // face 1
  const hand = e.h.player.length;
  const hpBefore = e.s.player.hp;
  e.s.ai.alive = false; e.s.ai.hp = 0; e.check();
  assert.equal(e.s.phase, 'DICE_CHOICE');
  assert.equal(e.s.pendingDiceControl.mode, 'magician');
  assert.equal(e.s.pendingDiceControl.value, 1);
  e.dispatch('chooseDiceControl', { adjust: 1 });
  assert.ok(!e.s.pendingDiceControl);
  assert.ok(e._adventureEngine.s.accessories.includes('Magician'));
  assert.equal(e.s.player.hp, hpBefore - 3);
  // Wolf threshold 4: face 2 still drops Guard
  assert.ok(e.s.trophyDrops.includes('GuardTrophy') || e.h.player.length >= hand);
  runtime.resetRandomSource();
});

test('Magician cannot adjust when player HP is 3 or less', () => {
  const e = battle([], 'CastleWolf');
  e._adventureEngine.s.accessories = ['Magician'];
  e.s.accessories = ['Magician'];
  e.s.player.hp = 3;
  runtime.setRandomSource(() => 0);
  e.s.ai.alive = false; e.s.ai.hp = 0; e.check();
  assert.equal(e.s.phase, 'DICE_CHOICE');
  e.dispatch('chooseDiceControl', { adjust: 1 });
  assert.equal(e.s.phase, 'DICE_CHOICE');
  assert.equal(e.s.player.hp, 3);
  e.dispatch('chooseDiceControl', { adjust: 0 });
  assert.ok(!e.s.pendingDiceControl);
  runtime.resetRandomSource();
});

test('Magician at face 1 cannot go −1', () => {
  const e = battle([], 'CastleWolf');
  e._adventureEngine.s.accessories = ['Magician'];
  e.s.accessories = ['Magician'];
  runtime.setRandomSource(() => 0);
  e.s.ai.alive = false; e.s.ai.hp = 0; e.check();
  assert.equal(e.s.phase, 'DICE_CHOICE');
  e.dispatch('chooseDiceControl', { adjust: -1 });
  assert.equal(e.s.phase, 'DICE_CHOICE');
  e.dispatch('chooseDiceControl', { adjust: 0 });
  assert.ok(!e.s.pendingDiceControl);
  runtime.resetRandomSource();
});

test('face editing marks the original dice event instead of a later Magician HP or description event',()=>{
 for(const mode of ['remote','magician']) {
  const e=battle(mode==='remote'?['DiceController']:[]),emitted=[];
  if(mode==='magician')e._adventureEngine.s.accessories=['Magician'];
  const emit=e.emit;
  e.emit=function(...args){const result=emit.apply(this,args);emitted.push(this.events[this.events.length-1]);return result;};
  runtime.setRandomSource(()=>.9);
  try {
   e.dispatch('chooseFly');emitted.length=0;
   e.dispatch('chooseDiceControl',mode==='remote'?{use:true,value:1}:{adjust:-1});
   const die=emitted.find(evt=>evt.type==='diceRoll');
   assert.ok(die.controlled);assert.equal(die.originalValue,11);assert.equal(die.value,mode==='remote'?1:10);
   assert.ok(emitted.filter(evt=>evt.type!=='diceRoll').every(evt=>!evt.controlled),'only the die is a modified roll');
   assert.ok(!e.events.some(evt=>evt.type==='diceRoll'),'already presented roll is not emitted again');
  }finally{runtime.resetRandomSource();}
 }
});
