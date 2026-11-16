(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Saiki',
    hp: 60,
    type: '猎手',
    passive: '进攻打出有效黄色牌时，防御结算后施加1层流血',
    init() { return {}; },
    turnStart(eng, ch) {},
    damageAtSettlement(eng, v, a, t) {
      if (v === 0) return 2 * (t.bleed || 0) + 3;
      return v === 5 ? 3 + (t.bleed || 0) : null;
    },
    attackHealAfterDamage(eng, v) {
      if (v !== 0) return 0;
      return [eng.s.player, eng.s.ai, eng.s.ai2]
        .filter(Boolean)
        .reduce((sum, entity) => sum + (entity.bleed || 0), 0);
    },
    attackEffectTiming: { 1: 'afterDamage' },
    effect(eng, v, c, a, t, owner, helpers) {
      const { bleed, heal } = helpers;
      let d = 0;
      let skip = false;
      let unblock = false;
      if (v === 1) {
        d = 2;
        bleed(2);
      } else if (v === 2) {
        d = 4;
      } else if (v === 3) {
        d = 5;
        unblock = !!t.bleed;
      } else if (v === 4) {
        if (a.hp <= 30) {
          heal(a, 4);
          bleed(1);
          skip = true;
        } else {
          d = 4;
        }
      } else if (v === 5) {
        d = 3 + (t.bleed || 0);
        unblock = true;
        return { d, skip, unblock, drain: d, isDrain: true };
      } else if (v === 0) {
        bleed(1);
        d = 2 * (t.bleed || 0) + 3;
      }
      return { d, skip, unblock };
    },
    damageAfterDefense(v, damage, defender) {
      return null;
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, bleed, cancelAttackDebuffs } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d;
      let desc = '';
      if (v === 1) {
        counter(opponent, 3);
        bleed(opponent, 1);
        remaining = d;
        desc = 'Saiki 1牌：反击3点伤害+1层流血';
      } else if (v === 2) {
        if (typeof eng.refillDeckIfNeeded === 'function') eng.refillDeckIfNeeded();
        const r = eng.deck.length ? eng.deck.pop() : null;
        if (r) {
          const color = eng.effective(r);
          if (color === 'YELLOW' || r.isBlack || r.isWhite) {
            remaining = 0;
            desc = 'Saiki 2牌：防御所有伤害';
            if (typeof eng.discardWithEvent === 'function') {
              eng.discardWithEvent(r, owner, { from: 'reveal', faceUp: true, desc: `Saiki 2牌判定${eng.cardText(r)}` });
            }
          } else {
            eng.h[owner].push(r);
            eng.emit('reveal', `Saiki 2牌翻开${eng.cardText(r)}`, r, { who: owner, from: 'deck' });
            remaining = d;
            desc = `Saiki 2牌：判定无效，${eng.cardText(r)}加入手牌`;
          }
        } else {
          remaining = d;
          desc = 'Saiki 2牌：牌库空';
        }
      } else if (v === 0) {
        const shared = Math.ceil(d / 2);
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
