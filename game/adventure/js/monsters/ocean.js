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
  window.AdventureBossPool.ocean = window.AdventureBossPool.ocean || {
    '*': ['FrozenOrca', 'FrozenMammoth'],
    2: ['FrozenOrca', 'FrozenMammoth'],
    3: ['FrozenOrca', 'FrozenMammoth', 'FrozenKraken'],
    4: ['FrozenOrca', 'FrozenMammoth', 'FrozenKraken']
  };

  window.AdventureMonsterPool = window.AdventureMonsterPool || {};
  window.AdventureMonsterPool.ocean = {
    '*': ['FrozenOceanLynx', 'FrozenWhale', 'FrozenOceanSeal', 'FrozenPolarBear', 'FrozenOceanSnowyOwl', 'FrozenOceanSamoyed'],
    2: ['FrozenOceanLynx', 'FrozenWhale', 'FrozenOceanSeal', 'FrozenPolarBear', 'FrozenOceanSnowyOwl', 'FrozenOceanSamoyed'],
    3: ['FrozenOceanLynx', 'FrozenWhale', 'FrozenOceanSeal', 'FrozenPolarBear', 'FrozenOceanSnowyOwl', 'FrozenOceanSamoyed'],
    4: ['FrozenOceanLynx', 'FrozenWhale', 'FrozenOceanSeal', 'FrozenPolarBear', 'FrozenOceanSnowyOwl', 'FrozenOceanSamoyed']
  };

  window.AdventureElitePool = window.AdventureElitePool || {};
  window.AdventureElitePool.ocean = {
    3: ['FrozenOceanOctopus', 'FrozenOceanShark', 'FrozenOceanTubeWorm'],
    4: ['FrozenOceanOctopus', 'FrozenOceanShark', 'FrozenOceanTubeWorm']
  };

  R.registerMonster({
    name: 'FrozenOceanLynx',
    kind: '霜爪猞猁',
    hp: 18,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_lynx.webp',
    attackDamage(card) {
      if (isLow(card)) return 3;
      if (isHigh(card)) return 5;
      return 0;
    },
    attackFreeze(card) {
      return isLow(card);
    },
    attackIceSeal(card) {
      return isHigh(card);
    },
    defendBlock(card, incoming) {
      return isLow(card) ? Math.min(2, incoming) : 0;
    },
    defendCounter(card, incoming, defender, opponent) {
      if (!isLow(card)) return 0;
      if (opponent != null && !opponent.frozen) return 0;
      return 2;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
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

  R.registerMonster({
    name: 'FrozenWhale',
    kind: '破冰蓝鲸',
    hp: 20,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_whale.webp',
    attackDamage(card) {
      if (isLow(card)) return 2;
      if (isHigh(card)) return 4;
      return 0;
    },
    attackGainDiving(card) {
      return isLow(card);
    },
    attackAoEOtherChars(card) {
      return isHigh(card) ? 4 : 0;
    },
    attackUnblockable(card) {
      return isHigh(card);
    },
    attackHypothermia(card) {
      return isHigh(card) ? 1 : 0;
    },
    defendCounter(card, incoming, defender, opponent) {
      return isLow(card) ? 2 : 0;
    },
    defendGuard(card) {
      return isLow(card) ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({
        defendCounter: (card, incoming, defender, opponent) => {
          const base = orig.defendCounter(card, incoming, defender, opponent);
          return base > 0 ? base + 1 : 0;
        }
      })
    }
  });

  R.registerMonster({
    name: 'FrozenOceanShark',
    kind: '裂冰鲨',
    minStage: 3,
    hp: 27,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_shark.webp',
    attackDamage(card, ctx) {
      const bleed = (ctx && ctx.playerBleed) || 0;
      if (isLow(card)) return 2 * bleed;
      if (isHigh(card)) return 3;
      return 0;
    },
    attackUnblockable(card) {
      return isHigh(card);
    },
    attackBleed(card) {
      return isHigh(card) ? 1 : 0;
    },
    defendCounter(card, incoming, defender, opponent) {
      return isLow(card) ? 2 : 0;
    },
    defendBleed(card) {
      return isLow(card) ? 2 : 0;
    },
    stageMods: {
      4: orig => ({
        defendBlock(card, incoming) {
          if (!isLow(card)) return 0;
          return Math.min(2, Math.max(0, Number(incoming) || 0));
        }
      })
    }
  });

  R.registerMonster({
    name: 'FrozenOceanSeal',
    kind: '冰原海豹',
    hp: 18,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/frozen_ocean_seal.webp',
    attackRevealDraw(card) {
      return isLow(card);
    },
    attackRevealDrawBonus() {
      return 2;
    },
    attackDamage(card) {
      return isHigh(card) ? 5 : 0;
    },
    attackBlind(card) {
      return isHigh(card);
    },
    defendBlock(card, incoming) {
      if (!card || !card.isNumberCard || card.value !== 1) return 0;
      return Math.ceil((incoming || 0) / 2);
    },
    defendCounter(card, incoming) {
      if (!card || !card.isNumberCard || card.value !== 2) return 0;
      return incoming || 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
      3: orig => ({ attackFreeze: () => true }),
      4: orig => ({
        defendImmune(card) {
          return !!(card && card.isNumberCard && card.value === 2);
        },
        defendCounter(card, incoming) {
          if (card && card.isNumberCard && card.value === 2) return incoming || 0;
          return orig.defendCounter(card, incoming);
        },
        defendBlock(card, incoming) {
          if (card && card.isNumberCard && card.value === 2) return 0;
          return orig.defendBlock(card, incoming);
        }
      })
    }
  });

  R.registerMonster({
    name: 'FrozenPolarBear',
    kind: '雪崩熊',
    hp: 20,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_polar_bear.webp',
    firstStrike: true,
    attackDamage(card, ctx) {
      if (isLow(card)) return (ctx && ctx.playerBuffTotal) || 0;
      if (isHigh(card)) return 4;
      return 0;
    },
    attackGainCrit(card) {
      return isHigh(card) ? 1 : 0;
    },
    attackBleed(card) {
      return isHigh(card) ? 1 : 0;
    },
    defendBlock(card, incoming) {
      return isLow(card) ? Math.min(2, incoming) : 0;
    },
    defendHypothermia(card) {
      return isLow(card) ? 1 : 0;
    },
    defendBleed(card) {
      return isLow(card) ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({
        attackBleed: (card) => (isHigh(card) ? 2 : orig.attackBleed(card))
      }),
      4: orig => ({
        defendBlock: (card, incoming) => {
          const base = orig.defendBlock(card, incoming);
          return base > 0 ? Math.min(base + 1, incoming) : 0;
        }
      })
    }
  });

  R.registerBoss({
    name: 'FrozenOrca',
    kind: '破浪虎鲸',
    hp: 35,
    attack: 3,
    defense: 2,
    handLimit: 3,
    whiteZeros: 2,
    icon: '../icons/npc_icons/frozen_ocean_killer_whale.webp',
    attackDamage(card, ctx) {
      if (!card || !card.isNumberCard) return 0;
      if (isLow(card)) return 3;
      if (isHigh(card)) return 5;
      if (isZero(card)) {
        return 2 + 2 * Math.min(3, Number(ctx && ctx.playerBleed) || 0);
      }
      return 0;
    },
    attackGainDiving(card) {
      return isLow(card);
    },
    attackHypothermia(card) {
      return isLow(card) ? 1 : 0;
    },
    attackBleed(card) {
      if (!card || !card.isNumberCard) return 0;
      return (isZero(card) || isHigh(card)) ? 1 : 0;
    },
    defendBleed(card) {
      return isLow(card) ? 1 : 0;
    },
    defendClearDebuffs(card) {
      return isZero(card);
    },
    defendBlock(card, incoming) {
      return isLow(card) ? Math.ceil((incoming || 0) / 2) : 0;
    },
    defendCounter(card, incoming) {
      return isZero(card) ? (incoming || 0) : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({
        defendImmune: card => isZero(card)
      })
    }
  });

  R.registerMonster({
    name: 'FrozenOceanSnowyOwl',
    kind: '月影雪鸮',
    hp: 20,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_snowy_owl.webp',
    attackDamage(card) {
      if (isLow(card)) return 3;
      if (isHigh(card)) return 5;
      return 0;
    },
    attackFly(card) {
      return isLow(card) ? 1 : 0;
    },
    attackStealItem(card) {
      return !!(card && card.isNumberCard && card.value === 4);
    },
    defendBlock(card, incoming) {
      return isLow(card) ? Math.min(2, incoming) : 0;
    },
    defendHypothermia(card) {
      return isLow(card) ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({
        defendBlock: (card, incoming) => {
          const base = orig.defendBlock(card, incoming);
          return base > 0 ? Math.min(base + 1, incoming) : 0;
        }
      })
    }
  });

  R.registerMonster({
    name: 'FrozenOceanSamoyed',
    kind: '暖绒萨摩',
    hp: 18,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_samoyed.webp',
    immuneFreeze: true,
    immuneHypothermia: true,
    attackDamage(card, ctx) {
      if (isLow(card)) return ctx ? (ctx.playerHandSize || 0) : 0;
      if (isHigh(card)) return 5;
      return 0;
    },
    attackUnblockable(card) {
      return false;
    },
    attackDiscardBeforeDefend(card) {
      return isHigh(card);
    },
    defendCounter(card, incoming) {
      if (!isLow(card)) return 0;
      return Math.ceil(Math.max(0, Number(incoming) || 0) / 2);
    },
    defendHeal(card) {
      return isLow(card) ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
      3: orig => ({
        attackUnblockable(card) {
          return isLow(card);
        }
      }),
      4: orig => ({
        defendHeal(card) {
          return isLow(card) ? 2 : 0;
        }
      })
    }
  });

  R.registerMonster({
    name: 'FrozenOceanTubeWorm',
    kind: '热泉管虫',
    minStage: 3,
    hp: 25,
    handLimit: 3,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_tube_worm.webp',
    attackDamage(card) {
      if (!isLow(card)) return 0;
      return card.value;
    },
    attackBurn(card) {
      if (isLow(card) || isHigh(card)) return 2;
      return 0;
    },
    attackScorch(card) {
      return isHigh(card);
    },
    attackBurnSettle(card) {
      return isHigh(card);
    },
    defendBlock(card, incoming) {
      return isLow(card) ? Math.min(2, Math.max(0, Number(incoming) || 0)) : 0;
    },
    defendGainDiving(card) {
      return isLow(card);
    },
    stageMods: {
      4: orig => ({
        defendCounter(card, incoming, defender, opponent) {
          return isLow(card) ? 2 : 0;
        }
      })
    }
  });

  R.registerMonster({
    name: 'FrozenOceanOctopus',
    kind: '墨潮章鱼',
    hp: 25,
    minStage: 3,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_octopus.webp',
    attackDamage(card) {
      return isHigh(card) ? 6 : 0;
    },
    attackOctopusJudge(card) {
      return isLow(card);
    },
    attackOctopusJudgeDamage(isBlackWhite) {
      return isBlackWhite ? 5 : 4;
    },
    attackGainDiving(card) {
      return isHigh(card);
    },
    defendCounter(card, incoming, defender, opponent) {
      return isLow(card) ? 2 : 0;
    },
    defendHeal(card) {
      return isLow(card) ? 1 : 0;
    },
    stageMods: {
      4: orig => ({
        defendHeal(card) {
          return isLow(card) ? 3 : 0;
        }
      })
    }
  });

  R.registerBoss({
    name: 'FrozenKraken',
    kind: '克拉肯',
    minStage: 3,
    hp: 40,
    attack: 3,
    defense: 2,
    handLimit: 3,
    whiteZeros: 2,
    icon: '../icons/npc_icons/kraken.webp',
    attackDamage(card, ctx) {
      if (!card || !card.isNumberCard) return 0;
      if (isHigh(card)) return ctx ? (ctx.playerHandSize || 0) : 0;
      return 0;
    },
    attackKrakenJudge(card) {
      return isLow(card);
    },
    attackKrakenPurge(card) {
      return isZero(card);
    },
    attackUnblockableBelow(card) {
      return isZero(card) ? 5 : 0;
    },
    attackHypothermia(card) {
      return isHigh(card) ? 1 : 0;
    },
    attackGainCrit(card) {
      return isHigh(card) ? 1 : 0;
    },
    defendCounter(card, incoming) {
      if (!card || !card.isNumberCard) return 0;
      if (isZero(card)) return Math.max(0, Number(incoming) || 0);
      if (isLow(card)) return Math.ceil(Math.max(0, Number(incoming) || 0) / 2);
      return 0;
    },
    defendGainDiving(card) {
      return isLow(card);
    },
    defendPlayerDiscard(card) {
      return isZero(card);
    },
    stageMods: {
      4: orig => ({
        defendHeal(card) {
          if (isZero(card) || isLow(card)) return 1;
          return 0;
        }
      })
    }
  });

  R.registerBoss({
    name: 'FrozenMammoth',
    kind: '长牙猛犸',
    hp: 35,
    attack: 2,
    defense: 2,
    handLimit: 3,
    whiteZeros: 2,
    icon: '../icons/npc_icons/frozen_ocean_wooli.webp',
    attackDamage(card, ctx) {
      if (!card || !card.isNumberCard) return 0;
      if (isLow(card)) return 2;
      if (isHigh(card)) return 3 + Math.max(0, Number(ctx && ctx.playerBleed) || 0);
      if (isZero(card)) return 3;
      return 0;
    },
    attackEffectTiming(value) {
      return value === 0 ? 'beforeDamage' : 'afterDamage';
    },
    attackGuard(card) {
      return isZero(card) ? 4 : 0;
    },
    attackBleed(card) {
      if (!card || !card.isNumberCard) return 0;
      if (isLow(card)) return card.value;
      return 0;
    },
    attackHypothermia(card) {
      if (!card || !card.isNumberCard) return 0;
      return isZero(card) || isHigh(card) ? 1 : 0;
    },
    attackUnblockable(card) {
      return isZero(card);
    },
    defendBlock(card, incoming) {
      return isLow(card) ? Math.ceil(Math.max(0, Number(incoming) || 0) / 2) : 0;
    },
    defendImmune(card) {
      return isZero(card);
    },
    defendGuard(card) {
      return isZero(card) ? 2 : 0;
    },
    defendBleed(card) {
      if (!card || !card.isNumberCard) return 0;
      if (isZero(card)) return 2;
      if (isLow(card)) return 1;
      return 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({
        attackDamage(card, ctx) {
          const damage = orig.attackDamage(card, ctx);
          return damage > 0 ? damage + 1 : 0;
        }
      }),
      4: orig => ({
        defendHeal(card) {
          if (isZero(card) || isLow(card)) return 1;
          return 0;
        }
      })
    }
  });
})();