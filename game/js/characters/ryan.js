(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Ryan',
    hp: 50,
    type: '战士',
    passive: '在我方⚔️回合开始前恢复1❤️',
    init() { return {}; },
    turnStart(eng, ch) { eng.heal(ch, 1); },
    damageAtSettlement(eng, v, a, t) {
      if (v !== 5) return null;
      const who = typeof eng._who === 'function' ? eng._who(a) : 'player';
      return (eng.h[who] || []).filter(x => x.isNumberCard).reduce((q, x) => q + x.value, 0);
    },
    effect(eng, v, c, a, t, owner, helpers) {
      const { heal, draw, clearDebuffs } = helpers;
      let d = 0;
      let skip = false;
      let unblock = false;
      let pendingPurify = false;
      const hand = eng.h[owner] || eng.h.player || [];
      if (v === 1) {
        heal(a, 1);
        draw(owner, 1, true);
        skip = true;
      } else if (v === 2) {
        d = 4;
      } else if (v === 3) {
        return null;
      } else if (v === 4) {
        d = 4;
        pendingPurify = owner === 'player';
        if (!pendingPurify) eng.clean(a);
        draw(owner, 1, true);
      } else if (v === 5) {
        d = hand.filter(x => x.isNumberCard).reduce((q, x) => q + x.value, 0);
      } else if (v === 0) {
        clearDebuffs(a);
        const cards = [];
        for (let i = 0; i < 2 && eng.deck.length; i++) {
          const r = eng.deck.pop();
          cards.push(r);
          eng.h[owner].push(r);
          eng.emit('reveal', `Ryan 0牌公示第${i + 1}张`, r, { from: 'deck' });
        }
        eng.s.revealCards = JSON.parse(JSON.stringify(cards));
        d = cards.reduce((sum, x) => sum + (x.isNumberCard ? x.value : 3), 0);
      }
      return { d, skip, unblock, pendingPurify };
    },
    damageAfterDefense(v, damage, defender) {
      if (v === 1) return Math.max(0, damage - Math.ceil(damage / 2));
      return null;
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, cancelAttackDebuffs, clearDebuffs } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d;
      let desc = '';
      if (v === 1) {
        const b = Math.ceil(d / 2);
        remaining = Math.max(0, d - b);
        desc = `Ryan 1牌：格挡${b}点`;
      } else if (v === 2) {
        counter(opponent, 2);
        heal(defender, 2);
        remaining = d;
        desc = 'Ryan 2牌：反击2点并恢复2点生命';
      } else if (v === 0) {
        cancelAttackDebuffs(owner, false);
        clearDebuffs(defender);
        heal(defender, 3);
        remaining = 0;
        desc = 'Ryan 0牌：清除debuff、免疫伤害并恢复3点生命';
      }
      return { remaining, desc };
    }
  });
})();
