(function () {
  AIRegistry.register({
    name: 'Moze',

    attackScore(eng, v, c, x) {
      if (v === 0) return x.guard <= 2 ? 88 : 72;
      if (v === 6) {
        const damage = 2 + x.guard;
        return damage >= x.opponent.hp ? 96 : x.guard ? 68 + x.guard * 3 : 70;
      }
      if (v === 7) return x.debuffCount >= 2 ? 86 : x.debuffCount ? 70 : 48;
      if (v === 4) {
        const hasExtraNumber = x.hand.some(card => card !== c && card.isNumberCard);
        return hasExtraNumber && x.guard < 5 ? 76 - x.guard * 5 : -100;
      }
      if (v === 2) return x.guard < 3 ? (eng.effective(c) === 'GREEN' ? 74 : 62) : 48;
      if (v === 3) return x.guard < 3 || x.missingHp ? 66 : 46;
      if (v === 5) return x.oppHand ? 64 : 42;
      if (v === 1) return 48;
      return null;
    },

    defendScore(eng, v, c, top, x) {
      if (v === 0) return x.lethal ? 98 : 84;
      if (v === 1) return 68 + Math.min(18, x.incomingDamage * 2);
      if (v === 2) return x.guard ? 62 + x.guard * 3 : 46;
      if (v === 3) return x.guard || x.missingHp ? 66 : 50;
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      if (c.value === 0) return 86;
      if (c.value === 6) return 72 + x.guard * 2;
      if (c.value === 7) return x.debuffCount ? 80 : 52;
      if (c.value === 4) return x.guard < 5 ? 68 : 30;
      if (c.value === 2 && eng.effective(c) === 'GREEN') return 70;
      return 30 + c.value * 5;
    },

    skip(eng, c, x, phase) {
      return phase === 'attack' && c.value === 4 &&
        (x.guard >= 5 || !x.hand.some(card => card !== c && card.isNumberCard));
    },

    specialEffect(eng, n, v, c, a, t, owner, helpers) {
      if (v === 4) {
        const candidates = helpers.selfHand.filter(card => card.isNumberCard);
        if (!candidates.length || a.guard >= 5) {
          eng.emit('desc', 'Moze 4牌：没有适合转化的数字牌');
          return { d: 0, skip: true, unblock: false };
        }

        const needed = Math.max(1, 5 - a.guard);
        const sorted = candidates.slice().sort((left, right) => left.value - right.value);
        const chosen = sorted.find(card => card.value >= needed) || sorted[sorted.length - 1];
        helpers.selfHand.splice(helpers.selfHand.indexOf(chosen), 1);
        if (chosen.isWhite) chosen.chosenColor = eng.effective(c);
        eng.s.revealCards = [helpers.copy(chosen)];
        eng.emit('reveal', 'Moze 4牌守护判定', chosen, { who: owner, from: 'hand' });
        eng.discardWithEvent(chosen, owner, { from: 'reveal', faceUp: true, desc: `Moze 4牌将${eng.cardText(chosen)}置于弃牌库底` });
        a.guard = Math.min(5, a.guard + chosen.value);
        eng.emit('desc', `Moze AI使用${eng.cardText(chosen)}并放入弃牌库底，守护提升至${a.guard}层`);
        return { d: 0, skip: true, unblock: false };
      }

      if (v === 5) {
        if (!helpers.targetHand.length) return { d: 0, skip: true, unblock: false };
        const drawn = helpers.targetHand.splice(Math.floor(Math.random() * helpers.targetHand.length), 1)[0];
        eng.s.revealCards = [helpers.copy(drawn)];
        eng.emit('reveal', 'Moze 5牌抽取玩家手牌', drawn, { who: 'player', from: 'hand' });
        helpers.selfHand.push(drawn);

        const hit = drawn.isBlack || drawn.isWhite || eng.effective(drawn) === 'GREEN';
        if (hit) {
          eng.emit('desc', `Moze 5牌判定${eng.cardText(drawn)}：造成4点伤害`);
          return { d: 4, skip: false, unblock: false };
        }

        helpers.healSelf(2);
        helpers.gainGuard(1);
        eng.emit('desc', `Moze 5牌判定${eng.cardText(drawn)}：恢复2点并获得1层守护`);
        return { d: 0, skip: true, unblock: false };
      }

      if (v === 7) {
        const bonus = (a.burn || 0) + (a.bleed || 0) + (a.frozen ? 1 : 0);
        helpers.clearSelf();
        eng.emit('desc', `Moze AI清除${bonus}层debuff，造成${3 + bonus}点伤害`);
        return { d: 3 + bonus, skip: false, unblock: false };
      }

      return null;
    }
  });
})();
