/* Event playback and event queue coordination for the classic UI. */
(function (global) {
    const GameUI = global.GameUI;
    if (!GameUI) {
        console.error('[UI events] GameUI must be loaded first');
        return;
    }
    const eventNamespace = global.FurryGame && global.FurryGame.CombatEvents || {};
    const EVENT_TYPES = eventNamespace.Types || { HIT: 'hit' };
    const DAMAGE_KINDS = eventNamespace.DamageKinds || { NORMAL: 'normal', BLEED: 'bleed', POISON: 'poison', DRAIN: 'drain' };

    // 扣血/回血飘字统一格式：[效果]🗡️n / [效果]❤️n；普通伤害/恢复不带前缀。
    const damageFloat = (amount, tag = '', suffix = '') => (tag ? '[' + tag + ']' : '') + '🗡️' + amount + suffix;
    const HEAL_TAGS = { drain: '吸血', passive: '被动', lush: '茂盛', wake: '苏醒', rest: '休憩' };
    const healFloat = (evt) => {
        const amt = Math.max(0, Number(evt && evt.amount) || 0);
        if (!(amt > 0)) return (evt && evt.desc) || '';
        const tag = evt.healTag || HEAL_TAGS[evt.kind] || '';
        return (tag ? '[' + tag + ']' : '') + '❤️' + amt;
    };
    const scorchKeep = (evt) => !!(evt && (evt.scorch || /炙热\]?不消退/.test(String(evt.desc || ''))));

    Object.assign(GameUI.prototype, {
_handAdditionCount(evt, who) {
    if (!evt) return 0;
    if (evt.type === 'draw' && evt.who === who) return Math.max(0, Number(evt.count) || 1);
    if (evt.type === 'trophyDrop' && who === 'player') {
        const drops = evt.drops || evt.card && evt.card.drops;
        return Array.isArray(drops) ? drops.length : 0;
    }
    return 0;
},
_trophyResultText(evt) {
    const drops = Array.isArray(evt.drops) ? evt.drops : [];
    const registry = global.AdventureRegistry;
    const names = drops.map(name => {
        const def = registry && registry.getItem(name);
        return '[' + String(def && def.displayName || name).replace(/战利白卡$/, '') + ']';
    });
    const progress = evt.rollCount > 1 ? '第' + evt.rollIndex + '/' + evt.rollCount + '次 · ' : '';
    const face = Number.isFinite(Number(evt.roll)) ? '投出' + evt.roll + '，' : '';
    return progress + face + (names.length ? '获得' + names.join('、') : Array.isArray(evt.drops) ? '无收获' : '等待确认骰面');
},
_missingAIPlay(previous, current) {
    if (!previous || !current || current.events && current.events.length) return null;
    const owner = current.atkOwner === 'ai2' ? 'ai2' : current.atkOwner === 'ai' ? 'ai' : null;
    if (!owner || !current.atkCard) return null;
    const phaseTransition = previous.phase === 'AI_TURN' && current.phase === 'PLAYER_DEFEND';
    const sizeKey = owner === 'ai2' ? 'ai2HandSize' : 'aiHandSize';
    const handShrank = Number.isFinite(Number(previous[sizeKey])) && Number.isFinite(Number(current[sizeKey]))
        && Number(current[sizeKey]) < Number(previous[sizeKey]);
    return phaseTransition || handShrank ? owner : null;

},

async _ackEvents(events) {
    const ids = (events || []).map(evt => Number(evt.id)).filter(Number.isFinite);
    if (!ids.length) return;
    if (typeof this._sessionAcknowledgeEvents === 'function') {
        await this._sessionAcknowledgeEvents(Math.max(...ids));
        return;
    }
    await Bridge.call('clearEvents', { throughId: Math.max(...ids) });
},


_prepareHandAnimation(events) {
    const list = Array.isArray(events) ? events : [];
    const counts = { player: 0, ai: 0, ai2: 0 };
    for (const evt of list) {
        for (const owner of ['player', 'ai', 'ai2']) counts[owner] += this._handAdditionCount(evt, owner);
    }
    // A state packet can be painted by a remote/session adapter just before
    // its event queue starts. Mask the new trailing cards once more so the
    // flight remains the first visible representation of a draw.
    if (counts.player) this._renderPlayerHand({ hideTrailing: counts.player });
    if (counts.ai2 && this._renderAIHand1v2) this._renderAIHand1v2({ hideTrailing: counts.ai2, who: 'ai2' });
    if (counts.ai && this.state && this.state.is1v2 && this._renderAIHand1v2) this._renderAIHand1v2({ hideTrailing: counts.ai, who: 'ai' });
    else if (counts.ai) this._renderAIHand({ hideTrailing: counts.ai });

    const swap = list.find(evt => evt && evt.type === 'itemEffect' && evt.effect === 'swap');
    if (swap) {
        const playerHand = document.getElementById('player-hand');
        const opponentKey = swap.who === 'ai2' || swap.target === 'ai2' ? 'ai2' : 'ai';
        const opponentHand = document.getElementById(`${opponentKey}-hand`);
        if (playerHand) playerHand.classList.add('hand-swap-active');
        if (opponentHand) opponentHand.classList.add('hand-swap-active');
    }
},
async _consumeEvents(events, options = {}) {
    // State-diff animations are only a legacy fallback for bridge snapshots
    // that contain no playable events. Once an event batch is played, the
    // event handlers are the single source of floating feedback; the next
    // render must not replay the same transition from prev/current state.
    const hasEvents = !!(events && events.length);
    if (hasEvents) this._skipStateDiffAnimations = true;
    const wasConsumingEvents = this._isConsumingEvents;
    if (hasEvents && typeof this._beginHandAnimation === 'function') this._beginHandAnimation();
    this._isConsumingEvents = true;
        let pending = [...(events || [])];
        const consumedIds = new Set();
        let batches = 0;
        try {
            while (pending.length && batches++ < 40) {
                const batch = pending.filter((evt, index) => {
                    const key = Number.isFinite(Number(evt.id)) ? `id:${evt.id}` : `batch:${batches}:${index}`;
                    if (consumedIds.has(key) || (Number.isFinite(Number(evt.id)) && this._consumedEventIds && this._consumedEventIds.has(key))) return false;
                    consumedIds.add(key);
                    if (Number.isFinite(Number(evt.id)) && this._consumedEventIds) this._consumedEventIds.add(key);
                    return true;
                });
            if (!batch.length) {
                await this._ackEvents(pending);
                break;
            }
            try {
                this._prepareHandAnimation(batch);
                await this._playEvents(batch, !!options.fastFirstBatch && batches === 1);
            } catch (error) {
                console.error('[Events] batch animation failed', error);
                this.showError('动画异常已跳过，游戏继续');
            } finally {
                // Even if a visual effect fails, acknowledge the batch so the same
                // event cannot be replayed forever by the AI poller.
                await this._ackEvents(batch);
            }
            const freshState = typeof this._sessionGetState === 'function'
                ? await this._sessionGetState()
                : await Bridge.getState();
            if (!freshState || freshState.error) break;
            this.state = freshState;
            pending = freshState.events || [];
        }
        if (batches >= 40 && pending.length) {
            console.error('[Events] safety limit reached', pending);
            this.showError('事件过多，已切换为安全模式继续游戏');
        }
    } finally {
        this._drawAnimationRemaining = null;
        this._isConsumingEvents = wasConsumingEvents;
        if (hasEvents && typeof this._endHandAnimation === 'function') this._endHandAnimation();
        // The attack-modifier dialog is held back while events play; open it now.
        if (hasEvents && !this._isConsumingEvents && this.state && this.state.pendingAttackBuffChoice
            && typeof this._renderControls === 'function') {
            this._deferAttackBuffDialog = false;
            this._renderControls();
        }
    }
},


_feedbackEntity(evt, side) {
    const entity = this.state && this.state[side];
    if (!entity) return entity;
    const preview = evt && evt.statusAfter ? Object.assign({}, entity, evt.statusAfter) : entity;
    return Number.isFinite(evt && evt.hpAfter)
        ? Object.assign({}, preview, {hp: evt.hpAfter, alive: evt.hpAfter > 0}) : preview;
},

_isDefenseJudgmentEvent(evt) {
    const desc = String(evt && evt.desc || '');
    return !!evt && evt.type === 'reveal' && desc.includes('防御') && desc.includes('判定');
},


_aiDefenseAnimationKey(card, who) {
    return JSON.stringify([who || 'ai', card || null]);
},


_resetRevealBeforeDefenseJudgment() {
    const box = document.getElementById('reveal-cards');
    if (box) {
        box.innerHTML = '<span class="reveal-empty">等待防御技能判定</span>';
        box.dataset.cardKey = 'pending-defense-judgment';
        box.classList.remove('reveal-multi');
    }
    this._hideZoneDesc('reveal-desc');

},

_animationOrder(events) {
    const ordered = (events || []).map(evt => evt.type === 'trophyDrop' && !Array.isArray(evt.drops) && evt.card && Array.isArray(evt.card.drops)
        ? Object.assign({}, evt.card, evt, { drops: evt.card.drops, card: null }) : evt);
    for (let i = 0; i < ordered.length; i++) {
        const evt = ordered[i];
        if (evt.type !== 'reveal' || !String(evt.desc || '').includes('防御判定')) continue;
        const defenseIndex = ordered.findIndex((candidate, index) =>
            index > i && (candidate.type === 'aiDefend' || candidate.type === 'defend') && candidate.card
        );
        if (defenseIndex < 0) continue;
        const [defenseEvent] = ordered.splice(defenseIndex, 1);
        ordered.splice(i, 0, defenseEvent);
        i++;
    }
    // Victory feedback follows the visible loot rolls and their hand arrivals.
    if (ordered.some(evt => evt.type === 'trophyDrop' || evt.type === 'diceRoll' && evt.purpose === 'trophyDrop')) {
        return [...ordered.filter(evt => evt.type !== 'gameOver'), ...ordered.filter(evt => evt.type === 'gameOver')];
    }
    return ordered;
},


_trophyDisplayName(name) {
    const def = global.AdventureRegistry && global.AdventureRegistry.getItem(name);
    return String(def && def.displayName || name || '战利白卡').replace(/战利白卡$/, '') || '战利白卡';
},

_showTrophySettlement(evt, landed = false) {
    if (this._trophyConfirmation) this._trophyConfirmation(false);
    let overlay = document.getElementById('adv-settle-overlay');
    const updating = !!overlay;
    if (!overlay) {
        this._trophyScrollTop = document.scrollingElement && document.scrollingElement.scrollTop;
        overlay = document.createElement('div');
        overlay.id = 'adv-settle-overlay';
        document.body.appendChild(overlay);
    }
    overlay.className = 'game-over-overlay dialog-sheet-overlay trophy-settle-overlay' + (updating ? ' is-updating' : '');
    overlay.replaceChildren();
    const sheet = document.createElement('section');
    sheet.className = 'game-over-box adv-settle-wrapper dialog-bottom-sheet trophy-settle-sheet';
    sheet.setAttribute('aria-label', '战利品结算');
    const heading = document.createElement('h2');
    heading.textContent = '战利品骰子';
    if (evt.battleContinues) heading.textContent = '击败敌人 · 战利品';
    const status = document.createElement('p');
    status.className = 'trophy-settle-status';
    status.setAttribute('role', 'status');
    const progress = evt.rollCount > 1 ? '第 ' + evt.rollIndex + ' / ' + evt.rollCount + ' 次 · ' : '';
    const result = Array.isArray(evt.drops) ? (evt.drops.length ? '获得白卡' : '无掉落') : '等待确认骰面';
    status.textContent = progress + (landed ? '投出 ' + (evt.roll ?? evt.value) + ' · ' + result : '投掷中…');
    sheet.append(heading, status);
    const rules = document.createElement('div');
    rules.className = 'trophy-settle-rules';
    const outcomes = global.AdventureLoot && global.AdventureLoot.getDropTable
        ? global.AdventureLoot.getDropTable(evt.monsterName) : [];
    const value = Number(evt.roll ?? evt.value);
    const addRow = (label, drops, hit) => {
        const row = document.createElement('div');
        row.className = 'trophy-settle-rule' + (hit ? ' is-hit' : '') + (landed && !hit ? ' is-muted' : '');
        const condition = document.createElement('span');
        condition.className = 'trophy-settle-condition';
        condition.textContent = label + '：';
        row.appendChild(condition);
        const cards = document.createElement('div');
        cards.className = 'trophy-settle-cards';
        for (const name of drops) {
            const preview = this._createTrophyFlyCard(name);
            preview.className = 'trophy-settle-card';
            preview.dataset.trophyName = name;
            preview.setAttribute('aria-label', this._trophyDisplayName(name) + '白卡');
            const caption = preview.querySelector('.trophy-loot-caption');
            if (caption) caption.remove();
            cards.appendChild(preview);
        }
        if (!drops.length) cards.textContent = '无掉落';
        row.appendChild(cards);
        rules.appendChild(row);
    };
    for (const outcome of outcomes) {
        const { first, last, drops } = outcome;
        addRow(first === last ? String(first) : first + '–' + last, drops, landed && value >= first && value <= last);
    }
    // Legacy events or item-granted cards may have no monster rule attached.
    if (!outcomes.length) addRow(Number.isFinite(value) ? String(value) : '获得', evt.drops || [], landed);
    sheet.appendChild(rules);
    const actions = document.createElement('div');
    actions.className = 'adv-settle-actions trophy-settle-actions';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'trophy-settle-confirm';
    confirm.textContent = '确认';
    confirm.disabled = true;
    actions.appendChild(confirm);
    sheet.appendChild(actions);
    overlay.appendChild(sheet);
    return overlay;
},

_waitForTrophyConfirmation() {
    const overlay = document.getElementById('adv-settle-overlay');
    const button = overlay && overlay.querySelector('.trophy-settle-confirm');
    if (!button) return Promise.resolve(false);
    return new Promise(resolve => {
        const finish = confirmed => {
            if (this._trophyConfirmation !== finish) return;
            this._trophyConfirmation = null;
            button.disabled = true;
            button.onclick = null;
            resolve(confirmed);
        };
        this._trophyConfirmation = finish;
        button.disabled = false;
        button.onclick = () => finish(true);
    });
},

_clearTrophySettlement() {
    if (this._trophyConfirmation) this._trophyConfirmation(false);
    const overlay = document.getElementById('adv-settle-overlay');
    if (overlay && overlay.classList.contains('trophy-settle-overlay')) overlay.remove();
},

async _finishTrophySettlement(evt) {
    const continues = evt.battleContinues != null ? evt.battleContinues : this.state && this.state.phase !== 'GAME_OVER';
    if (!continues) return;
    const overlay = document.getElementById('adv-settle-overlay');
    if (overlay) {
        overlay.classList.add('is-leaving');
        const reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduce) {
            const runtime = global.FurryGame && global.FurryGame.CombatRuntime;
            await (runtime ? runtime.wait(180) : new Promise(resolve => setTimeout(resolve, 180)));
        }
    }
    this._clearTrophySettlement();
    const reveal = document.getElementById('reveal-cards');
    if (reveal) {
        reveal.innerHTML = '<span class="reveal-empty">等待判定</span>';
        reveal.dataset.cardKey = '';
    }
    this._judgmentCards = [];
    if (document.scrollingElement && Number.isFinite(this._trophyScrollTop)) {
        document.scrollingElement.scrollTop = this._trophyScrollTop;
    }
    this._trophyScrollTop = null;
},

_queueTrophyHides(names) {
    if (!this._pendingTrophyHides) this._pendingTrophyHides = [];
    for (const name of names || []) {
        if (name) this._pendingTrophyHides.push(String(name));
    }
},

_releaseTrophyHides(names) {
    if (!this._pendingTrophyHides || !this._pendingTrophyHides.length) return;
    for (const name of names || []) {
        if (!name) continue;
        const key = String(name);
        const idx = this._pendingTrophyHides.lastIndexOf(key);
        if (idx >= 0) this._pendingTrophyHides.splice(idx, 1);
    }
    if (!this._pendingTrophyHides.length) this._pendingTrophyHides = null;
},

_pendingTrophyHideBag() {
    const bag = Object.create(null);
    for (const name of this._pendingTrophyHides || []) {
        bag[name] = (bag[name] || 0) + 1;
    }
    return bag;
},

_hasPendingLootPresentation() {
    if (this._trophyGainPlaying) return true;
    if (this._lootPresentationActive) return true;
    if (this._pendingTrophyHides && this._pendingTrophyHides.length) return true;
    const doc = global.document;
    return !!(doc && typeof doc.querySelector === 'function' && doc.querySelector('.trophy-fly-card'));
},

_createTrophyFlyCard(name) {
    const wrap = document.createElement('div');
    wrap.className = 'trophy-fly-card';
    let face = null;
    try {
        const card = window.AdventureDeck && window.AdventureDeck.trophyWhite ? window.AdventureDeck.trophyWhite(name) : null;
        if (card && typeof window.renderCard === 'function') face = window.renderCard(card, 80, 114, false);
    } catch (_) { face = null; }
    if (!face) {
        face = document.createElement('div');
        face.className = 'trophy-fly-fallback';
        face.textContent = '◇';
    }
    if (face.dataset && face.dataset.cardId) wrap.dataset.cardId = face.dataset.cardId;
    else wrap.dataset.cardId = 'flight-' + String(name || 'trophy');
    wrap.appendChild(face);
    const caption = document.createElement('span');
    caption.className = 'trophy-loot-caption';
    caption.textContent = '获得[' + this._trophyDisplayName(name) + ']';
    wrap.appendChild(caption);
    return wrap;
},

async _playTrophyDropAnimation(names, onArrive) {
    this._trophyGainPlaying = (this._trophyGainPlaying || 0) + 1;
    const list = (names || []).filter(Boolean);
    this._queueTrophyHides(list);
    if (typeof this._renderPlayerHand === 'function') {
        this._renderPlayerHand({ hideTrailing: typeof this._pendingDrawMask === 'function' ? this._pendingDrawMask('player') : 0 });
    }
    const flyNodes = [];
    try {
        const from = document.getElementById('reveal-cards') || document.querySelector('.ai-area') || document.body;
        const to = document.getElementById('player-hand') || document.body;
        const stage = document.getElementById('game-screen') || document.body;
        const source = from.getBoundingClientRect();
        const hand = to.getBoundingClientRect();
        const board = typeof stage.getBoundingClientRect === 'function'
            ? stage.getBoundingClientRect()
            : { left: 0, top: 0, width: Number(global.innerWidth) || 800, height: Number(global.innerHeight) || 600 };
        const vh = Number(global.innerHeight) || board.height || 600;
        const dieVisible = source.bottom > 0 && source.top < vh;
        const start = dieVisible ? source : {
            left: board.left + board.width / 2 - 40,
            top: Math.max(24, board.top + board.height * 0.22),
            width: 80,
            height: 80
        };
        const cx = board.left + board.width / 2;
        const cy = board.top + Math.max(120, Math.min(board.height * 0.4, vh * 0.38));
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const previews = Array.from(document.querySelectorAll('.trophy-settle-rule.is-hit .trophy-settle-card'));
        const flights = list.map((name, i) => new Promise(resolve => {
            const node = this._createTrophyFlyCard(name);
            flyNodes.push(node);
            const previewIndex = previews.findIndex(el => el.dataset.trophyName === name);
            const preview = previewIndex >= 0 ? previews.splice(previewIndex, 1)[0] : null;
            const origin = preview ? preview.getBoundingClientRect() : start;
            const sx = origin.left + origin.width / 2 - 40 + (preview ? 0 : (i - (list.length - 1) / 2) * 28);
            const sy = origin.top + origin.height / 2 - 57;
            const mx = Math.max(12, Math.min((Number(global.innerWidth) || board.width) - 92, cx - 40 + (i - (list.length - 1) / 2) * 96)) - sx;
            const my = Math.min(cy - 57, sy - 72) - sy;
            const ex = hand.left + hand.width / 2 - 40 - sx + (i - (list.length - 1) / 2) * 24;
            const ey = hand.top + Math.min(hand.height * 0.35, 48) - sy;
            node.style.cssText = 'position:fixed;z-index:10050;left:' + sx + 'px;top:' + sy + 'px;width:80px;pointer-events:none;margin:0;transform-origin:50% 50%;';
            document.body.appendChild(node);
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            if (reduce || !node.animate) { setTimeout(done, 160); return; }
            try {
                const duration = 1180;
                const delay = i * 110;
                const anim = node.animate([
                    { transform: 'scale(' + (preview ? '0.8' : '0.4') + ')', opacity: 0, filter: 'brightness(1.35)' },
                    { transform: 'translate(' + mx + 'px,' + my + 'px) scale(1.12) rotate(-3deg)', opacity: 1, filter: 'brightness(1.1)', offset: 0.28 },
                    { transform: 'translate(' + mx + 'px,' + my + 'px) scale(1.06)', opacity: 1, filter: 'brightness(1)', offset: 0.56 },
                    { transform: 'translate(' + (ex * 0.72 + mx * 0.28) + 'px,' + (Math.min(my, ey) - 35) + 'px) scale(0.92) rotate(5deg)', opacity: 1, offset: 0.76 },
                    { transform: 'translate(' + ex + 'px,' + ey + 'px) scale(0.72)', opacity: 0, filter: 'brightness(1)' }
                ], { duration, delay, easing: 'cubic-bezier(.2,.85,.25,1)', fill: 'forwards' });
                let timersAreSync = true;
                const fallback = setTimeout(() => { if (!timersAreSync) done(); }, duration + delay + 100);
                timersAreSync = false;
                const finish = () => { clearTimeout(fallback); done(); };
                anim.onfinish = finish;
                anim.oncancel = finish;
            } catch (_) { done(); }
        }));
        await Promise.all(flights);
        // Reveal the real hand card first, then drop the flight clone so there is no gap.
        this._releaseTrophyHides(list);
        if (typeof onArrive === 'function') onArrive();
        for (const node of flyNodes) { try { node.remove(); } catch (_) {} }
        flyNodes.length = 0;
        if (reduce) return;
        to.classList.remove('trophy-hand-glow'); void to.offsetWidth; to.classList.add('trophy-hand-glow');
        await new Promise(resolve => setTimeout(resolve, 300));
        to.classList.remove('trophy-hand-glow');
    } finally {
        for (const node of flyNodes) { try { node.remove(); } catch (_) {} }
        this._releaseTrophyHides(list);
        this._trophyGainPlaying = Math.max(0, (this._trophyGainPlaying || 1) - 1);
    }
},

async _playEvents(events, fast = false) {
    const runtime = global.FurryGame && global.FurryGame.CombatRuntime;
    const wait = ms => runtime
        ? runtime.wait((fast || this._onlineAnimationFast) ? Math.max(60, Math.round(ms * 0.22)) : ms)
        : new Promise(resolve => setTimeout(resolve, (fast || this._onlineAnimationFast) ? Math.max(60, Math.round(ms * 0.22)) : ms));
    const orderedEvents = this._animationOrder(events);
    // Older saves omit drops on dice events; pair them with their result without rerolling.
    const lootResults = new Map();
    const lootTrophyByDie = new Map();
    const presentedTrophies = new Set();
    let pendingLootDie = null;
    for (const evt of orderedEvents) {
        if (evt.type === 'diceRoll' && evt.purpose === 'trophyDrop') pendingLootDie = evt;
        else if (evt.type === 'trophyDrop' && pendingLootDie) {
            lootResults.set(pendingLootDie, evt.drops);
            lootTrophyByDie.set(pendingLootDie, evt);
            pendingLootDie = null;
        }
    }
    const drawRemaining = { player: 0, ai: 0, ai2: 0 };
    this._drawAnimationRemaining = drawRemaining;
    for (const event of orderedEvents) {
        for (const owner of ['player', 'ai', 'ai2']) drawRemaining[owner] += this._handAdditionCount(event, owner);
    }
    const previousOnlineFast = this._onlineAnimationFast;
    // Online batches that already contain many authoritative events are in a
    // catch-up path. Keep the important order, but shorten decorative flight
    // and pause timings so animation backlog cannot grow without bound.
    this._onlineAnimationFast = !!(this.state && this.state.isOnline && (fast || orderedEvents.length >= 6));
    if (orderedEvents.some(evt => this._isDefenseJudgmentEvent(evt))) {
        // Clear a judgment card that may have been painted from the final
        // state snapshot before the defense animation begins.
        this._resetRevealBeforeDefenseJudgment();
    }
    this._eventPlaybackDepth = (this._eventPlaybackDepth || 0) + 1;
    try { for (const evt of orderedEvents) {
        try {
          if (evt.type === 'aiPlay') {
            this._lastAnimatedAIDefenseKey = null;
            // Some older/bridge states omitted the card payload even though
            // the engine had already recorded the active attack card. Keep
            // the play animation visible by falling back to that snapshot.
            const aiPlayCard = evt.card || (this.state && this.state.atkCard);
            if (!aiPlayCard) { await wait(180); continue; }
            this._updateAttackerIndicator(evt.who || 'ai');
            await this._playAICardAnimation(aiPlayCard, evt.who || 'ai');
            this._renderDiscardTop();
            await wait(600);
            this._showCardSkillDesc('atk-desc', aiPlayCard, evt.who || 'ai', false);
            await wait(500);
        } else if (evt.type === 'playerPlay' && evt.card) {
            this._lastAnimatedAIDefenseKey = null;
            this._updateAttackerIndicator('player');
            await this._playPlayerCardAnimation(evt.card);
            this._renderDiscardTop();
            await wait(400);
            this._showCardSkillDesc('atk-desc', evt.card, 'player', false);
            await wait(600);
        } else if (evt.type === 'itemEffect') {
            this._showZoneDesc('reveal-desc', evt.desc || '道具效果立即结算');
            if (evt.effect === 'swap') {
                await this._playHandSwapAnimation(evt);
                // Keep hand dimmed (hand-swap-active) until after re-render, to prevent
                // a brief flash of the old cards before the new hand is painted.
                const playerHand = document.getElementById('player-hand');
                const aiHand = document.getElementById(evt.target === 'ai2' || evt.who === 'ai2' ? 'ai2-hand' : 'ai-hand');
                const swapMask = typeof this._pendingDrawMask === 'function' ? this._pendingDrawMask('player') : 0;
                this._renderPlayerHand({ hideTrailing: swapMask });
                if (this.state && this.state.is1v2 && this._renderAIHand1v2) this._renderAIHand1v2();
                else this._renderAIHand();
                if (playerHand) playerHand.classList.add('hand-swap-active');
                if (aiHand) aiHand.classList.add('hand-swap-active');
                await wait(80); // ensure the re-rendered DOM is painted
                if (playerHand) playerHand.classList.remove('hand-swap-active');
                if (aiHand) aiHand.classList.remove('hand-swap-active');
                if (playerHand) playerHand.classList.add('hand-swap-arrive');
                if (aiHand) aiHand.classList.add('hand-swap-arrive');
                await wait(460);
                if (playerHand) playerHand.classList.remove('hand-swap-arrive');
                if (aiHand) aiHand.classList.remove('hand-swap-arrive');
            } else {
                const side = evt.who === 'ai2' ? 'ai2' : evt.who === 'ai' ? 'ai' : 'player';
                if (this.state[side]) {
                    this._updateHpBar(side, this._feedbackEntity(evt, side));
                    this._updateBuffs(side, this._feedbackEntity(evt, side));
                }
                await wait(380);
            }
        } else if (evt.type === 'aiDefend' && evt.card) {
            const who = evt.who || 'ai';

            const defenseKey = this._aiDefenseAnimationKey(evt.card, who);
            if (this._lastAnimatedAIDefenseKey !== defenseKey) {
                await this._playAIDefendAnimation(evt.card, who);
                this._lastAnimatedAIDefenseKey = defenseKey;
            }
            this._renderDiscardTop();
            await wait(600);
            this._showCardSkillDesc('def-desc', evt.card, who, true);
            await wait(350);
        } else if (evt.type === 'draw') {
            const count = Math.max(0, Number(evt.count) || 1);
            const drawOwner = evt.who === 'ai2' ? 'ai2' : evt.who === 'ai' ? 'ai' : evt.who === 'player' ? 'player' : 'ai';
            const maskCount = Math.max(count, drawRemaining[drawOwner] || 0);
            const drawTarget = evt.who === 'player' ? 'player-hand' : evt.who === 'ai2' ? 'ai2-hand' : 'ai-hand';
            const target = document.getElementById(drawTarget);
            this._showZoneDesc('reveal-desc', evt.desc || '抽牌');
            // Keep newly drawn cards invisible until the fly-in finishes,
            // so they do not pop into the hand while backs are still flying.
            if (evt.who === 'player') {
                this._animatedPlayerDraws += count;
                this._renderPlayerHand({ hideTrailing: maskCount });
            } else if (evt.who === 'ai2' && this._renderAIHand1v2) {
                this._renderAIHand1v2({ hideTrailing: maskCount, who: 'ai2' });
            } else if (this.state && this.state.is1v2 && this._renderAIHand1v2) {
                this._renderAIHand1v2({ hideTrailing: maskCount, who: 'ai' });
            } else {
                this._renderAIHand({ hideTrailing: maskCount });
            }
            if (typeof this.state.deck === 'number') this._drawDeckIcon(this.state.deck);
            try {
                if (target) await this.anim.drawCards(count, evt.who === 'player', target);
            } finally {
                // Keep later draw events masked until their own flight starts;
                // only the final draw in this batch reveals the full hand.
                drawRemaining[drawOwner] = Math.max(0, (drawRemaining[drawOwner] || maskCount) - count);
                const remainingMask = drawRemaining[drawOwner];
                if (evt.who === 'player') this._renderPlayerHand({ hideTrailing: remainingMask });
                else if (evt.who === 'ai2' && this._renderAIHand1v2) this._renderAIHand1v2({ hideTrailing: remainingMask, who: 'ai2' });
                else if (this.state && this.state.is1v2 && this._renderAIHand1v2) this._renderAIHand1v2({ hideTrailing: remainingMask, who: 'ai' });
                else this._renderAIHand({ hideTrailing: remainingMask });
            }
            await wait(120);
        } else if (evt.type === 'reveal' && (evt.card || (evt.cards && evt.cards.length))) {
            if (this._isDefenseJudgmentEvent(evt)) {
                // Some backends can return the defense play and its reveal in
                // adjacent polling batches.  If that happens, settle/animate
                // the currently active AI defense card before revealing the
                // judgment, and suppress the later duplicate defense event.
                const defenseCard = this.state && this.state.defCard;
                const defenseOwner = this.state && this.state.defOwner;
                if (defenseCard && defenseOwner && defenseOwner !== 'player') {
                    const defenseKey = this._aiDefenseAnimationKey(defenseCard, defenseOwner);
                    if (this._lastAnimatedAIDefenseKey !== defenseKey) {
                        await this._playAIDefendAnimation(defenseCard, defenseOwner);
                        this._lastAnimatedAIDefenseKey = defenseKey;
                        await wait(600);
                        this._showCardSkillDesc('def-desc', defenseCard, defenseOwner, true);
                        await wait(800);
                    }
                }
            }
            const revealCards = (evt.cards && evt.cards.length) ? evt.cards : [evt.card];
            await this._playRevealAnimation(revealCards, evt.fromOwner || evt.who, evt.from, evt.handIndex);
            this._showZoneDesc('reveal-desc', evt.desc || '判定');
            // The judged card already left (or joined) the hand in state; keep
            // not-yet-flown draws masked so they never pop in early.
            if (evt.who === 'player' || evt.from === 'deck') {
                const revealMask = typeof this._pendingDrawMask === 'function' ? this._pendingDrawMask('player') : 0;
                this._renderPlayerHand({ hideTrailing: revealMask });
            }
            await wait(1200);
        } else if (evt.type === 'diceRoll' && Number.isFinite(Number(evt.value))) {
            const value = Number(evt.value);
            const isLoot = evt.purpose === 'trophyDrop';
            const rollCount = Math.max(0, Number(evt.rollCount) || 0);
            const rollIndex = Math.max(0, Number(evt.rollIndex) || 0);
            const rollLabel = rollCount > 1 && rollIndex > 0 ? ' · 第' + rollIndex + '/' + rollCount + '次' : '';
            const desc = (evt.desc || ('12面骰：' + value)) + rollLabel;
            const pendingControl = !!(evt.awaitControl || !isLoot && this.state && this.state.pendingDiceControl);
            this._showZoneDesc('reveal-desc', isLoot ? '' : '12面骰投掷中…' + rollLabel);
            if (isLoot && !pendingControl) this._showTrophySettlement(evt);
            if (isLoot && pendingControl) this._clearTrophySettlement();
            // Open remote-dice sheet ASAP; do not wait for the full tumble.
            if (pendingControl && typeof this._renderDiceControl === 'function') this._renderDiceControl();
            if (typeof this._playD12Animation === 'function') {
                await this._playD12Animation(value, { desc, who: evt.who, outcome: evt.outcome, fast: pendingControl, awaitControl: pendingControl });
            } else {
                await wait(pendingControl ? 80 : 450);
            }
            // Fly can fail and lead to another guard choice. Restore the
            // skill's card reference after the transient die animation.
            if(!isLoot && (this._judgmentCards||[]).length)this._paintJudgmentCards(this._judgmentCards);
            // A controllable loot die has no final reward yet. Its dice-choice
            // sheet owns this step; confirm loot only after that choice resolves.
            if (isLoot && pendingControl) continue;
            if (isLoot) {
                this._lootPresentationActive = (this._lootPresentationActive || 0) + 1;
                try {
                    this._judgmentCards = [];
                    const drops = Array.isArray(evt.drops) ? evt.drops : lootResults.get(evt) || (evt.outcome === 'fail' ? [] : undefined);
                    this._showTrophySettlement(Object.assign({}, evt, { roll: value, drops }), true);
                    const dropNames = Array.isArray(drops) ? drops.filter(Boolean) : [];
                    if (dropNames.length) {
                        this._renderPlayerHand({ hideTrailing: drawRemaining.player });
                        let arrived = false;
                        const revealArrival = () => {
                            if (arrived) return;
                            arrived = true;
                            drawRemaining.player = Math.max(0, drawRemaining.player - dropNames.length);
                            this._renderPlayerHand({ hideTrailing: drawRemaining.player });
                        };
                        try { await this._playTrophyDropAnimation(dropNames, revealArrival); }
                        finally { revealArrival(); }
                    }
                    const paired = lootTrophyByDie.get(evt);
                    if (paired) presentedTrophies.add(paired);
                    if (!await this._waitForTrophyConfirmation()) break;
                    await this._finishTrophySettlement(evt);
                } finally {
                    this._lootPresentationActive = Math.max(0, (this._lootPresentationActive || 1) - 1);
                }
            } else {
                this._showZoneDesc('reveal-desc', desc);
                await wait(pendingControl ? 40 : 220);
            }
        } else if (evt.type === 'lordDice' && Number.isFinite(Number(evt.roll))) {
            if (typeof this._playDiceAnimation === 'function') {
                await this._playDiceAnimation(Number(evt.roll), evt.target);
            }
        } else if (evt.type === 'colorChoice') {
            this._showZoneDesc('reveal-desc', evt.desc || 'AI指定颜色');
            await wait(650);
        } else if (evt.type === 'defend' && evt.card) {

            await this._playPlayerDefendAnimation(evt.card);
            this._renderDiscardTop();
            await wait(500);
            this._showCardSkillDesc('def-desc', evt.card, 'player', true);
            await wait(800);
        } else if (evt.type === 'judgmentEnd') {
            await this._finishJudgmentAnimation(evt);
        } else if (evt.type === 'discardMany' && evt.cards && evt.cards.length) {
            if (evt.deferRevealExit) continue;
            await this._playDiscardManyAnimation(evt);
            this._showZoneDesc('reveal-desc', evt.desc || `${evt.cards.length}张牌已放入弃牌库底`);
            await wait(120);
        } else if (evt.type === 'discard' && evt.card) {
            if (evt.deferRevealExit) continue;
            await this._playDiscardAnimation(evt);
            this._showZoneDesc('reveal-desc', evt.desc || (evt.destination === 'top' ? '卡牌成为弃牌库顶' : '卡牌已放入弃牌库底'));
            await wait(140);
        } else if (evt.type === EVENT_TYPES.BUFF_TRIGGER || evt.type === 'buffTrigger') {
            const side = this._eventTarget(evt);
            if (this.state[side]) this._updateBuffs(side, this._feedbackEntity(evt, side));
            if (typeof this._flashBuffIcon === 'function') this._flashBuffIcon(side, evt.kind);
            await wait(320);
        } else if (evt.type === 'desc') {
            this._showZoneDesc('reveal-desc', evt.desc);
            await wait(1500);
        } else if (evt.type === 'clearZones') {
            this._clearZones();
        } else if (evt.type === 'hint') {
            this.showError(evt.desc || '');
            await wait(1500);
        } else if (evt.type === 'float') {
            this.playFloatingText(evt.desc || '', '', evt.who || 'player');
            await wait(400);
        } else if (evt.type === 'accessoryTrigger' || evt.type === EVENT_TYPES.ACCESSORY_TRIGGER) {
            if (typeof this._flashAccessorySlot === 'function') {
                await this._flashAccessorySlot(evt.itemName);
            } else {
                await wait(350);
            }
        } else if (evt.type === EVENT_TYPES.HIT) {
            const side = this._eventTarget(evt);
            if (this.state[side]) { this._updateHpBar(side, this._feedbackEntity(evt, side)); this._updateBuffs(side, this._feedbackEntity(evt, side)); }
            // 普通扣血显示简洁的红色数字；不再复用冗余的“[伤害]”标签。
            if (Number(evt.amount) > 0) {
                this.playFloatingText(damageFloat(evt.amount), '#ff4444', side);
            }
            this._playHitFeedback(side, evt.amount);
            await wait(400);
        } else if (evt.type === 'burnSettle') {
            const side = this._eventTarget(evt);
            const amt = Math.max(0, Number(evt.amount) || 0);
            const text = amt > 0
                ? damageFloat(amt, '灼伤', scorchKeep(evt) ? '（[炙热]不消退）' : '，层数-1')
                : (evt.desc || '');
            this.playFloatingText(text, '#ff8800', side);
            if (this.state[side]) { this._updateHpBar(side, this._feedbackEntity(evt, side)); this._updateBuffs(side, this._feedbackEntity(evt, side)); }
            if (amt > 0) { this.shakeScreen(Math.min(amt * 2, 10), 300); const hpEl = document.getElementById(side + '-hp-section'); if (hpEl) { const r = hpEl.getBoundingClientRect(); this.burstParticles(r.left + r.width / 2, r.top + r.height / 2, 'rgba(255,136,0,0.8)', Math.min(amt * 3, 20)); } }
            await wait(500);
        } else if (evt.type === 'bleedSettle') {
            const side = this._eventTarget(evt);
            const amt = Math.max(0, Number(evt.amount) || 0);
            const text = amt > 0
                ? damageFloat(amt, '流血', '，层数-1')
                : (evt.desc || '');
            this.playFloatingText(text, '#cc2222', side);
            if (this.state[side]) { this._updateHpBar(side, this._feedbackEntity(evt, side)); this._updateBuffs(side, this._feedbackEntity(evt, side)); }
            if (amt > 0) { this.shakeScreen(Math.min(amt * 2, 10), 300); const hpEl = document.getElementById(side + '-hp-section'); if (hpEl) { const r = hpEl.getBoundingClientRect(); this.burstParticles(r.left + r.width / 2, r.top + r.height / 2, 'rgba(204,34,34,0.8)', Math.min(amt * 3, 20)); } }
            await wait(500);
        } else if (evt.type === 'poisonSettle') {
            const side = this._eventTarget(evt);
            const amt = Math.max(0, Number(evt.amount) || 0);
            const text = amt > 0
                ? damageFloat(amt, '中毒')
                : (evt.desc || '');
            this.playFloatingText(text, '#84cc16', side);
            if (this.state[side]) { this._updateHpBar(side, this._feedbackEntity(evt, side)); this._updateBuffs(side, this._feedbackEntity(evt, side)); }
            if (amt > 0) { this.shakeScreen(Math.min(amt * 2, 10), 300); }
            await wait(500);
        } else if (evt.type === 'bombExplode') {
            const side = this._eventTarget(evt);
            const amt = Math.max(0, Number(evt.amount) || 0);
            const text = amt > 0
                ? damageFloat(amt, '定时炸弹')
                : (evt.desc || '炸弹爆炸！');
            this.playFloatingText(text, '#ff4444', side);
            if (this.state[side]) { this._updateHpBar(side, this._feedbackEntity(evt, side)); this._updateBuffs(side, this._feedbackEntity(evt, side)); }
            this.shakeScreen(10, 400);
            const hpEl = document.getElementById(side + '-hp-section');
            if (hpEl) { const r = hpEl.getBoundingClientRect(); this.burstParticles(r.left + r.width / 2, r.top + r.height / 2, 'rgba(255,68,68,0.9)', 25); }
            await wait(600);
        } else if (evt.type === 'hurt') {
            const side = this._eventTarget(evt);
            // 普通伤害由 kind=normal 表示；旧事件没有 kind 时按普通伤害兼容。
            // 规则字段决定表现，不再解析 desc 文本。
            const kind = evt.kind || (evt.poison ? DAMAGE_KINDS.POISON : evt.bleed ? DAMAGE_KINDS.BLEED : evt.drain ? DAMAGE_KINDS.DRAIN : evt.thorns ? (DAMAGE_KINDS.THORNS || 'thorns') : DAMAGE_KINDS.NORMAL);
            const amt = Math.max(0, Number(evt.amount) || 0);
            if (kind === DAMAGE_KINDS.NORMAL) {
                if (!evt.suppressFloat && amt > 0) {
                    this.playFloatingText(damageFloat(amt), '#ff4444', side);
                }
            } else {
                const tag = kind === DAMAGE_KINDS.POISON ? '中毒'
                    : kind === DAMAGE_KINDS.BLEED ? '流血'
                    : kind === (DAMAGE_KINDS.THORNS || 'thorns') ? '荆棘'
                    : kind === DAMAGE_KINDS.DRAIN ? '吸血'
                    : null;
                const color = kind === DAMAGE_KINDS.POISON ? '#84cc16'
                    : kind === DAMAGE_KINDS.BLEED ? '#cc2222'
                    : kind === (DAMAGE_KINDS.THORNS || 'thorns') ? '#facc15'
                    : '#ff4444';
                if (!evt.suppressFloat) {
                    const text = (amt > 0 && tag)
                        ? damageFloat(amt, tag)
                        : (evt.desc || '');
                    this.playFloatingText(text, color, side);
                }
            }
            if (this.state[side]) { this._updateHpBar(side, this._feedbackEntity(evt, side)); this._updateBuffs(side, this._feedbackEntity(evt, side)); }
            this._playHitFeedback(side, evt.amount);
            await wait(400);
        } else if (evt.type === 'buffSettle') {
            const kind = evt.kind || 'burn';
            const color = kind === DAMAGE_KINDS.BLEED ? '#cc2222' : kind === DAMAGE_KINDS.POISON ? '#84cc16' : '#ff8800';
            const side = this._eventTarget(evt);
            const amt = Math.max(0, Number(evt.amount) || 0);
            const tag = kind === DAMAGE_KINDS.BLEED || kind === 'bleed' ? '流血'
                : kind === DAMAGE_KINDS.POISON || kind === 'poison' ? '中毒'
                : '灼伤';
            const text = amt > 0 ? damageFloat(amt, tag, tag === '灼伤' && scorchKeep(evt) ? '（[炙热]不消退）' : tag === '中毒' ? '' : '，层数-1') : (evt.desc || '');
            this.playFloatingText(text, color, side);
            if (this.state[side]) { this._updateHpBar(side, this._feedbackEntity(evt, side)); this._updateBuffs(side, this._feedbackEntity(evt, side)); }
            if (amt > 0) { this.shakeScreen(Math.min(amt * 2, 10), 300); }
            await wait(500);
        } else if (evt.type === 'buff') {
            const side = this._eventTarget(evt);
            const colors = {
                burn: '#ff8800', bleed: '#cc2222', freeze: '#44aaff', guard: '#00bcd4',
                poison: '#84cc16', thorns: '#facc15', sandblind: '#d6b07c', quicksand: '#d6b07c', crit: '#fbbf24', magmaVein: '#f97316', fly: '#a5b4fc', harden: '#cbd5e1', lush: '#4ade80',
                parasite: '#86efac', blind: '#c4b5fd', bomb: '#fb923c', iceSeal: '#7dd3fc',
                scorch: '#ff4d00',
                clearDebuffs: '#5eead4', clearBuffs: '#94a3b8',
                taunt: '#f59e0b',
                fertility: '#86efac',
                chaos_reset: '#c084fc',
                chaos_red: '#f87171', chaos_yellow: '#fde047', chaos_blue: '#60a5fa', chaos_green: '#4ade80'
            };
            this.playFloatingText(evt.desc || '', colors[evt.kind] || '#c4b5fd', side);
            if (this.state[side]) {
                let ch = this._feedbackEntity(evt, side);
                if (evt.stacks != null && evt.kind) {
                    const preview = Object.assign({}, ch);
                    if (evt.kind === 'freeze') preview.frozen = evt.stacks > 0;
                    else if (evt.kind === 'guard') preview.guard = evt.stacks;
                    else if (evt.kind === 'harden') preview.harden = evt.stacks;
                    else if (evt.kind === 'crit') preview.crit = evt.stacks;
                    else if (evt.kind === 'magmaVein') preview.magmaVein = evt.stacks;
                    else if (evt.kind === 'taunt') {
                        preview.tauntMark = evt.stacks > 0;
                        if (!(evt.stacks > 0)) preview.mockAttackColor = null;
                    }
                    else if (evt.kind === 'chaos_reset') {
                        preview.chaos_red = false;
                        preview.chaos_yellow = false;
                        preview.chaos_blue = false;
                        preview.chaos_green = false;
                    }
                    else if (evt.kind === 'iceSeal') preview.iceSeal = evt.stacks;
                    else if (evt.kind.startsWith('chaos_')) preview[evt.kind] = evt.stacks > 0;
                    else preview[evt.kind] = evt.stacks;
                    ch = preview;
                }
                this._updateBuffs(side, ch);
            }
            await wait(350);
        } else if (evt.type === 'heal') {
            const color = evt.kind === 'drain' ? '#e040fb' : evt.kind === 'passive' ? '#b388ff' : '#44dd44';
            const side = this._eventTarget(evt);
            this.playFloatingText(healFloat(evt), color, side);
            if (this.state[side]) { this._updateHpBar(side, this._feedbackEntity(evt, side)); this._updateBuffs(side, this._feedbackEntity(evt, side)); }
            await wait(400);
        } else if (evt.type === 'gameOver') {
            this.playFloatingText(evt.desc || '游戏结束', '#ffd700', 'player');
            await wait(1500);
        } else if (evt.type === 'trophyDrop' && Array.isArray(evt.drops)) {
            if (presentedTrophies.has(evt)) continue;
            this._showZoneDesc('reveal-desc', '');
            this._showTrophySettlement(evt, true);
            if (!evt.drops.length) {
                if (!await this._waitForTrophyConfirmation()) break;
                await this._finishTrophySettlement(evt);
                continue;
            }
            this._lootPresentationActive = (this._lootPresentationActive || 0) + 1;
            this._renderPlayerHand({ hideTrailing: drawRemaining.player });
            let arrived = false;
            const revealArrival = () => {
                if (arrived) return;
                arrived = true;
                drawRemaining.player = Math.max(0, drawRemaining.player - evt.drops.length);
                this._renderPlayerHand({ hideTrailing: drawRemaining.player });
            };
            try {
                await this._playTrophyDropAnimation(evt.drops, revealArrival);
                if (!await this._waitForTrophyConfirmation()) break;
                await this._finishTrophySettlement(evt);
            }
            finally {
                revealArrival();
                this._lootPresentationActive = Math.max(0, (this._lootPresentationActive || 1) - 1);
            }
        } else if (evt.type === 'dualDice') {
            if (typeof this._playDualDiceAnimation === 'function') {
                await this._playDualDiceAnimation(evt.roll, evt.target);
            }
        }
        } catch (error) {
            console.error('[Animation] skipped event', evt && evt.id, error);
            this.showError('动画已跳过，游戏继续');
        }
    } } finally {
        // Keep the final loot sheet for the controller to turn into rewards.
        // Mid-battle drops (challenge rooms and items) must release the board.
        if (!this.state || this.state.phase !== 'GAME_OVER') this._clearTrophySettlement();
        this._onlineAnimationFast = previousOnlineFast;
        this._eventPlaybackDepth = Math.max(0, (this._eventPlaybackDepth || 1) - 1);
    }
}
    });
})(window);
