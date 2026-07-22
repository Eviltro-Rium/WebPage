(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Moze',
    hp: 100,
    type: '守护',
    passive: '可消耗守护减免伤害，但不能减免流血伤害',
    init() { return {}; },
    turnStart(eng, ch) {},
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, bleed, guard, takeReveal, heal, draw, clearDebuffs } = helpers;
      let d = 0, skip = false, unblock = false;
      if (v === 1) {
        d = 3;
      } else if (v === 2) {
        d = 2;
        guard(eng.effective(c) === 'GREEN' ? 2 : 1);
      } else if (v === 3) {
        d = 1;
        heal(a, 1);
        guard(1);
      } else if (v === 4) {
        skip = true;
      } else if (v === 5) {
        d = 4;
        guard(1);
      } else if (v === 6) {
        d = 2 + a.guard;
        unblock = !a.guard;
      } else if (v === 7) {
        let q = a.burn + a.bleed + (a.frozen ? 1 : 0);
        clearDebuffs(a);
        d = 3 + q;
      } else if (v === 0) {
        guard(3);
        d = 5;
        draw(owner, 1, true);
      }
      return { d, skip, unblock };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw, burn, bleed, cancelAttackDebuffs, clearDebuffs } = helpers;
      let remaining = d, desc = '';
      if (v === 1) {
        let b = Math.ceil(d / 2);
        defender.guard = Math.min(5, defender.guard + 1);
        remaining = Math.max(0, d - b);
        desc = `Moze 1牌：防御${b}点+1层守护`;
      } else if (v === 2) {
        let cd = 1 + Math.ceil(defender.guard / 2);
        hurt(opponent, cd);
        remaining = d;
        desc = `Moze 2牌：反击${cd}点`;
      } else if (v === 3) {
        defender.guard = Math.min(5, defender.guard + 1);
        heal(defender, Math.ceil(defender.guard / 2));
        remaining = d;
        desc = `Moze 3牌：1层守护+恢复${Math.ceil(defender.guard / 2)}点`;
      } else if (v === 0) {
        let b = Math.ceil(d / 2);
        defender.guard = Math.min(5, defender.guard + 2);
        let cd = defender.guard * 2;
        hurt(opponent, cd);
        remaining = Math.max(0, d - b);
        desc = `Moze 0牌：防御${b}点+2层守护+反击${cd}点`;
      }
      return { remaining, desc };
    }
  });
})();