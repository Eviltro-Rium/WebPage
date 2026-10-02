/* Rendering and visual card animation mixins for the classic UI. */
(function (global) {
    const GameUI = global.GameUI;
    if (!GameUI) {
        console.error('[UI renderer] GameUI must be loaded first');
        return;
    }
    const wait = ms => global.FurryGame && global.FurryGame.CombatRuntime
        ? global.FurryGame.CombatRuntime.wait(ms)
        : new Promise(resolve => setTimeout(resolve, ms));
    const animDuration = (ui, ms) => ui && ui.state && ui.state.isOnline && ui._onlineAnimationFast
        ? Math.max(100, Math.round(ms * 0.55)) : ms;
    Object.assign(GameUI.prototype, {
_showZoneDesc(id, desc) {
    const el = document.getElementById(id);
    if (!el) return;
    const segs = parseSegments(desc, '');
    el.innerHTML = '';
    el.classList.remove('is-expanded');
    const text = document.createElement('span');
    text.className = 'desc-text';
    for (const seg of segs) {
        const span = document.createElement('span');
        span.textContent = seg.text;
        if (seg.color) span.style.color = seg.color;
        text.appendChild(span);
    }
    el.appendChild(text);
    const plain = String(desc || '');
    const needsToggle = plain.length > 12;
    if (needsToggle) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'zone-desc-toggle';
        toggle.textContent = '‹';
        toggle.title = '展开完整说明';
        toggle.setAttribute('aria-label', '展开完整说明');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.addEventListener('click', (event) => {
            event.stopPropagation();
            const expanded = el.classList.toggle('is-expanded');
            toggle.textContent = expanded ? '›' : '‹';
            toggle.title = expanded ? '收起说明' : '展开完整说明';
            toggle.setAttribute('aria-label', toggle.title);
            toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        });
        el.appendChild(toggle);
        uiFrame(() => {
            if (!el.isConnected || el.classList.contains('is-expanded')) return;
            if (text.scrollHeight <= text.clientHeight + 1 && plain.length <= 28) {
                toggle.remove();
            }
        });
    }
},

_showCardSkillDesc(id, card, owner, isDefend) {
    if (!card || !this.state) return;
    const s = this.state;
    const participant = owner === 'ai2' ? s.ai2 : owner === 'ai' ? s.ai : s.player;
    if (!participant) return;
    // Prefer the card's borrowed-monster name, else the acting participant.
    // Never fall back to the opponent's name when owner is missing — that was
    // painting player skill text onto NPC attack/defend zones.
    const charName = card.borrowedMonsterName || this._combatDisplayName(participant.name);
    const adventureOpts = s.isAdventure ? this._adventureSkillDescOpts(owner) : null;
    const skill = this._resolveHandSkillDesc(charName, card, isDefend, adventureOpts) || (isDefend ? '执行防御效果' : '执行进攻效果');
    this._showZoneDesc(id, skill);
},

_adventureSkillDescOpts(owner) {
    const s = this.state;
    if (!s) return null;
    const attackerKey = owner === 'ai2' ? 'ai2' : owner === 'ai' ? 'ai' : 'player';
    const attacker = s[attackerKey] || s.player;
    const player = s.player || {};
    const attackerHand = attackerKey === 'player'
      ? (s.playerHand || [])
      : (attackerKey === 'ai2' ? (s.ai2Hand || []) : (s.aiHand || []));
    return {
        stage: s.adventureStage || s.stage || 1,
        playerHandSize: (s.playerHand && s.playerHand.length) || 0,
        attackerHandSize: Array.isArray(attackerHand) ? attackerHand.length : 0,
        attackerHand: Array.isArray(attackerHand) ? attackerHand : [],
        playerPoison: Number(player.poison) || 0,
        playerBleed: Number(player.bleed) || 0,
        attackerLush: Number(attacker && attacker.lush) || 0,
        incomingDamage: s.pendingDefenseDamage || (s.pendingAttack && s.pendingAttack.damage) || 0
    };
},

_hideZoneDesc(id) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = '';
        el.classList.remove('is-expanded');
    }
},

_drawDeckIcon(count) {
    const c = document.getElementById('deck-icon');
    if (!c) return;
    const normalizedCount = Number(count) || 0;
    if (c.dataset.deckCount === String(normalizedCount)) return;
    c.dataset.deckCount = String(normalizedCount);
    const g = c.getContext('2d');
    g.clearRect(0, 0, 40, 52);
    const layers = Math.min(3, Math.ceil(normalizedCount / 20));
    for (let i = layers - 1; i >= 0; i--) {
        const ox = i * 2, oy = i * 2;
        g.fillStyle = i === 0 ? '#4a5568' : '#2d3748';
        g.strokeStyle = '#718096'; g.lineWidth = 0.8;
        g.beginPath();
        g.roundRect(ox + 2, oy + 2, 32, 44, 3);
        g.fill(); g.stroke();
    }
    if (normalizedCount > 0) {
        g.fillStyle = '#a0aec0'; g.font = 'bold 11px sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(normalizedCount, 18, 24);
    } else {
        g.fillStyle = '#4a5568'; g.font = '9px sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('空', 18, 24);
    }
},

_clearZones() {
    if (this.state) { this.state.atkCard = null; this.state.defCard = null; }
    this._lastAnimatedAIDefenseKey = null;
    const atkContainer = document.getElementById('atk-cards');
    const defContainer = document.getElementById('def-cards');
    if (atkContainer) atkContainer.innerHTML = '<span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待出牌</span>';
    if (defContainer) defContainer.innerHTML = '<span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待防御</span>';
    if (atkContainer) atkContainer.dataset.cardKey = 'empty';
    if (defContainer) defContainer.dataset.cardKey = 'empty';
    const atkDesc = document.getElementById('atk-desc');
    const defDesc = document.getElementById('def-desc');
    if (atkDesc) atkDesc.textContent = '';
    if (defDesc) defDesc.textContent = '';
    const actionDesc = document.getElementById('action-desc');
    if (actionDesc) actionDesc.textContent = '';
},

_pendingDrawMask(owner) {
    const remaining = this._drawAnimationRemaining;
    return Math.max(0, Number(remaining && remaining[owner]) || 0);
},

_repaintOwnerHand(owner) {
    // Repaint one owner's hand from authoritative state after a flight that
    // may have hidden or removed a DOM element. Pending draws stay masked so
    // not-yet-flown cards never pop in early.
    if (owner === 'player') {
        this._renderPlayerHand({ hideTrailing: this._pendingDrawMask('player') });
    } else if (owner === 'ai2' && this._renderAIHand1v2) {
        this._renderAIHand1v2({ hideTrailing: this._pendingDrawMask('ai2'), who: 'ai2' });
    } else if (this.state && this.state.is1v2 && this._renderAIHand1v2) {
        this._renderAIHand1v2({ hideTrailing: this._pendingDrawMask('ai'), who: 'ai' });
    } else if (typeof this._renderAIHand === 'function') {
        this._renderAIHand({ hideTrailing: this._pendingDrawMask(owner === 'ai2' ? 'ai2' : 'ai') });
    }
},

_paintJudgmentCards(cards) {
    const box=document.getElementById('reveal-cards');
    if(!box)return;
    const list=cards||[], multi=list.length>1;
    this._judgmentCards=list;
    box.innerHTML='';
    box.classList.toggle('reveal-multi',multi);
    for(const card of list){
        const canvas=renderCard(card,multi?52:60,multi?74:86,false);
        canvas.dataset.cardId=cardId(card);
        canvas.classList.add('revealed-card');
        box.appendChild(canvas);
    }
    if(!list.length)box.innerHTML='<span class="reveal-empty">等待判定</span>';
    box.dataset.cardKey=JSON.stringify({cards:list,dice:null});
},

async _finishJudgmentAnimation(evt) {
    const box=document.getElementById('reveal-cards');
    // A refresh/final snapshot may have cleared the DOM. Carry visible faces
    // at the boundary so judgment flights never remove innocent hand cards.
    if(box&&!box.querySelector('.card-canvas')&&(evt.cards||[]).length)this._paintJudgmentCards(evt.cards);
    try {
        for(const move of evt.moves||[]){
            if(move.type==='discardMany')await this._playDiscardManyAnimation(move);
            else await this._playDiscardAnimation(move);
        }
    } finally {
        this._paintJudgmentCards([]);
        this._hideZoneDesc('reveal-desc');
    }
},

async _playDiscardAnimation(evt) {
    const discard = document.getElementById('discard-top');
    if (!discard) return;

    const owner = evt.who === 'ai2' ? 'ai2' : evt.who === 'ai' ? 'ai' : 'player';
    const hand = document.getElementById(owner === 'player' ? 'player-hand' : `${owner}-hand`);
    let source = null;

    if (evt.from === 'reveal') {
        const box=document.getElementById('reveal-cards');
        source=(box&&this._findHandCardElement(box,evt.card))||box;
        // Judgment exit, never a second discard from the owner's hand.
        if(!source)return;
    }
    // The discarded card usually left the authoritative hand before its
    // events play, so a positional index can resolve to an innocent card
    // that shifted into its place. Only consume a hand element when its
    // identity matches; otherwise anchor the flight to the hand container
    // (which is never removed) and repaint the hand afterwards.
    const wantId = evt.card ? cardId(evt.card) : null;
    const identityOk = el => !el || !el.dataset || !el.dataset.cardId || !wantId || el.dataset.cardId === wantId;
    if (!source && hand && Number.isInteger(evt.handIndex)) {
        const byIndex = hand.querySelector(`[data-index="${evt.handIndex}"]`) || hand.children[evt.handIndex];
        source = (byIndex && identityOk(byIndex)) ? byIndex : hand;
    }
    if ((!source || source === hand) && hand && evt.card) {
        const id = cardId(evt.card);
        const match = Array.from(hand.querySelectorAll('.card-canvas')).find(el => el.dataset.cardId === id) || null;
        if (match) source = match;
    }
    if (!source && hand) {
        const picked = hand.querySelector('.selected') || hand.lastElementChild || hand;
        source = identityOk(picked) ? picked : hand;
    }
    if (!source) source = document.getElementById('reveal-cards') || document.getElementById('deck-area');

    const faceUp = evt.from === 'reveal' || evt.faceUp === true || owner === 'player';
    const landsOnTop = evt.destination === 'top';
    await this.anim.discardCard(evt.card, source, discard, faceUp, { landsOnTop });
    this._repaintOwnerHand(owner);
},

async _playDiscardManyAnimation(evt) {
    const discard = document.getElementById('discard-top');
    if (!discard) return;
    const owner = evt.who === 'ai2' ? 'ai2' : evt.who === 'ai' ? 'ai' : 'player';
    const hand = document.getElementById(owner === 'player' ? 'player-hand' : `${owner}-hand`);
    const cards = Array.from(evt.cards || []);
    const faceUp = evt.from === 'reveal' || evt.faceUp === true || owner === 'player';
    const landsOnTop = evt.destination === 'top';
    const reveal=evt.from==='reveal'?document.getElementById('reveal-cards'):null;
    const container=reveal||hand;
    const handCards = container ? Array.from(container.querySelectorAll('.card-canvas')) : [];
    const used = new Set();
    const sources = cards.map(card => {
        const id = cardId(card);
        let foundIdx = -1;
        const match = handCards.find((el, idx) => {
            if (used.has(idx) || el.dataset.cardId !== id) return false;
            foundIdx = idx;
            return true;
        });
        if (match) {
            used.add(foundIdx);
            return match;
        }
        if(reveal)return reveal;
        const fallbackIdx = handCards.findIndex((_, idx) => !used.has(idx));
        if (fallbackIdx >= 0) {
            used.add(fallbackIdx);
            return handCards[fallbackIdx];
        }
        return hand || document.getElementById('reveal-cards');
    });
    for (let index = 0; index < cards.length; index++) {
        if (index) await wait(70);
        await this.anim.discardCard(cards[index], sources[index], discard, faceUp, { landsOnTop });
    }
    this._repaintOwnerHand(owner);
},

async _playHandSwapAnimation(evt) {
    const playerHand = document.getElementById('player-hand');
    const opponentKey = evt.who === 'ai2' || evt.target === 'ai2' ? 'ai2' : 'ai';
    const opponentHand = document.getElementById(`${opponentKey}-hand`);
    if (!playerHand || !opponentHand) return;

    let playerCards = this._prevState && this._prevState.playerHand
        ? this._prevState.playerHand.slice()
        : [];
    if (evt.who === 'player' && this._prevState) {
        const playedIndex = this._prevState.selectedCard;
        if (playedIndex >= 0 && playerCards[playedIndex] && playerCards[playedIndex].swapHand) {
            playerCards.splice(playedIndex, 1);
        }
    }

    const opponentCount = opponentHand.querySelectorAll('.card-canvas').length || opponentHand.children.length;
    await this.anim.swapHands(playerHand, opponentHand, playerCards, opponentCount);
},

_paintRevealedHand(container, hand) {
    if (!container) return;
    const list = hand || [];
    const existing = Array.from(container.querySelectorAll('.card-canvas'));
    if (existing.length === list.length) {
        let allMatch = true;
        for (let i = 0; i < list.length; i++) {
            if (existing[i].dataset.cardMatch !== cardMatchKey(list[i])) { allMatch = false; break; }
        }
        if (allMatch) return;
    }
    container.innerHTML = '';
    list.forEach((c, i) => {
        const cv = renderCard(c, 40, 58, false, { isNpc: !!(this.state && this.state.isAdventure) });
        if (c) {
            cv.dataset.cardId = cardId(c);
            cv.dataset.cardMatch = cardMatchKey(c);
        }
        cv.dataset.aiIndex = i;
        container.appendChild(cv);
    });
},

_prevAiHandFor(who = 'ai') {
    if (!this._prevState) return null;
    if (who === 'ai2') return Array.isArray(this._prevState.ai2Hand) ? this._prevState.ai2Hand : null;
    return Array.isArray(this._prevState.aiHand) ? this._prevState.aiHand : null;
},

async _playAICardAnimation(card, who = 'ai') {
    const aiHand = document.getElementById(who === 'ai2' ? 'ai2-hand' : 'ai-hand');
    const atkZone = document.getElementById('atk-cards');
    if (!aiHand || !atkZone) { await wait(500); return; }
    const revealFace = !!(this.state && (this.state.revealAIHand || this.state.isAdventure));
    const prevHand = this._prevAiHandFor(who);
    // 明牌：先还原出牌前手牌，再定位源牌，避免剩余手牌被误当成飞出牌
    if (revealFace && prevHand && prevHand.length) {
        this._paintRevealedHand(aiHand, prevHand);
    }
    let sourceCard = this._findHandCardElement(aiHand, card);
    if (!sourceCard && !revealFace) sourceCard = aiHand.lastElementChild;
    if (sourceCard) sourceCard.style.visibility = 'hidden';
    try {
        if (revealFace && card) {
            await this.anim.flyCard(card, sourceCard || aiHand, atkZone, animDuration(this, 440), 54, who);
        } else {
            await this.anim.flyCardBack(sourceCard || aiHand, atkZone, animDuration(this, 440), 54);
        }
    }
    finally { if (sourceCard) sourceCard.remove(); }
    this._settleZoneCard(atkZone, card, who);
},

async _playAIDefendAnimation(card, who = 'ai') {
    const aiHand = document.getElementById(who === 'ai2' ? 'ai2-hand' : 'ai-hand');
    const defZone = document.getElementById('def-cards');
    if (!aiHand || !defZone) return;
    const revealFace = !!(this.state && (this.state.revealAIHand || this.state.isAdventure));
    const prevHand = this._prevAiHandFor(who);
    if (revealFace && prevHand && prevHand.length) {
        this._paintRevealedHand(aiHand, prevHand);
    }
    let sourceCard = this._findHandCardElement(aiHand, card);
    if (!sourceCard && !revealFace) sourceCard = aiHand.lastElementChild;
    if (sourceCard) sourceCard.style.visibility = 'hidden';
    try {
        if (revealFace && card) {
            await this.anim.flyCard(card, sourceCard || aiHand, defZone, animDuration(this, 440), 42, who);
        } else {
            await this.anim.flyCardBack(sourceCard || aiHand, defZone, animDuration(this, 440), 42);
        }
    }
    finally { if (sourceCard) sourceCard.remove(); }
    this._settleZoneCard(defZone, card, who);
},

_settleZoneCard(zone, card, owner = 'player') {
    zone.innerHTML = '';
    const settled = renderCard(card, 60, 86, false, { isNpc: !!(this.state && this.state.isAdventure && owner && owner !== 'player') });
    settled.classList.add('zone-card', 'zone-card-land');
    zone.appendChild(settled);
    zone.dataset.cardKey = JSON.stringify(card);
},

async _playPlayerCardAnimation(card) {
    const playerHand = document.getElementById('player-hand');
    const atkZone = document.getElementById('atk-cards');
    if (!playerHand || !atkZone) { await wait(500); return; }
    const animationKey = cardMatchKey(card);
    this._animatingPlayerCardKey = animationKey;
    // Match by stable card identity first. Online snapshots can reorder a
    // hand between the click and the event batch, making the old selected
    // index point at a different card (or at no card at all).
    let source = this._findHandCardElement(playerHand, card);
    const selectedIndex = this._prevState ? this._prevState.selectedCard : -1;
    source = source || (selectedIndex >= 0 && playerHand.children[selectedIndex]
        ? playerHand.children[selectedIndex]
        : playerHand);
    if (source !== playerHand) source.style.visibility = 'hidden';
    try { await this.anim.flyCard(card, source, atkZone, animDuration(this, 430), 66); }
    finally {
        if (source !== playerHand) source.remove();
        if (this._animatingPlayerCardKey === animationKey) {
            this._animatingPlayerCardKey = '';
            playerHand.dataset.handRenderKey = '';
            const drawMask = this._drawAnimationRemaining && this._drawAnimationRemaining.player || 0;
            this._renderPlayerHand({ hideTrailing: drawMask });
        }
    }
    this._settleZoneCard(atkZone, card, 'player');
},

async _playPlayerDefendAnimation(card) {
    const playerHand = document.getElementById('player-hand');
    const defZone = document.getElementById('def-cards');
    if (!playerHand || !defZone) { await wait(400); return; }
    const animationKey = cardMatchKey(card);
    this._animatingPlayerCardKey = animationKey;
    const selectedIndex = this._prevState ? this._prevState.selectedCard : -1;
    const source = this._findHandCardElement(playerHand, card) || (selectedIndex >= 0 && playerHand.children[selectedIndex]
        ? playerHand.children[selectedIndex]
        : playerHand);
    if (source !== playerHand) source.style.visibility = 'hidden';
    try { await this.anim.flyCard(card, source, defZone, animDuration(this, 420), 48); }
    finally {
        if (source !== playerHand) source.remove();
        if (this._animatingPlayerCardKey === animationKey) {
            this._animatingPlayerCardKey = '';
            playerHand.dataset.handRenderKey = '';
            const drawMask = this._drawAnimationRemaining && this._drawAnimationRemaining.player || 0;
            this._renderPlayerHand({ hideTrailing: drawMask });
        }
    }
    this._settleZoneCard(defZone, card, 'player');
},

async _playRevealAnimation(cardOrCards, fromOwner, fromSource, handIndex = -1) {
    const toEl = document.getElementById('reveal-cards');
    if (!toEl) return;
    const cards = Array.isArray(cardOrCards)
        ? cardOrCards.filter(Boolean)
        : (cardOrCards ? [cardOrCards] : []);
    if (!cards.length) return;
    this._judgmentCards=cards;
    // 默认从牌库飞出；仅显式 from:'hand' 时从对应手牌飞出（追加/抽取手牌判定）
    const fromHand = fromSource === 'hand';
    let ownerEl = document.getElementById('deck-area');
    let fromEl = ownerEl;
    if (fromHand) {
        const sourceOwner = fromOwner;
        ownerEl = document.getElementById(
            sourceOwner === 'player' ? 'player-hand'
                : sourceOwner === 'ai2' ? 'ai2-hand'
                    : sourceOwner === 'ai' ? 'ai-hand'
                        : 'deck-area'
        );
        if (!ownerEl) return;
        const eventIndex = Number.isInteger(Number(handIndex)) ? Number(handIndex) : -1;
        const selectedIndex = eventIndex >= 0
            ? eventIndex
            : (sourceOwner === 'player' && this._prevState ? this._prevState.selectedCard : -1);
        fromEl = selectedIndex >= 0 && ownerEl.children[selectedIndex]
            ? ownerEl.children[selectedIndex]
            : ownerEl.lastElementChild || ownerEl;
        if (fromEl !== ownerEl) {
            // The judged card already left the hand state before events play,
            // so a positional index can point at an innocent card that shifted
            // into its place. Only hide/remove the element when its identity
            // matches the judged card; otherwise anchor to the hand container.
            const wantId = cards.length === 1 && cards[0] ? cardId(cards[0]) : null;
            if (wantId && fromEl.dataset && fromEl.dataset.cardId && fromEl.dataset.cardId !== wantId) {
                fromEl = ownerEl;
            } else {
                fromEl.style.visibility = 'hidden';
            }
        }
    }
    if (!fromEl) fromEl = document.body;

    const multi = cards.length > 1;
    const cw = multi ? 52 : 60;
    const ch = multi ? 74 : 86;
    const to = toEl.getBoundingClientRect();
    const from = fromEl.getBoundingClientRect();
    const gap = 4;
    const totalW = cards.length * cw + (cards.length - 1) * gap;
    const startX = to.left + (to.width - totalW) / 2;

    toEl.innerHTML = '';
    toEl.classList.toggle('reveal-multi', multi);

    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        // Keep the face visible when the source is the local player's hand;
        // opponent hands stay face-down until the card reaches the reveal
        // zone. The explicit hand index keeps the flight anchored to the
        // card that was actually removed instead of the whole hand stack.
        const flying = fromHand && fromOwner === 'player'
            ? renderCard(card, cw, ch, false)
            : renderCardBack(cw, ch);
        flying.style.position = 'fixed';
        flying.style.zIndex = '9999';
        flying.style.pointerEvents = 'none';
        flying.style.transition = 'left .42s ease-out, top .42s ease-out, transform .42s ease-out';
        flying.style.left = (from.left + from.width / 2 - cw / 2) + 'px';
        flying.style.top = (from.top + from.height / 2 - ch / 2) + 'px';
        document.body.appendChild(flying);
        await wait(30);
        flying.style.left = (startX + i * (cw + gap)) + 'px';
        flying.style.top = (to.top + to.height / 2 - ch / 2) + 'px';
        flying.style.transform = fromHand && fromOwner === 'player' ? 'scale(.9)' : 'rotateY(90deg) scale(.9)';
        await wait(multi ? 320 : 430);
        flying.remove();
        const shown = renderCard(card, cw, ch, false);
        shown.dataset.cardId=cardId(card);
        shown.classList.add('revealed-card');
        toEl.appendChild(shown);
    }
    if (fromHand && fromEl !== ownerEl) fromEl.remove();
    toEl.dataset.cardKey = JSON.stringify({ cards, dice: null });
}
    });
})(window);

