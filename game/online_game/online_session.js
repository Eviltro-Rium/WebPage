/* Online adapters for the shared GameUI.  The host remains authoritative;
 * the guest only submits commands and consumes viewer-specific snapshots. */
(function (global) {
    const Base = global.CombatSession || class {};
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const PROTOCOL_VERSION = 2;
    const REQUEST_TIMEOUT = 12000;
    const REQUEST_RETRY_DELAY = 1800;
    const resultWithState = (outcome, state) => {
        const snapshot = clone(state || (outcome && outcome.state) || null) || {};
        return Object.assign({}, snapshot, outcome || {}, { state: snapshot });
    };

    class OnlineHostSession extends Base {
        constructor(options = {}) {
            super();
            const { peer, match, state, onStateChange } = options;
            this.peer = peer || null;
            this.match = match || null;
            this.state = clone(state || (match && match.project('host')));
            this.onStateChange = typeof onStateChange === 'function' ? onStateChange : null;
            this._requestId = 0;
            this._pendingBroadcast = null;
            this._broadcastRetryTimer = null;
        }

        getState() { return clone(this.state); }

        _broadcast(outcome, requestId = null, source = 'host') {
            if (!this.peer || typeof this.peer.send !== 'function' || !this.match) return;
            const events = this.match && typeof this.match.eventsForViewer === 'function'
                ? this.match.eventsForViewer(outcome.events || [], 'guest', source)
                : clone(outcome.events || []);
            const packet = {
                kind: 'state',
                protocolVersion: this.match.protocolVersion || PROTOCOL_VERSION,
                matchId: this.match.matchId,
                stateVersion: this.match.stateVersion,
                requestId,
                guestState: this.match.project('guest'),
                events,
                winner: outcome.winner || null
            };
            if (this.peer.send(packet) !== false) {
                this._pendingBroadcast = null;
                if (this._broadcastRetryTimer) clearTimeout(this._broadcastRetryTimer);
                this._broadcastRetryTimer = null;
            } else {
                // Keep only the newest authoritative snapshot. A retry is
                // safe because requestId/stateVersion make duplicate packets
                // idempotent on the guest.
                this._pendingBroadcast = packet;
                if (!this._broadcastRetryTimer) {
                    this._broadcastRetryTimer = setTimeout(() => {
                        this._broadcastRetryTimer = null;
                        const pending = this._pendingBroadcast;
                        this._pendingBroadcast = null;
                        if (pending && this.peer && this.peer.send(pending) === false) {
                            this._pendingBroadcast = pending;
                            this._broadcastRetryTimer = setTimeout(() => {
                                this._broadcastRetryTimer = null;
                                this._broadcast(outcome, requestId, source);
                            }, 350);
                        }
                    }, 120);
                }
            }
        }

        dispatch(method, params = {}) {
            if (!this.match) return Promise.resolve(resultWithState({ ok: false, error: '联机战斗尚未开始' }, this.getState()));
            let outcome;
            const requestId = ++this._requestId;
            try { outcome = this.match.dispatch('host', method, params || {}, { requestId }); }
            catch (error) { return Promise.resolve(resultWithState({ ok: false, error: error.message || String(error) }, this.getState())); }
            if (outcome && outcome.state) this.state = clone(outcome.state);
            if (outcome && outcome.ok) this._broadcast(outcome, null, 'host');
            const result = resultWithState(outcome, this.state);
            if (this.onStateChange) this.onStateChange(result);
            return Promise.resolve(result);
        }

        handleCommand(message) {
            if (!this.match || !message) return;
            if (Number(message.protocolVersion) !== (this.match.protocolVersion || PROTOCOL_VERSION)) {
                if (this.peer && typeof this.peer.send === 'function') this.peer.send({ kind: 'commandError', requestId: message.requestId || null,
                    protocolVersion: this.match.protocolVersion || PROTOCOL_VERSION, matchId: this.match.matchId,
                    stateVersion: this.match.stateVersion, error: '协议版本不兼容，请刷新页面', guestState: this.match.project('guest') });
                return;
            }
            if (message.matchId !== this.match.matchId) {
                if (this.peer && typeof this.peer.send === 'function') this.peer.send({ kind: 'commandError', requestId: message.requestId || null,
                    protocolVersion: this.match.protocolVersion || PROTOCOL_VERSION, matchId: this.match.matchId,
                    stateVersion: this.match.stateVersion, error: '对战房间标识不一致', guestState: this.match.project('guest') });
                return;
            }
            if (message.requestId == null) {
                if (this.peer && typeof this.peer.send === 'function') this.peer.send({ kind: 'commandError', requestId: null,
                    protocolVersion: this.match.protocolVersion || PROTOCOL_VERSION, matchId: this.match.matchId,
                    stateVersion: this.match.stateVersion, error: '缺少请求编号', guestState: this.match.project('guest') });
                return;
            }
            let outcome;
            try {
                outcome = this.match.dispatch('guest', message.method, message.params || {}, {
                    requestId: message.requestId,
                    matchId: message.matchId,
                    expectedStateVersion: message.expectedStateVersion
                });
            }
            catch (error) { outcome = { ok: false, error: error.message || String(error), state: this.getState() }; }
            if (outcome && outcome.ok) {
                // match.dispatch('guest', ...) returns the guest projection;
                // the host's local view must remain the host projection.
                this.state = clone(this.match.project('host'));
                this._broadcast(outcome, message.requestId || null, 'guest');
            } else if (this.peer && typeof this.peer.send === 'function') {
                this.peer.send({
                    kind: 'commandError',
                    requestId: message.requestId || null,
                    protocolVersion: this.match.protocolVersion || PROTOCOL_VERSION,
                    matchId: this.match.matchId,
                    stateVersion: this.match.stateVersion,
                    error: outcome && outcome.error || '操作未执行',
                    guestState: this.match.project('guest')
                });
            }
            // Errors are projected for the guest on the wire, but the host UI
            // must keep rendering its own participant orientation.
            const localState = outcome && outcome.ok
                ? this.state
                : (this.match && typeof this.match.project === 'function' ? this.match.project('host') : this.state);
            const localOutcome = resultWithState(
                outcome && outcome.ok && this.match && typeof this.match.eventsForViewer === 'function'
                    ? Object.assign({}, outcome, { events: this.match.eventsForViewer(outcome.events || [], 'host', 'guest') })
                    : outcome,
                localState
            );
            if (this.onStateChange) this.onStateChange(localOutcome);
            return localOutcome;
        }

        acknowledgeEvents() { return Promise.resolve({ ok: true }); }

        close() {
            if (this._broadcastRetryTimer) clearTimeout(this._broadcastRetryTimer);
            this._broadcastRetryTimer = null;
            this._pendingBroadcast = null;
        }
    }

    class OnlineGuestSession extends Base {
        constructor({ peer, state, onUnsolicitedState } = {}) {
            super();
            this.peer = peer || null;
            this.state = clone(state || null);
            // A refreshed guest must not reuse request ids still cached by the host.
            this._requestStorageKey = 'furry-online-guest-request-id';
            let previousId = 0;
            try { previousId = Number(global.sessionStorage && global.sessionStorage.getItem(this._requestStorageKey)) || 0; } catch (_) {}
            this._requestId = Math.max(previousId, Date.now() * 1000);
            this._pending = new Map();
            this._onUnsolicitedState = typeof onUnsolicitedState === 'function' ? onUnsolicitedState : null;
            this._protocolVersion = Number(this.state && this.state.protocolVersion) || PROTOCOL_VERSION;
            this._matchId = this.state && this.state.matchId || null;
            this._stateVersion = Number(this.state && this.state.stateVersion) || 0;
            this.metrics = { sent: 0, retried: 0, completed: 0, failed: 0, rttMs: [], lastRttMs: 0 };
        }

        getState() { return clone(this.state); }

        dispatch(method, params = {}) {
            if (!this.peer || typeof this.peer.send !== 'function') return Promise.resolve(resultWithState({ ok: false, error: 'P2P 尚未连接' }, this.getState()));
            if (this._pending.size) return Promise.resolve(resultWithState({ ok: false, error: '正在同步上一次操作，请稍候' }, this.getState()));
            const requestId = ++this._requestId;
            try { if (global.sessionStorage) global.sessionStorage.setItem(this._requestStorageKey, String(requestId)); } catch (_) {}
            return new Promise(resolve => {
                const payload = { kind: 'command', protocolVersion: this._protocolVersion,
                    matchId: this._matchId, expectedStateVersion: this._stateVersion,
                    requestId, method, params: params || {} };
                const startedAt = typeof performance !== 'undefined' && performance.now
                    ? performance.now() : Date.now();
                const retry = () => {
                    const pending = this._pending.get(requestId);
                    if (!pending) return;
                    pending.attempts += 1;
                    this.metrics.retried += 1;
                    try {
                        if (!this.peer.send(payload)) return;
                    } catch (_) { return; }
                    pending.retryTimer = setTimeout(retry, REQUEST_RETRY_DELAY);
                };
                const timer = setTimeout(() => {
                    const pending = this._pending.get(requestId);
                    if (!pending) return;
                    this._pending.delete(requestId);
                    if (pending.retryTimer) clearTimeout(pending.retryTimer);
                    this.metrics.failed += 1;
                    pending.resolve(resultWithState({ ok: false, error: '主机响应超时，请检查连接后重试' }, this.getState()));
                }, REQUEST_TIMEOUT);
                this._pending.set(requestId, { resolve, timer, retryTimer: null, attempts: 0, startedAt });
                this.metrics.sent += 1;
                if (!this.peer.send(payload)) {
                    clearTimeout(timer);
                    this._pending.delete(requestId);
                    this.metrics.failed += 1;
                    resolve(resultWithState({ ok: false, error: 'P2P 尚未连接' }, this.getState()));
                    return;
                }
                this._pending.get(requestId).retryTimer = setTimeout(retry, REQUEST_RETRY_DELAY);
            });
        }

        _resolve(requestId, result) {
            const id = Number(requestId);
            const pending = Number.isFinite(id) ? this._pending.get(id) : null;
            if (pending) {
                this._pending.delete(id);
                clearTimeout(pending.timer);
                if (pending.retryTimer) clearTimeout(pending.retryTimer);
                const now = typeof performance !== 'undefined' && performance.now
                    ? performance.now() : Date.now();
                const elapsed = Math.max(0, now - pending.startedAt);
                this.metrics.completed += 1;
                this.metrics.lastRttMs = elapsed;
                this.metrics.rttMs.push(elapsed);
                if (this.metrics.rttMs.length > 64) this.metrics.rttMs.shift();
                pending.resolve(result);
                return true;
            }
            return false;
        }

        receiveState(message) {
            if (!message) return;
            if (Number(message.protocolVersion) !== this._protocolVersion) return;
            if (this._matchId && message.matchId !== this._matchId) return;
            const incomingVersion = Number(message.stateVersion != null
                ? message.stateVersion
                : (message.guestState && message.guestState.stateVersion));
            if (Number.isFinite(incomingVersion) && incomingVersion < this._stateVersion) return;
            const state = message.guestState || message.state;
            if (state) {
                this.state = clone(state);
                this._stateVersion = Number.isFinite(incomingVersion) ? incomingVersion : this._stateVersion;
                this._matchId = this.state.matchId || this._matchId;
            }
            const result = resultWithState({ ok: true, events: clone(message.events || []), winner: message.winner || null }, this.state);
            if (!this._resolve(message.requestId, result) && this._onUnsolicitedState) this._onUnsolicitedState(result);
            return result;
        }

        receiveCommandError(message) {
            if (!message || Number(message.protocolVersion) !== this._protocolVersion) return;
            if (this._matchId && message.matchId !== this._matchId) return;
            const errorVersion = Number(message && message.stateVersion);
            if (Number.isFinite(errorVersion) && errorVersion < this._stateVersion) return;
            const errorState = message && (message.guestState || message.state) || this.state;
            const result = resultWithState({ ok: false, error: message && message.error || '操作未执行', events: [] }, clone(errorState));
            if (result.state) {
                this.state = clone(message && (message.guestState || message.state) || result.state);
                if (Number.isFinite(errorVersion)) this._stateVersion = errorVersion;
            }
            if (!this._resolve(message && message.requestId, result) && this._onUnsolicitedState) this._onUnsolicitedState(result);
            return result;
        }

        acknowledgeEvents() { return Promise.resolve({ ok: true }); }

        getDiagnostics() {
            const values = this.metrics.rttMs.slice().sort((a, b) => a - b);
            const percentile = p => values.length ? values[Math.min(values.length - 1, Math.floor(values.length * p))] : 0;
            return { pending: this._pending.size, stateVersion: this._stateVersion,
                sent: this.metrics.sent, retried: this.metrics.retried,
                completed: this.metrics.completed, failed: this.metrics.failed,
                lastRttMs: Math.round(this.metrics.lastRttMs),
                rttP50Ms: Math.round(percentile(0.5)), rttP95Ms: Math.round(percentile(0.95)) };
        }

        close() {
            for (const pending of this._pending.values()) {
                clearTimeout(pending.timer);
                if (pending.retryTimer) clearTimeout(pending.retryTimer);
                pending.resolve({ ok: false, error: '联机连接已关闭', state: this.getState() });
            }
            this._pending.clear();
        }
    }

    global.OnlineHostSession = OnlineHostSession;
    global.OnlineGuestSession = OnlineGuestSession;
})(window);
