(function () {
  AIRegistry.register({
    name: 'Leon',

    attackScore(eng, v, c, x) {
      if (v === 4) return x.oppBurn ? 84 : 44;
      if (v === 5) return x.oppBurn ? 76 : 48;
      if (v === 7) return 62 + Math.min(16, x.oppBurn * 4 + x.oppHand * 2);
      if (v === 0) return x.opponent.hp <= 7 ? 98 : x.hpPct <= 20 ? 28 : 68;
      if (v === 1) return x.oppBurn >= 4 ? -100 : 66 - x.oppBurn * 5;
      if (v === 6) return 58;
      if (v === 3) return x.oppBurn ? 50 : 60;
      if (v === 2) return 48;
      return null;
    },

    defendScore(eng, v, c, top, x) {
      if (v === 0) {
        const survives = x.self.hp > x.incomingDamage;
        const counterKills = x.opponent.hp <= x.incomingDamage;
        return counterKills && survives ? 98 : x.lethal ? 86 : 34;
      }
      if (v === 3) return 72 + Math.min(16, x.incomingDamage);
      if (v === 2) return x.opponent.hp <= Math.ceil(x.incomingDamage / 2) ? 90 : 62;
      if (v === 1) return x.missingHp >= 2 || x.oppBurn < 4 ? 60 : 42;
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      if (c.value === 0) return x.hpPct > 30 ? 76 : 52;
      if (c.value === 4 && x.oppBurn) return 78;
      if (c.value === 7) return 70;
      if (c.value === 1 && x.oppBurn >= 4) return 24;
      return 30 + c.value * 5;
    },

    skip(eng, c, x, phase) {
      return phase === 'attack' && c.value === 1 && x.oppBurn >= 4;
    },

    specialEffect(eng, n, v, c, a, t, owner, helpers) {
      if (v === 7) {
        helpers.burnTarget(2);
        if (helpers.targetHand.length) {
          const index = Math.floor(Math.random() * helpers.targetHand.length);
          const dropped = helpers.targetHand.splice(index, 1)[0];
          eng.s.revealCards = [helpers.copy(dropped)];
          eng.emit('reveal', 'Leon 7牌弃掉目标手牌', dropped, { who: 'player' });
          eng.discardWithEvent(dropped, 'player', { from: 'reveal', faceUp: true, desc: `Leon 7牌弃掉${eng.cardText(dropped)}` });
          eng.emit('desc', `Leon AI弃掉${eng.cardText(dropped)}`);
        }
        return { d: 6, skip: false, unblock: false };
      }

      if (v === 0) {
        helpers.burnTarget(1);
        const count = Math.min(2, helpers.targetHand.length);
        for (let i = 0; i < count; i += 1) {
          const dropped = helpers.targetHand.splice(Math.floor(Math.random() * helpers.targetHand.length), 1)[0];
          eng.discardWithEvent(dropped, 'player', { faceUp: true, desc: `Leon 0牌弃掉${eng.cardText(dropped)}` });
        }
        eng.hurt(a, 2);
        return { d: 7, skip: false, unblock: true };
      }

      return null;
    }
  });
})();
