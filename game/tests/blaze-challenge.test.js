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

const {AdventureBattleEngine,AdventureDeck}=context;
const card=value=>({value,color:'WHITE',isNumberCard:true,isItemCard:false,isWhite:true,isBlack:false});
for(const hammer of [false,true])for(const kind of ['number','trophy'])for(const hp of [[20,20],[6,20],[20,5],[5,5]]) {
 test(`Blaze zero challenge hammer=${hammer} ${kind} hp=${hp}`,()=>{
  const e=new AdventureBattleEngine();e.later=()=>{};
  e.startAdventure1v2({player:'Blaze',opponent1:'CastleFox',opponent2:'CastleFox',stage:1,
    playerPile:{deck:[],hand:[kind==='trophy'?AdventureDeck.trophyWhite('ZeroTrophy'):card(0)],discard:[],handLimit:5},discardTop:card(1)});
  const accessories=hammer?['JusticeHammer']:[];
  e._adventureEngine={s:{accessories,consumables:[]},hasAccessory:name=>accessories.includes(name),accessoryCount:name=>accessories.filter(x=>x===name).length};
  for(const [i,key] of ['ai','ai2'].entries())Object.assign(e.s[key],{hp:hp[i],alive:true,guard:0,fly:0,harden:0,burn:0,diving:false});
  e.s.phase='PLAYER_PLAY';e.s.busy=false;e.s.selectedCard=0;e.events=[];
  e.dispatch('doPlay');
  if(e.s.phase==='ATTACK_MOD_CHOICE')e.dispatch('resolveAttackModChoice',{bonus:0});
  for(let i=0;i<12&&(e.events.length||e.pendingSettlement||e.s.pendingAIDefense);i++)e.acknowledgeEvents(e.ver);
  assert.ok(!e.pendingSettlement);
  assert.ok(!e.s.pendingAIDefense);
  assert.ok(['PLAYER_PLAY','AI_TURN','AI2_TURN','GAME_OVER'].includes(e.s.phase),e.s.phase);
  for(const [i,key] of ['ai','ai2'].entries())assert.equal(e.s[key].hp,Math.max(0,hp[i]-(hammer?6:5)),key+' includes hammer damage exactly once');
 });
}

for(const control of ['none','remote','magician'])for(const magma of [false,true]){
 test(`Blaze zero with hammer, fly and ${control}, magma=${magma} resumes`,()=>{
  const e=new AdventureBattleEngine();e.later=()=>{};
  e.startAdventure1v2({player:'Blaze',opponent1:'CastleFox',opponent2:'CastleFox',stage:1,
    playerPile:{deck:[],hand:[card(0)],discard:[],handLimit:5},discardTop:card(1)});
  const accessories=['JusticeHammer',...(control==='magician'?['Magician']:[])],consumables=control==='remote'?['DiceController']:[];
  e._adventureEngine={s:{accessories,consumables},hasAccessory:name=>accessories.includes(name),accessoryCount:name=>accessories.filter(x=>x===name).length};
  for(const key of ['ai','ai2'])Object.assign(e.s[key],{hp:5,alive:true,guard:0,fly:1,harden:0,burn:0,diving:false});
  if(magma)e.s.player.magmaVein=1;
  e.s.phase='PLAYER_PLAY';e.s.busy=false;e.s.selectedCard=0;e.events=[];
  e.dispatch('doPlay');
  let steps=0;
  while(steps++<60){
   if(e.s.pendingDiceControl)e.dispatch('chooseDiceControl',{use:false});
   else if(e.s.phase==='ATTACK_BUFF_CHOICE')e.dispatch('resolveAttackBuffChoice',{buff:'magmaVein'});
   else if(e.s.phase==='ATTACK_MOD_CHOICE')e.dispatch('resolveAttackModChoice',{bonus:0});
   else if(e.events.length||e.pendingSettlement||e.s.pendingAIDefense)e.acknowledgeEvents(e.ver);
   else break;
  }
  assert.ok(steps<60,JSON.stringify({phase:e.s.phase,pending:e.s.pendingDiceControl}));
  assert.ok(['PLAYER_PLAY','AI_TURN','AI2_TURN','GAME_OVER'].includes(e.s.phase),e.s.phase);
 });
}

