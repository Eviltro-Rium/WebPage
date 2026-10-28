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
    eng.emit('cardTransfer', '变色龙颜料：暂借对手手牌', borrowed, {
      who: 'player', fromOwner: targetKey, from: 'hand', handIndex: index
    });
    return { ok: true, message: '暂借' + borrowed.borrowedMonsterName + '的一张牌，加入玩家手牌' };
  });

  register('crystalBall', (eng, def, ctx) => {
    const choice = ctx.choice;
    const count = Math.min(3, eng.deck.length);
    if (!count) return { ok: false, message: '水晶球：牌库为空' };
    const cards = (eng.s.crystalBallCards && eng.s.crystalBallCards.length)
      ? eng.s.crystalBallCards
      : eng.deck.slice(eng.deck.length - count).reverse();
    // Cancel is not a free re-peek: treat as confirm with original order so
    // the item is consumed after the first reveal.
    let order = choice && Array.isArray(choice.order) ? choice.order.map(Number) : null;
    if (choice && choice.cancel && !order) {
      order = cards.map((_, i) => i);
    }
    if (!order) {
      eng.s.crystalBallCards = clone(cards);
      eng.s.pendingDialog = 'crystalBall';
      eng.s.busy = false;
      return { pending: true };
    }
    const n = cards.length;
    if (order.length !== n || new Set(order).size !== n || order.some(i => i < 0 || i >= n)) {
      return { ok: false, message: '水晶球顺序无效' };
    }
    eng.deck.splice(eng.deck.length - n, n);
    const arranged = order.map(i => cards[i]);
    for (let i = arranged.length - 1; i >= 0; i--) eng.deck.push(arranged[i]);
    eng.s.crystalBallCards = null;
    eng.s.pendingDialog = null;
    const drawn = eng.draw('player', 1, true);
    return {
      ok: true,
      message: drawn.length
        ? '已调整牌库顶' + n + '张牌的顺序，并抽取1张牌'
        : '已调整牌库顶' + n + '张牌的顺序（牌库已空，未能抽牌）'
    };
  });

  register('chaosOrb', (eng, def, ctx) => {
    const choice = ctx.choice;
    if (choice && choice.cancel) {
      eng.s.chaosOrbCards = null;
      eng.s.pendingDialog = null;
      return { pending: true };
    }
    const npcDeck = eng.piles && eng.piles.ai && eng.piles.ai.deck;
    const npcDiscard = eng.piles && eng.piles.ai && eng.piles.ai.discard;
    if (!npcDeck || !npcDiscard) return { ok: false, message: '混沌球：找不到NPC牌库' };
    const count = Math.min(3, npcDeck.length);
    if (!count) return { ok: false, message: '混沌球：NPC牌库为空' };
    const cards = npcDeck.slice(npcDeck.length - count).reverse();
    const discardFlags = choice && Array.isArray(choice.discard)
      ? choice.discard.map(v => !!v)
      : null;
    if (!discardFlags) {
      eng.s.chaosOrbCards = clone(cards);
      eng.s.pendingDialog = 'chaosOrb';
      eng.s.busy = false;
      return { pending: true };
    }
    if (discardFlags.length !== count) {
      return { ok: false, message: '混沌球选择无效' };
    }
    // Remove peeked top cards from the NPC deck, then put kept cards back in
    // their original relative order (no reordering) and send the rest to discard.
    const removed = npcDeck.splice(npcDeck.length - count, count);
    const peeked = removed.slice().reverse();
    const kept = [];
    let discarded = 0;
    for (let i = 0; i < peeked.length; i++) {
      const card = peeked[i];
      if (discardFlags[i]) {
        if (card && (card.isBlack || card.isWhite)) delete card.chosenColor;
        npcDiscard.push(card);
        discarded++;
      } else {
        kept.push(card);
      }
    }
    for (let i = kept.length - 1; i >= 0; i--) npcDeck.push(kept[i]);
    eng.s.chaosOrbCards = null;
    eng.s.pendingDialog = null;
    return {
      ok: true,
      message: discarded
        ? '将NPC牌库顶' + discarded + '张牌放入弃牌堆，其余按原顺序放回'
        : '已查看NPC牌库顶' + count + '张牌并全部按原顺序放回'
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

  register('rewindHourglass', (eng) => {
    if (!eng || !eng.s || !eng.s.isAdventure) {
      return { ok: false, message: '回溯沙漏只能在冒险战斗中使用' };
    }
    if (eng.testMode) {
      return { ok: true, message: '退出当前测试战斗', rewindRoom: true };
    }
    if (!eng._adventureEngine) {
      return { ok: false, message: '无法回溯：冒险引擎未连接' };
    }
    const room = typeof eng._adventureEngine.currentRoom === 'function' ? eng._adventureEngine.currentRoom() : null;
    const message = room && room.type === window.RoomType.GLITCH
      ? '退出故障房，手牌补至上限；本房事件已消耗，不能重新抽取'
      : '退出当前房间，手牌补至上限，下次重新遭遇';
    return { ok: true, message, rewindRoom: true };
  });

  register('naturalShield', (eng, def, ctx) => {
    const damage = Math.max(0, Number(eng.s.pendingAttack && eng.s.pendingAttack.damage) || 0);
    const blocked = Math.min(def.shieldAmount || 5, damage);
    if (eng.s.pendingAttack) eng.s.pendingAttack.damage = damage - blocked;
    eng.s.pendingDefenseDamage = Math.max(0, damage - blocked);
    return { ok: true, message: '格挡本次攻击' + blocked + '点伤害' };
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
    const status = window.FurryGame && window.FurryGame.StatusService;
    if (status) status.set(ctx.ai, 'freeze', true);
    else ctx.ai.frozen = true;
    return { ok: true, message: '对对手施加冷冻' };
  });

  register('vampire', (eng, def, ctx) => {
    const amt = def.vampireAmount || 3;
    const targetKey = ctx.targetKey || 'ai';
    // Vampire cannot open a defense phase, but existing guard/fly still
    // reduces the amount actually drained.
    if (typeof eng.performAttack === 'function') {
      const taken = eng.performAttack({type:'drain',attacker:'player',target:targetKey,damage:amt,allowAvoidance:true,direct:true});
      return { ok: true, message: '吸取对手' + taken + '点生命' };
    }
    const before = ctx.ai.hp;
    eng.hurt(ctx.ai, amt, 'drain');
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

  register('discardTalisman', (eng, def, ctx) => {
    const hand = eng.h.player || [];
    if (!hand.length) return { ok: false, message: '手牌为空，无法使用弃牌符' };
    const choice = ctx.choice;
    const index = Number(choice && (choice.index != null ? choice.index : choice));
    if (!Number.isInteger(index) || index < 0 || index >= hand.length) {
      return { ok: false, message: '请选择要弃掉的1张手牌' };
    }
    const card = hand.splice(index, 1)[0];
    const label = eng.cardText(card);
    eng.discardWithEvent(card, 'player', {
      handIndex: index,
      desc: '弃牌符：弃掉' + label
    });
    const drawAmt = Math.max(1, Number(def.discardThenDraw) || 2);
    const drawn = eng.draw('player', drawAmt, true);
    return { ok: true, message: '弃掉' + label + '，抽取' + drawn.length + '张牌' };
  });

  function furnaceTrophyForCard(def, card) {
    if (!card || !card.isNumberCard || card.isItemCard || card.isBlack || card.isWhite) return null;
    const map = (def && def.furnaceByColor) || {
      RED: 'ScorchTrophy', YELLOW: 'SandblindTrophy', BLUE: 'DivingTrophy', GREEN: 'LushTrophy'
    };
    return map[card.color] || null;
  }

  register('furnace', (eng, def, ctx) => {
    const hand = eng.h.player || [];
    const eligible = hand.filter(c => !!furnaceTrophyForCard(def, c));
    if (!eligible.length) return { ok: false, message: '没有可熔炼的普通颜色手牌' };
    const choice = ctx.choice;
    const raw = choice && (choice.index != null ? choice.index : (typeof choice === 'number' ? choice : null));
    if (raw == null || raw === '') {
      return { ok: false, message: '请选择要弃掉的1张普通颜色手牌' };
    }
    const index = Number(raw);
    if (!Number.isInteger(index) || index < 0 || index >= hand.length) {
      return { ok: false, message: '请选择要弃掉的1张普通颜色手牌' };
    }
    const card = hand[index];
    const trophyName = furnaceTrophyForCard(def, card);
    if (!trophyName) return { ok: false, message: '只能弃掉红/黄/蓝/绿普通颜色牌' };
    hand.splice(index, 1);
    const label = eng.cardText(card);
    eng.discardWithEvent(card, 'player', {
      handIndex: index,
      desc: '熔炉：弃掉' + label
    });
    const trophyCard = window.AdventureDeck.trophyWhite(trophyName);
    hand.push(trophyCard);
    const adv = ctx.advEngine || eng._adventureEngine;
    if (adv && adv.s) {
      if (!Array.isArray(adv.s.trophyWhiteCards)) adv.s.trophyWhiteCards = [];
      adv.s.trophyWhiteCards.push(trophyName);
    }
    if (Array.isArray(eng.s.trophyDrops)) eng.s.trophyDrops.push(trophyName);
    else eng.s.trophyDrops = [trophyName];
    eng.emit('trophyDrop', '获得战利白卡', null, { who: 'player', drops: [trophyName], source: 'furnace' });
    eng._invariantBaseline = null;
    if (typeof eng._checkInvariants === 'function') eng._checkInvariants('furnace');
    const trophyDef = window.AdventureRegistry && window.AdventureRegistry.getItem(trophyName);
    return {
      ok: true,
      message: '弃掉' + label + '，获得' + ((trophyDef && trophyDef.displayName) || trophyName)
    };
  });

  register('buffTransfer', (eng, def, ctx) => {
    const applied = eng._applyBuffTransfer(ctx.choice, ctx.player, ctx.ai);
    if (!applied.ok) return { ok: false, message: applied.message || '魔法转移需要选择一层buff' };
    return { ok: true, message: applied.message };
  });

  register('bind', (eng, def, ctx) => {
    if (eng.s.phase !== 'PLAYER_PLAY') {
      return { ok: false, message: '捆缚只能在进攻回合使用' };
    }
    if (eng.s.bindUsedThisTurn) {
      return { ok: false, message: '本回合已使用过捆缚' };
    }
    let target = ctx.ai;
    if (eng.s.isLord && !eng.s.attackTarget) {
      const key = eng.s.lordPlayerTargetIdx === 1 ? 'ai2' : 'ai';
      target = eng.s[key] && eng.s[key].alive ? eng.s[key] : eng.s[key === 'ai' ? 'ai2' : 'ai'];
    }
    if (!target || !target.alive || target.hp <= 0) {
      return { ok: false, message: '当前没有可捆缚的对手' };
    }
    eng.s.bindUsedThisTurn = true;
    const status = window.FurryGame && window.FurryGame.StatusService;
    if (status) status.set(target, 'bind', true); else target.bindMark = true;
    return { ok: true, message: '捆缚当前对手：跳过其下一次进攻，玩家再进行一次进攻' };
  });

  window.AdventureCombatEffects = Object.freeze({ register, apply, handlers });
})();
