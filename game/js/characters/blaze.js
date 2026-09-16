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
      const { burn, burnSelf, burnTarget, heal } = helpers;
      let d = 0;
      let skip = false;
      let unblock = false;
      let hadBurn = a.burn > 0;
      if (v === 1) d = 4;
      if (v === 2) { d = 2; unblock = true; if (burnSelf) burnSelf(2); }
      if (v === 3) { d = 3; if (burnSelf) burnSelf(1); burn(1); }
      if (v === 4) { d = 0; skip = true; }
      if (v === 5) {
        if (burnSelf) burnSelf(1);
        hadBurn = a.burn > 0;
        d = 2 + a.burn;
      }
      if (v === 6) {
        const burnLayers = a.burn || 0;
        heal(a, Math.ceil(1.5 * burnLayers));
        const status = window.FurryGame && window.FurryGame.StatusService;
        if (status) status.clear(a, 'burn', 'all');
        else a.burn = 0;
        burn(1);
        skip = true;
      }
      if (v === 7) {
        if (burnSelf) burnSelf(2);
        burn(2);
        let fieldBurn = [eng.s.player, eng.s.ai, eng.s.ai2]
          .filter((entity, index, all) => entity && all.indexOf(entity) === index)
          .reduce((sum, entity) => sum + (entity.burn || 0), 0);
        d = Math.ceil(fieldBurn);
        hadBurn = true;
      }
      if (v === 0) {
        d = 5;
        unblock = true;
        // 0牌的灼烧覆盖所有对手，1v2时不能只给当前目标施加。
        const targetKeys = typeof eng._enemyKeys === 'function'
          ? eng._enemyKeys(owner)
          : [t];
        const targets = (targetKeys.length ? targetKeys : [t])
          .map(key => typeof key === 'string' && eng.s ? eng.s[key] : key);
        targets.forEach(entity => {
          if (!entity) return;
          if (entity === t) burn(2);
          else if (typeof eng.burn === 'function') eng.burn(entity, 2);
          else if (typeof burnTarget === 'function') burnTarget(entity, 2);
          else if (typeof eng.burn === 'function') eng.burn(entity, 2, { silent: true });
        });
      }
      if (d && hadBurn && v !== 0) d++;
      const aoeTargets = v === 0 && typeof eng._allKeysExcept === 'function'
        ? eng._allKeysExcept(owner)
        : null;
      return { d, skip, unblock, aoeTargets, aoeDamage: v === 0 ? 5 : 0, immediateBuffs: v === 7 };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, burn } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d;
      let desc = '';
      if (v === 1) {
        let bh = defender.burn || 0;
        heal(defender, bh);
        burn(opponent, 1);
        burn(defender, 1);
        remaining = d;
        desc = `Blaze 1牌：恢复${bh}点+双方灼烧1`;
      }
      if (v === 2) {
        // 文档：对进攻玩家施加2层灼烧，格挡½（向上取整）
        burn(opponent, 2);
        let b = Math.ceil(d / 2);
        remaining = Math.max(0, d - b);
        desc = `Blaze 2牌：进攻方+2灼烧+格挡${b}点`;
      }
      if (v === 3) {
        // 文档：先对进攻玩家施加2层灼伤，再按其灼伤层数反击
        burn(opponent, 2);
        let fb = opponent.burn || 0;
        counter(opponent, fb);
        remaining = d;
        desc = `Blaze 3牌：反击攻击方灼烧${fb}点+攻击方+2灼烧`;
      }
      if (v === 0) {
        // 文档：对进攻玩家施加5层灼烧，恢复场上所有灼烧数+3❤️
        burn(opponent, 5);
        let tb = [eng.s.player, eng.s.ai, eng.s.ai2]
          .filter((entity, index, all) => entity && all.indexOf(entity) === index)
          .reduce((sum, entity) => sum + (entity.burn || 0), 0);
        heal(defender, tb + 3);
        remaining = d;
        desc = `Blaze 0牌：进攻方+5灼烧+恢复${tb + 3}点`;
      }
      return { remaining, desc };
    }
  });
})();