test('a restored unblockable Blaze zero recovers its missing settlement instead of waiting for NPC defense',()=>{
 const e=new AdventureBattleEngine();e.later=()=>{};
 e.startAdventure1v2({player:'Blaze',opponent1:'CastleFox',opponent2:'CastleFox',stage:1,
  playerPile:{deck:[],hand:[card(0)],discard:[],handLimit:5},discardTop:card(1)});
 e.s.phase='PLAYER_PLAY';e.s.busy=false;e.s.selectedCard=0;e.events=[];
 e.dispatch('doPlay');e.dispatch('resolveAttackModChoice',{bonus:0});
 assert.ok(e.pendingSettlement);
 const saved=JSON.parse(JSON.stringify({s:e.s,piles:e.piles,events:e.events,ver:e.ver,tableTopOwner:e.tableTopOwner}));
 const restored=new AdventureBattleEngine();restored.later=()=>{};
 restored.restoreSession(saved,null,true);
 for(let i=0;i<8&&restored.events.length;i++)restored.acknowledgeEvents(restored.ver);
 assert.equal(restored.s.phase,'PLAYER_PLAY');
 assert.equal(restored.s.busy,false);
});

test('hammer remains a flat bonus on both AOE targets when magma is used',()=>{
 const e=new AdventureBattleEngine();e.later=()=>{};
 e.startAdventure1v2({player:'Blaze',opponent1:'CastleFox',opponent2:'CastleFox',stage:1,
  playerPile:{deck:[],hand:[card(0)],discard:[],handLimit:5},discardTop:card(1)});
 e._adventureEngine={s:{accessories:['JusticeHammer'],consumables:[]},hasAccessory:name=>name==='JusticeHammer',accessoryCount:name=>name==='JusticeHammer'?1:0};
 for(const key of ['ai','ai2'])Object.assign(e.s[key],{hp:20,alive:true,guard:0,fly:0,harden:0,burn:0,diving:false});
 e.s.player.magmaVein=1;
 e.s.phase='PLAYER_PLAY';e.s.busy=false;e.s.selectedCard=0;e.events=[];
 e.dispatch('doPlay');e.dispatch('resolveAttackBuffChoice',{buff:'magmaVein'});
 for(let i=0;i<8&&(e.events.length||e.pendingSettlement);i++)e.acknowledgeEvents(e.ver);
 assert.equal(e.s.ai.hp,11);assert.equal(e.s.ai2.hp,11);
 assert.equal(e.s.phase,'PLAYER_PLAY');
});

for(const emptyEvents of [false,true])test('live acknowledgement repairs a skipped-defense queue only once, emptyEvents='+emptyEvents,()=>{
 const e=new AdventureBattleEngine();e.later=()=>{};
 e.startAdventure1v2({player:'Blaze',opponent1:'CastleFox',opponent2:'CastleFox',stage:1,
  playerPile:{deck:[],hand:[card(0)],discard:[],handLimit:5},discardTop:card(1)});
 for(const key of ['ai','ai2'])Object.assign(e.s[key],{hp:20,alive:true,guard:0,fly:0,harden:0,burn:0,diving:false});
 e.s.phase='PLAYER_PLAY';e.s.busy=false;e.s.selectedCard=0;e.events=[];
 e.dispatch('doPlay');e.dispatch('resolveAttackModChoice',{bonus:0});
 e.pendingSettlement=null;
 if(emptyEvents)e.events=[];
 for(let i=0;i<8&&(e.s.phase==='AI_DEFEND'||e.events.length);i++)e.acknowledgeEvents(e.ver);
 e.acknowledgeEvents(e.ver);
 assert.equal(e.s.ai.hp,15);assert.equal(e.s.ai2.hp,15);
 assert.equal(e.s.phase,'PLAYER_PLAY');assert.equal(e.s.busy,false);
});
