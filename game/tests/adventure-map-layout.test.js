'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const { generateMap } = require('../adventure/generate_maps');
const context = vm.createContext({ console }); context.window = context;
for (const file of ['content/room', 'map/csv_loader', 'map/map', 'map/map_data']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'adventure/js/' + file + '.js'), 'utf8'), context);
}
const files = fs.readdirSync(path.join(root, 'adventure/maps')).filter(name => /^stage_.*\.csv$/.test(name));
const key = room => room.row + ',' + room.col;
function distances(map, start, blocked = null) {
  const queue = [start], result = new Map([[key(start), 0]]);
  for (let i = 0; i < queue.length; i++) {
    const room = queue[i];
    for (const {room: next} of map.neighbors(room.row, room.col)) {
      if (next === blocked || result.has(key(next))) continue;
      result.set(key(next), result.get(key(room)) + 1); queue.push(next);
    }
  }
  return result;
}

test('all sixty maps obey room ranges, optional branch topology and the post-boss sacrifice gate', () => {
  assert.equal(files.length, 60);
  for (const name of files) {
    const [stage, scene, variant] = name.match(/^stage_(\d+)_(\w+)_(\d)\.csv$/).slice(1);
    const source = fs.readFileSync(path.join(root, 'adventure/maps', name), 'utf8');
    const map = context.AdventureMap.fromCsvText(source), counts = map.summary().counts;
    const late = Number(stage) >= 3;
    assert.ok(counts.normal >= (late ? 4 : 3) && counts.normal <= (late ? 6 : 5), name);
    for (const type of ['start', 'boss', 'item', 'blacksmith', 'shop', 'challenge', 'sacrifice']) assert.equal(counts[type], 1, name + ' ' + type);
    assert.equal(counts.glitch, late ? 2 : 1, name);
    assert.equal(counts.elite, late ? 2 : 0, name);
    assert.equal(context.AdventureMapData[name.slice(0, -4)], source, name + ' embedded map');
    assert.deepEqual(JSON.parse(JSON.stringify(map.grid.map(row => row.map(room => room.code())))), generateMap(Number(stage), scene, Number(variant)), name + ' reproducible');
    const rooms = map.grid.flat().filter(room => room.isEnterable());
    const start = rooms.find(room => room.type === 'start'), boss = rooms.find(room => room.type === 'boss');
    const sacrifice = rooms.find(room => room.type === 'sacrifice');
    const fromStart = distances(map, start), fromBoss = distances(map, boss);
    assert.equal(fromStart.size, rooms.length, name + ' connected');
    const routeLength = fromStart.get(key(boss));
    const onMainRoute = room => fromStart.get(key(room)) + fromBoss.get(key(room)) === routeLength;
    const normals = rooms.filter(room => room.type === 'normal');
    assert.ok(normals.filter(onMainRoute).length >= 2, name + ' main route keeps ordinary encounters');
    assert.ok(normals.some(room => !onMainRoute(room)), name + ' optional ordinary encounters');
    if (late) assert.ok(rooms.some(room => room.type === 'elite' && !onMainRoute(room)), name + ' optional elite encounters');
    for (const room of rooms.filter(room => ['item', 'blacksmith'].includes(room.type))) {
      assert.equal(map.neighbors(room.row, room.col).length, 1, name + ' optional leaf');
      assert.ok(fromStart.get(key(room)) + fromBoss.get(key(room)) > routeLength, name + ' off every shortest route');
      assert.ok(distances(map, start, room).has(key(boss)), name + ' no paywall on main route');
    }
    assert.deepEqual(Array.from(map.neighbors(sacrifice.row, sacrifice.col), ({room}) => key(room)), [key(boss)], name + ' sacrifice only touches boss');
    const beforeBoss = distances(map, start, boss);
    assert.ok(!beforeBoss.has(key(sacrifice)), name + ' boss cannot be bypassed');
    assert.equal(beforeBoss.size, rooms.length - 2, name + ' all other rooms before boss');
    // 使用真实探索规则，而不只是几何连通性：已探索其他房间也不能越过未清除 Boss。
    for (const room of rooms) {
      room.visited = true; room.doorUnlocked = true; room.shopSlots = [];
      if (room.isCombatRoom()) room.cleared = room !== boss;
    }
    assert.ok(!map.explorablePositions().has(key(sacrifice)), name + ' sacrifice locked');
    boss.cleared = true;
    assert.ok(map.explorablePositions().has(key(sacrifice)), name + ' sacrifice unlocked');
  }
});

test('every stage has varied footprints and its three variants cover every ordinary-room count', () => {
  for (let stage = 1; stage <= 4; stage++) {
    const dimensions = new Set(), grids = new Set();
    for (const scene of ['castle', 'forest', 'ocean', 'desert', 'volcano']) {
      const counts = [];
      for (let variant = 1; variant <= 3; variant++) {
        const grid = generateMap(stage, scene, variant);
        dimensions.add(grid.length + 'x' + grid[0].length); grids.add(JSON.stringify(grid));
        counts.push(grid.flat().filter(code => code === 1).length);
      }
      assert.deepEqual(counts.sort(), stage <= 2 ? [3, 4, 5] : [4, 5, 6]);
    }
    assert.ok(dimensions.size >= 3, 'varied footprints stage ' + stage);
    assert.equal(grids.size, 15, 'unique layouts stage ' + stage);
    assert.ok([...dimensions].some(size => { const [r,c]=size.split('x'); return r !== c; }));
  }
});
