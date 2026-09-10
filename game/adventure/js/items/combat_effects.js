/**
 * Adventure combat consumable effects.
 *
 * New items should register here by `combatUse` id instead of growing the
 * switch inside AdventureBattleEngine.useAdventureCombatItem.
 *
 * Handler result shapes:
 *   { ok: true, message, dodgeResolved? }
 *   { ok: false, message }          — reject; do not consume item
 *   { pending: true }               — dialog opened; do not consume item
 */
(function () {
  const handlers = Object.create(null);

  function register(combatUse, handler) {
    if (!combatUse || typeof handler !== 'function') return;
    handlers[combatUse] = handler;
  }

  function apply(engine, def, ctx) {
    const id = def && def.combatUse;
    const handler = id ? handlers[id] : null;
    if (!handler) {
      return { ok: true, message: '使用' + ((def && def.displayName) || '道具') };
    }
    return handler(engine, def, ctx || {});
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  register('chameleonPaint', (eng, def, ctx) => {
    const choice = ctx.choice;
    const target = choice && (choice.target || choice.owner);
    const index = Number(choice && choice.index);
    const targetKey = target || (eng.s.is1v2 ? eng.s.attackTarget : 'ai');
    const hand = eng.h[targetKey];
    const targetChar = eng.s[targetKey];
    if (!hand || !targetChar || !targetChar.alive || !Number.isInteger(index) || !hand[index]) {
      return { ok: false, message: '请选择一张有效的对手手牌' };
    }
    const borrowed = hand.splice(index, 1)[0];
    borrowed.borrowedMonster = true;
    borrowed.borrowedFrom = targetKey;
    borrowed.borrowedMonsterName = eng.name(targetChar);
    eng.h.player.push(borrowed);
    return { ok: true, message: '暂借' + borrowed.borrowedMonsterName + '的一张牌，加入玩家手牌' };
  });

  register('crystalBall', (eng, def, ctx) => {
    const choice = ctx.choice;
    if (choice && choice.cancel) {
      eng.s.crystalBallCards = null;
      eng.s.pendingDialog = null;
      return { pending: true };
    }
    const count = Math.min(3, eng.deck.length);
    if (!count) return { ok: false, message: '水晶球：牌库为空' };
    const cards = eng.deck.slice(eng.deck.length - count).reverse();
    const order = choice && Array.isArray(choice.order) ? choice.order.map(Number) : null;
    if (!order) {
      eng.s.crystalBallCards = clone(cards);
      eng.s.pendingDialog = 'crystalBall';
      eng.s.busy = false;
      return { pending: true };
    }
    if (order.length !== count || new Set(order).size !== count || order.some(i => i < 0 || i >= count)) {
      return { ok: false, message: '水晶球顺序无效' };
    }
    eng.deck.splice(eng.deck.length - count, count);
    const arranged = order.map(i => cards[i]);
    for (let i = arranged.length - 1; i >= 0; i--) eng.deck.push(arranged[i]);
    eng.s.crystalBallCards = null;
    eng.s.pendingDialog = null;
    const drawn = eng.draw('player', 1, true);
    return {
      ok: true,
      message: drawn.length
        ? '已调整牌库顶' + count + '张牌的顺序，并抽取1张牌'
        : '已调整牌库顶' + count + '张牌的顺序（牌库已空，未能抽牌）'
    };
  });

  register('dodge', (eng) => {
    eng.cancelAttackDebuffs('player', false);
    eng.s.pendingBuffRestore = null;
    eng.s.serenityHalfTarget = null;
    eng.s.hasPlayedBlackDefend = false;
    eng.s.unblockDefend = false;
    eng.s.selectedCard = -1;
    eng.s.pendingAttack = { damage: 0, unblock: false };
    eng.s.defenseSkipped = true;
    return { ok: true, message: '闪避成功，本次攻击作废', dodgeResolved: true };
  });

  register('naturalShield', (eng, def, ctx) => {
    const player = ctx.player;
    const damage = Math.max(0, Number(eng.s.pendingAttack && eng.s.pendingAttack.damage) || 0);
    const blocked = Math.min(def.shieldAmount || 5, damage);
    if (eng.s.pendingAttack) eng.s.pendingAttack.damage = damage - blocked;
    eng.s.pendingDefenseDamage = Math.max(0, damage - blocked);
    const before = player.guard || 0;
    player.guard = Math.min(5, before + 1);
    if (player.guard > before) {
      eng.emit('buff', '+1[守护]', null, { who: 'player', target: 'player', kind: 'guard', stacks: player.guard });
    }
    return { ok: true, message: '格挡本次攻击' + blocked + '点伤害，获得1层守护' };
  });

  register('heal', (eng, def, ctx) => {
    const player = ctx.player;
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + (def.healAmount || 5));
    return { ok: true, message: '恢复' + (player.hp - before) + '点生命' };
  });

  register('purify', (eng, def, ctx) => {
    const advEngine = ctx.advEngine;
    const player = ctx.player;
    const ai = ctx.ai;
    const purifyChoices = ctx.purifyChoices;
    const count = def.purifyCount || 1;
    if (!advEngine._hasPurifyableDebuff(player, ai)) {
      return { ok: false, message: '当前没有可净化的状态' };
    }
    if (!purifyChoices || !purifyChoices.length) {
      return { ok: false, message: '请选择要净化的buff' };
    }
    const removed = advEngine._applyPurifyChoices(player, purifyChoices.slice(0, count), ai);
    if (!removed) return { ok: false, message: '无效的选择' };
    return { ok: true, message: '净化' + removed + '个buff' };
  });

  register('burn', (eng, def, ctx) => {
    const amount = def.burnAmount || 2;
    if (typeof eng.burn === 'function') eng.burn(ctx.ai, amount);
    else ctx.ai.burn = Math.min(5, (ctx.ai.burn || 0) + amount);
    return { ok: true, message: '对对手施加' + amount + '层灼伤' };
  });

  register('bleed', (eng, def, ctx) => {
    const amount = def.bleedAmount || 1;
    if (typeof eng.bleed === 'function') eng.bleed(ctx.ai, amount);
    else ctx.ai.bleed = Math.min(3, (ctx.ai.bleed || 0) + amount);
    return { ok: true, message: '对对手施加' + amount + '层流血' };
  });

  register('freeze', (eng, def, ctx) => {
    ctx.ai.frozen = true;
    return { ok: true, message: '对对手施加冷冻' };
  });

  register('vampire', (eng, def, ctx) => {
    const amt = def.vampireAmount || 3;
    // Item Vampire ignores guard/fly; always deal full drain up to target HP.
    if (typeof eng.performAttack === 'function') {
      const taken = eng.performAttack({type:'drain',attacker:'player',target:'ai',damage:amt,allowAvoidance:false,direct:true,suppressFloat:true});
      return { ok: true, message: '吸取对手' + taken + '点生命' };
    }
    const before = ctx.ai.hp;
    eng.hurt(ctx.ai, amt, 'drain', { suppressFloat: true });
    const drained = before - ctx.ai.hp;
    eng.heal(ctx.player, drained, 'drain');
    return { ok: true, message: '吸取对手' + drained + '点生命' };
  });

  register('laserEye', (eng, def) => {
    const damage = Math.max(0, Number(def.laserDamage) || 5);
    const targets = [eng.s.ai];
    if (eng.s.is1v2 && eng.s.ai2) targets.push(eng.s.ai2);
    let hit = 0;
    for (const target of targets) {
      if (!target || !target.alive) continue;
      eng.hurt(target, damage);
      hit++;
    }
    return { ok: true, message: '对所有对手造成' + damage + '点伤害（命中' + hit + '名）' };
  });

  register('cardMaster', (eng, def, ctx) => {
    const applied = eng._applyCardMaster(ctx.choice);
    if (!applied.ok) return { ok: false, message: applied.message || '卡牌大师需要选择效果' };
    return { ok: true, message: applied.message };
  });

  register('buffTransfer', (eng, def, ctx) => {
    const applied = eng._applyBuffTransfer(ctx.choice, ctx.player, ctx.ai);
    if (!applied.ok) return { ok: false, message: applied.message || '魔法转移需要选择一层buff' };
    return { ok: true, message: applied.message };
  });

  register('bind', (eng) => {
    if (eng.s.phase !== 'PLAYER_PLAY') {
      return { ok: false, message: '捆缚只能在进攻回合使用' };
    }
    if (eng.s.bindUsedThisTurn) {
      return { ok: false, message: '本回合已使用过捆缚' };
    }
    eng._bindSkipNextAITurn = true;
    eng.s.bindUsedThisTurn = true;
    if (eng.s.ai) eng.s.ai.bindMark = true;
    if (eng.s.ai2 && eng.s.ai2.alive) eng.s.ai2.bindMark = true;
    return { ok: true, message: '本回合结束后将跳过对手进攻，再进行一次进攻' };
  });

  window.AdventureCombatEffects = Object.freeze({ register, apply, handlers });
})();
