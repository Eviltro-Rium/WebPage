(function () {
  const random = () => window.FurryGame && window.FurryGame.CombatRuntime ? window.FurryGame.CombatRuntime.random() : Math.random();
  AIRegistry.register({
    name: 'Chan',

    attackScore(eng, v, c, x) {
      if (v === 0) return x.opponent.hp <= 7 ? 96 : x.oppFrozen ? 72 : 82;
      if (v === 1) return x.oppFrozen ? 38 : 74;
      if (v === 3) return x.self.hp <= 2 ? -100 : x.handSize <= 3 ? 76 : 58;
      if (v === 4) return 64;
      if (v === 5) return x.oppHand ? 70 : 58;
      if (v === 2) return x.handSize <= 3 ? 62 : 46;
      return null;
    },

    defendScore(eng, v, c, top, x) {
      if (v === 0) return x.lethal ? 100 : 90;
      if (v === 1) return 62 + Math.min(18, x.incomingDamage * 2);
      if (v === 2) return x.oppFrozen ? 52 : 68;
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      if (c.value === 0) return 86;
      if (c.value === 3) return x.self.hp > 2 ? 68 : 30;
      if (c.value === 1 && !x.oppFrozen) return 66;
      if ((c.value === 4 || c.value === 5) && x.oppHand) return 70;
      return 28 + c.value * 5;
    },

    skip(eng, c, x, phase) {
      return phase === 'attack' && c.value === 3 && x.self.hp <= 2;
    },

    specialEffect(eng, n, v, c, a, t, owner, helpers) {
      const pull = label => {
        if (!helpers.targetHand.length) return null;
        const card = helpers.targetHand.splice(Math.floor(random() * helpers.targetHand.length), 1)[0];
        eng.s.revealCards = [helpers.copy(card)];
        eng.emit('reveal', label, card, { who: 'player', from: 'hand' });
        return card;
      };

      if (v === 5) {
        const drawn = pull('Chan 5牌系统随机抽取玩家手牌');
        if (drawn) {
          const keep = !eng.s.isAdventure && (eng.aiKeepScore(drawn) >= 42 || helpers.selfHand.length <= 2);
          if (keep) helpers.selfHand.push(drawn);
          else eng.discardWithEvent(drawn, 'player', { from: 'reveal', faceUp: true, desc: `Chan 5牌弃掉${eng.cardText(drawn)}` });
          eng.emit('desc', `Chan AI${keep ? '保留' : '弃掉'}${eng.cardText(drawn)}`);
        }
        return { d: 6, skip: false, unblock: false };
      }

      return null;
    }
  });
})();
