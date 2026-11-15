(function () {
  AIRegistry.register({
    name: 'Blaze',

    attackScore(eng, v, c, x) {
      const fieldBurn = x.burn + x.oppBurn + (eng.s.ai2 && eng.s.ai2.alive ? eng.s.ai2.burn : 0);
      if (v === 0) return x.opponent.hp <= 6 ? 98 : 80;
      if (v === 5) return fieldBurn >= 5 ? 92 : fieldBurn >= 3 ? 78 : 58;
      if (v === 3) return x.burn >= 3 ? 90 : x.burn >= 1 ? 72 : 54;
      if (v === 4) return x.burn ? 56 + x.burn * 3 + Math.min(8, x.missingHp) : -100;
      if (v === 1) return x.oppGuard ? 78 : x.burn ? 62 : 68;
      if (v === 2) return fieldBurn < 6 ? 66 : 50;
      return null;
    },

    defendScore(eng, v, c, top, x) {
      if (v === 0) return x.lethal ? 98 : x.missingHp >= 5 ? 86 : 76;
      if (v === 2) return x.opponent.hp <= 4 ? 84 : 64;
      if (v === 1) return x.missingHp >= 2 ? 72 : 58;
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      if (c.value === 0) return 84;
      if (c.value === 3 && x.burn) return 80;
      if (c.value === 4) return x.burn ? 74 : 28;
      if (c.value === 5) return x.burn + x.oppBurn >= 3 ? 82 : 58;
      return 30 + c.value * 5;
    },

    skip(eng, c, x, phase) {
      return phase === 'attack' && c.value === 4 && !x.burn && !x.missingHp;
    }
  });
})();
