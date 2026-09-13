const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const gameRoot = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Math, JSON });
context.window = context;
for (const file of [
  'js/combat/protocol.js',
  'js/combat/events.js',
  'js/combat/state.js',
  'js/combat/deck.js'
]) {
  const fullPath = path.join(gameRoot, file);
  vm.runInContext(fs.readFileSync(fullPath, 'utf8'), context, { filename: fullPath });
}

test('Card protocol creates valid number, item, and cloned cards', () => {
  const { Card } = context.FurryGame;
  const number = Card.number('red', 4);
  const item = Card.item('WHITE', 'potion');

  assert.equal(number.color, 'RED');
  assert.equal(number.isNumberCard, true);
  assert.equal(number.isItemCard, false);
  assert.equal(item.isNumberCard, false);
  assert.equal(item.isItemCard, true);
  assert.equal(item.potion, true);
  assert.equal(Card.isValid(number), true);
  assert.equal(Card.isValid(item), true);
  assert.notEqual(Card.clone(number), number);
  const restored = Card.normalize({ color: 'blue', value: 2, isNumberCard: true });
  assert.equal(restored.drawTwo, false);
  assert.equal(restored.isItemCard, false);
  assert.equal(Card.isValid(restored), true);
});

test('CombatState and CombatEvent expose stable JSON-compatible contracts', () => {
  const { CombatState, CombatEvent } = context.FurryGame;
  const state = CombatState.create({ player: { name: 'Player' }, ai: { name: 'Fox' }, ai2: { name: 'Bear' } });
  const event = CombatEvent.create({ id: 3, type: 'hit', target: 'ai', amount: 4 });

  assert.equal(CombatState.validate(state), true);
  assert.equal(CombatEvent.isValid(event), true);
  assert.equal(event.id, 3);
  assert.equal(event.type, 'hit');
  assert.equal(event.target, 'ai');
  assert.equal(event.amount, 4);
  assert.ok(CombatState.PHASES.includes('PLAYER_DEFEND'));
  const projected = CombatState.project({
    s: state,
    h: { player: [], ai: [{ value: 1 }], ai2: [{ value: 2 }] },
    deck: [], discardBottom: [], events: [], ver: 1,
    _computeLegalHand: () => []
  });
  assert.equal(projected.ai2HandSize, 1);
});

test('standard deck service builds the classic deck and a numeric opening top', () => {
  const { CombatDeck } = context.FurryGame;
  const initial = CombatDeck.createStandard();

  assert.equal(initial.deck.length + 1, 101);
  assert.equal(initial.discardBottom.length, 0);
  assert.ok(initial.discardTop && initial.discardTop.isNumberCard);
  assert.ok(initial.deck.every(card => card && card.isNumberCard !== undefined));
});
