/**
 * 怪物注册桥接 —— 把冒险模式怪物注册到 1v1 的 CharacterRegistry 和 AIRegistry，
 * 使 1v1 引擎和 UI 可以直接用于冒险模式战斗。
 */
(function () {
  const random = () => window.FurryGame && window.FurryGame.CombatRuntime
    ? window.FurryGame.CombatRuntime.random() : Math.random();
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
      init() {
        return {
          guard: 0,
          fly: 0,
          lush: Math.max(0, Number(mod.initialLush) || 0),
          crit: 0
        };
      },
      turnStart(eng, x, w) {
        if (w !== 'ai' && w !== 'ai2') return;
        if ((x.lush || 0) > 0) {
          const amt = Math.min(x.lush, 2);
          eng.heal(x, amt, 'passive');
        }
        if (typeof mod.attackTurnStart === 'function') mod.attackTurnStart(eng, x, w);
      },
      attackEffectTiming(v, eng) {
        // The registered definition already contains its cumulative stage modifiers.
        const active = mod;
        if (typeof active.attackEffectTiming === 'function') return active.attackEffectTiming(v);
        // Ladybug explicitly gains lush BEFORE its attack; Kraken purges first.
        const before = mod.name === 'ForestLadybug' && v >= 4 && v <= 6 ||
          mod.name === 'FrozenKraken' && v === 0 ||
          mod.name === 'ForestPython' && (v === 0 || v >= 4 && v <= 6) ||
          mod.name === 'ForestPanda' && v === 0 ||
          mod.name === 'ForestDryad' && (v === 0 || v >= 1 && v <= 3) ||
          mod.name === 'CastleEagle' && (v === 0 || v >= 4 && v <= 6) ||
          mod.name === 'CastleGargoyle' && v >= 1 && v <= 6;
        return before ? 'beforeDamage' : 'afterDamage';
      },
      damageAtSettlement(eng, v, a, t) {
        const active = mod; // Do not replace the staged definition with the raw registry entry.
        const card = eng.s.atkCard;
        // Card/dice judgment damage is locked to its revealed result, not rolled again.
        if (!card || typeof active.attackDamage!=='function' ||
            active.attackRevealDraw || active.attackOctopusJudge || active.attackKrakenJudge) return null;
        const owner = eng._who(a), hand=eng.h[owner] || [];
        const total = window.FurryGame.StatusRegistry.all.reduce((sum,def) => sum+window.FurryGame.StatusRegistry.amount(t,def.id),0);
        const ctx = {playerHandSize:(eng.h.player||[]).length,attackerHandSize:hand.length,attackerHand:hand,
          playerBleed:t.bleed||0,playerPoison:t.poison||0,attackerLush:a.lush||0,playerBuffTotal:total};
        const drain = typeof active.attackDrain==='function' ? Number(active.attackDrain(card,ctx)) || 0 : 0;
        const damage=Number(active.attackDamage(card,ctx)) || 0;
        return damage > 0 ? damage : drain > 0 ? drain : damage;
      },
      damageAfterDefense(v, damage, defender, eng) {
        const active = mod, card = eng.s.defCard;
        // Recompute arithmetic only: never repeat dice, counters or status gains.
        if (typeof active.defendImmune==='function' && active.defendImmune(card)) return 0;
        if (typeof active.defendSplit==='function' && active.defendSplit(card)) return Math.ceil(damage/2);
        if (typeof active.defendBlock==='function') return Math.max(0,damage-(active.defendBlock(card,damage,defender,eng)||0));
        return null;
      },
      effect(eng, v, c, a, t, owner, helpers) {
        const { heal, guard, fly, bleed, poison, clearPositiveBuffs, draw } = helpers;
        let d = 0, skip = false, unblock = false, drain = 0;
        // 冻洋蓝鲸专属效果：仅当攻击方是 FrozenWhale NPC 时触发
        const isFrozenWhale = a && (a === eng.s.ai || a === eng.s.ai2) && eng.name && eng.name(a) === 'FrozenWhale'
          || (c && c.borrowedMonster && c.borrowedMonsterName === 'FrozenWhale');

        if (c && (c.magic || c.greenMagic || c.magicColor)) {
          heal(a, AdvR.getBoss(mod.name) ? 5 : 3);
          if (c.greenMagic || c.magicColor === 'green') {
            if (typeof eng.clearDebuffs === 'function') eng.clearDebuffs(a);
          } else if (clearPositiveBuffs) clearPositiveBuffs(t);
          return { d: 0, skip: false, unblock: false };
        }

        // 白7：轮空，无进攻效果（所有怪物/Boss 通用）
        if (c && c.isNumberCard && c.value === 7) {
          return { d: 0, skip: false, unblock: false };
        }

        const attackerKey = a === eng.s.ai2 ? 'ai2' : (a === eng.s.ai ? 'ai' : 'player');
        const buffTotal = (t) =>
          (t.burn || 0) + (t.bleed || 0) + (t.poison || 0) + (t.blind || 0) + (t.iceSeal || 0) +
          (t.guard || 0) + (t.fly || 0) + (t.parasite || 0) + (t.bomb || 0) + (t.hypothermia || 0) +
          (t.crit || 0) + (t.lush || 0) + (t.frozen ? 1 : 0) + (t.diving ? 1 : 0) + (t.bloodthirst ? 1 : 0) +
          (t.chaos_red ? 1 : 0) + (t.chaos_yellow ? 1 : 0) + (t.chaos_blue ? 1 : 0) + (t.chaos_green ? 1 : 0);
        const ctx = {
          playerHandSize: eng.h.player ? eng.h.player.length : 0,
          attackerHandSize: eng.h[attackerKey] ? eng.h[attackerKey].length : 0,
          attackerHand: eng.h[attackerKey] || [],
          playerBleed: (t.bleed || 0), playerPoison: (t.poison || 0), attackerLush: (a.lush || 0),
          playerBuffTotal: buffTotal(t)
        };
        if (typeof mod.attackDamage === 'function') {
          d = mod.attackDamage(c, ctx);
        } else {
          d = v;
        }
        // 冻洋海豹专属：进攻1/2/3从牌堆抽一张牌展示，造成对应数字伤害
        if (typeof mod.attackRevealDraw === 'function' && mod.attackRevealDraw(c)) {
          const pile = eng.piles && eng.piles[attackerKey];
          if (pile) {
            if (typeof eng._refillPile === 'function') eng._refillPile(attackerKey);
            if (pile.deck.length) {
              const drawn = pile.deck.pop();
              eng.emit('reveal', a.name + '从牌堆抽出' + eng.cardText(drawn) + '展示', drawn, { who: attackerKey, from: 'deck' });
              if (drawn.isItemCard) {
                pile.hand.push(drawn);
                d = 0;
                eng.emit('desc', eng.cardText(drawn) + '加入' + a.name + '手牌');
              } else {
                d = drawn.value;
                pile.discard.push(drawn);
                eng.emit('desc', a.name + '造成' + d + '点伤害，' + eng.cardText(drawn) + '放入弃牌堆');
              }
            }
          }
        }
        // 冻洋章鱼专属：进攻1/2/3抽取玩家牌库一张牌判定；普通颜色3点伤害并放回玩家牌库底，黑/白牌（含战利白卡）5点伤害并置入玩家弃牌堆
        if (typeof mod.attackOctopusJudge === 'function' && mod.attackOctopusJudge(c)) {
          const pp = eng.piles && eng.piles.player;
          if (pp) {
            if (typeof eng._refillPile === 'function') eng._refillPile('player');
            if (pp.deck.length) {
              const drawn = pp.deck.pop();
              eng.emit('reveal', a.name + '抽取玩家牌库' + eng.cardText(drawn) + '判定', drawn, { who: 'player', from: 'deck' });
              const isBW = !!(drawn.isBlack || drawn.isWhite || drawn.trophyWhite || !drawn.isNumberCard);
              if (typeof mod.attackOctopusJudgeDamage === 'function') d = mod.attackOctopusJudgeDamage(isBW);
              else d = isBW ? 5 : 3;
              if (isBW) {
                pp.discard.push(drawn);
                eng.emit('desc', eng.cardText(drawn) + '为黑/白牌，造成' + d + '点伤害并置入玩家弃牌堆');
              } else {
                pp.deck.unshift(drawn);
                eng.emit('desc', eng.cardText(drawn) + '为普通颜色，造成' + d + '点伤害并放回玩家牌库底');
              }
            }
          }
        }
        // 克拉肯专属：进攻1/2/3抽取玩家牌库一张牌判定；彩色牌造成对应数字伤害，黑白牌不造成伤害；伤害为0走弃牌库分支（跳过防御、潜水、冰封），伤害>0走回牌库分支
        if (typeof mod.attackKrakenJudge === 'function' && mod.attackKrakenJudge(c)) {
          const pp = eng.piles && eng.piles.player;
          if (pp) {
            if (typeof eng._refillPile === 'function') eng._refillPile('player');
            if (pp.deck.length) {
              const drawn = pp.deck.pop();
              eng.emit('reveal', a.name + '抽取玩家牌库' + eng.cardText(drawn) + '判定', drawn, { who: 'player', from: 'deck' });
              const isColorNumber = !!(drawn.isNumberCard && !drawn.isBlack && !drawn.isWhite && !drawn.trophyWhite);
              const judgeDmg = isColorNumber ? Math.max(0, Number(drawn.value) || 0) : 0;
              if (judgeDmg === 0) {
                d = 0;
                unblock = true;
                pp.discard.push(drawn);
                eng.emit('desc', eng.cardText(drawn) + '伤害为0，置入玩家弃牌堆并跳过防御');
                if (!a.diving) {
                  a.diving = true;
                  const diveWho = attackerKey === 'ai2' ? 'ai2' : (attackerKey === 'ai' ? 'ai' : 'player');
                  eng.emit('buff', '[潜水]', null, { who: diveWho, kind: 'diving', stacks: 1 });
                }
                if (typeof eng.iceSeal === 'function') eng.iceSeal(t);
                else t.iceSeal = Math.min(1, (t.iceSeal || 0) + 1);
              } else {
                d = judgeDmg;
                pp.deck.unshift(drawn);
                eng.emit('desc', eng.cardText(drawn) + '造成' + d + '点伤害并放回玩家牌库底');
              }
            }
          }
        }
        // 克拉肯专属0牌：施加1层失温，清除自身所有负面效果，造成3+清除层数点伤害
        if (typeof mod.attackKrakenPurge === 'function' && mod.attackKrakenPurge(c)) {
          if (typeof eng.hypothermia === 'function') eng.hypothermia(t, 1);
          else t.hypothermia = Math.min(2, (t.hypothermia || 0) + 1);
          let cleared = Math.max(0, Number(a.burn) || 0) + Math.max(0, Number(a.bleed) || 0)
            + Math.max(0, Number(a.poison) || 0) + Math.max(0, Number(a.bomb) || 0)
            + Math.max(0, Number(a.hypothermia) || 0) + Math.max(0, Number(a.thorns) || 0)
            + Math.max(0, Number(a.sandblind) || 0)
            + Math.max(0, Number(a.quicksand) || 0);
          if (a.frozen) cleared += 1;
          if (a.blind) cleared += 1;
          if (a.iceSeal) cleared += 1;
          if (a.hypnosis) cleared += 1;
          if (a.sleep) cleared += 1;
          if (a.scorch) cleared += 1;
          if (typeof eng.clearDebuffs === 'function') eng.clearDebuffs(a);
          d = 3 + cleared;
          eng.emit('desc', a.name + '清除自身' + cleared + '层负面效果，造成' + d + '点伤害');
        }
        if (typeof mod.attackUnblockable === 'function') {
          unblock = mod.attackUnblockable(c);
        }
        // 伤害低于阈值时不可防御（克拉肯0牌常驻<5；stage3 起全牌适用）
        if (!unblock && typeof mod.attackUnblockableBelow === 'function') {
          const belowThreshold = Number(mod.attackUnblockableBelow(c)) || 0;
          if (belowThreshold > 0 && d > 0 && d < belowThreshold) unblock = true;
        }
        // 条件不可防御：目标有指定 buff 时不可防御（沙虫沙盲/蝎子中毒）
        if (!unblock && typeof mod.attackUnblockableIfBuff === 'function' && mod.attackUnblockableIfBuff(c, t)) {
          unblock = true;
        }
        let aoeTargets = null;
        let aoeDamage = 0;
        let hypothermiaTarget = null;
        let hypothermiaAmount = 0;
        if (isFrozenWhale && typeof mod.attackAoEOtherChars === 'function') {
          const aoeDmg = mod.attackAoEOtherChars(c);
          if (aoeDmg > 0) {
            // AOE deferred to settleAIAttack; only fire when there are OTHER characters to hit.
            // In 1v1 adventure, FrozenWhale is the only enemy → no one else to AOE.
            const atkKey = a === eng.s.ai2 ? 'ai2' : (a === eng.s.ai ? 'ai' : 'player');
            const victims = typeof eng._allKeysExcept === 'function' ? eng._allKeysExcept(atkKey) : [];
            if (victims.length > 0) {
              aoeTargets = victims;
              aoeDamage = aoeDmg;
              if (eng.s && eng.s.pendingAttack) {
                eng.s.pendingAttack.aoeTargets = victims;
                eng.s.pendingAttack.aoeDamage = aoeDmg;
              }
            }
          }
        }
        // 延迟失温：防御结束后施加给被攻击目标（默认先伤害后施加；显式 beforeDamage 时走统一状态队列）
        // 同时写回返回值，供 AI 在 effect 之后创建 pendingAttack 时带上字段。
        if (typeof mod.attackHypothermia === 'function') {
          const hyAmt = mod.attackHypothermia(c);
          if (hyAmt > 0) {
            if (typeof mod.attackEffectTiming === 'function' && mod.attackEffectTiming(v) === 'beforeDamage') {
              // Unified skill capture defers this operation until after defense, before damage.
              eng.hypothermia(t, hyAmt);
            } else {
              hypothermiaTarget = t === eng.s.ai2 ? 'ai2' : (t === eng.s.ai ? 'ai' : 'player');
              hypothermiaAmount = hyAmt;
              if (eng.s && eng.s.pendingAttack) {
                eng.s.pendingAttack.hypothermiaTarget = hypothermiaTarget;
                eng.s.pendingAttack.hypothermiaAmount = hyAmt;
              }
            }
          }
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
        // 进攻获得寄生（上限1，沙虫4/5/6）
        if (typeof mod.attackParasite === 'function') {
          const p = mod.attackParasite(c);
          if (p > 0) {
            a.parasite = Math.min(1, (a.parasite || 0) + p);
            const who = owner === 'player' ? 'player' : (owner === 'ai2' ? 'ai2' : 'ai');
            eng.emit('buff', '+' + p + '[寄生]', null, { who, kind: 'parasite', stacks: a.parasite });
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
        if (typeof mod.attackBurn === 'function') {
          const burnAmt = Math.max(0, Number(mod.attackBurn(c)) || 0);
          if (burnAmt > 0) {
            if (typeof eng.burn === 'function') eng.burn(t, burnAmt, { silent: true });
            else t.burn = Math.min(5, (t.burn || 0) + burnAmt);
          }
        }
        // 冻洋管虫 4/5/6：施加灼伤后立刻结算一次（配合 immediateBuffs，避免 defer 回滚剩余层数）
        if (typeof mod.attackBurnSettle === 'function' && mod.attackBurnSettle(c) && (t.burn || 0) > 0) {
          if (typeof eng.settleBurn === 'function') eng.settleBurn(t);
        }
        if (typeof mod.attackPoison === 'function') {
          const p = mod.attackPoison(c);
          if (p > 0 && poison) poison(p);
        }
        if (typeof mod.attackBlind === 'function' && mod.attackBlind(c)) {
          // Apply silently; attack debuffs are deferred until defense settles.
          // Emitting [致盲] here would flash the icon and then vanish on defer.
          if (typeof eng.blind === 'function') eng.blind(t, { silent: true });
          else t.blind = 1;
        }
        if (typeof mod.attackFreeze === 'function' && mod.attackFreeze(c)) {
          if (typeof eng.freeze === 'function') eng.freeze(t, { silent: true });
          else t.frozen = true;
        }
        if (typeof mod.attackIceSeal === 'function' && mod.attackIceSeal(c)) {
          if (typeof eng.iceSeal === 'function') eng.iceSeal(t, { silent: true });
          else t.iceSeal = Math.min(1, (t.iceSeal || 0) + 1);
        }
        // 沙漠骆驼：进攻1/2/3施加沙盲（层数，与攻击debuff一致延迟到防御结算后）
        if (typeof mod.attackSandblind === 'function') {
          const sb = Math.max(0, Number(mod.attackSandblind(c)) || 0);
          if (sb > 0) {
            if (typeof eng.sandblind === 'function') eng.sandblind(t, sb, { silent: true });
            else t.sandblind = Math.min(6, (t.sandblind || 0) + sb);
          }
        }
        if(typeof mod.attackQuicksand === 'function'){
          const sb = Math.max(0, Number(mod.attackQuicksand(c)) || 0);
          if (sb > 0) {
            if (typeof eng.quicksand === 'function') eng.quicksand(t, sb, { silent: true });
            else t.quicksand = Math.min(6, (t.quicksand || 0) + sb);
          }
        }
        // 沙漠骆驼：进攻4/5/6施加荆棘（上限1，延迟到防御结算后）
        if (typeof mod.attackThorns === 'function') {
          const th = Math.max(0, Number(mod.attackThorns(c)) || 0);
          if (th > 0) {
            if (typeof eng.thorns === 'function') eng.thorns(t, th, { silent: true });
            else t.thorns = Math.min(1, (t.thorns || 0) + th);
          }
        }
        // 圣甲虫：进攻1/2/3按技能牌颜色施加不同 buff
        if (typeof mod.attackColorBuff === 'function') {
          const cb = mod.attackColorBuff(c);
          if (cb) {
            if (cb.burn) {
              if (typeof eng.burn === 'function') eng.burn(t, cb.burn, { silent: true });
              else t.burn = Math.min(5, (t.burn || 0) + cb.burn);
            }
            if (cb.thorns) {
              if (typeof eng.thorns === 'function') eng.thorns(t, cb.thorns, { silent: true });
              else t.thorns = Math.min(1, (t.thorns || 0) + cb.thorns);
            }
            if (cb.iceSeal && typeof eng.iceSeal === 'function') eng.iceSeal(t, cb.iceSeal, { silent: true });
            if (cb.poison && poison) poison(cb.poison);
          }
        }
        // Life steal: unblockable card defense; fly/guard still reduce the amount,
        // and heal syncs to HP actually lost at settlement (pendingAttack.isDrain).
        if (typeof mod.attackDrain === 'function') {
          drain = Math.max(0, Number(mod.attackDrain(c, ctx)) || 0);
          if (drain > 0) {
            if (!(d > 0)) d = drain;
            unblock = true;
          }
        } else if (typeof mod.attackHeal === 'function') {
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
        // 自伤：调用 attackSelfHurt(card, ctx) 返回自伤数字，bridge 通过 hurt(attacker, n) 应用
        // 结算顺序：在主要 buff（守护/飞翔/流血/中毒/冷冻/冰封/buff 清除/茂盛）结算之后、
        // 吸血/治疗之前执行；不绕过防守方防御；不与 buff 共享任何减免
        if (typeof mod.attackSelfHurt === 'function') {
          const selfAmt = Math.max(0, Number(mod.attackSelfHurt(c, ctx)) || 0);
          if (selfAmt > 0) {
            const who = owner === 'player' ? 'player' : (owner === 'ai2' ? 'ai2' : 'ai');
            eng.hurt(a, selfAmt);
            eng.emit('desc', a.name + '自伤' + selfAmt + '点');
          }
        }
        // 冻洋蓝鲸专属：获得潜水（上限1）
        if (typeof mod.attackGainDiving === 'function' && mod.attackGainDiving(c)) {
          if (!a.diving) {
            a.diving = true;
            const who = owner === 'player' ? 'player' : (owner === 'ai2' ? 'ai2' : 'ai');
            eng.emit('buff', '[潜水]', null, { who, kind: 'diving', stacks: 1 });
          }
        }
        // 蟒蛇专属：满足条件时抽一张牌（仅当玩家有 ≥2 层中毒时）
        if (typeof mod.attackDrawSelf === 'function' && mod.attackDrawSelf(c, ctx)) {
          if (draw) draw(owner, 1, true);
          else eng.draw(owner, 1, true);
          eng.emit('desc', a.name + '抽取1张牌');
        }
        if (typeof mod.attackStealItem === 'function' && mod.attackStealItem(c) && !(eng.s && eng.s.borrowedMonsterSkill)) {
          const advEng = eng._adventureEngine;
          if (advEng && advEng.s && Array.isArray(advEng.s.consumables) && advEng.s.consumables.length > 0) {
            const idx = Math.floor(random() * advEng.s.consumables.length);
            const stolen = advEng.s.consumables.splice(idx, 1)[0];
            const def = window.AdventureRegistry && window.AdventureRegistry.getItem(stolen);
            eng.emit('desc', '玩家被夺走道具：' + (def ? def.displayName : stolen));
          }
        }
        if (typeof mod.attackTransferDebuff === 'function' && mod.attackTransferDebuff(c)) {
          if ((a.burn || 0) > 0) { if (burn) burn(a.burn); else t.burn = Math.min(5, (t.burn || 0) + a.burn); a.burn = 0; }
          if ((a.bleed || 0) > 0) { if (bleed) bleed(a.bleed); else t.bleed = Math.min(3, (t.bleed || 0) + a.bleed); a.bleed = 0; }
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
        // 冻洋北极熊：进攻1/2/3 伤害>4且有暴击时消耗1层使攻击不可防御（暴击通用设定）
        if (typeof mod.attackUseCrit === 'function' && mod.attackUseCrit(c) && (a.crit || 0) > 0 && d > 4) {
          a.crit--;
          unblock = true;
          const who = owner === 'player' ? 'player' : (owner === 'ai2' ? 'ai2' : 'ai');
          eng.emit('buff', '-1[暴击]', null, { who, kind: 'crit', stacks: a.crit });
          eng.emit('desc', a.name + '消耗1层暴击使攻击不可防御');
        }
        // 冻洋北极熊：进攻4/5/6 获得1层暴击（上限2）
        if (typeof mod.attackGainCrit === 'function') {
          const gc = mod.attackGainCrit(c);
          if (gc > 0) {
            a.crit = Math.min(2, (a.crit || 0) + gc);
            const who = owner === 'player' ? 'player' : (owner === 'ai2' ? 'ai2' : 'ai');
            eng.emit('buff', '+' + gc + '[暴击]', null, { who, kind: 'crit', stacks: a.crit });
          }
        }

        const settleTargetBurn = typeof mod.attackBurnSettle === 'function' && !!mod.attackBurnSettle(c);
        return {
          d, skip, unblock, drain, isDrain: drain > 0, aoeTargets, aoeDamage,
          hypothermiaTarget, hypothermiaAmount,
          immediateBuffs: settleTargetBurn,
          settleTargetBurn
        };
      },

      defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
        const { heal, hurt, poison, bleed, clearDebuffs, draw } = helpers;

        if (c && (c.magic || c.greenMagic || c.magicColor)) {
          const magicHp = AdvR.getBoss(mod.name) ? 5 : 3;
          heal(defender, magicHp);
          if (c.greenMagic || c.magicColor === 'green') {
            if (eng && typeof eng.clearDebuffs === 'function') eng.clearDebuffs(defender);
            return { remaining: d, desc: '绿魔法防御：恢复' + magicHp + '生命，清除自身负面状态' };
          }
          if (eng && typeof eng.clearPositiveBuffs === 'function') eng.clearPositiveBuffs(opponent);
          return { remaining: d, desc: '紫魔法防御：恢复' + magicHp + '生命，清除玩家正面buff' };
        }

        // 白7：轮空，无防御效果（大王花等 canDefendHigh 仍可打出）
        if (c && c.isNumberCard && c.value === 7) {
          return { remaining: d, desc: '无防御效果' };
        }

        // 克拉肯0牌：反击后玩家选择1张手牌弃掉（弃牌选择在本次防御结算后打开）
        if (typeof mod.defendPlayerDiscard === 'function' && mod.defendPlayerDiscard(c)
          && opponent && eng.s && opponent === eng.s.player) {
          if (opponent.alive && eng.h && (eng.h.player || []).length) {
            eng.s.pendingKrakenDefendDiscard = true;
            eng.emit('desc', '克拉肯0牌：反击后请选择1张手牌弃掉');
          } else {
            eng.emit('desc', '克拉肯0牌：无手牌可弃');
          }
        }

        const poisonAmt = typeof mod.defendPoison === 'function' ? (mod.defendPoison(c) || 0) : 0;
        const applyPoison = () => {
          if (poisonAmt > 0 && poison) poison(opponent, poisonAmt);
        };
        const bleedAmt = typeof mod.defendBleed === 'function' ? (mod.defendBleed(c) || 0) : 0;
        const applyBleed = () => {
          if (bleedAmt > 0 && bleed) bleed(opponent, bleedAmt);
        };
        const hypothermiaAmt = typeof mod.defendHypothermia === 'function' ? (mod.defendHypothermia(c) || 0) : 0;
        const applyHypothermia = () => {
          if (hypothermiaAmt > 0 && typeof eng.hypothermia === 'function') {
            eng.hypothermia(opponent, hypothermiaAmt);
          }
        };
        const thornsAmt = typeof mod.defendThorns === 'function' ? (mod.defendThorns(c) || 0) : 0;
        const applyThorns = () => {
          if (thornsAmt > 0) {
            if (typeof eng.thorns === 'function') eng.thorns(opponent, thornsAmt);
            else opponent.thorns = Math.min(1, (opponent.thorns || 0) + thornsAmt);
          }
        };
        const sandblindDefAmt = typeof mod.defendSandblind === 'function' ? (mod.defendSandblind(c) || 0) : 0;
        const applySandblind = () => {
          if (sandblindDefAmt > 0) {
            if (typeof eng.sandblind === 'function') eng.sandblind(opponent, sandblindDefAmt);
            else opponent.sandblind = Math.min(6, (opponent.sandblind || 0) + sandblindDefAmt);
          }
        };
        const poisonDrainConfig = typeof mod.defendPoisonDrain === 'function' ? mod.defendPoisonDrain(c) : null;
        const applyPoisonDrain = () => {
          if (poisonDrainConfig && poisonDrainConfig.poison > 0 && poison) {
            poison(opponent, poisonDrainConfig.poison);
            const poisonStacks = opponent.poison || 0;
            const drainAmount = poisonStacks + (poisonDrainConfig.drain || 0);
            if (drainAmount > 0) heal(defender, drainAmount);
          }
        };
        const clearSelfDebuffs = typeof mod.defendClearDebuffs === 'function' ? !!mod.defendClearDebuffs(c) : false;
        const applyClearSelfDebuffs = () => {
          if (clearSelfDebuffs && clearDebuffs) clearDebuffs(defender);
        };
        const clearSelfDebuffsDesc = clearSelfDebuffs ? '，清除自身所有负面状态' : '';
        const suffix = () =>
          (poisonAmt ? '，施加' + poisonAmt + '层中毒' : '') +
          (bleedAmt ? '，施加' + bleedAmt + '层流血' : '') +
          (hypothermiaAmt ? '，施加' + hypothermiaAmt + '层[失温]' : '') +
          (thornsAmt ? '，施加' + thornsAmt + '层荆棘' : '');
        if (typeof mod.defendRollImmune === 'function' && mod.defendRollImmune(c, eng, defender, d, owner)) {
          return { remaining: 0, desc: '12面骰判定成功，免疫所有伤害和buff' };
        }
        const drawSelfAmt = typeof mod.defendDrawSelf === 'function' ? (mod.defendDrawSelf(c) || 0) : 0;
        const applyDrawSelf = () => {
          if (drawSelfAmt > 0) {
            if (draw) draw(owner, drawSelfAmt, true);
            else eng.draw(owner, drawSelfAmt, true);
          }
        };
        const drawSelfDesc = drawSelfAmt > 0 ? '，抽取' + drawSelfAmt + '张牌' : '';

        const guardAmt = typeof mod.defendGuard === 'function' ? (mod.defendGuard(c) || 0) : 0;
        const applyGuard = () => {
          if (guardAmt > 0) {
            defender.guard = Math.min(5, (defender.guard || 0) + guardAmt);
            const who = owner === 'player' ? 'player' : (owner === 'ai2' ? 'ai2' : 'ai');
            eng.emit('buff', '+' + guardAmt + '[守护]', null, { who, kind: 'guard', stacks: defender.guard });
          }
        };
        const guardDesc = guardAmt > 0 ? '，获得' + guardAmt + '层守护' : '';

        const allLushAmt = typeof mod.defendAllLush === 'function' ? (mod.defendAllLush(c) || 0) : 0;
        const applyAllLush = () => {
          if (allLushAmt > 0) {
            const targets = [eng.s.ai];
            if (eng.s.is1v2 && eng.s.ai2 && eng.s.ai2.alive) targets.push(eng.s.ai2);
            for (const t of targets) {
              if (!t.alive) continue;
              t.lush = Math.min(2, (t.lush || 0) + allLushAmt);
              const who = t === eng.s.player ? 'player' : (t === eng.s.ai2 ? 'ai2' : 'ai');
              eng.emit('buff', '+' + allLushAmt + '[茂盛]', null, { who, kind: 'lush', stacks: t.lush });
            }
          }
        };
        const allLushDesc = allLushAmt > 0 ? '，全体友方获得' + allLushAmt + '层茂盛' : '';

        const allHealAmt = typeof mod.defendAllHeal === 'function' ? (mod.defendAllHeal(c) || 0) : 0;
        const applyAllHeal = () => {
          if (allHealAmt > 0) {
            const targets = [eng.s.ai];
            if (eng.s.is1v2 && eng.s.ai2 && eng.s.ai2.alive) targets.push(eng.s.ai2);
            for (const t of targets) {
              if (!t.alive) continue;
              heal(t, allHealAmt);
            }
          }
        };
        const allHealDesc = allHealAmt > 0 ? '，全体友方恢复' + allHealAmt + '点生命' : '';

        const gainDiving = typeof mod.defendGainDiving === 'function' && !!mod.defendGainDiving(c);
        const applyDiving = () => {
          if (!gainDiving || defender.diving) return;
          if (typeof eng.setDiving === 'function') eng.setDiving(defender, true);
          else {
            defender.diving = true;
            const who = owner === 'player' ? 'player' : (owner === 'ai2' ? 'ai2' : 'ai');
            eng.emit('buff', '[潜水]', null, { who, kind: 'diving', stacks: 1 });
          }
        };
        const divingDesc = gainDiving ? '，获得[潜水]' : '';

        const applyAllExtras = () => { applyGuard(); applyAllLush(); applyAllHeal(); applyDiving(); };
        const allExtrasDesc = guardDesc + allLushDesc + allHealDesc + divingDesc;

        if (typeof mod.defendImmune === 'function' && mod.defendImmune(c)) {
          if (typeof mod.defendImmuneBuff === 'function' && mod.defendImmuneBuff(c) && clearDebuffs) {
            clearDebuffs(defender);
          }
          let counterDesc = '';
          if (typeof mod.defendCounter === 'function') {
            const counter = mod.defendCounter(c, d, defender, opponent, eng);
            if (counter > 0 && hurt) {
              hurt(opponent, counter);
              counterDesc = '，反击' + counter + '点伤害';
            }
          }
          applyClearSelfDebuffs();
          applyPoison(); applyBleed(); applyHypothermia(); applyThorns(); applySandblind(); applyPoisonDrain();applyDrawSelf(); applyAllExtras();
          const clearText = (typeof mod.defendImmuneBuff === 'function' && mod.defendImmuneBuff(c))
            ? '，免疫buff，清除自身所有debuff'
            : '';
          return { remaining: 0, desc: '免疫所有伤害' + counterDesc + clearText + suffix() + clearSelfDebuffsDesc + drawSelfDesc + allExtrasDesc };
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

        const parasiteAmt = typeof mod.defendParasite === 'function' ? (mod.defendParasite(c) || 0) : 0;
        const applyParasite = () => {
          if (parasiteAmt > 0) {
            defender.parasite = Math.min(1, (defender.parasite || 0) + parasiteAmt);
            const who = owner === 'player' ? 'player' : (owner === 'ai2' ? 'ai2' : 'ai');
            eng.emit('buff', '+1[寄生]', null, { who, kind: 'parasite', stacks: defender.parasite });
          }
        };
        const parasiteDesc = parasiteAmt > 0 ? '，获得' + parasiteAmt + '层寄生' : '';
        const applyLushAndParasite = () => { applyLush(); applyParasite(); };
        const lushParasiteDesc = lushDesc + parasiteDesc;


        if (typeof mod.defendSplit === 'function' && mod.defendSplit(c)) {
          const split = Math.ceil(d / 2);
          if (hurt) hurt(opponent, split);
          applyClearSelfDebuffs();
          applyPoison(); applyBleed(); applyHypothermia(); applyThorns(); applySandblind(); applyPoisonDrain();applyDrawSelf(); applyLushAndParasite(); applyAllExtras();
          return {
            remaining: split,
            desc: '均摊伤害，双方各受' + split + '点' + suffix() + clearSelfDebuffsDesc + drawSelfDesc + lushParasiteDesc + allExtrasDesc
          };
        }

        if (typeof mod.defendHeal === 'function') {
          const healAmt = mod.defendHeal(c);
          if (healAmt > 0) {
            heal(defender, healAmt);
            if (typeof mod.defendBlock === 'function') {
              const block = mod.defendBlock(c, d, defender, eng);
              if (block > 0) {
                const remaining = Math.max(0, d - block);
                applyPoison(); applyBleed(); applyHypothermia(); applyThorns(); applySandblind(); applyPoisonDrain();applyLushAndParasite(); applyAllExtras();
                return {
                  remaining,
                  desc: '恢复' + healAmt + '生命，格挡' + block + '点' + suffix() + lushParasiteDesc + allExtrasDesc
                };
              }
            }
            applyClearSelfDebuffs();
            applyPoison(); applyBleed(); applyHypothermia(); applyThorns(); applySandblind(); applyPoisonDrain();applyLushAndParasite(); applyAllExtras();
            let remaining = d;
            const descParts = ['恢复' + healAmt + '生命'];
            if (typeof mod.defendCounter === 'function') {
              const counter = mod.defendCounter(c, d, defender, opponent, eng);
              if (counter > 0 && hurt) {
                hurt(opponent, counter);
                descParts.push('反击' + counter + '点伤害');
              }
            }
            return {
              remaining,
              desc: descParts.join('，') + suffix() + clearSelfDebuffsDesc + lushParasiteDesc + allExtrasDesc
            };
          }
        }

        const hasBlock = typeof mod.defendBlock === 'function';
        const hasCounter = typeof mod.defendCounter === 'function';
        if (hasBlock || hasCounter) {
          let remaining = d;
          const descParts = [];
          if (hasBlock) {
            const block = mod.defendBlock(c, d, defender, eng);
            if (block > 0) {
              remaining = Math.max(0, d - block);
              descParts.push('格挡' + block + '点');
            }
          }
          if (hasCounter) {
            const counter = mod.defendCounter(c, d, defender, opponent, eng);
            if (counter > 0 && hurt) {
              hurt(opponent, counter);
              descParts.push('反击' + counter + '点伤害');
            }
          }
          if (descParts.length) {
            applyClearSelfDebuffs();
            applyPoison(); applyBleed(); applyHypothermia(); applyThorns(); applySandblind(); applyPoisonDrain();applyDrawSelf(); applyLushAndParasite(); applyAllExtras();
            return {
              remaining: hasBlock ? remaining : d,
              desc: descParts.join('，') + suffix() + clearSelfDebuffsDesc + drawSelfDesc + lushParasiteDesc + allExtrasDesc
            };
          }
        }

        applyClearSelfDebuffs();
        applyPoison(); applyBleed(); applyHypothermia(); applyThorns(); applySandblind(); applyPoisonDrain();applyDrawSelf(); applyLushAndParasite(); applyAllExtras();
        if (v === 1) return { remaining: Math.max(0, d - Math.ceil(d / 2)), desc: '1牌防御' + suffix() + clearSelfDebuffsDesc + drawSelfDesc + lushParasiteDesc + allExtrasDesc };
        if (v === 3) return { remaining: Math.max(0, d - Math.floor(d / 2)), desc: '3牌防御' + suffix() + clearSelfDebuffsDesc + drawSelfDesc + lushParasiteDesc + allExtrasDesc };
        return { remaining: d, desc: '直接承受' + suffix() + clearSelfDebuffsDesc + drawSelfDesc + lushParasiteDesc + allExtrasDesc };
      }
    });
  }

  function registerMonsterAI(mod) {
    AR.register({
      name: mod.name,

      attackScore(eng, v, c, x) {
        if (c && (c.magic || c.magicColor === 'purple')) return 100;
        if (c && (c.greenMagic || c.magicColor === 'green')) return 90;
        if (!c || !c.isNumberCard) return null;
        return v * 10 + 20;
      },

      defendScore(eng, v, c, top, x) {
        if (c && (c.magic || c.magicColor === 'purple')) return 100;
        if (c && (c.greenMagic || c.magicColor === 'green')) return 90;
        if (!c || !c.isNumberCard) return null;
        // 白7 可防御但对大王花等 canDefendHigh 无实际效果，不优先于有技能的高牌。
        if (v === 7) return mod.canDefendHigh ? 5 : null;
        if (v > 3 && !mod.canDefendHigh) return null;
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
      if (card.magic || card.greenMagic || card.magicColor) {
        const isBoss = !!(AdvR.getBoss(String(charName || '').replace(/^AI\d*\s+/, '')));
        return card.greenMagic || card.magicColor === 'green'
          ? '恢复' + (isBoss ? 5 : 3) + '[生命]，清除自身所有负面状态，可搭桥继续出牌'
          : '恢复' + (isBoss ? 5 : 3) + '[生命]，清除玩家所有正面buff，可搭桥继续出牌';
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

    // 白7：全怪物通用轮空牌
    if (card.isNumberCard && card.value === 7) {
      return isDefend ? '无防御效果' : '无进攻效果';
    }

    if (isDefend) {
    // FrozenOrca defend copy (ocean.md). Attack copy lives in the attack branch below.
    if (mod.name === 'FrozenOrca' && card.isNumberCard) {
      const v = card.value;
      if (v === 7) return '无防御效果';
      if (v >= 1 && v <= 3) {
        return '施加1层[流血]，格挡半数伤害（向上取整）';
      }
      if (v === 0) {
        const immune = typeof mod.defendImmune === 'function' && mod.defendImmune(card);
        return immune
          ? '免疫所有伤害，反击相同点伤害（守护/飞翔结算前），清除自身所有负面状态'
          : '反击相同点伤害（守护/飞翔结算前），清除自身所有负面状态';
      }
      return '无防御效果';
    }
    // DesertBison defend: counter card value + bleed (desert.md).
    if (mod.name === 'DesertBison' && card.isNumberCard) {
      const v = card.value;
      if (v >= 1 && v <= 3) {
        const bleed = (Number(opts.stage) || 1) >= 4 ? 2 : 1;
        return '反击1/2/3点伤害，施加' + bleed + '层[流血]';
      }
      return '无防御效果';
    }
    let parts = [];
      if (typeof mod.defendImmune === 'function' && mod.defendImmune(card)) {
        if (typeof mod.defendImmuneBuff === 'function' && mod.defendImmuneBuff(card)) {
          if (mod.name === 'ForestPanda') {
            parts.push('免疫所有伤害和即将被施加的debuff，清除自身所有debuff');
          } else {
            parts.push('免疫所有伤害和debuff');
          }
        } else {
          parts.push('免疫所有伤害');
        }
      }
      if (typeof mod.defendRollImmune === 'function' && mod.defendRollImmune(card)) {
        parts.push(mod.name === 'CastleGhost'
          ? (opts.stage >= 4 ? '投12面骰，1-6免疫伤害和buff' : '投12面骰，1-4免疫伤害和buff')
          : '投12面骰判定免疫伤害和buff');
      }
      if (typeof mod.defendHeal === 'function') {
        const healAmt = mod.defendHeal(card);
        if (healAmt > 0) parts.push('恢复' + healAmt + '点生命');
      }
      if (typeof mod.defendPoison === 'function') {
        const p = mod.defendPoison(card);
        if (p > 0) parts.push('施加' + p + '层[中毒]');
      }
      if (typeof mod.defendBleed === 'function') {
        const b = mod.defendBleed(card);
        if (b > 0) parts.push('施加' + b + '层[流血]');
      }
      if (typeof mod.defendHypothermia === 'function') {
        const h = mod.defendHypothermia(card);
        if (h > 0) parts.push('施加' + h + '层[失温]');
      }
      if (typeof mod.defendThorns === 'function') {
        const th = mod.defendThorns(card);
        if (th > 0) parts.push('施加' + th + '层[荆棘]');
      }
      if (typeof mod.defendSandblind === 'function') {
        const sb = mod.defendSandblind(card);
        if (sb > 0) parts.push('施加' + sb + '层[沙盲]');
      }
      if (typeof mod.defendPoisonDrain === 'function') {
        const pd = mod.defendPoisonDrain(card);
        if (pd && pd.poison > 0) parts.push('施加' + pd.poison + '层[中毒]并按层数吸取生命');
      }
      if (typeof mod.defendBlock === 'function') {
        if (mod.name === 'CastleFirefly') {
          const v = card && card.value;
          if (v >= 1 && v <= 3) {
            parts.push((opts.stage >= 4 ? '格挡1+道具数量点伤害' : '格挡向上取整(1+道具数量×1/2)点伤害'));
          }
        } else if (mod.name === 'ForestPanda') {
          const base = Math.max(0, Number(mod.defendBlock(card, 8, { lush: 0 })) || 0);
          const withLush = Math.max(0, Number(mod.defendBlock(card, 8, { lush: 2 })) || 0);
          if (base > 0 || withLush > 0) {
            if (withLush > base) {
              parts.push('格挡' + base + '点伤害（有2层[茂盛]时额外格挡' + (withLush - base) + '点）');
            } else {
              parts.push('格挡' + base + '点伤害');
            }
          }
        } else {
          const b8 = mod.defendBlock(card, 8);
          const b4 = mod.defendBlock(card, 4);
          if (b8 > 0 || b4 > 0) {
            const rem8 = 8 - b8, rem4 = 4 - b4;
            if (rem8 === rem4 && rem8 < 8) parts.push('将伤害降低为' + rem8 + '点');
            else if (b8 === b4) {
              const capStyle = (mod.name === 'CastleBat' || mod.name === 'ForestDeer' || mod.name === 'ForestLadybug' || mod.name === 'FrozenOceanLynx' || mod.name === 'FrozenOceanTubeWorm' || mod.name === 'DesertLizard' || mod.name === 'DesertViper');
              parts.push((capStyle ? '格挡至多' : '格挡') + b8 + '点伤害');
            }
            else if (b8 === Math.ceil(8 / 2) && b4 === Math.ceil(4 / 2)) parts.push('格挡半数伤害（向上取整）');
            else if (b8 === Math.floor(8 / 2) && b4 === Math.floor(4 / 2)) parts.push('格挡半数伤害');
            else parts.push('格挡' + b8 + '点伤害');
          }
        }
      }
      if (typeof mod.defendCounter === 'function') {
        if (mod.name === 'FrozenOceanLynx') {
          const amt = mod.defendCounter(card, 8, null, { frozen: true });
          if (amt > 0) parts.push('若对手有[冷冻]，反击' + amt + '点伤害');
        } else {
          const c8 = mod.defendCounter(card, 8);
          const c4 = mod.defendCounter(card, 4);
          if (c8 > 0 || c4 > 0) {
            if (c8 === 8 && c4 === 4) parts.push('反击相同点伤害（守护/飞翔结算前）');
            else if (c8 !== c4 && c8 === Math.ceil(8 / 2) && c4 === Math.ceil(4 / 2)) parts.push('反击一半伤害（向上取整）');
            else parts.push('反击' + c8 + '点伤害');
          }
        }
      }
      if (typeof mod.defendPlayerDiscard === 'function' && mod.defendPlayerDiscard(card)) {
        parts.push('玩家选择1张手牌弃掉');
      }
      if (typeof mod.defendClearDebuffs === 'function' && mod.defendClearDebuffs(card)) {
        parts.push('清除自身所有负面状态');
      }
      if (typeof mod.defendGuard === 'function') {
        const g = mod.defendGuard(card);
        if (g > 0) parts.push('获得' + g + '层[守护]');
      }
      if (typeof mod.defendAllLush === 'function') {
        const al = mod.defendAllLush(card);
        if (al > 0) parts.push('全体友方获得' + al + '层[茂盛]');
      }
      if (typeof mod.defendLush === 'function') {
        const l = mod.defendLush(card);
        if (l > 0) parts.push('获得' + l + '层[茂盛]');
      }
      if (typeof mod.defendParasite === 'function') {
        const p = mod.defendParasite(card);
        if (p > 0) parts.push('获得' + p + '层[寄生]');
      }
      if (typeof mod.defendAllHeal === 'function') {
        const ah = mod.defendAllHeal(card);
        if (ah > 0) parts.push('全体友方恢复' + ah + '点生命');
      }
      if (typeof mod.defendDrawSelf === 'function') {
        const dd = mod.defendDrawSelf(card);
        if (dd > 0) parts.push('抽取' + dd + '张牌');
      }
      if (typeof mod.defendGainDiving === 'function' && mod.defendGainDiving(card)) {
        parts.push('获得[潜水]');
      }
      if (typeof mod.defendSplit === 'function' && mod.defendSplit(card)) {
        parts.push('与玩家均摊伤害（向上取整）');
      }
      return parts.length ? parts.join('，') : '无防御效果';
    }

    const ctx = {
      playerHandSize: Number(opts.playerHandSize) || 0,
      attackerHandSize: Number(opts.attackerHandSize) || 0,
      attackerHand: Array.isArray(opts.attackerHand) ? opts.attackerHand : [],
      playerPoison: Number(opts.playerPoison) || 0,
      attackerLush: opts.attackerLush == null ? (Number(mod.initialLush) || 0) : (Number(opts.attackerLush) || 0)
    };
    if (typeof mod.attackSkipEffect === 'function') {
      return mod.attackSkipDescription || '跳过进攻阶段';
    }
    // Keep ForestLadybug attack copy aligned with adventure/guide/forest.md
    // (formula for 1-3, lush-then-damage for 4-6; no live stack substitution).
    if (mod.name === 'ForestLadybug' && card.isNumberCard) {
      const v = card.value;
      const stageBonus = (Number(opts.stage) || 1) >= 3 ? 1 : 0;
      if (v >= 1 && v <= 3) {
        return '吸取' + (1 + stageBonus) + '+[茂盛]层数点[生命]（不可防御）';
      }
      if (v >= 4 && v <= 6) {
        return '获得1层[茂盛]，造成' + (4 + stageBonus) + '点[伤害]';
      }
      return '无进攻效果';
    }
    // CastleBat 4/5/6: drain scales with player bleed (castle.md).
    if (mod.name === 'CastleBat' && card.isNumberCard && card.value >= 4 && card.value <= 6) {
      const stageBonus = (Number(opts.stage) || 1) >= 3 ? 1 : 0;
      return '吸取' + (2 + stageBonus) + '+玩家[流血]层数点[生命]（不可防御）';
    }
    // FrozenWhale: AoE on 4/5/6, diving on 1/2/3, deferred hypothermia (ocean.md).
    if (mod.name === 'FrozenWhale' && card.isNumberCard) {
      const v = card.value;
      const stageBonus = (Number(opts.stage) || 1) >= 3 ? 1 : 0;
      if (v >= 1 && v <= 3) {
        return '造成' + (2 + stageBonus) + '点[伤害]，获得[潜水]';
      }
      if (v >= 4 && v <= 6) {
        return '对场上所有其他角色造成' + (4 + stageBonus) + '点[伤害]（不可防御），防御结束后对对手施加1层[失温]';
      }
      return '无进攻效果';
    }
    // ForestPython: poison-scaled formulas + conditional draw (forest.md).
    if (mod.name === 'ForestPython' && card.isNumberCard) {
      const v = card.value;
      const stageBonus = (Number(opts.stage) || 1) >= 3 ? 1 : 0;
      if (v >= 1 && v <= 3) {
        return '造成' + (v + stageBonus) + '点[伤害]；玩家有≥2层[中毒]时额外抽取1张牌';
      }
      if (v >= 4 && v <= 6) {
        return '先施加1层[中毒]，造成' + (3 + stageBonus) + '×玩家[中毒]层数点[伤害]';
      }
      if (v === 0) {
        return '先施加1层[中毒]，造成' + (2 + stageBonus) + '×玩家[中毒]层数点[伤害]（不可防御）';
      }
      return '无进攻效果';
    }
    // CastleGhost 4/5/6: keep full branch text (castle.md), not live hand-size substitution.
    if (mod.name === 'CastleGhost' && card.isNumberCard && card.value >= 4 && card.value <= 6) {
      return (Number(opts.stage) || 1) >= 3
        ? '若打出后手上正好剩1张牌，按剩余手牌点数的2倍造成[伤害]；否则本轮空过'
        : '若打出后手上正好剩1张牌，按剩余手牌点数的1.5倍（向上取整）造成[伤害]；否则本轮空过';
    }
    // CastleFox / FrozenOceanSamoyed: hand-size damage as formula (not live count).
    if ((mod.name === 'CastleFox' || mod.name === 'FrozenOceanSamoyed') && card.isNumberCard) {
      const v = card.value;
      const stage = Number(opts.stage) || 1;
      if (mod.name === 'CastleFox') {
        if (v >= 1 && v <= 3) {
          const dmg = v + (stage >= 3 ? 1 : 0);
          return '造成' + dmg + '点[伤害]（不可防御）';
        }
        if (v >= 4 && v <= 6) return '造成玩家手牌数点[伤害]';
        return '无进攻效果';
      }
      if (v >= 1 && v <= 3) {
        return '造成对手手牌张数点[伤害]' + (stage >= 3 ? '（不可防御）' : '');
      }
      if (v >= 4 && v <= 6) {
        return '造成5点[伤害]；玩家先选择1张手牌弃掉再防御（无手牌则不弃）';
      }
      return '无进攻效果';
    }
    // ForestDendrobatidFrog 4/5/6: poison-scaled formula.
    if (mod.name === 'ForestDendrobatidFrog' && card.isNumberCard && card.value >= 4 && card.value <= 6) {
      const stageBonus = (Number(opts.stage) || 1) >= 3 ? 1 : 0;
      return '造成' + (4 + stageBonus) + '+玩家[中毒]层数点[伤害]';
    }
    // ForestPiranha 1/2/3: bleed×2 formula (forest.md / SKILL_DATA).
    if (mod.name === 'ForestPiranha' && card.isNumberCard && card.value >= 1 && card.value <= 3) {
      const stageBonus = (Number(opts.stage) || 1) >= 3 ? 1 : 0;
      return stageBonus
        ? '造成' + stageBonus + '+玩家[流血]层数×2点[伤害]'
        : '造成玩家[流血]层数×2点[伤害]';
    }
    // FrozenOrca: diving + deferred hypothermia on 1/2/3, bleed on 4/5/6,
    // bleed-scaled damage on 0 (ocean.md). Defend copy is in the isDefend branch.
    if (mod.name === 'FrozenOrca' && card.isNumberCard) {
      const v = card.value;
      const stageBonus = (Number(opts.stage) || 1) >= 3 ? 1 : 0;
      if (v >= 1 && v <= 3) {
        return '造成' + (3 + stageBonus) + '点[伤害]，获得[潜水]，防御结束后施加1层[失温]';
      }
      if (v >= 4 && v <= 6) {
        return '造成' + (5 + stageBonus) + '点[伤害]，施加1层[流血]';
      }
      if (v === 0) {
        return '造成' + (2 + stageBonus) + '+玩家[流血]层数×2点[伤害]';
      }
      return '无进攻效果';
    }
    // FrozenPolarBear: buff-total damage on 1/2/3, crit+bleed on 4/5/6.
    if (mod.name === 'FrozenPolarBear' && card.isNumberCard) {
      const v = card.value;
      const stage3 = (Number(opts.stage) || 1) >= 3;
      if (v >= 1 && v <= 3) {
        return '造成对手buff总层数点[伤害]';
      }
      if (v >= 4 && v <= 6) {
        const dmg = stage3 ? 4 : 3;
        const bleed = stage3 ? 2 : 1;
        return '造成' + dmg + '点[伤害]，获得1层[暴击]，施加' + bleed + '层[流血]';
      }
      return '无进攻效果';
    }
    // FrozenOceanOctopus: player-deck judgment on 1/2/3, diving on 4/5/6 (ocean.md).
    if (mod.name === 'FrozenOceanOctopus' && card.isNumberCard) {
      const v = card.value;
      const stageBonus = (Number(opts.stage) || 1) >= 3 ? 1 : 0;
      if (v >= 1 && v <= 3) {
        return '抽取玩家牌库1张牌判定：普通颜色造成' + (3 + stageBonus) + '点[伤害]并放回牌库底，黑/白牌造成' + (5 + stageBonus) + '点[伤害]并置入玩家弃牌堆';
      }
      if (v >= 4 && v <= 6) {
        return '造成' + (4 + stageBonus) + '点[伤害]，获得[潜水]';
      }
      return '无进攻效果';
    }
    // FrozenKraken: player-deck judgment on 1/2/3, hand-size damage + hypothermia on 4/5/6,
    // purge burst on 0 (ocean.md). Weak damage (<5) is unblockable (0 always, all cards stage3+).
    if (mod.name === 'FrozenKraken' && card.isNumberCard) {
      const v = card.value;
      if (v >= 1 && v <= 3) {
        return '抽取玩家牌库1张牌判定：彩色牌造成对应数字点[伤害]，黑白牌不造成伤害；伤害为0（数字零牌或黑白牌）置入玩家弃牌堆、跳过防御、获得[潜水]、施加[冰封]，否则放回牌库底';
      }
      if (v >= 4 && v <= 6) {
        return '造成玩家手牌数点[伤害]，施加1层[失温]';
      }
      if (v === 0) {
        return '施加1层[失温]，清除自身所有负面效果，造成3+清除层数点[伤害]（<5不可防御）';
      }
      return '无进攻效果';
    }
    // DesertSandworm: sandblind-conditional unblock on 1/2/3, parasite on 4/5/6 (desert.md).
    if (mod.name === 'DesertSandworm' && card.isNumberCard) {
      const v = card.value;
      const stageBonus = (Number(opts.stage) || 1) >= 3 ? 1 : 0;
      if (v >= 1 && v <= 3) {
        return '造成' + (4 + stageBonus) + '点[伤害]，若目标有[沙盲]则不可防御';
      }
      if (v >= 4 && v <= 6) {
        return '造成' + (5 + stageBonus) + '点[伤害]，获得[寄生]';
      }
      return '无进攻效果';
    }
    // DesertScarab: color-based buff on 1/2/3, fly on 4/5/6 (desert.md).
    if (mod.name === 'DesertScarab' && card.isNumberCard) {
      const v = card.value;
      const stageBonus = (Number(opts.stage) || 1) >= 3 ? 1 : 0;
      if (v >= 1 && v <= 3) {
        return '造成' + (3 + stageBonus) + '点[伤害]，按技能牌颜色施加：🔴→2层[灼伤]、🟡→[荆棘]、🔵→[冰封]、🟢→[中毒]';
      }
      if (v >= 4 && v <= 6) {
        return '造成' + (4 + stageBonus) + '点[伤害]，获得1层[飞翔]';
      }
      return '无进攻效果';
    }
    // DesertScorpion: poison-conditional unblock on 1/2/3, unblockable thorns+poison on 4/5/6 (desert.md).
    if (mod.name === 'DesertScorpion' && card.isNumberCard) {
      const v = card.value;
      const stageBonus = (Number(opts.stage) || 1) >= 3 ? 1 : 0;
      if (v >= 1 && v <= 3) {
        return '造成' + (3 + stageBonus) + '点[伤害]，若目标有[中毒]则不可防御';
      }
      if (v >= 4 && v <= 6) {
        return '造成' + (2 + stageBonus) + '点[伤害]（不可防御），施加1层[荆棘]，施加1层[中毒]';
      }
      return '无进攻效果';
    }
    // DesertViper: poison on 1/2/3, poison-scaled drain on 4/5/6 (desert.md).
    if (mod.name === 'DesertViper' && card.isNumberCard) {
      const v = card.value;
      const stageBonus = (Number(opts.stage) || 1) >= 3 ? 1 : 0;
      if (v >= 1 && v <= 3) {
        return '造成3点[伤害]，施加1层[中毒]';
      }
      if (v >= 4 && v <= 6) {
        return '吸取' + (2 + stageBonus) + '+玩家[中毒]层数点生命（不可防御）';
      }
      return '无进攻效果';
    }
    // DesertVulture: yellow-conditional sandblind/fly on 1/2/3, clear positive on 4/5/6 (desert.md).
    if (mod.name === 'DesertVulture' && card.isNumberCard) {
      const v = card.value;
      const stageBonus = (Number(opts.stage) || 1) >= 3 ? 1 : 0;
      if (v >= 1 && v <= 3) {
        return '造成' + (3 + stageBonus) + '点[伤害]，若技能牌为🟡施加2层[沙盲]，否则获得[飞翔]';
      }
      if (v >= 4 && v <= 6) {
        return '造成' + (5 + stageBonus) + '点[伤害]，清除玩家所有正面buff';
      }
      return '无进攻效果';
    }
    let parts = [];
    let dmg = 0;
    let scaleDmgDesc = null;
    if (typeof mod.attackRevealDraw === 'function' && mod.attackRevealDraw(card)) {
      parts.push('从牌堆抽1张牌展示，造成对应数字的伤害');
    }
    const drainAmount = typeof mod.attackDrain === 'function'
      ? Math.max(0, Number(mod.attackDrain(card, ctx)) || 0)
      : 0;
    if (typeof mod.attackDamage === 'function') {
      const ctxBleed0 = Object.assign({}, ctx, { playerBleed: 0, playerPoison: 0, playerHandSize: 0 });
      const ctxBleed1 = Object.assign({}, ctx, { playerBleed: 1, playerPoison: 0, playerHandSize: 0 });
      const ctxPoison1 = Object.assign({}, ctx, { playerBleed: 0, playerPoison: 1, playerHandSize: 0 });
      const ctxHand1 = Object.assign({}, ctx, { playerBleed: 0, playerPoison: 0, playerHandSize: 1 });
      dmg = mod.attackDamage(card, ctxBleed0) || 0;
      const dmgBleed1 = mod.attackDamage(card, ctxBleed1) || 0;
      const dmgPoison1 = mod.attackDamage(card, ctxPoison1) || 0;
      const dmgHand1 = mod.attackDamage(card, ctxHand1) || 0;
      if (dmg !== dmgBleed1) {
        const per = dmgBleed1 - dmg;
        scaleDmgDesc = (dmg > 0 ? '造成' + dmg + '+' : '造成') + '玩家[流血]层数×' + per + '点[伤害]';
      } else if (dmg !== dmgPoison1) {
        const per = dmgPoison1 - dmg;
        scaleDmgDesc = (dmg > 0 ? '造成' + dmg + '+' : '造成') + '玩家[中毒]层数' + (per === 1 ? '' : '×' + per) + '点[伤害]';
      } else if (dmg !== dmgHand1) {
        scaleDmgDesc = '造成对手手牌张数点[伤害]';
      }
    } else if (card.isNumberCard) dmg = card.value || 0;
    if (scaleDmgDesc) {
      let line = scaleDmgDesc;
      if (typeof mod.attackUnblockable === 'function' && mod.attackUnblockable(card)) line += '（不可防御）';
      parts.push(line);
    } else if (dmg > 0 && !drainAmount) {
      let line = '造成' + dmg + '点伤害';
      if (typeof mod.attackUnblockable === 'function' && mod.attackUnblockable(card)) {
        line += '（不可防御）';
      }
      parts.push(line);
    }
    if (typeof mod.attackLush === 'function') {
      const l = mod.attackLush(card);
      if (l > 0) parts.push('获得' + l + '层[茂盛]');
    }
    if (typeof mod.attackGuard === 'function') {
      const g = mod.attackGuard(card);
      if (g > 0) parts.push('获得' + g + '层[守护]');
    }
    if (typeof mod.attackFly === 'function') {
      const f = mod.attackFly(card);
      if (f > 0) parts.push('获得' + f + '层[飞翔]');
    }
    if (typeof mod.attackGainCrit === 'function') {
      const gc = mod.attackGainCrit(card);
      if (gc > 0) parts.push('获得' + gc + '层[暴击]');
    }
    if (typeof mod.attackClearPositive === 'function' && mod.attackClearPositive(card)) {
      parts.push('清除玩家所有正面buff');
    }
    if (typeof mod.attackBleed === 'function') {
      const b = mod.attackBleed(card);
      if (b > 0) parts.push('施加' + b + '层[流血]');
    }
    if (typeof mod.attackSandblind === 'function') {
      const sb = mod.attackSandblind(card);
      if (sb > 0) parts.push('施加' + sb + '层[沙盲]');
    }
    if (typeof mod.attackQuicksand === 'function') {
      const q = mod.attackQuicksand(card);
      if (q > 0) parts.push('施加' + q + '层[流沙]');
    }
    if (typeof mod.attackThorns === 'function') {
      const th = mod.attackThorns(card);
      if (th > 0) parts.push('施加' + th + '层[荆棘]');
    }
    if (typeof mod.attackBurn === 'function') {
      const b = mod.attackBurn(card);
      if (b > 0) parts.push('施加' + b + '层[灼伤]');
    }
    if (typeof mod.attackBurnSettle === 'function' && mod.attackBurnSettle(card)) {
      parts.push('进行一次[灼伤]结算');
    }
    if (typeof mod.attackPoison === 'function') {
      const p = mod.attackPoison(card);
      if (p > 0) parts.push('施加' + p + '层[中毒]');
    }
    if (typeof mod.attackHypothermia === 'function') {
      const h = mod.attackHypothermia(card);
      if (h > 0) parts.push('施加' + h + '层[失温]');
    }
    if (typeof mod.attackBlind === 'function' && mod.attackBlind(card)) {
      parts.push('施加1层[致盲]');
    }
    if (typeof mod.attackFreeze === 'function' && mod.attackFreeze(card)) {
      parts.push('施加[冷冻]');
    }
    if (typeof mod.attackIceSeal === 'function' && mod.attackIceSeal(card)) {
      parts.push('施加[冰封]');
    }
    if (typeof mod.attackDrain === 'function') {
      const h = mod.attackDrain(card, ctx);
      if (h > 0) {
        // Drain is always unblockable by number defense (combat sets unblock=true).
        parts.push('吸取' + h + '点生命（不可防御）');
      }
    } else if (typeof mod.attackHeal === 'function') {
      const h = mod.attackHeal(card, ctx);
      if (h > 0) parts.push('恢复' + h + '点生命');
    }
    if (typeof mod.attackDiscardBeforeDefend === 'function' && mod.attackDiscardBeforeDefend(card)) {
      parts.push('玩家先选择1张手牌弃掉再防御（无手牌则不弃）');
    }
    if (typeof mod.attackStealItem === 'function' && mod.attackStealItem(card)) {
      parts.push('玩家随机丢失1个道具');
    }
    if (typeof mod.attackDrawSelf === 'function') {
      // Describe conditional draws as a formula when they depend on poison stacks.
      const draw0 = mod.attackDrawSelf(card, Object.assign({}, ctx, { playerPoison: 0 }));
      const draw2 = mod.attackDrawSelf(card, Object.assign({}, ctx, { playerPoison: 2 }));
      if (draw2 && !draw0) {
        parts.push('玩家有≥2层[中毒]时额外抽取1张牌');
      } else if (mod.attackDrawSelf(card, ctx)) {
        parts.push('抽取1张牌');
      }
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
