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
    '*': ['FrozenOceanLynx', 'FrozenWhale', 'FrozenOceanShark'],
    2: ['FrozenOceanLynx', 'FrozenWhale', 'FrozenOceanShark'],
    3: ['FrozenOceanLynx', 'FrozenWhale', 'FrozenOceanShark'],
    4: ['FrozenOceanLynx', 'FrozenWhale', 'FrozenOceanShark']
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

  // ===== 冻洋蓝鲸 =====
  R.registerMonster({
    name: 'FrozenWhale',
    kind: '冻洋蓝鲸',
    hp: 25,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_whale.png',
    attackDamage(card) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 2;
      if (v >= 4 && v <= 6) return 4;
      return 0;
    },
    // 进攻1/2/3：获得潜水（上限1）
    attackGainDiving(card) {
      const v = card.value;
      return v >= 1 && v <= 3;
    },
    // 进攻4/5/6：对场上所有其他角色造成4点不可防御伤害
    attackAoEOtherChars(card) {
      const v = card.value;
      return v >= 4 && v <= 6 ? 4 : 0;
    },
    // 进攻4/5/6：不可防御
    attackUnblockable(card) {
      const v = card.value;
      return v >= 4 && v <= 6;
    },
    // 进攻4/5/6：防御结束后对对手施加1层失温
    attackHypothermia(card) {
      const v = card.value;
      return v >= 4 && v <= 6 ? 1 : 0;
    },
    // 防御1/2/3：反击2点
    defendCounter(card, incoming, defender, opponent) {
      const v = card.value;
      if (!(v >= 1 && v <= 3)) return 0;
      return 2;
    },
    // 防御1/2/3：获得守护
    defendGuard(card) {
      const v = card.value;
      return v >= 1 && v <= 3 ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 })
    }
  });

  // ===== 冻洋鲨 =====
  R.registerMonster({
    name: 'FrozenOceanShark',
    kind: '冻洋鲨',
    hp: 20,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_shark.png',
    attackDamage(card, ctx) {
      const v = card.value;
      const bleed = ctx.playerBleed || 0;
      if (v >= 1 && v <= 3) return 2 * bleed;
      if (v >= 4 && v <= 6) return 3;
      return 0;
    },
    attackUnblockable(card) {
      const v = card.value;
      return v >= 4 && v <= 6;
    },
    attackBleed(card) {
      const v = card.value;
      return v >= 4 && v <= 6 ? 1 : 0;
    },
    defendCounter(card, incoming, defender, opponent) {
      const v = card.value;
      if (!(v >= 1 && v <= 3)) return 0;
      return 2;
    },
    defendBleed(card) {
      const v = card.value;
      return v >= 1 && v <= 3 ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 7 }),
      3: orig => ({
        attackDamage(card, ctx) {
          const base = orig.attackDamage(card, ctx);
          const v = card.value;
          if (v >= 1 && v <= 3) {
            const bleed = ctx.playerBleed || 0;
            return 3 * bleed; // 流血层数 × 3
          }
          return base;
        }
      }),
      4: orig => ({
        defendBlock(card, incoming) {
          return 2;
        }
      })
    }
  });
})();
