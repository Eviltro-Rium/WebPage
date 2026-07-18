(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Blaze',
    hp: 85,
    type: '狂战',
    passive: '自身有灼烧时，1至7牌的攻击伤害+1',
    init() { return {}; },
    turnStart(eng, ch) {},
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, heal, draw } = helpers;
      let d = 0;
      let skip = false;
      let unblock = false;
      let hadBurn = a.burn > 0;
      if (v === 1) d = 4;
      if (v === 2) { d = 2; unblock = true; a.burn = Math.min(4, a.burn + 2); }
      if (v === 3) { d = 3; a.burn = Math.min(4, a.burn + 1); burn(1); }
      if (v === 4) { d = 0; skip = true; }
      if (v === 5) { a.burn = Math.min(4, a.burn + 1); d = 2 * a.burn; hadBurn = true; }
      if (v === 6) { heal(a, Math.ceil(1.5 * a.burn)); a.burn = 0; burn(1); skip = true; }
      if (v === 7) {
        a.burn = Math.min(4, a.burn + 2);
        burn(2);
        let fieldBurn = eng.s.is1v2 ? eng.s.player.burn + eng.s.ai.burn + eng.s.ai2.burn : a.burn + t.burn;
        d = Math.ceil(1.5 * fieldBurn);
        hadBurn = true;
      }
      if (v === 0) { d = 6; unblock = true; burn(2); }
      if (d && hadBurn && v !== 0) d++;
      return { d, skip, unblock };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, burn } = helpers;
      let remaining = d;
      let desc = '';
      let b = 0;
      if (v === 1) {
        let bh = defender.burn;
        heal(defender, 2 + bh);
        burn(opponent, 1);
        burn(defender, 1);
        remaining = d;
        desc = `Blaze 1牌：恢复${2 + bh}点+双方灼烧1`;
      }
      if (v === 3) {
        burn(opponent, 2);
        let fb = defender.burn + opponent.burn + (eng.s.ai2 ? eng.s.ai2.burn : 0);
        if (defender.burn) fb++;
        hurt(opponent, fb);
        remaining = d;
        desc = `Blaze 3牌：攻击方+2灼烧，反击场上灼烧${fb}点${defender.burn ? '(含被动+1)' : ''}`;
      }
      if (v === 0) {
        burn(opponent, 4);
        b = Math.ceil(d / 2);
        let tb = defender.burn + opponent.burn + (eng.s.ai2 ? eng.s.ai2.burn : 0);
        heal(defender, tb + 3);
        remaining = Math.max(0, d - b);
        desc = `Blaze 0牌：进攻方+4灼烧+格挡${b}点+恢复${tb + 3}点`;
      }
      return { remaining, desc };
    },
    aiAttackScore(eng, v, c, x) {
      let s = null;
      if (v === 5 && x.burn >= 3) s = 80;
      if (v === 7 && x.burn + x.oppBurn >= 4) s = 75;
      if (v === 0) s = 68;
      if (v === 5 && x.burn >= 2) s = 65;
      if (v === 2 && x.oppGuard) s = 62;
      if (v === 6 && x.burn >= 3) s = 58;
      if (v === 3 && x.burn < 4) s = 50;
      if (v === 1) s = 45;
      if (v === 4 && x.oppHand) s = 48;
      if (v === 2 && !x.burn) s = 42;
      return s;
    },
    aiDefendScore(eng, v, c, top, x) {
      if (v === 0 && x.burn >= 3) return 80;
      if (v === 3 && x.burn >= 2) return 68;
      if (v === 1 && x.burn >= 1) return 58;
      if (v === 0 && x.burn <= 1) return 55;
      if (v === 2) return 45;
      return null;
    },
    aiSkip(eng, c, x) {
      if (c === 6 && !x.burn) return true;
      return false;
    },
    aiAttackPriority(eng, v, c, x) {
      if (v === 5 && x.burn >= 3) return 80;
      if (v === 7 && x.burn + x.oppBurn >= 4) return 75;
      if (v === 0) return 68;
      if (v === 5 && x.burn >= 2) return 65;
      if (v === 2 && x.oppGuard) return 62;
      if (v === 6 && x.burn >= 3) return 58;
      if (v === 3 && x.burn < 4) return 50;
      if (v === 1) return 45;
      if (v === 4 && x.oppHand) return 48;
      if (v === 2 && !x.burn) return 42;
      return null;
    },
    aiDefendPriority(eng, v, c, top, x) {
      if (v === 0 && x.burn >= 3) return 80;
      if (v === 3 && x.burn >= 2) return 68;
      if (v === 1 && x.burn >= 1) return 58;
      if (v === 0 && x.burn <= 1) return 55;
      if (v === 2) return 45;
      return null;
    },
    aiSpecialEffect(eng, n, v, c, a, t, owner, helpers) {
      if (v === 4) {
        const pull = label => {
          if (!eng.h.player.length) return null;
          let card = eng.h.player.splice(Math.floor(Math.random() * eng.h.player.length), 1)[0];
          eng.s.revealCards = [JSON.parse(JSON.stringify(card))];
          eng.emit('reveal', label, card, { who: 'player' });
          return card;
        };
        let drawn = pull('Blaze 4牌抽取玩家手牌');
        if (!drawn) return { d: 2 + (a.burn ? 1 : 0), skip: false, unblock: false };
        if (!drawn.isItemCard && drawn.value === 0) {
          eng.h.ai.push(drawn);
          eng.burn(a, 1);
          eng.burn(t, 1);
          eng.emit('desc', `Blaze AI保留${eng.cardText(drawn)}，双方灼烧+1并跳过防御`);
          return { d: 0, skip: true, unblock: false };
        }
        let d = (drawn.isItemCard ? 4 : drawn.value) + (a.burn ? 1 : 0);
        eng.emit('desc', `Blaze AI弃掉${eng.cardText(drawn)}，造成${d}点伤害`);
        return { d, skip: false, unblock: false };
      }
      return null;
    }
  });
})();