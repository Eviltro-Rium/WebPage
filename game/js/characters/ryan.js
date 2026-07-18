(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Ryan',
    hp: 80,
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
    },
    aiAttackScore(eng, v, c, x) {
      if (v === 0 && x.hpPct <= 33) return 85;
      if (v === 6) {
        let sum = eng.h.ai.filter(q => q.isNumberCard).reduce((a, q) => a + q.value, 0);
        return sum >= 15 ? 72 : sum >= 10 ? 50 : null;
      }
      if (v === 1 && !x.full) return 55;
      if (v === 4 && !x.oppGuard) return 48;
      return null;
    },
    aiDefendScore(eng, v, c, top, x) {
      if (v === 0 && x.hpPct <= 33) return 85;
      if (v === 3 && eng.effective(top) === 'RED') return 72;
      return null;
    },
    aiSkip(eng, c, x) {
      let v = c.value;
      if (x.full && (v === 2 || v === 6)) return true;
      if (x.hpPct <= 25 && v === 0) return true;
      return false;
    },
    aiAttackPriority(eng, v, c, x) {
      if (v === 0 && x.hpPct <= 33) return 85;
      if (v === 6) {
        let sum = eng.h.ai.filter(q => q.isNumberCard).reduce((a, q) => a + q.value, 0);
        return sum >= 15 ? 72 : sum >= 10 ? 50 : null;
      }
      if (v === 1 && !x.full) return 55;
      if (v === 4 && !x.oppGuard) return 48;
      return null;
    },
    aiDefendPriority(eng, v, c, top, x) {
      if (v === 0 && x.hpPct <= 33) return 85;
      if (v === 3 && eng.effective(top) === 'RED') return 72;
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
      if (v === 5) {
        let hand = eng.h[owner];
        let numberCards = hand.filter(q => q.isNumberCard);
        if (!numberCards.length) return null;
        let best = numberCards.reduce((a, b) => b.value > a.value ? b : a);
        let aiHp = eng.h[owner] ? eng.hp[owner] : 0;
        let aiMaxHp = 80;
        let d = 0, skip = false, unblock = false;
        if (aiHp / aiMaxHp > 0.5) {
          d = best.value;
        } else {
          heal(a, best.value);
          skip = true;
        }
        return { d, skip, unblock };
      }
      if (v === 7) {
        let d = Math.ceil(eng.h[owner].filter(x => x.isNumberCard).reduce((q, x) => q + x.value, 0) / 2);
        return { d, skip: false, unblock: false };
      }
      return null;
    }
  });
})();