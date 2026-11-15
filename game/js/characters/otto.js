(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Otto',
    hp: 80,
    type: '战士',
    passive: '进攻伤害>4时可消耗1层[暴击]使攻击不可防御',
    init() { return { crit: 0 }; },
    turnStart(eng, ch) {},
    damageAtSettlement(eng, v, a, t) {
      if (v !== 5) return null;
      const divisor = eng.s.is1v2 && !eng.s.isAdventure ? 16 : 8;
      return Math.ceil(a.hp / divisor);
    },
    attackEffectTiming: { 1: 'afterDamage', 3: 'afterDamage', 4: 'immediate' },
    effect(eng, v, c, a, t, owner, helpers) {
      const { guard } = helpers;
      let d = 0;
      let skip = false;
      let unblock = false;
      if (v === 1) {
        d = 2;
        unblock = true;
        guard(1);
        if (a.crit < 3) a.crit++;
        eng.emit('buff', '+1[暴击]', null, { who: owner, kind: 'crit', stacks: a.crit });
      } else if (v === 2) {
        d = 4;
      } else if (v === 3) {
        if (a.crit < 3) a.crit++;
        eng.emit('buff', '+1[暴击]', null, { who: owner, kind: 'crit', stacks: a.crit });
        d = 5;
      } else if (v === 4) {
        return null;
      } else if (v === 5) {
        const divisor = eng.s.is1v2 && !eng.s.isAdventure ? 16 : 8;
        d = Math.ceil(a.hp / divisor);
        unblock = d <= 3;
      } else if (v === 0) {
        d = 4;
        const stacks = Math.min(a.crit || 0, 3);
        if (stacks > 0) {
          d += stacks * 3;
          eng.emit('desc', `Otto 0牌：拥有${stacks}层暴击，造成${d}点伤害`);
        } else {
          unblock = true;
        }
      }
      return { d, skip, unblock };
    },
    damageAfterDefense(v, damage, defender) {
      return null;
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, bleed, guard } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d;
      let desc = '';
      if (v === 1) {
        counter(opponent, 2);
        guard(1);
        remaining = d;
        desc = 'Otto 1牌：反击2点+获得1层守护';
      } else if (v === 2) {
        heal(defender, 2);
        bleed(opponent, 2);
        remaining = d;
        desc = 'Otto 2牌：恢复2点+施加2层流血';
      } else if (v === 0) {
        guard(5);
        counter(opponent, d);
        remaining = d;
        desc = `Otto 0牌：获得5层守护+反击${d}点`;
      }
      return { remaining, desc };
    }
  });
})();