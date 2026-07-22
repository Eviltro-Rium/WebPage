(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Ryan',
    hp: 70,
    type: '战士',
    passive: '进攻回合开始前恢复1点生命',
    init() { return {}; },
    turnStart(eng, ch) { eng.heal(ch, 1); },
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, bleed, guard, takeReveal, heal, draw, clearDebuffs } = helpers;
      let d = 0, skip = false, unblock = false;
      if (v === 1) {
        d = 4;
      } else if (v === 2) {
        d = 3;
        heal(a, 1);
      } else if (v === 3) {
        heal(a, 1);
        draw(owner, 1, true);
        skip = true;
        if (owner === 'player') eng.s.mayDiscardAfterSkill = true;
      } else if (v === 4) {
        let r = takeReveal('Ryan 4牌判定');
        if (r && (r.isBlack || r.isWhite || eng.effective(r) === 'GREEN')) {
          heal(a, 1);
          d = 4;
        }
      } else if (v === 5) {
        skip = true;
      } else if (v === 6) {
        d = 4;
        clearDebuffs(a);
        draw(owner, 1, true);
      } else if (v === 7) {
        d = Math.ceil(eng.h[owner].filter(x => x.isNumberCard).reduce((q, x) => q + x.value, 0) / 2);
      } else if (v === 0) {
        heal(a, 4);
        clearDebuffs(a);
        let cards = [];
        for (let i = 0; i < 2 && eng.deck.length; i++) {
          let r = eng.deck.pop();
          cards.push(r);
          eng.h[owner].push(r);
          eng.emit('reveal', `Ryan 0牌公示第${i + 1}张`, r);
        }
        eng.s.revealCards = JSON.parse(JSON.stringify(cards));
        d = cards.reduce((sum, x) => sum + (x.isNumberCard ? x.value : 4), 0);
      }
      return { d, skip, unblock };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw, burn, bleed, cancelAttackDebuffs, clearDebuffs } = helpers;
      let remaining = d, desc = '';
      if (v === 1) {
        let b = Math.ceil(d / 2);
        remaining = Math.max(0, d - b);
        desc = `Ryan 1牌：格挡${b}点`;
      } else if (v === 2) {
        hurt(opponent, 2);
        heal(defender, 2);
        remaining = d;
        desc = 'Ryan 2牌：反击2点并恢复2点生命';
      } else if (v === 3) {
        if (inheritedColor === 'RED') {
          remaining = 0;
          desc = 'Ryan 3牌：无视红色攻击';
        } else {
          heal(defender, 3);
          remaining = d;
          desc = 'Ryan 3牌：恢复3点生命';
        }
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