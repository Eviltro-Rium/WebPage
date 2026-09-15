const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Math, JSON, Date, setTimeout, clearTimeout });
context.window = context;
const files = [
  'js/characters/registry.js', 'js/characters/ryan.js', 'js/characters/leon.js',
  'js/characters/chan.js', 'js/characters/saiki.js', 'js/characters/blaze.js',
  'js/characters/serenity.js', 'js/characters/moze.js', 'js/characters/knight.js',
  'js/characters/otto.js', 'js/ai/registry.js', 'js/ai/knight_ai.js',
  'js/ai/leon_ai.js', 'js/ai/ryan_ai.js', 'js/ai/blaze_ai.js', 'js/ai/serenity_ai.js',
  'js/ai/saiki_ai.js', 'js/ai/moze_ai.js', 'js/ai/chan_ai.js', 'js/ai/otto_ai.js',
  'js/combat/protocol.js', 'js/combat/runtime.js', 'js/combat/events.js',
  'js/combat/state.js', 'js/combat/deck.js', 'js/combat/piles.js',
  'js/combat/invariants.js', 'js/combat/status_registry.js', 'js/combat/status_service.js',
  'js/combat/status.js', 'js/combat/damage.js', 'js/combat/modes.js',
  'js/combat/deck_port.js', 'js/combat/turn_machine.js', 'js/combat/dice.js',
  'js/combat/card_effects.js', 'js/combat/engine.js', 'js/combat/engine_1v2.js',
  'js/combat/engine_1v2_adapter.js', 'js/combat/engine_turns.js', 'js/combat/engine_attack.js',
  'js/combat/engine_ai.js', 'js/combat/engine_snapshot.js', 'js/combat/engine_lord.js'
];
for (const relative of files) {
  const file = path.join(root, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}
vm.runInContext(fs.readFileSync(path.join(root, 'online_game/online_match.js'), 'utf8'), context, { filename: 'online_match.js' });

test('online host adapter preserves private hands and swaps guest commands', () => {
  const match = new context.OnlineMatchHost('Leon', 'Ryan', 'host');
  let host = match.project('host');
  let guest = match.project('guest');
  assert.equal(host.playerHand.length, 5);
  assert.equal(guest.playerHand.length, 5);
  assert.equal(host.aiHand, null);
  assert.equal(guest.aiHand, null);

  let outcome = match.dispatch('host', 'doEndTurn');
  assert.equal(outcome.ok, true);
  assert.equal(outcome.state.onlineActor, 'guest');
  const Card = context.FurryGame.Card;
  match.engine.h.ai = [Card.number('RED', 2)];
  match.engine.s.discardTop = Card.number('RED', 1);
  guest = match.project('guest');
  const index = 0;
  assert.equal(guest.legalHand[index], true);

  outcome = match.dispatch('guest', 'selectCard', { index });
  assert.equal(outcome.ok, true);
  outcome = match.dispatch('guest', 'doPlay');
  assert.equal(outcome.ok, true);
  assert.equal(outcome.state.onlineActor, outcome.state.phase === 'PLAYER_DEFEND' ? 'host' : 'guest');
  if (outcome.state.phase === 'PLAYER_DEFEND') {
    outcome = match.dispatch('host', 'doSkipDefend');
    assert.equal(outcome.ok, true);
    assert.equal(outcome.state.onlineActor, 'guest');
  }
});

test('online guest defense settles against the real attacker', () => {
  const match = new context.OnlineMatchHost('Leon', 'Ryan', 'host');
  const Card = context.FurryGame.Card;
  match.engine.h.player = [Card.number('RED', 5)];
  match.engine.h.ai = [Card.number('BLUE', 1)];
  match.engine.s.discardTop = Card.number('RED', 1);

  match.dispatch('host', 'selectCard', { index: 0 });
  let outcome = match.dispatch('host', 'doPlay');
  assert.equal(outcome.state.phase, 'PLAYER_DEFEND');
  assert.equal(outcome.state.onlineActor, 'guest');
  outcome = match.dispatch('guest', 'doSkipDefend');
  assert.equal(outcome.ok, true);
  assert.equal(outcome.state.phase, 'PLAYER_PLAY');
  assert.equal(outcome.state.onlineActor, 'host');
});
