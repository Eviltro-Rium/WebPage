(function() {
  AIRegistry.register({
    name: 'Knight',

    attackScore(eng, v, c, x) {
      const chaos = x.chaosCount || 0;
      if (v === 0) return chaos >= 4 ? 96 : 84;
      if (v === 7) return 54 + chaos * 10;
      if (v === 5) return x.chaos_red ? 76 : 57;
      if (v === 6) return x.chaos_green ? 73 : (x.guard <= 2 ? 64 : 49);
      if (v === 1) return 43 + chaos * 9;
      if (v === 4) return x.chaos_blue ? 65 : 56;
      if (v === 3) return x.chaos_green && x.chaos_yellow ? 68 : 47;
      if (v === 2) return 48;
      return null;
    },

    defendScore(eng, v, c, top, x) {
      const chaos = x.chaosCount || 0;
      if (v === 0) return (chaos >= 4 ? 102 : 78) + (x.lethal ? 18 : 0);
      if (v === 3) return (x.chaos_red ? 68 : 49) + (x.lethal ? 10 : 0);
      if (v === 2) return (x.chaos_blue ? 65 : 52) + (x.lethal ? 12 : 0);
      if (v === 1) return (x.chaos_yellow ? 64 : 48) + Math.min(12, x.missingHp);
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      if (c.value === 0) return 96;
      if (c.value === 7) return 72 + x.chaosCount * 3;
      if (c.value === 1) return 64 + x.chaosCount * 2;
      if (c.value === 5 && x.chaos_red) return 78;
      if (c.value === 6 && x.chaos_green) return 76;
      return 45 + c.value * 4;
    },

    // Value 0 is also Knight's way to generate all four chaos types, so it
    // must remain playable even when no chaos is currently active.
    skip() {
      return false;
    },

    specialEffect(eng, n, v, c, a) {
      if (v !== 0) return null;

      const chaosCount = [
        a.chaos_red,
        a.chaos_yellow,
        a.chaos_blue,
        a.chaos_green
      ].filter(Boolean).length;

      // Return the damage to the common resolver. The generic 1v2 skill
      // directly damages targets and then returns d=8, which applies twice.
      if (chaosCount >= 4) {
        return { d: 8, skip: false, unblock: true };
      }

      a.chaos_red = true;
      a.chaos_yellow = true;
      a.chaos_blue = true;
      a.chaos_green = true;
      return { d: 6, skip: false, unblock: false };
    }
  });
})();
