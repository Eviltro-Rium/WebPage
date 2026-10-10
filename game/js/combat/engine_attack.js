/* Public attack/defense boundary.  Internals may evolve without changing
 * battle adapters or UI callers. */
(function (global) {
  const Combat = global.FurryGame || {};
  const Engine = global.Engine;
  if (!Engine) throw new Error('engine_attack.js requires engine.js');

  const clone = value => Combat.Card.clone(value);
  const EngineAttack = {
    prepareAttackSettlement(remaining, defenderKey) {
      const attack = this.s.pendingAttack;
      if (!attack || attack.effectsPrepared) return this.prepareDivingMitigation(remaining, defenderKey);
      attack.effectsPrepared = true;
      // Defense conditions were decided before incoming status effects.
      const defenseSnapshot = Object.assign({},this.s[defenderKey]);
      this._restoreAttackBuffs();
      this.commitAttackStatuses('beforeDamage');
      if (typeof this.applyPendingSaikiBleed === 'function') this.applyPendingSaikiBleed();
      const target = this.s[defenderKey], attacker = this.s[this.s.atkOwner || (defenderKey === 'player' ? this._incomingNpcKey() : 'player')];
      const formula = this.s.pendingDamageFormula;
      this.s.pendingDamageFormula = null;
      if (!formula || !target || !attacker) return this.prepareDivingMitigation(remaining, defenderKey);
      const character = global.CharacterRegistry.get(formula.name);
      if (!character || typeof character.damageAtSettlement !== 'function') return this.prepareDivingMitigation(remaining, defenderKey);
      const live = character.damageAtSettlement(this, formula.value, attacker, target);
      if (live == null) return this.prepareDivingMitigation(remaining, defenderKey);
      const preview = Math.max(0, Number(attack.damage) || 0);
      const final = attack.attackModifier === 'magmaVein'
        ? Math.max(0, Math.ceil(Number(live) * 1.5) + (attack.magmaFlatBonus || 0))
        : Math.max(0, preview + (Number(live) - formula.preview) * (attack.damageMultiplier == null ? 1 : attack.damageMultiplier));
      const defense = this.s.defCard, defenseCharacter = global.CharacterRegistry.get(this.name(target));
      const mitigation = defense && defenseCharacter && typeof defenseCharacter.damageAfterDefense === 'function'
        ? defenseCharacter.damageAfterDefense(defense.value, final, defenseSnapshot, this) : null;
      let damage = mitigation != null ? mitigation
        : preview > 0 && remaining === 0 ? 0 : Math.max(0, final - (preview - remaining));
      if (damage !== remaining) this.emit('desc', '效果结算后：剩余' + damage + '点伤害', null,
        {who: defenderKey, target: defenderKey, kind: 'damageRecalculated', amount: damage});
      return this.prepareDivingMitigation(damage, defenderKey);
    },

    // Diving sees the computed hit, before either fly or guard consumes stacks.
    prepareDivingMitigation(damage, defenderKey) {
      const amount = Math.max(0, Number(damage) || 0), attack = this.s.pendingAttack;
      if (attack && attack.divingHandled) return attack.divingBlocked ? 0 : amount;
      const blocked = amount > 0 && this.divingBlocksDamage(this.s[defenderKey], this.s.atkCard);
      if (attack) { attack.divingHandled = true; attack.divingBlocked = blocked; }
      return blocked ? 0 : amount;
    },

    commitAttackStatuses(timing, targetKey) {
      const service = Combat.StatusService, registry = Combat.StatusRegistry;
      const queued = this.s.pendingSkillStatuses || [];
      const effects = queued.filter(effect => (effect.timing || 'beforeDamage') === timing &&
        (targetKey == null || effect.target === targetKey));
      // Remove first: callbacks and snapshots cannot submit the same operation twice.
      this.s.pendingSkillStatuses = queued.filter(effect => !effects.includes(effect));
      for (const effect of effects) {
        const entity = this.s[effect.target], def = registry && registry.get(effect.id);
        if (!entity || !service) continue;
        if (effect.method && typeof this[effect.method] === 'function') {
          this[effect.method](entity, ...effect.args); continue;
        }
        if (!def) continue;
        const current = registry.amount(entity, effect.id);
        const next = effect.factor != null ? current * effect.factor
          : def.stack ? current + effect.delta : effect.value;
        service.set(entity, effect.id, next);
        if (registry.amount(entity, effect.id) !== current) this.emit('buff', '[' + def.label + ']', null,
          {who: effect.target, target: effect.target, kind: effect.id, stacks: registry.amount(entity, effect.id)});
      }
    },

    captureAttackSkill(callback, name, value, attacker, target) {
      const registry = Combat.StatusRegistry;
      if (!registry) return callback();
      const keys = ['player','ai','ai2'].filter(key => this.s[key]);
      const snapshots = keys.map(key => ({key, entity:this.s[key], values:registry.all.map(def => registry.amount(this.s[key],def.id))}));
      const firstEvent = this.ver;
      const methods = {burn:'burn',bleed:'bleed',poison:'poison',freeze:'freeze',blind:'blind',iceSeal:'iceSeal',applyHypnosis:'hypnosis',hypothermia:'hypothermia',thorns:'thorns',sandblind:'sandblind',quicksand:'quicksand',magmaVein:'magmaVein',addGuard:'guard',parasite:'parasite',settleBurn:'burn',clearDebuffs:'debuffs',clearPositiveBuffs:'buffs'};
      const operations = [], originals = {};
      for (const [method,id] of Object.entries(methods)) {
        if (typeof this[method] !== 'function') continue;
        originals[method] = this[method];
        this[method] = (entity, ...args) => {
          operations.push({target:this._who(entity),id,method,polarity:method==='clearPositiveBuffs'?'debuff':method==='clearDebuffs'?'buff':undefined,args:args.map(arg => arg && typeof arg === 'object' ? Object.assign({},arg,{silent:false}) : arg)});
          // Threshold consequences belong to the commit, not speculative damage preview.
          if (method === 'settleBurn') return 0;
          if (method === 'hypothermia') return Combat.StatusService.add(entity,id,args[0]);
          return originals[method].call(this,entity,...args);
        };
      }
      let result;
      try { result = callback(); }
      finally { for (const [method, original] of Object.entries(originals)) this[method] = original; }
      if (!result || !(result.d > 0)) {
        // Status-only skills commit immediately, including threshold consequences.
        const reset = new Set();
        for (const op of operations) if (op.method === 'hypothermia' && !reset.has(op.target)) {
          const snapshot = snapshots.find(item => item.entity === this.s[op.target]);
          if (snapshot) Combat.StatusService.set(snapshot.entity,'hypothermia',snapshot.values[registry.all.findIndex(def => def.id==='hypothermia')]);
          reset.add(op.target);
        }
        for (const op of operations) if (op.method === 'settleBurn' || op.method === 'hypothermia') originals[op.method].call(this,this.s[op.target],...op.args);
        return result;
      }
      const queued = this.s.pendingSkillStatuses || (this.s.pendingSkillStatuses = []);
      const definition = global.CharacterRegistry.get(name);
      const rule = definition && definition.attackEffectTiming;
      const timing = (typeof rule === 'function' ? rule(value, this) : rule && rule[value]) || 'beforeDamage';
      for (const operation of operations) operation.timing = timing;
      queued.push(...operations);
      if (name === 'Vixraps' && value === 5) queued.push({target:this._who(target),id:'burn',factor:2,timing});
      const seen = new Set();
      for (const snapshot of snapshots) {
        if (seen.has(snapshot.entity)) continue;
        seen.add(snapshot.entity);
        registry.all.forEach((def, index) => {
          if (def.mark) return;
          const before = snapshot.values[index], after = registry.amount(snapshot.entity,def.id);
          if (before === after) return;
          // Consumed attack resources are locked costs, not delayed effects.
          if (snapshot.entity===attacker && after<before && (def.id==='crit' || def.id.startsWith('chaos_')) &&
              !operations.some(op => op.target===this._who(attacker) && op.method==='clearPositiveBuffs')) return;
          const key = this._who(snapshot.entity);
          if (!(name==='Vixraps' && value===5 && snapshot.entity===target && def.id==='burn') && !operations.some(op => op.target===key && (op.id===def.id || op.method==='clearDebuffs' && def.polarity==='debuff' || op.method==='clearPositiveBuffs' && def.polarity==='buff'))) queued.push({target:key,id:def.id,delta:after-before,value:after,timing,
            factor:def.id==='burn' && snapshot.entity===target && name==='Vixraps' && value===5 ? 2 : null});
          Combat.StatusService.set(snapshot.entity,def.id,before);
        });
      }
      this.events = this.events.filter(event => !(event.id > firstEvent && event.type==='buff' &&
        queued.some(effect => effect.id===event.kind && effect.target===(event.target||event.who))));
      this.s.pendingDamageFormula = {name,value,preview:Math.max(0,Number(result.d)||0)};
      return result;
    },


    settlePreparedHit(attacker, target, pending) {
      let damage = Math.max(0, Number(pending.damage) || 0);
      const isDrain = !!(pending.isDrain || (this.s.pendingAttack && this.s.pendingAttack.isDrain));
      const attack = this.s.pendingAttack;
      if (attack && attack.divingHandled ? attack.divingBlocked : this.divingBlocksDamage(target, this.s.atkCard)) damage = 0;
      else if (!pending.avoidanceHandled && !isDrain && target !== this.s.player) damage = this.applyDefenderAvoidance(target, damage);
      const result = this.dealAttackHit(attacker, target, damage, isDrain,
        {allowAvoidance: !pending.avoidanceHandled});
      this.commitAttackStatuses('afterDamage', this._who(target));
      this.settleBleed(target, pending.bleed);
      return result;
    },

    // This queue contains only visual copies, never physical pile ownership.
    finishJudgmentPresentation() {
      if(!this.s)return;
      const cards=clone(this.s.revealCards||[]), moves=clone(this.s.pendingJudgmentMoves||[]);
      this.s.pendingJudgmentMoves=[];
      if(!cards.length&&!moves.length)return;
      this.s.revealCards=[];
      this.s.diceRoll=null;
      this.emit('judgmentEnd','防御结算结束，移走判定牌',null,{cards,moves});
    },

    // Defense effects commit immediately in skill order; never join the attack queue.
    // Older skills that write a status directly still receive a typed feedback event.
    resolveDefenseSkill(callback) {
      const registry = Combat.StatusRegistry, service = Combat.StatusService;
      if (!registry || !service || this._resolvingDefenseSkill) return callback();
      const keys = ['player', 'ai', 'ai2'].filter(key => this.s[key]);
      const seen = new Map(keys.map(key => [key, service.snapshot(this.s[key])]));
      const originalEmit = this.emit;
      const properties = entity => Object.fromEntries(registry.all.map(def => [def.property, entity[def.property]]));
      const flush = (type, extra = {}) => {
        for (const key of keys) {
          const entity = this.s[key], before = seen.get(key), after = service.snapshot(entity);
          seen.set(key, after);
          for (const def of registry.all) {
            if (before[def.id] === after[def.id]) continue;
            const covered = (extra.target || extra.who) === key &&
              (['buff', 'buffSettle', 'burnSettle', 'bleedSettle', 'poisonSettle', 'bombExplode'].includes(type)) &&
              (extra.kind === def.id || extra.kind === 'chaos_reset' && def.id.startsWith('chaos_'));
            if (covered) continue;
            const previous = Number(before[def.id]) || 0, current = registry.amount(entity, def.id);
            const delta = current - previous;
            const desc = (delta > 0 ? '+' : '-') + (Math.abs(delta) > 1 ? Math.abs(delta) : '') + '[' + def.label + ']';
            originalEmit.call(this, 'buff', desc, null, {who:key, target:key, kind:def.id,
              stacksBefore:previous, stacks:current, source:'defense', statusAfter:properties(entity)});
          }
        }
      };
      this._resolvingDefenseSkill = true;
      this.emit = (type, desc, card, extra = {}) => {
        flush(type, extra);
        const key = extra.target || extra.who, entity = this.s[key];
        const metadata = entity ? Object.assign({}, extra, {source:'defense', statusAfter:properties(entity)}) : extra;
        return originalEmit.call(this, type, desc, card, metadata);
      };
      try { return callback(); }
      finally {
        try { flush(); }
        finally { this.emit = originalEmit; this._resolvingDefenseSkill = false; }
      }
    },

    resolveAttack(attacker, defender, amount, options) {
      const opts = options || {};
      if (typeof this.dealAttackHit !== 'function') return 0;
      return this.dealAttackHit(attacker, defender, Math.max(0, Number(amount) || 0), !!opts.isDrain, opts);
    },

    resolveDefense(defender, amount, options) {
      const remaining = Math.max(0, Number(amount) || 0);
      if (remaining <= 0) return 0;
      if (Combat.EngineDamage && !Combat.EngineDamage.canAvoid(options || {})) return remaining;
      // skip/unblock only skip playing a defend card; fly and guard still apply.
      if (typeof this.applyDefenderAvoidance === 'function') {
        return this.applyDefenderAvoidance(defender, remaining, { forceSpend: true });
      }
      return remaining;
    },

    resolveAttackAndDefense(attacker, defender, amount, options) {
      const opts = options || {};
      const remaining = this.resolveDefense(defender, amount, opts);
      this.resolveAttack(attacker, defender, remaining, Object.assign({}, opts, {allowAvoidance:false}));
      return remaining;
    }
  };

  Combat.EngineAttack = Object.freeze(EngineAttack);
  Object.assign(Engine.prototype, EngineAttack);
  // Every mode shares the same settlement boundary. Item/counter AOE does
  // not finish the current attack and therefore cannot release its judgment.
  const perform = Engine.prototype.performAttack;
  Engine.prototype.performAttack = function(options = {}) {
    const result=perform.call(this,options);
    if(options.commitAttackEffects)this.finishJudgmentPresentation();
    return result;
  };
  // Pure-effect/zero-damage branches can skip the main settlement path.
  for(const method of ['afterAttack','continueAIAttack','endAi','endAi1v2']) {
    const original=Engine.prototype[method];
    if(typeof original!=='function')continue;
    Engine.prototype[method]=function(...args) {
      this.finishJudgmentPresentation();
      return original.apply(this,args);
    };
  }
  const defer = Engine.prototype.deferSettlement;
  Engine.prototype.deferSettlement = function(kind, damage, bleed) {
    const target = kind === 'PLAYER_ATTACK' ? (this.s.attackTarget || 'ai') : 'player';
    const prepared = this.prepareAttackSettlement(damage, target);
    if (kind === 'AI_ATTACK' && prepared > 0 && !(this.s.pendingAttack && this.s.pendingAttack.avoidanceHandled) && this.playerNeedsAvoidChoice()) {
      this.askGuard(prepared, bleed);
      return this.check();
    }
    const result = defer.call(this, kind, prepared, bleed);
    if (this.pendingSettlement) this.pendingSettlement.avoidanceHandled = !!(this.s.pendingAttack && this.s.pendingAttack.avoidanceHandled);
    return result;
  };
  const ask = Engine.prototype.askGuard;
  Engine.prototype.askGuard = function(damage, bleed) {
    const previousBleed = bleed == null ? this.s.player.bleed || 0 : bleed;
    const prepared = this.prepareAttackSettlement(damage, 'player');
    if (prepared <= 0) return this._settleAvoidedAttack(0);
    return ask.call(this, prepared, previousBleed);
  };
  const guard = Engine.prototype.chooseGuard;
  Engine.prototype.chooseGuard = function(stacks) {
    if (this.s.pendingAttack) this.s.pendingAttack.avoidanceHandled = true;
    return guard.call(this, stacks);
  };
  const avoided = Engine.prototype._settleAvoidedAttack;
  Engine.prototype._settleAvoidedAttack = function(damage) {
    if (this.s.pendingAttack) this.s.pendingAttack.avoidanceHandled = true;
    return avoided.call(this, damage);
  };
  const cancel = Engine.prototype.cancelAttackDebuffs;
  Engine.prototype.cancelAttackDebuffs = function(owner, reflect) {
    const registry = Combat.StatusRegistry;
    const incoming = (this.s.pendingSkillStatuses || []).filter(effect => effect.target === owner && (effect.polarity || (registry.get(effect.id) || {}).polarity) === 'debuff');
    this.s.pendingSkillStatuses = (this.s.pendingSkillStatuses || []).filter(effect => !incoming.includes(effect));
    if (this.s.pendingSaikiBleed && this.s.pendingSaikiBleed.target === this.s[owner]) this.s.pendingSaikiBleed = null;
    if (reflect) {
      const target = owner === 'player' ? this._incomingNpcKey() : 'player';
      this.s.pendingSkillStatuses.push(...incoming.map(effect => Object.assign({}, effect, {target})));
    }
    return cancel.call(this, owner, reflect);
  };
})(window);
