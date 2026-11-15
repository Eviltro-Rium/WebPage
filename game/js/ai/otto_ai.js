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
      if (v === 3) return x.opponent.hp <= 5 ? 88 : 68;
      if (v === 5) {
        let divisor = eng.s.is1v2 && !eng.s.isAdventure ? 16 : 8;
        let dmg = Math.ceil(x.self.hp / divisor);
        return dmg >= x.opponent.hp ? 92 : 50 + dmg * 4;
      }
      if (v === 4) {
        let candidates = x.hand.filter(card => card !== c && card.isNumberCard);
        if (!candidates.length) return -100;
        let max = Math.max(...candidates.map(card => card.value));
        const damage = max * 2;
        return damage >= x.opponent.hp ? 90 : 55 + damage * 3;
      }
      if (v === 2) return 48;
      if (v === 1) return 62;
      return null;
    },

    defendScore(eng, v, c, top, x) {
      if (v === 0) return x.lethal ? 96 : x.incomingDamage >= 5 ? 82 : 60;
      if (v === 2) return x.incomingDamage >= 3 ? 56 : 38;
      if (v === 1) return 52 + Math.min(16, Math.ceil(x.incomingDamage / 2) * 3);
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      if (c.value === 0) return 78;
      if (c.value === 5) return 55 + Math.ceil(x.self.hp / (eng.s.is1v2 && !eng.s.isAdventure ? 16 : 8)) * 3;
      if (c.value === 3) return 66;
      if (c.value === 4) return x.hand.filter(card => card !== c && card.isNumberCard).length ? 60 : 20;
      return 28 + c.value * 5;
    },

    skip(eng, c, x, phase) {
      return phase === 'attack' && c.value === 4 && !x.hand.some(card => card !== c && card.isNumberCard);
    },

    specialEffect(eng, n, v, c, a, t, owner, helpers) {
      if (v === 4) {
        let candidates = helpers.selfHand.filter(card => card.isNumberCard);
        if (!candidates.length) {
          eng.emit('desc', 'Otto 4牌：没有可判定的数字牌');
          return { d: 0, skip: true, unblock: false };
        }
        let best = candidates.reduce((b, card) => card.value > b.value ? card : b);
        helpers.selfHand.splice(helpers.selfHand.indexOf(best), 1);
        if (best.isWhite) best.chosenColor = eng.effective(c);
        eng.s.revealCards = [helpers.copy(best)];
        eng.emit('reveal', `Otto 4牌判定：${eng.cardText(best)}`, best, { who: owner, from: 'hand' });
        eng.discardWithEvent(best, owner, { from: 'reveal', faceUp: true, desc: `Otto 4牌将${eng.cardText(best)}置于弃牌库底` });
        const amount = best.value * 2;
        if (best.isWhite) {
          eng.heal(a, amount);
          if (a.crit < 3) a.crit++;
          eng.emit('buff', '+1[暴击]', null, { who: owner, kind: 'crit', stacks: a.crit });
          eng.emit('desc', `Otto 4牌：白牌恢复${amount}点+1层暴击`);
          return { d: 0, skip: true, unblock: false };
        }
        eng.emit('desc', `Otto 4牌：造成${amount}点伤害`);
        return { d: amount, skip: false, unblock: false };
      }



      return null;
    }
  });
})();
