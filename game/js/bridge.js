class Bridge {
    static _mode = null;

    static async _detectMode() {
        if (this._mode !== null) return this._mode;
        try {
            const resp = await fetch('/api/state', { signal: AbortSignal.timeout(2000) });
            if (resp.ok) { this._mode = 'http'; return 'http'; }
        } catch (e) {}
        if (window.furryBattle) { this._mode = 'local'; return 'local'; }
        this._mode = 'http';
        return 'http';
    }

    static async call(method, params) {
        try {
            const mode = await this._detectMode();
            if (mode === 'http') {
                const path = '/api/' + method;
                const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
                if (params && Object.keys(params).length > 0) {
                    opts.body = JSON.stringify(params);
                }
                const resp = await fetch(path, opts);
                return await resp.json();
            }
            await Promise.resolve();
            return window.furryBattle.dispatch(method, params || {});
        } catch (e) {
            console.error('[Bridge] Error:', method, e);
            return { error: e.message };
        }
    }

    static async getState() {
        try {
            const mode = await this._detectMode();
            if (mode === 'http') {
                const resp = await fetch('/api/state');
                return await resp.json();
            }
            return window.furryBattle.getState();
        } catch (e) {
            console.error('[Bridge] getState error:', e);
            return null;
        }
    }
}
