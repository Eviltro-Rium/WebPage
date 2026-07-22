(function () {
  AIRegistry.register({
    name: 'Blaze',

    attackScore(eng, v, c, x) {
      const fieldBurn = x.burn + x.oppBurn + (eng.s.ai2 && eng.s.ai2.alive ? eng.s.ai2.burn : 0);
      if (v === 0) return x.opponent.hp <= 6 ? 98 : 80;
      if (v === 7) return fieldBurn >= 5 ? 92 : fieldBurn >= 3 ? 78 : 58;
      if (v === 5) return x.burn >= 3 ? 90 : x.burn >= 1 ? 72 : 54;
      if (v === 6) return x.burn ? 56 + x.burn * 7 + Math.min(8, x.missingHp) : -100;
      if (v === 2) return x.oppGuard ? 78 : x.burn ? 62 : 68;
      if (v === 4) return x.oppHand ? 62 : 48;
      if (v === 3) return fieldBurn < 6 ? 66 : 50;
      if (v === 1) return 52 + (x.burn ? 6 : 0);
      return null;
    },

    defendScore(eng, v, c, top, x) {
      if (v === 0) return x.lethal ? 98 : x.missingHp >= 5 ? 86 : 76;
      if (v === 3) return 66 + Math.min(20, (x.burn + x.oppBurn) * 3);
      if (v === 2) return x.opponent.hp <= 4 ? 84 : 64;
      if (v === 1) return x.missingHp >= 2 ? 72 : 58;
      return null;
    },

    keepScore(eng, c, x) {
      if (!c.isNumberCard) return null;
      if (c.value === 0) return 84;
      if (c.value === 5 && x.burn) return 80;
      if (c.value === 6) return x.burn ? 74 : 28;
      if (c.value === 7) return x.burn + x.oppBurn >= 3 ? 82 : 58;
      return 30 + c.value * 5;
    },

    skip(eng, c, x, phase) {
      return phase === 'attack' && c.value === 6 && !x.burn;
    },

    specialEffect(eng, n, v, c, a, t, owner, helpers) {
      if (v !== 4) return null;
      if (!helpers.targetHand.length) {
        return { d: 2 + (a.burn ? 1 : 0), skip: false, unblock: false };
      }

      const drawn = helpers.targetHand.splice(Math.floor(Math.random() * helpers.targetHand.length), 1)[0];
      eng.s.revealCards = [helpers.copy(drawn)];
      eng.emit('reveal', 'Blaze 4牌抽取玩家手牌', drawn, { who: 'player' });

      if (!drawn.isItemCard && drawn.value === 0) {
        helpers.selfHand.push(drawn);
        helpers.burnSelf(1);
        helpers.burnTarget(1);
        eng.emit('desc', `Blaze AI保留${eng.cardText(drawn)}，双方灼烧+1并跳过防御`);
        return { d: 0, skip: true, unblock: false };
      }

      eng.discardWithEvent(drawn, 'player', { from: 'reveal', faceUp: true, desc: `Blaze 4牌弃掉${eng.cardText(drawn)}` });
      const damage = (drawn.isItemCard ? 4 : drawn.value) + (a.burn ? 1 : 0);
      eng.emit('desc', `Blaze AI弃掉${eng.cardText(drawn)}，造成${damage}点伤害`);
      return { d: damage, skip: false, unblock: false };
    }
  });
})();
