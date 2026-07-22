(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Leon',
    hp: 90,
    type: '骑士',
    passive: '免疫灼烧',
    init() { return {}; },
    turnStart(eng, ch) {},
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, takeReveal, draw } = helpers;
      let d = 0, skip = false, unblock = false;
      if (v === 1) {
        burn(2);
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
        let oh = eng.h[target];
        if (oh.length) {
          let dropped = oh.splice(Math.floor(Math.random() * oh.length), 1)[0];
          eng.s.revealCards = [JSON.parse(JSON.stringify(dropped))];
          eng.emit('reveal', 'Leon 7牌弃掉目标手牌', dropped, { who: target });
        }
      } else if (v === 0) {
        d = 7;
        burn(1);
        unblock = true;
        let oh = eng.h[target], dc = Math.min(2, oh.length);
        for (let i = 0; i < dc; i++) oh.splice(Math.floor(Math.random() * oh.length), 1);
        eng.hurt(a, 2);
      }
      return { d, skip, unblock };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw, burn } = helpers;
      let remaining = d, desc = '';
      if (v === 1) {
        burn(opponent, 1);
        heal(defender, 2);
        remaining = d;
        desc = 'Leon 1牌：施加1层灼烧+恢复2点生命';
      } else if (v === 2) {
        let cd = Math.ceil(d / 2);
        hurt(opponent, cd);
        draw(owner, 1, true);
        remaining = d;
        desc = `Leon 2牌：反击${cd}点+抽1张牌`;
      } else if (v === 3) {
        let b = Math.ceil(d / 2);
        draw(owner, 1, true);
        remaining = Math.max(0, d - b);
        desc = `Leon 3牌：格挡${b}点+抽1张牌`;
      } else if (v === 0) {
        let opponentHand = eng.h[owner === 'player' ? 'ai' : 'player'];
        opponentHand.splice(0, opponentHand.length);
        hurt(opponent, d);
        hurt(defender, d);
        remaining = 0;
        desc = `Leon 0牌：弃攻击方所有牌+双方各受${d}点伤害`;
      }
      return { remaining, desc };
    }
  });
})();