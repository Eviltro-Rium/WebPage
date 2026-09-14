/* Serializable combat snapshots for save/resume and browser refresh. */
(function (global) {
  const Combat = global.FurryGame || {};
  const Engine = global.Engine;
  if (!Engine) throw new Error('engine_snapshot.js requires engine.js');

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

  const EngineSnapshot = {
    capture(engine) {
      if (!engine) throw new Error('snapshot requires an engine');
      return {
        version: 1,
        mode: engine.mode || null,
        state: clone(engine.s),
        hands: clone(engine.h),
        deck: clone(engine.deck),
        discardBottom: clone(engine.discardBottom),
        events: clone(engine.events),
        eventVersion: Number(engine.ver) || 0,
        pendingSettlement: clone(engine.pendingSettlement)
      };
    },

    restore(engine, snapshot) {
      if (!engine || !snapshot || snapshot.version !== 1) throw new Error('无效的战斗快照');
      engine.mode = snapshot.mode || null;
      engine.s = clone(snapshot.state);
      engine.h = clone(snapshot.hands) || { player: [], ai: [] };
      engine.deck = clone(snapshot.deck) || [];
      engine.discardBottom = clone(snapshot.discardBottom) || [];
      engine.events = clone(snapshot.events) || [];
      engine.ver = Number(snapshot.eventVersion) || 0;
      engine.pendingSettlement = clone(snapshot.pendingSettlement);
      return typeof engine.state === 'function' ? engine.state() : engine.s;
    }
  };

  Combat.EngineSnapshot = Object.freeze(EngineSnapshot);
  Engine.prototype.combatSnapshot = function () { return EngineSnapshot.capture(this); };
  Engine.prototype.restoreCombatSnapshot = function (snapshot) { return EngineSnapshot.restore(this, snapshot); };
})(window);
