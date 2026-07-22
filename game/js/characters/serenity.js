(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Serenity',
    hp: 80,
    type: '暗影',
    passive: '免疫冷冻；低于30生命进入嗜血，正常态恢复额外+1',
    init() { return {}; },
    turnStart(eng, ch) { ch.bloodthirst = ch.hp < 30; },
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, bleed, guard, takeReveal, heal, draw, clearDebuffs } = helpers;
      let d = 0, skip = false, unblock = false;
      let bt = a.hp < 30;
      if (v === 1) {
        d = 3;
        skip = bt;
      } else if (v === 2) {
        d = bt ? 5 : 3;
      } else if (v === 3) {
        d = 2;
        heal(a, 2);
      } else if (v === 4) {
        d = 5;
        if (bt) bleed(1);
      } else if (v === 5) {
        let r = eng.reveal('Serenity 5牌判定');
        if (r && ['YELLOW', 'GREEN'].includes(eng.effective(r))) {
          heal(a, 4);
          skip = true;
        } else {
          d = 5;
        }
      } else if (v === 6) {
        d = 6;
        unblock = bt;
      } else if (v === 7) {
        d = 5;
        unblock = true;
        if (!bt) eng.hurt(a, 2);
        if (eng.s.is1v2) {
          let aoeTarget = owner === 'player' ? (t === eng.s.ai ? 'ai2' : 'ai') : (owner === 'ai' ? 'ai2' : 'ai');
          if (eng.s[aoeTarget] && eng.s[aoeTarget].alive) eng.hurt(eng.s[aoeTarget], 5);
        }
      } else if (v === 0) {
        let own = eng.h[owner], bonus = Math.min(9, own.length * 3);
        heal(a, 1 + bonus);
        own.splice(0, own.length);
        if (bt) {
          let opp = eng.h[target], count = opp.length;
          opp.splice(0, opp.length);
          draw(target, Math.max(0, count - 1), true);
        }
        draw(owner, 4, true);
        skip = true;
      }
      return { d, skip, unblock };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw, burn, bleed, cancelAttackDebuffs, clearDebuffs } = helpers;
      let remaining = d, desc = '';
      if (v === 1) {
        let b = Math.min(3, d);
        let bt = defender.hp < 30;
        if (bt) heal(defender, b);
        remaining = Math.max(0, d - b);
        desc = bt ? `Serenity 1牌：防御3点+恢复${b}点(嗜血)` : 'Serenity 1牌：防御至多3点';
      } else if (v === 2) {
        bleed(opponent, 1);
        let drain = opponent.bleed * 2;
        heal(defender, drain, 'drain');
        remaining = d;
        desc = `Serenity 2牌：1层流血+吸取${drain}点生命`;
      } else if (v === 3) {
        let b = Math.ceil(d / 2);
        let bt = defender.hp < 30;
        if (bt) b = Math.min(d, b + 2);
        remaining = Math.max(0, d - b);
        desc = `Serenity 3牌：格挡${b}点`;
      } else if (v === 0) {
        remaining = 0;
        let yellow = inheritedColor === 'YELLOW';
        if (yellow) {
          eng.s.serenityHalfTarget = owner === 'player' ? 'ai' : 'player';
          desc = 'Serenity 0牌判定黄牌：防御伤害，攻防结束后进攻方生命减半';
        } else {
          cancelAttackDebuffs(owner, false);
          desc = 'Serenity 0牌判定非黄牌：免疫所有伤害和debuff';
        }
      }
      return { remaining, desc };
    }
  });
})();