const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const gameRoot = path.resolve(__dirname, '..');
const context = vm.createContext({
  console, Math, JSON, Date,
  Image: class Image { constructor() { this.complete = true; this.naturalWidth = 1; } },
  setTimeout: () => 1, clearTimeout: () => {},
  performance: { now: () => 0 }
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
  'adventure/js/engine/loot.js',
  'adventure/js/engine/shop.js',
  'adventure/js/engine/rewards.js',
  'adventure/js/engine/inventory.js',
  'adventure/js/engine/combat_result.js'
];
for (const relative of sources) {
  const file = path.join(gameRoot, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { AdventureEngine, AdventureMap, AdventureRegistry, AdventurePhase, AdventureLoot } = context;

const DROP = [
  'BurnTrophy', 'PiercingTrophy', 'FreezeTrophy', 'IceSealTrophy', 'HypothermiaTrophy',
  'FlyTrophy', 'CritTrophy', 'MagmaVeinTrophy', 'DivingTrophy', 'ScorchTrophy', 'LushTrophy',
  'PoisonTrophy', 'ParasiteTrophy', 'ThornsTrophy', 'QuicksandTrophy', 'SandblindTrophy',
  'TimeBombTrophy', 'GuardTrophy'
];
const FORGE_ONLY = [
  'RussianRouletteTrophy', 'DisarmTrophy', 'RiotTrophy'
];
const BOTH = [
  'ZeroTrophy', 'SmallPotionTrophy', 'PurifyWaterTrophy', 'DrawTwoTrophy'
];
const FORGE_POOL = FORGE_ONLY.concat(BOTH);


test('trophyKind: drop trophies have no beastTradeCost and buff icons', () => {
  for (const name of DROP) {
    const def = AdventureRegistry.getItem(name);
    assert.ok(def, name);
    assert.equal(def.kind, 'trophyWhite');
    assert.equal(def.trophyKind, 'drop', name);
    assert.equal(def.beastTradeCost, undefined, name + ' should have no forge cost');
    assert.match(def.icon, /buff_icons/, name);
  }
});

test('trophyKind: forge-only keep costs; RR/Disarm/Riot use card_icons', () => {
  for (const name of FORGE_ONLY) {
    const def = AdventureRegistry.getItem(name);
    assert.ok(def, name);
    assert.equal(def.trophyKind, 'forge', name);
    assert.ok(Array.isArray(def.beastTradeCost) && def.beastTradeCost.length >= 1, name);
    assert.match(def.icon, /card_icons/, name);
  }
});

test('trophyKind: both (SmallPotion/Purify/Zero) keep costs and stay forge-eligible', () => {
  for (const name of BOTH) {
    const def = AdventureRegistry.getItem(name);
    assert.ok(def, name);
    assert.equal(def.trophyKind, 'both', name);
    assert.ok(Array.isArray(def.beastTradeCost) && def.beastTradeCost.length >= 1, name);
  }
  assert.match(AdventureRegistry.getItem('ZeroTrophy').icon, /card_icons/);
  for (const name of ['SmallPotionTrophy', 'PurifyWaterTrophy']) {
    assert.match(AdventureRegistry.getItem(name).icon, /buff_icons/, name);
  }
  const potion = AdventureRegistry.getItem('SmallPotionTrophy');
  assert.equal(potion.healAmount, 3);
  assert.deepEqual(Array.from(potion.beastTradeCost), ['cao', 'huo']);
  assert.deepEqual(Array.from(AdventureRegistry.getItem('PurifyWaterTrophy').beastTradeCost), ['shui', 'ben']);
  const drawTwo = AdventureRegistry.getItem('DrawTwoTrophy');
  assert.equal(drawTwo.trophyKind, 'both');
  assert.deepEqual(Array.from(drawTwo.beastTradeCost), ['wuneng']);
  assert.match(drawTwo.icon, /draw_cards/);
});

test('forge pool = forge ∪ both', () => {
  const eng = new AdventureEngine();
  const pool = eng._forgeTrophyPool().map(i => i.name).sort();
  const expected = FORGE_POOL.slice().sort();
  assert.equal(JSON.stringify(pool), JSON.stringify(expected));
  for (const name of DROP) assert.equal(eng._isForgeTrophy(name), false);
  for (const name of FORGE_POOL) assert.equal(eng._isForgeTrophy(name), true);
});

test('blacksmith roll/refresh never offers drop trophies', () => {
  const map = new AdventureMap([[0, 5]]);
  const eng = new AdventureEngine();
  eng.start(map, 'Ryan');
  eng.s.currency.addGold(200);
  assert.ok(eng.move(0, 1));
  eng.enterCurrent();
  assert.equal(eng.s.phase, AdventurePhase.BLACKSMITH);
  const room = eng.currentRoom();
  room.blacksmithTrophySlot = 'BurnTrophy'; // stale drop offer must be replaced
  eng._ensureBlacksmithSlots(room);
  assert.equal(eng._isForgeTrophy(room.blacksmithTrophySlot), true, 'stale drop replaced: ' + room.blacksmithTrophySlot);

  const seen = new Set();
  for (let i = 0; i < 80; i++) {
    const r = eng.refreshBlacksmithTrophy();
    assert.equal(r.ok, true, r.message || 'refresh failed');
    assert.equal(eng._isForgeTrophy(r.itemName), true, 'refresh offered drop: ' + r.itemName);
    seen.add(r.itemName);
  }
  assert.ok(seen.size >= 2, 'refresh should cycle forge pool, got ' + seen.size);
});

test('blacksmithTrophy detail exposes forge or both', () => {
  const map = new AdventureMap([[0, 5]]);
  const eng = new AdventureEngine();
  eng.start(map, 'Ryan');
  eng.s.currency.addGold(20);
  assert.ok(eng.move(0, 1));
  eng.enterCurrent();
  const snap = eng.snapshot();
  const trophy = snap.roomInfo && snap.roomInfo.blacksmithTrophy;
  assert.ok(trophy);
  assert.ok(trophy.trophyKind === 'forge' || trophy.trophyKind === 'both', trophy.trophyKind);
  assert.ok(Array.isArray(trophy.beastCost) && trophy.beastCost.length >= 1);
});

test('drop trophy copy gives the card action without expanding buff mechanics', () => {
  const drops = AdventureRegistry.allItems().filter(it => it.kind === 'trophyWhite' && it.trophyKind === 'drop');
  assert.ok(drops.length >= 10);
  for (const def of drops) {
    const [action, cycling, extra] = def.description.split('。');
    assert.match(action, /^(?:对手|自身)?获得(?:\d+层)?\[[^\]]+\]$/, def.name);
    assert.equal(cycling, '抽1张牌，可继续搭桥', def.name);
    assert.equal(extra, '', def.name + ' must not append buff rules');
  }
});

test('loot 11/12 drop dual-source SmallPotion / PurifyWater', () => {
  const a = AdventureLoot.rollMonsterDrop('desert', 'DesertBison', null, 11);
  const b = AdventureLoot.rollMonsterDrop('desert', 'DesertBison', null, 12);
  assert.deepEqual(Array.from(a.drops), ['SmallPotionTrophy']);
  assert.deepEqual(Array.from(b.drops), ['PurifyWaterTrophy']);
});

test('docs loot: Goblin potion+guard; Boss Zero; universal 11/12', () => {
  assert.deepEqual(Array.from(AdventureLoot.rollMonsterDrop('castle', 'DungeonGoblin', null, 4).drops), ['SmallPotionTrophy', 'GuardTrophy']);
  assert.deepEqual(Array.from(AdventureLoot.rollMonsterDrop('castle', 'DungeonGoblin', null, 5).drops), []);
  assert.deepEqual(Array.from(AdventureLoot.rollMonsterDrop('castle', 'DungeonGoblin', null, 1).drops), ['SmallPotionTrophy', 'GuardTrophy']);
  assert.deepEqual(Array.from(AdventureLoot.rollMonsterDrop('castle', 'DungeonGoblin', null, 11).drops), ['SmallPotionTrophy']);
  assert.deepEqual(Array.from(AdventureLoot.rollMonsterDrop('castle', 'CastleGargoyle', null, 6).drops), ['ZeroTrophy']);
  assert.deepEqual(Array.from(AdventureLoot.rollMonsterDrop('forest', 'ForestDryad', null, 6).drops), ['ZeroTrophy']);
  assert.deepEqual(Array.from(AdventureLoot.rollMonsterDrop('ocean', 'FrozenKraken', null, 6).drops), ['ZeroTrophy']);
  assert.deepEqual(Array.from(AdventureLoot.rollMonsterDrop('desert', 'Pharaoh', null, 6).drops), ['ZeroTrophy']);
  assert.deepEqual(Array.from(AdventureLoot.rollMonsterDrop('castle', 'CastleGargoyle', null, 11).drops),
    ['SmallPotionTrophy']);
});
