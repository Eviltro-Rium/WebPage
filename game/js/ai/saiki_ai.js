(function () {
  AIRegistry.register({
    name: 'Saiki',

    attackScore(eng, v, c, x) {
      if (v === 0) return x.oppBleed >= 2 ? 92 : x.oppBleed ? 76 : 58;
      if (v === 4) return x.oppBleed ? 88 : 54;
      if (v === 7) return x.oppBleed >= 2 ? 86 : x.oppBleed ? 68 : -100;
      if (v === 5) return x.self.hp <= 20 ? 82 : x.self.hp <= 50 ? 72 : x.oppHand ? 66 : 54;
      if (v === 6) {
        const judges = x.hand.filter(card => card !== c && card.isNumberCard);
        if (!judges.length) return -100;
        const best = Math.max(...judges.map(card => Math.ceil(card.value * 1.5) +
          (eng.effective(card) === 'YELLOW' && x.oppBleed < 2 ? 4 : 0)));
        return best >= x.opponent.hp ? 96 : 58 + best;
      }
      if (v === 3) return x.oppHand ? 60 : 44;
      if (v === 2) return x.missingHp ? 52 : 44;
      if (v === 1) return 48;
      return null;
    },

    defendScore(eng, v, c, top, x) {
      if (v === 0) return x.lethal ? 98 : x.debuffCount ? 90 : 80;
      if (v === 3) return x.lethal ? 88 : 66;
      if (v === 2) return x.oppBleed < 2 ? 72 : 62;
      if (v === 1) return 54 + Math.min(12, x.incomingDamage * 2);
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      if (c.value === 0) return x.oppBleed ? 84 : 64;
      if (c.value === 4 && x.oppBleed) return 82;
      if (c.value === 7) return x.oppBleed ? 78 : 30;
      if (c.value === 6 && x.hand.some(card => card !== c && card.isNumberCard)) return 72;
      return 28 + c.value * 5 + (eng.effective(c) === 'YELLOW' ? 8 : 0);
    },

    skip(eng, c, x, phase) {
      if (phase !== 'attack') return false;
      if (c.value === 7 && !x.oppBleed) return true;
      if (c.value === 6 && !x.hand.some(card => card !== c && card.isNumberCard)) return true;
      return false;
    },

    specialEffect(eng, n, v, c, a, t, owner, helpers) {
      const pull = label => {
        if (!helpers.targetHand.length) return null;
        const card = helpers.targetHand.splice(Math.floor(Math.random() * helpers.targetHand.length), 1)[0];
        eng.s.revealCards = [helpers.copy(card)];
        eng.emit('reveal', label, card, { who: 'player' });
        return card;
      };

      if (v === 3) {
        const drawn = pull('Saiki 3牌抽取玩家手牌');
        if (drawn) {
          const keep = eng.aiKeepScore(drawn) >= 40 || helpers.selfHand.length <= 2;
          if (keep) helpers.selfHand.push(drawn);
          else eng.discardWithEvent(drawn, 'player', { from: 'reveal', faceUp: true, desc: `Saiki 3牌弃掉${eng.cardText(drawn)}` });
          eng.emit('desc', `Saiki AI${keep ? '保留' : '弃掉'}${eng.cardText(drawn)}`);
        }
        return { d: 2, skip: false, unblock: false };
      }

      if (v === 5) {
        if (a.hp <= 20) {
          helpers.healSelf(4);
          return { d: 0, skip: true, unblock: false };
        }
        if (a.hp <= 50) return { d: 4, skip: true, unblock: false };
        const drawn = pull('Saiki 5牌抽取玩家手牌');
        if (drawn) helpers.selfHand.push(drawn);
        return { d: 4, skip: false, unblock: false };
      }

      if (v === 6) {
        const candidates = helpers.selfHand.filter(card => card.isNumberCard);
        if (!candidates.length) {
          eng.emit('desc', 'Saiki 6牌：没有数字牌可用于判定');
          return { d: 0, skip: true, unblock: false };
        }

        const judge = candidates.reduce((best, card) => {
          const score = Math.ceil(card.value * 1.5) +
            (eng.effective(card) === 'YELLOW' && t.bleed < 2 ? 4 : 0);
          const bestScore = Math.ceil(best.value * 1.5) +
            (eng.effective(best) === 'YELLOW' && t.bleed < 2 ? 4 : 0);
          return score > bestScore ? card : best;
        });

        helpers.selfHand.splice(helpers.selfHand.indexOf(judge), 1);
        if (judge.isWhite) judge.chosenColor = eng.effective(c);
        eng.setDiscardTop(judge);
        eng.s.revealCards = [helpers.copy(judge)];
        eng.emit('reveal', 'Saiki 6牌数字判定', judge, { who: owner });
        if (eng.effective(judge) === 'YELLOW') helpers.bleedTarget(1);
        const damage = Math.ceil(judge.value * 1.5);
        eng.emit('desc', `Saiki AI选择${eng.cardText(judge)}，造成${damage}点伤害${eng.effective(judge) === 'YELLOW' ? '并施加1层流血' : ''}`);
        return { d: damage, skip: false, unblock: false };
      }

      return null;
    }
  });
})();
