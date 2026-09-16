const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const cardIdentity = card => `${card.uid || ''}_${card.color}_${card.value}_${!!card.isBlack}_${!!card.isWhite}_${!!card.potion}_${!!card.magic}_${!!card.greenMagic}_${card.magicColor || ''}_${!!card.purify}_${!!card.superPurify}_${!!card.swapHand}_${!!card.shuffleToDeck}_${!!card.drawTwo}_${!!card.drawThree}_${!!card.trophyWhite}_${card.trophyName || ''}`;
const context = vm.createContext({ console, Math, JSON, Date, setTimeout, clearTimeout, addEventListener() {} });
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
vm.runInContext(fs.readFileSync(path.join(root, 'online_game/online_ui.js'), 'utf8'), context, { filename: 'online_ui.js' });

test('online room session persists refresh credentials and clears on intentional exit', () => {
  const values = new Map();
  context.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  const ui = Object.create(context.OnlineUI.prototype);
  ui._sessionPersistenceDisabled = false;
  ui.role = 'host'; ui.roomCode = 'qNub'; ui.nickname = 'Rium';
  ui.avatar = '🐺'; ui.character = 'Leon'; ui.ready = true; ui.reconnectToken = 'token-1';
  ui._persistRoomSession();
  const saved = JSON.parse(values.get('furry-online-room-session-v2'));
  assert.deepEqual(saved, {
    roomCode: 'QNUB', role: 'host', nickname: 'Rium', avatar: '🐺',
    character: 'Leon', ready: true, reconnectToken: 'token-1', battle: null
  });
  assert.deepEqual(ui._readRoomSession(), saved);
  ui._clearRoomSession();
  assert.equal(values.has('furry-online-room-session-v2'), false);
  ui._persistRoomSession();
  assert.equal(values.has('furry-online-room-session-v2'), false,
    'beforeunload/late callbacks must not recreate an intentionally cleared session');
});

test('online host match snapshots restore the authoritative battle state', () => {
  const first = new context.OnlineMatchHost('Leon', 'Ryan', 'host', 4, {
    hostNickname: 'Host', guestNickname: 'Guest'
  });
  first.setStarted(true);
  const snapshot = first.captureSnapshot();
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.engine.version, 1);
  const restored = new context.OnlineMatchHost('Leon', 'Ryan');
  restored.restoreSnapshot(snapshot);
  assert.equal(restored.matchId, first.matchId);
  assert.equal(restored.stateVersion, first.stateVersion);
  assert.deepEqual(restored.project('host').playerHand, first.project('host').playerHand);
  assert.equal(restored.project('guest').onlineNickname, 'Guest');
});

test('refresh preserves pending battle across reconnect writes and late opponent metadata', () => {
  const values = new Map();
  context.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const original = new context.OnlineMatchHost('Saiki', 'Ryan');
  original.setStarted(true);
  const ui = Object.create(context.OnlineUI.prototype);
  Object.assign(ui, {
    role: 'host', roomCode: 'ABCD', nickname: 'Host', character: 'Saiki',
    players: [{ peerId: 'host', role: 'host', character: 'Saiki' }, { peerId: 'guest', role: 'guest', character: null }],
    peer: { peerId: 'host', send: () => true },
    _pendingBattleRestore: original.captureSnapshot(),
    renderRoom() {}, _mountSharedBattle() { this.mounted = true; }
  });
  ui._persistRoomSession();
  assert.equal(ui._readRoomSession().battle.matchId, original.matchId);
  ui._restoreBattleIfPossible();
  assert.equal(ui.match, undefined, 'wait for opponent metadata without dropping the save');
  ui._handleRoomMessage({ type: 'lobbyUpdate', peerId: 'guest', character: 'Ryan' }, 'guest');
  assert.equal(ui.match.matchId, original.matchId);
  assert.equal(ui.mounted, true);
  assert.deepEqual(ui.match.project('host').playerHand, original.project('host').playerHand);
});

test('guest resume can retry a failed send when opponent metadata arrives again', () => {
  const ui = Object.create(context.OnlineUI.prototype);
  let attempts = 0;
  Object.assign(ui, {
    role: 'guest', players: [{ peerId: 'host', character: 'Ryan' }],
    peer: { peerId: 'guest', send: () => ++attempts > 1 },
    _pendingBattleRestore: { matchId: 'saved-match' }, renderRoom() {}
  });
  ui._restoreBattleIfPossible();
  assert.equal(ui._battleResumeRequested, false);
  ui._handleRoomMessage({ type: 'lobbyUpdate', peerId: 'host', character: 'Ryan' }, 'host');
  assert.equal(attempts, 2);
  assert.equal(ui._battleResumeRequested, true);
  ui._clearBattleResumeRetry();
});

