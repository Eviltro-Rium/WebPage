/**
 * First four volcano monsters. Skills are consumed by the shared NPC adapter;
 * the scene stays out of random map selection until its Boss pool is defined.
 */
(function () {
  const R = window.AdventureRegistry;
  if (!R) return;
  const low = c => !!(c && c.isNumberCard && c.value >= 1 && c.value <= 3);
  const high = c => !!(c && c.isNumberCard && c.value >= 4 && c.value <= 6);
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
  window.AdventureMonsterPool = window.AdventureMonsterPool || {};
  window.AdventureMonsterPool.volcano = {
    '*': ['VolcanoSalamander', 'VolcanoCrab', 'VolcanoAshWolf', 'VolcanoObsidianBoar']
  };
})();
