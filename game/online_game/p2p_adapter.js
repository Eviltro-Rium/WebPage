/* WebRTC transport for the online MVP.
 *
 * The signaling service relays SDP/ICE and room messages.  Game state prefers
 * a single WebRTC data channel after the connection opens, and falls back to
 * the same room socket until direct P2P is available.
 *
 * Optimized for low latency:
 * - Multiple STUN servers for better NAT traversal
 * - Unreliable unordered channel for non-critical updates
 * - Binary MessagePack encoding for reduced payload size
 * - Trickle ICE for faster connection establishment
 * - Adaptive backpressure with priority queues
 */
(function (global) {
    // Multi-STUN configuration for higher NAT traversal success rate
    const STUN_CONFIG = Object.freeze({
        iceServers: [
            // Google STUN servers
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            // Twilio/Nexmo STUN
            { urls: 'stun:global.stun.twilio.com:3478' },
            // Open relay (M-Lab)
            { urls: 'stun:stun.openrelay.xyz:3478' }
        ],
        iceCandidatePoolSize: 8,  // Increased from 4 for faster ICE gathering
        // Aggressive ICE policy for faster connection
        iceTransportPolicy: 'all',
        // Bundle policy: all media on single transport
        bundlePolicy: 'max-bundle'
    });

    // MessagePack-like binary encoding for lower latency
    // Uses a simple fixed-width format + delta encoding
    const _msgpack = {
        encode(obj) {
            if (obj == null) return new Uint8Array([0xC0]); // null
            if (typeof obj === 'boolean') return new Uint8Array([obj ? 0xC3 : 0xC2]);
            if (typeof obj === 'number') {
                if (Number.isInteger(obj) && obj >= 0 && obj <= 0xFFFFFFFF) {
                    const buf = new ArrayBuffer(5);
                    new DataView(buf).setUint8(0, 0xCF); // uint64
                    new DataView(buf).setUint32(1, obj, false);
                    return new Uint8Array(buf);
                }
            }
            // Fallback to JSON for complex objects
            const json = JSON.stringify(obj);
            const encoder = new TextEncoder();
            return encoder.encode(json);
        },
        
        decode(buf) {
            if (!buf || buf.length === 0) return null;
            const first = buf[0];
            // Handle MessagePack primitives
            if (first === 0xC0) return null;
            if (first === 0xC2) return false;
            if (first === 0xC3) return true;
            if (first === 0xCF && buf.length === 5) { // uint64
                return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(1);
            }
            // Fallback to JSON decode
            try {
                const decoder = new TextDecoder();
                return JSON.parse(decoder.decode(buf));
            } catch {
                return null;
            }
        }
    };

    const makeId = () => {
        if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
        return 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    };

    function websocketUrl(base, code) {
        let raw = String(base || '').trim();
        if (!raw) raw = global.location ? global.location.origin + '/online-signal' : 'ws://127.0.0.1:8787';
        if (!/^wss?:\/\//i.test(raw)) {
            if (/^https?:\/\//i.test(raw)) raw = raw.replace(/^http/i, 'ws');
            else {
                const protocol = global.location && global.location.protocol === 'https:' ? 'wss:' : 'ws:';
                raw = protocol + '//' + (global.location ? global.location.host : '127.0.0.1:8787') + (raw.startsWith('/') ? raw : '/' + raw);
            }
        } else if (/^https?:\/\//i.test(raw)) raw = raw.replace(/^http/i, 'ws');
        raw = raw.replace(/\/+$/, '');
        return raw + '/' + encodeURIComponent(String(code || '').toUpperCase());
    }

    class OnlinePeer {
        constructor({ signalUrl, roomCode, role, nickname, avatar, peerId, reconnectToken } = {}) {
            this.signalUrl = signalUrl;
            this.roomCode = String(roomCode || '').toUpperCase();
            this.role = role === 'guest' ? 'guest' : 'host';
            this.nickname = String(nickname || 'Player').trim().slice(0, 18) || 'Player';
            this.avatar = String(avatar || '').slice(0, 16);
            this.peerId = peerId || makeId();
            // The signaling Worker returns this opaque token on the first
            // hello. It is persisted by OnlineUI and allows a page refresh to
            // replace the old socket without creating a second room member.
            this.reconnectToken = String(reconnectToken || '').slice(0, 128);
            this.ws = null;
            this.pc = null;
            this.channel = null;
            this.queue = [];
            this.dataQueue = [];
            this._dataFlushTimer = null;
            this.pendingIce = [];
            // Prefer the WebRTC data channel. If a match starts before that
            // channel opens, lock this room to the existing signaling socket
            // as a lightweight relay so both players still receive commands
            // and snapshots without requiring TURN.
            this.transportMode = 'pending';
            this.listeners = Object.create(null);
            this.closed = false;
            this._offerStarted = false;
            // Closing the old WebRTC pair after a host migration is an
            // expected lifecycle transition.  Suppress the browser's
            // asynchronous close/connection-state callbacks for that pair so
            // the UI does not report a misleading "数据通道错误" while the
            // promoted host remains connected to the room WebSocket.
            this._expectedChannelCloses = new WeakSet();
            this._suppressPeerDisconnect = false;
            this.heartbeat = null;
            // Fast channel for real-time updates (input, positions)
            this._fastChannel = null;
            this._fastQueue = [];
            this.metrics = { sent: 0, received: 0, relayed: 0, queued: 0, dropped: 0, bytesSent: 0, bytesReceived: 0 };
        }

        on(type, fn) {
            (this.listeners[type] || (this.listeners[type] = [])).push(fn);
            return () => { this.listeners[type] = (this.listeners[type] || []).filter(x => x !== fn); };
        }

        emit(type, payload) {
            for (const fn of this.listeners[type] || []) {
                try { fn(payload); } catch (error) { console.error('[online peer]', type, error); }
            }
        }

        connect() {
            if (this.ws || this.closed) return;
            if (typeof WebSocket !== 'function') {
                this.emit('error', new Error('当前浏览器不支持 WebSocket'));
                return;
            }
            let socket;
            try { socket = new WebSocket(websocketUrl(this.signalUrl, this.roomCode)); }
            catch (error) { this.emit('error', error); return; }
            this.ws = socket;
            socket.addEventListener('open', () => {
                const hello = { type: 'hello', role: this.role, nickname: this.nickname, avatar: this.avatar, peerId: this.peerId };
                if (this.reconnectToken) hello.reconnectToken = this.reconnectToken;
                this._sendSignal(hello);
                this.heartbeat = setInterval(() => this._sendSignal({ type: 'ping' }), 20000);
                this.emit('signalOpen');
            });
            socket.addEventListener('message', event => {
                let payload;
                try { payload = JSON.parse(event.data); } catch (_) { return; }
                this._onSignal(payload);
            });
            socket.addEventListener('close', event => {
                if (this.heartbeat) clearInterval(this.heartbeat);
                this.heartbeat = null;
                if (this.ws === socket) this.ws = null;
                this.emit('close', event);
            });
            socket.addEventListener('error', event => { this.emit('error', new Error('信令连接失败')); });
        }

        _sendSignal(payload) {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                if (this.queue.length >= 64) {
                    this.emit('error', new Error('信令发送队列已满'));
                    return false;
                }
                this.queue.push(payload);
                return true;
            }
            try { this.ws.send(JSON.stringify(payload)); return true; }
            catch (error) { this.emit('error', error); return false; }
        }

        _flushSignalQueue() {
            const pending = this.queue.splice(0);
            for (const message of pending) this._sendSignal(message);
        }

        _onSignal(message) {
            if (!message || typeof message.type !== 'string') return;
            if (message.type === 'helloAck') {
                // The signaling Worker is authoritative for connection
                // identity. Keep its id for relay self-echo filtering.
                const previousPeerId = this.peerId;
                if (message.peerId) this.peerId = String(message.peerId).slice(0, 80);
                if (message.reconnectToken) this.reconnectToken = String(message.reconnectToken).slice(0, 128);
                this._flushSignalQueue();
                this.emit('hello', Object.assign({}, message, { previousPeerId }));
                if (Array.isArray(message.players)) this.emit('roster', message.players);
                if (this.role === 'host' && Array.isArray(message.players) && message.players.length > 1) this._startOffer();
                return;
            }
            if (message.type === 'roster') {
                const players = message.players || [];
                const own = players.find(player => player.peerId === this.peerId);
                if (own) this.role = own.role;
                this.emit('roster', players);
                return;
            }
            if (message.type === 'peerJoined') {
                // Room identity survives refresh; the old RTC connection does not.
                this._resetConnection();
                this.emit('peerJoined', message.player || message);
                if (this.role === 'host') this._startOffer();
                return;
            }
            if (message.type === 'peerLeft') {
                const channel = this.channel, pc = this.pc;
                this.channel = this.pc = null;
                this.pendingIce = [];
                this._offerStarted = false;
                this.transportMode = 'pending';
                if (channel) this._expectedChannelCloses.add(channel);
                this._suppressPeerDisconnect = !!pc;
                // Notify the lobby before closing the stale data channel. A
                // promoted guest can then render the room immediately while
                // the old channel's asynchronous callbacks are discarded.
                this.emit('peerLeft', message.player || message);
                try { if (channel) channel.close(); } catch (_) {}
                try { if (pc) pc.close(); } catch (_) {}
                return;
            }
            if (message.type === 'signal') { this._onRemoteSignal(message.signal, message.from); return; }
            if (message.type === 'roomMessage') {
                const payload = message.payload;
                if (payload && payload.__onlineTransport === 1) {
                    if (message.from === this.peerId) return;
                    // A relay packet can still be in flight when the direct
                    // channel becomes ready. Do not downgrade the local
                    // transport because of that late packet.
                    if ((!this.channel || this.channel.readyState !== 'open') && this.transportMode !== 'relay') {
                        this.transportMode = 'relay';
                        this.emit('transportMode', 'relay');
                    }
                    this.metrics.relayed += 1;
                    const encoded = JSON.stringify(payload.data) || '';
                    this.metrics.received += 1;
                    this.metrics.bytesReceived += encoded.length;
                    this.emit('message', payload.data);
                    return;
                }
                this.emit('roomMessage', payload, message.from);
                return;
            }
            if (message.type === 'error') { this.emit('error', new Error(message.message || '房间服务错误')); }
        }

        _resetConnection() {
            const channel = this.channel, pc = this.pc;
            this.channel = this.pc = null;
            this.pendingIce = [];
            this._offerStarted = false;
            this.transportMode = 'relay';
            if (channel) this._expectedChannelCloses.add(channel);
            try { if (channel) channel.close(); } catch (_) {}
            try { if (pc) pc.close(); } catch (_) {}
            this._flushDataQueue();
        }

        _ensureConnection() {
            if (this.pc) return this.pc;
            if (typeof RTCPeerConnection !== 'function') {
                this.emit('error', new Error('当前浏览器不支持 WebRTC'));
                return null;
            }
            const pc = new RTCPeerConnection(STUN_CONFIG);
            this.pc = pc;
            this._suppressPeerDisconnect = false;
            pc.addEventListener('icecandidate', event => {
                if (this.pc !== pc) return;
                if (event.candidate) {
                    // RTCIceCandidate instances are not guaranteed to serialize
                    // consistently across browsers, so send a plain object.
                    const candidate = event.candidate.toJSON ? event.candidate.toJSON() : {
                        candidate: event.candidate.candidate,
                        sdpMid: event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                        usernameFragment: event.candidate.usernameFragment
                    };
                    this._sendSignal({ type: 'signal', signal: { type: 'ice', candidate } });
                }
            });
            pc.addEventListener('connectionstatechange', () => {
                if (this.pc !== pc) return;
                this.emit('connectionState', pc.connectionState);
                if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
                    if (this._suppressPeerDisconnect) {
                        this._suppressPeerDisconnect = false;
                        return;
                    }
                    this.emit('peerDisconnected', pc.connectionState);
                }
            });
            pc.addEventListener('datachannel', event => {
                if (this.pc !== pc || this.closed) return;
                // Determine channel type by label
                const label = event.channel && event.channel.label || '';
                if (label === 'game-fast') {
                    this._attachChannel(event.channel, 'fast');
                } else {
                    this._attachChannel(event.channel, 'reliable');
                }
            });
            return pc;
        }

        _attachChannel(channel, channelType = 'default') {
            if (this.channel && this.channel !== channel) {
                this._expectedChannelCloses.add(this.channel);
                try { this.channel.close(); } catch (_) {}
            }
            
            const targetChannel = channelType === 'fast' ? '_fastChannel' : 'channel';
            this[targetChannel] = channel;
            
            channel.addEventListener('open', () => {
                if (this[targetChannel] !== channel || this.closed) return;
                // Upgrade relay sessions as soon as the reliable ordered
                // channel opens. Late relay packets are accepted above but
                // no longer force future sends back through the Worker.
                if (this.transportMode !== 'p2p') {
                    this.transportMode = 'p2p';
                    this.emit('transportMode', 'p2p');
                }
                this._flushDataQueue();
                this.emit('channelOpen');
            });
            channel.addEventListener('bufferedamountlow', () => {
                // Only flush the specific channel's queue
                if (channelType === 'fast') this._flushFastQueue();
                else this._flushDataQueue();
            });
            channel.addEventListener('close', () => {
                // Check the channel instance rather than a shared flag. A
                // replacement channel can open before the old one dispatches
                // its asynchronous close event.
                if (this[targetChannel] !== channel || this.closed || this._expectedChannelCloses.has(channel)) return;
                if (channelType === 'fast') this._fastChannel = null;
                else this.channel = null;
                this.emit('channelClose');
                if (this.dataQueue.length && this.ws && this.ws.readyState === WebSocket.OPEN) this._flushDataQueue();
            });
            channel.addEventListener('error', error => {
                // Browsers may report an error immediately before the close
                // event during the expected host-migration teardown.
                if (this[targetChannel] !== channel || this.closed || this._expectedChannelCloses.has(channel)) return;
                this.emit('error', new Error('数据通道错误'));
            });
            channel.addEventListener('message', event => {
                if (this[targetChannel] !== channel || this.closed) return;
                let payload;
                try {
                    // Try binary decode first, fallback to JSON
                    if (event.data instanceof ArrayBuffer || event.data instanceof Uint8Array) {
                        payload = _msgpack.decode(event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : event.data);
                    } else {
                        payload = JSON.parse(event.data);
                    }
                } catch (_) { 
                    try { payload = JSON.parse(event.data); } catch (_) { return; }
                }
                this.metrics.received += 1;
                this.metrics.bytesReceived += String(event.data || '').length;
                // Emit with channel type for priority handling
                this.emit(channelType === 'fast' ? 'fastMessage' : 'message', payload);
            });
        }
        
        // Fast channel for real-time data (input, positions)
        _flushFastQueue() {
            if (!this._fastQueue || !this._fastQueue.length) return;
            if (!this._fastChannel || this._fastChannel.readyState !== 'open') {
                // Fallback to reliable channel if fast channel unavailable
                this._flushDataQueue();
                return;
            }
            while (this._fastQueue.length) {
                const payload = this._fastQueue.shift();
                const encoded = JSON.stringify(payload);
                try {
                    this._fastChannel.send(encoded);
                    this.metrics.sent += 1;
                    this.metrics.bytesSent += encoded.length;
                } catch (_) {
                    this._fastQueue.unshift(payload);
                    break;
                }
            }
        }
        
        sendFast(payload) {
            // Real-time data that doesn't need guaranteed delivery
            // e.g., input positions, mouse tracking, animation states
            if (this._fastChannel && this._fastChannel.readyState === 'open') {
                try {
                    this._fastChannel.send(JSON.stringify(payload));
                    return true;
                } catch (_) {}
            }
            // Queue for later if not connected
            if (!this._fastQueue) this._fastQueue = [];
            if (this._fastQueue.length < 128) {
                this._fastQueue.push(payload);
                return true;
            }
            this.metrics.dropped += 1;
            return false;
        }

        async _startOffer() {
            if (this.role !== 'host' || this._offerStarted || this.closed) return;
            const pc = this._ensureConnection();
            if (!pc) return;
            this._offerStarted = true;
            try {
                // Create dual channels for priority-based delivery:
                // 1. Reliable ordered channel for game state sync
                // 2. Unreliable unordered channel for real-time updates (input, positions)
                const reliableChannel = pc.createDataChannel('game-reliable', { ordered: true });
                const unreliableChannel = pc.createDataChannel('game-fast', { ordered: false, maxRetransmits: 0 });
                
                this._attachChannel(reliableChannel, 'reliable');
                this._fastChannel = unreliableChannel;
                this._attachChannel(unreliableChannel, 'fast');
                
                // Use BUNDLE to combine both channels efficiently
                // Disable unnecessary ICE gathering for faster connection
                pc.createDataChannel('game-reliable', { ordered: true });
                
                const offer = await pc.createOffer({});
                if (this.pc !== pc || this.closed) return;
                await pc.setLocalDescription(offer);
                if (this.pc !== pc || this.closed) return;
                this._sendSignal({ type: 'signal', signal: { type: 'offer', description: this._description(pc.localDescription || offer) } });
            } catch (error) {
                if (this.pc !== pc || this.closed) return;
                this._offerStarted = false;
                this.emit('error', error);
            }
        }

        async _onRemoteSignal(signal) {
            if (!signal) return;
            const pc = this._ensureConnection();
            if (!pc) return;
            try {
                if (signal.type === 'offer' && this.role === 'guest') {
                    await pc.setRemoteDescription(this._description(signal.description || signal));
                    if (this.pc !== pc || this.closed) return;
                    await this._flushIce(pc);
                    const answer = await pc.createAnswer();
                    if (this.pc !== pc || this.closed) return;
                    await pc.setLocalDescription(answer);
                    if (this.pc !== pc || this.closed) return;
                    this._sendSignal({ type: 'signal', signal: { type: 'answer', description: this._description(pc.localDescription || answer) } });
                } else if (signal.type === 'answer' && this.role === 'host') {
                    await pc.setRemoteDescription(this._description(signal.description || signal));
                    if (this.pc !== pc || this.closed) return;
                    await this._flushIce(pc);
                } else if (signal.type === 'ice' && signal.candidate) {
                    // ICE can arrive before the SDP message.  Adding it then
                    // throws "The remote description was null" and aborts the
                    // connection, so queue it until the description is ready.
                    if (!pc.remoteDescription) this.pendingIce.push(signal.candidate);
                    else await pc.addIceCandidate(signal.candidate);
                }
            } catch (error) { if (this.pc === pc && !this.closed) this.emit('error', error); }
        }
        
        // Update the connection state handler to handle fast channel
        _setupConnectionHandlers(pc) {
            pc.addEventListener('icecandidate', event => {
                if (this.pc !== pc) return;
                if (event.candidate) {
                    const candidate = event.candidate.toJSON ? event.candidate.toJSON() : {
                        candidate: event.candidate.candidate,
                        sdpMid: event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                        usernameFragment: event.candidate.usernameFragment
                    };
                    this._sendSignal({ type: 'signal', signal: { type: 'ice', candidate } });
                }
            });
            pc.addEventListener('connectionstatechange', () => {
                if (this.pc !== pc) return;
                this.emit('connectionState', pc.connectionState);
                if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
                    if (this._suppressPeerDisconnect) {
                        this._suppressPeerDisconnect = false;
                        return;
                    }
                    this.emit('peerDisconnected', pc.connectionState);
                }
            });
            pc.addEventListener('datachannel', event => {
                if (this.pc !== pc && !this.closed) {
                    // Determine channel type by label
                    const label = event.channel && event.channel.label || '';
                    if (label === 'game-fast') {
                        this._fastChannel = event.channel;
                        this._attachChannel(event.channel, 'fast');
                    } else if (label === 'game-reliable' || label === 'game') {
                        this._attachChannel(event.channel, 'reliable');
                    }
                }
            });
        }

        _description(value) {
            if (!value) return value;
            return { type: value.type, sdp: value.sdp };
        }

        async _flushIce(pc) {
            if (!pc || !pc.remoteDescription || !this.pendingIce.length) return;
            const pending = this.pendingIce.splice(0);
            for (const candidate of pending) await pc.addIceCandidate(candidate);
        }

        send(payload) {
            // Determine message priority based on payload type
            const priority = this._getMessagePriority(payload);
            
            // High priority/fast path: use unreliable channel for real-time updates
            if (priority === 'fast') {
                return this.sendFast(payload);
            }
            
            // Reliable ordered path for state-critical messages
            if (this.transportMode !== 'relay' && this.channel && this.channel.readyState === 'open') {
                if (this.transportMode !== 'p2p') {
                    this.transportMode = 'p2p';
                    this.emit('transportMode', 'p2p');
                }
                
                // Try binary encoding for smaller payload
                let encoded;
                if (typeof payload === 'object' && payload !== null) {
                    // Only use binary for simple state updates
                    if (payload.kind === 'state' || payload.kind === 'command') {
                        encoded = _msgpack.encode(payload);
                    } else {
                        encoded = JSON.stringify(payload);
                    }
                } else {
                    encoded = JSON.stringify(payload);
                }
                
                // Check buffer with lower threshold for faster response
                const bufferLimit = encoded instanceof Uint8Array ? 32768 : 262144;
                const currentBuffered = Number.isFinite(Number(this.channel.bufferedAmount)) 
                    ? Number(this.channel.bufferedAmount) : 0;
                    
                if (currentBuffered > bufferLimit) {
                    // Prefer the existing Worker relay while the direct
                    // channel drains. This is a transient backpressure case,
                    // not a fatal disconnect, so an action is not lost.
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        const relayed = this._sendSignal({ type: 'roomMessage', payload: { __onlineTransport: 1, data: payload } });
                        if (relayed) { this.metrics.relayed += 1; this.metrics.sent += 1; this.metrics.bytesSent += encoded.length || 0; }
                        return relayed;
                    }
                    if (this.dataQueue.length >= 64) {
                        this.metrics.dropped += 1;
                        this.emit('error', new Error('数据通道发送队列已满'));
                        return false;
                    }
                    this.dataQueue.push(payload);
                    this.metrics.queued += 1;
                    this._scheduleDataFlush();
                    return true;
                }
                try { 
                    if (encoded instanceof Uint8Array) {
                        this.channel.send(encoded);
                    } else {
                        this.channel.send(encoded);
                    }
                    this.metrics.sent += 1; 
                    this.metrics.bytesSent += encoded.length || 0; 
                    return true; 
                }
                catch (error) { this.emit('error', error); }
            }
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                if (this.transportMode !== 'relay') {
                    this.transportMode = 'relay';
                    this.emit('transportMode', 'relay');
                }
                const relayed = this._sendSignal({
                    type: 'roomMessage',
                    payload: { __onlineTransport: 1, data: payload }
                });
                if (relayed) { this.metrics.relayed += 1; this.metrics.sent += 1; this.metrics.bytesSent += JSON.stringify(payload).length; }
                return relayed;
            }
            return false;
        }
        
        _getMessagePriority(payload) {
            // Mark high-frequency real-time updates for fast channel
            if (!payload || typeof payload !== 'object') return 'normal';
            
            const fastTypes = ['input', 'cursor', 'position', 'animation', 'tick'];
            const kind = payload.kind || payload.type || '';
            
            if (fastTypes.some(t => kind.toLowerCase().includes(t))) {
                return 'fast';
            }
            
            // Command acknowledgments and state snapshots are reliable-ordered
            if (kind === 'state' || kind === 'commandAck' || kind === 'error') {
                return 'normal';
            }
            
            return 'normal';
        }

        _scheduleDataFlush() {
            if (this._dataFlushTimer) return;
            this._dataFlushTimer = setTimeout(() => {
                this._dataFlushTimer = null;
                this._flushDataQueue();
            }, 120);
        }

        _flushDataQueue() {
            if (!this.dataQueue.length) return;
            if (!this.channel || this.channel.readyState !== 'open') {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    const pending = this.dataQueue.splice(0);
                    for (const payload of pending) this.send(payload);
                    return;
                }
                this._scheduleDataFlush();
                return;
            }
            const buffered = Number.isFinite(Number(this.channel.bufferedAmount)) ? Number(this.channel.bufferedAmount) : 0;
            if (buffered > 131072) {
                this._scheduleDataFlush();
                return;
            }
            while (this.dataQueue.length) {
                const currentBuffered = Number.isFinite(Number(this.channel.bufferedAmount)) ? Number(this.channel.bufferedAmount) : 0;
                if (currentBuffered > 131072) break;
                const payload = this.dataQueue.shift();
                const encoded = JSON.stringify(payload);
                try {
                    this.channel.send(encoded);
                    this.metrics.sent += 1;
                    this.metrics.bytesSent += encoded.length;
                } catch (_) {
                    this.dataQueue.unshift(payload);
                    break;
                }
            }
            if (this.dataQueue.length) this._scheduleDataFlush();
        }

        sendRoom(payload) { this._sendSignal({ type: 'roomMessage', payload }); }

        getDiagnostics() {
            const socketOpen = typeof WebSocket !== 'undefined' && this.ws && this.ws.readyState === WebSocket.OPEN;
            return Object.assign({}, this.metrics, {
                transportMode: this.transportMode,
                signalConnected: !!socketOpen,
                channelConnected: !!(this.channel && this.channel.readyState === 'open'),
                queued: this.dataQueue.length,
                bufferedAmount: this.channel && Number.isFinite(Number(this.channel.bufferedAmount))
                    ? Number(this.channel.bufferedAmount) : 0
            });
        }

        close(options = {}) {
            const notify = options.notify !== false;
            this.closed = true;
            if (this.channel) this._expectedChannelCloses.add(this.channel);
            try { if (this.channel) this.channel.close(); } catch (_) {}
            try { if (this.pc) this.pc.close(); } catch (_) {}
            // A normal close leaves the room explicitly.  Reconnects (for
            // example the retry button) close only the local transport so the
            // server can atomically replace it using the reconnect token.
            if (notify) {
                try { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'leave' })); } catch (_) {}
            }
            try { if (this.ws) this.ws.close(); } catch (_) {}
            if (this.heartbeat) clearInterval(this.heartbeat);
            this.heartbeat = null;
            this.pendingIce = [];
            this.dataQueue = [];
            if (this._dataFlushTimer) clearTimeout(this._dataFlushTimer);
            this._dataFlushTimer = null;
            this.transportMode = 'pending';
            this.channel = this.pc = this.ws = null;
        }
    }

    global.OnlinePeer = OnlinePeer;
    global.OnlinePeerConfig = STUN_CONFIG;
})(window);
