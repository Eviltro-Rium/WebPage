(function () {
  AIRegistry.register({
    name: 'Fenric',

    attackScore(eng, v, c, x) {
      if (v === 0) return x.guard >= 2 ? 90 : 72;
      if (v === 4) return 74;
      if (v === 5) return 64;
      if (v === 3) {
        const color = eng.effective(c);
        if (color === 'RED' || color === 'BLUE') return 68;
        return 60;
      }
      if (v === 1) return x.guard < 4 ? 58 : 46;
      if (v === 2) return 50;
      return null;
    },

    defendScore(eng, v, c, top, x) {
      if (v === 0) return x.lethal ? 98 : 88;
      if (v === 1) return 66 + Math.min(16, x.incomingDamage * 2);
      if (v === 2) return x.incomingDamage >= 4 ? 70 : 52;
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      if (c.value === 0) return x.guard >= 1 ? 88 : 74;
      if (c.value === 4) return 70;
      if (c.value === 5) return 62;
      if (c.value === 3) return 58;
      if (c.value === 1) return 52;
      return 34 + c.value * 4;
    }
  });
})();