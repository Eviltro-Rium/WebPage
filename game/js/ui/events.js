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

    const damageFloat = (amount, suffix = '', custom = '') => {
        if (!custom) return '-' + amount + '🗡️' + suffix;
        return custom.includes('🗡️') ? custom : custom.replace(/^-\d+(?:\.\d+)?(?:❤️)?/, '-' + amount + '🗡️');
    };

    Object.assign(GameUI.prototype, {
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
        if (!evt || evt.type !== 'draw') continue;
        const owner = evt.who === 'ai2' ? 'ai2' : evt.who === 'ai' ? 'ai' : evt.who === 'player' ? 'player' : null;
        if (owner) counts[owner] += Math.max(0, Number(evt.count) || 1);
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
            && typeof this._renderControls === 'function') this._renderControls();
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
    const ordered = [...(events || [])];
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
    return ordered;
},


async _playTrophyDropAnimation(names) {
    const deckApi = window.AdventureDeck;
    const from = document.querySelector('.ai-area') || document.body;
    const to = document.getElementById('player-hand') || document.body;
    const fr = from.getBoundingClientRect(), tr = to.getBoundingClientRect();
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.playFloatingText('获得战利白卡 ×' + names.length, '#f8e7a8', 'player');
    const flights = names.map((name, i) => new Promise(resolve => {
        let node = null;
        try {
            const card = deckApi && deckApi.trophyWhite ? deckApi.trophyWhite(name) : null;
            if (card && typeof window.renderCard === 'function') node = window.renderCard(card, 70, 100, false);
        } catch (_) { node = null; }
        if (!node) { node = document.createElement('div'); node.textContent = '◇'; }
        node.classList.add('trophy-fly-card');
        const sx = fr.left + fr.width / 2 - 35 + (i - (names.length - 1) / 2) * 24;
        const sy = fr.top + fr.height / 2 - 50;
        const ex = tr.left + tr.width / 2 - 35, ey = tr.top + tr.height / 2 - 50;
        node.style.left = sx + 'px'; node.style.top = sy + 'px';
        document.body.appendChild(node);
        if (reduce || !node.animate) { setTimeout(() => { node.remove(); resolve(); }, 300); return; }
        const anim = node.animate([
            { transform: 'translate(0,0) scale(0.3) rotate(-20deg)', opacity: 0, filter: 'brightness(2.2)' },
            { transform: 'translate(0,-30px) scale(1.25) rotate(0deg)', opacity: 1, filter: 'brightness(1.5) drop-shadow(0 0 18px #ffe27a)', offset: 0.35 },
            { transform: 'translate(0,-30px) scale(1.2)', opacity: 1, filter: 'brightness(1.2) drop-shadow(0 0 14px #ffe27a)', offset: 0.55 },
            { transform: 'translate(' + (ex - sx) + 'px,' + (ey - sy) + 'px) scale(0.75)', opacity: 0.9, filter: 'brightness(1) drop-shadow(0 0 6px #ffe27a)' }
        ], { duration: 1150, delay: i * 180, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'forwards' });
        anim.onfinish = () => { node.remove(); resolve(); };
        anim.oncancel = () => { node.remove(); resolve(); };
    }));
    await Promise.all(flights);
    to.classList.remove('trophy-hand-glow'); void to.offsetWidth; to.classList.add('trophy-hand-glow');
    setTimeout(() => to.classList.remove('trophy-hand-glow'), 800);
},

