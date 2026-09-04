/* Rendering and visual card animation mixins for the classic UI. */
(function (global) {
    const GameUI = global.GameUI;
    if (!GameUI) {
        console.error('[UI renderer] GameUI must be loaded first');
        return;
    }
    Object.assign(GameUI.prototype, {
_showZoneDesc(id, desc) {
    const el = document.getElementById(id);
    if (!el) return;
    const segs = parseSegments(desc, '');
    el.innerHTML = '';
    for (const seg of segs) {
        const span = document.createElement('span');
        span.textContent = seg.text;
        if (seg.color) span.style.color = seg.color;
        el.appendChild(span);
    }
},

_showCardSkillDesc(id, card, owner, isDefend) {
    if (!card || !this.state) return;
    const s = this.state;
    const participant = owner === 'ai2' ? s.ai2 : owner === 'ai' ? s.ai : s.player;
    if (!participant) return;
    const charName = card.borrowedMonsterName || participant.name.replace(/^AI\d*\s+/, '');
    const label = card.isItemCard
        ? (card.isBlack ? '黑牌' : card.isWhite ? '白牌' : '道具')
        : card.value;
    const adventureOpts = s.isAdventure ? {
        stage: s.adventureStage || s.stage || 1,
        playerHandSize: (s.playerHand && s.playerHand.length) || 0,
        incomingDamage: s.pendingDefenseDamage || 0
    } : null;
    const skill = this._resolveHandSkillDesc(charName, card, isDefend, adventureOpts) || (isDefend ? '执行防御效果' : '执行进攻效果');
    this._showZoneDesc(id, `${charName} · ${label}｜${skill}`);
},

_hideZoneDesc(id) {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
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

async _playDiscardAnimation(evt) {
    const discard = document.getElementById('discard-top');
    if (!discard) return;

    const owner = evt.who === 'ai2' ? 'ai2' : evt.who === 'ai' ? 'ai' : 'player';
    const hand = document.getElementById(owner === 'player' ? 'player-hand' : `${owner}-hand`);
    let source = null;

    if (evt.from === 'reveal') {
        source = document.querySelector('#reveal-cards .card-canvas') ||
            document.querySelector('.ai-revealed-card');
    }
    if (!source && hand && Number.isInteger(evt.handIndex)) {
        source = hand.querySelector(`[data-index="${evt.handIndex}"]`) || hand.children[evt.handIndex];
    }
    if (!source && hand && evt.card) {
        const id = cardId(evt.card);
        source = Array.from(hand.querySelectorAll('.card-canvas')).find(el => el.dataset.cardId === id) || null;
    }
    if (!source && hand) {
        source = hand.querySelector('.selected') || hand.lastElementChild || hand;
    }
    if (!source) source = document.getElementById('reveal-cards') || document.getElementById('deck-area');

    const faceUp = evt.faceUp === true || owner === 'player';
    const landsOnTop = evt.destination === 'top';
    await this.anim.discardCard(evt.card, source, discard, faceUp, { landsOnTop });
},

async _playDiscardManyAnimation(evt) {
    const discard = document.getElementById('discard-top');
    if (!discard) return;
    const owner = evt.who === 'ai2' ? 'ai2' : evt.who === 'ai' ? 'ai' : 'player';
    const hand = document.getElementById(owner === 'player' ? 'player-hand' : `${owner}-hand`);
    const cards = Array.from(evt.cards || []);
    const faceUp = evt.faceUp === true || owner === 'player';
    const landsOnTop = evt.destination === 'top';
    const handCards = hand ? Array.from(hand.querySelectorAll('.card-canvas')) : [];
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
        const fallbackIdx = handCards.findIndex((_, idx) => !used.has(idx));
        if (fallbackIdx >= 0) {
            used.add(fallbackIdx);
            return handCards[fallbackIdx];
        }
        return hand || document.getElementById('reveal-cards');
    });
    for (let index = 0; index < cards.length; index++) {
        if (index) await new Promise(resolve => setTimeout(resolve, 70));
        await this.anim.discardCard(cards[index], sources[index], discard, faceUp, { landsOnTop });
    }
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
        const cv = renderCard(c, 40, 58, false);
        markNpcWhiteCard(cv, c, true);
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
    if (!aiHand || !atkZone) { await new Promise(r => setTimeout(r, 500)); return; }
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
            await this.anim.flyCard(card, sourceCard || aiHand, atkZone, 440, 54, who);
        } else {
            await this.anim.flyCardBack(sourceCard || aiHand, atkZone, 440, 54);
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
            await this.anim.flyCard(card, sourceCard || aiHand, defZone, 440, 42, who);
        } else {
            await this.anim.flyCardBack(sourceCard || aiHand, defZone, 440, 42);
        }
    }
    finally { if (sourceCard) sourceCard.remove(); }
    this._settleZoneCard(defZone, card, who);
},

_settleZoneCard(zone, card, owner = 'player') {
    zone.innerHTML = '';
    const settled = renderCard(card, CARD_W - 10, CARD_H - 14, false);
    settled.classList.add('zone-card', 'zone-card-land');
    if (owner && owner !== 'player') markNpcWhiteCard(settled, card, true);
    zone.appendChild(settled);
    zone.dataset.cardKey = JSON.stringify(card);
},

async _playPlayerCardAnimation(card) {
    const playerHand = document.getElementById('player-hand');
    const atkZone = document.getElementById('atk-cards');
    if (!playerHand || !atkZone) { await new Promise(r => setTimeout(r, 500)); return; }
    const selectedIndex = this._prevState ? this._prevState.selectedCard : -1;
    const source = selectedIndex >= 0 && playerHand.children[selectedIndex]
        ? playerHand.children[selectedIndex]
        : playerHand;
    if (source !== playerHand) source.style.visibility = 'hidden';
    try { await this.anim.flyCard(card, source, atkZone, 430, 66); }
    finally { if (source !== playerHand) source.remove(); }
    this._settleZoneCard(atkZone, card, 'player');
},

async _playPlayerDefendAnimation(card) {
    const playerHand = document.getElementById('player-hand');
    const defZone = document.getElementById('def-cards');
    if (!playerHand || !defZone) { await new Promise(r => setTimeout(r, 400)); return; }
    const selectedIndex = this._prevState ? this._prevState.selectedCard : -1;
    const source = selectedIndex >= 0 && playerHand.children[selectedIndex]
        ? playerHand.children[selectedIndex]
        : playerHand;
    if (source !== playerHand) source.style.visibility = 'hidden';
    try { await this.anim.flyCard(card, source, defZone, 420, 48); }
    finally { if (source !== playerHand) source.remove(); }
    this._settleZoneCard(defZone, card, 'player');
},

async _playRevealAnimation(card, fromOwner, fromSource) {
    const toEl = document.getElementById('reveal-cards');
    if (!toEl) return;
    // 默认从牌库飞出；仅显式 from:'hand' 时从对应手牌飞出（追加/抽取手牌判定）
    const fromHand = fromSource === 'hand';
    let ownerEl = document.getElementById('deck-area');
    let fromEl = ownerEl;
    if (fromHand) {
        ownerEl = document.getElementById(
            fromOwner === 'player' ? 'player-hand'
                : fromOwner === 'ai2' ? 'ai2-hand'
                    : fromOwner === 'ai' ? 'ai-hand'
                        : 'deck-area'
        );
        if (!ownerEl) return;
        const selectedIndex = fromOwner === 'player' && this._prevState ? this._prevState.selectedCard : -1;
        fromEl = selectedIndex >= 0 && ownerEl.children[selectedIndex]
            ? ownerEl.children[selectedIndex]
            : ownerEl;
        if (fromEl !== ownerEl) fromEl.style.visibility = 'hidden';
    }
    if (!fromEl) fromEl = document.body;

    const flying = fromHand && fromOwner === 'player'
        ? renderCard(card, CARD_W - 10, CARD_H - 14, false)
        : renderCardBack(CARD_W - 10, CARD_H - 14);
    flying.style.position = 'fixed';
    flying.style.zIndex = '9999';
    flying.style.pointerEvents = 'none';
    flying.style.transition = 'left .42s ease-out, top .42s ease-out, transform .42s ease-out';
    const from = fromEl.getBoundingClientRect();
    const to = toEl.getBoundingClientRect();
    flying.style.left = (from.left + from.width / 2 - 30) + 'px';
    flying.style.top = (from.top + from.height / 2 - 43) + 'px';
    document.body.appendChild(flying);
    await new Promise(r => setTimeout(r, 30));
    flying.style.left = (to.left + to.width / 2 - 30) + 'px';
    flying.style.top = (to.top + to.height / 2 - 43) + 'px';
    flying.style.transform = fromHand && fromOwner === 'player' ? 'scale(.9)' : 'rotateY(90deg) scale(.9)';
    await new Promise(r => setTimeout(r, 430));
    flying.remove();
    if (fromHand && fromEl !== ownerEl) fromEl.remove();
    toEl.innerHTML = '';
    const shown = renderCard(card, CARD_W - 10, CARD_H - 14, false);
    shown.classList.add('revealed-card');
    toEl.appendChild(shown);
    toEl.dataset.cardKey = JSON.stringify([card]);
}
    });
})(window);

