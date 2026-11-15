(function () {
  const random = () => window.FurryGame && window.FurryGame.CombatRuntime ? window.FurryGame.CombatRuntime.random() : Math.random();
  AIRegistry.register({
    name: 'Saiki',

    attackScore(eng, v, c, x) {
      if (v === 0) return x.oppBleed >= 2 ? 92 : x.oppBleed ? 76 : 58;
      if (v === 3) return x.oppBleed ? 88 : 54;
      if (v === 5) return 72 + Math.min(18, (x.oppBleed || 0) * 6);
      if (v === 4) return x.self.hp <= 30 ? 82 : x.oppHand ? 66 : 54;
      if (v === 1) return x.oppBleed < 3 ? 68 : 48;
      if (v === 2) return x.missingHp ? 52 : 44;
      return null;
    },

    defendScore(eng, v, c, top, x) {
      if (v === 0) return x.lethal ? 98 : x.debuffCount ? 90 : 80;
      if (v === 2) return x.oppBleed < 2 ? 72 : 62;
      if (v === 1) return 54 + Math.min(12, x.incomingDamage * 2);
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      if (c.value === 0) return x.oppBleed ? 84 : 64;
      if (c.value === 3 && x.oppBleed) return 82;
      if (c.value === 5) return 70 + Math.min(16, (x.oppBleed || 0) * 5);
      return 28 + c.value * 5 + (eng.effective(c) === 'YELLOW' ? 8 : 0);
    },

    specialEffect(eng, n, v, c, a, t, owner, helpers) {
      const pull = label => {
        if (!helpers.targetHand.length) return null;
        const card = helpers.targetHand.splice(Math.floor(random() * helpers.targetHand.length), 1)[0];
        eng.s.revealCards = [helpers.copy(card)];
        eng.emit('reveal', label, card, { who: 'player', from: 'hand' });
        return card;
      };

      if (v !== 4 || a.hp <= 30) return null;
      const drawn = pull('Saiki 4牌系统随机抽取玩家手牌');
      if (drawn) eng.discardWithEvent(drawn, 'player', { from: 'reveal', faceUp: true });
      return { d: 4, skip: false, unblock: false };
    }
  });
})();
