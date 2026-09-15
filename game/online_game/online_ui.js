/* Lobby and battle view for the online MVP. It speaks the same dispatch
 * vocabulary as GameUI so the online adapter never duplicates card rules. */
(function (global) {
    const COLORS = ['RED', 'YELLOW', 'BLUE', 'GREEN'];
    const COLOR_LABEL = { RED: '红', YELLOW: '黄', BLUE: '蓝', GREEN: '绿' };
    const PHASE_LABEL = {
        PLAYER_PLAY: '出牌阶段', PLAYER_DEFEND: '防御阶段', PLAYER_DISCARD: '弃牌阶段',
        PLAYER_FIVE_CHOICE: '选择技能分支', PLAYER_SEVEN_CHOICE: '选择牌', SAIKI_SIX_JUDGE: '数字判定',
        SAIKI_THREE_CHOICE: '选择判定牌', ATTACK_MOD_CHOICE: '攻击修正', CRIT_CHOICE: '暴击选择',
        CHAN_FIVE_REORDER: '整理牌库', OPPONENT_CARD_CHOICE: '选择对手手牌', GUARD_CHOICE: '伤害规避',
        TROPHY_DISARM_CHOICE: '缴械选择', GAME_OVER: '对战结束'
    };
    const STATUS_LABEL = [
        ['burn', '灼烧'], ['bleed', '流血'], ['poison', '中毒'], ['frozen', '冷冻'], ['blind', '致盲'],
        ['bomb', '炸弹'], ['hypothermia', '失温'], ['guard', '守护'], ['fly', '飞翔'], ['lush', '茂盛'],
        ['crit', '暴击'], ['diving', '潜水'], ['iceSeal', '冰封']
    ];
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
            this.ready = false; this.match = null; this.state = null; this.logs = [];
            this.error = ''; this.pendingSync = null; this.requestSeq = 0; this.connectionState = '未连接'; this.roomStatus = '';
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
                '<section class="online-panel online-landing"><div class="online-intro"><h1>与你的朋友<br><span>面对面出牌</span></h1><p>建立一个小型房间，使用浏览器原生 WebRTC 直接传输战斗指令。房主运行单机同一套战斗引擎，双方只交换必要的同步状态。</p><div class="online-notice"><div><b>01</b><span>不需要安装客户端，分享 4 位房间码即可加入。</span></div><div><b>02</b><span>当前版本仅使用 STUN，不配置 TURN，适合小规模测试。</span></div><div><b>03</b><span>请使用 HTTPS 域名；本地调试可用 Wrangler Dev。</span></div></div></div>' +
                '<form class="online-form" id="online-connect-form"><h2>进入在线房间</h2><label class="online-label">昵称<input class="online-input" id="online-nickname" maxlength="18" placeholder="例如：Rium" autocomplete="nickname"></label><label class="online-label">信令地址<input class="online-input" id="online-signal" spellcheck="false"></label><div class="online-form-row"><button class="online-btn primary" id="online-create" type="button">创建房间</button><button class="online-btn" id="online-join" type="button">加入房间</button></div><label class="online-label">房间码（加入时填写）<input class="online-input" id="online-room-code" maxlength="4" placeholder="ABCD" autocapitalize="characters"></label><div class="online-status" id="online-landing-status"></div><div class="online-help">信令地址示例：<code>https://你的域名/online-signal</code>。输入 http/https 也可以，连接时会自动转换为 ws/wss。</div></form></section>';
            const signal = this.root.querySelector('#online-signal'), name = this.root.querySelector('#online-nickname');
            if (signal) signal.value = this.defaultSignalUrl();
            if (name) name.value = localStorage.getItem('furry-online-name') || '';
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
        connect(role) {
            const nickname = (this.root.querySelector('#online-nickname') || {}).value || '';
            const signalUrl = (this.root.querySelector('#online-signal') || {}).value || this.defaultSignalUrl();
            let code = ((this.root.querySelector('#online-room-code') || {}).value || '').trim().toUpperCase();
            if (!nickname.trim()) { this.setLandingStatus('请先填写昵称', 'error'); return; }
            if (role === 'host') code = randomCode();
            if (!/^[A-Z0-9]{4}$/.test(code)) { this.setLandingStatus('房间码需要 4 位字母或数字', 'error'); return; }
            localStorage.setItem('furry-online-name', nickname.trim());
            if (this.peer) this.peer.close();
            this.role = role; this.roomCode = code; this.nickname = nickname.trim().slice(0, 18);
            this.signalUrl = signalUrl; this.players = []; this.character = null; this.ready = false; this.error = ''; this.match = null; this.state = null;
            // Create the peer before rendering the room.  The previous order
            // called a removed showRoom() method and also tried to register the
            // local player before this.peer existed, so clicking "创建房间"
            // stopped here without opening a WebSocket.
            this.peer = new global.OnlinePeer({ signalUrl, roomCode: code, role, nickname: this.nickname });
            this._ensureOwnPlayer(); this.renderRoom(); this.setRoomStatus('正在连接信令服务…');
            this.peer.on('hello', message => { this._upsertPlayer({ peerId: message.peerId || this.peer.peerId, role, nickname: this.nickname, character: this.character, ready: this.ready }); this.setRoomStatus(role === 'host' ? '房间已创建，等待朋友加入' : '已加入房间，等待房主开始'); this.renderRoom(); });
            this.peer.on('roster', players => { for (const player of players || []) this._upsertPlayer(player); this._ensureOwnPlayer(); this.renderRoom(); });
            this.peer.on('peerJoined', player => { this._upsertPlayer(player); this.setRoomStatus('对手已连接，选择角色并准备'); this.renderRoom(); });
            this.peer.on('peerLeft', player => { if (player && player.peerId) this.players = this.players.filter(item => item.peerId !== player.peerId); this.setRoomStatus('对手已离开房间'); this.renderRoom(); });
            this.peer.on('connectionState', value => { this.connectionState = value || '连接中'; this.renderRoom(); });
            this.peer.on('channelOpen', () => { this.connectionState = 'P2P 已连接'; this.setRoomStatus('直连已建立，可以开始对战'); this._sendLobbyUpdate(); if (this.pendingSync) { const payload = this.pendingSync; this.pendingSync = null; this.peer.send(payload); } this.renderRoom(); });
            this.peer.on('roomMessage', payload => this._handleRoomMessage(payload));
            this.peer.on('message', payload => this._handlePeerMessage(payload));
            this.peer.on('error', error => { this.error = error && error.message ? error.message : '连接失败'; this.setRoomStatus(this.error, 'error'); if (this.state) this.renderBattle([]); else this.renderRoom(); });
            this.peer.on('close', event => { if (!this.match) this.setRoomStatus(event && event.reason === 'room-not-found' ? '未找到对应房间，请检查房间码' : '信令连接已关闭', 'error'); });
            this.peer.connect();
        }
        _ensureOwnPlayer() {
            if (!this.peer) return;
            this._upsertPlayer({ peerId: this.peer.peerId, role: this.role, nickname: this.nickname, character: this.character, ready: this.ready });
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
            this.root.querySelector('#online-retry').addEventListener('click', () => this.connect(this.role));
            const start = this.root.querySelector('#online-start-match'); if (start) start.addEventListener('click', () => this.startMatch());
            const copyButton = this.root.querySelector('#online-copy-code'); if (copyButton) copyButton.addEventListener('click', async () => { try { await navigator.clipboard.writeText(this.roomCode); copyButton.textContent = '已复制'; setTimeout(() => { copyButton.textContent = '复制'; }, 1200); } catch (_) { copyButton.textContent = this.roomCode; } });
        }
        _sendLobbyUpdate() {
            if (!this.peer) return;
            this._ensureOwnPlayer();
            const player = { peerId: this.peer.peerId, role: this.role, nickname: this.nickname, character: this.character, ready: this.ready };
            this.peer.sendRoom({ type: 'lobbyUpdate', ...player });
            if (this.peer.channel && this.peer.channel.readyState === 'open') this.peer.send({ kind: 'lobby', player });
        }
        _handleRoomMessage(payload) { if (payload && payload.type === 'lobbyUpdate') { this._upsertPlayer(payload); this.renderRoom(); } }
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
                this.match = new global.OnlineMatchHost(host.character, guest.character, firstActor, firstRoll);
                const events = this.match.initialEvents || []; this.logs = events.map(item => item.desc).filter(Boolean);
                this.state = this.match.project('host'); this.renderBattle(events);
                this._sendSync({ kind: 'matchStart', roomCode: this.roomCode, firstActor, hostState: this.match.project('host'), guestState: this.match.project('guest'), events });
            } catch (error) { this.error = error && error.message ? error.message : String(error); this.match = null; this.state = null; this.renderRoom(); }
        }
        _handlePeerMessage(message) {
            if (!message || typeof message.kind !== 'string') return;
            if (message.kind === 'lobby') { this._upsertPlayer(message.player); this.renderRoom(); return; }
            if (message.kind === 'matchStart') { this.match = { remote: true }; this.state = clone(message.guestState || message.state); this.logs = (message.events || []).map(item => item.desc).filter(Boolean); this.renderBattle(message.events || []); return; }
            if (message.kind === 'state') { this.state = clone(this.role === 'guest' ? message.guestState : message.hostState); const events = Array.isArray(message.events) ? message.events : []; this._appendEvents(events); this.renderBattle(events); return; }
            if (message.kind === 'lobbyReset') { this._resetToLobby(false); return; }
            if (message.kind === 'returnLobby' && this.role === 'host' && this.state && this.state.phase === 'GAME_OVER') { this._resetToLobby(true); return; }
            if (message.kind === 'command') {
                if (this.role !== 'host' || !this.match || this.match.remote) return;
                const outcome = this.match.dispatch('guest', message.method, message.params || {});
                if (!outcome.ok) { this.peer.send({ kind: 'commandError', error: outcome.error, state: this.match.project('guest') }); return; }
                this._appendEvents(outcome.events || []); this.state = this.match.project('host'); this.renderBattle(outcome.events || []);
                this._sendSync({ kind: 'state', hostState: this.match.project('host'), guestState: this.match.project('guest'), events: outcome.events || [], winner: outcome.winner || null });
            }
            if (message.kind === 'commandError') { this.error = message.error || '操作未执行'; this.state = clone(message.state || this.state); this.renderBattle([]); }
        }
        _appendEvents(events) {
            for (const item of events || []) if (item && item.desc) this.logs.push(String(item.desc));
            if (this.logs.length > 80) this.logs.splice(0, this.logs.length - 80);
        }
        _sendSync(payload) { if (!this.peer || !this.peer.send(payload)) this.pendingSync = payload; }
        _resetToLobby(notify) {
            this.match = null; this.state = null; this.logs = []; this.error = ''; this.ready = false;
            this._ensureOwnPlayer(); this._sendLobbyUpdate(); this.renderRoom();
            if (notify && this.peer) this.peer.send({ kind: 'lobbyReset' });
        }
        returnToLobby() {
            if (!this.match || !this.state || this.state.phase !== 'GAME_OVER') return;
            if (this.role === 'host') this._resetToLobby(true);
            else if (this.peer) this.peer.send({ kind: 'returnLobby' });
        }
        command(method, params) {
            params = params || {};
            if (!this.state || this.state.onlineActor !== this.role) return;
            this.error = '';
            if (this.role === 'guest') { if (!this.peer || !this.peer.send({ kind: 'command', requestId: ++this.requestSeq, method, params })) { this.error = 'P2P 尚未连接'; this.renderBattle([]); } return; }
            if (!this.match || this.match.remote) return;
            const outcome = this.match.dispatch('host', method, params);
            if (!outcome.ok) { this.error = outcome.error || '操作未执行'; this.state = outcome.state || this.state; this.renderBattle([]); return; }
            this.state = this.match.project('host'); this._appendEvents(outcome.events || []); this.renderBattle(outcome.events || []);
            this._sendSync({ kind: 'state', hostState: this.match.project('host'), guestState: this.match.project('guest'), events: outcome.events || [], winner: outcome.winner || null });
        }
        playSelected(index, mode) {
            if (!this.state || this.state.onlineActor !== this.role) return;
            const selected = Number(this.state.selectedCard), method = mode === 'defend' ? 'doDefend' : 'doPlay';
            if (selected !== index) {
                if (this.role === 'host') {
                    if (!this.match) return;
                    const first = this.match.dispatch('host', 'selectCard', { index });
                    if (!first.ok) { this.error = first.error; this.renderBattle([]); return; }
                    this.state = this.match.project('host'); this.command(method);
                } else {
                    this.peer.send({ kind: 'command', requestId: ++this.requestSeq, method: 'selectCard', params: { index } });
                    this.peer.send({ kind: 'command', requestId: ++this.requestSeq, method, params: {} });
                }
            } else this.command(method);
        }
        renderCard(container, card, index, selected, npc, legal) {
            if (!container || !card) return;
            const button = document.createElement('button'); button.type = 'button'; button.className = 'online-card' + (selected ? ' selected' : '') + (!legal ? ' is-illegal' : '');
            button.title = this.cardDescription(card); button.setAttribute('aria-label', button.title);
            const canvas = global.renderCard ? global.renderCard(card, 65, 91, selected, { isNpc: !!npc }) : null;
            if (canvas) button.appendChild(canvas); else button.textContent = card.isNumberCard ? String(card.value) : this.cardDescription(card);
            button.addEventListener('click', () => { if (!legal && this.state.phase !== 'PLAYER_DISCARD') return; this.command('selectCard', { index }); });
            button.addEventListener('dblclick', event => { event.preventDefault(); if (!legal || this.state.phase === 'PLAYER_DISCARD') return; this.playSelected(index, this.state.phase === 'PLAYER_DEFEND' ? 'defend' : 'play'); });
            container.appendChild(button);
        }
        cardDescription(card) {
            if (!card) return '';
            if (card.trophyWhite) return (card.trophyName || '战利白卡') + ' · 打出后抽1张牌';
            if (card.isNumberCard) return (COLOR_LABEL[card.color] || '') + card.value;
            if (card.magicColor === 'purple' || card.magic) return '紫魔法 · 恢复生命并清除对手正面状态';
            if (card.magicColor === 'green' || card.greenMagic) return '绿魔法 · 恢复生命并清除自身负面状态';
            if (card.potion) return '药剂 · 恢复生命'; if (card.superPurify) return '超级净化 · 清除目标全部状态';
            if (card.purify) return '净化 · 清除一层状态'; if (card.drawThree) return '抽三张牌'; if (card.drawTwo) return '抽两张牌';
            if (card.swapHand) return '交换手牌'; if (card.shuffleToDeck) return '洗回弃牌库';
            return card.isBlack ? '黑牌 · 指定颜色' : card.isWhite ? '白牌 · 自动指定颜色' : '道具牌';
        }
        statuses(character) {
            if (!character) return '';
            return STATUS_LABEL.map(([key, label]) => { const value = key === 'frozen' || key === 'diving' ? (character[key] ? 1 : 0) : Number(character[key] || 0); return value > 0 ? label + (value > 1 ? value : '') : ''; }).filter(Boolean).join(' · ') || '无状态';
        }
        combatantMarkup(entity, local, percent) {
            entity = entity || {}; const name = safeText(entity.name ? entity.name.replace(/^AI\\d*\\s+/, '') : local ? '玩家' : '对手');
            return '<div class="online-combatant' + (local ? ' local' : '') + '"><div class="online-combatant-name"><span>' + name + '</span><span>' + (Number(entity.hp) || 0) + '/' + (Number(entity.maxHp) || 0) + '</span></div><div class="online-hp"><i class="' + (percent < 35 ? 'low' : '') + '" style="width:' + percent + '%"></i></div><div class="online-statuses">' + safeText(this.statuses(entity)) + '</div></div>';
        }
        renderBattle(events) {
            const s = this.state; if (!s) return;
            const localCanAct = s.onlineActor === this.role && s.phase !== 'GAME_OVER', me = s.player || {}, opponent = s.ai || {};
            const hp = entity => Math.max(0, Math.min(100, Number(entity.maxHp) ? Number(entity.hp) * 100 / Number(entity.maxHp) : 0));
            const phase = localCanAct ? (PHASE_LABEL[s.phase] || s.phase) : s.phase === 'GAME_OVER' ? '对战结束' : '等待对手行动';
            const deckCount = Number(s.deck || 0), discardCount = Number(s.discardBottomCount != null ? s.discardBottomCount : Math.max(0, Number(s.discard || 0) - 1));
            this.root.innerHTML = '<div class="online-topbar"><div class="online-brand"><div class="online-brand-mark">FT</div><div><div class="online-brand-title">Furry Trial · 在线对决</div><div class="online-brand-sub">房间 ' + safeText(this.roomCode) + ' · ' + safeText(this.connectionState || 'P2P') + '</div></div></div><a class="online-link" href="../index.html">退出房间</a></div><section class="online-panel online-battle"><div class="online-battle-head"><div><div class="online-battle-title">' + safeText(me.name || '玩家') + ' <span style="color:#94a3b8;font-weight:500">vs</span> ' + safeText(opponent.name || '对手') + '</div><div class="online-phase">' + safeText(phase) + ' · 回合 ' + (Number(s.turn) || 1) + '</div></div><div class="online-status">' + (localCanAct ? '可以行动' : '同步中') + '</div></div><div class="online-combatants">' + this.combatantMarkup(me, true, hp(me)) + this.combatantMarkup(opponent, false, hp(opponent)) + '</div><div class="online-table"><div class="online-pile"><div class="online-pile-card">' + deckCount + '</div><span>共享牌库</span></div><div class="online-turn-arrow">↔</div><div class="online-pile"><div class="online-pile-card top">' + (s.discardTop && s.discardTop.isNumberCard ? safeText(s.discardTop.value) : 'FT') + '</div><span>弃牌顶 · ' + discardCount + '</span></div></div><div class="online-zone"><div class="online-zone-title">进攻 / 防御</div><div class="online-zone-cards" id="online-zones"></div></div><div class="online-zone"><div class="online-zone-title">对手手牌 · ' + (Number(s.aiHandSize) || 0) + '</div><div class="online-hand" id="online-opponent-hand"></div></div><div class="online-zone"><div class="online-zone-title">你的手牌 · ' + ((s.playerHand || []).length) + '</div><div class="online-hand" id="online-player-hand"></div></div><div class="online-controls" id="online-controls"></div><div class="online-dialog" id="online-dialog"></div>' + (this.error ? '<div class="online-error">' + safeText(this.error) + '</div>' : '') + '<div class="online-log" id="online-log"></div></section>';
            const zones = this.root.querySelector('#online-zones');
            [s.atkCard, s.defCard].concat(s.revealCards || []).filter(Boolean).forEach(card => {
                const wrap = document.createElement('div');
                wrap.className = 'online-card'; wrap.title = this.cardDescription(card);
                if (global.renderCard) wrap.appendChild(global.renderCard(card, 65, 91, false, { isNpc: false }));
                else wrap.textContent = this.cardDescription(card);
                zones.appendChild(wrap);
            });
            const hand = this.root.querySelector('#online-player-hand'), legal = Array.isArray(s.legalHand) ? s.legalHand : null;
            (s.playerHand || []).forEach((card, index) => this.renderCard(hand, card, index, Number(s.selectedCard) === index, false, legal ? !!legal[index] : true));
            const oppHand = this.root.querySelector('#online-opponent-hand');
            for (let i = 0; i < (Number(s.aiHandSize) || 0); i++) { const back = document.createElement('div'); back.className = 'online-card back'; back.appendChild(global.renderCardBack ? global.renderCardBack(65, 91) : document.createTextNode('')); oppHand.appendChild(back); }
            const log = this.root.querySelector('#online-log'); log.innerHTML = this.logs.slice(-34).map(item => '<div>' + safeText(item) + '</div>').join(''); log.scrollTop = log.scrollHeight;
            this.renderControls(localCanAct);
        }
        renderControls(canAct) {
            const s = this.state, controls = this.root.querySelector('#online-controls'), dialog = this.root.querySelector('#online-dialog'); if (!controls || !dialog) return;
            const add = (label, fn, cls) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'online-btn ' + (cls || ''); button.textContent = label; button.disabled = !canAct; button.addEventListener('click', fn); controls.appendChild(button); };
            if (canAct && s.phase === 'PLAYER_PLAY') { add('出牌', () => this.command('doPlay'), 'primary'); add('结束回合', () => this.command('doEndTurn')); add('进入弃牌', () => this.command('doEnterDiscard')); }
            if (canAct && s.phase === 'PLAYER_DEFEND') { add('防御', () => this.command('doDefend'), 'primary'); add('跳过防御', () => this.command('doSkipDefend')); }
            if (canAct && s.phase === 'PLAYER_DISCARD') { add('确认弃牌', () => this.command('doConfirmDiscard'), 'primary'); add('取消', () => this.command('doCancelDiscard')); }
            if (s.phase === 'GAME_OVER') {
                dialog.innerHTML = '<span class="online-phase">' + (s.player && s.player.alive ? '你获胜了' : '对手获胜') + '。</span><button class="online-btn primary" id="online-return-lobby" type="button">返回准备大厅</button>';
                const returnButton = dialog.querySelector('#online-return-lobby');
                if (returnButton) returnButton.addEventListener('click', () => this.returnToLobby());
            }
            this.renderDialog(dialog, canAct);
        }
        dialogButton(container, label, fn, canAct, cls) { const button = document.createElement('button'); button.type = 'button'; button.className = 'online-btn ' + (cls || ''); button.textContent = label; button.disabled = !canAct; button.addEventListener('click', fn); container.appendChild(button); }
        renderDialog(container, canAct) {
            const s = this.state; if (!container || !canAct) return;
            if (s.needColorChoice || s.pendingDialog === 'color') { COLORS.forEach(color => this.dialogButton(container, COLOR_LABEL[color], () => this.command('chooseColor', { color }), true, 'primary')); return; }
            if (s.pendingDialog === 'purify') { const keys = STATUS_LABEL.filter(([key]) => !['guard', 'fly', 'crit'].includes(key)).filter(([key]) => s.player && (key === 'frozen' || key === 'diving' ? s.player[key] : Number(s.player[key] || 0)) > 0); (keys.length ? keys : [['burn', '状态']]).forEach(([key, label]) => this.dialogButton(container, label, () => this.command('choosePurify', { kind: key }), true, 'primary')); return; }
            if (s.pendingDialog === 'superPurify') { this.dialogButton(container, '清除自己', () => this.command('chooseSuperPurifyTarget', { target: 'player' }), true, 'primary'); if (s.ai && s.ai.alive) this.dialogButton(container, '清除对手', () => this.command('chooseSuperPurifyTarget', { target: 'ai' }), true); return; }
            if (s.pendingDialog === 'mozeSeven') { this.dialogButton(container, '清除自身负面状态', () => this.command('chooseMozeSeven', { choice: { target: 'player' } }), true, 'primary'); if (s.ai && s.ai.alive) this.dialogButton(container, '清除对手正面状态', () => this.command('chooseMozeSeven', { choice: { target: 'ai' } }), true); return; }
            if (s.phase === 'GUARD_CHOICE') { if (s.pendingDialog === 'flyRetry') { this.dialogButton(container, '继续尝试飞翔', () => this.command('chooseFlyContinue', { again: true }), true, 'primary'); this.dialogButton(container, '改用守护', () => this.command('chooseFlyContinue', { again: false }), true); return; } const max = Math.min(Number(s.player && s.player.guard) || 0, Number(s.pendingGuardDamage) || 0); for (let i = max; i >= 0; i--) this.dialogButton(container, i ? '消耗 ' + i + ' 层守护' : '不使用守护', () => this.command('chooseGuard', { stacks: i }), true, i ? 'primary' : ''); return; }
            if (s.pendingDialog === 'trophyDisarm') { const count = Number(s.aiHandSize) || 0; for (let i = 0; i < count; i++) this.dialogButton(container, '弃掉对手第 ' + (i + 1) + ' 张牌', () => this.command('chooseTrophyDisarm', { target: 'ai', index: i }), true, 'primary'); return; }
            if (s.phase === 'OPPONENT_CARD_CHOICE') { const count = Number(s.aiHandSize) || 0; for (let i = 0; i < count; i++) this.dialogButton(container, '选择对手第 ' + (i + 1) + ' 张牌', () => this.command('chooseAICard', { index: i }), true, Number(s.selectedAICard) === i ? 'primary' : ''); this.dialogButton(container, '确认选择', () => this.command('doOpponentCardConfirm'), true, 'primary'); return; }
            if (s.phase === 'PLAYER_FIVE_CHOICE') { this.dialogButton(container, '恢复', () => this.command('doFiveHeal'), true, 'primary'); this.dialogButton(container, '进攻', () => this.command('doFiveDamage'), true); return; }
            if (s.phase === 'SAIKI_SIX_JUDGE') { this.dialogButton(container, '确认判定牌', () => this.command('doSaikiSixConfirm'), true, 'primary'); return; }
            if (s.phase === 'CRIT_CHOICE') { this.dialogButton(container, '使用暴击（不可防御）', () => this.command('resolveCritChoice', { use: true }), true, 'primary'); this.dialogButton(container, '不使用', () => this.command('resolveCritChoice', { use: false })); return; }
            if (s.phase === 'ATTACK_MOD_CHOICE') { this.dialogButton(container, '正常结算', () => this.command('resolveAttackModChoice', { bonus: 0 }), true, 'primary'); this.dialogButton(container, '不可防御', () => this.command('resolveAttackModChoice', { unblock: true, bonus: 0 })); return; }
            if (s.phase === 'CHAN_FIVE_REORDER') { this.dialogButton(container, '按当前顺序放回牌库', () => this.command('chanFiveReorder', { order: (s.chanFiveCards || []).map((_, i) => i).join(',') }), true, 'primary'); return; }
            if (s.chanFourSwapMode) { this.dialogButton(container, '交换选中的手牌', () => this.command('doChanFourSwap'), true, 'primary'); this.dialogButton(container, '弃掉判定牌', () => this.command('doChanFourDiscard')); return; }
            if (s.chanSevenKeepMode) { this.dialogButton(container, '保留判定牌', () => this.command('doChanSevenKeep'), true, 'primary'); this.dialogButton(container, '弃掉判定牌', () => this.command('doChanSevenDiscard')); return; }
            if (s.saikiThreeDrawn) { this.dialogButton(container, '保留判定牌', () => this.command('doSaikiThreeKeep'), true, 'primary'); this.dialogButton(container, '弃掉判定牌', () => this.command('doSaikiThreeDiscard')); }
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
