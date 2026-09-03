/* Shared draw/discard operations.  The battle engines keep ownership/state,
 * while this service owns pile movement and its event payloads. */
(function (global) {
    const root = global.FurryGame || (global.FurryGame = {});

    const label = who => who === 'player' ? '玩家' : who === 'ai2' ? 'AI2' : 'AI';
    const copy = value => value && typeof value === 'object' ? Object.assign({}, value) : value;

    const EnginePiles = {
        shuffleDiscardIntoDeck(engine) {
            for (const card of engine.discardBottom || []) {
                if (card && (card.isBlack || card.isWhite)) delete card.chosenColor;
            }
            engine.deck.push(...(engine.discardBottom || []));
            engine.discardBottom = [];
            for (let i = engine.deck.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [engine.deck[i], engine.deck[j]] = [engine.deck[j], engine.deck[i]];
            }
        },

        refillIfNeeded(engine) {
            if (engine.deck.length || !engine.discardBottom.length) return;
            this.shuffleDiscardIntoDeck(engine);
            engine.emit('desc', '牌库已空，弃牌库洗回牌堆');
        },

        draw(engine, owner, count, animated = false) {
            const cards = [];
            let remaining = Math.max(0, Number(count) || 0);
            while (remaining-- > 0) {
                this.refillIfNeeded(engine);
                if (!engine.deck.length) break;
                const card = engine.deck.pop();
                (engine.h[owner] || (engine.h[owner] = [])).push(card);
                cards.push(card);
            }
            if (animated && cards.length && !engine._suppressDrawAnim) {
                engine.emit('draw', `${label(owner)}抽${cards.length}张牌`, null, {
                    who: owner, target: owner, count: cards.length
                });
            }
            return cards;
        },

        emitDrawDiff(engine, before) {
            for (const owner of ['player', 'ai', 'ai2']) {
                const count = (engine.h[owner] || []).length - (before[owner] || 0);
                if (count > 0) {
                    engine.emit('draw', `${label(owner)}抽${count}张牌`, null, {
                        who: owner, target: owner, count
                    });
                }
            }
        },

        discard(engine, card, owner = 'player', extra = {}) {
            if (!card) return;
            engine.discardToBottom(card, owner);
            engine.emit('discard', extra.desc || `${label(owner)}弃掉${engine.cardText(card)}`, card,
                Object.assign({ who: owner, target: owner, from: 'hand', destination: 'bottom' }, extra));
        },

        discardMany(engine, cards, owner = 'player', extra = {}) {
            const batch = (cards || []).filter(Boolean);
            if (!batch.length) return;
            for (const card of batch) engine.discardToBottom(card, owner);
            engine.emit('discardMany', extra.desc || `${label(owner)}弃掉${batch.length}张牌`, batch[0],
                Object.assign({ who: owner, target: owner, from: 'hand', destination: 'bottom', cards: batch.map(copy) }, extra));
        },

        reveal(engine, desc) {
            const card = engine.deck.pop();
            if (!card) return null;
            engine.s.revealCards = [JSON.parse(JSON.stringify(card))];
            const target = engine.s && (engine.s.defOwner || engine.s.atkOwner) || 'player';
            engine.emit('reveal', desc, card, { from: 'deck', who: target, target });
            return card;
        }
    };

    root.EnginePiles = Object.freeze(EnginePiles);
})(window);
