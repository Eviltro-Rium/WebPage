/**
 * Volcano scene: first four regular monsters plus three bosses.
 * Extra documented regulars remain unimplemented.
 */
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
    minStage: 1, icon: '../icons/npc_icons/volcano_salamander.webp',
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
    minStage: 1, icon: '../icons/npc_icons/volcano_crab.webp',
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
    minStage: 1, icon: '../icons/npc_icons/volcano_wolf.webp', firstStrike: true,
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
    minStage: 1, icon: '../icons/npc_icons/volcano_boar.webp',
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
  R.registerBoss({
    name: 'VolcanoFlameLion', kind: '炎鬃狮', hp: 40, attack: 3, defense: 2,
    handLimit: 3, whiteZeros: 2, icon: '../icons/npc_icons/volcano_lion.webp',
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
        defendClearDebuffs: zero
      })
    },
    skillDescription(c, defend) {
      if (defend) {
        if (low(c)) return defenseText(this, c) + '，施加[灼伤]';
        if (zero(c)) return '免疫所有伤害' + (this.defendClearDebuffs ? '，清除自身所有负面状态' : '') + '，施加[炙热]';
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
    handLimit: 3, whiteZeros: 2, icon: '../icons/npc_icons/volcano_rhino.webp',
    attackDamage: c => low(c) ? 3 : high(c) ? 5 : zero(c) ? 4 : 0,
    attackGuard: c => low(c) ? 2 : 0,
    attackGainMagma: c => high(c) ? 1 : 0,
    attackUnblockableIfSelfBuff: (c, self) => zero(c) && (Number(self && self.magmaVein) || 0) > 0,
    defendBlock(c, incoming) {
      if (zero(c)) return Math.max(0, incoming || 0);
      if (low(c)) return Math.ceil(Math.max(0, incoming || 0) / 2);
      return 0;
    },
    defendGuard: c => low(c) ? 1 : 0,
    defendGainMagma: c => zero(c) ? 1 : 0,
    stageMods: {
      2: orig => ({ hp: orig.hp + 10 }),
      3: orig => ({
        attackDamage(c, ctx) {
          const base = orig.attackDamage(c, ctx);
          return (numeric(c) || zero(c)) ? base + 1 : base;
        }
      }),
      4: orig => ({
        defendBlock(c, incoming) {
          if (zero(c)) return orig.defendBlock(c, incoming);
          return low(c) ? Math.min((incoming || 0), orig.defendBlock(c, incoming) + 1) : 0;
        },
        defendGuard(c) {
          return (orig.defendGuard(c) || 0) + (zero(c) ? 1 : 0);
        }
      })
    },
    skillDescription(c, defend) {
      if (defend) {
        if (low(c)) return '格挡半数伤害（向上取整），获得[守护]';
        if (zero(c)) return '格挡所有伤害，获得[熔脉]' + ((this.defendGuard(c) || 0) > 0 ? '，获得[守护]' : '');
        return '无防御效果';
      }
      if (low(c)) return damageText(this, c) + '，获得2层[守护]';
      if (high(c)) return damageText(this, c) + '，获得[熔脉]';
      if (zero(c)) return damageText(this, c) + '；自身已有[熔脉]时不可防御';
      return '无进攻效果';
    }
  });
  R.registerBoss({
    name: 'VolcanoCinderPhoenix', kind: '余烬凤凰', hp: 50, attack: 3, defense: 2,
    minStage: 2, handLimit: 3, whiteZeros: 2, icon: '../icons/npc_icons/volcano_phoenix.webp',
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
    '*': ['VolcanoSalamander', 'VolcanoCrab', 'VolcanoAshWolf', 'VolcanoObsidianBoar']
  };
  window.AdventureBossPool = window.AdventureBossPool || {};
  window.AdventureBossPool.volcano = {
    1: ['VolcanoFlameLion', 'VolcanoMagmaRhino'],
    2: ['VolcanoFlameLion', 'VolcanoMagmaRhino', 'VolcanoCinderPhoenix'],
    3: ['VolcanoFlameLion', 'VolcanoMagmaRhino', 'VolcanoCinderPhoenix'],
    4: ['VolcanoFlameLion', 'VolcanoMagmaRhino', 'VolcanoCinderPhoenix']
  };
})();
