(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Saiki',
    hp: 80,
    type: '猎手',
    passive: '进攻时打出有效黄色牌会施加1层流血',
    init() { return {}; },
    turnStart(eng, ch) {},
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, bleed, guard, takeReveal, heal, draw, clearDebuffs } = helpers;
      let d = 0, skip = false, unblock = false;
      if (v === 1) {
        d = 4;
      } else if (v === 2) {
        d = 3;
        heal(a, 1);
      } else if (v === 3) {
        d = 2;
      } else if (v === 4) {
        d = 5;
        unblock = !!t.bleed;
      } else if (v === 5) {
        if (a.hp <= 20) {
          heal(a, 4);
          skip = true;
        } else if (a.hp <= 50) {
          d = 4;
          skip = true;
        } else {
          d = 4;
          let oh = eng.h[target];
          if (oh.length) {
            let drawn = oh.splice(Math.floor(Math.random() * oh.length), 1)[0];
            eng.h[owner].push(drawn);
            eng.s.revealCards = [JSON.parse(JSON.stringify(drawn))];
            eng.emit('reveal', 'Saiki 5牌抽取对手手牌', drawn, { who: target });
          }
        }
      } else if (v === 7) {
        d = 2 + 2 * t.bleed;
        heal(a, d);
      } else if (v === 0) {
        let totalBleed = eng.s.is1v2 ? eng.s.player.bleed + eng.s.ai.bleed + eng.s.ai2.bleed : a.bleed + t.bleed;
        let oldBleed = t.bleed;
        bleed(1);
        d = 1 + 3 * oldBleed;
        heal(a, totalBleed);
      }
      return { d, skip, unblock };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw, burn, bleed, cancelAttackDebuffs, clearDebuffs } = helpers;
      let remaining = d, desc = '';
      if (v === 1) {
        let b = Math.min(3, d);
        remaining = Math.max(0, d - b);
        desc = `Saiki 1牌：防御至多3点`;
      } else if (v === 2) {
        hurt(opponent, 3);
        bleed(opponent, 1);
        remaining = d;
        desc = 'Saiki 2牌：反击3点+1层流血';
      } else if (v === 0) {
        let shared = Math.ceil(d / 2);
        hurt(opponent, shared);
        hurt(defender, shared);
        remaining = 0;
        cancelAttackDebuffs(owner, true);
        desc = `Saiki 0牌：免疫debuff，双方均摊${shared}点伤害并反弹debuff`;
      }
      return { remaining, desc };
    },
    aiAttackScore(eng, v, c, x) {
      if (v === 0 && x.oppBleed >= 2) return 82;
      if (v === 4 && x.oppBleed) return 78;
      if (v === 7 && x.oppBleed >= 2) return 75;
      if (v === 5) return x.hpPct <= 20 ? 70 : x.hpPct <= 50 ? 65 : 58;
      if (v === 6 && eng.h.ai.some(q => q.isNumberCard && q.value > 0 && q.value >= 5)) return 60;
      if (v === 0 && x.oppBleed === 1) return 55;
      if (v === 3 && x.oppHand) return 48;
      if (v === 1) return 42;
      if (v === 2) return 40;
      return null;
    },
    aiDefendScore(eng, v, c, top, x) {
      if (v === 0) return 85;
      if (v === 2 && x.oppBleed) return 60;
      if (v === 3) return 50;
      return null;
    },
    aiSkip(eng, c, x) {
      let v = c.value;
      if (v === 7 && !x.oppBleed) return true;
      return false;
    },
    aiAttackPriority(eng, v, c, x) {
      if (v === 0 && x.oppBleed >= 2) return 82;
      if (v === 4 && x.oppBleed) return 78;
      if (v === 7 && x.oppBleed >= 2) return 75;
      if (v === 5) return x.hpPct <= 20 ? 70 : x.hpPct <= 50 ? 65 : 58;
      if (v === 6 && eng.h.ai.some(q => q.isNumberCard && q.value >= 5)) return 60;
      if (v === 0 && x.oppBleed === 1) return 55;
      if (v === 3 && x.oppHand) return 48;
      if (v === 1) return 42;
      if (v === 2) return 40;
      return null;
    },
    aiDefendPriority(eng, v, c, top, x) {
      if (v === 0) return 85;
      if (v === 2 && x.oppBleed) return 60;
      if (v === 3) return 50;
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
      if (v === 3) {
        let drawn = pull('Saiki 3牌抽取玩家手牌');
        if (drawn) {
          let drop = drawn.isItemCard || (drawn.value !== 0 && drawn.value <= 2);
          if (drop); else eng.h.ai.push(drawn);
          eng.emit('desc', `Saiki AI${drop ? '弃掉' : '保留'}${eng.cardText(drawn)}`);
        }
        return { d: 2, skip: false, unblock: false };
      }
      if (v === 5) {
        if (a.hp <= 20) {
          heal(a, 4);
          return { d: 0, skip: true, unblock: false };
        }
        if (a.hp <= 50) return { d: 4, skip: true, unblock: false };
        let drawn = pull('Saiki 5牌抽取玩家手牌');
        if (drawn) eng.h.ai.push(drawn);
        return { d: 4, skip: false, unblock: false };
      }
      if (v === 6) {
        let judge = null;
        for (const x of eng.h.ai) if (x.isNumberCard && (!judge || x.value > judge.value)) judge = x;
        if (!judge) {
          eng.emit('desc', 'Saiki 6牌：没有数字牌可用于判定');
          return { d: 0, skip: true, unblock: false };
        }
        eng.h.ai.splice(eng.h.ai.indexOf(judge), 1);
        if (judge.isWhite) judge.chosenColor = eng.effective(c);
        eng.setDiscardTop(judge);
        eng.s.revealCards = [JSON.parse(JSON.stringify(judge))];
        eng.emit('reveal', 'Saiki 6牌数字判定', judge, { who: 'ai' });
        if (eng.effective(judge) === 'YELLOW') eng.bleed(t, 1);
        let d = Math.ceil(judge.value * 1.5);
        eng.emit('desc', `Saiki AI选择最高点数${eng.cardText(judge)}，造成${d}点伤害${eng.effective(judge) === 'YELLOW' ? '并施加1层流血' : ''}`);
        return { d, skip: false, unblock: false };
      }
      return null;
    }
  });
})();