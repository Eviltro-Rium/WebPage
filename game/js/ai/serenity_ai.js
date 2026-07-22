(function() {
  AIRegistry.register({
    name: 'Serenity',

    attackScore(eng, v, c, x) {
      const bloodthirst = x.hpPct < 30;
      if (v === 0) {
        const healValue = Math.min(10, 1 + x.handSize * 3);
        const resetValue = bloodthirst ? x.oppHand * 4 : 0;
        return 48 + Math.min(28, x.missingHp + healValue) + resetValue;
      }
      if (v === 7) return bloodthirst ? 86 : (x.self.hp > 2 ? 61 : 20);
      if (v === 6) return bloodthirst ? 82 : 62;
      if (v === 4) return bloodthirst ? 77 : 58;
      if (v === 2) return bloodthirst ? 71 : 50;
      if (v === 3) return 50 + Math.min(12, x.missingHp);
      if (v === 5) return x.missingHp >= 4 ? 56 : 46;
      if (v === 1) return bloodthirst ? 68 : 44;
      return null;
    },

    defendScore(eng, v, c, top, x) {
      const bloodthirst = x.hpPct < 30;
      if (v === 0) return x.lethal ? 108 : 86;
      if (v === 3) return (bloodthirst ? 69 : 55) + (x.lethal ? 18 : 0);
      if (v === 1) return (bloodthirst ? 66 : 54) + (x.lethal ? 14 : 0);
      if (v === 2) return 42 + Math.min(20, x.oppBleed * 4) + Math.min(12, x.missingHp);
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      const bloodthirst = x.hpPct < 30;
      if (c.value === 0) return 94;
      if (c.value === 7 || c.value === 6) return bloodthirst ? 82 : 70;
      if (c.value === 3) return 66;
      if (c.value === 4 || c.value === 2) return bloodthirst ? 72 : 60;
      return 44 + c.value * 3;
    },

    skip() {
      return false;
    },

    specialEffect(eng, n, v, c, a, t, owner, helpers) {
      const bloodthirst = a.hp < 30;

      // The generic skill targets every other combatant in 1v2. An AI
      // Serenity must only pay its own HP cost and attack the player once.
      if (v === 7) {
        if (!bloodthirst) eng.hurt(a, 2);
        return { d: 5, skip: false, unblock: true };
      }

      // Handle value 0 here because the generic character implementation
      // relies on a UI-side `target` variable and loses discarded cards.
      if (v === 0) {
        const own = helpers.selfHand;
        const healValue = 1 + Math.min(9, own.length * 3);
        helpers.healSelf(healValue);
        const ownDiscard = own.splice(0, own.length);
        eng.discardManyWithEvent(ownDiscard, owner, { desc: `Serenity 0牌弃掉自己全部${ownDiscard.length}张手牌` });

        if (bloodthirst) {
          const count = helpers.targetHand.length;
          const targetDiscard = helpers.targetHand.splice(0, helpers.targetHand.length);
          eng.discardManyWithEvent(targetDiscard, 'player', { desc: `Serenity 0牌弃掉玩家全部${targetDiscard.length}张手牌` });
          eng.draw('player', Math.max(0, count - 1), true);
        }

        helpers.drawSelf(4, true);
        return { d: 0, skip: true, unblock: false };
      }

      return null;
    }
  });
})();
