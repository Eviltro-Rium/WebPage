(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Blaze',
    hp: 65,
    type: '狂战',
    passive: '当你[灼伤]时，你的⚔️阶段的所有攻击+1🗡️（参与🛡️的计算），该伤害加成不能叠加',
    init() { return {}; },
    turnStart(eng, ch) {},
    damageAtSettlement(eng, v, a, t) {
      const passive = a.burn ? 1 : 0;
      if (v === 3) return 2 + (a.burn || 0) + passive;
      if (v === 5) {
        const fieldBurn = [eng.s.player, eng.s.ai, eng.s.ai2]
          .filter((entity, index, all) => entity && all.indexOf(entity) === index)
          .reduce((sum, entity) => sum + (entity.burn || 0), 0);
        return Math.ceil(fieldBurn) + passive;
      }
      if (v >= 1 && v <= 2) return [0, 3, 4][v] + passive;
      return null;
    },
    attackEffectTiming: { 0: 'afterDamage', 1: 'afterDamage' },
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, burnSelf, heal } = helpers;
      let d = 0;
      let skip = false;
      let unblock = false;
      const passive = a.burn ? 1 : 0;
      if (v === 1) {
        d = 3 + passive;
        burnSelf(1);
        burn(1);
      }
      if (v === 2) {
        d = 4 + passive;
      }
      if (v === 3) {
        if (burnSelf) burnSelf(1);
        d = 2 + (a.burn || 0) + (a.burn ? 1 : 0);
      }
      if (v === 4) {
        const burnLayers = a.burn || 0;
        heal(a, 1 + burnLayers);
        burn(1);
        const status = window.FurryGame && window.FurryGame.StatusService;
        if (status) status.clear(a, 'burn', 'all');
        else a.burn = 0;
        skip = true;
        if (typeof eng.emit === 'function') {
          eng.emit('desc', `Blaze 4牌：恢复${1 + burnLayers}点+对手灼伤1+清除自身灼伤`);
        }
      }
      if (v === 5) {
        if (burnSelf) burnSelf(2);
        burn(2);
        const fieldBurn = [eng.s.player, eng.s.ai, eng.s.ai2]
          .filter((entity, index, all) => entity && all.indexOf(entity) === index)
          .reduce((sum, entity) => sum + (entity.burn || 0), 0);
        d = Math.ceil(fieldBurn) + (a.burn ? 1 : 0);
      }
      if (v === 0) {
        d = 5;
        unblock = true;
        const targetKeys = typeof eng._enemyKeys === 'function'
          ? eng._enemyKeys(owner)
          : [t];
        const targets = (targetKeys.length ? targetKeys : [t])
          .map(key => typeof key === 'string' && eng.s ? eng.s[key] : key);
        targets.forEach(entity => {
          if (!entity) return;
          if (entity === t) burn(2);
          else if (typeof eng.burn === 'function') eng.burn(entity, 2);
        });
      }
      const aoeTargets = v === 0 && typeof eng._allKeysExcept === 'function'
        ? eng._allKeysExcept(owner)
        : null;
      return { d, skip, unblock, aoeTargets, aoeDamage: v === 0 ? 5 : 0 };
    },
    damageAfterDefense(v, damage, defender) {
      if (v === 2) return Math.max(0, damage - Math.ceil(damage / 2));
      return null;
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { heal, burn } = helpers;
      let remaining = d;
      let desc = '';
      if (v === 1) {
        const bh = defender.burn || 0;
        heal(defender, bh);
        burn(opponent, 1);
        burn(defender, 1);
        remaining = d;
        desc = `Blaze 1牌：恢复${bh}点+双方灼伤1`;
      }
      if (v === 2) {
        burn(opponent, 2);
        const b = Math.ceil(d / 2);
        remaining = Math.max(0, d - b);
        desc = `Blaze 2牌：进攻方+2灼伤+格挡${b}点`;
      }
      if (v === 0) {
        burn(opponent, 5);
        const tb = [eng.s.player, eng.s.ai, eng.s.ai2]
          .filter((entity, index, all) => entity && all.indexOf(entity) === index)
          .reduce((sum, entity) => sum + (entity.burn || 0), 0);
        heal(defender, tb + 3);
        remaining = d;
        desc = `Blaze 0牌：进攻方+5灼伤+恢复${tb + 3}点`;
      }
      return { remaining, desc };
    }
  });
})();