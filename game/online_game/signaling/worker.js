/* Cloudflare Worker signaling relay for Furry Trial online rooms.
 *
 * A Durable Object keeps at most two WebSocket clients for a room and relays
 * lobby/SDP/ICE messages. If WebRTC is unavailable, the same socket also
 * carries the host-authoritative game packets for that small room.
 */
const CODE = /^[A-Z0-9]{4}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowedOrigins = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (allowedOrigins.length && (!origin || !allowedOrigins.includes(origin))) {
      return new Response('origin not allowed', { status: 403 });
    }
    if (url.pathname === '/health') return new Response('ok', { headers: { 'cache-control': 'no-store' } });

    const match = url.pathname.match(/^\/(?:online-signal|room|ws)\/([A-Za-z0-9]{4})\/?$/);
    if (!match) return new Response('Furry Trial signaling endpoint', { status: 404 });
    const roomCode = match[1].toUpperCase();
    if (!CODE.test(roomCode)) return new Response('invalid room code', { status: 400 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', { status: 426 });

    const id = env.ROOMS.idFromName(roomCode);
    // Forward the original upgrade request unchanged; rebuilding Request
    // with a new headers object can drop Upgrade/Sec-WebSocket-* headers.
    return env.ROOMS.get(id).fetch(request);
  }
};

export class Room {
  constructor(state) {
    this.state = state;
    this.clients = new Map();
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    let clientId = null;
    let metadata = null;
    let helloTimer = setTimeout(() => { if (!clientId) close(1008, 'hello-timeout'); }, 15000);
    let rateWindow = Date.now();
    let rateCount = 0;
    const close = (code = 1000, reason = '') => { try { server.close(code, reason); } catch (_) {} };

    server.addEventListener('message', event => {
      if (typeof event.data !== 'string') { close(1003, 'text-messages-only'); return; }
      if (new TextEncoder().encode(event.data).byteLength > 65536) { close(1009, 'message-too-large'); return; }
      const now = Date.now();
      if (now - rateWindow >= 10000) { rateWindow = now; rateCount = 0; }
      if (++rateCount > 240) { close(1013, 'rate-limit'); return; }
      let message;
      try { message = JSON.parse(event.data); } catch (_) { return; }
      if (!message || typeof message.type !== 'string') return;

      if (message.type === 'hello') {
        if (clientId) return;
        clearTimeout(helloTimer);
        helloTimer = null;
        if (this.clients.size >= 2) { close(1008, 'room-full'); return; }
        // Never trust a client supplied peerId. A reconnect or a malicious
        // client must not be able to overwrite an existing Map entry.
        clientId = crypto.randomUUID();
        const role = message.role === 'guest' ? 'guest' : 'host';
        if (role === 'guest' && ![...this.clients.values()].some(item => item.meta.role === 'host')) {
          close(1008, 'room-not-found'); return;
        }
        if (role === 'host' && [...this.clients.values()].some(item => item.meta.role === 'host')) {
          close(1008, 'host-exists'); return;
        }
        metadata = { peerId: clientId, role, nickname: String(message.nickname || 'Player').slice(0, 18), ready: false, character: null };
        this.clients.set(clientId, { socket: server, meta: metadata });
        const players = [...this.clients.values()].map(item => item.meta);
        this.send(server, { type: 'helloAck', peerId: clientId, players });
        this.broadcast({ type: 'roster', players });
        if (players.length > 1) this.broadcast({ type: 'peerJoined', player: metadata }, clientId);
        return;
      }

      if (!clientId || !metadata) return;
      if (message.type === 'roomMessage') {
        // Lobby updates are stamped from the authenticated connection. Do not
        // forward a payload that can impersonate the other participant.
        const incoming = message.payload && typeof message.payload === 'object' ? message.payload : null;
        if (incoming && incoming.type === 'lobbyUpdate') {
          metadata.nickname = String(incoming.nickname || metadata.nickname || 'Player').slice(0, 18);
          metadata.character = incoming.character == null ? null : String(incoming.character).slice(0, 40);
          metadata.ready = !!incoming.ready;
          this.broadcast({ type: 'roomMessage', from: clientId, payload: {
            type: 'lobbyUpdate', peerId: clientId, role: metadata.role,
            nickname: metadata.nickname, character: metadata.character, ready: metadata.ready
          }});
        } else {
          this.broadcast({ type: 'roomMessage', from: clientId, payload: incoming });
        }
        return;
      }
      if (message.type === 'signal') {
        this.broadcast({ type: 'signal', from: clientId, signal: message.signal }, clientId);
        return;
      }
      if (message.type === 'ping') { this.send(server, { type: 'pong', at: Date.now() }); return; }
      if (message.type === 'leave') { close(1000, 'leave'); return; }
    });

    let removed = false;
    const onClose = () => {
      if (removed) return;
      removed = true;
      if (helloTimer) clearTimeout(helloTimer);
      helloTimer = null;
      if (!clientId) return;
      if (!this.clients.delete(clientId)) return;
      if (metadata.role === 'host') {
        const successor = this.clients.values().next().value;
        if (successor) {
          successor.meta.role = 'host';
          successor.meta.ready = false;
        }
      }
      this.broadcast({ type: 'peerLeft', player: metadata });
      this.broadcast({ type: 'roster', players: [...this.clients.values()].map(item => item.meta) });
    };
    server.addEventListener('close', onClose);
    server.addEventListener('error', onClose);
    return new Response(null, { status: 101, webSocket: client });
  }

  send(socket, payload) { try { socket.send(JSON.stringify(payload)); } catch (_) {} }

  broadcast(payload, except = null) {
    // Callers identify peers by their stable client id, while the map stores
    // the actual WebSocket. Resolve ids here so SDP/ICE is never echoed back
    // to the sender (self-signals can otherwise trigger spurious ICE errors).
    const exceptSocket = typeof except === 'string'
      ? (this.clients.get(except) || {}).socket
      : except;
    for (const { socket } of this.clients.values()) if (socket !== exceptSocket) this.send(socket, payload);
  }
}
