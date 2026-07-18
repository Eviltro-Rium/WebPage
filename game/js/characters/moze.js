(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Moze',
    hp: 100,
    type: '守护',
    passive: '可消耗守护减免伤害，但不能减免流血伤害',
    init() { return {}; },
    turnStart(eng, ch) {},
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, bleed, guard, takeReveal, heal, draw, clearDebuffs } = helpers;
      let d = 0, skip = false, unblock = false;
      if (v === 1) {
        d = 3;
      } else if (v === 2) {
        d = 2;
        guard(eng.effective(c) === 'GREEN' ? 2 : 1);
      } else if (v === 3) {
        d = 1;
        heal(a, 1);
        guard(1);
      } else if (v === 4) {
        skip = true;
      } else if (v === 5) {
        d = 4;
        guard(1);
      } else if (v === 6) {
        d = 2 + a.guard;
        unblock = !a.guard;
      } else if (v === 7) {
        let q = a.burn + a.bleed + (a.frozen ? 1 : 0);
        clearDebuffs(a);
        d = 3 + q;
      } else if (v === 0) {
        guard(3);
        d = 5;
        draw(owner, 1, true);
      }
      return { d, skip, unblock };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw, burn, bleed, cancelAttackDebuffs, clearDebuffs } = helpers;
      let remaining = d, desc = '';
      if (v === 1) {
        let b = Math.ceil(d / 2);
        defender.guard = Math.min(5, defender.guard + 1);
        remaining = Math.max(0, d - b);
        desc = `Moze 1牌：防御${b}点+1层守护`;
      } else if (v === 2) {
        let cd = 1 + Math.ceil(defender.guard / 2);
        hurt(opponent, cd);
        remaining = d;
        desc = `Moze 2牌：反击${cd}点`;
      } else if (v === 3) {
        defender.guard = Math.min(5, defender.guard + 1);
        heal(defender, Math.ceil(defender.guard / 2));
        remaining = d;
        desc = `Moze 3牌：1层守护+恢复${Math.ceil(defender.guard / 2)}点`;
      } else if (v === 0) {
        let b = Math.ceil(d / 2);
        defender.guard = Math.min(5, defender.guard + 2);
        let cd = defender.guard * 2;
        hurt(opponent, cd);
        remaining = Math.max(0, d - b);
        desc = `Moze 0牌：防御${b}点+2层守护+反击${cd}点`;
      }
      return { remaining, desc };
    },
    aiAttackScore(eng, v, c, x) {
      if (v === 0) return 82;
      if (v === 6 && x.guard >= 3) return 75;
      if (v === 7 && x.debuffCount >= 2) return 70;
      if (v === 2 && c.color === 'GREEN' && x.guard < 3) return 68;
      if (v === 4 && !x.guard) return 65;
      if (v === 3 && x.guard < 2) return 60;
      if (v === 1) return 45;
      if (v === 5) return 50;
      if (v === 6 && x.guard) return 55;
      if (v === 7) return 48;
      if (v === 2) return 42;
      return null;
    },
    aiDefendScore(eng, v, c, top, x) {
      if (v === 0) return 85;
      if (v === 3 && x.guard) return 68;
      if (v === 2 && x.guard) return 62;
      if (v === 1) return 50;
      return null;
    },
    aiSkip(eng, c, x) {
      if (c.value === 6 && !x.guard) return true;
      return false;
    },
    aiAttackPriority(eng, v, c, x) {
      if (v === 0) return 82;
      if (v === 6 && x.guard >= 3) return 75;
      if (v === 7 && x.debuffCount >= 2) return 70;
      if (v === 2 && c.color === 'GREEN' && x.guard < 3) return 68;
      if (v === 4 && !x.guard) return 65;
      if (v === 3 && x.guard < 2) return 60;
      if (v === 1) return 45;
      if (v === 5) return 50;
      if (v === 6 && x.guard) return 55;
      if (v === 7) return 48;
      if (v === 2) return 42;
      return null;
    },
    aiDefendPriority(eng, v, c, top, x) {
      if (v === 0) return 85;
      if (v === 3 && x.guard) return 68;
      if (v === 2 && x.guard) return 62;
      if (v === 1) return 50;
      return null;
    },
    aiSpecialEffect(eng, n, v, c, a, t, owner, helpers) {
      const { heal, bleed, burn, draw } = helpers;
      const pull = label => {
        if (!eng.h.player.length) return null;
        let card = eng.h.player.splice(Math.floor(Math.random() * eng.h.player.length), 1)[0];
        eng.s.revealCards = [JSON.parse(JSON.stringify(card))];
        eng.emit('reveal', label, card, { who: 'player' });
        return card;
      };
      if (v === 4) {
        let best = null;
        for (const x of eng.h.ai) {
          if (x.isNumberCard && (!best || x.value > best.value)) best = x;
        }
        if (!best) {
          eng.emit('desc', 'Moze 4牌：没有数字牌可用于获得守护');
          return { d: 0, skip: true, unblock: false };
        }
        eng.h.ai.splice(eng.h.ai.indexOf(best), 1);
        a.guard = Math.min(5, a.guard + best.value);
        eng.s.revealCards = [JSON.parse(JSON.stringify(best))];
        eng.emit('reveal', 'Moze 4牌守护判定', best, { who: 'ai' });
        eng.emit('desc', `Moze AI弃掉${eng.cardText(best)}，获得${best.value}层[守护]`);
        return { d: 0, skip: true, unblock: false };
      }
      if (v === 5) {
        let drawn = pull('Moze 5牌抽取玩家手牌');
        if (!drawn) return { d: 0, skip: true, unblock: false };
        eng.h.ai.push(drawn);
        let hit = drawn.isBlack || drawn.isWhite || eng.effective(drawn) === 'GREEN';
        if (hit) {
          eng.emit('desc', `Moze 5牌判定${eng.cardText(drawn)}：造成4点伤害`);
          return { d: 4, skip: false, unblock: false };
        }
        heal(a, 2);
        a.guard = Math.min(5, a.guard + 1);
        eng.emit('desc', `Moze 5牌判定${eng.cardText(drawn)}：恢复2点并获得1层[守护]`);
        return { d: 0, skip: true, unblock: false };
      }
      if (v === 7) {
        let bonus = a.burn + a.bleed + (a.frozen ? 1 : 0);
        a.burn = 0;
        a.bleed = 0;
        a.frozen = false;
        eng.emit('desc', `Moze AI清除${bonus}层debuff，造成${3 + bonus}点伤害`);
        return { d: 3 + bonus, skip: false, unblock: false };
      }
      return null;
    }
  });
})();