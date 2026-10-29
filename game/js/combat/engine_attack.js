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
      if (blocked) return 0;
      const target=this.s[defenderKey];
      const options=this._incomingDamageOptions(target,{unblockable:!!(attack&&(attack.unblock||attack.isDrain)),isDrain:!!(attack&&attack.isDrain),pendingAttack:attack});
      return this._prepareHardenedHit(target,amount,options);
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
      const methods = {burn:'burn',bleed:'bleed',poison:'poison',freeze:'freeze',blind:'blind',iceSeal:'iceSeal',applyHypnosis:'hypnosis',hypothermia:'hypothermia',thorns:'thorns',sandblind:'sandblind',quicksand:'quicksand',magmaVein:'magmaVein',harden:'harden',addGuard:'guard',parasite:'parasite',settleBurn:'burn',clearDebuffs:'debuffs',clearPositiveBuffs:'buffs'};
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
      // 'immediate': statuses land before damage settles and before attack-buff choices.
      if (timing === 'immediate') return result;
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
      const counters = (this.s.queuedCounterHits || []).slice();
      this.s.queuedCounterHits = [];
      const result = this.dealAttackHit(attacker, target, damage, isDrain,
        {allowAvoidance: !pending.avoidanceHandled});
      for (const hit of counters) {
        const counterTarget = this.s[hit.targetKey];
        if (!counterTarget) continue;
        this.dealAttackHit(this.s[hit.attackerKey], counterTarget, hit.damage, !!hit.isDrain,
          {allowAvoidance: false, damageSource: 'counter', hardenHandled: !!hit.hardenHandled});
      }
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
    },

    _queuedPlayerCounterDamage() {
      return (this.s.queuedCounterHits || []).reduce((sum, hit) => {
        return hit.targetKey === 'player' ? sum + Math.max(0, Number(hit.damage) || 0) : sum;
      }, 0);
    },

    _needsCounterAvoidChoice() {
      return !!(this.s && this.playerNeedsAvoidChoice() && this._queuedPlayerCounterDamage() > 0 &&
        (this.s.queuedCounterHits || []).some(hit => hit.targetKey === 'player' && !hit.avoidanceHandled));
    },

    _askCounterAvoidance() {
      const damage = this._queuedPlayerCounterDamage();
      if (damage <= 0) return false;
      this.s.counterAvoidance = true;
      this.s.pendingGuardDamage = damage;
      this.s.pendingGuardBleed = 0;
      this.s.pendingDefenseDamage = damage;
      this.s.pendingDialog = 'guard';
      this.s.phase = 'GUARD_CHOICE';
      this.s.busy = false;
      this.emit('desc', '受到反击' + damage + '点，可消耗[飞翔]或[守护]');
      return true;
    },

    _applyCounterAvoidanceRemaining(remaining) {
      remaining = Math.max(0, Number(remaining) || 0);
      const hits = this.s.queuedCounterHits || [];
      let leftover = remaining;
      for (const hit of hits) {
        if (hit.targetKey !== 'player') continue;
        const take = Math.min(Math.max(0, Number(hit.damage) || 0), leftover);
        hit.damage = take;
        hit.avoidanceHandled = true;
        leftover -= take;
      }
      this.s.queuedCounterHits = hits.filter(hit => hit.targetKey !== 'player' || hit.damage > 0);
      this.s.counterAvoidance = false;
      this.s.pendingDialog = null;
      this.s.pendingGuardDamage = 0;
      this.s.pendingGuardBleed = 0;
      const stored = this.s.pendingPlayerAttackRemaining;
      const bleed = this.s.pendingPlayerAttackBleed || 0;
      this.s.pendingPlayerAttackRemaining = null;
      this.s.pendingPlayerAttackBleed = 0;
      if (stored != null) this.deferSettlement('PLAYER_ATTACK', stored, bleed);
      return this.check();
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
  const counter = Engine.prototype.counterAttack;
  Engine.prototype.counterAttack = function(attacker, target, damage, opts) {
    if (this.s && this.s.pendingAttack) {
      const attackerKey = typeof attacker === 'string' ? attacker : this._who(attacker);
      const targetKey = typeof target === 'string' ? target : this._who(target);
      const amount = Number(damage) || 0;
      if (!attackerKey || !targetKey || !amount) return 0;
      const cfg = opts || {};
      let remaining = amount;
      const targetChar = this.s[targetKey];
      const avoidOpts = Object.assign({ forceSpend: true, damageSource: 'counter' }, cfg);
      const playerChoice = targetKey === 'player' && cfg.allowAvoidance !== false && this.playerNeedsAvoidChoice();
      if (playerChoice && targetChar && typeof this._prepareHardenedHit === 'function') {
        const incoming = this._incomingDamageOptions(targetChar, avoidOpts);
        remaining = this._prepareHardenedHit(targetChar, remaining, incoming);
      } else if (cfg.allowAvoidance !== false && targetChar && typeof this.applyDefenderAvoidance === 'function') {
        remaining = this.applyDefenderAvoidance(targetChar, remaining, avoidOpts);
      }
      remaining = Math.max(0, Number(remaining) || 0);
      if (remaining > 0) {
        const queued = this.s.queuedCounterHits || (this.s.queuedCounterHits = []);
        queued.push({
          attackerKey, targetKey, damage: remaining,
          isDrain: !!(cfg.isDrain || cfg.type === 'drain'),
          hardenHandled: playerChoice,
          avoidanceHandled: !playerChoice
        });
      }
      return remaining;
    }
    return counter.call(this, attacker, target, damage, opts);
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
    if (kind === 'PLAYER_ATTACK' && this._needsCounterAvoidChoice()) {
      this.s.pendingPlayerAttackRemaining = prepared;
      this.s.pendingPlayerAttackBleed = bleed;
      this._askCounterAvoidance();
      return this.check();
    }
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
    if (this.s && this.s.counterAvoidance) {
      this.s.pendingGuardDamage = Math.max(0, Number(damage) || 0);
      this.s.pendingGuardBleed = 0;
      this.s.pendingDefenseDamage = this.s.pendingGuardDamage;
      this.s.pendingDialog = 'guard';
      this.s.phase = 'GUARD_CHOICE';
      this.s.busy = false;
      return this.check();
    }
    const previousBleed = bleed == null ? this.s.player.bleed || 0 : bleed;
    const prepared = this.prepareAttackSettlement(damage, 'player');
    if (prepared <= 0) {
      // Diving (or another full block) skips the guard dialog, but a defense skill's
      // bleed settlement must still use the bleed captured for this defense.
      this.s.pendingGuardBleed = previousBleed;
      return this._settleAvoidedAttack(0);
    }
    return ask.call(this, prepared, previousBleed);
  };
  const guard = Engine.prototype.chooseGuard;
  Engine.prototype.chooseGuard = function(stacks) {
    if (this.s && this.s.counterAvoidance) {
      const incoming = this.s.pendingGuardDamage || 0;
      const use = Math.max(0, Math.min(stacks || 0, this.s.player.guard, incoming));
      const remaining = Math.max(0, incoming - use);
      const S = window.FurryGame && window.FurryGame.StatusService;
      if (S) S.remove(this.s.player, 'guard', use); else this.s.player.guard -= use;
      this.emit('desc', use
        ? '消耗' + use + '层[守护]，减免' + use + '点反击伤害，剩余' + remaining + '点待结算'
        : '不消耗[守护]，反击' + remaining + '点待结算');
      return this._applyCounterAvoidanceRemaining(remaining);
    }
    if (this.s.pendingAttack) this.s.pendingAttack.avoidanceHandled = true;
    return guard.call(this, stacks);
  };
  const fly = Engine.prototype.chooseFly;
  Engine.prototype.chooseFly = function() {
    if (!(this.s && this.s.counterAvoidance)) return fly.call(this);
    const incoming = this.s.pendingGuardDamage || 0;
    const p = this.s.player;
    if ((p.fly || 0) <= 0) return this._applyCounterAvoidanceRemaining(incoming);
    p.fly--;
    this.emit('desc', '消耗1层[飞翔]尝试躲避反击');
    const roll = this.rollD12('飞翔判定', { who: 'player' });
    if (roll <= 6) {
      this.emit('desc', '飞翔躲避成功（' + roll + '，1-6成功）');
      return this._applyCounterAvoidanceRemaining(0);
    }
    this.emit('desc', '飞翔躲避失败（' + roll + '，7-12失败）');
    this.s.pendingDialog = 'flyRetry';
    this.s.phase = 'GUARD_CHOICE';
    this.s.busy = false;
    return this.state();
  };
  const flyContinue = Engine.prototype.chooseFlyContinue;
  Engine.prototype.chooseFlyContinue = function(again) {
    const choice = again && typeof again === 'object' ? again : { again: !!again };
    if (!choice.again && choice.skipGuard) return this.chooseGuard(0);
    again = !!choice.again;
    if (this.s && this.s.counterAvoidance) {
      if (again) return this.chooseFly();
      return this.askGuard(this.s.pendingGuardDamage || 0, 0);
    }
    return flyContinue.call(this, again);
  };
  const avoided = Engine.prototype._settleAvoidedAttack;
  Engine.prototype._settleAvoidedAttack = function(damage) {
    if (this.s && this.s.counterAvoidance) return this._applyCounterAvoidanceRemaining(damage);
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
