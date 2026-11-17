(function () {
  const C = CharacterRegistry;
  C.register({
    name: 'Fenric',
    hp: 70,
    type: '铁壁',
    passive: '受到的技能伤害超过7点时会截断为7点',
    incomingSkillDamageCap: 7,
    init() { return {}; },
    turnStart(eng, ch) {},
    attackEffectTiming: { 5: 'afterDamage' },
    effect(eng, v, c, a, t, owner, helpers) {
      const { guard, heal, draw } = helpers;
      let d = 0;
      let skip = false;
      let unblock = false;
      const color = eng.effective(c);
      if (v === 1) {
        d = 2;
        guard(1);
      } else if (v === 2) {
        d = 4;
      } else if (v === 3) {
        d = 4;
        if (color === 'RED') {
          if (typeof eng.harden === 'function') eng.harden(a, 1);
          else a.harden = Math.min(2, (a.harden || 0) + 1);
        } else if (color === 'BLUE') {
          if (typeof eng.hypothermia === 'function') eng.hypothermia(t, 1);
          else t.hypothermia = Math.min(2, (t.hypothermia || 0) + 1);
        } else {
          d = 5;
        }
      } else if (v === 4) {
        const revealed = typeof eng.reveal === 'function'
          ? eng.reveal('Fenric 4牌判定', owner)
          : null;
        if (revealed && revealed.isNumberCard) {
          d = Math.max(3, Math.max(0, Number(revealed.value) || 0));
        } else {
          d = 3;
        }
        if (typeof eng.harden === 'function') eng.harden(a, 1);
        else a.harden = Math.min(2, (a.harden || 0) + 1);
        if (revealed && typeof eng.discardWithEvent === 'function') {
          eng.discardWithEvent(revealed, owner, {
            from: 'reveal',
            faceUp: true,
            desc: `Fenric 4牌将${eng.cardText(revealed)}置入弃牌库`
          });
        }
      } else if (v === 5) {
        d = 2;
        draw(owner, 1, true);
        guard(2);
        (eng.s.pendingSkillStatuses ||= []).push({
          target: typeof eng._who === 'function' ? eng._who(a) : owner,
          id: 'heal',
          method: 'heal',
          args: [Math.max(0, a.guard || 0)],
          timing: 'afterDamage'
        });
      } else if (v === 0) {
        guard(2);
        d = 2 + Math.max(0, a.guard || 0);
        unblock = (a.harden || 0) > 0;
      }
      return { d, skip, unblock };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d;
      let desc = '';
      if (v === 1) {
        if (typeof eng.hypothermia === 'function') eng.hypothermia(opponent, 1);
        else opponent.hypothermia = Math.min(2, (opponent.hypothermia || 0) + 1);
        const blocked = Math.ceil(d / 2);
        remaining = Math.max(0, d - blocked);
        desc = `Fenric 1牌：格挡${blocked}点并施加[失温]`;
      } else if (v === 2) {
        eng.addGuard(defender, 3);
        remaining = d;
        desc = 'Fenric 2牌：获得3层[守护]';
      } else if (v === 0) {
        counter(opponent, d);
        remaining = 0;
        desc = `Fenric 0牌：反弹${d}点伤害`;
      }
      return { remaining, desc };
    }
  });
})();