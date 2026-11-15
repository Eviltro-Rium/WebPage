(function() {
  AIRegistry.register({
    name: 'Serenity',

    attackScore(eng, v, c, x) {
      const bloodthirst = !!(x.self && x.self.bloodthirst) || (x.self && x.self.hp < 25);
      if (v === 0) {
        const healValue = Math.min(9, x.handSize * 3);
        const resetValue = bloodthirst ? x.oppHand * 4 : 0;
        return 48 + Math.min(28, x.missingHp + healValue) + resetValue;
      }
      if (v === 5) return bloodthirst ? 86 : (x.self.hp > 2 ? 61 : 20);
      if (v === 3) return bloodthirst ? 77 : 58;
      if (v === 2) return bloodthirst ? 71 : 50;
      if (v === 1) return bloodthirst ? 58 : (50 + Math.min(12, x.missingHp));
      if (v === 4) return x.missingHp >= 3 ? 56 : 46;
      return null;
    },

    defendScore(eng, v, c, top, x) {
      if (v === 0) return x.lethal ? 108 : 86;
      if (v === 1) return 54 + (x.lethal ? 14 : 0);
      if (v === 2) return 42 + Math.min(12, x.oppBleed * 2) + Math.min(8, x.missingHp);
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      const bloodthirst = !!(x.self && x.self.bloodthirst) || (x.self && x.self.hp < 25);
      if (c.value === 0) return 94;
      if (c.value === 5) return bloodthirst ? 82 : 70;
      if (c.value === 3 || c.value === 2) return bloodthirst ? 72 : 60;
      return 44 + c.value * 3;
    },

    skip() {
      return false;
    }
  });
})();