test('rendered online Saiki judgment card click selects and confirms for either viewer', async () => {
  for (const actor of ['host', 'guest']) {
    const match = new context.OnlineMatchHost('Saiki', 'Saiki', actor);
    match.setStarted(true);
    match.engine.s.onlineActor = actor;
    match.engine.s.phase = 'SAIKI_SIX_JUDGE';
    match.engine.s.pendingNumberJudge = { type: 'Saiki' };
    match.engine.h[actor === 'host' ? 'player' : 'ai'] = [context.FurryGame.Card.number('RED', 2)];
    const container = { dataset: {}, children: [], appendChild(node) { node.parentElement = this; this.children.push(node); }, querySelectorAll() { return this.children; } };
    const uiContext = vm.createContext({
      console, Date, GameUI: function () {},
      document: { getElementById: () => container },
      cardVisualKey: cardIdentity, cardId: cardIdentity, cardMatchKey: cardIdentity,
      currentCardSize: () => [70, 100],
      renderCard: () => ({ dataset: {}, style: {}, handlers: {}, classList: { add() {}, contains: () => false, toggle() {} },
        setAttribute() {}, addEventListener(name, handler) { this.handlers[name] = handler; } })
    });
    uiContext.window = uiContext;
    vm.runInContext(fs.readFileSync(path.join(root, 'js/ui/render/hand_render.js'), 'utf8'), uiContext);
    const ui = new uiContext.GameUI();
    Object.assign(ui, { state: match.project(actor), _hideTrailingCount: () => 0, _renderControls() {}, updateDisplay() {},
      _sessionDispatch: async (method, params) => {
        const result = match.dispatch(actor, method, params);
        assert.equal(result.ok, true, result.error);
        return match.project(actor);
      }
    });
    ui._renderPlayerHand();
    await container.children[0].handlers.click({ preventDefault() {} });
    assert.equal(ui.state.selectedCard, 0);
    const result = match.dispatch(actor, 'doSaikiSixConfirm');
    assert.equal(result.ok, true, result.error);
    assert.notEqual(match.project(actor).phase, 'SAIKI_SIX_JUDGE');
  }
});

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

  // A selection belongs only to the active viewer.  It must never appear as
  // a highlighted card in the other player's hand after projection.
  match.dispatch('host', 'selectCard', { index: 0 });
  host = match.project('host');
  guest = match.project('guest');
  assert.equal(host.selectedCard, 0);
  assert.equal(guest.selectedCard, -1);
  assert.equal(guest.selectedCards.length, 0);
  assert.equal(guest.selectedAICard, -1);

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

test('online protocol keeps guest packets private and rejects stale or duplicate commands', () => {
  const match = new context.OnlineMatchHost('Leon', 'Ryan', 'guest');
  const Card = context.FurryGame.Card;
  const sent = [];
  const session = new context.OnlineHostSession({
    match,
    peer: { send(message) { sent.push(message); return true; } },
    state: match.project('host')
  });

  match.engine.s.ai.burn = 2;
  const beforeBurn = match.engine.s.ai.burn;
  const invalid = match.dispatch('guest', 'choosePurify', { kind: 'burn' }, {
    requestId: 'invalid-1', matchId: match.matchId, expectedStateVersion: match.stateVersion
  });
  assert.equal(invalid.ok, false);
  assert.equal(match.engine.s.ai.burn, beforeBurn);

  // A host update contains only the recipient's private projection. The
  // previous implementation sent both hostState and guestState.
  session.handleCommand({ requestId: 'select-1', protocolVersion: 2, matchId: match.matchId,
    expectedStateVersion: match.stateVersion, method: 'selectCard', params: { index: 0 } });
  const packet = sent.at(-1);
  assert.equal(packet.hostState, undefined);
  assert.ok(packet.guestState);

  const first = match.dispatch('guest', 'selectCard', { index: 0 }, {
    requestId: 'dedupe-1', matchId: match.matchId, expectedStateVersion: match.stateVersion
  });
  const second = match.dispatch('guest', 'selectCard', { index: 0 }, {
    requestId: 'dedupe-1', matchId: match.matchId, expectedStateVersion: match.stateVersion
  });
  assert.equal(first.ok, true);
  assert.deepEqual(second, first);

  const guest = new context.OnlineGuestSession({ state: match.project('guest'), peer: { send() { return true; } } });
  const latest = match.project('guest');
  guest.receiveState({ guestState: Object.assign({}, latest, { stateVersion: latest.stateVersion + 2 }),
    stateVersion: latest.stateVersion + 2, matchId: match.matchId, protocolVersion: 2 });
  const currentVersion = guest.getState().stateVersion;
  guest.receiveState({ guestState: Object.assign({}, latest, { stateVersion: currentVersion - 1 }),
    stateVersion: currentVersion - 1, matchId: match.matchId, protocolVersion: 2 });
  assert.equal(guest.getState().stateVersion, currentVersion);
  assert.equal(Card.number('RED', 1).value, 1);
});

