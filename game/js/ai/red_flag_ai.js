(function () {
  AIRegistry.register({
    name: 'RedFlag',

    attackScore(eng, value, card, context) {
      if (value === 0) return 80;
      if (value === 5) return 68;
      if (value === 4) return context.opponent?.hypothermia > 0 ? 82 : 60;
      if (value === 3) return 48 + Math.min(6, eng.h.player.length) * 4;
      if (value === 2) return 58;
      if (value === 1) return context.opponent?.hypothermia > 0 ? 73 : 51;
      return null;
    },

    defendScore(eng, value, card, top, context) {
      if (value === 1) return context.lethal ? 90 : 72;
      if (value === 0) return 68 + context.incomingDamage;
      if (value === 2) return 62;
      return null;
    }
  });
})();
