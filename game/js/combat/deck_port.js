/* DeckPort: shared draw/discard interface used by 1v1 / 1v2 / lord.
 *
 * Adventure dual-pile battles keep ownership of draw/refill/discard by
 * overriding Engine methods on AdventureBattleEngine — that class *is* the
 * DeckPort for adventure mode. New modes should either use DeckPort.shared
 * or override the same method names (draw, refillDeckIfNeeded, discardToBottom,
 * reveal) instead of forking aiTurn / defend.
 */
(function (global) {
  const root = global.FurryGame || (global.FurryGame = {});
  const piles = () => root.EnginePiles;

  const SharedDeckPort = {
    shuffleDiscardIntoDeck(engine) {
      const P = piles();
      if (P && P.shuffleDiscardIntoDeck) return P.shuffleDiscardIntoDeck(engine);
      // Fallback mirrors Engine._shuffleDiscardIntoDeck
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
      const P = piles();
      if (P && P.refillIfNeeded) return P.refillIfNeeded(engine);
      if (engine.deck.length || !(engine.discardBottom || []).length) return;
      this.shuffleDiscardIntoDeck(engine);
      engine.emit('desc', '牌库已空，弃牌库洗回牌堆');
    },

    draw(engine, owner, count, animated = false) {
      const P = piles();
      if (P && P.draw) return P.draw(engine, owner, count, animated);
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
        const label = owner === 'player' ? '玩家' : owner === 'ai2' ? 'AI2' : 'AI';
        engine.emit('draw', `${label}抽${cards.length}张牌`, null, { who: owner, target: owner, count: cards.length });
      }
      return cards;
    },

    emitDrawDiff(engine, before) {
      const P = piles();
      if (P && P.emitDrawDiff) return P.emitDrawDiff(engine, before);
      for (const owner of ['player', 'ai', 'ai2']) {
        const count = (engine.h[owner] || []).length - (before[owner] || 0);
        if (count > 0) {
          const label = owner === 'player' ? '玩家' : owner === 'ai2' ? 'AI2' : 'AI';
          engine.emit('draw', `${label}抽${count}张牌`, null, { who: owner, target: owner, count });
        }
      }
    },

    discardToBottom(engine, card) {
      if (!card) return;
      if (card.isBlack || card.isWhite) delete card.chosenColor;
      (engine.discardBottom || (engine.discardBottom = [])).push(Object.assign({}, card));
    },

    discard(engine, card, owner = 'player', extra = {}) {
      const P = piles();
      if (P && P.discard) return P.discard(engine, card, owner, extra);
      if (!card) return;
      this.discardToBottom(engine, card);
      const label = owner === 'player' ? '玩家' : owner === 'ai2' ? 'AI2' : 'AI';
      engine.emit('discard', extra.desc || `${label}弃掉${engine.cardText(card)}`, card,
        Object.assign({ who: owner, target: owner, from: 'hand', destination: 'bottom' }, extra));
    },

    discardMany(engine, cards, owner = 'player', extra = {}) {
      const P = piles();
      if (P && P.discardMany) return P.discardMany(engine, cards, owner, extra);
      const batch = (cards || []).filter(Boolean);
      if (!batch.length) return;
      for (const card of batch) this.discardToBottom(engine, card);
      const label = owner === 'player' ? '玩家' : owner === 'ai2' ? 'AI2' : 'AI';
      engine.emit('discardMany', extra.desc || `${label}弃掉${batch.length}张牌`, batch[0],
        Object.assign({
          who: owner, target: owner, from: 'hand', destination: 'bottom',
          cards: batch.map(c => Object.assign({}, c))
        }, extra));
    },

    reveal(engine, desc) {
      const P = piles();
      if (P && P.reveal) return P.reveal(engine, desc);
      const card = engine.deck.pop();
      if (!card) return null;
      engine.s.revealCards = [JSON.parse(JSON.stringify(card))];
      engine.emit('reveal', desc, card, { from: 'deck' });
      return card;
    }
  };

  root.DeckPort = Object.freeze({
    shared: SharedDeckPort,
    /** Adventure dual-pile engines override Engine draw/refill/discard instead. */
    usesSharedDeck(engine) {
      return !(engine && engine.s && engine.s.isAdventure && engine.piles);
    },
    for(engine) {
      return this.usesSharedDeck(engine) ? SharedDeckPort : null;
    }
  });
})(window);
