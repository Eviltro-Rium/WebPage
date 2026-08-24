(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Otto',
    hp: 100,
    type: '战士',
    passive: '进攻时伤害>4可消耗1层【暴击】使攻击不可防御',
    init() { return { crit: 0 }; },
    turnStart(eng, ch) {},
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, bleed, guard, heal, draw, clearDebuffs } = helpers;
      let d = 0, skip = false, unblock = false;
      if (v === 1) {
        d = 4;
      } else if (v === 2) {
        d = 3;
        guard(1);
      } else if (v === 3) {
        return null;
      } else if (v === 4) {
        return null;
      } else if (v === 5) {
        return null;
      } else if (v === 6) {
        let divisor = eng.s.is1v2 ? 20 : 10;
        d = Math.ceil(a.hp / divisor);
      } else if (v === 7) {
        d = 6;
        eng.hurt(a, 1);
        if (a.crit < 2) a.crit++;
        eng.emit('buff', '+1[暴击]', null, { who: owner, kind: 'crit', stacks: a.crit });
      } else if (v === 0) {
        d = 4;
        let critUsed = Math.min(a.crit || 0, 2);
        if (critUsed > 0) {
          d += critUsed * 3;
          eng.hurt(a, critUsed * 2);
          a.crit -= critUsed;
          eng.emit('buff', `-${critUsed}[暴击]`, null, { who: owner, kind: 'crit', stacks: a.crit });
          eng.emit('desc', `Otto 0牌：消耗${critUsed}层暴击，+${critUsed * 3}伤害，自伤${critUsed * 2}`);
        } else {
          unblock = true;
        }
      }
      return { d, skip, unblock };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, burn, bleed, guard } = helpers;
      let remaining = d, desc = '';
      if (v === 1) {
        let b = Math.ceil(d / 2);
        remaining = Math.max(0, d - b);
        desc = `Otto 1牌：格挡${b}点`;
        if ((defender.crit || 0) >= 2) {
          hurt(opponent, b);
          defender.crit -= 2;
          desc += `，消耗2层暴击返还${b}点伤害`;
          eng.emit('buff', `-2[暴击]`, null, { who: owner, kind: 'crit', stacks: defender.crit });
        }
      } else if (v === 2) {
        hurt(opponent, 2);
        guard(1);
        remaining = d;
        desc = 'Otto 2牌：反击2点+获得1层守护';
      } else if (v === 3) {
        heal(defender, 2);
        bleed(2);
        remaining = d;
        desc = 'Otto 3牌：恢复2点+施加2层流血';
      } else if (v === 0) {
        guard(5);
        hurt(opponent, d);
        remaining = 0;
        desc = `Otto 0牌：获得5层守护+反击${d}点`;
      }
      return { remaining, desc };
    }
  });
})();