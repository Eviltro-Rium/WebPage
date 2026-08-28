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
      if (v === 0) { d = 5; unblock = true; burn(2); }
      if (d && hadBurn && v !== 0) d++;
      return { d, skip, unblock, immediateBuffs: v === 7 };
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
      if (v === 2) {
        burn(opponent, 4);
        b = Math.ceil(d / 2);
        let tb = defender.burn + opponent.burn + (eng.s.ai2 ? eng.s.ai2.burn : 0);
        heal(defender, tb);
        remaining = Math.max(0, d - b);
        desc = `Blaze 2牌：进攻方+4灼烧+格挡${b}点+恢复${tb}点`;
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
    }
  });
})();