/**
 * Adventure map-scene consumable effects (outside live battle UI).
 * Combat-only items stay in combat_effects.js / AdventureBattleEngine.
 */
(function () {
  const handlers = Object.create(null);

  function register(combatUse, handler) {
    if (!combatUse || typeof handler !== 'function') return;
    handlers[combatUse] = handler;
  }

  function apply(engine, def, ctx) {
    const id = def && (def.combatUse || def.mapUse);
    const handler = id ? handlers[id] : null;
    if (!handler) return { ok: false, message: '该道具暂无可用效果' };
    return handler(engine, def, ctx || {});
  }

  register('crystalBall', (eng, def, ctx) => {
    const pile = eng.s.playerPile;
    if (!pile) return { ok: false, message: '牌库尚未初始化' };
    const count = Math.min(3, pile.deck.length);
    if (!count) return { ok: false, message: '牌库为空' };
    const cards = pile.deck.slice(pile.deck.length - count).reverse();
    const order = Array.isArray(ctx.reorderOrder) ? ctx.reorderOrder.map(Number) : null;
    if (!order) return { ok: false, needsChoice: true, crystalBallCards: cards, message: '请选择水晶球查看的牌的顺序' };
    if (order.length !== count || new Set(order).size !== count || order.some(i => i < 0 || i >= count)) {
      return { ok: false, message: '水晶球顺序无效' };
    }
    pile.deck.splice(pile.deck.length - count, count);
    const arranged = order.map(i => cards[i]);
    for (let i = arranged.length - 1; i >= 0; i--) pile.deck.push(arranged[i]);
    const drawn = pile.draw(1);
    return {
      ok: true,
      message: drawn.length
        ? '已调整牌库顶' + count + '张牌的顺序，并抽取1张牌'
        : '已调整牌库顶' + count + '张牌的顺序（牌库已空，未能抽牌）'
    };
  });

  register('heal', (eng, def, ctx) => {
    const player = ctx.player || eng.s.player;
    const amount = def.healAmount || 5;
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + amount);
    return { ok: true, message: '恢复' + (player.hp - before) + '点生命' };
  });

  register('purify', (eng, def, ctx) => {
    const player = ctx.player || eng.s.player;
    const count = def.purifyCount || 1;
    if (!eng._hasPurifyableDebuff(player)) {
      return { ok: false, message: '当前没有可净化的负面状态' };
    }
    const choices = ctx.purifyChoices;
    if (!choices || !choices.length) {
      return { ok: false, needsPurifyChoice: true, purifyCount: count, message: '请选择要净化的负面状态' };
    }
    const removed = eng._applyPurifyChoices(player, choices.slice(0, count));
    if (!removed) return { ok: false, message: '无效的选择' };
    return { ok: true, message: '净化' + removed + '个负面状态' };
  });

  function combatOnly(eng, def, ctx) {
    const combat = ctx.combat || eng.s.combat;
    const enemy = combat && combat.enemy ? combat.enemy : null;
    if (!ctx.inCombat || !enemy) {
      return { ok: false, message: def.displayName + '只能在对战中使用' };
    }
    return { ok: false, message: '请在对战界面使用' + def.displayName };
  }

  ['burn', 'bleed', 'freeze', 'vampire', 'buffTransfer', 'attackMod', 'dodge', 'bind',
    'naturalShield', 'laserEye', 'chameleonPaint'].forEach(id => register(id, combatOnly));

  register('cardMaster', (eng, def, ctx) => {
    const choice = ctx.cardMasterChoice;
    if (choice !== 'draw2' && choice !== 'mulligan') {
      return { ok: false, needsChoice: true, message: '请选择效果' };
    }
    const pile = eng.s.playerPile;
    if (!pile) return { ok: false, message: '牌库尚未初始化' };
    if (choice === 'draw2') {
      const drawn = pile.draw(2);
      return { ok: true, message: '抽取' + drawn.length + '张牌' };
    }
    const n = pile.hand.length;
    while (pile.hand.length) {
      const card = pile.hand.pop();
      pile.discardCard(card);
    }
    const redrawn = pile.draw(n);
    return { ok: true, message: '弃掉' + n + '张并重抽' + redrawn.length + '张' };
  });

  window.AdventureMapEffects = Object.freeze({ register, apply, handlers });
})();
