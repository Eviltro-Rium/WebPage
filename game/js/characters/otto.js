(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Otto',
    hp: 100,
    type: '战士',
    passive: '进攻时伤害>4可选择消耗1层【暴击】使攻击不可防御',
    init() { return { crit: 0 }; },
    turnStart(eng, ch) {},
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, bleed, guard, heal, draw, clearDebuffs, hurt } = helpers;
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
        d = 6;
        hurt(a, 1);
        if (a.crit < 3) a.crit++;
        eng.emit('buff', '+1[暴击]', null, { who: owner, kind: 'crit', stacks: a.crit });
      } else if (v === 7) {
        // Classic 1v2 doubles the starting HP, so it scales by /20. Adventure
        // challenge rooms keep the normal 100 HP pool and therefore use /10.
        const divisor = eng.s.is1v2 && !eng.s.isAdventure ? 20 : 10;
        d = Math.ceil(a.hp / divisor);
        // Small Otto 7 attacks cannot be defended against.
        unblock = d <= 3;
      } else if (v === 0) {
        d = 4;
        let stacks = Math.min(a.crit || 0, 3);
        if (stacks > 0) {
          d += stacks * 3;
          eng.emit('desc', `Otto 0牌：拥有${stacks}层暴击，造成${d}点伤害`);
        } else {
          unblock = true;
        }
      }
      return { d, skip, unblock };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, burn, bleed, addGuard } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d, desc = '';
      if (v === 1) {
        let b = Math.ceil(d / 2);
        remaining = Math.max(0, d - b);
        desc = `Otto 1牌：格挡${b}点`;
        if ((defender.crit || 0) >= 2) {
          counter(opponent, b);
          defender.crit -= 2;
          desc += `，消耗2层暴击返还${b}点伤害`;
          eng.emit('buff', `-2[暴击]`, null, { who: owner, kind: 'crit', stacks: defender.crit });
        }
      } else if (v === 2) {
        counter(opponent, 2);
        addGuard(defender, 1);
        remaining = d;
        desc = 'Otto 2牌：反击2点+获得1层守护';
      } else if (v === 3) {
        heal(defender, 2);
        bleed(opponent, 2);
        remaining = d;
        desc = 'Otto 3牌：恢复2点+施加2层流血';
      } else if (v === 0) {
        addGuard(defender, 5);
        counter(opponent, d);
        remaining = d;
        desc = `Otto 0牌：获得5层守护+反击${d}点+承受${d}点伤害`;
      }
      return { remaining, desc };
    }
  });
})();
