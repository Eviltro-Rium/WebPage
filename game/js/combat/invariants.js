/* Runtime checks for card ownership and pile conservation.
 *
 * Pile topology belongs to EngineModes. This module only consumes the
 * adapter's invariant view and stays independent from mode internals.
 */
(function (global) {
  const root = global.FurryGame || (global.FurryGame = {});
  const participants = ['player', 'ai', 'ai2'];

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const cardKey = card => {
    if (!card || typeof card !== 'object') return null;
    const copy = {};
    Object.keys(card).sort().forEach(key => {
      if (key === 'chosenColor' || key === 'npcCard') return;
      copy[key] = card[key];
    });
    return JSON.stringify(copy);
  };

  function pushAll(target, list) {
    if (Array.isArray(list)) list.forEach(card => { if (card) target.push(card); });
  }

  function adapterView(engine) {
    const modes = root.EngineModes || global.EngineModes;
    if (!modes || typeof modes.invariantView !== 'function') return null;
    return modes.invariantView(engine);
  }

  function physicalCollections(engine, view = adapterView(engine)) {
    const result = { player: [], npc: [], shared: !!(view && view.topology === 'shared') };
    if (!view) return result;

    if (view.topology === 'isolated') {
      const player = view.playerPile;
      if (player) {
        pushAll(result.player, player.deck);
        pushAll(result.player, player.hand);
        pushAll(result.player, player.discard);
      }
      // Challenge rooms expose two hands but one shared NPC deck/discard.
      const seenDecks = new Set();
      const seenDiscards = new Set();
      (view.npcPiles || []).forEach(entry => {
        const pile = entry && entry.pile;
        if (!pile) return;
        if (pile.deck && !seenDecks.has(pile.deck)) {
          seenDecks.add(pile.deck);
          pushAll(result.npc, pile.deck);
        }
        pushAll(result.npc, pile.hand);
        if (pile.discard && !seenDiscards.has(pile.discard)) {
          seenDiscards.add(pile.discard);
          pushAll(result.npc, pile.discard);
        }
      });
      return result;
    }

    // Classic modes intentionally use one shared physical pool.
    pushAll(result.npc, view.deck);
    const hands = view.hands || {};
    (view.participants || participants).forEach(owner => pushAll(result.npc, hands[owner]));
    pushAll(result.npc, view.discard);
    if (view.tableTop) result.npc.push(view.tableTop);
    return result;
  }

  function pileForTop(view, owner) {
    if (!view || view.topology !== 'isolated') return null;
    if (owner === 'ai2') {
      const entry = (view.npcPiles || []).find(item => item && item.key === 'ai2');
      return entry ? entry.pile : null;
    }
    if (owner === 'player') return view.playerPile;
    const entry = (view.npcPiles || []).find(item => item && item.key === owner);
    return entry ? entry.pile : null;
  }

  function counts(cards) {
    const map = Object.create(null);
    cards.forEach(card => {
      const key = cardKey(card);
      if (key) map[key] = (map[key] || 0) + 1;
    });
    return map;
  }

  function check(engine, reason = 'manual', options = {}) {
    const errors = [];
    if (!engine || !engine.s) return { ok: true, reason, errors };

    const view = adapterView(engine);
    if (!view) errors.push('战斗模式适配器未提供不变量视图');
    const collections = physicalCollections(engine, view);

    if (view && view.topology === 'isolated') {
      const npcEntries = view.npcPiles || [];
      if (npcEntries.length > 1 && (!view.sharedNpcDeck || !view.sharedNpcDiscard)) {
        errors.push('冒险1v2 NPC牌库未共享');
      }
      const playerPile = view.playerPile;
      for (const entry of npcEntries) {
        const pile = entry && entry.pile;
        if (!pile || !playerPile) continue;
        if (playerPile.deck === pile.deck || playerPile.discard === pile.discard) {
          errors.push('玩家与NPC牌堆未隔离');
          break;
        }
      }
      const playerObjects = new Set(collections.player);
      if (collections.npc.some(card => playerObjects.has(card))) {
        errors.push('玩家与NPC共享同一张牌对象');
      }
    }

    if (view && view.tableTop) {
      const owner = view.tableTopOwner;
      if (owner && !(view.participants || participants).includes(owner)) {
        errors.push('弃牌库顶owner无效');
      }
      const pile = pileForTop(view, owner);
      if (pile && (!pile.discard || !pile.discard.length ||
          cardKey(pile.discard[pile.discard.length - 1]) !== cardKey(view.tableTop))) {
        errors.push('弃牌库顶不属于记录的牌堆');
      }
    }

    if (view && view.roomEnded) {
      const npcHands = [];
      (view.npcPiles || []).forEach(entry => {
        if (entry && entry.pile && Array.isArray(entry.pile.hand)) npcHands.push(...entry.pile.hand);
      });
      if (view.topology === 'shared') {
        const hands = view.hands || {};
        (view.participants || participants).filter(key => key !== 'player').forEach(key => npcHands.push(...(hands[key] || [])));
      }
      if (npcHands.length) errors.push('战斗结束NPC手牌未回收');
    }

    const all = collections.player.concat(collections.npc);
    const current = counts(all);
    if (!engine._invariantBaseline) {
      engine._invariantBaseline = clone(current);
    } else if (options.conserve !== false) {
      const baseline = engine._invariantBaseline;
      Object.keys(current).forEach(key => {
        if ((current[key] || 0) > (baseline[key] || 0)) errors.push('牌重复或凭空增加');
      });
      Object.keys(baseline).forEach(key => {
        if ((current[key] || 0) < (baseline[key] || 0) && !options.transient) errors.push('牌丢失');
      });
    }

    const report = { ok: errors.length === 0, reason, errors, total: all.length, mode: view && view.mode || null };
    if (!report.ok && options.throw) throw new Error('[CombatInvariants] ' + errors.join('；'));
    if (!report.ok && options.warn && global.console && console.warn) {
      console.warn('[CombatInvariants]', reason, errors);
    }
    return report;
  }

  root.CombatInvariants = Object.freeze({ check, cardKey, physicalCollections, adapterView });
  global.CombatInvariants = root.CombatInvariants;
})(window);
