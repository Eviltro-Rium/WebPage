/* Hand rendering: player hand, NPC hand, hover tooltips and skill
 * descriptions attached to cards. */
(function (global) {
    const GameUI = global.GameUI;
    if (!GameUI) {
        console.error('[UI hands] GameUI must be loaded first');
        return;
    }
    Object.assign(GameUI.prototype, {
        _renderPlayerHand(options = {}) {
            const s = this.state;
            const container = document.getElementById('player-hand');
            if (!container || !s || !s.playerHand) return;
            const hideTrailing = this._hideTrailingCount(options, 'player');
            const canInteract = s.onlineCanAct !== false && ['PLAYER_PLAY', 'PLAYER_DEFEND', 'PLAYER_FIVE_CHOICE',
                'PLAYER_SEVEN_CHOICE', 'SAIKI_THREE_CHOICE', 'SAIKI_SIX_JUDGE', 'PLAYER_DISCARD'].includes(s.phase);
            const isDefend = s.phase === 'PLAYER_DEFEND';
            // legalHand is only a play/defend legality mask.  Do not apply a
            // stale mask while selecting cards for discard or a skill choice.
            const isPlayPhase = s.phase === 'PLAYER_PLAY' || s.phase === 'PLAYER_DEFEND';
            // NPC hand focus is a separate, local hover/peek affordance.  If a
            // player card is selected, never leave a stale NPC focus marker in
            // place — otherwise the opponent hand looks selected as well.
            if (s.selectedCard >= 0) this._npcHandFocusIndex = -1;
            const handKey = JSON.stringify([
                s.onlineCanAct,
                s.phase,
                s.selectedCard,
                s.selectedCards || [],
                s.needColorChoice,
                s.unblockDefend,
                s.legalHand || null,
                hideTrailing,
                (s.playerHand || []).map(cardVisualKey),
                (s.chanFiveCards || []).map(cardVisualKey)
            ]);
            if (container.dataset.handRenderKey === handKey && container.children.length === s.playerHand.length) return;
            container.dataset.handRenderKey = handKey;
            container.innerHTML = '';
            container.ondblclick = null;
            const handleDoubleClick = async (index) => {
                const state = this.state;
                if (!state || !Array.isArray(state.playerHand)) return;
                const phase = state.phase;
                if (state.onlineCanAct === false || (phase !== 'PLAYER_PLAY' && phase !== 'PLAYER_DEFEND')) return;
                if (state.needColorChoice || (phase === 'PLAYER_DEFEND' && state.unblockDefend)) return;
                if (this._isHandlingAction || this._isConsumingEvents) return;
                const card = state.playerHand[index];
                if (!card || (state.legalHand && state.legalHand[index] === false)) return;
                this._npcHandFocusIndex = -1;
                if (state.selectedCard !== index) {
                    const selected = typeof this._sessionDispatch === 'function'
                        ? await this._sessionDispatch('selectCard', { index })
                        : await Bridge.call('selectCard', { index });
                    if (!selected || selected.error) return;
                    this.state = selected;
                    this.updateDisplay();
                }
                const action = phase === 'PLAYER_DEFEND' ? 'doDefend' : 'doPlay';
                if (typeof this._apiAction === 'function') await this._apiAction(action);
                else {
                    const result = typeof this._sessionDispatch === 'function'
                        ? await this._sessionDispatch(action)
                        : await Bridge.call(action);
                    if (result && !result.error) { this.state = result; this.updateDisplay(); }
                }
            };
            for (let i = 0; i < s.playerHand.length; i++) {
                const card = s.playerHand[i];
                const sel = i === s.selectedCard || ((s.selectedCards || []).includes(i));
                const isUnplayable = isPlayPhase && Array.isArray(s.legalHand) && s.legalHand[i] === false;
                const [cw, ch] = currentCardSize();
                const cv = renderCard(card, cw, ch, sel);
                if (!canInteract) cv.classList.add('disabled');
                else if (isUnplayable) {
                    cv.classList.add('card-unplayable');
                    cv.setAttribute('aria-disabled', 'true');
                } else if (Array.isArray(s.legalHand) && s.legalHand[i]) cv.classList.add('card-playable');
                if (hideTrailing && i >= s.playerHand.length - hideTrailing) cv.classList.add('card-draw-pending');
                cv.dataset.index = i;
                cv.dataset.cardId = cardId(card);
                // An illegal card is inert: it cannot be selected by either click
                // path, and does not steal hover focus from a playable card.
                if (!isUnplayable) {
                    cv.addEventListener('click', async (event) => {
                        if (this._isHandlingAction || this._isConsumingEvents) return;
                        if (cv.classList.contains('disabled')) return;
                        if (this.state && (this.state.needColorChoice || this.state.onlineCanAct === false)) return;
                        const idx = parseInt(cv.dataset.index, 10);
                        if (!Number.isInteger(idx)) return;
                        this._npcHandFocusIndex = -1;
                        const now = Date.now();
                        const previous = this._lastPlayerHandClick;
                        const isDoubleClick = previous && previous.index === idx && now - previous.time < 600;
                        if (isDoubleClick) {
                            this._lastPlayerHandClick = null;
                            event.preventDefault();
                            if (previous.promise) await previous.promise;
                            await handleDoubleClick(idx);
                            return;
                        }
                        if (this._isSelectingCard) return;
                        this._lastPlayerHandClick = { index: idx, time: now, promise: null };
                        const selection = (async () => {
                            this._isSelectingCard = true;
                            try {
                            const result = typeof this._sessionDispatch === 'function'
                                ? await this._sessionDispatch('selectCard', { index: idx })
                                : await Bridge.call('selectCard', { index: idx });
                            if (result && !result.error) { this.state = result; this.updateDisplay(); }
                            } finally { this._isSelectingCard = false; }
                        })();
                        this._lastPlayerHandClick.promise = selection;
                        await selection;
                    });
                }

                // Keep the skill explanation attached to the card itself.  The
                // old centered tooltip under the title has been removed.
                if (canInteract) {
                    cv.addEventListener('mouseenter', () => this._showTooltip(card, cv, isDefend));
                    cv.addEventListener('mouseleave', () => this._hideTooltip());
                }

                container.appendChild(cv);
            }
            if (s.chanFiveCards && s.chanFiveCards.length > 0 && s.onlineCanAct !== false) {
                this.dialogs.showChanFiveDialog(s);
            }
        },

        _resolveHandSkillDesc(charName, card, isDefend, adventureOpts) {
            let desc = '';
            if (adventureOpts) {
                const bridge = window.AdventureMonsterBridge;
                if (bridge && typeof bridge.getAdventureNpcSkillDesc === 'function') {
                    desc = bridge.getAdventureNpcSkillDesc(charName, card, isDefend, adventureOpts) || '';
                }
            }
            if (!desc && typeof getSkillDesc === 'function') {
                desc = getSkillDesc(charName, card, isDefend) || '';
            }
            return desc;
        },

        _showTooltip(card, anchorEl, isDefend, opts = {}) {
            this._hideTooltip();
            const s = this.state;
            if (!s || !card || !anchorEl) return;
            const charName = opts.charName || card.borrowedMonsterName || (s.player ? s.player.name.replace(/^AI\d*\s+/, '') : '');
            if (!charName) return;
            let desc = this._resolveHandSkillDesc(charName, card, isDefend, opts.adventureOpts);
            if (!desc && opts.adventureOpts) desc = isDefend ? '无防御效果' : '无进攻效果';
            if (!desc) return;

            const tip = document.createElement('div');
            tip.id = 'card-tooltip';
            tip.className = 'card-tooltip';
            const title = document.createElement('div');
            title.className = 'tooltip-title';
            title.textContent = charName + ' ' + (card.isItemCard ? (card.isBlack ? '黑牌' : card.isWhite ? '白牌' : '道具') : card.value + '牌');
            tip.appendChild(title);
            const body = document.createElement('div');
            body.className = 'tooltip-body';
            for (const seg of parseSegments(desc, '#e6e6f0')) {
                const span = document.createElement('span');
                span.textContent = seg.text;
                span.style.color = seg.color;
                body.appendChild(span);
            }
            tip.appendChild(body);
            document.body.appendChild(tip);
            const r = anchorEl.getBoundingClientRect();
            tip.style.left = Math.min(r.left, window.innerWidth - tip.offsetWidth - 10) + 'px';
            tip.style.top = Math.max(10, r.top - tip.offsetHeight - 8) + 'px';
        },

        _hideTooltip() {
            const el = document.getElementById('card-tooltip');
            if (el) el.remove();
        },

        _combatDisplayName(name) {
            return String(name || '').replace(/^AI\d*\s+/, '');
        },

        _updateAdventureNpcLabels(s) {
            const zones = document.querySelectorAll('.ai-hands-stack > .ai-hand-zone');
            zones.forEach((zoneEl) => {
                const titleEl = zoneEl.querySelector('.zone-title');
                const owner = zoneEl.dataset.owner || 'ai';
                const idx = owner === 'ai2' ? 'II' : 'I';
                // 标题始终显示"对手I/II"，不附加角色名
                if (titleEl) titleEl.textContent = '对手' + idx;
                // 1v1 时隐藏对手II手牌区
                if (owner === 'ai2') {
                    zoneEl.hidden = !s || !s.is1v2 || !s.ai2;
                }
            });
        },

        _findHandCardElement(handEl, card) {
            if (!handEl || !card) return null;
            const wantId = cardId(card);
            const wantMatch = cardMatchKey(card);
            const nodes = Array.from(handEl.querySelectorAll('.card-canvas'));
            let match = nodes.find(el => el.dataset && el.dataset.cardId === wantId);
            if (match) return match;
            match = nodes.find(el => el.dataset && el.dataset.cardMatch === wantMatch);
            if (match) return match;
            return null;
        },

        _renderAIHand(options = {}) {
            const s = this.state;
            const container = document.getElementById('ai-hand');
            container.innerHTML = '';
            const canSelect = s.onlineCanAct !== false && (s.phase === 'OPPONENT_CARD_CHOICE' || (s.phase === 'PLAYER_SEVEN_CHOICE' && !s.chanFourSwapMode && !s.chanSevenKeepMode) || (s.phase === 'SAIKI_THREE_CHOICE' && !s.saikiThreeDrawn));
            const hideTrailing = this._hideTrailingCount(options, 'ai');
            const revealMode = !!s.aiHand && Array.isArray(s.aiHand);
            const handSize = Math.max(Number(s.aiHandSize) || 0, revealMode ? s.aiHand.length : 0);
            const canPeekSkill = !!(s.isAdventure && revealMode && (s.phase === 'PLAYER_PLAY' || s.phase === 'PLAYER_DEFEND'));
            if (!canPeekSkill) this._npcHandFocusIndex = -1;
            else if (this._npcHandFocusIndex >= handSize) this._npcHandFocusIndex = -1;

            for (let i = 0; i < handSize; i++) {
                const card = revealMode ? s.aiHand[i] : null;
                const focused = canPeekSkill && i === this._npcHandFocusIndex;
                // Do not pass NPC focus through the shared `selected` flag.
                // That flag is reserved for the player's active card and its
                // global `.selected` style made a stale NPC peek look like a
                // second player selection.  Use a dedicated class instead.
                const cv = revealMode ? renderCard(card, 40, 58, false, { isNpc: !!s.isAdventure }) : renderCardBack(40, 58);
                if (focused) cv.classList.add('npc-card-focused');
                if (revealMode && card) {
                    cv.dataset.cardId = cardId(card);
                    cv.dataset.cardMatch = cardMatchKey(card);
                }
                cv.dataset.aiIndex = i;
                if (hideTrailing && i >= handSize - hideTrailing) cv.classList.add('card-draw-pending');
                if (canSelect) {
                    cv.style.cursor = 'pointer'; cv.classList.add('selectable-ai-card');
                    if (i === s.selectedAICard) cv.style.border = '3px solid #ffdc3c';
                    cv.addEventListener('click', async () => {
                        await this._apiAction('chooseAICard', { index: parseInt(cv.dataset.aiIndex, 10) });
                    });
                } else if (canPeekSkill) {
                    cv.style.cursor = 'pointer';
                    cv.classList.add('selectable-ai-card');
                    if (focused) cv.style.border = '3px solid #a78bfa';
                    cv.addEventListener('click', async () => {
                        const idx = parseInt(cv.dataset.aiIndex, 10);
                        this._npcHandFocusIndex = this._npcHandFocusIndex === idx ? -1 : idx;
                        const selected = this.state && this.state.selectedCard;
                        if (this._npcHandFocusIndex >= 0 && selected >= 0) {
                            const result = await Bridge.call('selectCard', { index: selected });
                            if (result && !result.error) this.state = result;
                        }
                        this.updateDisplay();
                    });
                }
                if (revealMode && card && (s.phase === 'PLAYER_PLAY' || s.phase === 'PLAYER_DEFEND')) {
                    const charName = this._combatDisplayName(s.ai && s.ai.name);
                    const adventureOpts = {
                        stage: s.adventureStage || s.stage || 1,
                        playerHandSize: (s.playerHand && s.playerHand.length) || 0,
                        incomingDamage: s.pendingDefenseDamage || 0
                    };
                    cv.addEventListener('mouseenter', () => this._showTooltip(card, cv, true, { charName, adventureOpts }));
                    cv.addEventListener('mouseleave', () => this._hideTooltip());
                }
                container.appendChild(cv);
            }
            if (s.chanSevenKeepMode && s.chanSevenChosenCard) {
                const revealed = renderCard(s.chanSevenChosenCard, 50, 72, false);
                revealed.classList.add('ai-revealed-card');
                revealed.style.marginLeft = '8px';
                container.appendChild(revealed);
            }
        }
    });
})(window);
