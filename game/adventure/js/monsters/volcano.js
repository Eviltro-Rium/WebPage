/** Volcano scene monsters and bosses. Rules mirror docs/adventure_guide/volcano.md. */
(function () {
  const R = window.AdventureRegistry;
  if (!R) return;
  const low = c => !!(c && c.isNumberCard && c.value >= 1 && c.value <= 3);
  const high = c => !!(c && c.isNumberCard && c.value >= 4 && c.value <= 6);
  const zero = c => !!(c && c.isNumberCard && c.value === 0);
  const numeric = c => low(c) || high(c);
  const block = amount => (c, incoming) => low(c) ? Math.min(amount, Math.max(0, incoming || 0)) : 0;
  const standardStages = hp => ({
    2: orig => ({ hp: orig.hp + hp }),
    3: orig => ({ attackDamage(c, ctx) { return numeric(c) ? orig.attackDamage(c, ctx) + 1 : 0; } }),
    4: orig => ({ defendBlock(c, incoming) { return low(c) ? Math.min(orig.defendBlock(c, incoming) + 1, incoming || 0) : 0; } })
  });
  const damageText = (mod, c) => mod.attackDamage(c, {}) + '🗡️';
  const defenseText = (mod, c) => '格挡至多' + mod.defendBlock(c, 99) + '🛡️';

  R.registerMonster({
    name: 'VolcanoSalamander', kind: '火山蝾螈', hp: 20, attack: 3, defense: 2,
    minStage: 1, icon: '../icons/npc_icons/volcano_salamander.webp?v=20261024-npc-portraits',
    attackDamage: c => low(c) ? 3 : high(c) ? 5 : 0,
    attackBurn: c => numeric(c) ? 1 : 0,
    defendBlock: block(2),
    defendScorch: low,
    stageMods: standardStages(5),
    skillDescription(c, defend) {
      if (defend) return low(c) ? defenseText(this, c) + '，施加[炙热]' : '无防御效果';
      return numeric(c) ? damageText(this, c) + '，施加[灼伤]' : '无进攻效果';
    }
  });
  R.registerMonster({
    name: 'VolcanoCrab', kind: '熔岩蟹', hp: 24, attack: 2, defense: 2,
    minStage: 1, icon: '../icons/npc_icons/volcano_crab.webp?v=20261024-npc-portraits',
    attackDamage: c => low(c) ? 2 : high(c) ? 5 : 0,
    attackGuard: c => low(c) ? 2 : 0,
    attackGainMagma: c => high(c) ? 1 : 0,
    defendBlock: block(2),
    defendBurn: c => low(c) ? 2 : 0,
    stageMods: standardStages(6),
    skillDescription(c, defend) {
      if (defend) return low(c) ? defenseText(this, c) + '，施加2层[灼伤]' : '无防御效果';
      return numeric(c) ? damageText(this, c) + (low(c) ? '，获得2层[守护]' : '，获得[熔脉]') : '无进攻效果';
    }
  });
  R.registerMonster({
    name: 'VolcanoAshWolf', kind: '灰烬狼', hp: 20, attack: 4, defense: 0,
    minStage: 1, icon: '../icons/npc_icons/volcano_wolf.webp?v=20261024-npc-portraits', firstStrike: true,
    attackDamage: c => low(c) ? 4 : high(c) ? 3 : 0,
    attackUnblockable: high,
    attackBurn: c => high(c) ? 2 : 0,
    defendBlock: block(0),
    defendBurn: c => low(c) ? 1 : 0,
    defendBurnSettle: low,
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ attackDamage(c, ctx) { return numeric(c) ? orig.attackDamage(c, ctx) + 1 : 0; } }),
      4: () => ({ defendScorch: low })
    },
    skillDescription(c, defend) {
      if (defend) return low(c) ? '先施加[灼伤]，对攻击方进行一次[灼伤]结算' + (this.defendScorch ? '，再施加[炙热]' : '') : '无防御效果';
      return numeric(c) ? damageText(this, c) + (high(c) ? '（不可防御），施加2层[灼伤]' : '') : '无进攻效果';
    }
  });
  R.registerMonster({
    name: 'VolcanoObsidianBoar', kind: '黑曜野猪', hp: 26, attack: 4, defense: 2,
    minStage: 1, icon: '../icons/npc_icons/volcano_boar.webp?v=20261024-npc-portraits',
    attackDamage: (c, ctx) => low(c) ? Math.max(0, Number(ctx && ctx.playerBurn) || 0) : high(c) ? 4 : 0,
    attackBleed: c => high(c) ? 1 : 0,
    attackBurn: c => high(c) ? 1 : 0,
    defendBlock: block(2),
    defendBurn: c => low(c) ? 2 : 0,
    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
      3: () => ({ attackUnblockableBelow: c => numeric(c) ? 3 : 0 }),
      4: () => ({ defendBlock: block(3) })
    },
    skillDescription(c, defend) {
      if (defend) return low(c) ? defenseText(this, c) + '，施加2层[灼伤]' : '无防御效果';
      if (!numeric(c)) return '无进攻效果';
      return (low(c) ? '对手[灼伤]层数🗡️' : '4🗡️，施加[流血]和[灼伤]') +
        (this.attackUnblockableBelow ? '；伤害<3时不可防御' : '');
    }
  });
  R.registerMonster({
    name: 'VolcanoCinderBadger', kind: '熔渣獾', hp: 20, attack: 3, defense: 2,
    icon: '../icons/npc_icons/volcano_badger.webp?v=20261024-npc-portraits', poisonImmune: true,
    attackDamage: c => low(c) ? 3 : high(c) ? 4 : 0,
    attackPoison: low,
    attackGuard: c => high(c) ? 2 : 0,
    defendBlock: block(2),
    defendGuard: c => low(c) ? 1 : 0,
    defendBurn: c => low(c) ? 1 : 0,
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ stageDamageBonus: true, attackDamage(c, ctx) { const d = orig.attackDamage(c, ctx); return d > 0 ? d + 1 : 0; } }),
      4: orig => ({ defendBlock(c, incoming) { return low(c) ? Math.min((incoming || 0), orig.defendBlock(c, incoming) + 1) : 0; } })
    },
    skillDescription(c, defend) {
      if (defend) return low(c) ? '格挡至多' + this.defendBlock(c, 99) + '🛡️，获得[守护]，施加[灼伤]' : '无防御效果';
      if (low(c)) return this.attackDamage(c) + '🗡️，施加[中毒]（自身免疫中毒伤害）';
      if (high(c)) return this.attackDamage(c) + '🗡️，获得2层[守护]';
      return '无进攻效果';
    }
  });
  R.registerMonster({
    name: 'VolcanoObsidianArmadillo', kind: '黑曜犰狳', hp: 32, attack: 3, defense: 2,
    minStage: 2, icon: '../icons/npc_icons/volcano_armadillo.webp?v=20261024-npc-portraits',
    attackDamage: c => low(c) ? 3 : high(c) ? 4 : 0,
    attackBurn: low,
    attackScorch: low,
    attackGuard: c => high(c) ? 2 : 0,
    defendBlock(c, incoming, defender, eng) {
      if (!low(c)) return 0;
      const face = Number(eng && eng.s && eng.s.atkCard && eng.s.atkCard.value) || 0;
      return Math.min(Math.max(0, incoming || 0), Math.ceil(face / 2));
    },
    stageMods: {
      3: orig => ({
        stageDamageBonus: true,
        attackDamage(c, ctx) { const d = orig.attackDamage(c, ctx); return d > 0 ? d + 1 : 0; },
        attackGuard(c) { return (orig.attackGuard(c) || 0) + (high(c) ? 1 : 0); }
      }),
      4: () => ({
        defendFullFace: true,
        defendBlock(c, incoming, defender, eng) {
          if (!low(c)) return 0;
          const face = Number(eng && eng.s && eng.s.atkCard && eng.s.atkCard.value) || 0;
          return Math.min(Math.max(0, incoming || 0), face);
        }
      })
    },
    skillDescription(c, defend) {
      if (defend) return low(c) ? '格挡对手攻击牌点数' + (this.defendFullFace ? '全额' : '的一半（向上取整）') + '🛡️' : '无防御效果';
      if (low(c)) return this.attackDamage(c) + '🗡️，施加[炙热]和[灼伤]';
      if (high(c)) return this.attackDamage(c) + '🗡️，获得' + this.attackGuard(c) + '层[守护]';
      return '无进攻效果';
    }
  });
  R.registerMonster({
    name: 'VolcanoBasaltCentipede', kind: '玄岩蜈蚣', hp: 20, attack: 1, defense: 1,
    icon: '../icons/npc_icons/volcano_centipede.webp?v=20261024-npc-portraits',
    attackDamage: (c, ctx) => low(c) ? Math.max(0, Number(ctx && ctx.playerBurn) || 0) : 0,
    attackScorch: low,
    attackBurn: c => high(c) ? 3 : 0,
    attackPoison: c => high(c) ? 1 : 0,
    defendBlock: block(1),
    defendCounter: c => low(c) ? 1 : 0,
    defendBurn: c => low(c) ? 1 : 0,
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ stageDamageBonus: true, attackDamage(c, ctx) { return low(c) ? orig.attackDamage(c, ctx) + 1 : 0; } }),
      4: orig => ({
        defendBlock(c, incoming) { return low(c) ? Math.min((incoming || 0), orig.defendBlock(c, incoming) + 1) : 0; },
        defendCounter(c, incoming, defender, opponent, eng) { return (orig.defendCounter(c, incoming, defender, opponent, eng) || 0) + (low(c) ? 1 : 0); }
      })
    },
    skillDescription(c, defend) {
      if (defend) return low(c) ? '格挡' + this.defendBlock(c, 99) + '🛡️，反击' + this.defendCounter(c) + '🗡️，施加[灼伤]' : '无防御效果';
      if (low(c)) return '施加[炙热]，对手[灼伤]层数' + (this.stageDamageBonus ? '+1' : '') + '🗡️';
      if (high(c)) return '施加3层[灼伤]和[中毒]';
      return '无进攻效果';
    }
  });
  R.registerMonster({
    name: 'VolcanoMagmaSlug', kind: '熔岩蛞蝓', hp: 25, attack: 2, defense: 2,
    icon: '../icons/npc_icons/volcano_slug.webp?v=20261024-npc-portraits',
    attackDamage: c => low(c) ? 2 : high(c) ? 4 : 0,
    attackGuard: c => low(c) ? 2 : 0,
    attackSandblind: c => high(c) ? 2 : 0,
    defendSandblind: c => low(c) ? 1 : 0,
    defendDeckCompare: c => low(c) ? { operator: '>' } : null,
    stageMods: {
      2: orig => ({ hp: orig.hp + 5 }),
      3: orig => ({ stageDamageBonus: true, attackDamage(c, ctx) { const d = orig.attackDamage(c, ctx); return d > 0 ? d + 1 : 0; } }),
      4: () => ({ defendDeckCompare: c => low(c) ? { operator: '>=' } : null })
    },
    skillDescription(c, defend) {
      if (defend) return low(c) ? '施加[沙盲]，双方各翻开自己牌库顶1🃏；怪物点数' + (this.defendDeckCompare(c).operator === '>=' ? '≥' : '>') + '玩家点数时免疫本次伤害（判定牌放回原牌库）' : '无防御效果';
      if (low(c)) return this.attackDamage(c) + '🗡️，获得2层[守护]';
      if (high(c)) return this.attackDamage(c) + '🗡️，施加2层[沙盲]';
      return '无进攻效果';
    }
  });
  R.registerMonster({
    name: 'VolcanoSulfurWeasel', kind: '硫晶鼬', hp: 24, attack: 3, defense: 2,
    minStage: 2, icon: '../icons/npc_icons/volcano_weasel.webp?v=20261024-npc-portraits',
    attackDamage: c => low(c) ? Number(c.value) || 0 : high(c) ? 5 : 0,
    attackBurn: c => low(c) ? Number(c.value) || 0 : 0,
    attackHarden: c => high(c) ? 1 : 0,
    defendBlock: (c, incoming) => low(c) ? Math.min(Math.max(0, incoming || 0), Math.ceil(Math.max(0, incoming || 0) / 2)) : 0,
    defendBurn: c => low(c) ? 1 : 0,
    stageMods: {
      2: orig => ({ hp: orig.hp + 6 }),
      3: () => ({
        attackUnblockableIfSelfBuff: (c, self) => low(c) && (Number(self && self.harden) || 0) > 0
      }),
      4: orig => ({
        defendBlock(c, incoming) { return low(c) ? Math.min(Math.max(0, incoming || 0), Math.ceil(Math.max(0, incoming || 0) / 2)) : 0; },
        defendBurn: c => low(c) ? 2 : 0
      })
    },
    skillDescription(c, defend) {
      if (defend) return low(c) ? '施加' + this.defendBurn(c) + '层[灼伤]，格挡进攻伤害的一半（向上取整）' : '无防御效果';
      if (low(c)) return this.attackDamage(c) + '🗡️，施加' + c.value + '层[灼伤]' + (this.attackUnblockableIfSelfBuff && this.attackUnblockableIfSelfBuff(c, { harden: 1 }) ? '（自身有[硬化]时不可防御）' : '');
      if (high(c)) return this.attackDamage(c) + '🗡️，获得1层[硬化]';
      return '无进攻效果';
    }
  });
  R.registerBoss({
    name: 'VolcanoFlameLion', kind: '炎鬃狮', hp: 40, attack: 3, defense: 2,
    handLimit: 3, whiteZeros: 2, icon: '../icons/npc_icons/volcano_lion.webp?v=20261024-npc-portraits',
    attackDamage: c => low(c) ? 4 : high(c) ? 3 : 0,
    attackUnblockable: high,
    attackBurn: c => low(c) ? 1 : zero(c) ? 2 : 0,
    attackBurnSettle: zero,
    attackScorch: high,
    attackGainMagma: c => (high(c) || zero(c)) ? 1 : 0,
    defendBlock: (c, incoming) => low(c) ? Math.min(2, Math.max(0, incoming || 0)) : 0,
    defendBurn: c => low(c) ? 1 : 0,
    defendImmune: zero,
    defendScorch: zero,
    stageMods: {
      2: orig => ({ hp: orig.hp + 10 }),
      3: orig => ({
        attackDamage(c, ctx) {
          const base = orig.attackDamage(c, ctx);
          return numeric(c) ? base + 1 : base;
        }
      }),
      4: orig => ({
        defendBlock(c, incoming) {
          return low(c) ? Math.min(orig.defendBlock(c, incoming) + 1, incoming || 0) : 0;
        },
        defendBurn(c) { return zero(c) ? 2 : orig.defendBurn(c); }
      })
    },
    skillDescription(c, defend) {
      if (defend) {
        if (low(c)) return defenseText(this, c) + '，施加[灼伤]';
        if (zero(c)) return '免疫所有伤害，施加[炙热]' + (this.defendBurn(c) > 0 ? '和2层[灼伤]' : '');
        return '无防御效果';
      }
      if (low(c)) return damageText(this, c) + '，施加[灼伤]';
      if (high(c)) return damageText(this, c) + '（不可防御），施加[炙热]，获得[熔脉]';
      if (zero(c)) return '先施加2层[灼伤]，再立刻进行一次[灼伤]结算，获得[熔脉]';
      return '无进攻效果';
    }
  });
  R.registerBoss({
    name: 'VolcanoMagmaRhino', kind: '熔核犀', hp: 45, attack: 3, defense: 2,
    handLimit: 3, whiteZeros: 2, icon: '../icons/npc_icons/volcano_rhino.webp?v=20261024-npc-portraits',
    attackDamage: c => low(c) ? 3 : high(c) ? 5 : zero(c) ? 6 : 0,
    attackGuard: c => low(c) ? 1 : 0,
    attackBleed: low,
    attackGainMagma: c => high(c) && (c.chosenColor || c.color) !== 'RED' ? 1 : 0,
    attackUnblockable: c => high(c) && (c.chosenColor || c.color) === 'RED',
    attackUnblockableIfSelfBuff: (c, self) => zero(c) && (Number(self && self.magmaVein) || 0) > 0,
    defendBlock(c, incoming) {
      if (zero(c)) return 0;
      if (low(c)) return Math.ceil(Math.max(0, incoming || 0) / 2);
      return 0;
    },
    defendGainMagma: c => low(c) ? 1 : 0,
    defendBleed: c => zero(c) ? 2 : 0,
    defendCounter: (c, incoming) => zero(c) ? Math.max(0, Number(incoming) || 0) : 0,
    stageMods: {
      2: orig => ({ hp: orig.hp + 10 }),
      3: orig => ({
        attackDamage(c, ctx) {
          const base = orig.attackDamage(c, ctx);
          return (numeric(c) || zero(c)) ? base + 1 : base;
        }
      }),
      4: () => ({ fixedCounter: true, defendCounter: c => zero(c) ? 2 : 0 })
    },
    skillDescription(c, defend) {
      if (defend) {
        if (low(c)) return '格挡半数伤害（向上取整），获得[熔脉]';
        if (zero(c)) return (this.fixedCounter ? '反击2🗡️' : '反击相同点伤害') + '，施加2层[流血]';
        return '无防御效果';
      }
        if (low(c)) return damageText(this, c) + '，获得[守护]，施加[流血]';
        if (high(c)) return damageText(this, c) + (this.attackUnblockable(c) ? '（红色不可防御）' : '，获得[熔脉]');
      if (zero(c)) return damageText(this, c) + '；自身已有[熔脉]时不可防御';
      return '无进攻效果';
    }
  });
  R.registerBoss({
    name: 'VolcanoCinderPhoenix', kind: '余烬凤凰', hp: 35, attack: 3, defense: 2,
    minStage: 2, handLimit: 3, whiteZeros: 2, icon: '../icons/npc_icons/volcano_phoenix.webp?v=20261024-npc-portraits',
    attackTurnStart(eng, x) {
      if (!x || (Number(x.fly) || 0) > 0) return;
      const service = window.FurryGame && window.FurryGame.StatusService;
      if (service) service.add(x, 'fly', 1);
      else x.fly = 1;
      if (eng && typeof eng.emit === 'function') {
        const who = typeof eng._who === 'function' ? eng._who(x) : 'ai';
        eng.emit('buff', '+1[飞翔]', null, { who, kind: 'fly', stacks: x.fly });
      }
    },
    attackDamage: c => low(c) ? 3 : high(c) ? 4 : zero(c) ? 5 : 0,
    attackFly: c => low(c) ? 1 : 0,
    attackBurn: c => high(c) ? 2 : 0,
    attackScorch: c => high(c) || zero(c),
    attackHeal: c => zero(c) ? 3 : 0,
    attackUnblockable: zero,
    defendCounter: (c) => low(c) ? 2 : 0,
    defendScorch: low,
    defendImmune: zero,
    defendImmuneBuff: zero,
    defendFly: c => zero(c) ? 1 : 0,
    stageMods: {
      3: orig => ({
        attackDamage(c, ctx) {
          const base = orig.attackDamage(c, ctx);
          return (numeric(c) || zero(c)) ? base + 1 : base;
        }
      }),
      4: orig => ({
        defendCounter: (c, incoming) => (orig.defendCounter(c, incoming) || 0) + (low(c) ? 1 : 0),
        defendHeal: c => zero(c) ? 2 : 0
      })
    },
    skillDescription(c, defend) {
      if (defend) {
        if (low(c)) return '反击' + this.defendCounter(c) + '🗡️，施加[炙热]';
        if (zero(c)) {
          return '免疫所有伤害和即将被施加的debuff，清除自身所有debuff，获得[飞翔]'
            + ((this.defendHeal && this.defendHeal(c) > 0) ? '，恢复' + this.defendHeal(c) + '❤️' : '');
        }
        return '无防御效果';
      }
      if (low(c)) return damageText(this, c) + '，获得[飞翔]';
      if (high(c)) return damageText(this, c) + '，施加2层[灼伤]与[炙热]';
      if (zero(c)) return '施加[炙热]，恢复3❤️，' + damageText(this, c) + '（不可防御）';
      return '无进攻效果';
    }
  });

  window.AdventureMonsterPool = window.AdventureMonsterPool || {};
  window.AdventureMonsterPool.volcano = {
    1: ['VolcanoSalamander', 'VolcanoCrab', 'VolcanoAshWolf', 'VolcanoObsidianBoar',
      'VolcanoCinderBadger', 'VolcanoBasaltCentipede', 'VolcanoMagmaSlug'],
    2: ['VolcanoSalamander', 'VolcanoCrab', 'VolcanoAshWolf', 'VolcanoObsidianBoar',
      'VolcanoCinderBadger', 'VolcanoObsidianArmadillo', 'VolcanoBasaltCentipede', 'VolcanoMagmaSlug', 'VolcanoSulfurWeasel'],
    3: ['VolcanoSalamander', 'VolcanoCrab', 'VolcanoAshWolf', 'VolcanoObsidianBoar',
      'VolcanoCinderBadger', 'VolcanoObsidianArmadillo', 'VolcanoBasaltCentipede', 'VolcanoMagmaSlug', 'VolcanoSulfurWeasel'],
    4: ['VolcanoSalamander', 'VolcanoCrab', 'VolcanoAshWolf', 'VolcanoObsidianBoar',
      'VolcanoCinderBadger', 'VolcanoObsidianArmadillo', 'VolcanoBasaltCentipede', 'VolcanoMagmaSlug', 'VolcanoSulfurWeasel']
  };
  window.AdventureBossPool = window.AdventureBossPool || {};
  window.AdventureBossPool.volcano = {
    1: ['VolcanoFlameLion', 'VolcanoMagmaRhino'],
    2: ['VolcanoFlameLion', 'VolcanoMagmaRhino', 'VolcanoCinderPhoenix'],
    3: ['VolcanoFlameLion', 'VolcanoMagmaRhino', 'VolcanoCinderPhoenix'],
    4: ['VolcanoFlameLion', 'VolcanoMagmaRhino', 'VolcanoCinderPhoenix']
  };
})();
