/**
 * Adventure battle session storage.
 *
 * The map UI and battle controller use this single boundary for suspend,
 * resume, clear, and explicit-abandon behavior. Combat engines never touch
 * storage directly.
 *
 * Stored in localStorage (not sessionStorage) so a mid-fight page refresh
 * cannot drop the encounter and let the player re-enter the same uncleared
 * room for a free rematch.
 */
(function (global) {
  const KEY = 'furryAdventureCombatSessionV1';
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

  function storage() {
    try { return global.localStorage || null; } catch (_) { return null; }
  }

  function build(engine) {
    if (!engine || !engine.s || engine.testMode) return null;
    const adv = engine._adventureEngine;
    const pos = adv && adv.s && adv.s.pos ? clone(adv.s.pos) : null;
    return {
      version: 1,
      characterName: engine.s.player && engine.s.player.name,
      mapName: adv && adv.mapName,
      enemy: engine.s.ai && engine.s.ai.name,
      enemy2: engine.s.ai2 && engine.s.ai2.name || null,
      pos: pos,
      battle: {
        s: clone(engine.s),
        piles: clone(engine.piles),
        h: clone(engine.h),
        events: clone(engine.events),
        ver: engine.ver,
        pendingSettlement: clone(engine.pendingSettlement),
        tableTopOwner: engine.tableTopOwner,
        testMode: false
      }
    };
  }

  const AdventureBattleSession = Object.freeze({
    key: KEY,
    build,
    save(engine, options = {}) {
      if (options.abandon || !engine || !engine.s || engine.testMode) return false;
      if (engine.s.phase === 'GAME_OVER') {
        this.clear();
        return false;
      }
      const target = storage();
      if (!target) return false;
      try {
        const snapshot = build(engine);
        if (!snapshot) return false;
        target.setItem(KEY, JSON.stringify(snapshot));
        // Drop the legacy sessionStorage copy so a refresh cannot resume a
        // stale in-tab snapshot that disagrees with localStorage.
        try {
          if (global.sessionStorage) global.sessionStorage.removeItem(KEY);
        } catch (_) { /* ignore */ }
        return true;
      } catch (_) {
        return false;
      }
    },
    load() {
      const target = storage();
      if (!target) return null;
      try {
        let raw = target.getItem(KEY);
        // One-time migration: older builds kept the fight only in sessionStorage.
        if (!raw) {
          try {
            const legacy = global.sessionStorage && global.sessionStorage.getItem(KEY);
            if (legacy) {
              raw = legacy;
              target.setItem(KEY, legacy);
              global.sessionStorage.removeItem(KEY);
            }
          } catch (_) { /* ignore */ }
        }
        const data = raw ? JSON.parse(raw) : null;
        return data && data.version === 1 && data.battle ? data : null;
      } catch (_) {
        return null;
      }
    },
    clear() {
      const target = storage();
      if (target) {
        try { target.removeItem(KEY); } catch (_) { /* private storage */ }
      }
      try {
        if (global.sessionStorage) global.sessionStorage.removeItem(KEY);
      } catch (_) { /* ignore */ }
    },
    matches(session, characterName, mapName) {
      if (!session || session.characterName !== characterName) return false;
      return !mapName || !session.mapName || session.mapName === mapName;
    }
  });

  global.AdventureBattleSession = AdventureBattleSession;
})(window);
