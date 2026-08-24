/**
 * 怪物注册桥接 —— 把冒险模式怪物注册到 1v1 的 CharacterRegistry 和 AIRegistry，
 * 使 1v1 引擎和 UI 可以直接用于冒险模式战斗。
 */
(function () {
  const CR = window.CharacterRegistry;
  const AR = window.AIRegistry;
  const AdvR = window.AdventureRegistry;
  if (!CR || !AR || !AdvR) return;

  function applyStageMods(mod, stage) {
    if (!mod || !mod.stageMods || typeof mod.stageMods[stage] !== 'function') return mod;
    const overrides = mod.stageMods[stage](mod);
    return Object.assign({}, mod, overrides);
  }

  function registerMonsterChar(mod) {
    CR.register({
      name: mod.name,
      hp: mod.hp || 30,
      type: mod.kind || '怪物',
      passive: '冒险模式怪物',
      adventureNpc: true,
      init() { return { guard: 0, fly: 0 }; },
      turnStart(eng, x, w) {
        if (w !== 'ai' && w !== 'ai2') return;
        if (typeof mod.attackTurnStart === 'function') mod.attackTurnStart(eng, x, w);
      },
      effect(eng, v, c, a, t, owner, helpers) {
        const { heal, guard, fly, bleed, poison, clearPositiveBuffs } = helpers;
        let d = 0, skip = false, unblock = false;

        if (c && c.potion) {
          heal(a, 5);
          return { d: 0, skip: false, unblock: false };
        }

        const ctx = { playerHandSize: eng.h.player ? eng.h.player.length : 0 };
        if (typeof mod.attackDamage === 'function') {
          d = mod.attackDamage(c, ctx);
        } else {
          d = v;
        }
        if (typeof mod.attackUnblockable === 'function') {
          unblock = mod.attackUnblockable(c);
        }
        if (typeof mod.attackGuard === 'function') {
          const g = mod.attackGuard(c);
          if (g > 0 && guard) guard(g);
        }
        if (typeof mod.attackFly === 'function') {
          const f = mod.attackFly(c);
          if (f > 0) {
            if (fly) fly(f);
            else a.fly = Math.min(2, (a.fly || 0) + f);
            const who = owner === 'player' ? 'player' : (owner === 'ai2' ? 'ai2' : 'ai');
            eng.emit('buff', '+' + f + '[飞翔]', null, { who, kind: 'fly', stacks: a.fly });
          }
        }
        if (typeof mod.attackClearPositive === 'function' && mod.attackClearPositive(c)) {
          if (clearPositiveBuffs) clearPositiveBuffs(t);
          else {
            t.guard = 0;
            t.fly = 0;
            t.crit = 0;
            t.chaos_red = false;
            t.chaos_yellow = false;
            t.chaos_blue = false;
            t.chaos_green = false;
          }
        }
        if (typeof mod.attackBleed === 'function') {
          const b = mod.attackBleed(c);
          if (b > 0 && bleed) bleed(b);
        }
        if (typeof mod.attackPoison === 'function') {
          const p = mod.attackPoison(c);
          if (p > 0 && poison) poison(p);
        }

        return { d, skip, unblock };
      },

      defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
        const { heal, hurt, poison } = helpers;

        if (c && c.potion) {
          heal(defender, 5);
          return { remaining: d, desc: '药剂牌防御：恢复5生命' };
        }

        const poisonAmt = typeof mod.defendPoison === 'function' ? (mod.defendPoison(c) || 0) : 0;
        const applyPoison = () => {
          if (poisonAmt > 0 && poison) poison(opponent, poisonAmt);
        };

        if (typeof mod.defendImmune === 'function' && mod.defendImmune(c)) {
          applyPoison();
          return { remaining: 0, desc: '免疫所有伤害' + (poisonAmt ? '，施加' + poisonAmt + '层中毒' : '') };
        }

        if (typeof mod.defendHeal === 'function') {
          const healAmt = mod.defendHeal(c);
          if (healAmt > 0) {
            heal(defender, healAmt);
            applyPoison();
            return {
              remaining: d,
              desc: '防御恢复' + healAmt + '生命' + (poisonAmt ? '，施加' + poisonAmt + '层中毒' : '')
            };
          }
        }

        if (typeof mod.defendCounter === 'function') {
          const counter = mod.defendCounter(c);
          if (counter > 0 && hurt) {
            hurt(opponent, counter);
            applyPoison();
            return {
              remaining: d,
              desc: '反击' + counter + '点伤害' + (poisonAmt ? '，施加' + poisonAmt + '层中毒' : '')
            };
          }
        }

        if (typeof mod.defendBlock === 'function') {
          const block = mod.defendBlock(c, d);
          const remaining = Math.max(0, d - block);
          applyPoison();
          return {
            remaining,
            desc: '格挡' + block + '点' + (poisonAmt ? '，施加' + poisonAmt + '层中毒' : '')
          };
        }

        if (v === 1) return { remaining: Math.max(0, d - Math.ceil(d / 2)), desc: '1牌防御' };
        if (v === 3) return { remaining: Math.max(0, d - Math.floor(d / 2)), desc: '3牌防御' };
        return { remaining: d, desc: '直接承受' };
      }
    });
  }

  function registerMonsterAI(mod) {
    AR.register({
      name: mod.name,

      attackScore(eng, v, c, x) {
        if (c && c.potion) return 90;
        if (!c || !c.isNumberCard) return null;
        return v * 10 + 20;
      },

      defendScore(eng, v, c, top, x) {
        if (c && c.potion) return 80;
        if (!c || !c.isNumberCard) return null;
        if (v > 3) return null;
        return v * 10 + 30 + (x.lethal ? 50 : 0);
      },

      keepScore(eng, c, x) {
        if (!c || !c.isNumberCard) return null;
        return c.value * 5;
      },

      skip() { return false; },
      specialEffect() { return null; }
    });
  }

  AdvR.allMonsters().forEach(mod => {
    registerMonsterChar(mod);
    registerMonsterAI(mod);
  });

  AdvR.allBosses().forEach(mod => {
    registerMonsterChar(mod);
    registerMonsterAI(mod);
  });

  function getAdventureNpcSkillDesc(charName, card, isDefend, opts = {}) {
    if (!card) return '';
    if (typeof window.getItemDesc === 'function' && card.isItemCard) {
      return window.getItemDesc(card) || '';
    }
    const name = String(charName || '').replace(/^AI\d*\s+/, '');
    let mod = AdvR.getMonster(name) || AdvR.getBoss(name);
    if (!mod) {
      return typeof window.getSkillDesc === 'function'
        ? (window.getSkillDesc(name, card, isDefend) || '')
        : '';
    }
    if (opts.stage) mod = applyStageMods(mod, opts.stage);

    if (isDefend) {
      let parts = [];
      if (typeof mod.defendImmune === 'function' && mod.defendImmune(card)) {
        parts.push('免疫所有伤害');
      }
      if (typeof mod.defendHeal === 'function') {
        const healAmt = mod.defendHeal(card);
        if (healAmt > 0) parts.push('恢复' + healAmt + '点生命');
      }
      if (typeof mod.defendPoison === 'function') {
        const p = mod.defendPoison(card);
        if (p > 0) parts.push('施加' + p + '层中毒');
      }
      if (typeof mod.defendCounter === 'function') {
        const counter = mod.defendCounter(card);
        if (counter > 0) parts.push('反击' + counter + '点伤害');
      }
      if (typeof mod.defendBlock === 'function') {
        const incoming = Number(opts.incomingDamage) || 0;
        if (incoming > 0) {
          const block = mod.defendBlock(card, incoming);
          if (block > 0) parts.push('格挡' + block + '点伤害');
        } else {
          const b8 = mod.defendBlock(card, 8);
          const b4 = mod.defendBlock(card, 4);
          if (b8 > 0 || b4 > 0) {
            if (b8 === b4) parts.push('格挡' + b8 + '点伤害');
            else if (b8 === Math.ceil(8 / 2) && b4 === Math.ceil(4 / 2)) parts.push('格挡半数伤害（向上取整）');
            else if (b8 === Math.floor(8 / 2) && b4 === Math.floor(4 / 2)) parts.push('格挡半数伤害');
            else parts.push('格挡' + b8 + '点伤害');
          }
        }
      }
      return parts.length ? parts.join('，') : '无防御效果';
    }

    const ctx = { playerHandSize: Number(opts.playerHandSize) || 0 };
    let parts = [];
    let dmg = 0;
    if (typeof mod.attackDamage === 'function') dmg = mod.attackDamage(card, ctx) || 0;
    else if (card.isNumberCard) dmg = card.value || 0;
    if (dmg > 0) {
      let line = '造成' + dmg + '点伤害';
      if (typeof mod.attackUnblockable === 'function' && mod.attackUnblockable(card)) {
        line += '（不可防御）';
      }
      parts.push(line);
    }
    if (typeof mod.attackGuard === 'function') {
      const g = mod.attackGuard(card);
      if (g > 0) parts.push('获得' + g + '层守护');
    }
    if (typeof mod.attackFly === 'function') {
      const f = mod.attackFly(card);
      if (f > 0) parts.push('获得' + f + '层飞翔');
    }
    if (typeof mod.attackClearPositive === 'function' && mod.attackClearPositive(card)) {
      parts.push('清除玩家所有正面buff');
    }
    if (typeof mod.attackBleed === 'function') {
      const b = mod.attackBleed(card);
      if (b > 0) parts.push('施加' + b + '层流血');
    }
    if (typeof mod.attackPoison === 'function') {
      const p = mod.attackPoison(card);
      if (p > 0) parts.push('施加' + p + '层中毒');
    }
    return parts.length ? parts.join('，') : '无进攻效果';
  }

  window.AdventureMonsterBridge = {
    registerMonsterChar,
    registerMonsterAI,
    applyStageMods,
    getAdventureNpcSkillDesc
  };
})();