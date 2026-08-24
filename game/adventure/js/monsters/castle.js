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

  window.AdventureBossPool = window.AdventureBossPool || {};
  window.AdventureBossPool.castle = ['CastleChameleon', 'CastleEagle'];

  window.AdventureMonsterPool = window.AdventureMonsterPool || {};
  window.AdventureMonsterPool.castle = {
    '*': ['CastleWolf', 'CastleFox', 'CastleBear', 'CastleTiger']
  };

  /**
   * 狼（CastleWolf）
   * 进攻：1/2/3牌造成4点伤害，4/5/6牌造成6点伤害
   * 防御：1/2/3牌分别格挡对应点数伤害
   * 强化：(2)+5生命 (3)伤害+1 (4)格挡+1
   */
  R.registerMonster({
    name: 'CastleWolf',
    kind: '城堡之狼',
    hp: 20,
    attack: 4,
    defense: 1,
    icon: '../icons/npc_icons/castle_wolf.png',

    attackDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value >= 1 && card.value <= 3) return 4;
      if (card.value >= 4 && card.value <= 6) return 6;
      return 0;
    },

    defendBlock(card, incoming) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value >= 1 && card.value <= 3) return card.value;
      return 0;
    },

    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
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
    kind: '城堡之狐',
    hp: 18,
    attack: 3,
    defense: 0,
    icon: '../icons/npc_icons/castle_fox.png',

    attackDamage(card, ctx) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value >= 1 && card.value <= 3) return card.value;
      if (card.value >= 4 && card.value <= 6) return ctx ? (ctx.playerHandSize || 0) : 0;
      return 0;
    },

    attackUnblockable(card) {
      if (!card || !card.isNumberCard) return false;
      return card.value >= 1 && card.value <= 3;
    },

    defendHeal(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value >= 1 && card.value <= 3) return 2;
      return 0;
    },

    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
      3: orig => ({
        attackDamage: (card, ctx) => {
          const base = orig.attackDamage(card, ctx);
          if (card && card.isNumberCard && card.value >= 1 && card.value <= 3) return base + 1;
          return base;
        }
      }),
      4: orig => ({
        defendHeal: (card) => {
          if (!card || !card.isNumberCard) return 0;
          if (card.value >= 1 && card.value <= 3) return 3;
          return 0;
        }
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
    kind: '城堡之熊',
    hp: 25,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/castle_bear.png',

    attackDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value >= 1 && card.value <= 3) return 3;
      if (card.value >= 4 && card.value <= 6) return 4;
      return 0;
    },

    attackGuard(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value >= 1 && card.value <= 3) return 1;
      return 0;
    },

    attackBleed(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value >= 4 && card.value <= 6) return 1;
      return 0;
    },

    defendBlock(card, incoming) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value >= 1 && card.value <= 3) return Math.ceil((incoming || 0) / 2);
      return 0;
    },

    stageMods: {
      2: orig => ({ hp: orig.hp + 3 }),
      3: orig => ({
        attackDamage: (card, ctx) => {
          const base = orig.attackDamage(card, ctx);
          if (!card || !card.isNumberCard) return base;
          if (card.value >= 1 && card.value <= 3) return base + 1;
          if (card.value >= 4 && card.value <= 6) return base + 2;
          return base;
        }
      }),
      4: orig => ({
        defendCounter: (card) => {
          if (!card || !card.isNumberCard) return 0;
          if (card.value >= 1 && card.value <= 3) return 1;
          return 0;
        }
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
    kind: '城堡之虎',
    hp: 20,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/castle_tiger.png',
    firstStrike: true,

    attackDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value >= 1 && card.value <= 3) return 2;
      if (card.value >= 4 && card.value <= 6) return card.value;
      return 0;
    },

    attackBleed(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value >= 1 && card.value <= 3) return 1;
      return 0;
    },

    defendCounter(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value >= 1 && card.value <= 3) return card.value;
      return 0;
    },

    stageMods: {
      2: orig => ({ hp: orig.hp + 4 }),
      3: orig => ({
        attackUnblockable: (card) => {
          if (!card || !card.isNumberCard) return false;
          if (card.value >= 1 && card.value <= 3) return true;
          return false;
        }
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
   * 进攻：1/2/3 → 1/2/3 不可防御；4/5/6 → 3伤+1中毒；0 → 2不可防御+2守护+2中毒
   * 防御：1/2/3 → 恢复2；0 → 施加3中毒并格挡半数（向上取整）
   * 强化：(2)+10生命 (3)4/5/6/0伤害+1 (4)防御1/2/3恢复+1
   */
  R.registerBoss({
    name: 'CastleChameleon',
    kind: '隐之避役',
    hp: 40,
    attack: 4,
    defense: 2,
    handLimit: 3,
    whiteZeros: 2,
    icon: '../icons/npc_icons/castle_chameleon.png',

    attackDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value === 1) return 1;
      if (card.value === 2) return 2;
      if (card.value === 3) return 3;
      if (card.value >= 4 && card.value <= 6) return 3;
      if (card.value === 0) return 2;
      return 0;
    },

    attackUnblockable(card) {
      if (!card || !card.isNumberCard) return false;
      return card.value === 0 || (card.value >= 1 && card.value <= 3);
    },

    attackPoison(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value >= 4 && card.value <= 6) return 1;
      if (card.value === 0) return 2;
      return 0;
    },

    attackGuard(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value === 0) return 2;
      return 0;
    },

    defendHeal(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value >= 1 && card.value <= 3) return 2;
      return 0;
    },

    defendBlock(card, incoming) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value === 0) return Math.ceil((incoming || 0) / 2);
      return 0;
    },

    defendPoison(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value === 0) return 3;
      return 0;
    },

    stageMods: {
      2: orig => ({ hp: orig.hp + 10 }),
      3: orig => ({
        attackDamage: (card, ctx) => {
          const base = orig.attackDamage(card, ctx);
          if (!card || !card.isNumberCard) return base;
          if (card.value === 0 || (card.value >= 4 && card.value <= 6)) return base + 1;
          return base;
        }
      }),
      4: orig => ({
        defendHeal: (card) => {
          const base = orig.defendHeal(card);
          return base > 0 ? base + 1 : 0;
        }
      })
    }
  });

  /**
   * Boss · 自由之鹰（CastleEagle）
   * HP 35。被动：进攻开始前对玩家施加1层流血。
   * 进攻：1/2/3 → 2/3/4伤；4/5/6 → 清除正面buff + 2不可防御；0 → 2层飞翔 + 4伤
   * 防御：1/2/3 → 反击1/2/3；0 → 免疫所有伤害
   */
  R.registerBoss({
    name: 'CastleEagle',
    kind: '自由之鹰',
    hp: 35,
    attack: 4,
    defense: 2,
    icon: '../icons/npc_icons/castle_eagle.png',
    firstStrike: true,

    attackTurnStart(eng) {
      if (!eng || !eng.s || !eng.s.player) return;
      eng.bleed(eng.s.player, 1);
    },

    attackDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value === 1) return 2;
      if (card.value === 2) return 3;
      if (card.value === 3) return 4;
      if (card.value >= 4 && card.value <= 6) return 2;
      if (card.value === 0) return 4;
      return 0;
    },

    attackUnblockable(card) {
      return !!(card && card.isNumberCard && card.value >= 4 && card.value <= 6);
    },

    attackClearPositive(card) {
      return !!(card && card.isNumberCard && card.value >= 4 && card.value <= 6);
    },

    attackFly(card) {
      if (!card || !card.isNumberCard) return 0;
      return card.value === 0 ? 2 : 0;
    },

    defendCounter(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value >= 1 && card.value <= 3) return card.value;
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
})();
