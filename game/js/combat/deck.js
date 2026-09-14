/* Standard combat deck service.
 *
 * Adventure mode owns its own player/NPC piles and only uses this service as
 * a Card-compatible fallback.  Classic modes use the complete initializer.
 */
(function (global) {
    const root = global.FurryGame || (global.FurryGame = {});
    const Card = root.Card;
    if (!Card) throw new Error('Combat deck requires protocol.js');

    const COLORS = ['RED', 'YELLOW', 'BLUE', 'GREEN'];

    function shuffle(deck) {
        const random = root.CombatRuntime ? root.CombatRuntime.random : Math.random;
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    function makeStandard() {
        const deck = [];
        for (const color of COLORS) {
            for (let value = 1; value <= 7; value++) {
                const copies = value <= 3 ? 3 : value <= 6 ? 2 : 1;
                for (let n = 0; n < copies; n++) deck.push(Card.number(color, value));
            }
            deck.push(Card.number(color, 0));
        }
        for (let value = 1; value <= 7; value++) deck.push(Card.number('WHITE', value, true));
        for (let n = 0; n < 2; n++) {
            deck.push(Card.item('BLACK', 'black'));
            deck.push(Card.item('BLACK', 'drawTwo'));
            deck.push(Card.item('WHITE', 'drawThree'));
            deck.push(Card.item('WHITE', 'swap'));
        }
        for (let n = 0; n < 4; n++) {
            deck.push(Card.item('BLACK', 'shuffle'));
            deck.push(Card.item('WHITE', 'potion'));
            deck.push(Card.item('WHITE', 'superPurify'));
        }
        for (let n = 0; n < 6; n++) deck.push(Card.item('WHITE', 'purify'));
        return shuffle(deck);
    }

    function drawInitialTop(deck) {
        const attempts = deck.length;
        for (let i = 0; i < attempts; i++) {
            const top = deck.pop();
            if (!top) return null;
            if (!top.isBlack && !top.isWhite) return top;
            deck.unshift(top);
        }
        // A custom/degenerate deck still needs a finite result.
        return deck.pop() || null;
    }

    function createStandard() {
        const deck = makeStandard();
        return {
            deck,
            discardBottom: [],
            discardTop: drawInitialTop(deck)
        };
    }

    const label = owner => owner === 'player' ? '玩家' : owner === 'ai2' ? 'AI2' : 'AI';

    /* Shared pile operations are kept here as the engine's fallback service.
       Mode adapters may override draw/refill/discard (adventure does), but
       they all retain this same ownership and event contract. */
    function shuffleDiscardIntoDeck(engine) {
        const discard = engine.discardBottom || [];
        for (const card of discard) {
            if (card && (card.isBlack || card.isWhite)) delete card.chosenColor;
        }
        (engine.deck || (engine.deck = [])).push(...discard);
        engine.discardBottom = [];
        shuffle(engine.deck);
    }

    function refillIfNeeded(engine) {
        if ((engine.deck || []).length || !(engine.discardBottom || []).length) return false;
        shuffleDiscardIntoDeck(engine);
        engine.emit('desc', '牌库已空，弃牌库洗回牌堆');
        return true;
    }

    function draw(engine, owner, count, animated = false) {
        const cards = [];
        let remaining = Math.max(0, Number(count) || 0);
        while (remaining-- > 0) {
            refillIfNeeded(engine);
            if (!(engine.deck || []).length) break;
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
    }

    function emitDrawDiff(engine, before = {}) {
        for (const owner of ['player', 'ai', 'ai2']) {
            const count = (engine.h[owner] || []).length - (before[owner] || 0);
            if (count > 0) engine.emit('draw', `${label(owner)}抽${count}张牌`, null, {
                who: owner, target: owner, count
            });
        }
    }

    function discardToBottom(engine, card) {
        if (!card) return;
        if (card.isBlack || card.isWhite) delete card.chosenColor;
        (engine.discardBottom || (engine.discardBottom = [])).push(Object.assign({}, card));
    }

    root.CombatDeck = Object.freeze({
        COLORS, shuffle, makeStandard, drawInitialTop, createStandard,
        shuffleDiscardIntoDeck, refillIfNeeded, draw, emitDrawDiff, discardToBottom
    });
})(window);
