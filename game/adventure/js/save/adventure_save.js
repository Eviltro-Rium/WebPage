/**
 * 冒险模式存档系统
 * 在安全的非战斗阶段将引擎状态序列化到 localStorage；
 * 战斗过程另由 adventure_battle_session 将精确快照写入 localStorage，
 * 并由本模块的 activeCombat 字段锁住遭遇房间，防止刷新后重刷同一 NPC。
 */
(function () {
  const KEY = 'furryAdventureSave';
  const VERSION = 1;
  let lastContent = null, lastRaw = null;

  const SAFE_PHASES = [
    'ADVENTURE_MAP',
    'ADVENTURE_REWARD',
    'ADVENTURE_SHOP',
    'ADVENTURE_BLACKSMITH',
    'ADVENTURE_BEAST_CHOICE',
    'ADVENTURE_BEAST_DISCARD',
    'ADVENTURE_ITEM_DISCARD',
    'ADVENTURE_COMBAT_SETTLE',
    'ADVENTURE_CLEAR'
  ];

  const CLONE = v => v == null ? v : JSON.parse(JSON.stringify(v));

  function isSafePhase(phase) {
    return SAFE_PHASES.indexOf(phase) >= 0;
  }

  function save(eng) {
    try {
      const data = serialize(eng);
      if (!data) return false;
      const {savedAt, ...state} = data;
      const content = JSON.stringify(state);
      // Compare the complete snapshot, including room progress, buffs, token
      // balances and card order. Timestamp-only changes need no storage write.
      if (content === lastContent && localStorage.getItem(KEY) === lastRaw) return true;
      const raw = JSON.stringify(data);
      localStorage.setItem(KEY, raw);
      lastContent = content;
      lastRaw = raw;
      return true;
    } catch (e) { return false; }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== VERSION) return null;
      if (!data.characterName || !data.mapName) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function clear() {
    lastContent = lastRaw = null;
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  function serialize(eng) {
    const s = eng.s;
    if (!s || !s.player || !s.playerPile || !s.map) return null;
    const rooms = {};
    for (let r = 0; r < s.map.rows; r++) {
      for (let c = 0; c < s.map.cols; c++) {
        const room = s.map.get(r, c);
        if (!room || room.type === 'empty') continue;
        const entry = {
          visited: !!room.visited,
          cleared: !!room.cleared,
          rewardClaimed: !!room.rewardClaimed,
          beastTokenClaimed: !!room.beastTokenClaimed,
          locked: !!room.locked,
          stashedLoot: CLONE(room.stashedLoot) || null,
          monsterName: room.monsterName || null,
          bossName: room.bossName || null,
          reward: CLONE(room.reward) || null,
          shopSlots: CLONE(room.shopSlots) || null,
          blacksmithSlots: Array.isArray(room.blacksmithSlots) ? CLONE(room.blacksmithSlots) : null,
          shopItems: CLONE(room.shopItems) || null,
          shopSold: CLONE(room.shopSold) || {},
          doorCost: Array.isArray(room.doorCost) ? room.doorCost.slice(0, 2) : null,
          doorUnlocked: !!room.doorUnlocked
        };
        if (room.blacksmithTrophySlot !== undefined) entry.blacksmithTrophySlot = CLONE(room.blacksmithTrophySlot);
        rooms[r + ',' + c] = entry;
      }
    }
    return {
      version: VERSION,
      savedAt: Date.now(),
      characterName: s.player.name,
      mapName: eng.mapName || null,
      mapLayout: s.map.grid.map(row => row.map(room => room.code())),
      explorationVersion: 1,
      stage: s.stage || 1,
      scene: s.scene || 'castle',
      pos: CLONE(s.pos),
      phase: s.phase,
      turn: s.turn || 0,
      player: CLONE(s.player),
      currency: {
        gold: s.currency.gold || 0,
        tokens: CLONE(s.currency.tokens) || {},
        maxBeast: s.currency.maxBeast
      },
      playerPile: {
        deck: CLONE(s.playerPile.deck),
        hand: CLONE(s.playerPile.hand),
        discard: CLONE(s.playerPile.discard),
        handLimit: s.playerPile.handLimit
      },
      discardTop: CLONE(s.discardTop ? s.discardTop.get() : null),
      discardTopOwner: s.discardTopOwner || null,
      inventory: (s.inventory || []).slice(),
      consumables: (s.consumables || []).slice(),
      trophyWhiteCards: (s.trophyWhiteCards || []).slice(),
      accessories: (s.accessories || []).slice(),
      beastReward: CLONE(s.beastReward) || null,
      beastSelection: CLONE(s.beastSelection) || [],
      pendingDiscard: s.pendingDiscard || 0,
      pendingItemDiscard: s.pendingItemDiscard || 0,
      itemDiscardReturn: CLONE(s.itemDiscardReturn) || null,
      pendingCombatReward: CLONE(s.pendingCombatReward) || null,
      pendingRoomReward: CLONE(s.pendingRoomReward) || null,
      activeCombat: CLONE(s.activeCombat) || null,
      shopSelectedSlot: s.shopSelectedSlot == null ? null : s.shopSelectedSlot,
      blacksmithSelectedSlot: s.blacksmithSelectedSlot == null ? null : s.blacksmithSelectedSlot,
      rooms: rooms,
      log: (s.log || []).slice(-50)
    };
  }

  window.AdventureSave = { save, load, clear, serialize, isSafePhase, VERSION };
})();
