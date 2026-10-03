const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const gameRoot = path.resolve(__dirname, '..');

function createContext() {
  const ctx = vm.createContext({
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
    performance: { now: () => 0 },
    localStorage: {
      _store: {},
      setItem(k, v) { this._store[k] = String(v); },
      getItem(k) { return k in this._store ? this._store[k] : null; },
      removeItem(k) { delete this._store[k]; }
    },
    sessionStorage: {
      _store: {},
      setItem(k, v) { this._store[k] = String(v); },
      getItem(k) { return k in this._store ? this._store[k] : null; },
      removeItem(k) { delete this._store[k]; }
    }
  });
  ctx.window = ctx;
  return ctx;
}

const SOURCES = [
  'js/combat/runtime.js',
  'js/characters/registry.js',
  'js/characters/ryan.js',
  'js/characters/leon.js',
  'adventure/js/content/registry.js',
  'adventure/js/content/currency.js',
  'adventure/js/content/room.js',
  'adventure/js/map/csv_loader.js',
  'adventure/js/map/map.js',
  'adventure/js/content/monster.js',
  'adventure/js/monsters/castle.js',
  'adventure/js/monsters/forest.js',
  'adventure/js/monsters/ocean.js',
  'adventure/js/content/boss.js',
  'adventure/js/content/monster_registry.js',
  'adventure/js/items/item_defs.js',
  'adventure/js/items/map_effects.js',
  'adventure/js/deck/adventure_deck.js',
  'adventure/js/deck/npc_strategy.js',
  'adventure/js/save/adventure_save.js',
  'adventure/js/engine/adventure_engine.js',
  'adventure/js/engine/loot.js',
  'adventure/js/engine/shop.js',
  'adventure/js/engine/rewards.js',
  'adventure/js/engine/inventory.js',
  'adventure/js/engine/combat_result.js',
  'adventure/js/battle/adventure_battle_session.js'
];

