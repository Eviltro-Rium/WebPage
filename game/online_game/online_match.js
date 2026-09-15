/* Online battle adapter.
 *
 * The host owns the real Engine instance.  A guest sends the same dispatch
 * commands as the single-player UI; for that call only, player/AI references
 * are swapped so the existing character skills, card effects, status registry
 * and invariant checks remain the single source of truth.  No game logic is
 * duplicated in the transport layer.
 */
(function (global) {
    const F = global.FurryGame || {};
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

    function swapKey(value) {
        return value === 'player' ? 'ai' : value === 'ai' ? 'player' : value;
    }

    function swapParticipants(engine) {
        const state = engine.s;
        [state.player, state.ai] = [state.ai, state.player];
        [engine.h.player, engine.h.ai] = [engine.h.ai, engine.h.player];
        for (const key of ['activeAttacker', 'atkOwner', 'defOwner', 'attackTarget', 'discardTopOwner']) {
            if (state[key] === 'player' || state[key] === 'ai') state[key] = swapKey(state[key]);
        }
        if (state.pendingAttack && Array.isArray(state.pendingAttack.aoeTargets)) {
            state.pendingAttack.aoeTargets = state.pendingAttack.aoeTargets.map(swapKey);
        }
        if (state.pendingTrophyDisarm && (state.pendingTrophyDisarm.targetKey === 'player' || state.pendingTrophyDisarm.targetKey === 'ai')) {
            state.pendingTrophyDisarm.targetKey = swapKey(state.pendingTrophyDisarm.targetKey);
        }
    }

    class OnlineMatchHost {
        constructor(hostCharacter, guestCharacter, firstActor = 'host', firstRoll = null) {
            if (typeof global.Engine !== 'function') throw new Error('战斗引擎尚未加载');
            this.engine = new global.Engine();
            this.hostEntity = null;
            this.guestEntity = null;
            this.context = 'host';
            this._installHooks();
            this.engine.start(hostCharacter, guestCharacter);
            this.hostEntity = this.engine.s.player;
            this.guestEntity = this.engine.s.ai;
            this.engine.s.modeId = 'online-1v1';
            this.engine.s.isOnline = true;
            this.engine.s.onlineActor = firstActor === 'guest' ? 'guest' : 'host';
            this.engine.s.activeAttacker = firstActor === 'guest' ? 'ai' : 'player';
            this.engine.s.phase = 'PLAYER_PLAY';
            this.engine.s.busy = false;
            if (Number.isInteger(firstRoll) && firstRoll >= 1 && firstRoll <= 12) {
                this.engine.s.diceRoll = { sides: 12, value: firstRoll, desc: '先手判定' };
                this.engine.emit('diceRoll', '先手判定：' + firstRoll, null, { kind: 'd12', sides: 12, value: firstRoll });
            }
            this.initialEvents = this._drainEvents();
        }

        _actorFor(entity) {
            if (entity === this.guestEntity) return 'guest';
            return 'host';
        }

        _installHooks() {
            const e = this.engine;
            const self = this;
            // Online state is pushed immediately.  A later timer would run
            // after guest references had been restored, so the adapter makes
            // engine transitions synchronous; the UI still animates them.
            e.later = function (fn) {
                if (typeof fn === 'function') fn();
                return 0;
            };
            e.startAITurn = function () {
                this.fillHands(true);
                this.s.phase = 'PLAYER_PLAY';
                this.s.busy = false;
                this.s.onlineActor = self._actorFor(this.s.ai);
                this.s.activeAttacker = 'ai';
                this.s.forceEndAITurn = false;
                this.s.pendingAIContinue = null;
                this.s.atkCard = this.s.defCard = null;
                this.s.atkOwner = this.s.defOwner = null;
                this.s.selectedCards = [];
                return this.check();
            };
            e.aiTurn = function () {
                this.s.phase = 'PLAYER_PLAY';
                this.s.busy = false;
                this.s.onlineActor = self._actorFor(this.s.ai);
                this.s.activeAttacker = 'ai';
                return this.check();
            };
            e.aiDefend = function (attackCard, damage) {
                this.s.phase = 'PLAYER_DEFEND';
                this.s.busy = false;
                this.s.onlineActor = self._actorFor(this.s.ai);
                this.s.activeAttacker = 'player';
                this.s.pendingDefenseDamage = Math.max(0, Number(damage) || 0);
                this.s.unblockDefend = false;
                return this.check();
            };
            e.continueAIAttack = function () {
                if (!this.s.player.alive || !this.s.ai.alive) return this.check();
                this.s.phase = 'PLAYER_PLAY';
                this.s.busy = false;
                this.s.onlineActor = self._actorFor(this.s.ai);
                this.s.activeAttacker = 'ai';
                this.s.pendingAttack = null;
                this.s.pendingDefenseDamage = 0;
                this.s.atkCard = this.s.defCard = null;
                this.s.atkOwner = this.s.defOwner = null;
                this.s.revealCards = [];
                return this.check();
            };
            e.endAi = function () {
                this.s.turn++;
                this.s.phase = 'PLAYER_PLAY';
                this.s.busy = false;
                this.s.onlineActor = self._actorFor(this.s.player);
                this.s.activeAttacker = 'player';
                this.s.pendingAttack = null;
                this.s.atkCard = this.s.defCard = null;
                this.s.atkOwner = this.s.defOwner = null;
                this.s.revealCards = [];
                this.s.hasPlayedThisTurn = false;
                this.fillHands(false);
                this.turnStart('player');
                return this.check();
            };
            const baseAfterAttack = e.afterAttack.bind(e);
            e.afterAttack = function () {
                const result = baseAfterAttack();
                this.s.onlineActor = self._actorFor(this.s.player);
                this.s.activeAttacker = 'player';
                return result;
            };
        }

        _expectedActor() {
            if (!this.engine.s || this.engine.s.phase === 'GAME_OVER') return null;
            return this.engine.s.onlineActor || 'host';
        }

        _drainEvents() {
            const e = this.engine;
            const out = [];
            let guard = 0;
            while (e.events && e.events.length && guard++ < 24) {
                const batch = e.events.slice().map(item => clone(item));
                out.push(...batch);
                const ids = batch.map(item => Number(item.id) || 0);
                const through = ids.length ? Math.max(...ids) : e.ver;
                const before = e.events.length;
                try { e.acknowledgeEvents(through); } catch (error) { console.warn('[online events]', error); }
                // Older turn-machine builds may leave an event untouched when
                // there is no pending settlement.  Never resend it forever.
                if (e.events.length >= before) e.events = e.events.filter(item => (Number(item.id) || 0) > through);
            }
            return out;
        }

        _normalizeGuestPhase(phase, actor) {
            const e = this.engine;
            // The swapped engine calls phases from the guest's perspective;
            // hooks already attach the absolute actor, so only convert the
            // two AI-only transition phases back to their public equivalents.
            if (phase === 'AI_DEFEND') e.s.phase = 'PLAYER_DEFEND';
            else if (phase === 'AI_TURN') e.s.phase = 'PLAYER_PLAY';
            else e.s.phase = phase;
            e.s.onlineActor = actor || e.s.onlineActor || 'guest';
            e.s.busy = false;
        }

        _dispatchGuest(method, params) {
            const e = this.engine;
            this.context = 'guest';
            swapParticipants(e);
            // Engine methods always operate on local `player`; the guest is
            // local for this dispatch only.
            e.s.onlineActor = 'guest';
            let result;
            let events = [];
            try {
                result = method === 'chooseMozeSeven' && typeof e.resolveMozeSevenChoice === 'function'
                    ? e.resolveMozeSevenChoice((params && params.choice) || params || {})
                    : e.dispatch(method, params || {});
                // Settle event-gated damage while the guest is still the
                // engine's local player. Restoring references first would
                // make the legacy AI_ATTACK settlement target the wrong side.
                events = this._drainEvents();
                return result;
            } finally {
                const phase = e.s.phase;
                const actor = e.s.onlineActor;
                swapParticipants(e);
                this._normalizeGuestPhase(phase, actor);
                this._lastGuestEvents = events;
                this.context = 'host';
            }
        }

        dispatch(actor, method, params = {}) {
            const expected = this._expectedActor();
            if (expected && actor !== expected) {
                return { ok: false, error: '当前不是你的行动阶段', state: this.project(actor) };
            }
            let raw;
            let events = [];
            try {
                if (actor === 'guest') raw = this._dispatchGuest(method, params);
                else {
                    this.context = 'host';
                    this.engine.s.onlineActor = 'host';
                    raw = method === 'chooseMozeSeven' && typeof this.engine.resolveMozeSevenChoice === 'function'
                        ? this.engine.resolveMozeSevenChoice((params && params.choice) || params || {})
                        : this.engine.dispatch(method, params || {});
                }
            } catch (error) {
                return { ok: false, error: error && error.message ? error.message : String(error), state: this.project(actor) };
            }
            events = actor === 'guest' ? (this._lastGuestEvents || []) : this._drainEvents();
            this._lastGuestEvents = [];
            const state = this.project(actor);
            const winner = state.phase === 'GAME_OVER'
                ? (this.engine.s.player.alive ? 'host' : this.engine.s.ai.alive ? 'guest' : null)
                : null;
            return { ok: true, result: clone(raw), state, events, winner };
        }

        project(viewer = 'host') {
            const e = this.engine;
            const state = F.CombatState && F.CombatState.project
                ? F.CombatState.project(e, { legalHand: e._computeLegalHand ? e._computeLegalHand() : null })
                : clone(e.state());
            state.isOnline = true;
            state.modeId = 'online-1v1';
            state.onlineActor = e.s.onlineActor || 'host';
            state.onlineRole = viewer === 'guest' ? 'guest' : 'host';
            state.playerHand = clone(e.h.player || []);
            state.aiHandSize = (e.h.ai || []).length;
            state.aiHand = null;
            if (viewer === 'guest') {
                const player = state.player;
                state.player = state.ai;
                state.ai = player;
                state.playerHand = clone(e.h.ai || []);
                state.aiHandSize = (e.h.player || []).length;
                state.aiHand = null;
                for (const key of ['activeAttacker', 'atkOwner', 'defOwner', 'attackTarget', 'discardTopOwner']) {
                    if (state[key] === 'player' || state[key] === 'ai') state[key] = swapKey(state[key]);
                }
                state.selectedAICard = -1;
                // CombatState.project() calculated legalHand from the host's
                // hand. Recalculate against the guest's private hand without
                // mutating engine state so illegal cards stay visibly
                // hoverable but cannot be selected.
                const defending = e.s.phase === 'PLAYER_DEFEND';
                state.legalHand = (e.h.ai || []).map(card => e.legal(card, defending));
            }
            state.onlineCanAct = state.onlineActor === viewer;
            state.onlineOpponentHandSize = state.aiHandSize;
            return state;
        }
    }

    global.OnlineMatchHost = OnlineMatchHost;
})(window);
