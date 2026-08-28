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
    if (!mod || !mod.stageMods) return mod;
    let result = mod;
    for (let s = 1; s <= stage; s++) {
      if (typeof mod.stageMods[s] !== 'function') continue;
      const overrides = mod.stageMods[s](result);
      result = Object.assign({}, result, overrides);
    }
    return result;
  }

  function registerMonsterChar(mod) {
    CR.register({
      name: mod.name,
      hp: mod.hp || 30,
      type: mod.kind || '怪物',
      passive: '冒险模式怪物',
      adventureNpc: true,
      init() { return { guard: 0, fly: 0, lush: 0 }; },
      turnStart(eng, x, w) {
        if (w !== 'ai' && w !== 'ai2') return;
        if ((x.lush || 0) > 0) {
          const amt = Math.min(x.lush, 2);
          eng.heal(x, amt, 'passive');
        }
        if (typeof mod.attackTurnStart === 'function') mod.attackTurnStart(eng, x, w);
      },
      effect(eng, v, c, a, t, owner, helpers) {
        const { heal, guard, fly, bleed, poison, clearPositiveBuffs, draw } = helpers;
        let d = 0, skip = false, unblock = false;

        if (c && c.magic) {
          heal(a, AdvR.getBoss(mod.name) ? 5 : 3);
          if (clearPositiveBuffs) clearPositiveBuffs(t);
          return { d: 0, skip: false, unblock: false };
        }

        const ctx = { playerHandSize: eng.h.player ? eng.h.player.length : 0, playerBleed: (t.bleed || 0), playerPoison: (t.poison || 0), attackerLush: (a.lush || 0) };
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
            t.lush = 0;
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
        if (typeof mod.attackHeal === 'function') {
          const h = mod.attackHeal(c, ctx);
          if (h > 0) heal(a, h);
        }
        if (typeof mod.attackLush === 'function') {
          const l = mod.attackLush(c);
          if (l > 0) {
            a.lush = Math.min(2, (a.lush || 0) + l);
            const who = owner === 'player' ? 'player' : (owner === 'ai2' ? 'ai2' : 'ai');
            eng.emit('buff', '+' + l + '[茂盛]', null, { who, kind: 'lush', stacks: a.lush });
          }
        }
        if (typeof mod.attackDrawSelf === 'function' && mod.attackDrawSelf(c)) {
          if (draw) draw(owner, 1, true);
          else eng.draw(owner, 1, true);
          eng.emit('desc', a.name + '抽取1张牌');
        }
        if (typeof mod.attackStealItem === 'function' && mod.attackStealItem(c)) {
          const advEng = eng._adventureEngine;
          if (advEng && advEng.s && Array.isArray(advEng.s.consumables) && advEng.s.consumables.length > 0) {
            const idx = Math.floor(Math.random() * advEng.s.consumables.length);
            const stolen = advEng.s.consumables.splice(idx, 1)[0];
            const def = window.AdventureRegistry && window.AdventureRegistry.getItem(stolen);
            eng.emit('desc', '玩家被夺走道具：' + (def ? def.displayName : stolen));
          }
        }
        if (typeof mod.attackTransferDebuff === 'function' && mod.attackTransferDebuff(c)) {
          if ((a.burn || 0) > 0) { if (burn) burn(a.burn); else t.burn = Math.min(4, (t.burn || 0) + a.burn); a.burn = 0; }
          if ((a.bleed || 0) > 0) { if (bleed) bleed(a.bleed); else t.bleed = Math.min(2, (t.bleed || 0) + a.bleed); a.bleed = 0; }
          if ((a.poison || 0) > 0) { if (poison) poison(a.poison); else t.poison = Math.min(3, (t.poison || 0) + a.poison); a.poison = 0; }
          if (a.frozen) { t.frozen = true; a.frozen = false; }
          eng.emit('desc', a.name + '将自身所有debuff转移给' + t.name);
        }
        if (typeof mod.attackClearAllBuffs === 'function' && mod.attackClearAllBuffs(c)) {
          for (const x of [a, t]) {
            if (typeof eng.clearDebuffs === 'function') eng.clearDebuffs(x);
            else { x.burn = 0; x.bleed = 0; x.poison = 0; x.frozen = false; }
            if (typeof eng.clearPositiveBuffs === 'function') eng.clearPositiveBuffs(x);
            else { x.guard = 0; x.fly = 0; x.crit = 0; x.chaos_red = false; x.chaos_yellow = false; x.chaos_blue = false; x.chaos_green = false; }
            x.lush = 0;
          }
          eng.emit('desc', '清除双方所有buff');
        }

        return { d, skip, unblock };
      },

      defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
        const { heal, hurt, poison, bleed, clearDebuffs, draw } = helpers;

        if (c && c.magic) {
          const magicHp = AdvR.getBoss(mod.name) ? 5 : 3;
          heal(defender, magicHp);
          if (eng && typeof eng.clearPositiveBuffs === 'function') eng.clearPositiveBuffs(opponent);
          return { remaining: d, desc: '魔法牌防御：恢复' + magicHp + '生命，清除玩家正面buff' };
        }

        const poisonAmt = typeof mod.defendPoison === 'function' ? (mod.defendPoison(c) || 0) : 0;
        const applyPoison = () => {
          if (poisonAmt > 0 && poison) poison(opponent, poisonAmt);
        };
        const bleedAmt = typeof mod.defendBleed === 'function' ? (mod.defendBleed(c) || 0) : 0;
        const applyBleed = () => {
          if (bleedAmt > 0 && bleed) bleed(opponent, bleedAmt);
        };
        const suffix = () =>
          (poisonAmt ? '，施加' + poisonAmt + '层中毒' : '') +
          (bleedAmt ? '，施加' + bleedAmt + '层流血' : '');
        const drawSelfAmt = typeof mod.defendDrawSelf === 'function' ? (mod.defendDrawSelf(c) || 0) : 0;
        const applyDrawSelf = () => {
          if (drawSelfAmt > 0) {
            if (draw) draw(owner, drawSelfAmt, true);
            else eng.draw(owner, drawSelfAmt, true);
          }
        };
        const drawSelfDesc = drawSelfAmt > 0 ? '，抽取' + drawSelfAmt + '张牌' : '';

        if (typeof mod.defendImmune === 'function' && mod.defendImmune(c)) {
          if (typeof mod.defendImmuneBuff === 'function' && mod.defendImmuneBuff(c) && clearDebuffs) {
            clearDebuffs(defender);
          }
          applyPoison(); applyBleed(); applyDrawSelf();
          return { remaining: 0, desc: '免疫所有伤害' + (typeof mod.defendImmuneBuff === 'function' && mod.defendImmuneBuff(c) ? '，免疫buff' : '') + suffix() + drawSelfDesc };
        }

        const lushAmt = typeof mod.defendLush === 'function' ? (mod.defendLush(c) || 0) : 0;
        const applyLush = () => {
          if (lushAmt > 0) {
            defender.lush = Math.min(2, (defender.lush || 0) + lushAmt);
            const who = owner === 'player' ? 'player' : (owner === 'ai2' ? 'ai2' : 'ai');
            eng.emit('buff', '+' + lushAmt + '[茂盛]', null, { who, kind: 'lush', stacks: defender.lush });
          }
        };
        const lushDesc = lushAmt > 0 ? '，获得' + lushAmt + '层茂盛' : '';

        if (typeof mod.defendSplit === 'function' && mod.defendSplit(c)) {
          const split = Math.ceil(d / 2);
          if (hurt) hurt(opponent, split);
          applyPoison(); applyBleed(); applyDrawSelf(); applyLush();
          return {
            remaining: split,
            desc: '均摊伤害，双方各受' + split + '点' + suffix() + drawSelfDesc + lushDesc
          };
        }

        if (typeof mod.defendHeal === 'function') {
          const healAmt = mod.defendHeal(c);
          if (healAmt > 0) {
            heal(defender, healAmt);
            if (typeof mod.defendBlock === 'function') {
              const block = mod.defendBlock(c, d, defender);
              if (block > 0) {
                const remaining = Math.max(0, d - block);
                applyPoison(); applyBleed(); applyLush();
                return {
                  remaining,
                  desc: '恢复' + healAmt + '生命，格挡' + block + '点' + suffix() + lushDesc
                };
              }
            }
            applyPoison(); applyBleed(); applyLush();
            return {
              remaining: d,
              desc: '防御恢复' + healAmt + '生命' + suffix() + lushDesc
            };
          }
        }

        if (typeof mod.defendCounter === 'function') {
          const counter = mod.defendCounter(c);
          if (counter > 0 && hurt) {
            hurt(opponent, counter);
            applyPoison(); applyBleed(); applyDrawSelf(); applyLush();
            return {
              remaining: d,
              desc: '反击' + counter + '点伤害' + suffix() + drawSelfDesc + lushDesc
            };
          }
        }

        if (typeof mod.defendBlock === 'function') {
          const block = mod.defendBlock(c, d, defender);
          const remaining = Math.max(0, d - block);
          applyPoison(); applyBleed(); applyDrawSelf(); applyLush();
          return {
            remaining,
            desc: '格挡' + block + '点' + suffix() + drawSelfDesc + lushDesc
          };
        }

        applyLush();
        if (v === 1) return { remaining: Math.max(0, d - Math.ceil(d / 2)), desc: '1牌防御' + lushDesc };
        if (v === 3) return { remaining: Math.max(0, d - Math.floor(d / 2)), desc: '3牌防御' + lushDesc };
        return { remaining: d, desc: '直接承受' + lushDesc };
      }
    });
  }

  function registerMonsterAI(mod) {
    AR.register({
      name: mod.name,

      attackScore(eng, v, c, x) {
        if (c && c.magic) return 90;
        if (!c || !c.isNumberCard) return null;
        return v * 10 + 20;
      },

      defendScore(eng, v, c, top, x) {
        if (c && c.magic) return 80;
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
    if (card.isItemCard) {
      if (card.magic) {
        const isBoss = !!(AdvR.getBoss(String(charName || '').replace(/^AI\d*\s+/, '')));
        return '恢复' + (isBoss ? 5 : 3) + '[生命]，清除玩家所有正面buff，可搭桥继续出牌';
      }
      if (typeof window.getItemDesc === 'function') {
        return window.getItemDesc(card) || '';
      }
      return '';
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
        if (typeof mod.defendImmuneBuff === 'function' && mod.defendImmuneBuff(card)) {
          parts.push('免疫buff');
        }
      }
      if (typeof mod.defendHeal === 'function') {
        const healAmt = mod.defendHeal(card);
        if (healAmt > 0) parts.push('恢复' + healAmt + '点生命');
      }
      if (typeof mod.defendPoison === 'function') {
        const p = mod.defendPoison(card);
        if (p > 0) parts.push('施加' + p + '层中毒');
      }
      if (typeof mod.defendBleed === 'function') {
        const b = mod.defendBleed(card);
        if (b > 0) parts.push('施加' + b + '层流血');
      }
      if (typeof mod.defendCounter === 'function') {
        const counter = mod.defendCounter(card);
        if (counter > 0) parts.push('反击' + counter + '点伤害');
      }
      if (typeof mod.defendBlock === 'function') {
        const b8 = mod.defendBlock(card, 8);
        const b4 = mod.defendBlock(card, 4);
        if (b8 > 0 || b4 > 0) {
          const rem8 = 8 - b8, rem4 = 4 - b4;
          if (rem8 === rem4 && rem8 < 8) parts.push('将伤害降低为' + rem8 + '点');
          else if (b8 === b4) parts.push('格挡' + b8 + '点伤害');
          else if (b8 === Math.ceil(8 / 2) && b4 === Math.ceil(4 / 2)) parts.push('格挡半数伤害（向上取整）');
          else if (b8 === Math.floor(8 / 2) && b4 === Math.floor(4 / 2)) parts.push('格挡半数伤害');
          else parts.push('格挡' + b8 + '点伤害');
        }
      }
      if (typeof mod.defendDrawSelf === 'function') {
        const dd = mod.defendDrawSelf(card);
        if (dd > 0) parts.push('抽取' + dd + '张牌');
      }
      if (typeof mod.defendSplit === 'function' && mod.defendSplit(card)) {
        parts.push('与玩家均摊伤害（向上取整）');
      }
      return parts.length ? parts.join('，') : '无防御效果';
    }

    const ctx = { playerHandSize: Number(opts.playerHandSize) || 0, playerPoison: Number(opts.playerPoison) || 0, attackerLush: Number(opts.attackerLush) || 0 };
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
    if (typeof mod.attackHeal === 'function') {
      const h = mod.attackHeal(card, ctx);
      if (h > 0) parts.push('恢复' + h + '点生命');
    }
    if (typeof mod.attackStealItem === 'function' && mod.attackStealItem(card)) {
      parts.push('玩家随机丢失1个道具');
    }
    if (typeof mod.attackDrawSelf === 'function' && mod.attackDrawSelf(card)) {
      parts.push('抽取1张牌');
    }
    if (typeof mod.attackTransferDebuff === 'function' && mod.attackTransferDebuff(card)) {
      parts.push('将自身debuff转移给对手');
    }
    if (typeof mod.attackClearAllBuffs === 'function' && mod.attackClearAllBuffs(card)) {
      parts.push('清除双方所有buff');
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