/**
 * 沙漠场景 · 怪物定义（框架，怪物待填充）
 * Stage 强化（累积叠加，参照现有场景）：
 *   Stage 2：增加生命上限
 *   Stage 3：增加伤害 / 技能强化
 *   Stage 4：加强防御
 *
 * 怪物池为空时，引擎按全局已注册怪物兜底（adventure_engine.js _pickMonsterName/_pickBossName）；
 * 添加专属怪物后自动切换。怪物用 R.registerMonster / R.registerBoss 注册，
 * 战利白卡掉落规则注册到 adventure/js/engine/loot.js 的 SCENE_RULES.desert。
 */
(function () {
  const R = window.AdventureRegistry;
  if (!R) return;

  window.AdventureBossPool = window.AdventureBossPool || {};
  window.AdventureBossPool.desert = {};

  window.AdventureMonsterPool = window.AdventureMonsterPool || {};
  window.AdventureMonsterPool.desert = { '*': ['DesertBison', 'DesertCamel', 'DesertLizard', 'DesertSandworm', 'DesertScarab', 'DesertScorpion', 'DesertViper', 'DesertVulture'] };

  // ===== 沙漠野牛 =====
  // 进攻1/2/3：造成2×玩家[流血]层数伤害
  // 进攻4/5/6：2点不可防御伤害，施加1层流血，获得1层暴击
  // 防御1/2/3：反击卡面点数伤害，施加1层流血
  R.registerMonster({
    name: 'DesertBison',
    kind: '沙漠野牛',
    hp: 24,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/desert_bison.webp',
    attackDamage(card, ctx) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return 2 * ((ctx && ctx.playerBleed) || 0);
      if (v >= 4 && v <= 6) return 2;
      return 0;
    },
    // 进攻4/5/6：不可防御
    attackUnblockable(card) {
      return !!(card && card.isNumberCard && card.value >= 4 && card.value <= 6);
    },
    // 进攻4/5/6：施加1层流血
    attackBleed(card) {
      return (card && card.isNumberCard && card.value >= 4 && card.value <= 6) ? 1 : 0;
    },
    // 进攻4/5/6：获得1层暴击（上限2）
    attackGainCrit(card) {
      return (card && card.isNumberCard && card.value >= 4 && card.value <= 6) ? 1 : 0;
    },
    // 防御1/2/3：反击卡面点数伤害
    defendCounter(card, incoming) {
      const v = card && card.value;
      return (v >= 1 && v <= 3) ? v : 0;
    },
    // 防御1/2/3：施加1层流血
    defendBleed(card) {
      return (card && card.isNumberCard && card.value >= 1 && card.value <= 3) ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
      3: orig => ({
        // 进攻1/2/3改为3×玩家[流血]层数伤害
        attackDamage(card, ctx) {
          const v = card && card.value;
          if (v >= 1 && v <= 3) return 3 * ((ctx && ctx.playerBleed) || 0);
          return orig.attackDamage(card, ctx);
        }
      }),
      4: orig => ({
        // 防御技能施加[流血]层数 +1（变为2层）
        defendBleed(card) {
          const v = card && card.value;
          return (v >= 1 && v <= 3) ? 2 : 0;
        }
      })
    }
  });

  // ===== 沙漠骆驼 =====
  // 被动：先手攻击（firstStrike，battle_engine 开场跳过玩家补牌、对手先行进攻）
  // 进攻1/2/3：造成3点伤害，施加2层沙盲
  // 进攻4/5/6：造成5点伤害，施加1层荆棘
  // 防御1/2/3：格挡一半伤害（向上取整）
  // stage4：防御1/2/3 额外施加1层荆棘
  R.registerMonster({
    name: 'DesertCamel',
    kind: '沙漠骆驼',
    hp: 20,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/desert_camel.webp',
    firstStrike: true,
    attackDamage(card) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return 3;
      if (v >= 4 && v <= 6) return 5;
      return 0;
    },
    // 进攻1/2/3：施加2层沙盲
    attackSandblind(card) {
      return (card && card.isNumberCard && card.value >= 1 && card.value <= 3) ? 2 : 0;
    },
    // 进攻4/5/6：施加1层荆棘
    attackThorns(card) {
      return (card && card.isNumberCard && card.value >= 4 && card.value <= 6) ? 1 : 0;
    },
    // 防御1/2/3：格挡一半伤害（向上取整）
    defendBlock(card, incoming) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return Math.ceil((incoming || 0) / 2);
      return 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({
        // 进攻1/2/3技能伤害+1（4/5/6不变）
        attackDamage(card, ctx) {
          const v = card && card.value;
          if (v >= 1 && v <= 3) return orig.attackDamage(card, ctx) + 1;
          return orig.attackDamage(card, ctx);
        }
      }),
      4: orig => ({
        // 防御1/2/3：额外施加1层荆棘
        defendThorns(card) {
          return (card && card.isNumberCard && card.value >= 1 && card.value <= 3) ? 1 : 0;
        }
      })
    }
  });

  // ===== 沙漠蜥蜴 =====
  // 进攻1/2/3：造成3点伤害，施加1层沙盲
  // 进攻4/5/6：造成5点伤害，施加1层流沙
  // 防御1/2/3：格挡至多2点伤害，施加2层沙盲
  R.registerMonster({
    name: 'DesertLizard',
    kind: '沙漠蜥蜴',
    hp: 20,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/desert_lizard.webp',
    attackDamage(card) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return 3;
      if (v >= 4 && v <= 6) return 5;
      return 0;
    },
    attackSandblind(card) {
      return (card && card.isNumberCard && card.value >= 1 && card.value <= 3) ? 1 : 0;
    },
    attackQuicksand(card) {
      return (card && card.isNumberCard && card.value >= 4 && card.value <= 6) ? 1 : 0;
    },
    defendBlock(card, incoming) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return Math.min(2, incoming || 0);
      return 0;
    },
    defendSandblind(card) {
      return (card && card.isNumberCard && card.value >= 1 && card.value <= 3) ? 2 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({
        attackSandblind(card) {
          return (card && card.isNumberCard && card.value >= 1 && card.value <= 3) ? 2 : 0;
        }
      }),
      4: orig => ({
        defendBlock(card, incoming) {
          return Math.min(orig.defendBlock(card, incoming) + 1, incoming || 0);
        }
      })
    }
  });

  // ===== 沙漠沙虫 =====
  // 进攻1/2/3：造成4点伤害，若目标有[沙盲]则不可防御
  // 进攻4/5/6：造成5点伤害，获得[寄生]
  // 防御1/2/3：反击2点伤害，施加[沙盲]
  R.registerMonster({
    name: 'DesertSandworm',
    kind: '沙漠沙虫',
    hp: 25,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/desert_sandworm.webp',
    attackDamage(card) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return 4;
      if (v >= 4 && v <= 6) return 5;
      return 0;
    },
    attackUnblockableIfBuff(card, target) {
      const v = card && card.value;
      return !!(v >= 1 && v <= 3 && target && (target.sandblind || 0) > 0);
    },
    attackParasite(card) {
      return (card && card.isNumberCard && card.value >= 4 && card.value <= 6) ? 1 : 0;
    },
    defendCounter(card) {
      const v = card && card.value;
      return (v >= 1 && v <= 3) ? 2 : 0;
    },
    defendSandblind(card) {
      return (card && card.isNumberCard && card.value >= 1 && card.value <= 3) ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendHeal: (card) => ((card && card.value >= 1 && card.value <= 3) ? 2 : 0) })
    }
  });

  // ===== 沙漠圣甲虫 =====
  // 进攻1/2/3：造成3点伤害，按技能牌颜色施加不同 buff
  //   🔴→2层灼伤 / 🟡→荆棘 / 🔵→冰封 / 🟢→中毒
  // 进攻4/5/6：造成4点伤害，获得1层飞翔
  // 防御1/2/3：格挡3点伤害
  R.registerMonster({
    name: 'DesertScarab',
    kind: '沙漠圣甲虫',
    hp: 20,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/desert_scarab.webp',
    attackDamage(card) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return 3;
      if (v >= 4 && v <= 6) return 4;
      return 0;
    },
    attackColorBuff(card) {
      const v = card && card.value;
      if (!(v >= 1 && v <= 3)) return null;
      const color = (card && (card.chosenColor || card.color)) || '';
      if (color === 'RED') return { burn: 2 };
      if (color === 'YELLOW') return { thorns: 1 };
      if (color === 'BLUE') return { iceSeal: 1 };
      if (color === 'GREEN') return { poison: 1 };
      return null;
    },
    attackFly(card) {
      return (card && card.isNumberCard && card.value >= 4 && card.value <= 6) ? 1 : 0;
    },
    defendBlock(card, incoming) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return Math.min(3, incoming || 0);
      return 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendBlock: (card, incoming) => Math.min(orig.defendBlock(card, incoming) + 1, incoming || 0) })
    }
  });

  // ===== 沙漠蝎子 =====
  // 进攻1/2/3：造成3点伤害，目标有[中毒]时不可防御
  // 进攻4/5/6：造成2点伤害（不可防御），施加[荆棘]和[中毒]
  // 防御1/2/3：先施加1层[中毒]，进攻方每有1层[中毒]吸取1点生命
  R.registerMonster({
    name: 'DesertScorpion',
    kind: '沙漠蝎子',
    hp: 18,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/desert_scorpion.webp',
    attackDamage(card) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return 3;
      if (v >= 4 && v <= 6) return 2;
      return 0;
    },
    attackUnblockableIfBuff(card, target) {
      const v = card && card.value;
      return !!(v >= 1 && v <= 3 && target && (target.poison || 0) > 0);
    },
    attackUnblockable(card) {
      return !!(card && card.isNumberCard && card.value >= 4 && card.value <= 6);
    },
    attackThorns(card) {
      return (card && card.isNumberCard && card.value >= 4 && card.value <= 6) ? 1 : 0;
    },
    attackPoison(card) {
      return (card && card.isNumberCard && card.value >= 4 && card.value <= 6) ? 1 : 0;
    },
    defendPoisonDrain(card) {
      return (card && card.isNumberCard && card.value >= 1 && card.value <= 3) ? { poison: 1, drain: 0 } : null;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({
        defendPoisonDrain(card) {
          return (card && card.isNumberCard && card.value >= 1 && card.value <= 3) ? { poison: 1, drain: 1 } : null;
        }
      })
    }
  });

  // ===== 沙漠毒蛇 =====
  // 进攻1/2/3：造成3点伤害，施加[中毒]
  // 进攻4/5/6：吸取 2+玩家[中毒]层数 生命（不可防御）
  // 防御1/2/3：格挡至多2点伤害，施加1层[中毒]
  R.registerMonster({
    name: 'DesertViper',
    kind: '沙漠毒蛇',
    hp: 20,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/desert_viper.webp',
    attackDamage(card) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return 3;
      return 0;
    },
    attackPoison(card) {
      return (card && card.isNumberCard && card.value >= 1 && card.value <= 3) ? 1 : 0;
    },
    attackDrain(card, ctx) {
      const v = card && card.value;
      if (v >= 4 && v <= 6) return 2 + ((ctx && ctx.playerPoison) || 0);
      return 0;
    },
    defendBlock(card, incoming) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return Math.min(2, incoming || 0);
      return 0;
    },
    defendPoison(card) {
      return (card && card.isNumberCard && card.value >= 1 && card.value <= 3) ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 4 }),
      3: orig => ({
        attackDrain(card, ctx) {
          const v = card && card.value;
          if (v >= 4 && v <= 6) return 3 + ((ctx && ctx.playerPoison) || 0);
          return orig.attackDrain(card, ctx);
        }
      }),
      4: orig => ({
        defendPoison(card) {
          return (card && card.isNumberCard && card.value >= 1 && card.value <= 3) ? 2 : 0;
        }
      })
    }
  });

  // ===== 沙漠秃鹫 =====
  // 进攻1/2/3：造成3点伤害，若技能牌为🟡施加2层[沙盲]，否则获得[飞翔]
  // 进攻4/5/6：造成5点伤害，清除玩家所有正面 buff
  // 防御1/2/3：格挡1点伤害，反击1点伤害，施加[沙盲]
  R.registerMonster({
    name: 'DesertVulture',
    kind: '沙漠秃鹫',
    hp: 24,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/desert_vulture.webp',
    attackDamage(card) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return 3;
      if (v >= 4 && v <= 6) return 5;
      return 0;
    },
    attackSandblind(card) {
      const v = card && card.value;
      if (!(v >= 1 && v <= 3)) return 0;
      const color = (card && (card.chosenColor || card.color)) || '';
      return color === 'YELLOW' ? 2 : 0;
    },
    attackFly(card) {
      const v = card && card.value;
      if (!(v >= 1 && v <= 3)) return 0;
      const color = (card && (card.chosenColor || card.color)) || '';
      return color === 'YELLOW' ? 0 : 1;
    },
    attackClearPositive(card) {
      return !!(card && card.isNumberCard && card.value >= 4 && card.value <= 6);
    },
    defendBlock(card, incoming) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return Math.min(1, incoming || 0);
      return 0;
    },
    defendCounter(card) {
      const v = card && card.value;
      return (v >= 1 && v <= 3) ? 1 : 0;
    },
    defendSandblind(card) {
      return (card && card.isNumberCard && card.value >= 1 && card.value <= 3) ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({
        defendCounter(card) {
          const v = card && card.value;
          return (v >= 1 && v <= 3) ? 2 : 0;
        }
      })
    }
  });

  // 怪物定义骨架示例（参照 ocean.js 的 registerMonster / registerBoss）：
  //
  // R.registerMonster({
  //   name: 'DesertXxx',
  //   kind: '沙漠X',
  //   hp: 20,
  //   attack: 3,
  //   defense: 2,
  //   icon: '../icons/npc_icons/desert_xxx.webp',
  //   attackDamage(card, ctx) { ... },
  //   defendBlock(card, incoming) { ... },
  //   stageMods: {
  //     2: orig => ({ hp: orig.hp + 5 }),
  //     3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
  //     4: orig => ({ ... })
  //   }
  // });
})();