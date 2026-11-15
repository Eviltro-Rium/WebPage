/**
 * 丛林场景 · 怪物定义
 * 普通怪物按 stage 强化（累积叠加）；精英怪仅在 Stage 3/4 精英房出现：
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
  function isZero(card) {
    return !!(card && card.isNumberCard && card.value === 0);
  }

  window.AdventureBossPool = window.AdventureBossPool || {};
  window.AdventureBossPool.forest = {
    '*': ['ForestPanda', 'ForestPython'],
    2: ['ForestPanda', 'ForestPython', 'ForestDryad'],
    3: ['ForestPanda', 'ForestPython', 'ForestDryad'],
    4: ['ForestPanda', 'ForestPython', 'ForestDryad']
  };

  window.AdventureMonsterPool = window.AdventureMonsterPool || {};
  window.AdventureMonsterPool.forest = {
    '*': ['ForestMonkey', 'ForestDeer', 'ForestCrocodile', 'ForestLadybug', 'ForestRafflesia', 'ForestLeech']
  };
  window.AdventureElitePool = window.AdventureElitePool || {};
  window.AdventureElitePool.forest = {
    3: ['ForestDendrobatidFrog', 'ForestCapybara', 'ForestPiranha'],
    4: ['ForestDendrobatidFrog', 'ForestCapybara', 'ForestPiranha']
  };

  // ===== 藤噪顽猴 =====
  R.registerMonster({
    name: 'ForestMonkey',
    kind: '藤噪顽猴',
    hp: 15,
    attack: 4,
    defense: 1,
    icon: '../icons/npc_icons/forest_monkey.webp',
    attackDamage(card, ctx) {
      if (isLow(card)) return 4;
      if (isHigh(card)) return 3;
      return 0;
    },
    attackHeal(card) {
      return isHigh(card) ? 3 : 0;
    },
    defendHeal(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value === 1) return 1;
      if (card.value === 2) return 2;
      return 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendHeal: (card) => orig.defendHeal(card) + 1 })
    }
  });

  // ===== 翠影鹿 =====
  R.registerMonster({
    name: 'ForestDeer',
    kind: '翠影鹿',
    hp: 18,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/forest_deer.webp',
    firstStrike: true,
    attackDamage(card, ctx) {
      if (isLow(card)) return 3;
      if (isHigh(card)) return 5;
      return 0;
    },
    attackGuard(card) {
      return isLow(card) ? 1 : 0;
    },
    defendBlock(card, incoming) {
      return isLow(card) ? Math.min(2, incoming) : 0;
    },
    defendLush(card) {
      return isLow(card) ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendBlock: (card, incoming) => orig.defendBlock(card, incoming) + 1 })
    }
  });

  // ===== 血沼蛭 =====
  R.registerMonster({
    name: 'ForestLeech',
    kind: '血沼蛭',
    hp: 15,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/forest_leech.webp',
    attackDamage(card) {
      return isLow(card) ? 3 : 0;
    },
    attackBleed(card) {
      return isLow(card) ? 1 : 0;
    },
    attackDrain(card) {
      return isHigh(card) ? 3 : 0;
    },
    defendHeal(card) {
      return isLow(card) ? 2 : 0;
    },
    defendParasite(card) {
      return isLow(card) ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({
        attackDamage: (card, ctx) => {
          const base = orig.attackDamage(card, ctx);
          return base > 0 ? base + 1 : 0;
        },
        attackDrain: (card, ctx) => {
          const base = orig.attackDrain(card, ctx);
          return base > 0 ? base + 1 : 0;
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

  // ===== 暗潭鳄 =====
  R.registerMonster({
    name: 'ForestCrocodile',
    kind: '暗潭鳄',
    hp: 18,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/forest_crocodile.webp',
    attackDamage(card, ctx) {
      if (isLow(card)) {
        const playerBleed = (ctx && ctx.playerBleed) || 0;
        return 1 + playerBleed * 2;
      }
      if (isHigh(card)) return 4;
      return 0;
    },
    attackUnblockable(card) {
      return isHigh(card);
    },
    attackBleed(card) {
      return isHigh(card) ? 1 : 0;
    },
    defendBlock(card, incoming) {
      return isLow(card) ? Math.ceil(incoming / 2) : 0;
    },
    defendBleed(card) {
      return isLow(card) ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendBleed: (card) => (isLow(card) ? 2 : 0) })
    }
  });

  // ===== 箭毒蛙 =====
  R.registerMonster({
    name: 'ForestDendrobatidFrog',
    kind: '箭毒蛙',
    hp: 25,
    minStage: 3,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/forest_dendrobatid_frog.webp',
    attackDamage(card, ctx) {
      if (isLow(card)) return 4;
      if (isHigh(card)) return 4 + ((ctx && ctx.playerPoison) || 0);
      return 0;
    },
    attackPoison(card) {
      return isLow(card) ? 1 : 0;
    },
    defendCounter(card, incoming) {
      if (!isLow(card)) return 0;
      if (card.value === 1) return 1;
      if (card.value === 2) return 2;
      return 0;
    },
    defendPoison(card) {
      return isLow(card) ? 1 : 0;
    },
    stageMods: {
      4: () => ({ defendHeal: card => (isLow(card) ? 2 : 0) })
    }
  });

  // ===== 斑甲瓢虫 =====
  R.registerMonster({
    name: 'ForestLadybug',
    kind: '斑甲瓢虫',
    hp: 15,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/forest_ladybug.webp',
    initialLush: 1,
    attackDamage(card, ctx) {
      if (isLow(card)) return 1 + ((ctx && ctx.attackerLush) || 0);
      if (isHigh(card)) return 4;
      return 0;
    },
    attackUnblockable(card) {
      return isLow(card);
    },
    attackLush(card) {
      return isHigh(card) ? 1 : 0;
    },
    attackDrain(card, ctx) {
      if (!isLow(card)) return 0;
      return 1 + ((ctx && ctx.attackerLush) || 0);
    },
    defendBlock(card, incoming) {
      return isLow(card) ? Math.min(2, incoming) : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({
        attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1,
        attackDrain: (card, ctx) => {
          const base = orig.attackDrain(card, ctx);
          return base > 0 ? base + 1 : 0;
        }
      }),
      4: orig => ({ defendBlock: (card, incoming) => Math.min(orig.defendBlock(card, incoming) + 1, incoming) })
    }
  });

  // ===== 静河水豚 =====
  R.registerMonster({
    name: 'ForestCapybara',
    kind: '静河水豚',
    hp: 27,
    minStage: 3,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/forest_capybara.webp',
    handLimit: 3,
    attackDamage(card) {
      if (isLow(card)) return 2;
      if (isHigh(card)) return 4;
      return 0;
    },
    attackLush(card) {
      return isHigh(card) ? 1 : 0;
    },
    defendBlock(card, incoming) {
      return isLow(card) ? Math.max(0, incoming - 2) : 0;
    },
    stageMods: {
      4: () => ({ defendBlock: (card, incoming) => (isLow(card) ? Math.max(0, incoming - 1) : 0) })
    }
  });

  // ===== 大王花 =====
  R.registerMonster({
    name: 'ForestRafflesia',
    kind: '大王花',
    hp: 15,
    attack: 0,
    defense: 3,
    icon: '../icons/npc_icons/forest_rafflesia.webp',
    handLimit: 3,
    noAttack: true,
    canDefendHigh: true,
    attackSkipDescription: '跳过进攻阶段，玩家获得1层中毒',
    attackSkipEffect(eng, self, player) {
      eng.poison(player, 1);
      eng.emit('desc', self.name + '散发毒气，玩家获得1层中毒');
    },
    defendHeal(card) {
      return isLow(card) ? 1 : 0;
    },
    defendGuard(card) {
      return isLow(card) ? 1 : 0;
    },
    defendLush(card) {
      return isLow(card) ? 1 : 0;
    },
    defendPoison(card) {
      return isHigh(card) ? 1 : 0;
    },
    defendAllHeal(card) {
      return isHigh(card) ? 3 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({
        defendAllHeal: (card) => {
          const base = orig.defendAllHeal(card);
          return base > 0 ? base + 1 : 0;
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

  // ===== 食人鱼 =====
  R.registerMonster({
    name: 'ForestPiranha',
    kind: '食人鱼',
    minStage: 3,
    hp: 25,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/forest_piranha.webp',
    attackDamage(card, ctx) {
      if (isLow(card)) return ((ctx && ctx.playerBleed) || 0) * 2;
      if (isHigh(card)) return 4;
      return 0;
    },
    attackUnblockable(card) {
      return isHigh(card);
    },
    attackBleed(card) {
      return isHigh(card) ? 1 : 0;
    },
    defendCounter(card, incoming) {
      return isLow(card) ? Math.ceil((incoming || 0) / 2) : 0;
    },
    defendBleed(card) {
      return isLow(card) ? 1 : 0;
    },
    stageMods: {
      4: () => ({
        defendHeal: card => (isLow(card) ? 1 : 0),
        defendBleed: card => (isLow(card) ? 2 : 0)
      })
    }
  });

  // ===== 竹坞熊猫（Boss） =====
  R.registerBoss({
    name: 'ForestPanda',
    kind: '竹坞熊猫',
    hp: 35,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/forest_panda.webp',
    handLimit: 3,
    whiteZeros: 2,
    attackDamage(card, ctx) {
      if (isLow(card)) return 3;
      if (isHigh(card)) return 2;
      if (isZero(card)) return 5;
      return 0;
    },
    attackUnblockable(card) {
      return isHigh(card);
    },
    attackHeal(card) {
      return isLow(card) ? 1 : 0;
    },
    attackGuard(card) {
      if (isHigh(card)) return 2;
      if (isZero(card)) return 1;
      return 0;
    },
    attackLush(card) {
      return isZero(card) ? 1 : 0;
    },
    defendBlock(card, incoming, defender) {
      if (!isLow(card)) return 0;
      let block = 2;
      if (defender && (defender.lush || 0) >= 2) block += 2;
      return block;
    },
    defendImmune(card) {
      return isZero(card);
    },
    defendImmuneBuff(card) {
      return isZero(card);
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendBlock: (card, incoming, defender) => orig.defendBlock(card, incoming, defender) + 1 })
    }
  });

  // ===== 缠枝巨蟒（Boss） =====
  R.registerBoss({
    name: 'ForestPython',
    kind: '缠枝巨蟒',
    hp: 30,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/forest_python.webp',
    handLimit: 3,
    whiteZeros: 2,
    attackDamage(card, ctx) {
      const poison = Number(ctx && ctx.playerPoison) || 0;
      if (isLow(card)) return 2;
      if (isHigh(card) || isZero(card)) return 3 * Math.min(2, poison);
      return 0;
    },
    attackUnblockable(card) {
      return isZero(card);
    },
    attackPoison(card) {
      return (isHigh(card) || isZero(card)) ? 1 : 0;
    },
    attackDrawSelf(card, ctx) {
      if (!isLow(card)) return 0;
      const poison = (ctx && ctx.playerPoison) || 0;
      return poison === 1 ? 1 : 0;
    },
    defendCounter(card, incoming) {
      if (!isLow(card)) return 0;
      return Math.ceil((Number(incoming) || 0) / 2);
    },
    defendPoison(card) {
      if (isLow(card) || isZero(card)) return 1;
      return 0;
    },
    defendSplit(card) {
      return isZero(card);
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 10 }),
      3: orig => ({
        attackDamage: (card, ctx) => {
          const base = orig.attackDamage(card, ctx);
          if (isLow(card) || isZero(card)) return base + 1;
          return base;
        }
      }),
      4: () => ({ defendHeal: card => (isLow(card) || isZero(card) ? 1 : 0) })
    }
  });

  // ===== 树精（Boss） =====
  R.registerBoss({
    name: 'ForestDryad',
    kind: '树精',
    minStage: 2,
    hp: 40,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/dryad.webp',
    handLimit: 3,
    whiteZeros: 2,
    attackDamage(card) {
      if (isLow(card)) return 2;
      if (isHigh(card)) return 4;
      if (isZero(card)) return 6;
      return 0;
    },
    attackUnblockable(card) {
      return isLow(card);
    },
    attackLush(card) {
      return isLow(card) ? 1 : 0;
    },
    attackTransferDebuff(card) {
      return isHigh(card);
    },
    attackClearAllBuffs(card) {
      return isZero(card);
    },
    defendBlock(card, incoming) {
      return isLow(card) ? Math.ceil(incoming / 2) : 0;
    },
    defendLush(card) {
      return isLow(card) ? 1 : 0;
    },
    defendImmune(card) {
      return isZero(card);
    },
    defendImmuneBuff(card) {
      return isZero(card);
    },
    stageMods: {
      4: () => ({ defendCounter: card => (isLow(card) || isZero(card) ? 1 : 0) })
    }
  });
})();