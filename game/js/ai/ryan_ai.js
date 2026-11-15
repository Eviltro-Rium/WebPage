(function () {
  AIRegistry.register({
    name: 'Ryan',

    attackScore(eng, v, c, x) {
      if (v === 0) {
        if (x.opponent.hp <= 8) return 92;
        return 62 + Math.min(18, x.debuffCount * 6 + Math.min(8, x.missingHp));
      }
      if (v === 5) {
        const damage = Math.max(0, x.numberSum - v);
        return damage >= x.opponent.hp ? 94 : 42 + damage * 3;
      }
      if (v === 4) return x.debuffCount ? 78 : x.missingHp ? 62 : 50;
      if (v === 3) {
        const extra = x.hand.filter(card => card !== c && card.isNumberCard);
        if (!extra.length) return -100;
        const max = Math.max(...extra.map(card => card.value));
        const damage = max * 2;
        if (damage >= x.opponent.hp) return 96;
        return x.missingHp >= max * 2 ? 70 : 55 + damage;
      }
      if (v === 1) return x.missingHp >= 2 ? 58 : x.handSize <= 3 ? 52 : 32;
      if (v === 2) return x.missingHp ? 54 : 43;
      return null;
    },

    defendScore(eng, v, c, top, x) {
      if (v === 0) return x.lethal || x.debuffCount ? 96 : x.missingHp >= 3 ? 82 : 68;
      if (v === 1) return 58 + Math.min(18, x.incomingDamage * 2);
      if (v === 2) return x.missingHp >= 2 ? 66 : 54;
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      if (c.value === 0) return 82;
      if (c.value === 3 && x.hand.filter(card => card !== c && card.isNumberCard).length) return 72;
      if (c.value === 4 && x.debuffCount) return 70;
      if (c.value === 5) return 52 + Math.min(18, x.numberSum);
      return 28 + c.value * 5;
    },

    skip(eng, c, x, phase) {
      return phase === 'attack' && c.value === 3 && !x.hand.some(card => card !== c && card.isNumberCard);
    },

    specialEffect(eng, n, v, c, a, t, owner, helpers) {
      if (v === 3) {
        const candidates = helpers.selfHand.filter(card => card.isNumberCard);
        if (!candidates.length) {
          eng.emit('desc', 'Ryan 3牌：没有可追加的数字牌');
          return { d: 0, skip: true, unblock: false };
        }

        const strongest = candidates.reduce((best, card) => card.value > best.value ? card : best);
        const lethal = strongest.value * 2 >= t.hp;
        const missing = Math.max(0, a.maxHp - a.hp);
        const chooseDamage = lethal || missing <= 2 || a.hp >= t.hp;
        let second = strongest;

        if (!chooseDamage) {
          const useful = candidates.filter(card => card.value > 0).sort((left, right) => left.value - right.value);
          second = useful.find(card => card.value * 2 >= missing) || useful[useful.length - 1] || strongest;
        }

        helpers.selfHand.splice(helpers.selfHand.indexOf(second), 1);
        if (second.isWhite) second.chosenColor = eng.effective(c);
        eng.s.revealCards = [helpers.copy(second)];
        eng.emit('reveal', `Ryan 3牌追加${eng.cardText(second)}并置于弃牌库底`, second, { who: owner, from: 'hand' });
        eng.discardWithEvent(second, owner, { from: 'reveal', faceUp: true, desc: `Ryan 3牌将${eng.cardText(second)}置于弃牌库底` });

        if (chooseDamage) {
          const damage = second.value * 2;
          eng.emit('desc', `Ryan AI选择进攻，造成${damage}点伤害`);
          return { d: damage, skip: false, unblock: false };
        }

        helpers.healSelf(second.value * 2);
        eng.emit('desc', `Ryan AI选择恢复${second.value * 2}点生命`);
        return { d: 0, skip: true, unblock: false };
      }

      return null;
    }
  });
})();
