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
  'adventure/js/monsters/castle.js'
];

for (const relative of sources) {
  const file = path.join(gameRoot, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { AdventureEngine, AdventureMap, Room, AdventureLoot } = context;

test('map code 9 creates an elite combat room', () => {
  const room = Room.fromCode(0, 1, 9);
  assert.equal(room.type, 'elite');
  assert.equal(room.code(), 9);
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
