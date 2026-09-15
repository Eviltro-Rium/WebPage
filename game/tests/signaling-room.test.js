const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('departing host promotes remaining player and permits rejoining the same room', () => {
  const servers = [];
  let id = 0;
  class Socket {
    constructor() { this.handlers = {}; this.messages = []; }
    accept() {}
    addEventListener(type, fn) { this.handlers[type] = fn; }
    send(data) { this.messages.push(JSON.parse(data)); }
    close() { this.handlers.close?.(); }
    receive(data) { this.handlers.message({ data: JSON.stringify(data) }); }
  }
  const context = vm.createContext({
    TextEncoder, crypto: { randomUUID: () => String(++id) },
    setTimeout: () => 1, clearTimeout() {},
    Response: class {},
    WebSocketPair: class {
      constructor() { this[0] = new Socket(); this[1] = new Socket(); servers.push(this[1]); }
    }
  });
  const source = fs.readFileSync(path.join(__dirname, '../online_game/signaling/worker.js'), 'utf8');
  vm.runInContext(source.replace('export default', 'const worker =').replace('export class Room', 'class Room') + '\nglobalThis.Room = Room;', context);
  const room = new context.Room({});
  const join = role => {
    room.fetch({ headers: { get: () => 'websocket' } });
    const socket = servers.at(-1);
    socket.receive({ type: 'hello', role });
    return socket;
  };
  const host = join('host');
  const guest = join('guest');
  host.close();
  assert.equal(room.clients.size, 1);
  assert.equal([...room.clients.values()][0].meta.role, 'host');
  assert.equal(guest.messages.at(-1).players[0].role, 'host');
  host.handlers.error(); // duplicate close notification must be harmless
  const returning = join('guest');
  assert.ok(returning.messages.some(message => message.type === 'helloAck'));
  assert.deepEqual([...room.clients.values()].map(client => client.meta.role), ['host', 'guest']);
});
