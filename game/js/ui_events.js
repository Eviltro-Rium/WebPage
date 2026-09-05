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
    await Bridge.call('clearEvents', { throughId: Math.max(...ids) });
},


async _consumeEvents(events, options = {}) {
    // State-diff animations are only a legacy fallback for bridge snapshots
    // that contain no playable events. Once an event batch is played, the
    // event handlers are the single source of floating feedback; the next
    // render must not replay the same transition from prev/current state.
    if (events && events.length) this._skipStateDiffAnimations = true;
    const wasConsumingEvents = this._isConsumingEvents;
    this._isConsumingEvents = true;
    let pending = [...(events || [])];
    const consumedIds = new Set();
    let batches = 0;
    try {
        while (pending.length && batches++ < 40) {
            const batch = pending.filter((evt, index) => {
                const key = Number.isFinite(Number(evt.id)) ? `id:${evt.id}` : `batch:${batches}:${index}`;
                if (consumedIds.has(key)) return false;
                consumedIds.add(key);
                return true;
            });
            if (!batch.length) {
                await this._ackEvents(pending);
                break;
            }
            try {
                await this._playEvents(batch, !!options.fastFirstBatch && batches === 1);
            } catch (error) {
                console.error('[Events] batch animation failed', error);
                this.showError('动画异常已跳过，游戏继续');
            } finally {
                // Even if a visual effect fails, acknowledge the batch so the same
                // event cannot be replayed forever by the AI poller.
                await this._ackEvents(batch);
            }
            const freshState = await Bridge.getState();
            if (!freshState || freshState.error) break;
            this.state = freshState;
            pending = freshState.events || [];
        }
        if (batches >= 40 && pending.length) {
            console.error('[Events] safety limit reached', pending);
            this.showError('事件过多，已切换为安全模式继续游戏');
        }
    } finally {
        this._isConsumingEvents = wasConsumingEvents;
    }
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


async _playEvents(events, fast = false) {
    const wait = ms => new Promise(resolve => setTimeout(resolve, fast ? Math.max(60, Math.round(ms * 0.22)) : ms));
    const orderedEvents = this._animationOrder(events);
    if (orderedEvents.some(evt => this._isDefenseJudgmentEvent(evt))) {
        // Clear a judgment card that may have been painted from the final
        // state snapshot before the defense animation begins.
        this._resetRevealBeforeDefenseJudgment();
    }
    for (const evt of orderedEvents) {
        try {
          if (evt.type === 'aiPlay') {
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
            await wait(1400);
        } else if (evt.type === 'playerPlay' && evt.card) {
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
                this._renderPlayerHand();
                if (this.state && this.state.is1v2 && this._renderAIHand1v2) this._renderAIHand1v2();
                else this._renderAIHand();
                const playerHand = document.getElementById('player-hand');
                const aiHand = document.getElementById(evt.target === 'ai2' || evt.who === 'ai2' ? 'ai2-hand' : 'ai-hand');
                if (playerHand) playerHand.classList.add('hand-swap-arrive');
                if (aiHand) aiHand.classList.add('hand-swap-arrive');
                await wait(460);
                if (playerHand) playerHand.classList.remove('hand-swap-arrive');
                if (aiHand) aiHand.classList.remove('hand-swap-arrive');
            } else {
                const side = evt.who === 'ai2' ? 'ai2' : evt.who === 'ai' ? 'ai' : 'player';
                if (this.state[side]) {
                    this._updateHpBar(side, this.state[side]);
                    this._updateBuffs(side, this.state[side]);
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
            await wait(800);
        } else if (evt.type === 'draw') {
            const count = evt.count || 1;
            const drawTarget = evt.who === 'player' ? 'player-hand' : evt.who === 'ai2' ? 'ai2-hand' : 'ai-hand';
            const target = document.getElementById(drawTarget);
            this._showZoneDesc('reveal-desc', evt.desc || '抽牌');
            // Keep newly drawn cards invisible until the fly-in finishes,
            // so they do not pop into the hand while backs are still flying.
            if (evt.who === 'player') {
                this._animatedPlayerDraws += count;
                this._renderPlayerHand({ hideTrailing: count });
            } else if (evt.who === 'ai2' && this._renderAIHand1v2) {
                this._renderAIHand1v2({ hideTrailing: count, who: 'ai2' });
            } else if (this.state && this.state.is1v2 && this._renderAIHand1v2) {
                this._renderAIHand1v2({ hideTrailing: count, who: 'ai' });
            } else {
                this._renderAIHand({ hideTrailing: count });
            }
            if (typeof this.state.deck === 'number') this._drawDeckIcon(this.state.deck);
            try {
                if (target) await this.anim.drawCards(count, evt.who === 'player', target);
            } finally {
                // Draw events only hide the trailing cards during flight. The
                // engine hand is authoritative, so never leave that mask on
                // when an animation is interrupted by polling or a DOM change.
                if (evt.who === 'player') this._renderPlayerHand({ hideTrailing: 0 });
                else if (evt.who === 'ai2' && this._renderAIHand1v2) this._renderAIHand1v2({ hideTrailing: 0, who: 'ai2' });
                else if (this.state && this.state.is1v2 && this._renderAIHand1v2) this._renderAIHand1v2({ hideTrailing: 0, who: 'ai' });
                else this._renderAIHand({ hideTrailing: 0 });
            }
            await wait(120);
        } else if (evt.type === 'reveal' && evt.card) {
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
            await this._playRevealAnimation(evt.card, evt.who, evt.from);
            this._showZoneDesc('reveal-desc', evt.desc || '判定');
            if (evt.who === 'player' || evt.from === 'deck') this._renderPlayerHand();
            await wait(1200);
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
        } else if (evt.type === 'discardMany' && evt.cards && evt.cards.length) {
            await this._playDiscardManyAnimation(evt);
            this._showZoneDesc('reveal-desc', evt.desc || `${evt.cards.length}张牌已放入弃牌库底`);
            await wait(120);
        } else if (evt.type === 'discard' && evt.card) {
            await this._playDiscardAnimation(evt);
            this._showZoneDesc('reveal-desc', evt.desc || (evt.destination === 'top' ? '卡牌成为弃牌库顶' : '卡牌已放入弃牌库底'));
            await wait(140);
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
        } else if (evt.type === EVENT_TYPES.HIT) {
            const side = this._eventTarget(evt);
            if (this.state[side]) { this._updateHpBar(side, this.state[side]); this._updateBuffs(side, this.state[side]); }
            // 普通扣血显示简洁的红色数字；不再复用冗余的“[伤害]”标签。
            if (Number(evt.amount) > 0) {
                this.playFloatingText(evt.floatText || `-${evt.amount}`, '#ff4444', side);
            }
            this._playHitFeedback(side, evt.amount);
            await wait(400);
        } else if (evt.type === 'burnSettle') {
            const side = this._eventTarget(evt);
            this.playFloatingText(evt.desc || '', '#ff8800', side);
            if (this.state[side]) { this._updateHpBar(side, this.state[side]); this._updateBuffs(side, this.state[side]); }
            if (evt.amount > 0) { this.shakeScreen(Math.min(evt.amount * 2, 10), 300); const hpEl = document.getElementById(side + '-hp-section'); if (hpEl) { const r = hpEl.getBoundingClientRect(); this.burstParticles(r.left + r.width / 2, r.top + r.height / 2, 'rgba(255,136,0,0.8)', Math.min(evt.amount * 3, 20)); } }
            await wait(500);
        } else if (evt.type === 'bleedSettle') {
            const side = this._eventTarget(evt);
            this.playFloatingText(evt.desc || '', '#cc2222', side);
            if (this.state[side]) { this._updateHpBar(side, this.state[side]); this._updateBuffs(side, this.state[side]); }
            if (evt.amount > 0) { this.shakeScreen(Math.min(evt.amount * 2, 10), 300); const hpEl = document.getElementById(side + '-hp-section'); if (hpEl) { const r = hpEl.getBoundingClientRect(); this.burstParticles(r.left + r.width / 2, r.top + r.height / 2, 'rgba(204,34,34,0.8)', Math.min(evt.amount * 3, 20)); } }
            await wait(500);
        } else if (evt.type === 'poisonSettle') {
            const side = this._eventTarget(evt);
            this.playFloatingText(evt.desc || '', '#84cc16', side);
            if (this.state[side]) { this._updateHpBar(side, this.state[side]); this._updateBuffs(side, this.state[side]); }
            if (evt.amount > 0) { this.shakeScreen(Math.min(evt.amount * 2, 10), 300); }
            await wait(500);
        } else if (evt.type === 'bombExplode') {
            const side = this._eventTarget(evt);
            this.playFloatingText(evt.desc || '炸弹爆炸！', '#ff4444', side);
            if (this.state[side]) { this._updateHpBar(side, this.state[side]); this._updateBuffs(side, this.state[side]); }
            this.shakeScreen(10, 400);
            const hpEl = document.getElementById(side + '-hp-section');
            if (hpEl) { const r = hpEl.getBoundingClientRect(); this.burstParticles(r.left + r.width / 2, r.top + r.height / 2, 'rgba(255,68,68,0.9)', 25); }
            await wait(600);
        } else if (evt.type === 'hurt') {
            const side = this._eventTarget(evt);
            // 普通伤害由 kind=normal 表示；旧事件没有 kind 时按普通伤害兼容。
            // 规则字段决定表现，不再解析 desc 文本。
            const kind = evt.kind || (evt.poison ? DAMAGE_KINDS.POISON : evt.bleed ? DAMAGE_KINDS.BLEED : evt.drain ? DAMAGE_KINDS.DRAIN : DAMAGE_KINDS.NORMAL);
            if (kind === DAMAGE_KINDS.NORMAL) {
                if (!evt.suppressFloat && Number(evt.amount) > 0) {
                    this.playFloatingText(evt.floatText || `-${evt.amount}`, '#ff4444', side);
                }
            } else {
                const color = kind === DAMAGE_KINDS.POISON ? '#84cc16' : kind === DAMAGE_KINDS.BLEED ? '#cc2222' : '#ff4444';
                if (!evt.suppressFloat) this.playFloatingText(evt.desc || '', color, side);
            }
            if (this.state[side]) { this._updateHpBar(side, this.state[side]); this._updateBuffs(side, this.state[side]); }
            this._playHitFeedback(side, evt.amount);
            await wait(400);
        } else if (evt.type === 'buffSettle') {
            const kind = evt.kind || 'burn';
            const color = kind === DAMAGE_KINDS.BLEED ? '#cc2222' : kind === DAMAGE_KINDS.POISON ? '#84cc16' : '#ff8800';
            const side = this._eventTarget(evt);
            this.playFloatingText(evt.desc || '', color, side);
            if (this.state[side]) { this._updateHpBar(side, this.state[side]); this._updateBuffs(side, this.state[side]); }
            if (evt.amount > 0) { this.shakeScreen(Math.min(evt.amount * 2, 10), 300); }
            await wait(500);
        } else if (evt.type === 'buff') {
            const side = this._eventTarget(evt);
            const colors = { burn: '#ff8800', bleed: '#cc2222', freeze: '#44aaff', guard: '#00bcd4', poison: '#84cc16', crit: '#fbbf24' };
            this.playFloatingText(evt.desc || '', colors[evt.kind] || '#c4b5fd', side);
            if (this.state[side]) {
                let ch = this.state[side];
                if (evt.stacks != null && evt.kind) {
                    const preview = Object.assign({}, ch);
                    if (evt.kind === 'freeze') preview.frozen = evt.stacks > 0;
                    else if (evt.kind === 'guard') preview.guard = evt.stacks;
                    else if (evt.kind === 'crit') preview.crit = evt.stacks;
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
            if (this.state[side]) { this._updateHpBar(side, this.state[side]); this._updateBuffs(side, this.state[side]); }
            await wait(400);
        } else if (evt.type === 'gameOver') {
            this.playFloatingText(evt.desc || '游戏结束', '#ffd700', 'player');
            await wait(1500);
        } else if (evt.type === 'dualDice') {
            if (typeof this._playDualDiceAnimation === 'function') {
                await this._playDualDiceAnimation(evt.roll, evt.target);
            }
        }
        } catch (error) {
            console.error('[Animation] skipped event', evt && evt.id, error);
            this.showError('动画已跳过，游戏继续');
        }
    }
}
    });
})(window);
