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
  'js/characters/leon.js',
  'js/ai/registry.js',
  'js/ai/ryan_ai.js',
  'js/combat/protocol.js',
  'js/combat/events.js',
  'js/combat/state.js',
  'js/combat/deck.js',
  'js/combat/piles.js',
  'js/combat/status_registry.js',
  'js/combat/status_service.js',
  'js/combat/status.js',
  'js/combat/damage.js',
  'js/combat/modes.js',
  'js/combat/deck_port.js',
  'js/combat/turn_machine.js',
  'js/combat/card_effects.js',
  'js/combat/engine.js',
  'adventure/js/content/registry.js',
  'adventure/js/items/item_defs.js',
  'adventure/js/deck/adventure_deck.js'
]) {
  const file = path.join(gameRoot, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { Engine, AdventureDeck } = context;

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

test('RiotTrophy doubles dots then settles burn bleed poison once', () => {
  const eng = new Engine();
  eng.start('Ryan', 'Ryan');
  eng.later = () => {};
  eng.s.ai.burn = 2;
  eng.s.ai.bleed = 1;
  eng.s.ai.poison = 1;
  const hp = eng.s.ai.hp;
  const card = AdventureDeck.trophyWhite('RiotTrophy');
  eng.useTrophyWhite(card, eng.s.ai, 'player');
  assert.equal(eng.s.ai.burn, 3, 'burn doubled 2→4 then settle -1');
  assert.equal(eng.s.ai.bleed, 1, 'bleed doubled 1→2 then settle -1');
  assert.equal(eng.s.ai.poison, 2, 'poison doubled, settle does not decay');
  assert.equal(eng.s.ai.hp, hp - 4 - 2 - 2, 'burn 4 + bleed 2 + poison 2');
});
