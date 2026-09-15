/* WebRTC transport for the online MVP.
 *
 * The signaling service only relays SDP/ICE and room messages.  Game state
 * travels through a single WebRTC data channel after the connection opens.
 * There is intentionally no TURN server in this first small-scale release;
 * the public STUN server improves direct-connect discovery where possible.
 */
(function (global) {
    const STUN_CONFIG = Object.freeze({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        iceCandidatePoolSize: 4
    });

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
        constructor({ signalUrl, roomCode, role, nickname, peerId } = {}) {
            this.signalUrl = signalUrl;
            this.roomCode = String(roomCode || '').toUpperCase();
            this.role = role === 'guest' ? 'guest' : 'host';
            this.nickname = String(nickname || 'Player').trim().slice(0, 18) || 'Player';
            this.peerId = peerId || makeId();
            this.ws = null;
            this.pc = null;
            this.channel = null;
            this.queue = [];
            this.listeners = Object.create(null);
            this.closed = false;
            this._offerStarted = false;
            this.heartbeat = null;
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
                this._sendSignal({ type: 'hello', role: this.role, nickname: this.nickname, peerId: this.peerId });
                this.heartbeat = setInterval(() => this._sendSignal({ type: 'ping' }), 20000);
                this.emit('signalOpen');
            });
            socket.addEventListener('message', event => {
                let payload;
                try { payload = JSON.parse(event.data); } catch (_) { return; }
                this._onSignal(payload);
            });
            socket.addEventListener('close', event => { this.emit('close', event); });
            socket.addEventListener('error', event => { this.emit('error', new Error('信令连接失败')); });
        }

        _sendSignal(payload) {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { this.queue.push(payload); return; }
            try { this.ws.send(JSON.stringify(payload)); } catch (error) { this.emit('error', error); }
        }

        _flushSignalQueue() {
            const pending = this.queue.splice(0);
            for (const message of pending) this._sendSignal(message);
        }

        _onSignal(message) {
            if (!message || typeof message.type !== 'string') return;
            if (message.type === 'helloAck') {
                this._flushSignalQueue();
                this.emit('hello', message);
                if (Array.isArray(message.players)) this.emit('roster', message.players);
                if (this.role === 'host' && Array.isArray(message.players) && message.players.length > 1) this._startOffer();
                return;
            }
            if (message.type === 'roster') { this.emit('roster', message.players || []); return; }
            if (message.type === 'peerJoined') {
                this.emit('peerJoined', message.player || message);
                if (this.role === 'host') this._startOffer();
                return;
            }
            if (message.type === 'peerLeft') { this.emit('peerLeft', message.player || message); return; }
            if (message.type === 'signal') { this._onRemoteSignal(message.signal, message.from); return; }
            if (message.type === 'roomMessage') { this.emit('roomMessage', message.payload, message.from); return; }
            if (message.type === 'error') { this.emit('error', new Error(message.message || '房间服务错误')); }
        }

        _ensureConnection() {
            if (this.pc) return this.pc;
            if (typeof RTCPeerConnection !== 'function') {
                this.emit('error', new Error('当前浏览器不支持 WebRTC'));
                return null;
            }
            const pc = new RTCPeerConnection(STUN_CONFIG);
            this.pc = pc;
            pc.addEventListener('icecandidate', event => {
                if (event.candidate) this._sendSignal({ type: 'signal', signal: { type: 'ice', candidate: event.candidate } });
            });
            pc.addEventListener('connectionstatechange', () => {
                this.emit('connectionState', pc.connectionState);
                if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) this.emit('peerDisconnected', pc.connectionState);
            });
            pc.addEventListener('datachannel', event => this._attachChannel(event.channel));
            return pc;
        }

        _attachChannel(channel) {
            if (this.channel && this.channel !== channel) try { this.channel.close(); } catch (_) {}
            this.channel = channel;
            channel.addEventListener('open', () => this.emit('channelOpen'));
            channel.addEventListener('close', () => this.emit('channelClose'));
            channel.addEventListener('error', error => this.emit('error', new Error('数据通道错误')));
            channel.addEventListener('message', event => {
                let payload;
                try { payload = JSON.parse(event.data); } catch (_) { return; }
                this.emit('message', payload);
            });
        }

        async _startOffer() {
            if (this.role !== 'host' || this._offerStarted || this.closed) return;
            const pc = this._ensureConnection();
            if (!pc) return;
            this._offerStarted = true;
            try {
                this._attachChannel(pc.createDataChannel('game', { ordered: true }));
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                this._sendSignal({ type: 'signal', signal: { type: 'offer', description: pc.localDescription } });
            } catch (error) {
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
                    await pc.setRemoteDescription(signal.description || signal);
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    this._sendSignal({ type: 'signal', signal: { type: 'answer', description: pc.localDescription } });
                } else if (signal.type === 'answer' && this.role === 'host') {
                    await pc.setRemoteDescription(signal.description || signal);
                } else if (signal.type === 'ice' && signal.candidate) {
                    await pc.addIceCandidate(signal.candidate);
                }
            } catch (error) { this.emit('error', error); }
        }

        send(payload) {
            if (!this.channel || this.channel.readyState !== 'open') return false;
            try { this.channel.send(JSON.stringify(payload)); return true; }
            catch (error) { this.emit('error', error); return false; }
        }

        sendRoom(payload) { this._sendSignal({ type: 'roomMessage', payload }); }

        close() {
            this.closed = true;
            try { if (this.channel) this.channel.close(); } catch (_) {}
            try { if (this.pc) this.pc.close(); } catch (_) {}
            try { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'leave' })); } catch (_) {}
            try { if (this.ws) this.ws.close(); } catch (_) {}
            if (this.heartbeat) clearInterval(this.heartbeat);
            this.heartbeat = null;
            this.channel = this.pc = this.ws = null;
        }
    }

    global.OnlinePeer = OnlinePeer;
    global.OnlinePeerConfig = STUN_CONFIG;
})(window);
