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
    const PROTOCOL_VERSION = 2;
    const COMMANDS = new Set([
        'selectCard', 'playCard', 'defendCard', 'doPlay', 'doDefend', 'doSkipDefend', 'doEndTurn',
        'doEnterDiscard', 'doCancelDiscard', 'doConfirmDiscard',
        'doFiveHeal', 'doFiveDamage', 'doSaikiSixConfirm',
        'resolveAttackModChoice', 'resolveCritChoice', 'chooseTarget',
        'chooseColor', 'choosePurify', 'choosePurifyCrystal',
        'chooseSuperPurifyTarget', 'chooseMozeSeven', 'chooseGuard',
        'chooseFly', 'chooseFlyContinue', 'chooseTrophyDisarm', 'chooseTrophyPurify',
        'doChanSevenKeep', 'doChanSevenDiscard', 'doSaikiThreeKeep',
        'doSaikiThreeDiscard', 'doChanFourSwap', 'doChanFourDiscard',
        'chanFiveReorder'
    ]);
    const makeMatchId = () => {
        if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
        return 'match-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
    };

    function swapKey(value) {
        return value === 'player' ? 'ai' : value === 'ai' ? 'player' : value;
    }

    // Card ids are deliberately derived from the canonical card fields so
    // snapshots created by older clients can still be addressed.  The index
    // sent by the client is only a fast-path hint; the id is checked first so
    // a reordered hand cannot make an atomic action target another card.
    function cardIdentity(card) {
        if (!card) return '';
        return `${card.uid || ''}_${card.color}_${card.value}_${!!card.isBlack}_${!!card.isWhite}_${!!card.potion}_${!!card.magic}_${!!card.greenMagic}_${card.magicColor || ''}_${!!card.purify}_${!!card.superPurify}_${!!card.swapHand}_${!!card.shuffleToDeck}_${!!card.drawTwo}_${!!card.drawThree}_${!!card.trophyWhite}_${card.trophyName || ''}`;
    }

    // Engine events are emitted from the local `player`/`ai` orientation. A
    // guest command temporarily swaps those participants, so event routing
    // fields must be projected for each viewer before the shared UI renders
    // the batch. Human-readable descriptions are intentionally unchanged.
    function projectEvents(events, viewer, source = 'host') {
        if (viewer === source) return clone(events || []);
        const keys = ['who', 'target', 'owner', 'attacker', 'defender', 'fromOwner', 'toOwner', 'attackTarget', 'discardTopOwner'];
        return (events || []).map(event => {
            const projected = clone(event);
            if (!projected || typeof projected !== 'object') return projected;
            if (projected.type === 'playerPlay') projected.type = 'aiPlay';
            else if (projected.type === 'aiPlay') projected.type = 'playerPlay';
            else if (projected.type === 'defend') projected.type = 'aiDefend';
            else if (projected.type === 'aiDefend') projected.type = 'defend';
            for (const key of keys) if (Object.prototype.hasOwnProperty.call(projected, key)) projected[key] = swapKey(projected[key]);
            if (Array.isArray(projected.aoeTargets)) projected.aoeTargets = projected.aoeTargets.map(swapKey);
            return projected;
        });
    }

    function swapParticipants(engine) {
        const state = engine.s;
        [state.player, state.ai] = [state.ai, state.player];
        [engine.h.player, engine.h.ai] = [engine.h.ai, engine.h.player];
        for (const key of ['activeAttacker', 'atkOwner', 'defOwner', 'attackTarget', 'discardTopOwner']) {
            if (state[key] === 'player' || state[key] === 'ai') state[key] = swapKey(state[key]);
        }
        // Attack debuffs are staged by participant key until the defense and
        // damage animation settle.  A guest command runs with player/ai
        // temporarily swapped, so these references must be projected too;
        // otherwise the deferred burn/bleed/poison is restored to the
        // attacker's character instead of the original target.
        if (state.pendingBuffRestore &&
            (state.pendingBuffRestore.target === 'player' || state.pendingBuffRestore.target === 'ai')) {
            state.pendingBuffRestore.target = swapKey(state.pendingBuffRestore.target);
        }
        if (state.attackDebuffSnapshot &&
            (state.attackDebuffSnapshot.owner === 'player' || state.attackDebuffSnapshot.owner === 'ai')) {
            state.attackDebuffSnapshot.owner = swapKey(state.attackDebuffSnapshot.owner);
        }
        if (state.pendingAttack && Array.isArray(state.pendingAttack.aoeTargets)) {
            state.pendingAttack.aoeTargets = state.pendingAttack.aoeTargets.map(swapKey);
        }
        if (state.pendingAttack &&
            (state.pendingAttack.hypothermiaTarget === 'player' || state.pendingAttack.hypothermiaTarget === 'ai')) {
            state.pendingAttack.hypothermiaTarget = swapKey(state.pendingAttack.hypothermiaTarget);
        }
        if (state.serenityHalfTarget === 'player' || state.serenityHalfTarget === 'ai') {
            state.serenityHalfTarget = swapKey(state.serenityHalfTarget);
        }
        if (state.pendingTrophyDisarm && (state.pendingTrophyDisarm.targetKey === 'player' || state.pendingTrophyDisarm.targetKey === 'ai')) {
            state.pendingTrophyDisarm.targetKey = swapKey(state.pendingTrophyDisarm.targetKey);
        }
        if (state.pendingVixrapsPassive && (state.pendingVixrapsPassive.owner === 'player' || state.pendingVixrapsPassive.owner === 'ai')) {
            state.pendingVixrapsPassive.owner = swapKey(state.pendingVixrapsPassive.owner);
        }
    }

    class OnlineMatchHost {
        constructor(hostCharacter, guestCharacter, firstActor = 'host', firstRoll = null, playerInfo = {}) {
            if (typeof global.Engine !== 'function') throw new Error('战斗引擎尚未加载');
            this.engine = new global.Engine();
            this.hostCharacter = String(hostCharacter || '');
            this.guestCharacter = String(guestCharacter || '');
            this.hostEntity = null;
            this.guestEntity = null;
            this.context = 'host';
            // Nicknames are session metadata, not character state. Keep them
            // on the online adapter so every viewer receives the correct
            // player/opponent labels without mutating the shared engine.
            playerInfo = playerInfo || {};
            this.hostNickname = String(playerInfo.hostNickname || hostCharacter || '房主').trim().slice(0, 18) || '房主';
            this.guestNickname = String(playerInfo.guestNickname || guestCharacter || '玩家').trim().slice(0, 18) || '玩家';
            this.hostAvatar = playerInfo.hostAvatar || '';
            this.guestAvatar = playerInfo.guestAvatar || '';
            this.matchId = makeMatchId();
            this.protocolVersion = PROTOCOL_VERSION;
            this.stateVersion = 0;
            // Standalone adapter tests and local callers are already inside a
            // battle. OnlineUI pauses this flag until the guest acknowledges
            // the initial private snapshot.
            this.started = true;
            this._requestCache = new Map();
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
            // Engine.start() initializes the local player. If the first-roll
            // winner is the guest, run that side's opening status/passive once
            // after the absolute actor has been chosen.
            if (firstActor === 'guest') this.engine.turnStart('ai');
            if (Number.isInteger(firstRoll) && firstRoll >= 1 && firstRoll <= 12) {
                this.engine.s.diceRoll = { sides: 12, value: firstRoll, desc: '先手判定' };
                this.engine.emit('diceRoll', '先手判定：' + firstRoll, null, { kind: 'd12', sides: 12, value: firstRoll });
            }
            this.initialEvents = this._drainEvents();
            this.stateVersion = 1;
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
                this.s.hasPlayedThisTurn = false;
                this.s.hasPlayedBlackDefend = false;
                this.s.mayDiscardAfterSkill = false;
                this.s.forcedDiscard = false;
                this.fillHands(true);
                this.turnStart('ai');
                this.s.phase = 'PLAYER_PLAY';
                this.s.busy = false;
                this.s.onlineActor = self._actorFor(this.s.ai);
                this.s.activeAttacker = 'ai';
                this.s.forceEndAITurn = false;
                this.s.pendingAIContinue = null;
                this.s.atkCard = this.s.defCard = null;
                this.s.atkOwner = this.s.defOwner = null;
                this.s.selectedCard = -1;
                this.s.selectedAICard = -1;
                this.s.selectedCards = [];
                return this.check();
            };
            e.aiTurn = function () {
                this.s.phase = 'PLAYER_PLAY';
                this.s.busy = false;
                this.s.onlineActor = self._actorFor(this.s.ai);
                this.s.activeAttacker = 'ai';
                this.s.selectedCard = -1;
                this.s.selectedAICard = -1;
                return this.check();
            };
            e.aiDefend = function (attackCard, damage) {
                const d = Math.max(0, Number(damage) || 0);
                const asleep = !!this.s.ai.sleep;
                const frozen = typeof this._freezeBlocksDefend === 'function'
                    && this._freezeBlocksDefend(this.s.ai, attackCard);
                // Mirror offline aiDefend: sleep / freeze-vs-blue skip defense
                // and settle the full remaining damage immediately.
                if (asleep || frozen) {
                    this.emit('desc', frozen
                        ? (this.name(this.s.ai) + '处于冷冻状态，无法防御蓝色攻击')
                        : (this.name(this.s.ai) + '处于[沉睡]，无法防御'));
                    this.s.selectedCard = -1;
                    this.s.selectedAICard = -1;
                    this.s.unblockDefend = false;
                    this.s.pendingDefenseDamage = d;
                    this.s.onlineActor = self._actorFor(this.s.player);
                    this.s.activeAttacker = 'player';
                    this.deferSettlement('PLAYER_ATTACK', d, 0);
                    return this.check();
                }
                this.s.phase = 'PLAYER_DEFEND';
                this.s.busy = false;
                this.s.onlineActor = self._actorFor(this.s.ai);
                this.s.activeAttacker = 'player';
                this.s.pendingDefenseDamage = d;
                this.s.unblockDefend = false;
                this.s.selectedCard = -1;
                this.s.selectedAICard = -1;
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
                this.s.selectedCard = -1;
                this.s.selectedAICard = -1;
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
                this.s.selectedCard = -1;
                this.s.selectedAICard = -1;
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

        setStarted(value) {
            this.started = value !== false;
            return this.project('host');
        }

        captureSnapshot() {
            if (!this.engine || typeof this.engine.combatSnapshot !== 'function') return null;
            return {
                version: 1,
                matchId: this.matchId,
                stateVersion: this.stateVersion,
                started: this.started !== false,
                hostCharacter: this.hostCharacter,
                guestCharacter: this.guestCharacter,
                hostNickname: this.hostNickname,
                guestNickname: this.guestNickname,
                hostAvatar: this.hostAvatar,
                guestAvatar: this.guestAvatar,
                engine: this.engine.combatSnapshot()
            };
        }

        restoreSnapshot(snapshot) {
            if (!snapshot || snapshot.version !== 1 || !snapshot.engine
                || typeof this.engine.restoreCombatSnapshot !== 'function') {
                throw new Error('无效的联机战斗快照');
            }
            this.engine.restoreCombatSnapshot(snapshot.engine);
            // EngineSnapshot replaces `s` and `h`, so cached entity references
            // must be rebound before the next projection or guest dispatch.
            this.hostEntity = this.engine.s.player;
            this.guestEntity = this.engine.s.ai;
            this.matchId = String(snapshot.matchId || this.matchId);
            this.stateVersion = Math.max(0, Number(snapshot.stateVersion) || 0);
            this.started = snapshot.started !== false;
            if (snapshot.hostCharacter) this.hostCharacter = String(snapshot.hostCharacter);
            if (snapshot.guestCharacter) this.guestCharacter = String(snapshot.guestCharacter);
            if (snapshot.hostNickname) this.hostNickname = String(snapshot.hostNickname);
            if (snapshot.guestNickname) this.guestNickname = String(snapshot.guestNickname);
            if (snapshot.hostAvatar != null) this.hostAvatar = String(snapshot.hostAvatar);
            if (snapshot.guestAvatar != null) this.guestAvatar = String(snapshot.guestAvatar);
            this._requestCache.clear();
            this.context = 'host';
            return this.project('host');
        }

        _cacheKey(actor, requestId) {
            if (requestId === null || requestId === undefined || requestId === '') return null;
            return String(actor) + ':' + String(requestId);
        }

        _rememberRequest(actor, requestId, outcome) {
            const key = this._cacheKey(actor, requestId);
            if (!key) return;
            this._requestCache.set(key, clone(outcome));
            // Keep the cache bounded. A request id is only useful during the
            // current match; old entries must not become an unbounded memory
            // sink in a long-lived browser tab.
            while (this._requestCache.size > 256) {
                const first = this._requestCache.keys().next().value;
                this._requestCache.delete(first);
            }
        }

        _cachedRequest(actor, requestId) {
            const key = this._cacheKey(actor, requestId);
            return key && this._requestCache.has(key) ? clone(this._requestCache.get(key)) : null;
        }

        _reject(actor, requestId, error) {
            const viewer = actor === 'guest' ? 'guest' : 'host';
            const outcome = { ok: false, error, state: this.project(viewer), matchId: this.matchId,
                protocolVersion: this.protocolVersion, stateVersion: this.stateVersion };
            this._rememberRequest(actor, requestId, outcome);
            return outcome;
        }

        _validateCommand(actor, method, params = {}, meta = {}) {
            const s = this.engine.s;
            if (!COMMANDS.has(method)) return '该联机操作不被允许';
            if (!['host', 'guest'].includes(actor)) return '无效的玩家身份';
            if (meta.matchId && meta.matchId !== this.matchId) return '对战房间已切换，请刷新对局';
            if (meta.expectedStateVersion != null
                && Number(meta.expectedStateVersion) !== this.stateVersion) return '操作基于过期状态，请等待同步';
            if (!this.started) return '对战尚未完成同步，请稍候';
            if (!s || s.phase === 'GAME_OVER') return '本局已经结束';

            const index = value => Number.isInteger(Number(value)) && Number(value) >= 0;
            // Before a guest command is dispatched, the engine is still in
            // the host orientation. Resolve the command's own/opponent hand
            // against the requested actor; `_dispatchGuest()` performs the
            // actual temporary swap afterwards.
            const hand = this.engine.h && (actor === 'guest' ? this.engine.h.ai : this.engine.h.player) || [];
            const selected = Number(s.selectedCard);
            if (method === 'selectCard') {
                if (!index(params.index) || Number(params.index) >= hand.length) return '无效的手牌索引';
                if (!['PLAYER_PLAY', 'PLAYER_DEFEND', 'PLAYER_DISCARD', 'PLAYER_FIVE_CHOICE',
                    'PLAYER_SEVEN_CHOICE', 'SAIKI_THREE_CHOICE', 'SAIKI_SIX_JUDGE'].includes(s.phase)) return '当前阶段不能选择手牌';
            }
            if (method === 'doPlay' && (s.phase !== 'PLAYER_PLAY' || selected < 0 || selected >= hand.length)) return '请先选择可出的牌';
            if (method === 'doDefend' && (s.phase !== 'PLAYER_DEFEND' || selected < 0 || selected >= hand.length)) return '请先选择防御牌';
            if (method === 'playCard' || method === 'defendCard') {
                const expectedPhase = method === 'playCard' ? 'PLAYER_PLAY' : 'PLAYER_DEFEND';
                if (s.phase !== expectedPhase) return method === 'playCard' ? '当前不是进攻阶段' : '当前不是防御阶段';
                if (!params || typeof params.cardId !== 'string' || !params.cardId) return '缺少出牌身份';
                const hinted = Number(params.index);
                const hintedCard = Number.isInteger(hinted) && hinted >= 0 && hinted < hand.length ? hand[hinted] : null;
                const indexById = hand.findIndex(card => cardIdentity(card) === params.cardId);
                if (indexById < 0) return '这张牌已不在手牌中，请重新选择';
                if (hintedCard && cardIdentity(hintedCard) !== params.cardId) return '手牌已变化，请重新选择';
                const indexToCheck = hintedCard ? hinted : indexById;
                const card = hand[indexToCheck];
                if (!card || typeof this.engine.legal !== 'function' || !this.engine.legal(card, method === 'defendCard')) {
                    return method === 'playCard' ? '这张牌当前不能出' : '这张牌当前不能防御';
                }
            }
            if (['doDefend', 'defendCard'].includes(method)) {
                const defender = actor === 'guest' ? s.ai : s.player;
                if (defender && defender.sleep) return '沉睡中无法防御';
            }
            if (method === 'doSkipDefend' && s.phase !== 'PLAYER_DEFEND') return '当前不是防御阶段';
            if (method === 'doEndTurn' && s.phase !== 'PLAYER_PLAY') return '当前不能结束回合';
            // The discard button is shown during PLAYER_PLAY and is the
            // transition into PLAYER_DISCARD.  Only cancel/confirm actions
            // require that the discard phase is already active; treating the
            // entry action as a discard-phase action made the online guest
            // receive “当前不在弃牌阶段” even though the button was valid.
            if (method === 'doEnterDiscard' && s.phase !== 'PLAYER_PLAY') return '当前不能进入弃牌阶段';
            if (['doCancelDiscard', 'doConfirmDiscard'].includes(method) && s.phase !== 'PLAYER_DISCARD') return '当前不是弃牌阶段';
            if (['doFiveHeal', 'doFiveDamage'].includes(method) && (s.phase !== 'PLAYER_FIVE_CHOICE' || selected < 0 || selected >= hand.length)) return '当前不能处理 Ryan 5牌';
            if (method === 'doSaikiSixConfirm' && (s.phase !== 'SAIKI_SIX_JUDGE' || selected < 0 || selected >= hand.length || !hand[selected] || !hand[selected].isNumberCard)) return '当前不能处理判定牌';
            if (method === 'resolveAttackModChoice') {
                if (s.phase !== 'ATTACK_MOD_CHOICE') return '当前没有攻击修正选择';
                const bonus = Number(params.bonus || 0);
                if (!Number.isInteger(bonus) || bonus < 0 || bonus > 10) return '无效的攻击修正';
                if (params.unblock != null && typeof params.unblock !== 'boolean') return '无效的攻击修正';
                if (params.evilRoulette != null && typeof params.evilRoulette !== 'boolean') return '无效的攻击修正';
            }
            if (method === 'resolveCritChoice') {
                if (s.phase !== 'CRIT_CHOICE') return '当前没有暴击选择';
                if (typeof params.use !== 'boolean') return '无效的暴击选择';
            }
            if (method === 'chooseTarget') {
                if (s.phase !== 'TARGET_CHOICE') return '当前没有目标选择';
                if (![0, 1].includes(Number(params.target))) return '无效的攻击目标';
            }
            if (method === 'chooseColor') {
                if (!s.needColorChoice || selected < 0 || selected >= hand.length) return '当前没有待指定颜色的牌';
                if (!['RED', 'YELLOW', 'BLUE', 'GREEN'].includes(String(params.color || ''))) return '无效的颜色';
            }
            const purifyKinds = new Set(['burn', 'bleed', 'freeze', 'poison', 'blind', 'bomb', 'guard', 'fly', 'crit', 'lush', 'parasite', 'iceSeal', 'diving', 'hypothermia', 'bind', 'chaos_red', 'chaos_yellow', 'chaos_blue', 'chaos_green']);
            const purifyDone = params && (params.done === true || (params.kind && typeof params.kind === 'object' && params.kind.done === true));
            if (method === 'choosePurify' && (s.pendingDialog !== 'purify' || (!purifyDone && !purifyKinds.has(String(params.kind || ''))))) return '当前没有该净化选择';
            if (method === 'choosePurifyCrystal' && s.pendingDialog !== 'purifyCrystal') return '当前没有水晶球净化选择';
            if (method === 'chooseSuperPurifyTarget' && (s.pendingDialog !== 'superPurify' || !['player', 'ai', 'ai2'].includes(params.target) || !s[params.target] || !s[params.target].alive)) return '当前没有该超级净化目标';
            if (method === 'chooseMozeSeven' && s.pendingDialog !== 'mozeSeven') return '当前没有 Moze 7牌选择';
            if (['chooseGuard', 'chooseFly'].includes(method) && s.pendingDialog !== 'guard') return '当前没有防御选择';
            if (method === 'chooseGuard' && (!Number.isInteger(Number(params.stacks)) || Number(params.stacks) < 0)) return '无效的守护层数';
            if (method === 'chooseFlyContinue' && (s.pendingDialog !== 'flyRetry' || typeof params.again !== 'boolean')) return '当前没有飞翔重试选择';
            if (method === 'chooseTrophyDisarm') {
                if (s.pendingDialog !== 'trophyDisarm') return '当前没有缴械选择';
                if (!s.pendingTrophyDisarm || params.target !== s.pendingTrophyDisarm.targetKey) return '无效的缴械目标';
                const disarmHand = this.engine.h[params.target] || [];
                if (!Number.isInteger(Number(params.index)) || Number(params.index) < 0 || Number(params.index) >= disarmHand.length) return '无效的缴械手牌';
            }
            if (method === 'chooseTrophyPurify') {
                if (s.pendingDialog !== 'trophyPurify') return '当前没有净化之水选择';
                const purifyDoneTrophy = params && (params.done === true || (params.kind && typeof params.kind === 'object' && params.kind.done === true));
                if (purifyDoneTrophy) return null;
                const list = Array.isArray(params.choices) ? params.choices : [params];
                if (!list.length) return '无效的净化选择';
                for (const raw of list) {
                    const kind = typeof raw === 'string' ? raw : (raw && raw.kind);
                    if (!purifyKinds.has(String(kind || ''))) return '无效的净化选择';
                }
            }
            if (['doChanSevenKeep', 'doChanSevenDiscard', 'doChanFourSwap', 'doChanFourDiscard'].includes(method)
                && s.phase !== 'PLAYER_SEVEN_CHOICE') return '当前不是角色选择阶段';
            if (['doSaikiThreeKeep', 'doSaikiThreeDiscard'].includes(method) && s.phase !== 'SAIKI_THREE_CHOICE') return '当前不是 Saiki 选择阶段';
            if (method === 'chanFiveReorder' && (s.phase !== 'CHAN_FIVE_REORDER' || !Array.isArray(s.chanFiveCards))) return '当前没有 Chan 5牌排序';
            return null;
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
                if ((method === 'doPlay' || method === 'doDefend') && params && params.__atomic) {
                    e.s.selectedCard = Number(params.index);
                }
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

        _normalizeAtomicCommand(actor, method, params = {}) {
            if (method !== 'playCard' && method !== 'defendCard') return { method, params };
            const hand = this.engine.h && (actor === 'guest' ? this.engine.h.ai : this.engine.h.player) || [];
            const hinted = Number(params.index);
            const hintedCard = Number.isInteger(hinted) && hinted >= 0 && hinted < hand.length ? hand[hinted] : null;
            const index = hintedCard && cardIdentity(hintedCard) === params.cardId
                ? hinted
                : hand.findIndex(card => cardIdentity(card) === params.cardId);
            if (index < 0) throw new Error('这张牌已不在手牌中，请重新选择');
            return { method: method === 'playCard' ? 'doPlay' : 'doDefend', params: { index, __atomic: true } };
        }

        dispatch(actor, method, params = {}, meta = {}) {
            const requestId = meta && typeof meta === 'object' ? meta.requestId : meta;
            const cached = this._cachedRequest(actor, requestId);
            if (cached) return cached;
            const expected = this._expectedActor();
            if (expected && actor !== expected) {
                return this._reject(actor, requestId, '当前不是你的行动阶段');
            }
            const validationError = this._validateCommand(actor, method, params || {}, meta || {});
            if (validationError) return this._reject(actor, requestId, validationError);
            let raw;
            let events = [];
            try {
                const command = this._normalizeAtomicCommand(actor, method, params || {});
                if (actor === 'guest') raw = this._dispatchGuest(command.method, command.params);
                else {
                    this.context = 'host';
                    this.engine.s.onlineActor = 'host';
                    if ((command.method === 'doPlay' || command.method === 'doDefend') && command.params && command.params.__atomic) {
                        this.engine.s.selectedCard = Number(command.params.index);
                    }
                    raw = command.method === 'chooseMozeSeven' && typeof this.engine.resolveMozeSevenChoice === 'function'
                        ? this.engine.resolveMozeSevenChoice((command.params && command.params.choice) || command.params || {})
                        : this.engine.dispatch(command.method, command.params || {});
                }
            } catch (error) {
                return { ok: false, error: error && error.message ? error.message : String(error), state: this.project(actor) };
            }
            events = actor === 'guest' ? (this._lastGuestEvents || []) : this._drainEvents();
            this._lastGuestEvents = [];
            const state = this.project(actor);
            this.stateVersion += 1;
            state.stateVersion = this.stateVersion;
            state.matchId = this.matchId;
            state.protocolVersion = this.protocolVersion;
            const winner = state.phase === 'GAME_OVER'
                ? (this.engine.s.player.alive ? 'host' : this.engine.s.ai.alive ? 'guest' : null)
                : null;
            const outcome = { ok: true, result: clone(raw), state, events, winner,
                matchId: this.matchId, protocolVersion: this.protocolVersion, stateVersion: this.stateVersion };
            this._rememberRequest(actor, requestId, outcome);
            return clone(outcome);
        }

        eventsForViewer(events, viewer, source = 'host') {
            return projectEvents(events, viewer, source);
        }

        project(viewer = 'host') {
            const e = this.engine;
            const state = F.CombatState && F.CombatState.project
                ? F.CombatState.project(e, { legalHand: e._computeLegalHand ? e._computeLegalHand() : null })
                : clone(e.state());
            state.isOnline = true;
            state.modeId = 'online-1v1';
            state.onlineActor = e.s.onlineActor || 'host';
            state.matchId = this.matchId;
            state.protocolVersion = this.protocolVersion;
            state.stateVersion = this.stateVersion;
            state.onlineRole = viewer === 'guest' ? 'guest' : 'host';
            const viewerRole = viewer === 'guest' ? 'guest' : 'host';
            const opponentRole = viewerRole === 'host' ? 'guest' : 'host';
            const nicknames = { host: this.hostNickname, guest: this.guestNickname };
            state.onlineNickname = nicknames[viewerRole];
            state.onlineOpponentNickname = nicknames[opponentRole];
            state.onlineNicknames = nicknames;
            const avatars = { host: this.hostAvatar, guest: this.guestAvatar };
            state.onlineAvatar = avatars[viewerRole];
            state.onlineOpponentAvatar = avatars[opponentRole];
            state.playerHand = clone(e.h.player || []);
            state.aiHandSize = (e.h.ai || []).length;
            state.aiHand = null;
            // Skill-choice phases use the hand renderer's legality mask as a
            // selection affordance, but Engine.legal() intentionally only
            // answers normal play/defense legality.  Returning a null/false
            // mask here made Saiki 6's judgment cards look disabled online
            // even though the command validator accepted them.  Expose the
            // actual skill predicate for both projections so the same cards
            // are highlighted and selectable on host and guest clients.
            const selectionPhase = e.s.phase;
            if (selectionPhase === 'SAIKI_SIX_JUDGE' || selectionPhase === 'PLAYER_FIVE_CHOICE') {
                state.legalHand = (e.h.player || []).map(card => !!(card && card.isNumberCard));
            }
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
                // The guest's own selection is still meaningful after the
                // participant projection. Only hide the opponent's transient
                // selection from this view.
                if (state.onlineActor !== 'guest') state.selectedAICard = -1;
                // CombatState.project() calculated legalHand from the host's
                // hand. Recalculate against the guest's private hand without
                // mutating engine state so illegal cards stay visibly
                // hoverable but cannot be selected.
                const defending = e.s.phase === 'PLAYER_DEFEND';
                state.legalHand = (e.h.ai || []).map(card => e.legal(card, defending));
                if (selectionPhase === 'SAIKI_SIX_JUDGE' || selectionPhase === 'PLAYER_FIVE_CHOICE') {
                    state.legalHand = (e.h.ai || []).map(card => !!(card && card.isNumberCard));
                }
            }
            state.onlineCanAct = state.onlineActor === viewer;
            if (!this.started) state.onlineCanAct = false;
            // Selection fields are transient UI state, not shared combat
            // state.  Only the active player may see (or act on) the current
            // selection; otherwise a host's selected card appears highlighted
            // in the guest's hand (and vice versa), and stale card-choice
            // actions can collide with the real actor's decision dialog.
            if (!state.onlineCanAct) {
                state.selectedCard = -1;
                state.selectedCards = [];
                state.selectedAICard = -1;
            }
            if (!(state.onlineCanAct && state.phase === 'CHAN_FIVE_REORDER')) state.chanFiveCards = null;
            state.onlineOpponentHandSize = state.aiHandSize;
            return state;
        }
    }

    global.OnlineMatchHost = OnlineMatchHost;
})(window);
