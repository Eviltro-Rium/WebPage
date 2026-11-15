(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Moze',
    hp: 80,
    type: '守护',
    passive: '可为队友消耗最多2层守护，减免攻击或反击伤害',
    init() { return {}; },
    turnStart(eng, ch) {},
    damageAtSettlement(eng, v, a, t) { return v === 4 ? 3 + (a.guard || 0) : null; },
    attackEffectTiming: { 1: 'afterDamage', 5: 'afterDamage' },
    effect(eng, v, c, a, t, owner, helpers) {
      const { guard, draw } = helpers;
      let d = 0;
      let skip = false;
      let unblock = false;
      if (v === 1) {
        d = 2;
        guard(2);
        if (eng.effective(c) === 'GREEN') guard(1);
      } else if (v === 2) {
        d = 4;
      } else if (v === 3) {
        skip = true;
      } else if (v === 4) {
        d = 3 + (a.guard || 0);
        unblock = !(a.guard > 0);
      } else if (v === 5) {
        d = 3;
      } else if (v === 0) {
        guard(3);
        d = 6;
        draw(owner, 1, true);
      }
      return { d, skip, unblock };
    },
    damageAfterDefense(v, damage, defender) {
      if (v === 0 || v === 1) return Math.max(0, damage - Math.ceil(damage / 2));
      return null;
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d;
      let desc = '';
      if (v === 1) {
        const b = Math.ceil(d / 2);
        eng.addGuard(defender, 1);
        remaining = Math.max(0, d - b);
        desc = `Moze 1牌：防御${b}点+1层守护`;
      } else if (v === 2) {
        const cd = 1 + Math.ceil((defender.guard || 0) / 2);
        counter(opponent, cd);
        remaining = d;
        desc = `Moze 2牌：反击${cd}点`;
      } else if (v === 0) {
        const b = Math.ceil(d / 2);
        eng.addGuard(defender, 2);
        const cd = (defender.guard || 0) * 2;
        counter(opponent, cd);
        remaining = Math.max(0, d - b);
        desc = `Moze 0牌：防御${b}点+2层守护+反击${cd}点`;
      }
      return { remaining, desc };
    }
  });
})();