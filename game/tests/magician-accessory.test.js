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
  'js/characters/monsters/registry.js',
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
  if (!fs.existsSync(file)) continue;
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { AdventureEngine, AdventureMap, AdventureRegistry } = context;

test('Magician accessory: max 1, 2 water + 1 ben + 1 wild, exclusive DiceController', () => {
  const def = AdventureRegistry.getItem('Magician');
  assert.ok(def);
  assert.equal(def.kind, 'accessory');
  assert.equal(def.maxStacks, 1);
  assert.deepEqual(Array.from(def.beastTradeCost), ['shui', 'shui', 'ben', 'wuneng']);
  assert.ok(def.exclusiveWith.includes('DiceController'));
  assert.match(def.icon, /magician\.png$/);
});

test('cannot hold Magician and DiceController together', () => {
  const map = new AdventureMap([[0, 5]]);
  const eng = new AdventureEngine();
  eng.start(map, 'Ryan');
  assert.equal(eng.addItem('DiceController'), true);
  assert.equal(eng.addItem('Magician'), false);
  eng.s.consumables = [];
  assert.equal(eng.addItem('Magician'), true);
  assert.equal(eng.addItem('DiceController'), false);
  assert.equal(eng.hasAccessory('Magician'), true);
});