function loadSources(ctx) {
  for (const relative of SOURCES) {
    const file = path.join(gameRoot, relative);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
}

function makeMap(ctx) {
  return new ctx.AdventureMap([
    [0, 1, -1],
    [3, 4, -1],
    [-1, 6, 2]
  ]);
}

test('save module round-trips engine state through serialize and restore', () => {
  const ctx = createContext();
  loadSources(ctx);
  const { AdventureEngine, AdventureSave, AdventureDeck } = ctx;

  const map = makeMap(ctx);
  const eng = new AdventureEngine();
  eng.mapName = 'stage_01_castle_1';
  eng.start(map, 'Ryan', { gold: 5, stage: 1, scene: 'castle' });

  eng.s.currency.addTokens({ ben: 2, huo: 1 });
  eng.s.player.hp = 61;
  eng.s.player.guard = 2;
  eng.s.playerPile.discard.push(AdventureDeck.num('RED', 4));
  const startRoom = map.get(eng.s.pos.r, eng.s.pos.c);
  startRoom.visited = true;

  const saved = AdventureSave.serialize(eng);
  assert.ok(saved, 'serialize returns data');
  assert.equal(saved.version, 1);
  assert.equal(saved.characterName, 'Ryan');
  assert.equal(saved.mapName, 'stage_01_castle_1');
  assert.equal(saved.player.hp, 61);

  const map2 = makeMap(ctx);
  const eng2 = new AdventureEngine();
  eng2.mapName = saved.mapName;
  eng2.restoreFromSave(JSON.parse(JSON.stringify(saved)), map2);

  assert.equal(eng2.s.player.name, 'Ryan');
  assert.equal(eng2.s.player.hp, 61);
  assert.equal(eng2.s.player.guard, 2);
  assert.equal(eng2.s.currency.gold, 5);
  assert.equal(eng2.s.currency.tokens.ben, 2);
  assert.equal(eng2.s.currency.tokens.huo, 1);
  assert.equal(eng2.s.phase, 'ADVENTURE_MAP');
  assert.deepEqual(eng2.s.pos, saved.pos);
  assert.equal(eng2.s.playerPile.deck.length, saved.playerPile.deck.length);
  assert.equal(eng2.s.playerPile.hand.length, saved.playerPile.hand.length);
  assert.equal(eng2.s.playerPile.discard.length, saved.playerPile.discard.length);
  assert.equal(eng2.s.playerPile.handLimit, saved.playerPile.handLimit);
  assert.deepEqual(eng2.s.discardTop.get(), saved.discardTop);
  assert.equal(map2.get(eng2.s.pos.r, eng2.s.pos.c).visited, true);
  assert.equal(eng2.s.currency.maxBeast, saved.currency.maxBeast);
});

test('save and load persist through localStorage with room diffs', () => {
  const ctx = createContext();
  loadSources(ctx);
  const { AdventureEngine, AdventureSave } = ctx;

  const map = makeMap(ctx);
  const eng = new AdventureEngine();
  eng.mapName = 'stage_01_forest_2';
  eng.start(map, 'Leon', { gold: 0, stage: 1, scene: 'forest' });

  const normalRoom = map.get(0, 1);
  normalRoom.monsterName = 'ForestPiranha';
  const shopRoom = map.get(1, 1);
  shopRoom.shopSlots = [null, null, null, null, null, null];
  const itemRoom = map.get(1, 0);
  itemRoom.doorCost = ['ben', 'cao'];
  itemRoom.doorUnlocked = true;

  AdventureSave.save(eng);
  const loaded = AdventureSave.load();
  assert.ok(loaded, 'load returns saved data');
  assert.equal(loaded.characterName, 'Leon');
  assert.equal(loaded.scene, 'forest');
  assert.equal(loaded.rooms['0,1'].monsterName, 'ForestPiranha');
  assert.deepEqual(loaded.rooms['1,0'].doorCost, ['ben', 'cao']);
  assert.equal(loaded.rooms['1,0'].doorUnlocked, true);
  assert.deepEqual(loaded.rooms['1,1'].shopSlots, [null, null, null, null, null, null]);

  assert.equal(AdventureSave.isSafePhase('ADVENTURE_PLAYER_PLAY'), false);
  assert.equal(AdventureSave.isSafePhase('ADVENTURE_MAP'), true);

  AdventureSave.clear();
  assert.equal(AdventureSave.load(), null);
});

test('settlement save preserves cleared room and pending reward after refresh', () => {
  const ctx = createContext();
  loadSources(ctx);
  const { AdventureEngine, AdventureSave, AdventurePhase } = ctx;

  const map = makeMap(ctx);
  const eng = new AdventureEngine();
  eng.mapName = 'stage_01_castle_1';
  eng.start(map, 'Ryan', { gold: 0, stage: 1, scene: 'castle' });
  assert.equal(eng.move(0, 1), true);
  const room = eng.currentRoom();
  eng.s.combat = { enemy: 'CastleWolf', enemy2: null, kind: 'normal', is1v2: false };

  eng.onCombatEnd('win');
  assert.equal(eng.s.phase, AdventurePhase.COMBAT_SETTLE);
  assert.equal(room.cleared, true);
  assert.ok(eng.s.pendingCombatReward);

  AdventureSave.save(eng);
  const saved = AdventureSave.load();
  assert.equal(saved.phase, AdventurePhase.COMBAT_SETTLE);
  assert.equal(saved.rooms['0,1'].visited, true);
  assert.equal(saved.rooms['0,1'].cleared, true);
  assert.ok(saved.pendingCombatReward);

  const restoredMap = makeMap(ctx);
  const restored = new AdventureEngine();
  restored.mapName = saved.mapName;
  restored.restoreFromSave(saved, restoredMap);
  assert.equal(restored.s.phase, AdventurePhase.COMBAT_SETTLE);
  assert.equal(restored.currentRoom().cleared, true);
  assert.ok(restored.s.pendingCombatReward);
});

test('normal room fixes monster name on first entry', () => {
  const ctx = createContext();
  loadSources(ctx);
  const { AdventureEngine, AdventureRegistry } = ctx;

  const map = makeMap(ctx);
  const eng = new AdventureEngine();
  eng.mapName = 'stage_01_castle_1';
  eng.start(map, 'Ryan', { gold: 0, stage: 1, scene: 'castle' });

  eng.move(0, 1);
  const room = map.get(0, 1);
  assert.equal(room.monsterName, null);
  eng.enterCurrent();
  assert.ok(room.monsterName, 'monster name is fixed into the room');
  const fixed = room.monsterName;
  assert.ok(AdventureRegistry.getMonster(fixed), 'fixed monster exists in registry');
  assert.equal(eng._pickMonsterName(room), fixed);
});

test('activeCombat lock survives save/load and blocks farming after refresh', () => {
  const ctx = createContext();
  loadSources(ctx);
  const { AdventureEngine, AdventureSave, AdventureBattleSession, AdventurePhase } = ctx;

  const map = makeMap(ctx);
  const eng = new AdventureEngine();
  eng.mapName = 'stage_01_castle_1';
  eng.start(map, 'Ryan', { gold: 0, stage: 1, scene: 'castle' });
  assert.equal(eng.move(0, 1), true);
  eng.enterCurrent();
  const room = eng.currentRoom();
  const enemy = room.monsterName;
  assert.ok(enemy);

  eng.markActiveCombat({ enemy, kind: 'monster' });
  assert.ok(eng.s.activeCombat);
  assert.equal(eng.s.phase, AdventurePhase.MAP);
  assert.equal(eng.canMoveTo(1, 0), false, 'locked fight blocks map movement');

  AdventureSave.save(eng);
  const saved = AdventureSave.load();
  assert.ok(saved.activeCombat);
  assert.equal(saved.activeCombat.enemy, enemy);
  assert.deepEqual(saved.activeCombat.pos, { r: 0, c: 1 });
  assert.equal(saved.rooms['0,1'].monsterName, enemy);
  assert.equal(saved.rooms['0,1'].cleared, false);

  const restoredMap = makeMap(ctx);
  const restored = new AdventureEngine();
  restored.mapName = saved.mapName;
  restored.restoreFromSave(saved, restoredMap);
  assert.ok(restored.s.activeCombat);
  assert.equal(restored.s.activeCombat.enemy, enemy);
  assert.equal(restored.currentRoom().monsterName, enemy);
  assert.equal(restored.currentRoom().cleared, false);
  assert.equal(restored.canMoveTo(1, 0), false);

  // Simulate finishing the fight: lock clears and the room can be marked done.
  restored.s.combat = { enemy, enemy2: null, kind: 'normal', is1v2: false };
  restored.onCombatEnd('win');
  assert.equal(restored.s.activeCombat, null);
  assert.equal(restored.currentRoom().cleared, true);
});

test('battle session persists in localStorage across simulated refresh', () => {
  const ctx = createContext();
  loadSources(ctx);
  const { AdventureBattleSession } = ctx;

  const fakeEngine = {
    testMode: false,
    mapName: 'stage_01_castle_1',
    _adventureEngine: { mapName: 'stage_01_castle_1', s: { pos: { r: 0, c: 1 } } },
    s: {
      phase: 'PLAYER_PLAY',
      player: { name: 'Ryan', hp: 40 },
      ai: { name: 'CastleWolf', hp: 12 }
    },
    piles: { player: { deck: [], hand: [], discard: [] }, ai: { deck: [], hand: [], discard: [] } },
    h: { player: [], ai: [] },
    events: [],
    ver: 3,
    pendingSettlement: null,
    tableTopOwner: 'player'
  };

  assert.equal(AdventureBattleSession.save(fakeEngine), true);
  assert.ok(ctx.localStorage.getItem(AdventureBattleSession.key));
  assert.equal(ctx.sessionStorage.getItem(AdventureBattleSession.key), null);

  const loaded = AdventureBattleSession.load();
  assert.ok(loaded);
  assert.equal(loaded.characterName, 'Ryan');
  assert.equal(loaded.enemy, 'CastleWolf');
  assert.deepEqual(loaded.pos, { r: 0, c: 1 });
  assert.equal(loaded.battle.ver, 3);
  assert.equal(AdventureBattleSession.matches(loaded, 'Ryan', 'stage_01_castle_1'), true);
});

test('using a map item is kept after save/load', () => {
  const ctx = createContext();
  loadSources(ctx);
  const { AdventureEngine, AdventureSave } = ctx;

  const map = makeMap(ctx);
  const eng = new AdventureEngine();
  eng.mapName = 'stage_01_castle_1';
  eng.start(map, 'Ryan', { gold: 0, stage: 1, scene: 'castle', consumables: ['FirstAidKit', 'GhostFire'] });
  eng.s.player.hp = eng.s.player.maxHp;
  AdventureSave.save(eng);

  const used = eng.useConsumable(0);
  assert.equal(used.ok, true);
  assert.deepEqual(eng.s.consumables, ['GhostFire']);
  AdventureSave.save(eng);

  const saved = AdventureSave.load();
  assert.deepEqual(saved.consumables, ['GhostFire']);

  const restoredMap = makeMap(ctx);
  const restored = new AdventureEngine();
  restored.mapName = saved.mapName;
  restored.restoreFromSave(saved, restoredMap);
  assert.deepEqual(restored.s.consumables, ['GhostFire']);
});

function mapUI(ctx, eng) {
  vm.runInContext(fs.readFileSync(path.join(gameRoot, 'adventure/js/ui/adventure_ui.js'), 'utf8'),ctx);
  const ui=Object.create(ctx.AdventureUI.prototype);
  ui.eng=eng;ui._test=null;ui.container={innerHTML:'',replaceChildren(){}};
  ui._patchMapPosition=()=>ui._persistAdventure(eng.snapshot());ui._toast=()=>{};
  ui.render=()=>ui._persistAdventure(eng.snapshot());
  return ui;
}
function mapRun(ctx, grid) {
  const eng=new ctx.AdventureEngine();eng.mapName='stage_01_castle_1';
  eng.start(new ctx.AdventureMap(grid),'Ryan',{scene:'castle',stage:1});
  return eng;
}

test('single-click selection and refresh cannot explore through an uncleared combat room',()=>{
 const ctx=createContext();loadSources(ctx);const eng=mapRun(ctx,[[0,1,1,2]]),ui=mapUI(ctx,eng);
 ui._onCellClick(0,1);
 assert.equal(eng.s.pos.c,1);assert.equal(eng.currentRoom().visited,false);
 assert.equal(eng.canMoveTo(0,2),false);ui._onCellClick(0,2);assert.equal(eng.s.pos.c,1);
 const saved=ctx.AdventureSave.load(),restored=new ctx.AdventureEngine();
 restored.restoreFromSave(saved,ctx.AdventureMap.fromGrid(saved.mapLayout));
 assert.equal(restored.s.pos.c,1);assert.equal(restored.canMoveTo(0,2),false);
 restored.currentRoom().visited=true;assert.equal(restored.canMoveTo(0,2),false,'entering an unfinished fight is not clearing it');
 restored.currentRoom().cleared=true;assert.equal(restored.canMoveTo(0,2),true);
 assert.equal(restored.canMoveTo(0,3),false,'only the immediate frontier opens');
});

test('functional rooms expand exploration only after entry/payment succeeds',()=>{
 const ctx=createContext();loadSources(ctx);
 for(const code of [3,4,5]){
  const eng=mapRun(ctx,[[0,code,1]]);eng.move(0,1);
  assert.equal(eng.canMoveTo(0,2),false);
  if(code!==4){const result=eng.enterCurrent();assert.equal(result.ok,false);assert.equal(eng.currentRoom().visited,false);assert.equal(eng.canMoveTo(0,2),false);}
  eng.s.currency.gold=10;eng.s.currency.addTokens({ben:10,huo:10,shui:10,cao:10,wan:10});
  if(code===3)eng.currentRoom().doorCost=['ben','ben'];
  eng.enterCurrent();assert.equal(eng.currentRoom().visited,true);eng.returnToMap();
  assert.equal(eng.canMoveTo(0,2),true);
 }
});

test('legacy click-only marks cannot unlock a disconnected chain after restore',()=>{
 const ctx=createContext();loadSources(ctx);const eng=mapRun(ctx,[[0,1,4,1,2]]);
 for(const room of eng.s.map.grid[0])room.visited=true;
 eng.s.pos={r:0,c:3};const saved=ctx.AdventureSave.serialize(eng);delete saved.explorationVersion;
 const restored=new ctx.AdventureEngine();restored.restoreFromSave(saved,ctx.AdventureMap.fromGrid(saved.mapLayout));
 assert.equal(restored.s.pos.c,0);assert.equal(restored.s.map.get(0,2).visited,false);
 assert.equal(restored.canMoveTo(0,2),false);assert.equal(restored.canMoveTo(0,4),false);
});

test('map autosave includes tokens, buffs, card order and room changes with successful-write deduplication',()=>{
 const ctx=createContext();loadSources(ctx);const eng=mapRun(ctx,[[0,1,2]]),ui=mapUI(ctx,eng);
 let writes=0;const set=ctx.localStorage.setItem.bind(ctx.localStorage);ctx.localStorage.setItem=(k,v)=>{writes++;set(k,v);};
 ui.render();ui.render();assert.equal(writes,1);
 eng.s.currency.tokens.ben=2;eng.s.player.guard=3;eng.s.playerPile.deck.reverse();eng.s.map.get(0,1).cleared=true;
 ui.render();assert.equal(writes,2);
 const save=ctx.AdventureSave.load();assert.equal(save.currency.tokens.ben,2);assert.equal(save.player.guard,3);
 assert.equal(JSON.stringify(save.playerPile.deck),JSON.stringify(eng.s.playerPile.deck));assert.equal(save.rooms['0,1'].cleared,true);
 eng.s.player.guard=4;ctx.localStorage.setItem=()=>{throw Error('quota');};ui.render();
 assert.equal(ctx.AdventureSave.load().player.guard,3);
 ctx.localStorage.setItem=(k,v)=>{writes++;set(k,v);};ui.render();assert.equal(ctx.AdventureSave.load().player.guard,4);
 ctx.AdventureSave.clear();ui.render();assert.ok(ctx.AdventureSave.load(),'clearing storage invalidates the old content cache');
});

test('next-floor transition saves matching map identity/layout and restores without loading another map',async()=>{
 const ctx=createContext();loadSources(ctx);const eng=mapRun(ctx,[[0,2]]),ui=mapUI(ctx,eng);
 eng.move(0,1);eng.currentRoom().cleared=true;
 ctx.AdventureMapData={};for(let i=1;i<=3;i++)ctx.AdventureMapData['stage_02_castle_'+i]='0,1,-1\n-1,1,2';
 await ui._advanceStage();assert.equal(eng.s.stage,2);assert.match(eng.mapName,/^stage_02_castle_[123]$/);
 const save=ctx.AdventureSave.load();assert.equal(save.mapName,eng.mapName);assert.equal(save.stage,2);assert.equal(save.mapLayout.length,2);
 const restored=new ctx.AdventureEngine(),ui2=mapUI(ctx,restored);
 ctx.AdventureMap.fromCsvUrl=()=>{throw Error('restore must use saved layout');};ctx.AdventureMapData={};
 await ui2.restoreFromSave(save);assert.equal(restored.s.map.rows,2);assert.equal(restored.s.map.cols,3);assert.equal(restored.s.stage,2);
 assert.equal(restored.s.map.get(1,2).type,ctx.RoomType.BOSS);assert.equal(restored.mapName,save.mapName);
});

test('failed next-floor loading and failed restore keep the previous checkpoint',async()=>{
 const ctx=createContext();loadSources(ctx);const eng=mapRun(ctx,[[0,2]]),ui=mapUI(ctx,eng);
 eng.move(0,1);eng.currentRoom().cleared=true;ui.render();const before=JSON.stringify(ctx.AdventureSave.load());
 ctx.AdventureMap.fromCsvUrl=async()=>{throw Error('network unavailable');};
 await ui._advanceStage();assert.equal(eng.s.phase,ctx.AdventurePhase.MAP);assert.equal(eng.s.stage,1);
 assert.equal(JSON.stringify(ctx.AdventureSave.load()),before);assert.equal(ui._advancingStage,false);
 const emptyUI=mapUI(ctx,new ctx.AdventureEngine());emptyUI.restoreFromSave=async()=>{throw Error('bad resource');};
 emptyUI.start=()=>{throw Error('must not start over');};ctx.document={createElement:()=>({})};
 const oldConsole=ctx.console;ctx.console={...console,error:()=>{}};
 await emptyUI.restoreOrStart('maps/stage_01_castle_1.csv','Ryan');ctx.console=oldConsole;
 assert.equal(JSON.stringify(ctx.AdventureSave.load()),before);
});
