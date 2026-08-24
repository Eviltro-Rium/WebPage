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
      if (v === 7) return x.opponent.hp <= 6 ? 88 : 68;
      if (v === 6) {
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
      if (v === 4) return x.opponentHand >= 2 ? 60 : 35;
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
      if (c.value === 7) return 66;
      if (c.value === 6) return 55 + Math.ceil(x.self.hp / (eng.s.is1v2 ? 20 : 10)) * 3;
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
          if (a.crit < 2) a.crit++;
          eng.emit('buff', '+1[暴击]', null, { who: owner, kind: 'crit', stacks: a.crit });
        }
        eng.discardWithEvent(r, owner, { from: 'reveal', faceUp: true, desc: `Otto 3牌将${eng.cardText(r)}置于弃牌库底` });
        eng.emit('desc', `Otto 3牌：${eng.cardText(r)}造成${dmg}点伤害${dmg > 4 ? '，自伤2+1层暴击' : ''}`);
        return { d: dmg, skip: false, unblock: false };
      }

      if (v === 4) {
        let targetKey = owner === 'player' ? (eng.s.is1v2 ? (eng.s.attackTarget || 'ai') : 'ai') : 'player';
        let targetHand = eng.h[targetKey];
        if (!targetHand || !targetHand.length) return { d: 0, skip: true, unblock: false };
        let aiHand = helpers.selfHand;
        let aiCard = aiHand.reduce((best, card) => {
          let score = card.isItemCard ? 2 : card.value;
          return score > (best._s || 0) ? Object.assign(card, { _s: score }) : best;
        }, aiHand[0]);
        delete aiCard._s;
        let oppIdx = Math.floor(Math.random() * targetHand.length);
        let oppCard = targetHand[oppIdx];
        eng.s.revealCards = [helpers.copy(oppCard), helpers.copy(aiCard)];
        eng.emit('reveal', `Otto 4牌：AI翻开${eng.cardText(aiCard)}`, aiCard, { who: owner, from: 'hand' });
        eng.emit('reveal', `对手翻开${eng.cardText(oppCard)}`, oppCard, { who: targetKey, from: 'hand' });
        let d = 0, skip = false, unblock = false;
        if (aiCard.isItemCard && oppCard.isItemCard) {
          eng.heal(a, 3, 'drain'); eng.hurt(t, 3);
          skip = true; unblock = true;
          eng.emit('desc', 'Otto 4牌：双方道具牌，吸取3点');
        } else if (aiCard.isItemCard || oppCard.isItemCard) {
          let numberCard = aiCard.isItemCard ? oppCard : aiCard;
          d = Math.ceil(numberCard.value / 2); unblock = true;
          eng.emit('desc', `Otto 4牌：1张道具牌，${d}点不可防御伤害`);
        } else {
          d = aiCard.value + oppCard.value;
          eng.emit('desc', `Otto 4牌：双方数字牌，${d}点伤害`);
        }
        return { d, skip, unblock };
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
          if (a.crit < 2) a.crit++;
          eng.emit('buff', '+1[暴击]', null, { who: owner, kind: 'crit', stacks: a.crit });
          eng.emit('desc', `Otto 5牌：白牌恢复${best.value}点+1层暴击`);
          return { d: 0, skip: true, unblock: false };
        }
        eng.emit('desc', `Otto 5牌：造成${best.value}点伤害`);
        return { d: best.value, skip: false, unblock: false };
      }

      if (v === 6) {
        let divisor = eng.s.is1v2 ? 20 : 10;
        let dmg = Math.ceil(a.hp / divisor);
        eng.emit('desc', `Otto 6牌：自身生命${a.hp}/${divisor}=${dmg}点伤害`);
        return { d: dmg, skip: false, unblock: false };
      }

      if (v === 7) {
        eng.hurt(a, 1);
        if (a.crit < 2) a.crit++;
        eng.emit('buff', '+1[暴击]', null, { who: owner, kind: 'crit', stacks: a.crit });
        return { d: 6, skip: false, unblock: false };
      }

      if (v === 0) {
        let critUsed = Math.min(a.crit || 0, 2);
        let d = 4 + critUsed * 3;
        if (critUsed > 0) {
          eng.hurt(a, critUsed * 2);
          a.crit -= critUsed;
          eng.emit('buff', `-${critUsed}[暴击]`, null, { who: owner, kind: 'crit', stacks: a.crit });
          eng.emit('desc', `Otto 0牌：消耗${critUsed}层暴击，${d}点伤害，自伤${critUsed * 2}`);
          return { d, skip: false, unblock: false };
        }
        return { d: 4, skip: false, unblock: true };
      }

      return null;
    }
  });
})();