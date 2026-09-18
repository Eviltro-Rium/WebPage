(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Saiki',
    hp: 80,
    type: '猎手',
    passive: '进攻时打出有效黄色牌会在防御结算后施加1层流血',
    init() { return {}; },
    turnStart(eng, ch) {},
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, bleed, guard, takeReveal, heal, draw, clearDebuffs } = helpers;
      let d = 0, skip = false, unblock = false, immediateBuffs = false;
      if (v === 1) {
        d = 2;
        bleed(2);
      } else if (v === 2) {
        d = 3;
        heal(a, 1);
      } else if (v === 3) {
        d = 4;
      } else if (v === 4) {
        d = 5;
        unblock = !!t.bleed;
      } else if (v === 5) {
        if (a.hp <= 40) {
          heal(a, 5);
          skip = true;
        } else {
          d = 4;
          // Hand inspection is resolved by Engine.resolveOpponentHandSkill(),
          // which applies the mode policy (Adventure choice vs RNG).  The
          // character effect remains a pure damage fallback for direct calls.
        }
      } else if (v === 7) {
        d = 3 + (t.bleed || 0);
        unblock = true;
        return { d, skip, unblock, drain: d, isDrain: true };
      } else if (v === 0) {
        let totalBleed = eng.s.is1v2 ? eng.s.player.bleed + eng.s.ai.bleed + eng.s.ai2.bleed : a.bleed + t.bleed;
        let oldBleed = t.bleed;
        bleed(1);
        d = 1 + 3 * oldBleed;
        heal(a, totalBleed);
        immediateBuffs = true;
      }
      return { d, skip, unblock, immediateBuffs };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw, burn, bleed, cancelAttackDebuffs, clearDebuffs } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d, desc = '';
      if (v === 1) {
        let b = Math.min(3, d);
        remaining = Math.max(0, d - b);
        desc = `Saiki 1牌：防御至多3点`;
      } else if (v === 2) {
        counter(opponent, 3);
        bleed(opponent, 1);
        remaining = d;
        desc = 'Saiki 2牌：反击3点伤害+1层流血';
      } else if (v === 0) {
        let shared = Math.ceil(d / 2);
        counter(opponent, shared);
        hurt(defender, shared);
        remaining = 0;
        cancelAttackDebuffs(owner, true);
        desc = `Saiki 0牌：免疫debuff，双方均摊${shared}点伤害并反弹debuff`;
      }
      return { remaining, desc };
    }
  });
})();
