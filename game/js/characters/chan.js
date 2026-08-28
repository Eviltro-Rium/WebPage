(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Chan',
    hp: 80,
    type: '谋士',
    passive: '进攻回合开始前抽1张牌',
    init() { return {}; },
    turnStart(eng, ch, w) { eng.draw(w, 1, true); },
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, bleed, guard, takeReveal, heal, draw, clearDebuffs } = helpers;
      let d = 0, skip = false, unblock = false;
      if (v === 1) {
        d = 1;
        eng.freeze(t);
        skip = true;
      } else if (v === 2) {
        d = 4;
      } else if (v === 3) {
        d = 2;
        draw(owner, 1, true);
      } else if (v === 4) {
        d = 2;
        skip = true;
      } else if (v === 5) {
        d = 0;
        eng.hurt(a, 2);
        let cards = [];
        for (let i = 0; i < 5 && eng.deck.length; i++) cards.push(eng.deck.pop());
        cards.sort((x, y) => {
          let rank = z => z.isBlack ? 4 : z.isItemCard ? 3 : z.value === 0 ? 2 : 1;
          return rank(y) - rank(x) || (y.value || 0) - (x.value || 0);
        });
        for (let i = cards.length - 1; i >= 0; i--) eng.deck.push(cards[i]);
        draw(owner, 2, true);
        skip = true;
      } else if (v === 6) {
        let r = takeReveal('Chan 6牌判定');
        d = 5;
        skip = !!r && (r.isBlack || r.isWhite || eng.effective(r) === 'BLUE');
      } else if (v === 7) {
        d = 6;
      } else if (v === 0) {
        d = 7;
        eng.freeze(t);
        draw(owner, 1, true);
      }
      return { d, skip, unblock };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw, burn, bleed, cancelAttackDebuffs, clearDebuffs } = helpers;
      let remaining = d, desc = '';
      if (v === 1) {
        let b = Math.ceil(d / 2);
        remaining = Math.max(0, d - b);
        desc = `Chan 1牌：格挡${b}点`;
      } else if (v === 2) {
        hurt(opponent, 2);
        eng.freeze(opponent);
        remaining = d;
        desc = 'Chan 2牌：反击2点+施加冷冻';
      } else if (v === 0) {
        let cd = Math.ceil(d / 2);
        hurt(opponent, cd);
        remaining = 0;
        if (owner === 'player') {
          eng.s.forceEndAITurn = true;
        } else if (owner === 'ai') {
          eng.s.forceEndPlayerTurn = true;
        }
        desc = `Chan 0牌：防御所有伤害并反击${cd}点，进攻方回合结束`;
      }
      return { remaining, desc };
    }
  });
})();