(function () {
  AIRegistry.register({
    name: 'Vixraps',

    attackScore(eng, v, c, x) {
      if (v === 0) return x.oppBurn >= 2 ? 96 : 78;
      if (v === 7) return x.oppBurn >= 3 ? 90 : x.oppBurn >= 1 ? 72 : 54;
      if (v === 5) return x.oppBurn >= 2 ? 86 : 58;
      if (v === 6) return x.oppBurn >= 2 ? 82 : 64;
      if (v === 1) return x.oppGuard ? 76 : 68;
      if (v === 4) return x.missingHp >= 1 ? 62 : 46;
      if (v === 2) return x.debuffCount >= 1 ? 64 : 52;
      if (v === 3) return 54;
      return null;
    },

    defendScore(eng, v, c, top, x) {
      if (v === 0) return x.lethal ? 98 : x.oppBurn >= 1 ? 76 : 60;
      if (v === 1) return 68;
      if (v === 2) return 64;
      if (v === 3) return 60 + Math.min(12, x.incomingDamage);
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      if (c.value === 0) return 82;
      if (c.value === 7) return x.oppBurn >= 2 ? 80 : 50;
      if (c.value === 5) return x.oppBurn >= 2 ? 76 : 40;
      if (c.value === 6) return x.oppBurn >= 2 ? 74 : 56;
      if (c.value === 1) return 64;
      return 30 + c.value * 5;
    },

    skip(eng, c, x, phase) {
      return false;
    },

    specialEffect(eng, n, v, c, a, t, owner, helpers) {
      return null;
    }
  });
})();