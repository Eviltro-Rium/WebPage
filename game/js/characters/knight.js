(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Knight',
    hp: 70,
    type: '混沌',
    passive: '进攻前清除混沌；打出数字/白道具牌获得对应颜色混沌',
    init() { return { chaos_red: false, chaos_yellow: false, chaos_blue: false, chaos_green: false }; },
    turnStart(eng, ch, w) {
      const had = !!(ch.chaos_red || ch.chaos_yellow || ch.chaos_blue || ch.chaos_green);
      ch.chaos_red = false;
      ch.chaos_yellow = false;
      ch.chaos_blue = false;
      ch.chaos_green = false;
      if (had) eng.emit('buff', '[混沌重制]', null, { who: w, kind: 'chaos_reset', stacks: 0 });
    },
    attackEffectTiming: { 1: 'afterDamage', 4: 'afterDamage', 5: 'afterDamage' },
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, bleed, guard, heal } = helpers;
      let d = 0;
      let aoeTargets;
      let skip = false;
      let unblock = false;
      const cr = a.chaos_red;
      const cy = a.chaos_yellow;
      const cb = a.chaos_blue;
      const cg = a.chaos_green;
      const chaosCount = [cr, cy, cb, cg].filter(Boolean).length;
      if (v === 1) {
        d = 1;
        unblock = true;
        if (cg) {
          eng.queueAttackRecovery(a, 1);
          guard(1);
        }
        if (cr) burn(2);
        if (cb) eng.freeze(t);
        if (cy) bleed(1);
      } else if (v === 2) {
        d = 4;
      } else if (v === 3) {
        d = 5;
        if (cr) unblock = true;
      } else if (v === 4) {
        d = 4;
        guard(cg ? 4 : 2);
      } else if (v === 5) {
        d = 4 + chaosCount * 2;
        a.chaos_red = false;
        a.chaos_yellow = false;
        a.chaos_blue = false;
        a.chaos_green = false;
      } else if (v === 0) {
        if (chaosCount >= 4) {
          d = 8;
          unblock = true;
          if (eng.s.is1v2) aoeTargets = eng._enemyKeys(owner);
        } else {
          const gained = [];
          for (const [key, label] of [['chaos_red', '红'], ['chaos_yellow', '黄'], ['chaos_blue', '蓝'], ['chaos_green', '绿']]) {
            if (!a[key]) gained.push([key, label]);
            a[key] = true;
          }
          for (const [key, label] of gained) {
            eng.emit('buff', '[混沌-' + label + ']', null, { who: owner, kind: key, stacks: 1 });
          }
          d = 6;
        }
      }
      return { d, skip, unblock, aoeTargets, aoeDamage: aoeTargets ? 8 : 0 };
    },
    damageAfterDefense(v, damage, defender) {
      if (v === 2) return Math.max(0, damage - Math.ceil(damage / 2));
      return null;
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw, counter } = helpers;
      const strike = counter || ((target, amount) => hurt(target, amount));
      let remaining = d;
      let desc = '';
      if (v === 1) {
        heal(defender, 2);
        if (defender.chaos_yellow) strike(opponent, 2);
        desc = 'Knight 1牌：恢复2点' + (defender.chaos_yellow ? '，混沌黄反击2点' : '');
      } else if (v === 2) {
        const b = Math.ceil(d / 2);
        if (defender.chaos_blue) draw(owner, 1, true);
        remaining = Math.max(0, d - b);
        desc = `Knight 2牌：格挡${b}点` + (defender.chaos_blue ? '+抽1张牌' : '');
      } else if (v === 0) {
        const p = defender;
        const chaosCount = [p.chaos_red, p.chaos_yellow, p.chaos_blue, p.chaos_green].filter(Boolean).length;
        const drain = chaosCount * 2;
        if (chaosCount >= 4) {
          remaining = 0;
          if (typeof eng.drainAttack === 'function') eng.drainAttack(defender, opponent, drain, { forceDrainAvoidance: true });
          else { hurt(opponent, drain, 'drain'); heal(defender, drain, 'drain'); }
          desc = `Knight 0牌：4种混沌，免疫所有伤害+吸取${drain}点`;
        } else {
          if (typeof eng.drainAttack === 'function') eng.drainAttack(defender, opponent, drain, { forceDrainAvoidance: true });
          else { hurt(opponent, drain, 'drain'); heal(defender, drain, 'drain'); }
          desc = `Knight 0牌：${chaosCount}种混沌，吸取${drain}点+补齐4种混沌`;
        }
        const gained = [];
        for (const [key, label] of [['chaos_red', '红'], ['chaos_yellow', '黄'], ['chaos_blue', '蓝'], ['chaos_green', '绿']]) {
          if (!p[key]) gained.push([key, label]);
          p[key] = true;
        }
        for (const [key, label] of gained) {
          eng.emit('buff', '[混沌-' + label + ']', null, { who: owner, kind: key, stacks: 1 });
        }
      }
      return { remaining, desc };
    }
  });
})();
