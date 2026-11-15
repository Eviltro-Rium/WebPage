(function () {
  const random = () => window.FurryGame && window.FurryGame.CombatRuntime ? window.FurryGame.CombatRuntime.random() : Math.random();
  AIRegistry.register({
    name: 'Moze',

    attackScore(eng, v, c, x) {
      if (v === 0) return x.guard <= 2 ? 88 : 72;
      if (v === 4) {
        const damage = 3 + x.guard;
        return damage >= x.opponent.hp ? 96 : x.guard ? 68 + x.guard * 3 : 70;
      }
      if (v === 5) return x.debuffCount >= 2 ? 86 : x.debuffCount ? 70 : 48;
      if (v === 1) return x.guard < 3 ? (eng.effective(c) === 'GREEN' ? 74 : 62) : 48;
      if (v === 3) return x.oppHand ? 64 : 42;
      if (v === 2) return 48;
      return null;
    },

    defendScore(eng, v, c, top, x) {
      if (v === 0) return x.lethal ? 98 : 84;
      if (v === 1) return 68 + Math.min(18, x.incomingDamage * 2);
      if (v === 2) return x.guard ? 62 + x.guard * 3 : 46;
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      if (c.value === 0) return 86;
      if (c.value === 4) return 72 + x.guard * 2;
      if (c.value === 5) return x.debuffCount ? 80 : 52;
      if (c.value === 1 && eng.effective(c) === 'GREEN') return 70;
      return 30 + c.value * 5;
    },

    specialEffect(eng, n, v, c, a, t, owner, helpers) {
      if (v === 3) {
        const i = Math.floor(random() * helpers.targetHand.length);
        const drawn = helpers.targetHand.splice(i, 1)[0];
        if (drawn) {
          eng.s.revealCards = [helpers.copy(drawn)];
          eng.emit('reveal', 'Moze 3牌系统随机抽取玩家手牌', drawn,
            { who: 'player', fromOwner: 'player', from: 'hand', handIndex: i });
          if (eng.s.isAdventure) eng.discardWithEvent(drawn, 'player', { from: 'reveal', faceUp: true });
          else helpers.selfHand.push(drawn);
          if (drawn.isBlack || drawn.isWhite || eng.effective(drawn) === 'GREEN') {
            return { d: 4, skip: false, unblock: false };
          }
        }
        helpers.healSelf(2);
        helpers.gainGuard(2);
        return { d: 0, skip: true, unblock: false };
      }

      if (v === 5) {
        const own = eng.countMozePurgeStacks(a, 'debuff');
        const opponent = eng.countMozePurgeStacks(t, 'buff');
        if (opponent > own) eng.clearPositiveBuffs(t);
        else helpers.clearSelf();
        return { d: 3 + Math.max(own, opponent), skip: false, unblock: false };
      }

      return null;
    }
  });
})();
