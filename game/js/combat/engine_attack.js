/* Public attack/defense boundary.  Internals may evolve without changing
 * battle adapters or UI callers. */
(function (global) {
  const Combat = global.FurryGame || {};
  const Engine = global.Engine;
  if (!Engine) throw new Error('engine_attack.js requires engine.js');

  const EngineAttack = {
    resolveAttack(attacker, defender, amount, options) {
      const opts = options || {};
      if (typeof this.dealAttackHit !== 'function') return 0;
      return this.dealAttackHit(attacker, defender, Math.max(0, Number(amount) || 0), !!opts.isDrain);
    },

    resolveDefense(defender, amount, options) {
      const opts = options || {};
      if (opts.skip || opts.unblock) return Math.max(0, Number(amount) || 0);
      if (typeof this.applyDefenderAvoidance === 'function') {
        return this.applyDefenderAvoidance(defender, Math.max(0, Number(amount) || 0));
      }
      return Math.max(0, Number(amount) || 0);
    },

    resolveAttackAndDefense(attacker, defender, amount, options) {
      const opts = options || {};
      const remaining = this.resolveDefense(defender, amount, opts);
      this.resolveAttack(attacker, defender, remaining, opts);
      return remaining;
    }
  };

  Combat.EngineAttack = Object.freeze(EngineAttack);
  Object.assign(Engine.prototype, EngineAttack);
})(window);
