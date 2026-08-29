/**
 * 丛林场景 · 怪物定义
 * 所有怪物在 Stage 1-4 均可出现，按 stage 强化（累积叠加）：
 *   Stage 2：增加生命上限
 *   Stage 3：增加伤害
 *   Stage 4：加强防御
 */
(function () {
  const R = window.AdventureRegistry;
  if (!R) return;

  window.AdventureBossPool = window.AdventureBossPool || {};
  window.AdventureBossPool.forest = {
    '*': ['ForestPanda', 'ForestPython'],
    2: ['ForestPanda', 'ForestPython', 'ForestDryad'],
    3: ['ForestPanda', 'ForestPython', 'ForestDryad'],
    4: ['ForestPanda', 'ForestPython', 'ForestDryad']
  };

  window.AdventureMonsterPool = window.AdventureMonsterPool || {};
  window.AdventureMonsterPool.forest = {
    '*': ['ForestMonkey', 'ForestDeer', 'ForestCrocodile', 'ForestDendrobatidFrog', 'ForestLadybug', 'ForestCapybara', 'ForestRafflesia'],
    2: ['ForestMonkey', 'ForestDeer', 'ForestCrocodile', 'ForestDendrobatidFrog', 'ForestLadybug', 'ForestCapybara', 'ForestRafflesia'],
    3: ['ForestMonkey', 'ForestDeer', 'ForestCrocodile', 'ForestDendrobatidFrog', 'ForestLadybug', 'ForestCapybara', 'ForestRafflesia'],
    4: ['ForestMonkey', 'ForestDeer', 'ForestCrocodile', 'ForestDendrobatidFrog', 'ForestLadybug', 'ForestCapybara', 'ForestRafflesia']
  };

  // ===== 丛林猴 =====
  R.registerMonster({
    name: 'ForestMonkey',
    kind: '丛林猴',
    hp: 18,
    attack: 4,
    defense: 1,
    icon: '../icons/npc_icons/forest_monkey.png',
    attackDamage(card, ctx) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 4;
      if (v >= 4 && v <= 6) return 3;
      return 0;
    },
    attackHeal(card) {
      const v = card.value;
      if (v >= 4 && v <= 6) return 3;
      return 0;
    },
    defendHeal(card) {
      const v = card.value;
      if (v >= 1 && v <= 3) return v;
      return 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendHeal: (card) => orig.defendHeal(card) + 1 })
    }
  });

  // ===== 丛林鹿 =====
  R.registerMonster({
    name: 'ForestDeer',
    kind: '丛林鹿',
    hp: 20,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/forest_deer.png',
    attackDamage(card, ctx) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 3;
      if (v >= 4 && v <= 6) return 5;
      return 0;
    },
    attackGuard(card) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 1;
      return 0;
    },
    defendBlock(card, incoming) {
      const v = card.value;
      if (v >= 1 && v <= 3) return Math.min(2, incoming);
      return 0;
    },
    defendLush(card) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 1;
      return 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendBlock: (card, incoming) => orig.defendBlock(card, incoming) + 1 })
    }
  });

  // ===== 丛林鳄 =====
  R.registerMonster({
    name: 'ForestCrocodile',
    kind: '丛林鳄',
    hp: 20,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/forest_crocodile.png',
    attackDamage(card, ctx) {
      const v = card.value;
      if (v >= 1 && v <= 3) {
        const playerBleed = (ctx && ctx.playerBleed) || 0;
        return 1 + playerBleed * 2;
      }
      if (v >= 4 && v <= 6) return 2;
      return 0;
    },
    attackUnblockable(card) {
      const v = card.value;
      return v >= 4 && v <= 6;
    },
    attackBleed(card) {
      const v = card.value;
      if (v >= 4 && v <= 6) return 1;
      return 0;
    },
    defendBlock(card, incoming) {
      const v = card.value;
      if (v >= 1 && v <= 3) return Math.ceil(incoming / 2);
      return 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendBleed: () => 1 })
    }
  });

  // ===== 箭毒蛙 =====
  R.registerMonster({
    name: 'ForestDendrobatidFrog',
    kind: '箭毒蛙',
    hp: 18,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/forest_dendrobatid_frog.png',
    attackDamage(card, ctx) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 2;
      if (v >= 4 && v <= 6) return 3 + ((ctx && ctx.playerPoison) || 0);
      return 0;
    },
    attackPoison(card) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 1;
      return 0;
    },
    defendCounter(card) {
      const v = card.value;
      if (v >= 1 && v <= 3) return v;
      return 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendCounter: (card) => orig.defendCounter(card) + 1 })
    }
  });

  // ===== 丛林瓢虫 =====
  R.registerMonster({
    name: 'ForestLadybug',
    kind: '丛林瓢虫',
    hp: 18,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/forest_ladybug.png',
    initialLush: 1,
    attackDamage(card, ctx) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 1 + ((ctx && ctx.attackerLush) || 0);
      if (v >= 4 && v <= 6) return 4;
      return 0;
    },
    attackUnblockable(card) {
      return card.value >= 1 && card.value <= 3;
    },
    attackLush(card) {
      return card.value >= 4 && card.value <= 6 ? 1 : 0;
    },
    attackHeal(card, ctx) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 1 + ((ctx && ctx.attackerLush) || 0);
      return 0;
    },
    defendBlock(card, incoming) {
      const v = card.value;
      if (v >= 1 && v <= 3) return Math.min(2, incoming);
      return 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendBlock: (card, incoming) => Math.min(orig.defendBlock(card, incoming) + 1, incoming) })
    }
  });

  // ===== 森林水豚 =====
  R.registerMonster({
    name: 'ForestCapybara',
    kind: '森林水豚',
    hp: 20,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/forest_capybara.png',
    handLimit: 3,
    attackDamage(card) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 2;
      if (v >= 4 && v <= 6) return 4;
      return 0;
    },
    attackLush(card) {
      return card.value >= 4 && card.value <= 6 ? 1 : 0;
    },
    defendBlock(card, incoming) {
      const v = card.value;
      if (v >= 1 && v <= 3) return Math.max(0, incoming - 2);
      return 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendBlock: (card, incoming) => Math.max(0, incoming - 1) })
    }
  });

  // ===== 大王花 =====
  R.registerMonster({
    name: 'ForestRafflesia',
    kind: '大王花',
    hp: 15,
    attack: 0,
    defense: 3,
    icon: '../icons/npc_icons/forest_rafflesia.png',
    handLimit: 3,
    noAttack: true,
    canDefendHigh: true,
    attackSkipDescription: '跳过进攻阶段，玩家获得1层中毒',
    attackSkipEffect(eng, self, player) {
      eng.poison(player, 1);
      eng.emit('desc', self.name + '散发毒气，玩家获得1层中毒');
    },
    defendHeal(card) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 1;
      return 0;
    },
    defendGuard(card) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 1;
      return 0;
    },
    defendAllLush(card) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 1;
      return 0;
    },
    defendPoison(card) {
      const v = card.value;
      if (v >= 4 && v <= 6) return 1;
      return 0;
    },
    defendAllHeal(card) {
      const v = card.value;
      if (v >= 4 && v <= 6) return 3;
      return 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ defendAllHeal: (card) => orig.defendAllHeal(card) + 1 }),
      4: orig => ({ defendHeal: (card) => orig.defendHeal(card) + 1 })
    }
  });

  // ===== 丛林熊猫（Boss） =====
  R.registerBoss({
    name: 'ForestPanda',
    kind: '丛林熊猫',
    hp: 45,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/forest_panda.png',
    handLimit: 3,
    whiteZeros: 2,
    attackDamage(card, ctx) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 3;
      if (v >= 4 && v <= 6) return 2;
      if (v === 0) return 5;
      return 0;
    },
    attackUnblockable(card) {
      const v = card.value;
      return v >= 4 && v <= 6;
    },
    attackHeal(card) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 1;
      return 0;
    },
    attackGuard(card) {
      const v = card.value;
      if (v >= 4 && v <= 6) return 2;
      if (v === 0) return 1;
      return 0;
    },
    attackLush(card) {
      if (card.value === 0) return 1;
      return 0;
    },
    defendBlock(card, incoming, defender) {
      const v = card.value;
      if (v >= 1 && v <= 3) {
        let block = 2;
        if (defender && (defender.lush || 0) >= 2) block += 2;
        return block;
      }
      return 0;
    },
    defendImmune(card) {
      return card.value === 0;
    },
    defendImmuneBuff(card) {
      return card.value === 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 10 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendBlock: (card, incoming, defender) => orig.defendBlock(card, incoming, defender) + 1 })
    }
  });

  // ===== 蟒蛇（Boss） =====
  R.registerBoss({
    name: 'ForestPython',
    kind: '蟒蛇',
    hp: 35,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/forest_python.png',
    handLimit: 3,
    whiteZeros: 2,
    attackDamage(card, ctx) {
      const v = card.value;
      const poison = (ctx && ctx.playerPoison) || 0;
      if (v >= 1 && v <= 3) return v;
      if (v >= 4 && v <= 6) return 2 * (poison + 1);
      if (v === 0) return 2 * (poison + 1);
      return 0;
    },
    attackUnblockable(card) {
      return card.value === 0;
    },
    attackPoison(card) {
      const v = card.value;
      if (v >= 4 && v <= 6) return 1;
      if (v === 0) return 1;
      return 0;
    },
    attackDrawSelf(card) {
      return card.value >= 1 && card.value <= 3 ? 1 : 0;
    },
    defendCounter(card) {
      const v = card.value;
      if (v >= 1 && v <= 3) return Math.ceil(v / 2);
      return 0;
    },
    defendSplit(card) {
      return card.value === 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 10 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendCounter: (card) => orig.defendCounter(card) + 1 })
    }
  });

  // ===== 树精（Boss） =====
  R.registerBoss({
    name: 'ForestDryad',
    kind: '树精',
    hp: 50,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/dryad.png',
    handLimit: 3,
    whiteZeros: 2,
    attackDamage(card) {
      const v = card.value;
      if (v >= 1 && v <= 3) return v;
      if (v >= 4 && v <= 6) return 4;
      if (v === 0) return 6;
      return 0;
    },
    attackUnblockable(card) {
      return card.value >= 1 && card.value <= 3;
    },
    attackLush(card) {
      return card.value >= 1 && card.value <= 3 ? 1 : 0;
    },
    attackTransferDebuff(card) {
      return card.value >= 4 && card.value <= 6;
    },
    attackClearAllBuffs(card) {
      return card.value === 0;
    },
    defendBlock(card, incoming) {
      const v = card.value;
      if (v >= 1 && v <= 3) return Math.ceil(incoming / 2);
      return 0;
    },
    defendLush(card) {
      return card.value >= 1 && card.value <= 3 ? 1 : 0;
    },
    defendImmune(card) {
      return card.value === 0;
    },
    defendImmuneBuff(card) {
      return card.value === 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 10 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({ defendBlock: (card, incoming) => orig.defendBlock(card, incoming) + 1 })
    }
  });
})();
