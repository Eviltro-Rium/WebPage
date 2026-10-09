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
  // 法老仅从 Stage 2 起出现；Stage 1 无沙漠专属 Boss，沿用引擎全局兜底。
  window.AdventureBossPool.desert = {
    2: ['Pharaoh', 'DesertHyena', 'DesertSobek'],
    3: ['Pharaoh', 'DesertHyena', 'DesertSobek'],
    4: ['Pharaoh', 'DesertHyena', 'DesertSobek']
  };

  window.AdventureMonsterPool = window.AdventureMonsterPool || {};
  window.AdventureMonsterPool.desert = { '*': ['DesertBison', 'DesertCamel', 'DesertLizard', 'DesertSandworm', 'DesertScarab', 'DesertScorpion', 'DesertViper', 'DesertAntlion', 'DesertVulture'] };

  // ===== 沙暴蛮牛 =====
  // 进攻1/2/3：造成2×玩家[流血]层数伤害
  // 进攻4/5/6：2点不可防御伤害，施加1层流血，获得1层暴击
  // 防御1/2/3：反击卡面点数伤害，施加1层流血
  R.registerMonster({
    name: 'DesertBison',
    kind: '沙暴蛮牛',
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

  // ===== 旱海驼 =====
  // 被动：先手攻击（firstStrike，battle_engine 开场跳过玩家补牌、对手先行进攻）
  // 进攻1/2/3：造成3点伤害，施加2层沙盲
  // 进攻4/5/6：造成5点伤害，施加1层荆棘
  // 防御1/2/3：格挡一半伤害（向上取整）
  // stage4：防御1/2/3 额外施加1层荆棘
  R.registerMonster({
    name: 'DesertCamel',
    kind: '旱海驼',
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

  // ===== 日光鬣蜥 =====
  // 进攻1/2/3：造成3点伤害，施加1层沙盲
  // 进攻4/5/6：造成5点伤害，施加1层流沙
  // 防御1/2/3：格挡至多2点伤害，施加2层沙盲
  R.registerMonster({
    name: 'DesertLizard',
    kind: '日光鬣蜥',
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

  // ===== 噬沙巨虫 =====
  // 进攻1/2/3：造成4点伤害，若目标有[沙盲]则不可防御
  // 进攻4/5/6：造成5点伤害，获得[寄生]
  // 防御1/2/3：反击2点伤害，施加[沙盲]
  R.registerMonster({
    name: 'DesertSandworm',
    kind: '噬沙巨虫',
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

  // ===== 日轮圣甲 =====
  // 进攻1/2/3：造成3点伤害，按技能牌颜色施加不同 buff
  //   🔴→2层灼伤 / 🟡→荆棘 / 🔵→冰封 / 🟢→中毒
  // 进攻4/5/6：造成4点伤害，获得1层飞翔
  // 防御1/2/3：格挡3点伤害
  R.registerMonster({
    name: 'DesertScarab',
    kind: '日轮圣甲',
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

  // ===== 赤砂蝎 =====
  // 进攻1/2/3：造成3点伤害，目标有[中毒]时不可防御
  // 进攻4/5/6：造成2点伤害（不可防御），施加[荆棘]和[中毒]
  // 防御1/2/3：先施加1层[中毒]，进攻方每有1层[中毒]吸取1点生命
  R.registerMonster({
    name: 'DesertScorpion',
    kind: '赤砂蝎',
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

  // ===== 热砂蝰（Stage 2 起，基础生命 27，不额外强化生命） =====
  // 进攻1/2/3：造成3点伤害，施加[中毒]
  // 进攻4/5/6：吸取 2+玩家[中毒]层数 生命（不可防御）
  // 防御1/2/3：格挡至多2点伤害，施加1层[中毒]
  R.registerMonster({
    name: 'DesertViper',
    kind: '热砂蝰',
    hp: 27,
    minStage: 2,
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

  // ===== 漏斗蚁狮（Stage 2 起） =====
  R.registerMonster({
    name: 'DesertAntlion',
    kind: '漏斗蚁狮',
    hp: 24,
    minStage: 2,
    attack: 3,
    defense: 2,
    icon: '../icons/npc_icons/desert_antlion.webp',
    attackDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      if (card.value >= 1 && card.value <= 3) return 3;
      if (card.value >= 4 && card.value <= 6) return 5;
      return 0;
    },
    attackUnblockableIfBuff(card, target) {
      return !!(card && card.isNumberCard && card.value >= 1 && card.value <= 3 && target && target.quicksand > 0);
    },
    attackQuicksand(card) {
      return card && card.isNumberCard && card.value >= 4 && card.value <= 6 ? 1 : 0;
    },
    defendBlock(card, incoming) {
      if (!card || !card.isNumberCard || card.value < 1 || card.value > 3) return 0;
      return Math.ceil(Math.max(0, Number(incoming) || 0) / 2);
    },
    defendThorns(card) {
      return card && card.isNumberCard && card.value >= 1 && card.value <= 3 ? 1 : 0;
    },
    stageMods: {
      3: orig => ({
        attackDamage(card, ctx) {
          const damage = orig.attackDamage(card, ctx);
          return damage > 0 ? damage + 1 : 0;
        }
      }),
      4: () => ({
        defendCounter(card) {
          return card && card.isNumberCard && card.value >= 1 && card.value <= 3 ? 1 : 0;
        }
      })
    }
  });

  // ===== 腐风鹫 =====
  // 进攻1/2/3：造成3点伤害，若技能牌为🟡施加2层[沙盲]，否则获得[飞翔]
  // 进攻4/5/6：造成5点伤害，清除玩家所有正面 buff
  // 防御1/2/3：格挡1点伤害，反击1点伤害，施加[沙盲]
  R.registerMonster({
    name: 'DesertVulture',
    kind: '腐风鹫',
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

  // ===== 法老（Boss，Stage 2 起） =====
  // 进攻1/2/3：造成3点伤害，按技能牌颜色：🔴施加2层[灼伤] / 🟡施加[流沙] / 🔵施加[失温] / 🟢自身获得[茂盛]
  // 进攻4/5/6：造成6点伤害，技能牌为🟡时不可防御
  // 进攻0：恢复3点生命，清除自身所有负面状态，抽取2张牌（不造成伤害，跳过玩家防御）
  // 防御1/2/3：反击3点伤害，恢复1点生命
  // 防御0：清除自身所有负面状态，反击相同点数伤害
  // Stage 3：进攻伤害 +1；Stage 4：防御恢复 +1
  const pharaohColor = card => (card && (card.chosenColor || card.color)) || '';
  const isPharaohLow = card => !!(card && card.isNumberCard && card.value >= 1 && card.value <= 3);
  const isPharaohHigh = card => !!(card && card.isNumberCard && card.value >= 4 && card.value <= 6);
  const isPharaohZero = card => !!(card && card.isNumberCard && card.value === 0);
  R.registerBoss({
    name: 'Pharaoh',
    kind: '法老',
    minStage: 2,
    hp: 50,
    attack: 3,
    defense: 2,
    handLimit: 3,
    whiteZeros: 2,
    icon: '../icons/npc_icons/pharaoh.webp',
    attackDamage(card) {
      if (isPharaohLow(card)) return 3;
      if (isPharaohHigh(card)) return 6;
      return 0;
    },
    // 进攻1/2/3 🔴：施加2层灼伤
    attackBurn(card) {
      return isPharaohLow(card) && pharaohColor(card) === 'RED' ? 2 : 0;
    },
    // 进攻1/2/3 🟡：施加1层流沙
    attackQuicksand(card) {
      return isPharaohLow(card) && pharaohColor(card) === 'YELLOW' ? 1 : 0;
    },
    // 进攻1/2/3 🔵：防御结束后施加1层失温
    attackHypothermia(card) {
      return isPharaohLow(card) && pharaohColor(card) === 'BLUE' ? 1 : 0;
    },
    // 进攻1/2/3 🟢：自身获得1层茂盛
    attackLush(card) {
      return isPharaohLow(card) && pharaohColor(card) === 'GREEN' ? 1 : 0;
    },
    // 进攻4/5/6 🟡：不可防御
    attackUnblockable(card) {
      return isPharaohHigh(card) && pharaohColor(card) === 'YELLOW';
    },
    // 进攻0：恢复3点生命
    attackHeal(card) {
      return isPharaohZero(card) ? 3 : 0;
    },
    // 进攻0：清除自身所有负面状态
    attackClearSelfDebuffs(card) {
      return isPharaohZero(card);
    },
    // 进攻0：抽取2张牌
    attackDrawSelf(card) {
      return isPharaohZero(card) ? 2 : 0;
    },
    // 防御1/2/3：反击3点；防御0：反击相同点数伤害
    defendCounter(card, incoming) {
      if (isPharaohZero(card)) return Math.max(0, Number(incoming) || 0);
      return isPharaohLow(card) ? 3 : 0;
    },
    // 防御1/2/3：恢复1点生命
    defendHeal(card) {
      return isPharaohLow(card) ? 1 : 0;
    },
    // 防御0：清除自身所有负面状态
    defendClearDebuffs(card) {
      return isPharaohZero(card);
    },
    stageMods: {
      3: orig => ({
        attackDamage(card, ctx) {
          const damage = orig.attackDamage(card, ctx);
          return damage > 0 ? damage + 1 : 0;
        }
      }),
      4: orig => ({
        defendHeal(card) {
          const amount = orig.defendHeal(card);
          return amount > 0 ? amount + 1 : 0;
        }
      })
    }
  });


  // ===== 嘲风鬣狗（Boss，Stage 2 起） =====
  // 被动[嘲弄]：每次进入整段防御阶段（非单次防御牌）掷12面骰选色并挂嘲弄印记，
  // 本阶段该颜色玩家进攻技能变为空（无伤害/效果，跳过防御）；进入进攻阶段时清除。
  // 进攻1/2/3：造成 2+2×玩家[流血]层数 伤害
  // 进攻4/5/6：施加1层流血，获得暴击；造成玩家手牌数点伤害
  // 进攻0：翻开玩家牌库顶判定（始终入弃牌堆）；数字>0 则 ceil(点数×1.5) 伤害，否则施加2层流血+[荆棘]并抽1张
  // 防御1/2/3：反击 ceil(incoming/2)；防御0：反击6，获得暴击，玩家弃1张手牌
  // Stage2 HP+10；Stage3 🟡进攻不可防御（不耗暴击）；Stage4 防御回1❤️
  const hyenaColor = card => (card && (card.chosenColor || card.color)) || '';
  const isHyenaLow = card => !!(card && card.isNumberCard && card.value >= 1 && card.value <= 3);
  const isHyenaHigh = card => !!(card && card.isNumberCard && card.value >= 4 && card.value <= 6);
  const isHyenaZero = card => !!(card && card.isNumberCard && card.value === 0);
  R.registerBoss({
    name: 'DesertHyena',
    kind: '嘲风鬣狗',
    minStage: 2,
    hp: 40,
    attack: 3,
    defense: 2,
    handLimit: 3,
    whiteZeros: 2,
    icon: '../icons/npc_icons/desert_hyena.webp',
    // 被动[嘲弄]：进入整段防御阶段时掷骰选色并挂印记（引擎在 player turnStart 调用一次）
    onEnterDefendPhase(eng, entity) {
      const roll = eng && typeof eng.rollD12 === 'function'
        ? eng.rollD12('嘲风鬣狗[嘲弄]', { who: eng._who ? eng._who(entity) : 'ai' })
        : (1 + Math.floor(Math.random() * 12));
      const colors = ['RED', 'YELLOW', 'BLUE', 'GREEN'];
      const color = colors[Math.min(3, Math.floor((Math.max(1, Number(roll) || 1) - 1) / 3))];
      if (entity) {
        entity.mockAttackColor = color;
        const S = (typeof window !== 'undefined' && window.FurryGame && window.FurryGame.StatusService)
          || (eng && eng._status && eng._status());
        if (S && S.set) S.set(entity, 'taunt', true);
        else entity.tauntMark = true;
      }
      const labels = { RED: '红色', YELLOW: '黄色', BLUE: '蓝色', GREEN: '绿色' };
      const who = eng && eng._who ? eng._who(entity) : 'ai';
      if (eng && typeof eng.emit === 'function') {
        eng.emit('desc', (entity && entity.name ? entity.name : '嘲风鬣狗')
          + '[嘲弄]：本阶段' + (labels[color] || color) + '进攻技能失效（骰=' + roll + '）');
        eng.emit('buff', '[嘲弄]', null, { who, kind: 'taunt', stacks: 1 });
      }
      return color;
    },
    // 进入进攻阶段时清除嘲弄印记与本阶段选色
    clearDefendPhaseMock(eng, entity) {
      if (!entity) return;
      const had = !!(entity.tauntMark || entity.mockAttackColor);
      entity.mockAttackColor = null;
      const S = (typeof window !== 'undefined' && window.FurryGame && window.FurryGame.StatusService)
        || (eng && eng._status && eng._status());
      if (S && S.set) S.set(entity, 'taunt', false);
      else entity.tauntMark = false;
      if (had && eng && typeof eng.emit === 'function') {
        const who = eng._who ? eng._who(entity) : 'ai';
        eng.emit('buff', '-[嘲弄]', null, { who, kind: 'taunt', stacks: 0 });
      }
    },
    isAttackMocked(entity, attackCard) {
      const mocked = entity && entity.mockAttackColor;
      const atkColor = attackCard && (attackCard.chosenColor || attackCard.color);
      return !!(mocked && atkColor === mocked);
    },
    attackDamage(card, ctx) {
      if (isHyenaLow(card)) return 2 + 2 * ((ctx && ctx.playerBleed) || 0);
      if (isHyenaHigh(card)) return (ctx && ctx.playerHandSize) || 0;
      return 0;
    },
    // 进攻4/5/6：施加1层流血
    attackBleed(card) {
      return isHyenaHigh(card) ? 1 : 0;
    },
    // 进攻4/5/6：获得1层暴击
    attackGainCrit(card) {
      return isHyenaHigh(card) ? 1 : 0;
    },
    // 进攻0：翻开玩家牌库判定（桥接层结算伤害与弃牌/失败效果）
    attackHyenaJudge(card) {
      return isHyenaZero(card);
    },
    // 防御1/2/3：反击一半（向上取整）；防御0：反击6
    defendCounter(card, incoming) {
      if (isHyenaZero(card)) return 6;
      if (isHyenaLow(card)) return Math.ceil(Math.max(0, Number(incoming) || 0) / 2);
      return 0;
    },
    // 防御0：获得1层暴击
    defendGainCrit(card) {
      return isHyenaZero(card) ? 1 : 0;
    },
    // 防御0：玩家选择1张手牌弃掉
    defendPlayerDiscard(card) {
      return isHyenaZero(card);
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 10 }),
      3: orig => ({
        // 进攻技能牌为🟡时不可防御（不消耗暴击；走 attackUnblockable，非 attackUseCrit）
        attackUnblockable(card) {
          return hyenaColor(card) === 'YELLOW';
        }
      }),
      4: orig => ({
        // 防御恢复 1❤️（1/2/3 与 0 均生效）
        defendHeal(card) {
          return (isHyenaLow(card) || isHyenaZero(card)) ? 1 : 0;
        }
      })
    }
  });


  // ===== 鳄神索贝克（Boss，Stage 2 起） =====
  // 被动[丰饶]：被击败时若有[茂盛]，仅清除自身正面 buff，血量恢复至 15（可再次触发）。
  // 进攻1/2/3：3🗡️ + 施加1层流血
  // 进攻4/5/6：5🗡️；🟢获得[茂盛]、🟡获得[暴击]
  // 进攻0：双方先获得[茂盛]，再按对手正面 buff 层数×3 造成伤害（<=3 不可防御）
  // 防御1/2/3：回3❤️；防御0：免疫，若有[茂盛]则消耗1层并反击3🗡️
  // Stage2 HP+7；Stage3 进攻伤害+1；Stage4 防御恢复+1
  const sobekColor = card => (card && (card.chosenColor || card.color)) || '';
  const isSobekLow = card => !!(card && card.isNumberCard && card.value >= 1 && card.value <= 3);
  const isSobekHigh = card => !!(card && card.isNumberCard && card.value >= 4 && card.value <= 6);
  const isSobekZero = card => !!(card && card.isNumberCard && card.value === 0);
  R.registerBoss({
    name: 'DesertSobek',
    kind: '鳄神索贝克',
    minStage: 2,
    hp: 35,
    attack: 3,
    defense: 2,
    handLimit: 3,
    whiteZeros: 2,
    icon: '../icons/npc_icons/desert_sobek.webp',
    attackDamage(card, ctx) {
      if (isSobekLow(card)) return 3;
      if (isSobekHigh(card)) return 5;
      if (isSobekZero(card)) {
        // Prefer playerPositiveBuffStacks (positive only). Do not use playerBuffTotal
        // (that mixes debuffs). Bridge applies mutual lush before counting on 0.
        const stacks = ctx && ctx.playerPositiveBuffStacks != null
          ? Number(ctx.playerPositiveBuffStacks) || 0
          : 0;
        return 3 * Math.max(0, stacks);
      }
      return 0;
    },
    // 进攻1/2/3：施加1层流血
    attackBleed(card) {
      return isSobekLow(card) ? 1 : 0;
    },
    // 进攻4/5/6 🟢 / 进攻0：自身获得[茂盛]
    attackLush(card) {
      if (isSobekZero(card)) return 1;
      return isSobekHigh(card) && sobekColor(card) === 'GREEN' ? 1 : 0;
    },
    // 进攻0：对手也获得[茂盛]（桥接层在算伤前先挂，使新茂盛计入正面层数）
    attackLushTarget(card) {
      return isSobekZero(card) ? 1 : 0;
    },
    // 进攻4/5/6 🟡：获得[暴击]
    attackGainCrit(card) {
      return isSobekHigh(card) && sobekColor(card) === 'YELLOW' ? 1 : 0;
    },
    // 进攻0：最终伤害 <=3 时不可防御（桥接用 d < 4）
    attackUnblockableBelow(card) {
      return isSobekZero(card) ? 4 : 0;
    },
    // 防御1/2/3：恢复3点生命
    defendHeal(card) {
      return isSobekLow(card) ? 3 : 0;
    },
    // 防御0：免疫所有伤害
    defendImmune(card) {
      return isSobekZero(card);
    },
    // 防御0：若有[茂盛]则消耗1层并反击3（在免疫分支里调用）
    defendCounter(card, incoming, defender, opponent, eng) {
      if (!isSobekZero(card)) return 0;
      if (!defender || (defender.lush || 0) < 1) return 0;
      defender.lush = Math.max(0, (defender.lush || 0) - 1);
      if (eng && typeof eng.emit === 'function') {
        const who = eng._who ? eng._who(defender) : 'ai';
        eng.emit('buff', '-1[茂盛]', null, { who, kind: 'lush', stacks: defender.lush });
      }
      return 3;
    },
    stageMods: {
      2: orig => ({ hp: orig.hp + 7 }),
      3: orig => ({
        attackDamage(card, ctx) {
          const damage = orig.attackDamage(card, ctx);
          return damage > 0 ? damage + 1 : 0;
        }
      }),
      4: orig => ({
        defendHeal(card) {
          const amount = orig.defendHeal(card);
          return amount > 0 ? amount + 1 : 0;
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