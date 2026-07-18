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
    },
    aiAttackScore(eng, v, c, x) {
      if (v === 4 && x.oppBurn) return 78;
      if (v === 7 && x.oppBurn >= 2) return 73;
      if (v === 0) return x.hpPct > 60 ? 12 : x.hpPct > 40 ? 25 : 40;
      if (v === 2 && !x.oppBurn) return 45;
      if (v === 3 && !x.oppBurn) return 42;
      return null;
    },
    aiDefendScore(eng, v, c, top, x) {
      if (v === 0 && x.hpPct <= 33) return 85;
      if (v === 1 && x.oppBurn < 4) return 55;
      return null;
    },
    aiSkip(eng, c, x) {
      if (x.full && c.value === 2) return true;
      if (c.value === 1 && x.oppBurn >= 4) return true;
      return false;
    },
    aiAttackPriority(eng, v, c, x) {
      if (v === 4 && x.oppBurn) return 78;
      if (v === 7 && x.oppBurn >= 2) return 73;
      if (v === 0) return x.hpPct > 60 ? 12 : x.hpPct > 40 ? 25 : 40;
      if (v === 2 && !x.oppBurn) return 45;
      if (v === 3 && !x.oppBurn) return 42;
      return null;
    },
    aiDefendPriority(eng, v, c, top, x) {
      if (v === 0 && x.hpPct <= 33) return 85;
      if (v === 1 && x.oppBurn < 4) return 55;
      return null;
    },
    aiSpecialEffect(eng, n, v, c, a, t, owner, helpers) {
      if (v === 7) {
        const { burn, draw } = helpers;
        const pull = label => {
          if (!eng.h.player.length) return null;
          let card = eng.h.player.splice(Math.floor(Math.random() * eng.h.player.length), 1)[0];
          eng.s.revealCards = [JSON.parse(JSON.stringify(card))];
          eng.emit('reveal', label, card, { who: 'player' });
          return card;
        };
        burn(2);        let drawn = pull('Leon 7牌随机弃掉玩家手牌');
        if (drawn) {
          eng.emit('desc', `Leon AI弃掉${eng.cardText(drawn)}`);
        }
        return { d: 6, skip: false, unblock: false };
      }
      return null;
    }
  });
})();