/* Lobby and battle view for the online MVP. It speaks the same dispatch
 * vocabulary as GameUI so the online adapter never duplicates card rules. */
(function (global) {
    const PLAYER_EMOJIS = ['🦊', '🐺', '🐼', '🦉', '🐯', '🦋', '🐸', '🦌'];
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const safeText = value => String(value == null ? '' : value).replace(/[<>]/g, '');
    const randomCode = () => {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const randomValues = global.crypto && typeof global.crypto.getRandomValues === 'function'
            ? global.crypto.getRandomValues(new Uint32Array(4)) : null;
        let code = '';
        for (let i = 0; i < 4; i++) code += alphabet[(randomValues ? randomValues[i] : Math.floor(Math.random() * 0xffffffff)) % alphabet.length];
        return code;
    };

    class OnlineUI {
        constructor(root) {
            this.root = root; this.peer = null; this.role = null; this.roomCode = '';
            this.nickname = ''; this.signalUrl = ''; this.players = []; this.character = null;
            this.ready = false; this.match = null; this.state = null;
            this.error = ''; this.pendingSync = null; this.connectionState = '未连接'; this.roomStatus = '';
            this.battleSession = null; this.battleUI = null; this._battleAnimation = Promise.resolve();
            this._matchStartPayload = null; this._matchStartAcked = false; this._matchStartAttempts = 0; this._matchStartRetryTimer = null;
            // The initial snapshot is sent in two phases: matchStart mounts
            // the guest session, then matchReady enables the first actor.  A
            // lost second packet used to leave the guest permanently marked
            // as non-interactive even though the host had already started.
            this._matchReadyPayload = null; this._matchReadyAcked = false;
            this._matchReadyAttempts = 0; this._matchReadyRetryTimer = null;
            this.showLanding();
        }

        chars() {
            const registry = global.CharacterRegistry;
            return registry && typeof registry.all === 'function' ? registry.all().filter(item => item && !item.adventureNpc) : [];
        }
        defaultSignalUrl() {
            if (global.FURRY_SIGNAL_URL) return global.FURRY_SIGNAL_URL;
            if (global.location && global.location.protocol === 'file:') return 'ws://127.0.0.1:8787';
            return (global.location ? global.location.origin : '') + '/online-signal';
        }
        showLanding() {
            this.root.innerHTML = '<div class="online-topbar"><div class="online-brand"><div class="online-brand-mark">FT</div><div><div class="online-brand-title">Furry Trial</div><div class="online-brand-sub">在线对决 · WebRTC P2P</div></div></div><a class="online-link" href="../index.html">← 返回游戏主页</a></div>' +
                '<section class="online-panel online-landing"><div class="online-intro"><h1>与你的朋友<br><span>面对面出牌</span></h1><p>建立一个小型房间，优先使用浏览器原生 WebRTC 直接传输战斗指令；直连尚未建立时自动通过信令连接同步。房主运行单机同一套战斗引擎，双方只交换必要的同步状态。</p><div class="online-notice"><div><b>01</b><span>不需要安装客户端，分享 4 位房间码即可加入。</span></div><div><b>02</b><span>当前版本不配置 TURN，适合小规模测试。</span></div><div><b>03</b><span>请使用 HTTPS 域名；本地调试可用 Wrangler Dev。</span></div></div></div>' +
                '<form class="online-form" id="online-connect-form"><h2>进入在线房间</h2><label class="online-label">昵称<input class="online-input" id="online-nickname" maxlength="18" placeholder="例如：Rium" autocomplete="nickname"></label><div class="online-form-row"><button class="online-btn primary" id="online-create" type="button">创建房间</button><button class="online-btn" id="online-join" type="button">加入房间</button></div><label class="online-label">房间码（加入时填写）<input class="online-input" id="online-room-code" maxlength="4" placeholder="ABCD" autocapitalize="characters"></label><div class="online-status" id="online-landing-status"></div></form></section>';
            const name = this.root.querySelector('#online-nickname');
            if (name) {
                try { name.value = localStorage.getItem('furry-online-name') || ''; } catch (_) { name.value = ''; }
            }
            this.root.querySelector('#online-create').addEventListener('click', () => this.connect('host'));
            this.root.querySelector('#online-join').addEventListener('click', () => this.connect('guest'));
            this.root.querySelector('#online-room-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
            const location = global.location || {};
            const secure = location.protocol === 'https:' || location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
            const supported = typeof global.WebSocket === 'function' && typeof global.RTCPeerConnection === 'function';
            if (!supported) {
                this.root.querySelector('#online-create').disabled = true;
                this.root.querySelector('#online-join').disabled = true;
                this.setLandingStatus('当前浏览器不支持 WebSocket 或 WebRTC', 'error');
            } else if (!secure) {
                this.root.querySelector('#online-create').disabled = true;
                this.root.querySelector('#online-join').disabled = true;
                this.setLandingStatus('在线模式需要 HTTPS（localhost 可用于本地调试）', 'error');
            }
        }
        setLandingStatus(text, kind) {
            const el = this.root.querySelector('#online-landing-status');
            if (el) { el.textContent = text || ''; el.className = 'online-status' + (kind ? ' ' + kind : ''); }
        }
        connect(role, reconnect = {}) {
            reconnect = reconnect || {};
            const nickname = reconnect.nickname != null
                ? reconnect.nickname
                : (this.root.querySelector('#online-nickname') || {}).value || '';
            // The signaling endpoint is deployment configuration, not a player
            // setting. This prevents stale localStorage values from sending
            // players to an old Worker or an untrusted endpoint.
            const signalUrl = reconnect.signalUrl || this.defaultSignalUrl();
            let code = reconnect.roomCode != null
                ? String(reconnect.roomCode).trim().toUpperCase()
                : ((this.root.querySelector('#online-room-code') || {}).value || '').trim().toUpperCase();
            const report = (message, kind = 'error') => {
                if (this.root.querySelector('#online-landing-status')) this.setLandingStatus(message, kind);
                else this.setRoomStatus(message, kind);
            };
            if (!nickname.trim()) { report('请先填写昵称'); return; }
            if (role === 'host' && !reconnect.roomCode) code = randomCode();
            if (!/^[A-Z0-9]{4}$/.test(code)) { report('房间码需要 4 位字母或数字'); return; }
            try {
                localStorage.setItem('furry-online-name', nickname.trim());
                localStorage.removeItem('furry-online-signal');
            } catch (_) {}
            if (this.peer) this.peer.close();
            this.role = role; this.roomCode = code; this.nickname = nickname.trim().slice(0, 18);
            this.signalUrl = signalUrl; this.players = []; this.character = null; this.ready = false; this.error = ''; this.match = null; this.state = null;
            // Create the peer before rendering the room.  The previous order
            // called a removed showRoom() method and also tried to register the
            // local player before this.peer existed, so clicking "创建房间"
            // stopped here without opening a WebSocket.
            this.peer = new global.OnlinePeer({ signalUrl, roomCode: code, role, nickname: this.nickname });
            this._ensureOwnPlayer(); this.renderRoom(); this.setRoomStatus('正在连接信令服务…');
            this.peer.on('hello', message => {
                this._reconcileOwnPeerId(message && message.previousPeerId, message && message.peerId);
                this._upsertPlayer({ peerId: message.peerId || this.peer.peerId, role, nickname: this.nickname, character: this.character, ready: this.ready });
                this._dedupePlayers();
                this.setRoomStatus(role === 'host' ? '房间已创建，等待朋友加入' : '已加入房间，等待房主开始'); this.renderRoom();
            });
            this.peer.on('roster', players => { for (const player of players || []) this._upsertPlayer(player); this._ensureOwnPlayer(); this.renderRoom(); });
            this.peer.on('peerJoined', player => { this._upsertPlayer(player); this.setRoomStatus('对手已连接，选择角色并准备'); this.renderRoom(); });
            this.peer.on('peerLeft', player => { if (player && player.peerId) this.players = this.players.filter(item => item.peerId !== player.peerId); this.setRoomStatus('对手已离开房间'); this.renderRoom(); });
            this.peer.on('connectionState', value => {
                this.connectionState = this.peer && this.peer.transportMode === 'relay'
                    ? '信令中继已连接'
                    : (value || '连接中');
                this.renderRoom();
            });
            this.peer.on('transportMode', mode => {
                this.connectionState = mode === 'relay' ? '信令中继已连接' : 'P2P 已连接';
                this.setRoomStatus(mode === 'relay'
                    ? 'P2P 尚未建立，已自动切换信令中继，可以开始对战'
                    : '直连已建立，可以开始对战');
                this.renderRoom();
            });
            this.peer.on('peerDisconnected', reason => {
                const detail = reason ? `对手连接中断（${reason}），正在尝试信令中继` : '对手连接中断，正在尝试信令中继';
                this.connectionState = '对手连接中断';
                this.setRoomStatus(detail, 'error');
                if (this.battleUI) this.battleUI.showError(detail);
                else this.renderRoom();
            });
            this.peer.on('channelClose', () => {
                if (!this.match) return;
                this.connectionState = this.peer && this.peer.ws ? '信令中继连接中' : '连接已断开';
                const detail = this.peer && this.peer.ws ? 'P2P 数据通道已关闭，已切换信令中继' : '数据通道已关闭，请重新连接';
                if (this.battleUI) this.battleUI.showError(detail);
            });
            this.peer.on('channelOpen', () => {
                const relayed = this.peer && this.peer.transportMode === 'relay';
                this.connectionState = relayed ? '信令中继已连接' : 'P2P 已连接';
                this.setRoomStatus(relayed ? '已使用信令中继，可以开始对战' : '直连已建立，可以开始对战');
                this._sendLobbyUpdate();
                this._flushPendingSync();
                this.renderRoom();
            });
            this.peer.on('roomMessage', (payload, from) => this._handleRoomMessage(payload, from));
            this.peer.on('message', payload => this._handlePeerMessage(payload));
            this.peer.on('error', error => {
                this.error = error && error.message ? error.message : '连接失败';
                this.setRoomStatus(this.error, 'error');
                if (this.battleUI) this.battleUI.showError(this.error);
                else this.renderRoom();
            });
            this.peer.on('close', event => {
                if (this.match) return;
                const code = Number(event && event.code) || 0;
                const reason = String(event && event.reason || '').trim();
                const messages = {
                    'room-not-found': '未找到对应房间，请检查房间码',
                    'room-full': '房间已满（最多两名玩家）',
                    'host-exists': '该房间已有房主，请重新创建房间',
                    'message-too-large': '信令消息过大，连接已拒绝'
                };
                const detail = messages[reason] || (code ? `信令连接已关闭（${code}${reason ? ' · ' + reason : ''}）` : '信令连接已关闭');
                this.setRoomStatus(detail, 'error');
            });
            this.peer.connect();
        }
        _ensureOwnPlayer() {
            if (!this.peer) return;
            this._upsertPlayer({ peerId: this.peer.peerId, role: this.role, nickname: this.nickname, character: this.character, ready: this.ready });
            this._dedupePlayers();
        }
        _reconcileOwnPeerId(previousId, currentId) {
            if (!previousId || !currentId || previousId === currentId) return;
            const old = this.players.find(item => item.peerId === previousId);
            if (!old) return;
            const current = this.players.find(item => item.peerId === currentId);
            if (current && current !== old) {
                // Keep the authoritative roster entry while carrying over
                // local UI state that may have been selected before helloAck.
                current.nickname = old.nickname || current.nickname;
                current.character = old.character || current.character;
                current.ready = old.ready || current.ready;
                this.players = this.players.filter(item => item !== old);
            } else {
                old.peerId = currentId;
            }
        }
        _dedupePlayers() {
            const seen = new Set();
            this.players = this.players.filter(player => {
                if (!player || !player.peerId || seen.has(player.peerId)) return false;
                seen.add(player.peerId); return true;
            });
            // A transient local id can survive only until the Worker identity
            // is known. Never render two local entries after reconciliation.
            if (this.peer) {
                let keptOwn = false;
                this.players = this.players.filter(player => {
                    if (player.peerId !== this.peer.peerId) return true;
                    if (keptOwn) return false;
                    keptOwn = true; return true;
                });
            }
        }
        _upsertPlayer(incoming) {
            if (!incoming) return;
            const id = incoming.peerId || incoming.id; if (!id) return;
            const isOwn = this.peer && id === this.peer.peerId;
            let existing = this.players.find(item => item.peerId === id);
            if (!existing) {
                let hash = 0; for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
                existing = { peerId: id, role: incoming.role === 'host' ? 'host' : 'guest', nickname: 'Player', character: null, ready: false, avatar: PLAYER_EMOJIS[hash % PLAYER_EMOJIS.length] };
                this.players.push(existing);
            }
            if (incoming.role) existing.role = incoming.role === 'host' ? 'host' : 'guest';
            if (incoming.nickname) existing.nickname = String(incoming.nickname).slice(0, 18);
            if (!isOwn || incoming.character != null) existing.character = incoming.character || null;
            if (!isOwn || incoming.ready != null) existing.ready = !!incoming.ready;
            if (isOwn) { this.character = existing.character; this.ready = existing.ready; }
        }
        get ownPlayer() { return this.peer && this.players.find(item => item.peerId === this.peer.peerId); }
        get opponentPlayer() { return this.players.find(item => item.peerId !== (this.peer && this.peer.peerId)); }
        setRoomStatus(text, kind) {
            this.roomStatus = text || ''; const el = this.root.querySelector('#online-room-status');
            if (el) { el.textContent = this.roomStatus; el.className = 'online-status' + (kind ? ' ' + kind : ''); }
        }
        renderRoom() {
            if (this.match || this.state) return;
            const own = this.ownPlayer || { nickname: this.nickname, role: this.role, character: this.character, ready: this.ready };
            const opponent = this.opponentPlayer;
            const cards = this.chars().map(ch => '<button class="online-char' + (this.character === ch.name ? ' selected' : '') + '" data-char="' + safeText(ch.name) + '" type="button"><strong>' + safeText(ch.name) + '</strong><small>' + safeText(ch.type || '角色') + ' · HP ' + (Number(ch.hp) || 0) + '</small></button>').join('');
            const playerMarkup = (player, revealCharacter) => player ? '<div class="online-player"><div class="online-player-avatar">' + safeText(player.avatar || (player.nickname || '?').slice(0, 1).toUpperCase()) + '</div><div class="online-player-meta"><strong>' + safeText(player.nickname || 'Player') + (player.role === 'host' ? ' · 房主' : '') + '</strong><small>' + (player.character ? (revealCharacter ? safeText(player.character) : '已选择角色') : '尚未选择角色') + '</small></div><span class="online-ready' + (player.ready ? ' yes' : '') + '">' + (player.ready ? '已准备' : '未准备') + '</span></div>' : '<div class="online-help">等待另一位玩家加入…</div>';
            this.root.innerHTML = '<div class="online-topbar"><div class="online-brand"><div class="online-brand-mark">FT</div><div><div class="online-brand-title">Furry Trial · 在线房间</div><div class="online-brand-sub">' + safeText(this.connectionState || '连接中') + '</div></div></div><a class="online-link" href="../index.html">退出房间</a></div><section class="online-panel online-room"><div class="online-room-head"><div><div class="online-brand-sub">房间码</div><div class="online-room-code"><strong>' + safeText(this.roomCode) + '</strong><button class="online-copy-code" id="online-copy-code" type="button">复制</button></div></div><div class="online-status" id="online-room-status">' + safeText(this.roomStatus || '等待连接') + '</div></div><div class="online-room-grid"><div class="online-roster"><h3>玩家</h3>' + playerMarkup(own, true) + playerMarkup(opponent, false) + '<div class="online-help">房主负责运行战斗引擎；双方的手牌只发送给自己。</div></div><div class="online-select"><h3>选择你的角色</h3><div class="online-chars">' + cards + '</div><div class="online-room-actions"><button class="online-btn ghost" id="online-leave" type="button">离开房间</button><button class="online-btn ghost" id="online-retry" type="button">重试连接</button><button class="online-btn good" id="online-ready" type="button" ' + (this.character ? '' : 'disabled') + '>' + (this.ready ? '取消准备' : '准备') + '</button>' + (this.role === 'host' ? '<button class="online-btn primary" id="online-start-match" type="button">开始对战</button>' : '') + '</div><div class="online-status error" id="online-room-error">' + safeText(this.error) + '</div></div></div></section>';
            this.root.querySelectorAll('[data-char]').forEach(button => button.addEventListener('click', () => { this.character = button.dataset.char; this.ready = false; this._ensureOwnPlayer(); this._sendLobbyUpdate(); this.renderRoom(); }));
            this.root.querySelector('#online-ready').addEventListener('click', () => { if (!this.character) return; this.ready = !this.ready; this._ensureOwnPlayer(); this._sendLobbyUpdate(); this.renderRoom(); });
            this.root.querySelector('#online-leave').addEventListener('click', () => { if (this.peer) this.peer.close(); this.peer = null; this.showLanding(); });
            this.root.querySelector('#online-retry').addEventListener('click', () => this.connect(this.role, {
                nickname: this.nickname, roomCode: this.roomCode, signalUrl: this.signalUrl
            }));
            const start = this.root.querySelector('#online-start-match'); if (start) start.addEventListener('click', () => this.startMatch());
            const copyButton = this.root.querySelector('#online-copy-code'); if (copyButton) copyButton.addEventListener('click', async () => { try { await navigator.clipboard.writeText(this.roomCode); copyButton.textContent = '已复制'; setTimeout(() => { copyButton.textContent = '复制'; }, 1200); } catch (_) { copyButton.textContent = this.roomCode; } });
        }
        _sendLobbyUpdate() {
            if (!this.peer) return;
            this._ensureOwnPlayer();
            const player = { peerId: this.peer.peerId, role: this.role, nickname: this.nickname, character: this.character, ready: this.ready };
            this.peer.sendRoom({ type: 'lobbyUpdate', ...player });
        }
        _handleRoomMessage(payload, from) {
            if (!payload || payload.type !== 'lobbyUpdate') return;
            // The Worker stamps the sender. Ignore a client payload that tries
            // to update another player's lobby record.
            if (from && payload.peerId && payload.peerId !== from) return;
            this._upsertPlayer(payload); this.renderRoom();
        }
        startMatch() {
            if (this.role !== 'host' || !this.peer) return;
            const host = this.players.find(item => item.role === 'host') || this.ownPlayer;
            const guest = this.players.find(item => item.role === 'guest' && item.peerId !== this.peer.peerId) || this.opponentPlayer;
            if (!host || !guest) { this.error = '需要等待另一位玩家加入'; this.renderRoom(); return; }
            if (!host.character || !guest.character || !host.ready || !guest.ready) { this.error = '双方选择角色并准备后才能开始'; this.renderRoom(); return; }
            try {
                const runtime = global.FurryGame && global.FurryGame.CombatRuntime;
                const firstRoll = runtime && typeof runtime.randomInt === 'function' ? runtime.randomInt(12) + 1 : Math.floor(Math.random() * 12) + 1;
                const firstActor = firstRoll <= 6 ? 'host' : 'guest';
                this.match = new global.OnlineMatchHost(host.character, guest.character, firstActor, firstRoll, {
                    hostNickname: host.nickname,
                    guestNickname: guest.nickname
                });
                // Pause both projections until the guest has mounted the same
                // initial private snapshot and acknowledged it.
                this.match.setStarted(false);
                const events = this.match.initialEvents || [];
                const hostState = this.match.project('host');
                this.state = hostState;
                this.battleSession = new global.OnlineHostSession({
                    peer: this.peer,
                    match: this.match,
                    state: hostState,
                    onStateChange: result => {
                        if (result && result.state) this.state = clone(result.state);
                    }
                });
                this._mountSharedBattle(this.battleSession, hostState, events);
                this._matchStartPayload = {
                    kind: 'matchStart',
                    protocolVersion: this.match.protocolVersion,
                    matchId: this.match.matchId,
                    roomCode: this.roomCode,
                    firstActor,
                    guestState: this.match.project('guest'),
                    events: this.match.eventsForViewer ? this.match.eventsForViewer(events, 'guest', 'host') : events
                };
                this._matchStartAcked = false;
                this._matchStartAttempts = 0;
                this._sendMatchStart();
            } catch (error) { this.error = error && error.message ? error.message : String(error); this.match = null; this.state = null; this.renderRoom(); }
        }
        _handlePeerMessage(message) {
            if (!message || typeof message.kind !== 'string') return;
            if (message.kind === 'lobby') {
                // Direct DataChannel payloads have no authenticated `from`.
                // Accept them only when the peer id already belongs to the
                // roster's opponent; authoritative lobby updates arrive via
                // the Worker-stamped roomMessage path.
                const opponent = this.opponentPlayer;
                if (!opponent || !message.player || message.player.peerId !== opponent.peerId) return;
                this._upsertPlayer(message.player); this.renderRoom(); return;
            }
            if (message.kind === 'matchStartAck') {
                if (this.role !== 'host') return;
                if (!this.match || !this.battleSession || !this.match.matchId) return;
                if (message.matchId !== this.match.matchId) return;
                this._matchStartAcked = true;
                this._matchStartPayload = null;
                this._matchStartAttempts = 0;
                if (this._matchStartRetryTimer) clearTimeout(this._matchStartRetryTimer);
                this._matchStartRetryTimer = null;
                if (this.pendingSync && this.pendingSync.kind === 'matchStart') this.pendingSync = null;
                this.match.setStarted(true);
                const hostReady = this.match.project('host');
                const guestReady = this.match.project('guest');
                this.state = hostReady;
                if (this.battleSession) this.battleSession.state = clone(hostReady);
                void this._queueSharedBattleResult({ ok: true, state: hostReady, events: [] }, true);
                this._matchReadyPayload = {
                    kind: 'matchReady', protocolVersion: this.match.protocolVersion,
                    matchId: this.match.matchId, stateVersion: this.match.stateVersion,
                    guestState: guestReady
                };
                this._matchReadyAcked = false;
                this._matchReadyAttempts = 0;
                if (this._matchReadyRetryTimer) clearTimeout(this._matchReadyRetryTimer);
                this._matchReadyRetryTimer = null;
                this._sendMatchReady();
                return;
            }
            if (message.kind === 'matchReadyAck') {
                if (this.role !== 'host' || !this.match || !this.match.matchId) return;
                if (message.matchId !== this.match.matchId) return;
                this._matchReadyAcked = true;
                this._matchReadyPayload = null;
                this._matchReadyAttempts = 0;
                if (this._matchReadyRetryTimer) clearTimeout(this._matchReadyRetryTimer);
                this._matchReadyRetryTimer = null;
                return;
            }
            if (message.kind === 'matchStart') {
                if (this.role !== 'guest') return;
                // Acknowledgement makes the host's initial snapshot reliable.
                // Duplicate packets can arrive while the host retries; once
                // mounted, acknowledge them without rebuilding the UI.
                if (this.match && this.match.remote && this.battleSession) {
                    if (this.peer) this.peer.send({ kind: 'matchStartAck', matchId: message.matchId || null });
                    return;
                }
                this.match = { remote: true };
                const guestState = clone(message.guestState || message.state);
                try {
                    if (message.protocolVersion != null && Number(message.protocolVersion) !== 2) {
                        throw new Error('协议版本不兼容，请刷新页面');
                    }
                    if (!guestState) throw new Error('未收到对战初始状态');
                    if (!message.matchId || !guestState.matchId || message.matchId !== guestState.matchId) {
                        throw new Error('对战房间标识不一致');
                    }
                    this.state = guestState;
                    this.battleSession = new global.OnlineGuestSession({
                        peer: this.peer,
                        state: guestState,
                        onUnsolicitedState: result => this._queueSharedBattleResult(result)
                    });
                    this._mountSharedBattle(this.battleSession, guestState, message.events || []);
                    if (this.peer) this.peer.send({ kind: 'matchStartAck', matchId: message.matchId || null });
                } catch (error) {
                    this.match = null;
                    this.battleSession = null;
                    this.state = null;
                    this.error = error && error.message ? error.message : String(error);
                    this.setRoomStatus('进入对战失败：' + this.error, 'error');
                    this.renderRoom();
                }
                return;
            }
            if (message.kind === 'matchReady') {
                if (this.role !== 'guest' || !this.match || !this.match.remote || !this.battleSession) return;
                if (message.protocolVersion != null && Number(message.protocolVersion) !== 2) return;
                if (!message.matchId || !this.battleSession._matchId || message.matchId !== this.battleSession._matchId) return;
                const result = this.battleSession.receiveState({
                    kind: 'state', protocolVersion: message.protocolVersion,
                    matchId: message.matchId, stateVersion: message.stateVersion,
                    guestState: message.guestState, events: []
                });
                if (result && this.peer) this.peer.send({ kind: 'matchReadyAck', matchId: message.matchId });
                return;
            }
            if (message.kind === 'matchStartFailed') {
                if (message.matchId && this.battleSession && this.battleSession._matchId
                    && message.matchId !== this.battleSession._matchId) return;
                this.error = message.error || '对战初始同步失败';
                if (this.match) this._resetToLobby(false);
                else this.setRoomStatus(this.error, 'error');
                return;
            }
            if (message.kind === 'state') {
                if (this.role === 'guest' && this.battleSession && typeof this.battleSession.receiveState === 'function') {
                    this.battleSession.receiveState(message);
                }
                return;
            }
            if (message.kind === 'lobbyReset') { this._resetToLobby(false); return; }
            if (message.kind === 'returnLobby' && this.role === 'host' && this.state) { this._resetToLobby(true); return; }
            if (message.kind === 'command') {
                if (this.role !== 'host' || !this.battleSession || typeof this.battleSession.handleCommand !== 'function') return;
                const outcome = this.battleSession.handleCommand(message);
                if (outcome && outcome.ok) this._queueSharedBattleResult(outcome);
                else if (outcome && this.battleUI) this.battleUI.showError(outcome.error || '操作未执行');
                return;
            }
            if (message.kind === 'commandError') {
                if (this.battleSession && typeof this.battleSession.receiveCommandError === 'function') {
                    const result = this.battleSession.receiveCommandError(message);
                    if (this.battleUI && (!this.battleSession._pending || !this.battleSession._pending.size)) this.battleUI.showError(result.error);
                } else {
                    this.error = message.error || '操作未执行';
                    this.state = clone(message.state || this.state);
                    if (this.battleUI) this.battleUI.showError(this.error);
                    else this.renderRoom();
                }
            }
        }
        _mountSharedBattle(session, state, events = []) {
            if (!session || !state || !global.GameUI) throw new Error('共享战斗 UI 尚未加载');
            this.battleSession = session;
            this.state = clone(state);
            const ownNickname = (state.onlineNickname || this.nickname || '玩家');
            this.root.innerHTML = '<div class="online-topbar online-battle-topbar"><div class="online-brand"><div class="online-brand-mark">FT</div><div><div class="online-brand-title">Furry Trial · 在线对决</div><div class="online-brand-sub">房间 ' + safeText(this.roomCode) + ' · ' + safeText(this.connectionState || 'P2P') + '</div></div></div><div class="online-battle-player">玩家：' + safeText(ownNickname) + '</div><button class="online-link" id="online-battle-lobby" type="button">返回准备大厅</button></div><section class="online-shared-game" id="online-shared-game"><div id="game-container"><div id="select-screen"></div><div id="game-screen"></div></div></section>';
            const screen = this.root.querySelector('#game-screen');
            this.battleUI = new global.GameUI({ session, root: document });
            if (!document.getElementById('particles-canvas') && typeof this.battleUI._initParticles === 'function') {
                this.battleUI._initParticles();
            }
            this.battleUI.mountBattle(session, clone(state), screen);
            const title = screen && screen.querySelector('.game-title');
            if (title) title.textContent = 'Furry Trial · 在线对决';
            this.battleUI.onBattleExit = () => this.exitBattle();
            this.battleUI.onGameOverClose = () => this.exitBattle();
            const leave = this.root.querySelector('#online-battle-lobby');
            if (leave) leave.addEventListener('click', () => this.exitBattle());

            // The authoritative snapshot already contains the final hand. Hide
            // cards that are represented by opening draw events until their
            // shared animation has finished, matching the local UI behavior.
            const drawCount = who => (events || [])
                .filter(evt => evt && evt.type === 'draw' && evt.who === who)
                .reduce((sum, evt) => sum + (Number(evt.count) || 1), 0);
            const playerDraws = drawCount('player');
            const opponentDraws = drawCount('ai');
            if (playerDraws) this.battleUI._renderPlayerHand({ hideTrailing: playerDraws });
            if (opponentDraws) this.battleUI._renderAIHand({ hideTrailing: opponentDraws });
            if (events && events.length) this._queueSharedBattleResult({ ok: true, state: clone(state), events }, true);
        }

        _queueSharedBattleResult(result, fast = false) {
            if (!this.battleUI || !result) return Promise.resolve();
            const run = async () => {
                if (result.error) {
                    this.battleUI.showError(result.error);
                    return;
                }
                const next = clone(result.state || (this.battleSession && this.battleSession.getState && this.battleSession.getState()));
                if (!next) return;
                this.state = next;
                this.battleUI._prevState = this.battleUI.state;
                this.battleUI.state = next;
                const batch = Array.isArray(result.events) ? result.events : [];
                if (batch.length) await this.battleUI._consumeEvents(batch, { fastFirstBatch: fast });
                this.battleUI.updateDisplay();
                this.state = clone(this.battleUI.state);
            };
            this._battleAnimation = (this._battleAnimation || Promise.resolve()).then(run, run);
            return this._battleAnimation;
        }

        _destroySharedBattle() {
            if (this.battleSession && typeof this.battleSession.close === 'function') this.battleSession.close();
            this.battleSession = null;
            this.battleUI = null;
            this._battleAnimation = Promise.resolve();
        }

        exitBattle() {
            if (!this.match) return;
            if (this.role === 'host') this._resetToLobby(true);
            else if (this.peer) this.peer.send({ kind: 'returnLobby' });
        }

        _sendSync(payload) {
            if (!this.peer) { this.pendingSync = payload; return false; }
            if (this.peer.send(payload)) {
                if (this.pendingSync === payload) this.pendingSync = null;
                return true;
            }
            this.pendingSync = payload;
            return false;
        }
        _flushPendingSync() {
            if (!this.pendingSync || !this.peer) return false;
            const payload = this.pendingSync;
            if (this.peer.send(payload)) {
                this.pendingSync = null;
                return true;
            }
            return false;
        }
        _sendMatchStart() {
            const payload = this._matchStartPayload;
            if (!payload || this._matchStartAcked || !this.peer) return;
            this._sendSync(payload);
            this._matchStartAttempts += 1;
            if (this._matchStartAcked) return;
            if (this._matchStartAttempts >= 12) {
                const matchId = this.match && this.match.matchId;
                if (this.peer) this.peer.send({ kind: 'matchStartFailed', matchId: matchId || null,
                    error: '客机未确认初始状态，对战已取消' });
                this.error = '客机未确认初始状态，对战已取消';
                this._resetToLobby(false);
                return;
            }
            if (this._matchStartRetryTimer) clearTimeout(this._matchStartRetryTimer);
            this._matchStartRetryTimer = setTimeout(() => {
                this._matchStartRetryTimer = null;
                this._sendMatchStart();
            }, 350);
        }
        _sendMatchReady() {
            const payload = this._matchReadyPayload;
            if (!payload || this._matchReadyAcked || !this.peer) return;
            // Send both the explicit barrier packet and a normal state packet.
            // The latter is harmless for an already-mounted guest and allows a
            // late listener to recover if only one packet crosses the relay.
            this.peer.send(payload);
            this.peer.send({
                kind: 'state', protocolVersion: payload.protocolVersion,
                matchId: payload.matchId, stateVersion: payload.stateVersion,
                guestState: payload.guestState, events: []
            });
            this._matchReadyAttempts += 1;
            if (this._matchReadyAcked) return;
            if (this._matchReadyAttempts >= 12) {
                this._matchReadyRetryTimer = null;
                return;
            }
            if (this._matchReadyRetryTimer) clearTimeout(this._matchReadyRetryTimer);
            this._matchReadyRetryTimer = setTimeout(() => {
                this._matchReadyRetryTimer = null;
                this._sendMatchReady();
            }, 350);
        }
        _resetToLobby(notify) {
            if (this._matchStartRetryTimer) clearTimeout(this._matchStartRetryTimer);
            if (this._matchReadyRetryTimer) clearTimeout(this._matchReadyRetryTimer);
            this._matchStartRetryTimer = null;
            this._matchReadyRetryTimer = null;
            this._matchStartPayload = null;
            this._matchStartAcked = false;
            this._matchStartAttempts = 0;
            this._matchReadyPayload = null;
            this._matchReadyAcked = false;
            this._matchReadyAttempts = 0;
            this._destroySharedBattle();
            this.match = null; this.state = null; this.error = ''; this.ready = false;
            this._ensureOwnPlayer(); this._sendLobbyUpdate(); this.renderRoom();
            if (notify && this.peer) this.peer.send({ kind: 'lobbyReset' });
        }
        returnToLobby() {
            if (!this.match || !this.state || this.state.phase !== 'GAME_OVER') return;
            this.exitBattle();
        }
    }
    global.OnlineUI = OnlineUI;
    global.addEventListener('DOMContentLoaded', () => {
        const root = document.getElementById('online-app');
        if (!root) return;
        global.onlineUI = new OnlineUI(root);
        global.addEventListener('beforeunload', () => { if (global.onlineUI && global.onlineUI.peer) global.onlineUI.peer.close(); });
    });
})(window);