test('purify completion closes the dialog without removing a status', () => {
  const match = new context.OnlineMatchHost('Ryan', 'Otto', 'host');
  match.engine.s.pendingDialog = 'purify';
  match.engine.s.player.burn = 1;

  let outcome = match.dispatch('host', 'choosePurify', { done: true });
  assert.equal(outcome.ok, true);
  assert.equal(match.engine.s.pendingDialog, null);
  assert.equal(match.engine.s.player.burn, 1);

  // Older UI code sent { kind: { done: true } }; keep that payload harmless
  // while allowing the current { done: true } form as well.
  match.engine.s.pendingDialog = 'purify';
  outcome = match.dispatch('host', 'choosePurify', { kind: { done: true } });
  assert.equal(outcome.ok, true);
  assert.equal(match.engine.s.pendingDialog, null);
  assert.equal(match.engine.s.player.burn, 1);
});

test('online match blocks commands until the initial snapshot is acknowledged', () => {
  const match = new context.OnlineMatchHost('Leon', 'Ryan', 'host');
  match.setStarted(false);
  assert.equal(match.project('host').onlineCanAct, false);
  assert.equal(match.project('guest').onlineCanAct, false);
  const blocked = match.dispatch('host', 'selectCard', { index: 0 }, {
    requestId: 'before-ready', matchId: match.matchId, expectedStateVersion: match.stateVersion
  });
  assert.equal(blocked.ok, false);
  assert.equal(match.engine.s.selectedCard, -1);
  match.setStarted(true);
  assert.equal(match.project('host').onlineCanAct, true);
  assert.equal(match.dispatch('host', 'selectCard', { index: 0 }, {
    requestId: 'after-ready', matchId: match.matchId, expectedStateVersion: match.stateVersion
  }).ok, true);
});

test('online guest opening projection keeps the attacking guest interactive', () => {
  const match = new context.OnlineMatchHost('Leon', 'Ryan', 'guest');
  const guest = match.project('guest');
  assert.equal(guest.phase, 'PLAYER_PLAY');
  assert.equal(guest.onlineActor, 'guest');
  assert.equal(guest.onlineCanAct, true);
  assert.equal(guest.legalHand.length, guest.playerHand.length);
});

test('online atomic card commands select and play in one request', () => {
  const Card = context.FurryGame.Card;
  const match = new context.OnlineMatchHost('Leon', 'Ryan', 'guest');
  const card = Card.number('RED', 2);
  match.engine.h.ai = [card];
  match.engine.h.player = [Card.number('BLUE', 1)];
  match.engine.s.discardTop = Card.number('RED', 1);
  const outcome = match.dispatch('guest', 'playCard', { cardId: cardIdentity(card), index: 0 }, {
    requestId: 'atomic-play', matchId: match.matchId, expectedStateVersion: match.stateVersion
  });
  assert.equal(outcome.ok, true);
  assert.equal(match.engine.h.ai.some(item => item === card), false);
  assert.ok(['PLAYER_DEFEND', 'PLAYER_PLAY', 'GAME_OVER'].includes(outcome.state.phase));
});

