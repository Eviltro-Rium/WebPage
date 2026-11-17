/**
 * 城堡场景 · 怪物定义
 * 所有怪物在 Stage 1-4 均可出现，按 stage 强化：
 *   Stage 2：增加生命上限
 *   Stage 3：增加伤害
 *   Stage 4：加强防御
 */

(function () {
  const R = window.AdventureRegistry;
  if (!R) return;

  function isLow(card) {
    return !!(card && card.isNumberCard && card.value >= 1 && card.value <= 2);
  }
  function isHigh(card) {
    return !!(card && card.isNumberCard && card.value >= 3 && card.value <= 4);
  }
  function consumableCount(eng) {
    return eng && eng._adventureEngine && eng._adventureEngine.snapshot
      ? (eng._adventureEngine.snapshot().consumables || []).length : 0;
  }

  window.AdventureBossPool = window.AdventureBossPool || {};
  window.AdventureBossPool.castle = {
    '*': ['CastleChameleon', 'CastleEagle'],
    3: ['CastleChameleon', 'CastleEagle', 'CastleGargoyle'],
    4: ['CastleChameleon', 'CastleEagle', 'CastleGargoyle']
  };

  window.AdventureElitePool = window.AdventureElitePool || {};
  window.AdventureElitePool.castle = {
    3: ['CastleBat', 'CastleGhost', 'DungeonGoblin'],
    4: ['CastleBat', 'CastleGhost', 'DungeonGoblin']
  };

  window.AdventureMonsterPool = window.AdventureMonsterPool || {};
  window.AdventureMonsterPool.castle = {
    '*': ['CastleWolf', 'CastleFox', 'CastleBear', 'CastleTiger', 'CastleCrow', 'CastleFirefly'],
    2: ['CastleWolf', 'CastleFox', 'CastleBear', 'CastleTiger', 'CastleCrow', 'CastleFirefly'],
    3: ['CastleWolf', 'CastleFox', 'CastleBear', 'CastleTiger', 'CastleCrow', 'CastleFirefly'],
    4: ['CastleWolf', 'CastleFox', 'CastleBear', 'CastleTiger', 'CastleCrow', 'CastleFirefly']
  };

  /** 萤火虫（CastleFirefly）
   * 进攻：1/2/3 造成2点伤害并获得飞翔；4/5/6造成4点伤害并致盲。
   * 防御：1/2/3 格挡 ceil(1 + 道具数量 / 2) 点伤害。
   */
  R.registerMonster({
    name: 'CastleGhost',
    kind: '夜巡幽魂',
    minStage: 2,
    hp: 30,
    attack: 4,
    defense: 1,
    icon: '../icons/npc_icons/castle_ghost.webp',

    attackDamage(card, ctx) {
      if (!card || !card.isNumberCard) return 0;
      if (isLow(card)) return 4;
      if (isHigh(card) && ctx && ctx.attackerHandSize === 1) {
        const remaining = ctx.attackerHand && ctx.attackerHand[0];
        const value = remaining && remaining.isNumberCard ? Number(remaining.value) || 0 : 0;
        return value + 5;
      }
      return 0;
    },

    attackFly(card) {
      return isLow(card) ? 1 : 0;
    },

    defendRollImmune(card, eng, defender, damage, owner = 'ai') {
      if (!isLow(card)) return false;
      // UI/AI capability checks call this without an engine; the real defense
      // path supplies the engine and records the D12 roll in the判定区.
      if (!eng || typeof eng.rollD12 !== 'function') return true;
      const roll = eng.rollD12('夜巡幽魂防御判定', { who: owner });
      return roll <= 4;
    },

    stageMods: {
      4: orig => ({
        defendRollImmune(card, eng, defender, damage, owner = 'ai') {
          if (!isLow(card)) return false;
          if (!eng || typeof eng.rollD12 !== 'function') return true;
          return eng.rollD12('夜巡幽魂防御判定', { who: owner }) <= 6;
        }
      })
    }
  });

  R.registerMonster({
    name: 'CastleFirefly',
    kind: '廊灯萤',
    hp: 15,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/castle_firefly.webp',

    attackDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      if (isLow(card)) return 2;
      if (isHigh(card)) return 5;
      return 0;
    },

    attackFly(card) {
      return isLow(card) ? 1 : 0;
    },

    attackBlind(card) {
      return isHigh(card);
    },

    defendBlock(card, incoming, defender, eng) {
      if (!isLow(card)) return 0;
      return Math.ceil(1 + consumableCount(eng) / 2);
    },

    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({
        defendBlock: (card, incoming, defender, eng) => {
          if (!isLow(card)) return 0;
          return 1 + consumableCount(eng);
        }
      })
    }
  });

  /**
   * 狼（CastleWolf）
   * 进攻：1/2/3牌造成4点伤害，4/5/6牌造成6点伤害
   * 防御：1/2/3牌分别格挡对应点数伤害
   * 强化：(2)+6生命 (3)伤害+1 (4)格挡+1
   */
  R.registerMonster({
    name: 'CastleWolf',
    kind: '城壕饿狼',
    hp: 18,
    attack: 4,
    defense: 1,
    icon: '../icons/npc_icons/castle_wolf.webp',

    attackDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      if (isLow(card)) return 4;
      if (isHigh(card)) return 6;
      return 0;
    },

    defendBlock(card, incoming) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value === 1) return 1;
      if (card.value === 2) return 2;
      return 0;
    },

    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendBlock: (card, incoming) => orig.defendBlock(card, incoming) + 1 })
    }
  });

  /**
   * 狐（CastleFox）
   * 进攻：1/2/3牌造成不可防御的对应点数伤害，4/5/6牌造成玩家手牌数点伤害（可防御）
   * 防御：1/2/3牌恢复2点生命
   * 强化：(2)+6生命 (3)1/2/3伤害+1 (4)恢复3点生命
   */
  R.registerMonster({
    name: 'CastleFox',
    kind: '廊影狐',
    hp: 15,
    attack: 3,
    defense: 0,
    icon: '../icons/npc_icons/castle_fox.webp',

    attackDamage(card, ctx) {
      if (!card || !card.isNumberCard) return 0;
      if (isLow(card)) return card.value + 1;
      if (isHigh(card)) return ctx ? (ctx.playerHandSize || 0) : 0;
      return 0;
    },

    attackUnblockable(card) {
      return isLow(card);
    },

    defendHeal(card) {
      return isLow(card) ? 2 : 0;
    },

    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({
        attackDamage: (card, ctx) => {
          const base = orig.attackDamage(card, ctx);
          if (isLow(card)) return base + 1;
          return base;
        }
      }),
      4: orig => ({
        defendHeal: (card) => (isLow(card) ? 3 : 0)
      })
    }
  });

  /**
   * 熊（CastleBear）
   * 进攻：1/2/3牌造成3点伤害并获得1层守护，4/5/6牌造成4点伤害并施加1层流血
   * 防御：1/2/3牌格挡ceil(incoming/2)点伤害
   * 强化：(2)+3生命 (3)1/2/3伤害+1，4/5/6伤害+2 (4)增加反击1点
   */
  R.registerMonster({
    name: 'CastleBear',
    kind: '石庭巨熊',
    hp: 20,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/castle_bear.webp',

    attackDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      if (isLow(card)) return 3;
      if (isHigh(card)) return 5;
      return 0;
    },

    attackGuard(card) {
      return isLow(card) ? 1 : 0;
    },

    attackBleed(card) {
      return isHigh(card) ? 1 : 0;
    },

    defendBlock(card, incoming) {
      return isLow(card) ? Math.ceil((incoming || 0) / 2) : 0;
    },

    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({
        attackDamage: (card, ctx) => {
          const base = orig.attackDamage(card, ctx);
          if (!card || !card.isNumberCard) return base;
          if (isLow(card)) return base + 1;
          if (isHigh(card)) return base + 2;
          return base;
        }
      }),
      4: orig => ({
        defendCounter: (card) => (isLow(card) ? 1 : 0)
      })
    }
  });

  /**
   * 虎（CastleTiger）
   * 先手攻击，进攻：1/2/3牌造成2点伤害并施加1层流血，4/5/6牌造成对应点数伤害
   * 防御：1/2/3牌反击对应点数伤害
   * 强化：(2)+4生命 (3)1/2/3变为不可防御 (4)反击伤害+1
   */
  R.registerMonster({
    name: 'CastleTiger',
    kind: '禁苑猛虎',
    hp: 18,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/castle_tiger.webp',
    firstStrike: true,

    attackDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      if (isLow(card)) return 3;
      if (card.value === 3) return 4;
      if (card.value === 4) return 6;
      return 0;
    },

    attackBleed(card) {
      return isLow(card) ? 1 : 0;
    },

    defendCounter(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value === 1) return 2;
      if (card.value === 2) return 3;
      return 0;
    },

    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
      3: orig => ({
        attackUnblockable: (card) => isLow(card)
      }),
      4: orig => ({
        defendCounter: (card) => {
          const base = orig.defendCounter(card);
          return base > 0 ? base + 1 : base;
        }
      })
    }
  });

  /**
   * Boss · 隐之避役（CastleChameleon）
   * 牌库：普通 NPC 牌库 + 两张白色 0；手牌上限 3
   * 进攻：1/2 → 2 不可防御；3/4 → 4伤+1中毒；0 → 4不可防御+2守护+2中毒
   * 防御：1/2 → 恢复2；0 → 反击4并格挡半数（向上取整）
   * 强化：(2)+5生命 (3)进攻伤害+1 (4)防御1/2恢复+1
   */
  R.registerBoss({
    name: 'CastleChameleon',
    kind: '隐之避役',
    hp: 35,
    attack: 4,
    defense: 2,
    handLimit: 3,
    whiteZeros: 2,
    icon: '../icons/npc_icons/castle_chameleon.webp',

    attackDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      if (isLow(card)) return 2;
      if (isHigh(card)) return 4;
      if (card.value === 0) return 4;
      return 0;
    },

    attackUnblockable(card) {
      if (!card || !card.isNumberCard) return false;
      return card.value === 0 || isLow(card);
    },

    attackPoison(card) {
      if (isHigh(card)) return 1;
      if (card.value === 0) return 2;
      return 0;
    },

    attackGuard(card) {
      return card && card.isNumberCard && card.value === 0 ? 2 : 0;
    },

    defendHeal(card) {
      return isLow(card) ? 2 : 0;
    },

    defendBlock(card, incoming) {
      return card && card.isNumberCard && card.value === 0
        ? Math.ceil((incoming || 0) / 2) : 0;
    },

    defendCounter(card) {
      return card && card.isNumberCard && card.value === 0 ? 4 : 0;
    },

    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({
        attackDamage: (card, ctx) => {
          const base = orig.attackDamage(card, ctx);
          if (!card || !card.isNumberCard) return base;
          return base + 1;
        }
      }),
      4: orig => ({
        defendHeal: (card) => (isLow(card) ? 3 : 0)
      })
    }
  });

  /**
   * Boss · 自由之鹰（CastleEagle）
   * HP 35。被动：进攻开始前对玩家施加1层流血。
   * 进攻：1/2/3 → 4/5/6伤；4/5/6 → 清除正面buff + 3不可防御；0 → 2层飞翔 + 4伤
   * 防御：1/2/3 → 反击2并获得飞翔；0 → 免疫所有伤害并施加2层流血
   * 强化：(2)+10生命 (3)伤害+1 (4)反击+1
   */
  R.registerBoss({
    name: 'CastleEagle',
    kind: '自由之鹰',
    hp: 30,
    attack: 4,
    defense: 2,
    icon: '../icons/npc_icons/castle_eagle.webp',
    handLimit: 3,
    whiteZeros: 2,

    attackTurnStart(eng) {
      if (!eng || !eng.s || !eng.s.player) return;
      eng.bleed(eng.s.player, 1);
    },

    attackDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value === 1) return 4;
      if (card.value === 2) return 6;
      if (isHigh(card)) return 3;
      if (card.value === 0) return 3;
      return 0;
    },

    attackUnblockable(card) {
      return isHigh(card);
    },

    attackClearPositive(card) {
      return isHigh(card);
    },

    attackFly(card) {
      if (!card || !card.isNumberCard) return 0;
      return card.value === 0 ? 2 : 0;
    },

    attackGainCrit(card) {
      if (!card || !card.isNumberCard) return 0;
      return card.value === 0 ? 2 : 0;
    },

    defendCounter(card) {
      return isLow(card) ? 2 : 0;
    },

    defendFly(card) {
      return isLow(card) ? 1 : 0;
    },

    defendBleed(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value === 0) return 2;
      return 0;
    },

    defendImmune(card) {
      return !!(card && card.isNumberCard && card.value === 0);
    },

    stageMods: {
      2: orig => ({ hp: orig.hp + 10 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendCounter: (card) => orig.defendCounter(card) + 1 })
    }
  });

   /**
    * 盗宝哥布林（DungeonGoblin）
    * 仅在 Stage 2/3/4 刷出
    * 被动：哥布林进攻打出数字1时触发（stage2:损失1金币, stage3/4:损失1随机道具）
    * 进攻：1/2/3牌造成2点不可防御伤害，4/5/6牌造成5点伤害并获得1/2/3层守护
    * 防御：1/2/3牌恢复1/2/3点生命
    * 强化：(3)伤害+1 (4)防御恢复生命+1
    */
   R.registerMonster({
     name: 'DungeonGoblin',
     kind: '盗宝哥布林',
     minStage: 2,
     hp: 30,
     attack: 4,
     defense: 1,
     icon: '../icons/npc_icons/castle_goblin.webp',

     attackDamage(card) {
       if (!card || !card.isNumberCard) return 0;
       if (isLow(card)) return 2;
       if (isHigh(card)) return 6;
       return 0;
     },

     attackUnblockable(card) {
       return isLow(card);
     },

     attackGuard(card) {
       if (!card || !card.isNumberCard) return 0;
       if (card.value === 3) return 1;
       if (card.value === 4) return 3;
       return 0;
     },

     defendHeal(card) {
       return isLow(card) ? 2 : 0;
     },

     defendCounter(card) {
       return isLow(card) ? 2 : 0;
     },

     stageMods: {
       4: orig => ({
         defendHeal: (card) => (isLow(card) ? 3 : 0),
         defendCounter: (card) => (isLow(card) ? 3 : 0)
       })
     }
   });

  /**
   * 鸦（CastleCrow）
   * 进攻：1/2/3牌造成3点伤害恢复1点生命，4/5/6牌造成4点伤害恢复2点生命
   * 防御：1牌格挡至多2点，2牌免疫所有伤害并免疫buff，0牌无效果但仍会打出
   * 强化：(2)+5生命 (3)伤害+1 (4)打出防御1/2时获得1层飞翔
   */
  R.registerMonster({
    name: 'CastleCrow',
    kind: '报丧鸦',
    hp: 18,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/castle_crow.webp',

    attackDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      if (isLow(card)) return 3;
      if (isHigh(card)) return 4;
      return 0;
    },

    attackHeal(card) {
      if (!card || !card.isNumberCard) return 0;
      if (isLow(card)) return 1;
      if (isHigh(card)) return 2;
      return 0;
    },

    defendBlock(card, incoming) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value === 1) return Math.min(2, incoming || 0);
      return 0;
    },

    defendImmune(card) {
      return !!(card && card.isNumberCard && card.value === 2);
    },

    defendImmuneBuff(card) {
      return !!(card && card.isNumberCard && card.value === 2);
    },

    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: () => ({ defendFly: card => isLow(card) ? 1 : 0 })
    }
  });

  /**
   * 蝠（CastleBat）
   * 进攻：1/2/3牌造成3点伤害并施加1层流血；4/5/6牌吸血3+玩家流血层数（不可防御）
   * 防御：1/2/3牌格挡至多2点伤害并施加1层流血
   * 强化：(4)格挡+1（至多3点）
   */
  R.registerMonster({
    name: 'CastleBat',
    kind: '钟楼蝠',
    hp: 27,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/castle_bat.webp',

    attackDamage(card, ctx) {
      if (!card || !card.isNumberCard) return 0;
      if (isLow(card)) return 3;
      return 0;
    },

    attackBleed(card) {
      return isLow(card) ? 1 : 0;
    },

    attackUnblockable(card) {
      return isHigh(card);
    },

    attackDrain(card, ctx) {
      return isHigh(card) ? 3 + ((ctx && ctx.playerBleed) || 0) : 0;
    },

    defendBlock(card, incoming) {
      return isLow(card) ? Math.min(2, incoming || 0) : 0;
    },

    defendBleed(card) {
      return isLow(card) ? 1 : 0;
    },

    stageMods: {
      4: orig => ({
        defendBlock: (card, incoming) => {
          const base = orig.defendBlock(card, incoming);
          return base > 0 ? base + 1 : 0;
        }
      })
    }
  });

  /**
   * Boss · 石像鬼（CastleGargoyle）
   * 进攻：1/2/3牌获得1层飞翔并造成3点伤害，4/5/6牌获得1层守护并造成3点不可防御伤害
   * 进攻0牌：造成3点不可防御伤害，玩家随机丢失1个道具，石像鬼抽取1张牌
   * 防御：1/2/3牌格挡½伤害（向上取整）并施加1层流血，0牌免疫所有伤害（不免疫buff）并抽取1张牌
   * 强化：(2)+10生命 (3)伤害+1 (4)防御1/2/3恢复1生命
   */
  R.registerBoss({
    name: 'CastleGargoyle',
    kind: '石像鬼',
    minStage: 3,
    hp: 40,
    attack: 4,
    defense: 2,
    handLimit: 3,
    whiteZeros: 2,
    icon: '../icons/npc_icons/gargoyle.webp',

    attackDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      if (isLow(card) || isHigh(card) || card.value === 0) return 4;
      return 0;
    },

    attackFly(card) {
      return isLow(card) ? 1 : 0;
    },

    attackGuard(card) {
      return isHigh(card) ? 1 : 0;
    },

    attackUnblockable(card) {
      if (!card || !card.isNumberCard) return false;
      return card.value === 0 || isHigh(card);
    },

    attackStealItem(card) {
      return !!(card && card.isNumberCard && card.value === 0);
    },

    attackDrawSelf(card) {
      return !!(card && card.isNumberCard && card.value === 0);
    },

    defendBlock(card, incoming) {
      return isLow(card) ? Math.ceil((incoming || 0) / 2) : 0;
    },

    defendBleed(card) {
      return isLow(card) ? 1 : 0;
    },

    defendImmune(card) {
      return !!(card && card.isNumberCard && card.value === 0);
    },

    defendDrawSelf(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value === 0) return 1;
      return 0;
    },

    stageMods: {
      4: orig => ({
        defendCounter: (card) => (isLow(card) ? 1 : 0)
      })
    }
  });
})();
