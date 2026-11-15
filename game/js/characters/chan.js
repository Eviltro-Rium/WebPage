(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Chan',
    hp: 60,
    type: '谋士',
    passive: '进攻回合开始前抽1张牌',
    init() { return {}; },
    turnStart(eng, ch, w) { eng.draw(w, 1, true); },
    attackEffectTiming: { 0: 'afterDamage', 1: 'afterDamage', 4: 'afterDamage' },
    effect(eng, v, c, a, t, owner, helpers) {
      const { hurt, draw } = helpers;
      let d = 0;
      let skip = false;
      let unblock = false;
      if (v === 1) {
        d = 1;
        eng.freeze(t);
        unblock = true;
      } else if (v === 2) {
        d = 4;
      } else if (v === 3) {
        d = 0;
        hurt(a, 2);
        if (typeof eng.refillDeckIfNeeded === 'function') eng.refillDeckIfNeeded(owner);
        const cards = [];
        for (let i = 0; i < 5 && eng.deck.length; i++) cards.push(eng.deck.pop());
        cards.sort((x, y) => {
          const rank = z => z.isBlack ? 4 : z.isItemCard ? 3 : z.value === 0 ? 2 : 1;
          return rank(y) - rank(x) || (y.value || 0) - (x.value || 0);
        });
        for (let i = cards.length - 1; i >= 0; i--) eng.deck.push(cards[i]);
        draw(owner, 2, true);
        skip = true;
      } else if (v === 4) {
        d = 5;
        const r = eng.reveal('Chan 4牌判定', owner);
        if (r) {
          unblock = !!(r.isBlack || r.isWhite || eng.effective(r) === 'BLUE');
          if (unblock) eng.discardWithEvent(r, owner, { from: 'reveal', faceUp: true });
          else eng.h[owner].push(r);
        }
      } else if (v === 5) {
        d = 6;
      } else if (v === 0) {
        d = 7;
        eng.freeze(t);
        draw(owner, 1, true);
      }
      return { d, skip, unblock };
    },
    damageAfterDefense(v, damage, defender) {
      return null;
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d;
      let desc = '';
      if (v === 1) {
        counter(opponent, 2);
        eng.freeze(opponent);
        remaining = d;
        desc = 'Chan 1牌：反击2点+施加冷冻';
      } else if (v === 2) {
        if (typeof eng.refillDeckIfNeeded === 'function') eng.refillDeckIfNeeded();
        const r = eng.deck.length ? eng.deck.pop() : null;
        if (r) {
          const healAmt = Math.ceil(Math.max(0, r.isItemCard ? 0 : r.value) / 2);
          if (healAmt > 0) heal(defender, healAmt);
          eng.h[owner].push(r);
          eng.emit('reveal', `Chan 2牌翻开${eng.cardText(r)}`, r, { who: owner, from: 'deck' });
          desc = `Chan 2牌：恢复${healAmt}点+${eng.cardText(r)}加入手牌`;
        } else {
          desc = 'Chan 2牌：牌库空';
        }
        remaining = d;
      } else if (v === 0) {
        const cd = Math.ceil(d / 2);
        counter(opponent, cd);
        remaining = 0;
        if (owner === 'player') eng.s.forceEndAITurn = true;
        else if (owner === 'ai' || owner === 'ai2') eng.s.forceEndPlayerTurn = true;
        desc = `Chan 0牌：防御所有伤害并反击${cd}点，进攻方回合结束`;
      }
      return { remaining, desc };
    }
  });
})();