test('online Saiki 6 keeps the judgment selection actionable', () => {
  const Card = context.FurryGame.Card;
  const match = new context.OnlineMatchHost('Saiki', 'Ryan', 'host');
  match.engine.h.player = [Card.number('RED', 6), Card.number('BLUE', 2)];
  match.engine.h.ai = [Card.number('GREEN', 1)];
  match.engine.s.discardTop = Card.number('RED', 1);
  let outcome = match.dispatch('host', 'selectCard', { index: 0 });
  assert.equal(outcome.ok, true);
  outcome = match.dispatch('host', 'doPlay');
  assert.equal(outcome.ok, true);
  assert.equal(outcome.state.phase, 'SAIKI_SIX_JUDGE');
  outcome = match.dispatch('host', 'selectCard', { index: 0 });
  assert.equal(outcome.ok, true);
  outcome = match.dispatch('host', 'doSaikiSixConfirm');
  assert.equal(outcome.ok, true);
  assert.notEqual(outcome.state.phase, 'SAIKI_SIX_JUDGE');
});

test('online guest Saiki 6 accepts the judgment card and confirm action', () => {
  const Card = context.FurryGame.Card;
  const match = new context.OnlineMatchHost('Ryan', 'Saiki', 'guest');
  match.engine.h.player = [Card.number('GREEN', 1)];
  match.engine.h.ai = [Card.number('RED', 6), Card.number('BLUE', 2)];
  match.engine.s.discardTop = Card.number('RED', 1);

  let outcome = match.dispatch('guest', 'selectCard', { index: 0 });
  assert.equal(outcome.ok, true);
  outcome = match.dispatch('guest', 'doPlay');
  assert.equal(outcome.ok, true);
  assert.equal(outcome.state.phase, 'SAIKI_SIX_JUDGE');
  assert.equal(outcome.state.onlineActor, 'guest');
  assert.equal(outcome.state.onlineCanAct, true);
  assert.equal(outcome.state.legalHand[0], true);

  outcome = match.dispatch('guest', 'selectCard', { index: 0 });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.state.selectedCard, 0);
  outcome = match.dispatch('guest', 'doSaikiSixConfirm');
  assert.equal(outcome.ok, true);
  assert.notEqual(outcome.state.phase, 'SAIKI_SIX_JUDGE');
});

test('online discard button enters discard phase from the opening play phase', () => {
  const match = new context.OnlineMatchHost('Leon', 'Ryan', 'guest');
  const outcome = match.dispatch('guest', 'doEnterDiscard', {}, {
    requestId: 'enter-discard', matchId: match.matchId, expectedStateVersion: match.stateVersion
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.state.phase, 'PLAYER_DISCARD');
});

test('online guest applies matchReady and acknowledges the opening snapshot', () => {
  const match = new context.OnlineMatchHost('Leon', 'Ryan', 'guest');
  match.setStarted(false);
  const opening = match.project('guest');
  match.setStarted(true);
  const ready = match.project('guest');
  const sent = [];
  const ui = Object.create(context.OnlineUI.prototype);
  ui.role = 'guest';
  ui.match = { remote: true };
  ui.peer = { send(message) { sent.push(message); return true; } };
  ui.battleSession = new context.OnlineGuestSession({ peer: ui.peer, state: opening });
  ui._handlePeerMessage({ kind: 'matchReady', protocolVersion: 2, matchId: match.matchId,
    stateVersion: ready.stateVersion, guestState: ready });
  assert.equal(ui.battleSession.getState().onlineCanAct, true);
  assert.ok(sent.some(message => message.kind === 'matchReadyAck' && message.matchId === match.matchId));
});

test('online lobby reconciles the temporary peer id with the Worker identity', () => {
  const ui = Object.create(context.OnlineUI.prototype);
  ui.peer = { peerId: 'server-peer' };
  ui.players = [{ peerId: 'local-temporary', role: 'host', nickname: 'Rium', character: 'Leon', ready: true }];
  ui._reconcileOwnPeerId('local-temporary', 'server-peer');
  ui._dedupePlayers();
  assert.deepEqual(ui.players.map(player => player.peerId), ['server-peer']);
  assert.equal(ui.players[0].nickname, 'Rium');
});

test('online Saiki judgment projection marks number cards selectable for both viewers', () => {
  const Card = context.FurryGame.Card;
  const match = new context.OnlineMatchHost('Ryan', 'Saiki', 'guest');
  match.engine.h.player = [Card.number('GREEN', 1)];
  match.engine.h.ai = [Card.number('RED', 6), Card.item('WHITE', 'purify')];
  match.engine.s.phase = 'SAIKI_SIX_JUDGE';
  match.engine.s.onlineActor = 'guest';
  let state = match.project('host');
  assert.deepEqual(state.legalHand, [true]);
  state = match.project('guest');
  assert.deepEqual(state.legalHand, [true, false]);
});

test('online Saiki judgment selection rejects non-number cards at the protocol boundary', () => {
  const Card = context.FurryGame.Card;
  const match = new context.OnlineMatchHost('Saiki', 'Ryan', 'host');
  match.engine.h.player = [Card.number('RED', 2), Card.item('WHITE', 'purify')];
  match.engine.s.phase = 'SAIKI_SIX_JUDGE';
  match.engine.s.pendingNumberJudge = { type: 'Saiki', attackCard: Card.number('RED', 6) };
  assert.deepEqual(match.engine._computeLegalHand(), [true, false]);
  const invalid = match.dispatch('host', 'selectCard', { index: 1 });
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /数字牌/);
});

