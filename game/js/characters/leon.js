(function() {
  // Leon 0 still has a separate batch-discard rule; keep its random source
  // local until that multi-target effect is moved into the batch policy.
  const random = () => window.FurryGame && window.FurryGame.CombatRuntime ? window.FurryGame.CombatRuntime.random() : Math.random();
  const C = CharacterRegistry;
  C.register({
    name: 'Leon',
    hp: 90,
    type: '骑士',
    passive: '免疫灼烧',
    init() { return {}; },
    turnStart(eng, ch) {},
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, takeReveal, draw, hurt } = helpers;
      let d = 0, skip = false, unblock = false;
      if (v === 1) {
        burn(3);
        skip = true;
      } else if (v === 2) {
        d = 4;
      } else if (v === 3) {
        d = 3;
        burn(1);
      } else if (v === 4) {
        d = 5;
        skip = !!t.burn;
      } else if (v === 5) {
        d = 4 + (t.burn ? 2 : 0);
      } else if (v === 6) {
        let r = takeReveal('Leon 6牌判定');
        if (r && r.isNumberCard && r.value >= 1 && r.value <= 7) {
          d = r.value;
        } else {
          draw(owner, 1, true);
          burn(2);
          skip = true;
        }
      } else if (v === 7) {
        d = 6;
        burn(2);
        // Hand inspection is resolved by Engine.resolveOpponentHandSkill(),
        // which applies the mode policy (Adventure choice vs RNG).  Keeping
        // this effect pure avoids a second random/removal path.
      } else if (v === 0) {
        d = 7;
        burn(2);
        unblock = true;
        const handKey = owner === 'player'
          ? (typeof eng._who === 'function' ? eng._who(t) : 'ai')
          : 'player';
        let oh = eng.h[handKey];
        if (oh) {
          let dc = Math.min(2, oh.length);
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
        if (typeof hurt === 'function') hurt(a, 2);
      }
      return { d, skip, unblock };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw, burn } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d, desc = '';
      if (v === 1) {
        burn(opponent, 1);
        heal(defender, 2);
        remaining = d;
        desc = 'Leon 1牌：施加1层灼烧+恢复2点生命';
      } else if (v === 2) {
        let cd = Math.ceil(d / 2);
        counter(opponent, cd);
        draw(owner, 1, true);
        remaining = d;
        desc = `Leon 2牌：反击${cd}点+抽1张牌`;
      } else if (v === 3) {
        let b = Math.ceil(d / 2);
        draw(owner, 1, true);
        remaining = Math.max(0, d - b);
        desc = `Leon 3牌：格挡${b}点+抽1张牌`;
      } else if (v === 0) {
        const opponentKey = typeof eng._who === 'function' ? eng._who(opponent) : (owner === 'player' ? 'ai' : 'player');
        let opponentHand = eng.h[opponentKey];
        if (opponentHand && opponentHand.length) {
          // “弃掉所有牌” must return every card to the correct owner pile;
          // removing the array entries directly would lose cards and break
          // the shared conservation invariant.
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
