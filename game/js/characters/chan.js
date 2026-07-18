(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Chan',
    hp: 80,
    type: '谋士',
    passive: '进攻回合开始前抽1张牌',
    init() { return {}; },
    turnStart(eng, ch, w) { eng.draw(w, 1); },
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, bleed, guard, takeReveal, heal, draw, clearDebuffs } = helpers;
      let d = 0, skip = false, unblock = false;
      if (v === 1) {
        d = 1;
        eng.freeze(t);
        skip = true;
      } else if (v === 2) {
        d = 4;
      } else if (v === 3) {
        d = 2;
        draw(owner, 1, true);
      } else if (v === 4) {
        d = 2;
        skip = true;
      } else if (v === 5) {
        d = 2;
        eng.hurt(a, 2);
        let cards = [];
        for (let i = 0; i < 5 && eng.deck.length; i++) cards.push(eng.deck.pop());
        cards.sort((x, y) => {
          let rank = z => z.isBlack ? 4 : z.isItemCard ? 3 : z.value === 0 ? 2 : 1;
          return rank(y) - rank(x) || (y.value || 0) - (x.value || 0);
        });
        for (let i = cards.length - 1; i >= 0; i--) eng.deck.push(cards[i]);
        draw(owner, 2, true);
        skip = true;
      } else if (v === 6) {
        let r = takeReveal('Chan 6牌判定');
        d = 5;
        skip = !!r && (r.isBlack || r.isWhite || eng.effective(r) === 'BLUE');
      } else if (v === 7) {
        d = 6;
      } else if (v === 0) {
        d = 7;
        eng.freeze(t);
        draw(owner, 1, true);
      }
      return { d, skip, unblock };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw, burn, bleed, cancelAttackDebuffs, clearDebuffs } = helpers;
      let remaining = d, desc = '';
      if (v === 1) {
        let b = Math.ceil(d / 2);
        remaining = Math.max(0, d - b);
        desc = `Chan 1牌：格挡${b}点`;
      } else if (v === 2) {
        hurt(opponent, 2);
        eng.freeze(opponent);
        remaining = d;
        desc = 'Chan 2牌：反击2点+施加冷冻';
      } else if (v === 0) {
        let cd = Math.ceil(d / 2);
        hurt(opponent, cd);
        remaining = 0;
        if (owner === 'player') {
          eng.s.forceEndAITurn = true;
        } else if (owner === 'ai') {
          eng.s.forceEndPlayerTurn = true;
        }
        desc = `Chan 0牌：防御所有伤害并反击${cd}点，进攻方回合结束`;
      }
      return { remaining, desc };
    },
    aiAttackScore(eng, v, c, x) {
      if (v === 0) return 72;
      if (v === 4 && (x.oppBleed || x.oppBurn)) return 70;
      if (v === 6) return 62;
      if (v === 7 && eng.h.ai.length >= 3) return 60;
      if (v === 5 && x.hpPct > 30) return 55;
      if (v === 2) return 40;
      if (v === 3) return 38;
      if (v === 1 && x.hpPct <= 50) return 50;
      return null;
    },
    aiDefendScore(eng, v, c, top, x) {
      if (v === 0) return 85;
      if (v === 2) return 55;
      if (v === 3) return 45;
      return null;
    },
    aiSkip(eng, c, x) {
      return false;
    },
    aiAttackPriority(eng, v, c, x) {
      if (v === 0) return 72;
      if (v === 4 && (x.oppBleed || x.oppBurn)) return 70;
      if (v === 6) return 62;
      if (v === 7 && eng.h.ai.length >= 3) return 60;
      if (v === 5 && x.hpPct > 30) return 55;
      if (v === 2) return 40;
      if (v === 3) return 38;
      if (v === 1 && x.hpPct <= 50) return 50;
      return null;
    },
    aiDefendPriority(eng, v, c, top, x) {
      if (v === 0) return 85;
      if (v === 2) return 55;
      if (v === 3) return 45;
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
        let drawn = pull('Chan 4牌抽取玩家手牌');
        if (!drawn) return { d: 2, skip: true, unblock: false };
        let swap = null;
        if (drawn.isItemCard || drawn.value === 0) {
          for (const x of eng.h.ai) {
            if (!x.isItemCard && x.value !== 0 && (!swap || x.value < swap.value)) swap = x;
          }
        } else {
          for (const x of eng.h.ai) {
            if (!x.isItemCard && x.value !== 0 && x.color === drawn.color && x.value < drawn.value && (!swap || x.value < swap.value)) swap = x;
          }
        }
        if (swap) {
          eng.h.ai.splice(eng.h.ai.indexOf(swap), 1);
          eng.h.player.push(swap);
          eng.h.ai.push(drawn);
          eng.emit('desc', `Chan AI保留${eng.cardText(drawn)}，用${eng.cardText(swap)}交换`);
          return { d: 0, skip: true, unblock: false };
        }
        eng.emit('desc', `Chan AI弃掉${eng.cardText(drawn)}，造成2点伤害并跳过防御`);
        return { d: 2, skip: true, unblock: false };
      }
      if (v === 7) {
        let drawn = pull('Chan 7牌抽取玩家手牌');
        if (drawn) {
          let keep = drawn.isItemCard || drawn.value === 0 || drawn.value >= 4;
          if (keep) eng.h.ai.push(drawn);
          eng.emit('desc', `Chan AI${keep ? '保留' : '弃掉'}${eng.cardText(drawn)}`);
        }
        return { d: 6, skip: false, unblock: false };
      }
      return null;
    }
  });
})();