test('promoted online guest keeps the room transport and becomes host', () => {
  const sent = [];
  const ui = Object.create(context.OnlineUI.prototype);
  ui.role = 'guest';
  ui.roomCode = 'Q1W2';
  ui.nickname = 'Rium';
  ui.avatar = '🐶';
  ui.character = 'Ryan';
  ui.ready = true;
  ui.players = [{ peerId: 'guest-peer', role: 'guest', nickname: 'Rium', character: 'Ryan', ready: true },
    { peerId: 'host-peer', role: 'host', nickname: 'Fox', character: 'Leon', ready: true }];
  ui.peer = { peerId: 'guest-peer', role: 'guest', sendRoom(payload) { sent.push(payload); } };
  let resetCalled = 0;
  ui._resetToLobby = () => { resetCalled += 1; ui.ready = false; ui._sendLobbyUpdate(); };
  ui.setRoomStatus = () => {};
  ui.renderRoom = () => {};
  ui._handleRoster([
    { peerId: 'guest-peer', role: 'host', nickname: 'Rium', character: 'Ryan', ready: false },
  ]);
  assert.equal(ui.role, 'host');
  assert.equal(ui.peer.role, 'host');
  assert.equal(resetCalled, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].role, 'host');
  assert.equal(sent[0].peerId, 'guest-peer');
});

test('host migration does not report expected data-channel closure as an error', () => {
  context.WebSocket = { OPEN: 1 };
  const peer = new context.OnlinePeer({ roomCode: 'ABCD', role: 'guest' });
  const listeners = Object.create(null);
  const channel = {
    readyState: 'open',
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    close() { for (const fn of listeners.close || []) fn(); }
  };
  peer.channel = channel;
  peer.pc = { close() {} };
  let channelClosed = 0;
  let channelErrors = 0;
  peer.on('channelClose', () => { channelClosed += 1; });
  peer.on('error', () => { channelErrors += 1; });
  peer._onSignal({ type: 'peerLeft', player: { peerId: 'old-host', role: 'host' } });
  assert.equal(channelClosed, 0);
  for (const fn of listeners.error || []) fn(new Error('expected close'));
  assert.equal(channelErrors, 0);
  assert.equal(peer.transportMode, 'pending');

  // A later replacement channel must restore ordinary close reporting.
  const replacementListeners = Object.create(null);
  const replacement = {
    readyState: 'open',
    addEventListener(type, fn) { (replacementListeners[type] || (replacementListeners[type] = [])).push(fn); },
    close() { for (const fn of replacementListeners.close || []) fn(); }
  };
  peer._attachChannel(replacement);
  replacement.close();
  assert.equal(channelClosed, 1);
});

