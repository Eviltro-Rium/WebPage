const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const gameRoot = path.resolve(__dirname, '..');
const context = vm.createContext({
  console,
  Math,
  JSON,
  Date,
  setTimeout: () => 1,
  clearTimeout: () => {}
});
context.window = context;

const sources = [
  'js/combat/runtime.js',
  'js/characters/registry.js',
  'js/characters/ryan.js',
  'adventure/js/content/registry.js',
  'adventure/js/content/currency.js',
  'adventure/js/content/room.js',
  'adventure/js/map/map.js',
  'adventure/js/deck/adventure_deck.js',
  'adventure/js/items/item_defs.js',
  'adventure/js/items/map_effects.js',
  'adventure/js/engine/adventure_engine.js',
  'adventure/js/engine/shop.js',
  'adventure/js/engine/inventory.js',
  'adventure/js/engine/loot.js',
  'adventure/js/engine/rewards.js',
  'adventure/js/engine/combat_result.js',
  'adventure/js/monsters/castle.js',
  'adventure/js/monsters/desert.js',
  'adventure/js/monsters/forest.js',
  'adventure/js/monsters/ocean.js',
  'adventure/js/monsters/volcano.js'
];

for (const relative of sources) {
  const file = path.join(gameRoot, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { AdventureEngine, AdventureMap, Room, AdventureLoot } = context;

test('map code 8 creates an elite combat room', () => {
  const room = Room.fromCode(0, 1, 8);
  assert.equal(room.type, 'elite');
  assert.equal(room.code(), 8);
  assert.equal(room.isCombatRoom(), true);
});

test('castle elite monsters are isolated from the normal pool', () => {
  const normal = context.AdventureMonsterPool.castle['*'];
  const elite = context.AdventureElitePool.castle[3];
  assert.ok(elite.includes('CastleBat'));
  assert.ok(!normal.includes('CastleBat'));
  assert.ok(!normal.includes('CastleGhost'));
  assert.ok(!normal.includes('DungeonGoblin'));
});

test('AdventureLoot marks castle elite monsters', () => {
  assert.equal(AdventureLoot.isEliteMonster('CastleBat'), true);
  assert.equal(AdventureLoot.isEliteMonster('CastleGhost'), true);
  assert.equal(AdventureLoot.isEliteMonster('DungeonGoblin'), true);
  assert.equal(AdventureLoot.isEliteMonster('CastleWolf'), false);
});

test('elite loot: face 10 grants DrawTwo; 11/12 stay universal', () => {
  assert.deepEqual(
    Array.from(AdventureLoot.rollMonsterDrop('castle', 'CastleBat', null, 10).drops),
    []
  );
  assert.deepEqual(
    Array.from(AdventureLoot.rollMonsterDrop('castle', 'CastleBat', null, 10, { elite: true }).drops),
    ['DrawTwoTrophy']
  );
  assert.deepEqual(
    Array.from(AdventureLoot.rollMonsterDrop('castle', 'CastleBat', null, 11, { elite: true }).drops),
    ['SmallPotionTrophy']
  );
  assert.deepEqual(
    Array.from(AdventureLoot.rollMonsterDrop('castle', 'DungeonGoblin', null, 12, { elite: true }).drops),
    ['PurifyWaterTrophy']
  );
});

test('elite room combat settlement matches normal room rewards', () => {
  const eng = new AdventureEngine();
  eng.start(new AdventureMap([[0, 9]]), 'Ryan');
  assert.ok(eng.move(0, 1));
  const room = eng.currentRoom();
  assert.equal(room.type, 'elite');
  eng.s.combat = { enemy: { name: 'CastleBat' } };
  eng.onCombatEnd('win');
  assert.equal(eng.s.pendingCombatReward.stage, 'basic');
  assert.equal(eng.s.pendingCombatReward.roomType, 'elite');
});

test('elite encounter pool is empty before stage 3', () => {
  const eng = new AdventureEngine();
  eng.start(new AdventureMap([[0, 1]]), 'Ryan');
  eng.s.scene = 'castle';
  eng.s.stage = 2;
  assert.equal(eng._encounterNames('elite').length, 0);
});

test('elite encounter picker only draws from the elite pool on stage 3+', () => {
  const eng = new AdventureEngine();
  eng.start(new AdventureMap([[0, 9]]), 'Ryan');
  assert.ok(eng.move(0, 1));
  eng.s.scene = 'castle';
  eng.s.stage = 3;
  const room = eng.currentRoom();
  assert.equal(room.type, 'elite');
  room.monsterName = null;
  const eliteNames = eng._encounterNames('elite');
  assert.deepEqual([...eliteNames].sort(), ['CastleBat', 'CastleGhost', 'DungeonGoblin']);
  const picked = eng._pickMonsterName(room);
  assert.ok(eliteNames.includes(picked));
});

test('gargoyle boss only appears from stage 3 onward', () => {
  const eng = new AdventureEngine();
  eng.start(new AdventureMap([[0, 2]]), 'Ryan');
  eng.s.scene = 'castle';
  eng.s.stage = 2;
  const stage2 = eng._encounterNames('boss');
  assert.ok(!stage2.includes('CastleGargoyle'));
  eng.s.stage = 3;
  const stage3 = eng._encounterNames('boss');
  assert.ok(stage3.includes('CastleGargoyle'));
});

test('old elite code 9 loads but serializes as documented code 8', () => {
  assert.equal(Room.fromCode(0, 1, 9).code(), 8);
});

test('desert elites are exclusive to Stage3/4 elite encounters', () => {
  const eng = new AdventureEngine();
  eng.start(new AdventureMap([[0,8]]), 'Ryan');
  eng.s.scene = 'desert';
  const expected = ['DesertLizard','DesertAntlion','DesertCamel'];
  for (const stage of [1,2,3,4]) {
    eng.s.stage = stage;
    assert.equal(eng._encounterNames('elite').length, stage >= 3 ? 3 : 0);
    for (const name of expected) assert.ok(!eng._encounterNames('monster').includes(name));
    if (stage >= 3) {
      assert.ok(expected.includes(eng._pickMonsterName({type:'elite',monsterName:'DesertBison'})));
    }
  }
});

test('forest normal rooms exclude elite monsters and elite encounters start at Stage3', () => {
  const eng=new AdventureEngine();eng.start(new AdventureMap([[0,8]]),'Ryan');eng.s.scene='forest';
  const expected=['ForestDendrobatidFrog','ForestCapybara','ForestPiranha'];
  for(const stage of [1,2,3,4]){
    eng.s.stage=stage;
    assert.equal(eng._encounterNames('elite').length,stage>=3?3:0);
    for(const name of expected)assert.ok(!eng._encounterNames('monster').includes(name));
    if(stage>=3)assert.ok(expected.includes(eng._pickMonsterName({type:'elite',monsterName:'ForestMonkey'})));
    assert.ok(!expected.includes(eng._pickMonsterName({type:'normal',monsterName:'ForestPiranha'})));
  }
});

test('all maps have enough reachable normal and elite rooms and match embedded data', () => {
  const maps = {window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(gameRoot,'adventure/js/map/map_data.js'),'utf8'), maps);
  for (const scene of ['castle','desert','forest','ocean','volcano']) for (const stage of [1,2,3,4]) for (const variant of [1,2,3]) {
    const name = `stage_0${stage}_${scene}_${variant}`;
    const csv = fs.readFileSync(path.join(gameRoot,'adventure/maps',name+'.csv'),'utf8').replace(/\r\n/g,'\n');
    assert.equal(maps.window.AdventureMapData[name], csv, name + ' embedded data');
    const grid = csv.trim().split('\n').filter(line=>!line.startsWith('#')).map(line=>line.split(',').map(Number));
    const rooms = []; let start;
    grid.forEach((row,r)=>row.forEach((code,c)=>{if(code!==-1)rooms.push([r,c,code]);if(code===0)start=[r,c];}));
    assert.ok(start, name + ' start');
    assert.ok(rooms.filter(([, , code])=>code===1).length >= 4, name + ' normal rooms');
    const elites = rooms.filter(([, , code])=>code===8 || code===9);
    if (stage < 3) assert.equal(elites.length, 0, name + ' early elite rooms');
    else {
      assert.ok(elites.length >= 2, name + ' elite rooms');
      const pool = context.AdventureElitePool[scene]?.[stage];
      assert.ok(pool?.length, name + ' elite pool');
      for (const monster of pool) assert.ok(context.AdventureRegistry.getMonster(monster), name + ' missing elite ' + monster);
    }
    const visited = new Set([start.join(',')]), queue = [start];
    for (let i=0;i<queue.length;i++) {
      const [r,c]=queue[i];
      for (const [nr,nc] of [[r+1,c],[r-1,c],[r,c+1],[r,c-1]]) {
        const key=nr+','+nc;
        if(grid[nr] && grid[nr][nc] != null && grid[nr][nc] !== -1 && !visited.has(key)){visited.add(key);queue.push([nr,nc]);}
      }
    }
    for (const [r,c] of rooms) assert.ok(visited.has([r,c].join(',')), name + ' unreachable room');
  }
});

test('an escaped elite marks its room explored without rewards or victory recovery', () => {
  const eng = new AdventureEngine();
  eng.start(new AdventureMap([[0,8]]), 'Ryan');
  eng.s.scene='desert'; eng.s.stage=3; eng.move(0,1);
  eng.s.player.hp=30;
  eng.s.combat={enemy:{name:'DesertLizard'},kind:'elite'};
  eng.onCombatEnd('escape');
  assert.equal(eng.s.phase, context.AdventurePhase.MAP);
  assert.equal(eng.s.player.hp,30);
  assert.equal(eng.currentRoom().cleared,true);
  assert.equal(eng.currentRoom().beastTokenClaimed,true);
  assert.equal(eng.s.pendingCombatReward,null);
  assert.equal(eng.s.pendingMapReturnEffects,null);
});
