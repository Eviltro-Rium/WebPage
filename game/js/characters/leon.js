(function() {
  const random = () => window.FurryGame && window.FurryGame.CombatRuntime
    ? window.FurryGame.CombatRuntime.random() : Math.random();
  const C = CharacterRegistry;
  C.register({
    name: 'Leon',
    hp: 70,
    type: '法坦',
    passive: '可叠[灼伤]但不承受灼伤伤害',
    init() { return {}; },
    turnStart(eng, ch) {},
    damageAtSettlement(eng, v, a, t) { return null; },
    attackEffectTiming: { 0: 'afterDamage', 5: 'afterDamage' },
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, takeReveal, draw, hurt } = helpers;
      let d = 0;
      let skip = false;
      let unblock = false;
      if (v === 1) {
        d = 2;
        burn(2);
      } else if (v === 2) {
        d = 4;
      } else if (v === 3) {
        d = 5;
        skip = !!t.burn;
      } else if (v === 4) {
        const r = takeReveal('Leon 4牌判定');
        if (r && r.isNumberCard && r.value >= 1 && r.value <= 5) {
          d = r.value;
        } else {
          draw(owner, 1, true);
          burn(2);
          skip = true;
        }
      } else if (v === 5) {
        d = 6;
        burn(2);
      } else if (v === 0) {
        d = 7;
        burn(2);
        unblock = true;
        const handKey = owner === 'player'
          ? (typeof eng._who === 'function' ? eng._who(t) : 'ai')
          : 'player';
        const oh = eng.h[handKey];
        if (oh && !(eng.s.isAdventure && owner === 'player')) {
          const dc = Math.min(2, oh.length);
          for (let i = 0; i < dc; i++) {
            if (!oh.length) break;
            const index = Math.floor(random() * oh.length);
            const dropped = oh.splice(index, 1)[0];
            if (dropped && typeof eng.discardWithEvent === 'function') {
              eng.discardWithEvent(dropped, handKey, {
                handIndex: index,
                from: 'hand',
                faceUp: true,
                desc: `Leon 0牌随机弃掉${eng.cardText(dropped)}`
              });
            }
          }
        }
        hurt(a, 2);
      }
      return { d, skip, unblock };
    },
    damageAfterDefense(v, damage, defender) {
      return null;
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw, burn } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d;
      let desc = '';
      if (v === 1) {
        burn(opponent, 1);
        heal(defender, 2);
        remaining = d;
        desc = 'Leon 1牌：施加1层灼伤+恢复2点生命';
      } else if (v === 2) {
        const cd = Math.ceil(d / 2);
        counter(opponent, cd);
        draw(owner, 1, true);
        remaining = d;
        desc = `Leon 2牌：反击${cd}点+抽1张牌`;
      } else if (v === 0) {
        const opponentKey = typeof eng._who === 'function' ? eng._who(opponent) : (owner === 'player' ? 'ai' : 'player');
        const opponentHand = eng.h[opponentKey];
        if (opponentHand && opponentHand.length) {
          const discarded = opponentHand.splice(0, opponentHand.length);
          if (typeof eng.discardManyWithEvent === 'function') {
            eng.discardManyWithEvent(discarded, opponentKey, {
              from: 'hand',
              faceUp: true,
              desc: 'Leon 0牌：攻击方弃掉所有手牌'
            });
          } else if (typeof eng.discardWithEvent === 'function') {
            discarded.forEach(card => eng.discardWithEvent(card, opponentKey, {
              from: 'hand', faceUp: true, desc: 'Leon 0牌：攻击方弃掉' + eng.cardText(card)
            }));
          }
        }
        hurt(opponent, d);
        hurt(defender, d);
        remaining = 0;
        desc = `Leon 0牌：弃攻击方所有牌+双方各受${d}点伤害`;
      }
      return { remaining, desc };
    }
  });
})();