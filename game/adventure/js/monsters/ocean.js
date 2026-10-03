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
  window.AdventureBossPool.ocean = window.AdventureBossPool.ocean || {
    '*': ['FrozenOrca', 'FrozenMammoth'],
    2: ['FrozenOrca', 'FrozenMammoth', 'FrozenKraken'],
    3: ['FrozenOrca', 'FrozenMammoth', 'FrozenKraken'],
    4: ['FrozenOrca', 'FrozenMammoth', 'FrozenKraken']
  };

  window.AdventureMonsterPool = window.AdventureMonsterPool || {};
  window.AdventureMonsterPool.ocean = {
    '*': ['FrozenOceanLynx', 'FrozenWhale', 'FrozenOceanSeal', 'FrozenPolarBear', 'FrozenOceanSnowyOwl', 'FrozenOceanSamoyed', 'FrozenOceanOctopus'],
    2: ['FrozenOceanLynx', 'FrozenWhale', 'FrozenOceanShark', 'FrozenOceanSeal', 'FrozenPolarBear', 'FrozenOceanSnowyOwl', 'FrozenOceanSamoyed', 'FrozenOceanTubeWorm', 'FrozenOceanOctopus'],
    3: ['FrozenOceanLynx', 'FrozenWhale', 'FrozenOceanShark', 'FrozenOceanSeal', 'FrozenPolarBear', 'FrozenOceanSnowyOwl', 'FrozenOceanSamoyed', 'FrozenOceanTubeWorm', 'FrozenOceanOctopus'],
    4: ['FrozenOceanLynx', 'FrozenWhale', 'FrozenOceanShark', 'FrozenOceanSeal', 'FrozenPolarBear', 'FrozenOceanSnowyOwl', 'FrozenOceanSamoyed', 'FrozenOceanTubeWorm', 'FrozenOceanOctopus']
  };

  // ===== 冻洋猞猁 =====
  R.registerMonster({
    name: 'FrozenOceanLynx',
    kind: '冻洋猞猁',
    hp: 20,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_lynx.webp',
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
    icon: '../icons/npc_icons/frozen_ocean_whale.webp',
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
    minStage: 2,
    hp: 27,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_shark.webp',
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

  // ===== 冻洋海豹 =====
  R.registerMonster({
    name: 'FrozenOceanSeal',
    kind: '冻洋海豹',
    hp: 20,
    attack: 3,
    defense: 1,
    icon: '../icons/npc_icons/frozen_ocean_seal.webp',
    // 进攻1/2/3：从牌堆抽一张牌展示，造成对应数字伤害，随后放入弃牌堆；魔法牌加入手牌
    attackRevealDraw(card) {
      const v = card.value;
      return v >= 1 && v <= 3;
    },
    attackDamage(card) {
      const v = card.value;
      if (v >= 4 && v <= 6) return 4;
      return 0;
    },
    // 进攻4/5/6：施加致盲
    attackBlind(card) {
      const v = card.value;
      return v >= 4 && v <= 6;
    },
    // 防御1/2：防止1/2（向上取整）点伤害
    defendBlock(card, incoming) {
      const v = card.value;
      if (v >= 1 && v <= 2) return Math.ceil((incoming || 0) / 2);
      return 0;
    },
    // 防御3：反击相同点伤害（使用守护/飞翔前的点数）
    defendCounter(card, incoming) {
      const v = card.value;
      if (v === 3) return incoming || 0;
      return 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackFreeze: () => true }),
      4: orig => ({
        defendBlock: (card, incoming) => {
          if (card.value === 3) return incoming || 0;
          return orig.defendBlock(card, incoming);
        }
      })
    }
  });

  // ===== 冻洋北极熊 =====
  R.registerMonster({
    name: 'FrozenPolarBear',
    kind: '冻洋北极熊',
    hp: 25,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_polar_bear.webp',
    // 进攻1/2/3：造成对手 buff 总层数点伤害
    attackDamage(card, ctx) {
      const v = card.value;
      if (v >= 1 && v <= 3) return ctx.playerBuffTotal || 0;
      if (v >= 4 && v <= 6) return 3;
      return 0;
    },
    // 进攻1/2/3：有暴击时消耗1层使攻击不可防御
    attackUseCrit(card) {
      const v = card.value;
      return v >= 1 && v <= 3;
    },
    // 进攻4/5/6：获得1层暴击
    attackGainCrit(card) {
      const v = card.value;
      return v >= 4 && v <= 6 ? 1 : 0;
    },
    // 进攻4/5/6：施加1层流血
    attackBleed(card) {
      const v = card.value;
      return v >= 4 && v <= 6 ? 1 : 0;
    },
    // 防御1/2/3：格挡2点
    defendBlock(card, incoming) {
      const v = card.value;
      if (v >= 1 && v <= 3) return Math.min(2, incoming);
      return 0;
    },
    // 防御1/2/3：施加1层失温
    defendHypothermia(card) {
      const v = card.value;
      return v >= 1 && v <= 3 ? 1 : 0;
    },
    // 防御1/2/3：施加1层流血
    defendBleed(card) {
      const v = card.value;
      return v >= 1 && v <= 3 ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({
        attackDamage: (card, ctx) => {
          const v = card.value;
          if (v >= 4 && v <= 6) return 4;
          return orig.attackDamage(card, ctx);
        },
        attackBleed: (card) => {
          const v = card.value;
          if (v >= 4 && v <= 6) return 2;
          return orig.attackBleed(card);
        }
      }),
      4: orig => ({
        defendBlock: (card, incoming) => {
          const base = orig.defendBlock(card, incoming);
          return base > 0 ? Math.min(base + 1, incoming) : 0;
        }
      })
    }
  });

  // ===== 冻洋虎鲸（Boss） =====
  // 进攻1/2/3：3伤害，获得潜水，防御结束后施加1层失温
  // 进攻4/5/6：5伤害，施加1层流血
  // 进攻0：2+2×对手[流血]层数伤害
  // 防御1/2/3：清除自身所有负面状态，格挡1/2（向上取整）
  // 防御0：反击相同伤害，清除自身所有负面状态（stage4 起额外免疫所有伤害）
  R.registerBoss({
    name: 'FrozenOrca',
    kind: '冻洋虎鲸',
    hp: 40,
    attack: 3,
    defense: 2,
    handLimit: 3,
    whiteZeros: 2,
    icon: '../icons/npc_icons/frozen_ocean_killer_whale.webp',
    attackDamage(card, ctx) {
      if (!card || !card.isNumberCard) return 0;
      const v = card.value;
      if (v >= 1 && v <= 3) return 3;
      if (v >= 4 && v <= 6) return 5;
      if (v === 0) return 2 + 2 * ((ctx && ctx.playerBleed) || 0);
      return 0;
    },
    // 进攻1/2/3：获得潜水（上限1）
    attackGainDiving(card) {
      return !!(card && card.isNumberCard && card.value >= 1 && card.value <= 3);
    },
    // 进攻1/2/3：防御阶段结束后施加1层失温
    attackHypothermia(card) {
      return (card && card.isNumberCard && card.value >= 1 && card.value <= 3) ? 1 : 0;
    },
    // 进攻4/5/6：施加1层流血
    attackBleed(card) {
      return (card && card.isNumberCard && card.value >= 4 && card.value <= 6) ? 1 : 0;
    },
    // 防御1/2/3：施加1层流血
    defendBleed(card) {
      return (card && card.isNumberCard && card.value >= 1 && card.value <= 3) ? 1 : 0;
    },
    // 防御0：清除自身所有负面状态（4/5/6 无防御效果）
    defendClearDebuffs(card) {
      const v = card && card.value;
      return !!(card && card.isNumberCard && v === 0);
    },
    // 防御1/2/3：格挡1/2（向上取整）点伤害
    defendBlock(card, incoming) {
      const v = card && card.value;
      return (v >= 1 && v <= 3) ? Math.ceil((incoming || 0) / 2) : 0;
    },
    // 防御0：反击相同伤害（守护/飞翔结算前的点数）
    defendCounter(card, incoming) {
      return (card && card.isNumberCard && card.value === 0) ? (incoming || 0) : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 10 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({
        // 防御0：额外免疫所有伤害（仍反击相同伤害并清除负面状态）
        defendImmune: card => !!(card && card.isNumberCard && card.value === 0)
      })
    }
  });

  // ===== 冻洋雪鸮 =====
  R.registerMonster({
    name: 'FrozenOceanSnowyOwl',
    kind: '冻洋雪鸮',
    hp: 24,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_snowy_owl.webp',
    attackDamage(card) {
      const v = card.value;
      if (v >= 1 && v <= 3) return 2;
      if (v >= 4 && v <= 6) return 4;
      return 0;
    },
    // 进攻1/2/3：获得1层飞翔
    attackFly(card) {
      const v = card.value;
      return v >= 1 && v <= 3 ? 1 : 0;
    },
    // 进攻6：玩家随机弃掉1个一次性道具
    attackStealItem(card) {
      return !!(card && card.isNumberCard && card.value === 6);
    },
    // 防御1/2/3：格挡2点
    defendBlock(card, incoming) {
      const v = card.value;
      if (v >= 1 && v <= 3) return Math.min(2, incoming);
      return 0;
    },
    // 防御1/2/3：施加1层失温
    defendHypothermia(card) {
      const v = card.value;
      return v >= 1 && v <= 3 ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
      3: orig => ({ attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1 }),
      4: orig => ({
        defendBlock: (card, incoming) => {
          const base = orig.defendBlock(card, incoming);
          return base > 0 ? Math.min(base + 1, incoming) : 0;
        }
      })
    }
  });

  // ===== 冻洋萨摩耶 =====
  // 被动：免疫失温与冷冻
  // 进攻1/2/3：造成对手手牌张数点伤害（Stage3 起不可防御）
  // 进攻4/5/6：5点伤害；玩家先弃1张手牌再防御（无手牌则不弃）
  // 防御1/2/3：反击 ceil(incoming/2)，恢复1点生命
  R.registerMonster({
    name: 'FrozenOceanSamoyed',
    kind: '冻洋萨摩耶',
    hp: 20,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_samoyed.webp',
    immuneFreeze: true,
    immuneHypothermia: true,
    attackDamage(card, ctx) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return ctx ? (ctx.playerHandSize || 0) : 0;
      if (v >= 4 && v <= 6) return 5;
      return 0;
    },
    attackUnblockable(card) {
      return false;
    },
    attackDiscardBeforeDefend(card) {
      const v = card && card.value;
      return !!(card && card.isNumberCard && v >= 4 && v <= 6);
    },
    defendCounter(card, incoming) {
      const v = card && card.value;
      if (!(v >= 1 && v <= 3)) return 0;
      return Math.ceil(Math.max(0, Number(incoming) || 0) / 2);
    },
    defendHeal(card) {
      const v = card && card.value;
      return (v >= 1 && v <= 3) ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({
        attackUnblockable(card) {
          const v = card && card.value;
          return !!(card && card.isNumberCard && v >= 1 && v <= 3);
        }
      }),
      4: orig => ({
        defendHeal(card) {
          const v = card && card.value;
          return (v >= 1 && v <= 3) ? 1 : 0;
        }
      })
    }
  });

  // ===== 冻洋管虫 =====
  // Stage2+；手牌上限3
  // 进攻1/2/3：造成1/2/3点伤害，施加1层灼伤
  // 进攻4/5/6：先施加2层灼伤，再对玩家进行一次灼伤结算（无卡面伤害）
  // 防御1/2/3：格挡至多2点，获得潜水
  // Stage3：进攻灼伤层数+1；Stage4：格挡+1
  R.registerMonster({
    name: 'FrozenOceanTubeWorm',
    kind: '冻洋管虫',
    minStage: 2,
    hp: 25,
    handLimit: 3,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_tube_worm.webp',
    attackDamage(card) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return v;
      return 0;
    },
    attackBurn(card) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return 1;
      if (v >= 4 && v <= 6) return 2;
      return 0;
    },
    attackBurnSettle(card) {
      const v = card && card.value;
      return !!(card && card.isNumberCard && v >= 4 && v <= 6);
    },
    defendBlock(card, incoming) {
      const v = card && card.value;
      if (v >= 1 && v <= 3) return Math.min(2, Math.max(0, Number(incoming) || 0));
      return 0;
    },
    defendGainDiving(card) {
      const v = card && card.value;
      return !!(card && card.isNumberCard && v >= 1 && v <= 3);
    },
    stageMods: {
      3: orig => ({
        attackBurn(card) {
          const base = orig.attackBurn(card) || 0;
          return base > 0 ? base + 1 : 0;
        }
      }),
      4: orig => ({
        defendBlock(card, incoming) {
          const base = orig.defendBlock(card, incoming);
          return base > 0 ? Math.min(base + 1, Math.max(0, Number(incoming) || 0)) : 0;
        }
      })
    }
  });

  // ===== 冻洋章鱼 =====
  // 进攻1/2/3：抽取玩家牌库1张牌判定；普通颜色3点伤害并放回玩家牌库底，黑/白牌（含战利白卡）5点伤害并置入玩家弃牌堆
  // 进攻4/5/6：4点伤害，获得潜水
  // 防御1/2/3：反击2点，恢复1点
  R.registerMonster({
    name: 'FrozenOceanOctopus',
    kind: '冻洋章鱼',
    hp: 24,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/frozen_ocean_octopus.webp',
    attackDamage(card) {
      const v = card && card.value;
      if (v >= 4 && v <= 6) return 4;
      return 0;
    },
    // 进攻1/2/3：抽取玩家牌库判定（桥接层结算伤害与判定牌去向）
    attackOctopusJudge(card) {
      const v = card && card.value;
      return !!(card && card.isNumberCard && v >= 1 && v <= 3);
    },
    // 判定伤害基数：黑/白牌5点，普通颜色3点（stage3 通过 stageMods +1）
    attackOctopusJudgeDamage(isBlackWhite) {
      return isBlackWhite ? 5 : 3;
    },
    // 进攻4/5/6：获得潜水（上限1）
    attackGainDiving(card) {
      const v = card && card.value;
      return !!(card && card.isNumberCard && v >= 4 && v <= 6);
    },
    // 防御1/2/3：反击2点
    defendCounter(card, incoming, defender, opponent) {
      const v = card && card.value;
      if (!(v >= 1 && v <= 3)) return 0;
      return 2;
    },
    // 防御1/2/3：恢复1点
    defendHeal(card) {
      const v = card && card.value;
      return (v >= 1 && v <= 3) ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
      3: orig => ({
        attackDamage: (card, ctx) => orig.attackDamage(card, ctx) + 1,
        attackOctopusJudgeDamage: (isBlackWhite) => orig.attackOctopusJudgeDamage(isBlackWhite) + 1
      }),
      4: orig => ({
        defendHeal(card) {
          const v = card && card.value;
          return (v >= 1 && v <= 3) ? 2 : 0;
        }
      })
    }
  });

  // ===== 克拉肯（Boss，Stage 2 起） =====
  // 进攻1/2/3：抽取玩家牌库1张牌判定；普通颜色造成对应数字伤害并放回玩家牌库底，数字零/道具牌0伤害并置入玩家弃牌堆、跳过防御、获得潜水、施加冰封
  // 进攻4/5/6：造成玩家手牌数点伤害，施加1层失温
  // 进攻0：施加1层失温，清除自身所有负面效果，造成3+清除层数点伤害（<5不可防御）
  // 防御1/2/3：反击1/2（向上取整）点伤害，获得潜水
  // 防御0：反击相同点数伤害，玩家选择1张手牌弃掉
  R.registerBoss({
    name: 'FrozenKraken',
    kind: '克拉肯',
    minStage: 2,
    hp: 50,
    attack: 3,
    defense: 2,
    handLimit: 3,
    whiteZeros: 2,
    icon: '../icons/npc_icons/kraken.webp',
    attackDamage(card, ctx) {
      if (!card || !card.isNumberCard) return 0;
      const v = card.value;
      if (v >= 4 && v <= 6) return ctx ? (ctx.playerHandSize || 0) : 0;
      return 0;
    },
    // 进攻1/2/3：抽取玩家牌库判定（桥接层结算伤害与判定牌去向）
    attackKrakenJudge(card) {
      const v = card && card.value;
      return !!(card && card.isNumberCard && v >= 1 && v <= 3);
    },
    // 进攻0：净化爆发（桥接层计数清除层数、结算伤害与不可防御）
    attackKrakenPurge(card) {
      const v = card && card.value;
      return !!(card && card.isNumberCard && v === 0);
    },
    // 伤害<5时不可防御的阈值（0牌常驻；stage3 起覆盖为全牌适用）
    attackUnblockableBelow(card) {
      const v = card && card.value;
      return (card && card.isNumberCard && v === 0) ? 5 : 0;
    },
    // 进攻4/5/6：施加1层失温
    attackHypothermia(card) {
      const v = card && card.value;
      return (v >= 4 && v <= 6) ? 1 : 0;
    },
    // 防御1/2/3：反击1/2（向上取整）；防御0：反击相同点数伤害（守护/飞翔结算前）
    defendCounter(card, incoming) {
      const v = card && card.value;
      if (!card || !card.isNumberCard) return 0;
      if (v === 0) return Math.max(0, Number(incoming) || 0);
      if (v >= 1 && v <= 3) return Math.ceil(Math.max(0, Number(incoming) || 0) / 2);
      return 0;
    },
    // 防御1/2/3：获得潜水
    defendGainDiving(card) {
      const v = card && card.value;
      return !!(card && card.isNumberCard && v >= 1 && v <= 3);
    },
    // 防御0：玩家选择1张手牌弃掉（桥接层在反击后打开弃牌选择）
    defendPlayerDiscard(card) {
      const v = card && card.value;
      return !!(card && card.isNumberCard && v === 0);
    },
    stageMods: {
      3: orig => ({
        attackUnblockableBelow: () => 5
      }),
      4: orig => ({
        defendHeal(card) {
          const v = card && card.value;
          return (v === 0 || (v >= 1 && v <= 3)) ? 1 : 0;
        }
      })
    }
  });
  // ===== 冻洋猛犸（Boss） =====
  // 0 牌先施加失温/获得守护再结算伤害，其他进攻先伤害后施加效果。
  R.registerBoss({
    name: 'FrozenMammoth',
    kind: '冻洋猛犸',
    hp: 45,
    attack: 2,
    defense: 2,
    handLimit: 3,
    whiteZeros: 2,
    icon: '../icons/npc_icons/frozen_ocean_wooli.webp',
    attackDamage(card, ctx) {
      if (!card || !card.isNumberCard) return 0;
      const v = card.value;
      if (v >= 1 && v <= 3) return 2;
      if (v >= 4 && v <= 6) return 3 + Math.max(0, Number(ctx && ctx.playerBleed) || 0);
      return v === 0 ? 3 : 0;
    },
    attackEffectTiming(value) { return value === 0 ? 'beforeDamage' : 'afterDamage'; },
    attackGuard(card) {
      if (!card || !card.isNumberCard) return 0;
      return card.value === 0 ? 4 : card.value >= 1 && card.value <= 3 ? 2 : 0;
    },
    attackBleed(card) {
      return card && card.isNumberCard && card.value >= 1 && card.value <= 3 ? card.value : 0;
    },
    attackHypothermia(card) {
      return card && card.isNumberCard && (card.value === 0 || card.value >= 4 && card.value <= 6) ? 1 : 0;
    },
    attackUnblockable(card) { return !!(card && card.isNumberCard && card.value === 0); },
    defendBlock(card, incoming) {
      return card && card.isNumberCard && card.value >= 1 && card.value <= 3
        ? Math.ceil(Math.max(0, Number(incoming) || 0) / 2) : 0;
    },
    defendImmune(card) { return !!(card && card.isNumberCard && card.value === 0); },
    defendGuard(card) { return card && card.isNumberCard && card.value === 0 ? 2 : 0; },
    defendBleed(card) {
      if (!card || !card.isNumberCard) return 0;
      return card.value === 0 ? 2 : card.value >= 1 && card.value <= 3 ? 1 : 0;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 10 }),
      3: orig => ({
        attackDamage(card, ctx) {
          const damage = orig.attackDamage(card, ctx);
          return damage > 0 ? damage + 1 : 0;
        }
      }),
      4: orig => ({
        defendBleed(card) {
          const stacks = orig.defendBleed(card);
          return stacks > 0 ? stacks + 1 : 0;
        }
      })
    }
  });
})();