async _playEvents(events, fast = false) {
    const runtime = global.FurryGame && global.FurryGame.CombatRuntime;
    const wait = ms => runtime
        ? runtime.wait((fast || this._onlineAnimationFast) ? Math.max(60, Math.round(ms * 0.22)) : ms)
        : new Promise(resolve => setTimeout(resolve, (fast || this._onlineAnimationFast) ? Math.max(60, Math.round(ms * 0.22)) : ms));
    const orderedEvents = this._animationOrder(events);
    const drawRemaining = { player: 0, ai: 0, ai2: 0 };
    this._drawAnimationRemaining = drawRemaining;
    for (const event of orderedEvents) {
        if (!event || event.type !== 'draw') continue;
        const owner = event.who === 'ai2' ? 'ai2' : event.who === 'ai' ? 'ai' : event.who === 'player' ? 'player' : null;
        if (owner) drawRemaining[owner] += Math.max(0, Number(event.count) || 1);
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
                this._renderPlayerHand();
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
            const desc = evt.desc || ('12面骰：' + value);
            this._showZoneDesc('reveal-desc', '12面骰投掷中…');
            if (typeof this._playD12Animation === 'function') {
                await this._playD12Animation(value, { desc, who: evt.who, outcome: evt.outcome });
            } else {
                await wait(450);
            }
            // Fly can fail and lead to another guard choice. Restore the
            // skill's card reference after the transient die animation.
            if((this._judgmentCards||[]).length)this._paintJudgmentCards(this._judgmentCards);
            this._showZoneDesc('reveal-desc', desc);
            await wait(220);
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
                this.playFloatingText(damageFloat(evt.amount, '', evt.floatText), '#ff4444', side);
            }
            this._playHitFeedback(side, evt.amount);
            await wait(400);
        } else if (evt.type === 'burnSettle') {
            const side = this._eventTarget(evt);
            const amt = Math.max(0, Number(evt.amount) || 0);
            const text = amt > 0
                ? damageFloat(amt, '[灼伤]，-1[灼伤层数]')
                : (evt.desc || '');
            this.playFloatingText(text, '#ff8800', side);
            if (this.state[side]) { this._updateHpBar(side, this._feedbackEntity(evt, side)); this._updateBuffs(side, this._feedbackEntity(evt, side)); }
            if (amt > 0) { this.shakeScreen(Math.min(amt * 2, 10), 300); const hpEl = document.getElementById(side + '-hp-section'); if (hpEl) { const r = hpEl.getBoundingClientRect(); this.burstParticles(r.left + r.width / 2, r.top + r.height / 2, 'rgba(255,136,0,0.8)', Math.min(amt * 3, 20)); } }
            await wait(500);
        } else if (evt.type === 'bleedSettle') {
            const side = this._eventTarget(evt);
            const amt = Math.max(0, Number(evt.amount) || 0);
            const text = amt > 0
                ? damageFloat(amt, '[流血]，-1[流血层数]')
                : (evt.desc || '');
            this.playFloatingText(text, '#cc2222', side);
            if (this.state[side]) { this._updateHpBar(side, this._feedbackEntity(evt, side)); this._updateBuffs(side, this._feedbackEntity(evt, side)); }
            if (amt > 0) { this.shakeScreen(Math.min(amt * 2, 10), 300); const hpEl = document.getElementById(side + '-hp-section'); if (hpEl) { const r = hpEl.getBoundingClientRect(); this.burstParticles(r.left + r.width / 2, r.top + r.height / 2, 'rgba(204,34,34,0.8)', Math.min(amt * 3, 20)); } }
            await wait(500);
        } else if (evt.type === 'poisonSettle') {
            const side = this._eventTarget(evt);
            const amt = Math.max(0, Number(evt.amount) || 0);
            const text = amt > 0
                ? damageFloat(amt, '[中毒]')
                : (evt.desc || '');
            this.playFloatingText(text, '#84cc16', side);
            if (this.state[side]) { this._updateHpBar(side, this._feedbackEntity(evt, side)); this._updateBuffs(side, this._feedbackEntity(evt, side)); }
            if (amt > 0) { this.shakeScreen(Math.min(amt * 2, 10), 300); }
            await wait(500);
        } else if (evt.type === 'bombExplode') {
            const side = this._eventTarget(evt);
            const amt = Math.max(0, Number(evt.amount) || 0);
            const text = amt > 0
                ? damageFloat(amt, '[定时炸弹]')
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
                    this.playFloatingText(damageFloat(amt, '', evt.floatText), '#ff4444', side);
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
                        ? damageFloat(amt, '[' + tag + ']')
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
            const text = amt > 0 ? damageFloat(amt, '[' + tag + ']') : (evt.desc || '');
            this.playFloatingText(text, color, side);
            if (this.state[side]) { this._updateHpBar(side, this._feedbackEntity(evt, side)); this._updateBuffs(side, this._feedbackEntity(evt, side)); }
            if (amt > 0) { this.shakeScreen(Math.min(amt * 2, 10), 300); }
            await wait(500);
        } else if (evt.type === 'buff') {
            const side = this._eventTarget(evt);
            const colors = {
                burn: '#ff8800', bleed: '#cc2222', freeze: '#44aaff', guard: '#00bcd4',
                poison: '#84cc16', thorns: '#facc15', sandblind: '#d6b07c', quicksand: '#d6b07c', crit: '#fbbf24', magmaVein: '#f97316', fly: '#a5b4fc', lush: '#4ade80',
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
            this.playFloatingText(evt.desc || '', color, side);
            if (this.state[side]) { this._updateHpBar(side, this._feedbackEntity(evt, side)); this._updateBuffs(side, this._feedbackEntity(evt, side)); }
            await wait(400);
        } else if (evt.type === 'gameOver') {
            this.playFloatingText(evt.desc || '游戏结束', '#ffd700', 'player');
            await wait(1500);
        } else if (evt.type === 'trophyDrop' && Array.isArray(evt.drops) && evt.drops.length) {
            await this._playTrophyDropAnimation(evt.drops);
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
        this._onlineAnimationFast = previousOnlineFast;
    }
}
    });
})(window);
