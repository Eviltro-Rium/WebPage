/**
 * Adventure battle session storage.
 *
 * The map UI and battle controller use this single boundary for suspend,
 * resume, clear, and explicit-abandon behavior. Combat engines never touch
 * sessionStorage directly.
 */
(function (global) {
  const KEY = 'furryAdventureCombatSessionV1';
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

  function storage() {
    try { return global.sessionStorage || null; } catch (_) { return null; }
  }

  function build(engine) {
    if (!engine || !engine.s || engine.testMode) return null;
    return {
      version: 1,
      characterName: engine.s.player && engine.s.player.name,
      mapName: engine._adventureEngine && engine._adventureEngine.mapName,
      enemy: engine.s.ai && engine.s.ai.name,
      enemy2: engine.s.ai2 && engine.s.ai2.name,
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
        return true;
      } catch (_) {
        return false;
      }
    },
    load() {
      const target = storage();
      if (!target) return null;
      try {
        const raw = target.getItem(KEY);
        const data = raw ? JSON.parse(raw) : null;
        return data && data.version === 1 && data.battle ? data : null;
      } catch (_) {
        return null;
      }
    },
    clear() {
      const target = storage();
      if (!target) return;
      try { target.removeItem(KEY); } catch (_) { /* private storage */ }
    },
    matches(session, characterName, mapName) {
      if (!session || session.characterName !== characterName) return false;
      return !mapName || !session.mapName || session.mapName === mapName;
    }
  });

  global.AdventureBattleSession = AdventureBattleSession;
})(window);
