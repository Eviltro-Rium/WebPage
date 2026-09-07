/**
 * 冻洋场景 · 怪物定义
 * Stage 强化（累积叠加）：
 *   Stage 2：增加生命上限
 *   Stage 3：增加伤害
 *   Stage 4：加强防御（格挡 / 反击）
 */
(function () {
  const R = window.AdventureRegistry;
  if (!R) return;

  window.AdventureBossPool = window.AdventureBossPool || {};
  window.AdventureBossPool.ocean = window.AdventureBossPool.ocean || { '*': [] };

  window.AdventureMonsterPool = window.AdventureMonsterPool || {};
  window.AdventureMonsterPool.ocean = {
    '*': ['FrozenOceanLynx'],
    2: ['FrozenOceanLynx'],
    3: ['FrozenOceanLynx'],
    4: ['FrozenOceanLynx']
  };

  // ===== 冻洋猞猁 =====
  R.registerMonster({
    name: 'FrozenOceanLynx',
    kind: '冻洋猞猁',
    hp: 20,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_lynx.png',
    attackDamage(card) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 3;
      if (v >= 4 && v <= 6) return 4;
      return 0;
    },
    attackFreeze(card) {
      const v = card.value;
      return v >= 1 && v <= 3;
    },
    attackIceSeal(card) {
      const v = card.value;
      return v >= 4 && v <= 6;
    },
    defendBlock(card, incoming) {
      const v = card.value;
      if (v >= 1 && v <= 3) return Math.min(2, incoming);
      return 0;
    },
    defendCounter(card, incoming, defender, opponent) {
      const v = card.value;
      if (!(v >= 1 && v <= 3)) return 0;
      // Skill-text path omits opponent; combat path only counters when frozen.
      if (opponent != null && !opponent.frozen) return 0;
      return 2;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({
        defendBlock: (card, incoming) => {
          const base = orig.defendBlock(card, incoming);
          return base > 0 ? Math.min(base + 1, incoming) : 0;
        },
        defendCounter: (card, incoming, defender, opponent) => {
          const base = orig.defendCounter(card, incoming, defender, opponent);
          return base > 0 ? base + 1 : 0;
        }
      })
    }
  });
})();
