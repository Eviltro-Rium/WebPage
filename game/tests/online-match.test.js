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
vm.runInContext(fs.readFileSync(path.join(root, 'js/combat/session.js'), 'utf8'), context, { filename: 'session.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'online_game/online_session.js'), 'utf8'), context, { filename: 'online_session.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'online_game/p2p_adapter.js'), 'utf8'), context, { filename: 'p2p_adapter.js' });

test('online host adapter preserves private hands and swaps guest commands', () => {
  const match = new context.OnlineMatchHost('Leon', 'Ryan', 'host', null, {
    hostNickname: 'Rium',
    guestNickname: 'Fox'
  });
  let host = match.project('host');
  let guest = match.project('guest');
  assert.equal(host.onlineNickname, 'Rium');
  assert.equal(host.onlineOpponentNickname, 'Fox');
  assert.equal(guest.onlineNickname, 'Fox');
  assert.equal(guest.onlineOpponentNickname, 'Rium');
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

test('online sessions expose the shared GameUI result shape', async () => {
  const match = new context.OnlineMatchHost('Leon', 'Ryan', 'host');
  const sent = [];
  const hostSession = new context.OnlineHostSession({
    match,
    peer: { send(message) { sent.push(message); return true; } },
    state: match.project('host')
  });
  const selected = await hostSession.dispatch('selectCard', { index: 0 });
  assert.equal(selected.ok, true);
  assert.deepEqual(selected.state, hostSession.getState());
  assert.equal(selected.phase, selected.state.phase);
  assert.ok(sent.some(message => message.kind === 'state'));

  const guestSession = new context.OnlineGuestSession({
    peer: { send() { return true; } },
    state: match.project('guest')
  });
  const pending = guestSession.dispatch('selectCard', { index: 0 });
  const received = guestSession.receiveState({
    requestId: 1,
    guestState: match.project('guest'),
    events: []
  });
  assert.equal((await pending).ok, true);
  assert.equal(received.phase, received.state.phase);
  assert.equal(guestSession.getState().onlineRole, 'guest');
});

test('online event batches are projected to the recipient orientation', () => {
  const match = new context.OnlineMatchHost('Leon', 'Ryan', 'host');
  const events = [{ type: 'playerPlay', who: 'player', target: 'ai', owner: 'player', aoeTargets: ['player', 'ai'] }];
  assert.deepEqual(match.eventsForViewer(events, 'host', 'host'), events);
  assert.deepEqual(match.eventsForViewer(events, 'guest', 'host')[0], {
    type: 'aiPlay', who: 'ai', target: 'player', owner: 'ai', aoeTargets: ['ai', 'player']
  });
});

test('online hand swaps keep the received white card as a player card', () => {
  const match = new context.OnlineMatchHost('Leon', 'Ryan', 'host');
  const Card = context.FurryGame.Card;
  const receivedWhite = Card.number('WHITE', 4, true);
  const swap = Card.item('WHITE', 'swap');
  match.engine.h.player = [swap];
  match.engine.h.ai = [receivedWhite];
  match.engine.useItem(swap, match.engine.s.player, match.engine.s.ai, 'player');
  assert.equal(match.engine.h.player[0], receivedWhite);
  assert.equal(match.engine.h.player[0].npcCard, undefined);
});

test('online transport falls back to signaling relay before WebRTC opens', () => {
  context.WebSocket = { OPEN: 1 };
  const peer = new context.OnlinePeer({ roomCode: 'ABCD', role: 'host', peerId: 'host-1' });
  const wire = [];
  const received = [];
  peer.ws = { readyState: 1, send(value) { wire.push(JSON.parse(value)); } };
  peer.on('message', value => received.push(value));

  assert.equal(peer.send({ kind: 'matchStart', state: { turn: 1 } }), true);
  assert.equal(peer.transportMode, 'relay');
  assert.equal(wire[0].type, 'roomMessage');
  assert.equal(wire[0].payload.__onlineTransport, 1);

  peer._onSignal({
    type: 'roomMessage',
    from: 'guest-1',
    payload: { __onlineTransport: 1, data: { kind: 'matchStartAck' } }
  });
  assert.deepEqual(received, [{ kind: 'matchStartAck' }]);

  peer._onSignal({
    type: 'roomMessage',
    from: 'host-1',
    payload: { __onlineTransport: 1, data: { kind: 'should-not-echo' } }
  });
  assert.equal(received.length, 1);
});

test('online transport still prefers an open WebRTC data channel', () => {
  context.WebSocket = { OPEN: 1 };
  const peer = new context.OnlinePeer({ roomCode: 'ABCD', role: 'host' });
  const direct = [];
  const relayed = [];
  peer.channel = { readyState: 'open', send(value) { direct.push(JSON.parse(value)); } };
  peer.ws = { readyState: 1, send(value) { relayed.push(value); } };

  assert.equal(peer.send({ kind: 'command', method: 'doPlay' }), true);
  assert.equal(peer.transportMode, 'p2p');
  assert.deepEqual(direct, [{ kind: 'command', method: 'doPlay' }]);
  assert.equal(relayed.length, 0);
});
