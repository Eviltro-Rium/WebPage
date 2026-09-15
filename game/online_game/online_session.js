/* Online adapters for the shared GameUI.  The host remains authoritative;
 * the guest only submits commands and consumes viewer-specific snapshots. */
(function (global) {
    const Base = global.CombatSession || class {};
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
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
        }

        getState() { return clone(this.state); }

        _broadcast(outcome, requestId = null, source = 'host') {
            if (!this.peer || typeof this.peer.send !== 'function' || !this.match) return;
            const events = this.match && typeof this.match.eventsForViewer === 'function'
                ? this.match.eventsForViewer(outcome.events || [], 'guest', source)
                : clone(outcome.events || []);
            this.peer.send({
                kind: 'state',
                requestId,
                hostState: this.match.project('host'),
                guestState: this.match.project('guest'),
                events,
                winner: outcome.winner || null
            });
        }

        dispatch(method, params = {}) {
            if (!this.match) return Promise.resolve(resultWithState({ ok: false, error: '联机战斗尚未开始' }, this.getState()));
            let outcome;
            try { outcome = this.match.dispatch('host', method, params || {}); }
            catch (error) { return Promise.resolve(resultWithState({ ok: false, error: error.message || String(error) }, this.getState())); }
            if (outcome && outcome.state) this.state = clone(outcome.state);
            if (outcome && outcome.ok) this._broadcast(outcome, null, 'host');
            const result = resultWithState(outcome, this.state);
            if (this.onStateChange) this.onStateChange(result);
            return Promise.resolve(result);
        }

        handleCommand(message) {
            if (!this.match || !message) return;
            let outcome;
            try { outcome = this.match.dispatch('guest', message.method, message.params || {}); }
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
                    error: outcome && outcome.error || '操作未执行',
                    state: this.match.project('guest')
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
    }

    class OnlineGuestSession extends Base {
        constructor({ peer, state, onUnsolicitedState } = {}) {
            super();
            this.peer = peer || null;
            this.state = clone(state || null);
            this._requestId = 0;
            this._pending = new Map();
            this._onUnsolicitedState = typeof onUnsolicitedState === 'function' ? onUnsolicitedState : null;
        }

        getState() { return clone(this.state); }

        dispatch(method, params = {}) {
            if (!this.peer || typeof this.peer.send !== 'function') return Promise.resolve(resultWithState({ ok: false, error: 'P2P 尚未连接' }, this.getState()));
            const requestId = ++this._requestId;
            return new Promise(resolve => {
                this._pending.set(requestId, resolve);
                if (!this.peer.send({ kind: 'command', requestId, method, params: params || {} })) {
                    this._pending.delete(requestId);
                    resolve(resultWithState({ ok: false, error: 'P2P 尚未连接' }, this.getState()));
                }
            });
        }

        _resolve(requestId, result) {
            const id = Number(requestId);
            const resolve = Number.isFinite(id) ? this._pending.get(id) : null;
            if (resolve) {
                this._pending.delete(id);
                resolve(result);
                return true;
            }
            return false;
        }

        receiveState(message) {
            if (!message) return;
            const state = message.guestState || message.state;
            if (state) this.state = clone(state);
            const result = resultWithState({ ok: true, events: clone(message.events || []), winner: message.winner || null }, this.state);
            if (!this._resolve(message.requestId, result) && this._onUnsolicitedState) this._onUnsolicitedState(result);
            return result;
        }

        receiveCommandError(message) {
            const result = resultWithState({ ok: false, error: message && message.error || '操作未执行', events: [] }, clone(message && message.state || this.state));
            if (result.state) this.state = clone(result.state);
            if (!this._resolve(message && message.requestId, result) && this._onUnsolicitedState) this._onUnsolicitedState(result);
            return result;
        }

        acknowledgeEvents() { return Promise.resolve({ ok: true }); }

        close() {
            for (const resolve of this._pending.values()) resolve({ ok: false, error: '联机连接已关闭', state: this.getState() });
            this._pending.clear();
        }
    }

    global.OnlineHostSession = OnlineHostSession;
    global.OnlineGuestSession = OnlineGuestSession;
})(window);
