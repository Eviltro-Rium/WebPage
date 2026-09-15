/*
 * Transport-neutral combat session boundary.
 *
 * GameUI talks to this interface instead of knowing whether the state comes
 * from Bridge, a host Engine, or a remote peer.  Sessions return the same
 * result shape as the local bridge: { ok, state, events, error }.
 */
(function (global) {
    const F = global.FurryGame || (global.FurryGame = {});
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

    class CombatSession {
        constructor() {
            this._listeners = new Set();
            this.state = null;
        }

        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            this._listeners.add(listener);
            return () => this._listeners.delete(listener);
        }

        onStateChange(listener) { return this.subscribe(listener); }

        _publish(result) {
            if (result && result.state) this.state = clone(result.state);
            for (const listener of this._listeners) {
                try { listener(result); } catch (error) { console.error('[CombatSession] listener failed', error); }
            }
            return result;
        }

        async start() { return { ok: true, state: await this.getState(), events: [] }; }
        async getState() { return this.state ? clone(this.state) : null; }
        async dispatch() { throw new Error('CombatSession.dispatch() is not implemented'); }
        async acknowledgeEvents() { return { ok: true }; }
        close() {}
    }

    class LocalCombatSession extends CombatSession {
        constructor(bridge = global.Bridge) {
            super();
            this.bridge = bridge;
        }

        async getState() {
            if (!this.bridge || typeof this.bridge.getState !== 'function') return super.getState();
            const state = await this.bridge.getState();
            if (state && !state.error) this.state = clone(state);
            return state;
        }

        async dispatch(method, params = {}) {
            if (!this.bridge || typeof this.bridge.call !== 'function') {
                return { ok: false, error: '本地战斗接口不可用', state: await this.getState() };
            }
            const result = await this.bridge.call(method, params || {});
            if (result && !result.error) return this._publish(result);
            return result;
        }

        async acknowledgeEvents(throughId) {
            if (!this.bridge || typeof this.bridge.call !== 'function') return { ok: true };
            return this.bridge.call('clearEvents', { throughId });
        }
    }

    F.CombatSession = CombatSession;
    F.LocalCombatSession = LocalCombatSession;
    global.CombatSession = CombatSession;
    global.LocalCombatSession = LocalCombatSession;
})(window);
