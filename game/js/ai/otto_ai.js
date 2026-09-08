(function () {
  AIRegistry.register({
    name: 'Otto',

    attackScore(eng, v, c, x) {
      if (v === 0) {
        let crit = x.self.crit || 0;
        if (crit >= 1 && x.opponent.hp <= 4 + crit * 3) return 95;
        if (crit === 0) return x.opponent.hp <= 4 ? 90 : 62;
        return 58 + crit * 8;
      }
      if (v === 6) return x.opponent.hp <= 6 ? 88 : 68;
      if (v === 7) {
        let divisor = eng.s.is1v2 ? 20 : 10;
        let dmg = Math.ceil(x.self.hp / divisor);
        return dmg >= x.opponent.hp ? 92 : 50 + dmg * 4;
      }
      if (v === 5) {
        let candidates = x.hand.filter(card => card !== c && card.isNumberCard);
        if (!candidates.length) return -100;
        let max = Math.max(...candidates.map(card => card.value));
        return max >= x.opponent.hp ? 90 : 55 + max * 3;
      }
      if (v === 4) return 58;
      if (v === 3) return 52;
      if (v === 2) return 48;
      if (v === 1) return 44;
      return null;
    },

    defendScore(eng, v, c, top, x) {
      if (v === 0) return x.lethal ? 96 : x.incomingDamage >= 5 ? 82 : 60;
      if (v === 3) return x.missingHp >= 2 ? 64 : 40;
      if (v === 2) return x.incomingDamage >= 3 ? 56 : 38;
      if (v === 1) return 52 + Math.min(16, Math.ceil(x.incomingDamage / 2) * 3);
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      if (c.value === 0) return 78;
      if (c.value === 7) return 55 + Math.ceil(x.self.hp / (eng.s.is1v2 ? 20 : 10)) * 3;
      if (c.value === 6) return 66;
      if (c.value === 5) return x.hand.filter(card => card !== c && card.isNumberCard).length ? 60 : 20;
      if (c.value === 4) return 48;
      return 28 + c.value * 5;
    },

    skip(eng, c, x, phase) {
      return phase === 'attack' && c.value === 5 && !x.hand.some(card => card !== c && card.isNumberCard);
    },

    specialEffect(eng, n, v, c, a, t, owner, helpers) {
      if (v === 3) {
        let r = eng.reveal('Otto 3牌判定');
        if (!r) return { d: 0, skip: true, unblock: false };
        let dmg = r.isItemCard ? 4 : r.value;
        if (dmg > 4) {
          eng.hurt(a, 2);
          if (a.crit < 3) a.crit++;
          eng.emit('buff', '+1[暴击]', null, { who: owner, kind: 'crit', stacks: a.crit });
        }
        eng.discardWithEvent(r, owner, { from: 'reveal', faceUp: true, desc: `Otto 3牌将${eng.cardText(r)}置于弃牌库底` });
        eng.emit('desc', `Otto 3牌：${eng.cardText(r)}造成${dmg}点伤害${dmg > 4 ? '，自伤2+1层暴击' : ''}`);
        return { d: dmg, skip: false, unblock: false };
      }

      if (v === 4) {
        eng.refillDeckIfNeeded();
        let c1 = eng.deck.length ? eng.deck.pop() : null;
        eng.refillDeckIfNeeded();
        let c2 = eng.deck.length ? eng.deck.pop() : null;
        eng.s.revealCards = [];
        if (c1) eng.s.revealCards.push(helpers.copy(c1));
        if (c2) eng.s.revealCards.push(helpers.copy(c2));
        eng.emit('reveal', `Otto 4牌：翻开牌库顶${eng.s.revealCards.length}张牌判定`, c1 || c2 || null, {
          who: owner, from: 'deck', cards: eng.s.revealCards.map(helpers.copy)
        });
        let d = 0, skip = false, unblock = false, isDrain = false;
        if (c1 && c2) {
          if (c1.isItemCard && c2.isItemCard) {
            d = 3; skip = true; unblock = true; isDrain = true;
            eng.emit('desc', 'Otto 4牌：两张道具牌，吸取3点生命（不可防御）');
          } else if (c1.isItemCard || c2.isItemCard) {
            let nc = c1.isItemCard ? c2 : c1;
            d = Math.ceil(nc.value / 2); unblock = true;
            eng.emit('desc', `Otto 4牌：1张道具牌，造成${d}点伤害（不可防御）`);
          } else {
            d = c1.value + c2.value;
            eng.emit('desc', `Otto 4牌：两张数字牌，造成${d}点伤害`);
          }
        } else if (c1) {
          if (c1.isItemCard) {
            d = 3; skip = true; unblock = true; isDrain = true;
            eng.emit('desc', 'Otto 4牌：仅1张道具牌，吸取3点生命（不可防御）');
          } else {
            d = c1.value;
            eng.emit('desc', `Otto 4牌：仅1张数字牌，造成${d}点伤害`);
          }
        }
        if (c2) eng.deck.push(c2);
        if (c1) eng.deck.push(c1);
        eng.emit('desc', 'Otto 4牌：判定完毕，两张牌放回牌库顶');
        return { d, skip, unblock, isDrain };
      }

      if (v === 5) {
        let candidates = helpers.selfHand.filter(card => card.isNumberCard);
        if (!candidates.length) {
          eng.emit('desc', 'Otto 5牌：没有可判定的数字牌');
          return { d: 0, skip: true, unblock: false };
        }
        let best = candidates.reduce((b, card) => card.value > b.value ? card : b);
        helpers.selfHand.splice(helpers.selfHand.indexOf(best), 1);
        if (best.isWhite) best.chosenColor = eng.effective(c);
        eng.s.revealCards = [helpers.copy(best)];
        eng.emit('reveal', `Otto 5牌判定：${eng.cardText(best)}`, best, { who: owner, from: 'hand' });
        eng.discardWithEvent(best, owner, { from: 'reveal', faceUp: true, desc: `Otto 5牌将${eng.cardText(best)}置于弃牌库底` });
        if (best.isWhite) {
          eng.heal(a, best.value);
          if (a.crit < 3) a.crit++;
          eng.emit('buff', '+1[暴击]', null, { who: owner, kind: 'crit', stacks: a.crit });
          eng.emit('desc', `Otto 5牌：白牌恢复${best.value}点+1层暴击`);
          return { d: 0, skip: true, unblock: false };
        }
        eng.emit('desc', `Otto 5牌：造成${best.value}点伤害`);
        return { d: best.value, skip: false, unblock: false };
      }

      if (v === 6) {
        eng.hurt(a, 1);
        if (a.crit < 3) a.crit++;
        eng.emit('buff', '+1[暴击]', null, { who: owner, kind: 'crit', stacks: a.crit });
        return { d: 6, skip: false, unblock: false };
      }

      if (v === 7) {
        let divisor = eng.s.is1v2 ? 20 : 10;
        let dmg = Math.ceil(a.hp / divisor);
        eng.emit('desc', `Otto 7牌：自身生命${a.hp}/${divisor}=${dmg}点伤害`);
        return { d: dmg, skip: false, unblock: false };
      }

      if (v === 0) {
        let stacks = Math.min(a.crit || 0, 3);
        let d = 4 + stacks * 3;
        if (stacks > 0) {
          eng.hurt(a, stacks * 2);
          eng.emit('desc', `Otto 0牌：拥有${stacks}层暴击，${d}点伤害，自伤${stacks * 2}`);
          return { d, skip: false, unblock: false };
        }
        return { d: 4, skip: false, unblock: true };
      }

      return null;
    }
  });
})();