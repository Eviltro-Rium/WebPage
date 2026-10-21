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

for (const relative of [
  'js/combat/runtime.js',
  'js/characters/registry.js',
  'js/characters/ryan.js',
  'adventure/js/content/registry.js',
  'adventure/js/items/item_defs.js',
  'adventure/js/deck/adventure_deck.js',
  'js/combat/status_registry.js',
  'js/combat/status_service.js'
]) {
  const file = path.join(gameRoot, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

test('RiotTrophy: forge, 1 fire + 1 water, riot effect', () => {
  const def = context.AdventureRegistry.getItem('RiotTrophy');
  assert.ok(def);
  assert.equal(def.trophyKind, 'forge');
  assert.equal(def.trophyEffect, 'riot');
  assert.deepEqual(Array.from(def.beastTradeCost), ['huo', 'shui']);
  assert.match(def.icon, /card_icons\/riot\.png$/);
});

test('adventure_deck maps RiotTrophy → riot', () => {
  const card = context.AdventureDeck.trophyWhite('RiotTrophy');
  assert.ok(card);
  assert.equal(card.trophyEffect, 'riot');
  assert.equal(card.trophyName, 'RiotTrophy');
});

test('status double caps match riot rule', () => {
  const status = context.FurryGame.StatusService;
  const entity = { burn: 3, bleed: 2, poison: 1, bomb: 4 };
  status.ensure(entity);
  for (const id of ['burn', 'bleed', 'poison']) {
    const def = status.get(id);
    status.set(entity, id, Math.min(def.max, status.amount(entity, id) * 2));
  }
  assert.equal(entity.burn, 5);
  assert.equal(entity.bleed, 3);
  assert.equal(entity.poison, 2);
  assert.equal(entity.bomb, 4);
});
