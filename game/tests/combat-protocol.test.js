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
  'js/combat/deck.js',
  'adventure/js/deck/adventure_deck.js'
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

test('CombatState.project is a pure serializer and does not ask the engine to mutate context', () => {
  const { CombatState } = context.FurryGame;
  let calls = 0;
  const state = { phase: 'PLAYER_PLAY', turn: 2, player: { name: 'Player' }, ai: { name: 'Fox' } };
  const engine = {
    s: state,
    h: { player: [{ value: 1 }], ai: [] },
    deck: [{ value: 2 }],
    discardBottom: [],
    events: [],
    ver: 4,
    _computeLegalHand() { calls++; return [false]; }
  };
  const before = JSON.stringify(state);
  const projected = CombatState.project(engine);
  assert.equal(calls, 0);
  assert.equal(projected.legalHand, null);
  assert.equal(JSON.stringify(state), before);
  const explicit = CombatState.project(engine, { legalHand: [false] });
  assert.deepEqual(Array.from(explicit.legalHand), [false]);
});

test('standard deck service builds the classic deck and a numeric opening top', () => {
  const { CombatDeck } = context.FurryGame;
  const initial = CombatDeck.createStandard();

  assert.equal(initial.deck.length + 1, 77);
  assert.equal(initial.discardBottom.length, 0);
  assert.ok(initial.discardTop && initial.discardTop.isNumberCard);
  assert.ok(initial.deck.every(card => card && card.isNumberCard !== undefined));
});

test('player decks carry five colors of potion and +2, and two black +3 cards', () => {
  const colors = ['BLUE', 'GREEN', 'RED', 'WHITE', 'YELLOW'];
  const { CombatDeck } = context.FurryGame;
  for (const [deck, count] of [
    [CombatDeck.makeStandard(), 77], [context.AdventureDeck.makePlayerDeck({ shuffle: false }), 75]
  ]) {
    assert.equal(deck.length, count);
    for (const flag of ['potion', 'drawTwo', 'drawThree']) {
      const cards = deck.filter(card => card[flag]);
      assert.deepEqual(Array.from(cards, card => card.color).sort(), flag === 'drawThree' ? ['BLACK', 'BLACK'] : colors);
      assert.ok(cards.every(card => card.isItemCard && !card.isNumberCard));
    }
  }
});

test('item symbols match across colors without treating placeholder values as points', () => {
  const { Card } = context.FurryGame;
  const plusTwo = Card.item('RED', 'drawTwo');
  const potion = Card.item('RED', 'potion');
  for (const [top, playable, rejected] of [
    [plusTwo, Card.item('BLUE', 'drawTwo'), Card.item('BLUE', 'potion')],
    [potion, Card.item('BLUE', 'potion'), Card.item('BLUE', 'drawTwo')]
  ]) {
    const discard = new context.AdventureDeck.DiscardTop(top);
    assert.equal(Card.matchesTop(playable, top), true);
    assert.equal(discard.legal(playable, true), true);
    assert.equal(discard.legal(rejected, true), false);
    assert.equal(discard.legal(Card.number('RED', 2), true), true);
    assert.equal(discard.legal(Card.number('BLUE', 2), true), false);
    assert.equal(discard.legal(Card.number('RED', 3), true), false);
    assert.equal(discard.legal(Card.item('WHITE', 'purify'), true), true);
    assert.equal(discard.legal(Card.item('BLACK', 'drawThree'), true), true);
  }
  const coloredTop = Card.item('WHITE', 'drawTwo', { chosenColor: 'GREEN' });
  assert.equal(Card.matchesTop(Card.number('GREEN', 1), coloredTop), true);
});
