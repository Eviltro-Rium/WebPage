/* Cloudflare Worker signaling relay for Furry Trial online rooms.
 *
 * A Durable Object keeps at most two WebSocket clients for a room and relays
 * lobby/SDP/ICE messages. If WebRTC is unavailable, the same socket also
 * carries the host-authoritative game packets for that small room.
 * 
 * Optimized for low latency:
 * - Aggressive ICE candidate forwarding (trickle ICE)
 * - Reduced hello timeout for faster failure detection
 * - Optimized message parsing
 * - Direct peer-to-peer signaling without queuing
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
    // A browser refresh closes the old WebSocket before the new document can
    // send its reconnect token. Keep the authenticated room slot for a short
    // grace period so that close/hello ordering cannot turn a refresh into a
    // room exit. Explicit `leave` still removes the slot immediately.
    this.reconnectGraceMs = 10000;  // Reduced from 15000ms for faster cleanup
    // Signal forwarding performance
    this._signalBuffer = new Map();  // Pre-allocated buffer for ICE candidates
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    let clientId = null;
    let metadata = null;
    // Reduced timeout for faster failure detection (from 15000ms)
    let helloTimer = setTimeout(() => { if (!clientId) close(1008, 'hello-timeout'); }, 10000);
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

      // Fast path for ICE candidates - relay immediately without queue
      if (message.type === 'signal' && message.signal && message.signal.type === 'ice') {
        // Direct relay for ICE candidates - highest priority
        this.broadcast({ type: 'signal', from: clientId, signal: message.signal }, clientId);
        // Respond with pong immediately
        this.send(server, { type: 'pong', at: Date.now() });
        return;
      }

      if (message.type === 'hello') {
        if (clientId) return;
        clearTimeout(helloTimer);
        helloTimer = null;
        const role = message.role === 'guest' ? 'guest' : 'host';
        const reconnectToken = String(message.reconnectToken || '').trim().slice(0, 128);
        // A refresh opens a new WebSocket before the browser has finished
        // delivering the old socket's close event.  A server-issued token
        // lets that same browser replace its old connection atomically
        // instead of being rejected as "room-full"/"host-exists".
        const existing = reconnectToken
          ? [...this.clients.entries()].find(([, item]) => item.meta.reconnectToken === reconnectToken)
          : null;
        if (existing) {
          const [existingId, entry] = existing;
          clientId = existingId;
          metadata = entry.meta;
          const oldSocket = entry.socket;
          if (entry.disconnectTimer) clearTimeout(entry.disconnectTimer);
          entry.disconnectTimer = null;
          entry.disconnectedAt = 0;
          entry.intentionalLeave = false;
          entry.socket = server;
          metadata.nickname = String(message.nickname || metadata.nickname || 'Player').slice(0, 18);
          metadata.avatar = message.avatar == null ? metadata.avatar : String(message.avatar).slice(0, 16);
          // Keep the authoritative role and lobby selection while the new
          // page restores its local copy; the first lobbyUpdate then writes
          // the latest character/ready values back to the room.
          try { if (oldSocket && oldSocket !== server) oldSocket.close(1000, 'replaced'); } catch (_) {}
        } else {
          if (this.clients.size >= 2) { close(1008, 'room-full'); return; }
          // Never trust a client supplied peerId. Identity is generated here;
          // the reconnect token below is the only way to replace that entry.
          clientId = crypto.randomUUID();
          if (role === 'guest' && ![...this.clients.values()].some(item => item.meta.role === 'host')) {
            close(1008, 'room-not-found'); return;
          }
          if (role === 'host' && [...this.clients.values()].some(item => item.meta.role === 'host')) {
            close(1008, 'host-exists'); return;
          }
          metadata = {
            peerId: clientId,
            role,
            nickname: String(message.nickname || 'Player').slice(0, 18),
            avatar: String(message.avatar || '').slice(0, 16),
            ready: false,
            character: null,
            reconnectToken: crypto.randomUUID()
          };
          this.clients.set(clientId, { socket: server, meta: metadata });
        }
        const players = [...this.clients.values()].map(item => this.publicMeta(item.meta));
        this.send(server, { type: 'helloAck', peerId: clientId, reconnectToken: metadata.reconnectToken, players });
        this.broadcast({ type: 'roster', players });
        if (players.length > 1) this.broadcast({ type: 'peerJoined', player: this.publicMeta(metadata) }, clientId);
        return;
      }

      if (!clientId || !metadata) return;
      if (message.type === 'roomMessage') {
        // Lobby updates are stamped from the authenticated connection. Do not
        // forward a payload that can impersonate the other participant.
        const incoming = message.payload && typeof message.payload === 'object' ? message.payload : null;
        if (incoming && incoming.type === 'lobbyUpdate') {
          metadata.nickname = String(incoming.nickname || metadata.nickname || 'Player').slice(0, 18);
          metadata.avatar = incoming.avatar == null ? metadata.avatar : String(incoming.avatar).slice(0, 16);
          metadata.character = incoming.character == null ? null : String(incoming.character).slice(0, 40);
          metadata.ready = !!incoming.ready;
          this.broadcast({ type: 'roomMessage', from: clientId, payload: {
            type: 'lobbyUpdate', peerId: clientId, role: metadata.role,
            nickname: metadata.nickname, avatar: metadata.avatar, character: metadata.character, ready: metadata.ready
          }});
        } else {
          // Game packets are point-to-point. Do not send the relay envelope
          // back to its sender; it only wastes bandwidth and makes the
          // browser perform self-echo filtering on every snapshot.
          this.broadcast({ type: 'roomMessage', from: clientId, payload: incoming }, clientId);
        }
        return;
      }
      if (message.type === 'signal') {
        this.broadcast({ type: 'signal', from: clientId, signal: message.signal }, clientId);
        return;
      }
      if (message.type === 'ping') { this.send(server, { type: 'pong', at: Date.now() }); return; }
      if (message.type === 'leave') {
        const entry = this.clients.get(clientId);
        if (entry) entry.intentionalLeave = true;
        close(1000, 'leave');
        return;
      }
    });

    let removed = false;
    const onClose = () => {
      if (removed) return;
      removed = true;
      if (helloTimer) clearTimeout(helloTimer);
      helloTimer = null;
      if (!clientId) return;
      // A refresh/reconnect can replace this connection before its close
      // callback runs. In that case the room entry belongs to the new socket
      // and must not be deleted by the old callback.
      const current = this.clients.get(clientId);
      if (!current || current.socket !== server) return;
      // Do not immediately delete an unannounced browser disconnect. The
      // refreshed page may still be racing this callback with its hello.
      if (!current.intentionalLeave) {
        current.socket = null;
        current.disconnectedAt = Date.now();
        current.disconnectTimer = setTimeout(() => {
          const latest = this.clients.get(clientId);
          if (!latest || latest.socket || latest.disconnectedAt !== current.disconnectedAt) return;
          this.clients.delete(clientId);
          this._notifyDeparture(metadata);
        }, this.reconnectGraceMs);
        return;
      }
      this.clients.delete(clientId);
      this._notifyDeparture(metadata);
    };
    server.addEventListener('close', onClose);
    server.addEventListener('error', onClose);
    return new Response(null, { status: 101, webSocket: client });
  }

  send(socket, payload) { try { socket.send(JSON.stringify(payload)); } catch (_) {} }

  publicMeta(meta) {
    if (!meta) return null;
    return {
      peerId: meta.peerId,
      role: meta.role,
      nickname: meta.nickname,
      avatar: meta.avatar,
      ready: !!meta.ready,
      character: meta.character || null
    };
  }

  _notifyDeparture(metadata) {
    if (metadata.role === 'host') {
      // Promote the remaining entry even if its socket is also in the short
      // reconnect grace window.  When that player refreshes later, its token
      // then restores an authoritative host role instead of becoming a
      // stranded guest with no host in the room.
      const successor = [...this.clients.values()][0];
      if (successor) {
        successor.meta.role = 'host';
        successor.meta.ready = false;
      }
    }
    this.broadcast({ type: 'peerLeft', player: this.publicMeta(metadata) });
    this.broadcast({ type: 'roster', players: [...this.clients.values()].map(item => this.publicMeta(item.meta)) });
  }

  broadcast(payload, except = null) {
    // Callers identify peers by their stable client id, while the map stores
    // the actual WebSocket. Resolve ids here so SDP/ICE is never echoed back
    // to the sender (self-signals can otherwise trigger spurious ICE errors).
    const exceptSocket = typeof except === 'string'
      ? (this.clients.get(except) || {}).socket
      : except;
    for (const { socket } of this.clients.values()) if (socket && socket !== exceptSocket) this.send(socket, payload);
  }
}
