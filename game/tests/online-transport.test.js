const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function setup() {
  const timers = new Map(); let next = 0;
  const ctx = vm.createContext({console, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer,
    setTimeout(fn, ms) { timers.set(++next, {fn, ms}); return next; },
    clearTimeout(id) { timers.delete(id); }, WebSocket: {OPEN: 1}});
  ctx.window = ctx;
  for (const file of ['p2p_adapter.js', 'online_session.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../online_game', file), 'utf8'), ctx);
  return {ctx, timers};
}
function channel(label = 'game-reliable') {
  const listeners = {}; const sent = [];
  return {label, sent, readyState: 'connecting', bufferedAmount: 0, closed: false,
    addEventListener(name, fn) { listeners[name] = fn; },
    emit(name, data) { if (listeners[name]) listeners[name](data); },
    close() { this.closed = true; this.readyState = 'closed'; this.emit('close'); },
    send(value) { sent.push(value); }};
}
test('offer creates exactly one reliable channel', async () => {
  const {ctx} = setup(); const created = [];
  const peer = new ctx.OnlinePeer({role: 'host'});
  peer.pc = {createDataChannel(label, options) { created.push({label, options}); return channel(label); },
    async createOffer() { return {type: 'offer', sdp: 'test'}; }, async setLocalDescription() {}};
  await peer._startOffer();
  assert.equal(created.length, 1); assert.equal(created[0].options.ordered, true);
  assert.equal(peer.channel.closed, false);
});
test('legacy fast channel cannot close reliable channel or advertise P2P readiness', () => {
  const {ctx} = setup(); const peer = new ctx.OnlinePeer();
  const reliable = channel(), fast = channel('game-fast'); let opens = 0;
  peer.on('channelOpen', () => opens++);
  peer._attachChannel(reliable, 'reliable'); peer._attachChannel(fast, 'fast');
  fast.readyState = 'open'; fast.emit('open');
  assert.equal(reliable.closed, false); assert.equal(opens, 0);
  reliable.readyState = 'open'; reliable.emit('open');
  assert.equal(opens, 1); assert.equal(peer.transportMode, 'p2p');
  assert.equal(reliable.binaryType, 'arraybuffer');
  assert.equal(reliable.bufferedAmountLowThreshold, 32768);
});
test('authoritative input and state use JSON on reliable channel', () => {
  const {ctx} = setup(); const peer = new ctx.OnlinePeer(); const reliable = channel();
  reliable.readyState = 'open'; peer._attachChannel(reliable, 'reliable');
  for (const kind of ['command', 'state', 'inputDecision']) assert.equal(peer.send({kind}), true);
  assert.equal(reliable.sent.length, 3);
  for (const value of reliable.sent) { assert.equal(typeof value, 'string'); assert.ok(JSON.parse(value).kind); }
});
test('backpressure drains on low-water callback and reset retires stale channels', () => {
  const {ctx} = setup(); const peer = new ctx.OnlinePeer(); const reliable = channel();
  reliable.readyState = 'open'; reliable.bufferedAmount = 200000;
  peer._attachChannel(reliable, 'reliable');
  assert.equal(peer.send({kind: 'command'}), true); assert.equal(peer.dataQueue.length, 1);
  reliable.bufferedAmount = 0; reliable.emit('bufferedamountlow');
  assert.equal(peer.dataQueue.length, 0); assert.equal(reliable.sent.length, 1);
  const fast = channel('game-fast'); peer._attachChannel(fast, 'fast');
  peer._resetConnection(); assert.equal(fast.closed, true);
  peer.close(); assert.equal(peer.send({kind: 'command'}), false);
});
test('late acknowledgements settle pending commands without rolling back state', async () => {
  for (const error of [false, true]) {
    const {ctx} = setup(); let packet;
    const session = new ctx.OnlineGuestSession({peer: {send(p) {packet=p; return true;}},
      state: {protocolVersion: 2, matchId: 'match', stateVersion: 10}});
    const pending = session.dispatch('doPlay');
    session.receiveState({protocolVersion: 2, matchId: 'match', stateVersion: 12,
      guestState: {protocolVersion: 2, matchId: 'match', stateVersion: 12}});
    session[error ? 'receiveCommandError' : 'receiveState']({protocolVersion: 2, matchId: 'match',
      requestId: packet.requestId, stateVersion: 11, error: 'rejected'});
    const result = await pending;
    assert.equal(result.ok, !error); assert.equal(result.state.stateVersion, 12);
    assert.equal(session.getDiagnostics().pending, 0);
  }
});
test('guest retries retain request id and back off instead of flooding', () => {
  const {ctx, timers} = setup(); const packets = [];
  const session = new ctx.OnlineGuestSession({peer: {send(p) {packets.push(p); return true;}},
    state: {protocolVersion: 2, matchId: 'match', stateVersion: 1}});
  session.dispatch('doPlay');
  const retry = [...timers.entries()].find(([, t]) => t.ms === 800);
  assert.ok(retry); timers.delete(retry[0]); retry[1].fn();
  assert.equal(packets[0].requestId, packets[1].requestId);
  assert.ok([...timers.values()].some(t => t.ms >= 1600 && t.ms < 2000));
  session.close(); assert.equal(timers.size, 0);
});
test('host retries preserve packet version, events and FIFO order', () => {
  const {ctx} = setup(); let blocked = true; const sent = [];
  const match = {protocolVersion: 2, matchId: 'm', stateVersion: 1,
    project() {return {stateVersion: this.stateVersion};}};
  const session = new ctx.OnlineHostSession({match, peer: {send(p) {if (blocked) return false; sent.push(p); return true;}}});
  session._broadcast({events: [{id: 'first'}]});
  match.stateVersion = 2; session._broadcast({events: [{id: 'second'}]});
  blocked = false; session._flushBroadcasts();
  assert.deepEqual(sent.map(p => [p.stateVersion, p.events[0].id]), [[1, 'first'], [2, 'second']]);
  session.close();
});
