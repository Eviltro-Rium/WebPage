/*
 * Card effect registry.
 *
 * Card objects deliberately remain data-only.  This registry is the single
 * place that translates their legacy flags (magic, potion, trophyWhite, ...)
 * into a stable effect id and, when requested, executes the effect through a
 * combat engine.  Modes can therefore add a card without teaching every
 * engine branch about another boolean property.
 */
(function (global) {
  const root = global.FurryGame || (global.FurryGame = {});

  const definitions = [
    { id: 'trophyWhite', kind: 'trophyWhite', family: 'trophyWhite', match: c => !!c.trophyWhite },
    { id: 'purpleMagic', kind: 'magic', family: 'magic', match: c => !!(c.magic || c.magicColor === 'purple') },
    { id: 'greenMagic', kind: 'greenMagic', family: 'magic', match: c => !!(c.greenMagic || c.magicColor === 'green') },
    { id: 'potion', kind: 'potion', family: 'item', match: c => !!c.potion },
    { id: 'superPurify', kind: 'superPurify', family: 'purify', match: c => !!c.superPurify },
    { id: 'purify', kind: 'purify', family: 'purify', match: c => !!c.purify },
    { id: 'drawThree', kind: 'drawThree', family: 'draw', match: c => !!c.drawThree },
    { id: 'drawTwo', kind: 'drawTwo', family: 'draw', match: c => !!c.drawTwo },
    { id: 'swapHand', kind: 'swap', family: 'utility', match: c => !!c.swapHand },
    { id: 'shuffleToDeck', kind: 'shuffle', family: 'utility', match: c => !!c.shuffleToDeck },
    { id: 'black', kind: 'wild', family: 'color', match: c => !!c.isBlack },
    { id: 'white', kind: 'wild', family: 'color', match: c => !!c.isWhite },
    { id: 'number', kind: 'number', family: 'number', match: c => !!c.isNumberCard }
  ];

  const unknown = Object.freeze({
    id: 'unknown', kind: 'unknown', family: 'unknown', card: null,
    isItem: false, isMagic: false, isTrophyWhite: false,
    isNumber: false, isBlack: false, isWhite: false
  });

  function normalized(card) {
    if (!card || typeof card !== 'object') return null;
    return root.Card && root.Card.normalize ? root.Card.normalize(card) : card;
  }

  function resolve(card) {
    const value = normalized(card);
    if (!value) return unknown;
    const definition = definitions.find(item => item.match(value));
    if (!definition) return Object.assign({}, unknown, { card: value });
    return Object.assign({}, definition, {
      card: value,
      isItem: !!value.isItemCard,
      isMagic: definition.family === 'magic',
      isTrophyWhite: definition.id === 'trophyWhite',
      isNumber: definition.id === 'number',
      isBlack: !!value.isBlack,
      isWhite: !!value.isWhite,
      effect: value.trophyEffect || null,
      name: value.trophyName || null
    });
  }

  function has(card, id) {
    const value = resolve(card);
    return value.id === id || value.kind === id;
  }

  function ownerKey(engine, owner, who) {
    if (who) return who;
    if (!engine || !engine.s) return 'player';
    if (owner === engine.s.player) return 'player';
    if (engine.s.ai2 && owner === engine.s.ai2) return 'ai2';
    return 'ai';
  }

  function targetKey(engine, target) {
    if (!engine || !engine.s) return 'ai';
    if (target === engine.s.player) return 'player';
    if (engine.s.ai2 && target === engine.s.ai2) return 'ai2';
    return 'ai';
  }

  function countDebuffs(engine, character) {
    if (!character) return 0;
    const registry = root.StatusRegistry;
    if (registry && typeof registry.list === 'function') {
      return registry.list(character)
        .filter(item => item.polarity === 'negative' || item.polarity === 'debuff')
        .reduce((sum, item) => sum + Math.max(0, Number(registry.amount(character, item.id)) || 0), 0);
    }
    return (character.burn || 0) + (character.bleed || 0) + (character.poison || 0)
      + (character.frozen ? 1 : 0) + (character.blind || 0) + (character.bomb || 0)
      + (character.hypothermia || 0);
  }

  function apply(engine, card, context) {
    if (!engine) throw new Error('CardEffects.apply requires an engine');
    const info = resolve(card);
    const ctx = context || {};
    const who = ownerKey(engine, ctx.owner, ctx.who);
    const owner = ctx.owner || engine.s && engine.s[who];
    const target = ctx.target || engine.s && engine.s[ctx.targetKey || (who === 'player' ? (engine.s.attackTarget || 'ai') : 'player')];

    if (!owner) return { ok: false, kind: info.kind, reason: 'owner-missing' };

    if (info.id === 'trophyWhite') {
      const result = typeof engine.useTrophyWhite === 'function'
        ? engine.useTrophyWhite(card, target, who)
        : false;
      return { ok: !!result, kind: info.kind, id: info.id, result };
    }

    if (info.id === 'potion') {
      const amount = engine.s.isAdventure && who !== 'player' ? 3 : 5;
      engine.heal(owner, amount);
    } else if (info.id === 'greenMagic') {
      const amount = who !== 'player' && typeof engine._isAdventureBoss === 'function' && engine._isAdventureBoss(owner) ? 5 : 3;
      engine.heal(owner, amount);
      engine.clearDebuffs(owner);
    } else if (info.id === 'purpleMagic') {
      const amount = who !== 'player' && typeof engine._isAdventureBoss === 'function' && engine._isAdventureBoss(owner) ? 5 : 3;
      engine.heal(owner, amount);
      if (target) engine.clearPositiveBuffs(target);
    } else if (info.id === 'drawThree' || info.id === 'drawTwo') {
      engine.draw(who, info.id === 'drawThree' ? 3 : 2, true);
    } else if (info.id === 'purify') {
      if (who === 'player' && engine._hasPurifyableBuff && engine._hasPurifyableBuff(owner)) {
        engine.s.pendingDialog = 'purify';
      } else {
        engine.clean(owner);
      }
    } else if (info.id === 'superPurify') {
      if (who === 'player') {
        engine.s.pendingDialog = 'superPurify';
      } else {
        const ownerDebuffs = countDebuffs(engine, owner);
        const targetGuard = target ? target.guard || 0 : 0;
        if (target && targetGuard >= 2 && ownerDebuffs < 2) engine.clean(target, true);
        else engine.clean(owner, true);
      }
    } else if (info.id === 'swapHand') {
      const swapTarget = who === 'player'
        ? (engine.s.is1v2 ? (engine.s.atkOwner && engine.s.atkOwner !== 'player' ? engine.s.atkOwner : (engine.s.attackTarget || 'ai')) : 'ai')
        : 'player';
      if (engine.h[swapTarget]) [engine.h[who], engine.h[swapTarget]] = [engine.h[swapTarget], engine.h[who]];
      if (engine.h.player) engine.h.player.forEach(item => { if (item) item.npcCard = true; });
    } else if (info.id === 'shuffleToDeck') {
      if (typeof engine._shuffleDiscardIntoDeck === 'function') engine._shuffleDiscardIntoDeck(who);
      engine.emit('desc', '弃牌库已洗回牌堆');
    }

    return {
      ok: true,
      kind: info.kind,
      id: info.id,
      owner: who,
      target: targetKey(engine, target)
    };
  }

  const CardEffects = Object.freeze({
    definitions: Object.freeze(definitions.slice()),
    resolve,
    has,
    kind: card => resolve(card).kind,
    isItem: card => resolve(card).isItem,
    isMagic: card => resolve(card).isMagic,
    isTrophyWhite: card => resolve(card).isTrophyWhite,
    apply
  });

  root.CardEffects = CardEffects;
  global.CardEffects = CardEffects;
})(window);