test('online transitions apply the guest turn-start status exactly once', () => {
  const match = new context.OnlineMatchHost('Leon', 'Ryan', 'host');
  match.engine.s.ai.hp = 50;
  match.engine.s.ai.poison = 3;
  match.dispatch('host', 'selectCard', { index: 0 });
  const outcome = match.dispatch('host', 'doEndTurn');
  assert.equal(outcome.ok, true);
  // Ryan's turn-start passive heals 1 after poison resolves: 50 - 3 + 1.
  assert.equal(match.engine.s.ai.hp, 48);
  assert.equal(outcome.state.onlineActor, 'guest');
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

test('online guest defense keeps attack debuffs on the original target', () => {
  const Card = context.FurryGame.Card;
  const cases = [
    // Leon 3 applies burn to the defender.
    { character: 'Leon', card: Card.number('RED', 3), expected: 'burn' },
    // Chan 0 applies freeze to the defender while still allowing defense.
    { character: 'Chan', card: Card.number('RED', 0), expected: 'frozen' },
    // Saiki's yellow-card passive applies bleed to the defender.
    { character: 'Saiki', card: Card.number('YELLOW', 1), expected: 'bleed' }
  ];

  for (const scenario of cases) {
    const match = new context.OnlineMatchHost(scenario.character, 'Ryan', 'host');
    match.engine.h.player = [scenario.card];
    // Keep the guest's hand non-empty so the normal defense flow is used.
    match.engine.h.ai = [Card.number('BLUE', 2)];
    match.engine.s.discardTop = Card.number(scenario.card.color, 9);
    match.engine.s.phase = 'PLAYER_PLAY';
    match.engine.s.busy = false;

    match.dispatch('host', 'selectCard', { index: 0 });
    const attack = match.dispatch('host', 'doPlay');
    assert.equal(attack.ok, true, `${scenario.character} attack should resolve`);
    assert.equal(attack.state.phase, 'PLAYER_DEFEND', `${scenario.character} should enter defense`);

    const outcome = match.dispatch('guest', 'doSkipDefend');
    assert.equal(outcome.ok, true, `${scenario.character} defense should resolve`);
    assert.equal(match.engine.s.player[scenario.expected] || false, false,
      `${scenario.character} must not apply ${scenario.expected} to the attacker`);
    assert.equal(match.engine.s.ai[scenario.expected] || false, scenario.expected === 'frozen' ? true : 1,
      `${scenario.character} must apply ${scenario.expected} to the defender`);
  }
});

test('online guest attack keeps its debuff on the host target', () => {
  const Card = context.FurryGame.Card;
  const match = new context.OnlineMatchHost('Leon', 'Saiki', 'guest');
  match.engine.h.player = [Card.number('BLUE', 2)];
  match.engine.h.ai = [Card.number('YELLOW', 1)];
  match.engine.s.discardTop = Card.number('YELLOW', 9);
  match.engine.s.phase = 'PLAYER_PLAY';
  match.engine.s.busy = false;

  let outcome = match.dispatch('guest', 'selectCard', { index: 0 });
  assert.equal(outcome.ok, true);
  outcome = match.dispatch('guest', 'doPlay');
  assert.equal(outcome.ok, true);
  assert.equal(outcome.state.phase, 'PLAYER_DEFEND');
  assert.equal(outcome.state.onlineActor, 'host');

  outcome = match.dispatch('host', 'doSkipDefend');
  assert.equal(outcome.ok, true);
  // Saiki's yellow-card passive belongs to the host's character (the target
  // in the guest's temporary orientation), never to the guest attacker.
  assert.equal(match.engine.s.player.bleed, 1);
  assert.equal(match.engine.s.ai.bleed, 0);
});

test('online turn handoff resets discard eligibility for both players', () => {
  const match = new context.OnlineMatchHost('Ryan', 'Otto', 'host');
  for (const actor of ['host', 'guest', 'host']) {
    match.engine.s.hasPlayedThisTurn = true;
    assert.equal(match.dispatch(actor, 'doEndTurn').ok, true);
    const next = actor === 'host' ? 'guest' : 'host';
    assert.equal(match.project(next).hasPlayedThisTurn, false);
    assert.equal(match.dispatch(next, 'doEnterDiscard').ok, true);
    assert.equal(match.dispatch(next, 'doCancelDiscard').ok, true);
  }
});

test('host broadcasts cannot acknowledge a guest request with the same number', async () => {
  const match = new context.OnlineMatchHost('Ryan', 'Otto', 'host');
  const packets = [];
  const host = new context.OnlineHostSession({ match, peer: { send(packet) { packets.push(packet); return true; } } });
  const guest = new context.OnlineGuestSession({ state: match.project('guest'), peer: { send() { return true; } } });
  const pending = guest.dispatch('selectCard', { index: 0 });
  const rapid = await guest.dispatch('doEndTurn');
  assert.equal(rapid.ok, false);
  await host.dispatch('doEndTurn');
  assert.equal(packets[0].requestId, null);
  guest.receiveState(packets[0]);
  assert.equal(guest._pending.size, 1);
  guest.close();
  await pending;
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
    protocolVersion: 2, matchId: match.matchId, stateVersion: match.stateVersion,
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
