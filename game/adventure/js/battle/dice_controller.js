/* Adventure-only D12 decision boundary.
 * Synchronous skills are resumed by replaying their single entry action from
 * a JSON checkpoint with recorded randomness. No timer or completed result is
 * committed while waiting; already-presented event IDs are never played twice.
 *
 * Order when both remote and Magician somehow apply: remote first, then Magician ±1.
 * Docs prefer mutual exclusion on hold (cannot carry both).
 */
(function (global) {
  const E = global.AdventureBattleEngine;
  const runtime = global.FurryGame.CombatRuntime;
  if (!E || !runtime) throw new Error('dice_controller.js requires AdventureBattleEngine and CombatRuntime');
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const itemName = item => typeof item === 'string' ? item : item && item.name;
  const inventory = e => e._adventureEngine && e._adventureEngine.s
    ? e._adventureEngine.s.consumables || [] : e.s.adventureConsumables || [];
  const accessories = e => {
    if (e._adventureEngine && e._adventureEngine.s && Array.isArray(e._adventureEngine.s.accessories)) {
      return e._adventureEngine.s.accessories;
    }
    if (Array.isArray(e.s && e.s.accessories)) return e.s.accessories;
    return e.s && e.s.adventureAccessories || [];
  };
  const adventureReady = e => !!(e.s && e.s.isAdventure && e.s.player && e.s.player.alive && !e.s.player.blind);
  const hasRemote = e => inventory(e).some(item => itemName(item) === 'DiceController');
  const hasMagician = e => accessories(e).indexOf('Magician') >= 0;
  // Mutual exclusion preferred: Magician holders skip remote UI; remote holders skip Magician.
  const canControl = e => adventureReady(e) && hasRemote(e) && !hasMagician(e);
  const canMagician = e => adventureReady(e) && hasMagician(e) && !hasRemote(e);
  // Fallback if both somehow present: still allow remote then magician in rollD12.
  const canControlLoose = e => adventureReady(e) && hasRemote(e);
  const canMagicianLoose = e => adventureReady(e) && hasMagician(e);
  const needsDiceGate = e => canControlLoose(e) || canMagicianLoose(e);
  const methods = new Map();
  const WAIT = Symbol('wait-for-dice-controller');

  function capture(e) {
    e.state(); // Mirror inventory before checkpointing, including lightweight test inventory.
    return clone({s:e.s, piles:e.piles, events:e.events, ver:e.ver,
      pendingSettlement:e.pendingSettlement, tableTopOwner:e.tableTopOwner, testMode:e.testMode});
  }

  function run(e, method, args, resume) {
    const pending = e.s && e.s.pendingDiceControl;
    if (pending && !resume) return e.state();
    if (e._diceTransaction || (!resume && !needsDiceGate(e))) return methods.get(method).apply(e,args);
    const tx = resume || {method, args:clone(args), baseline:capture(e), randomTape:[], decisions:[], acknowledged:0};
    if (resume) e.restoreSession(tx.baseline, e._adventureEngine, false);
    tx.index = 0;
    const oldLater = e.later, timers = [];
    e.later = (fn,ms) => { timers.push([fn,ms]); return 0; };
    e._diceTransaction = tx;
    let waiting = false;
    try {
      runtime.withRandomTape(tx.randomTape, () => methods.get(method).apply(e,args));
    } catch (error) {
      if (error !== WAIT) throw error;
      waiting = true;
    } finally {
      e.later = oldLater;
      e._diceTransaction = null;
    }
    e.events = e.events.filter(evt => (evt.id || 0) > tx.acknowledged);
    if (waiting) {
      tx.presentedThrough = e.ver;
      delete tx.index;
      e.s.pendingDiceControl = clone(tx);
      e.s.phase = 'DICE_CHOICE';
      e.s.busy = true;
      e.s.pendingDialog = null;
    } else {
      e.s.pendingDiceControl = null;
      for (const [fn,ms] of timers) oldLater.call(e,fn,ms);
    }
    return e.state();
  }

  function applyFace(e, desc, extra, rawValue, chosen, label) {
    e.s.diceRoll.value = chosen;
    const event = e.events[e.events.length - 1];
    if (event) {
      event.value = chosen;
      event.originalValue = rawValue;
      event.controlled = true;
      if (label) {
        event.desc = extra.purpose === 'trophyDrop' ? desc : desc + '：' + chosen + '（' + label + '）';
      }
    }
    return chosen;
  }

  function openWait(tx, e, value, desc, extra, index, mode) {
    tx.value = value;
    tx.desc = desc;
    tx.diceIndex = index;
    tx.who = extra.who || 'player';
    tx.purpose = extra.purpose || 'judgment';
    tx.mode = mode;
    const evt = e.events[e.events.length - 1];
    if (evt && evt.type === 'diceRoll') evt.awaitControl = true;
    throw WAIT;
  }

  const originalRoll = E.prototype.rollD12;
  E.prototype.rollD12 = function(desc, extra = {}) {
    const tx = this._diceTransaction;
    if (!tx) return originalRoll.call(this,desc,extra);
    const index = tx.index++;
    const value = originalRoll.call(this,desc,extra);
    let decision = tx.decisions[index] || null;
    if (!decision) decision = tx.decisions[index] = {};

    // --- remote stage (DiceController); Magician-only skips ---
    if (!decision.remoteResolved) {
      if (canControlLoose(this)) {
        openWait(tx, this, value, desc, extra, index, 'remote');
      }
      decision.remoteResolved = true;
    }

    let face = value;
    if (decision.remote && decision.remote.use) {
      const items = inventory(this), itemIndex = items.findIndex(item => itemName(item) === 'DiceController');
      if (itemIndex < 0 || this.s.player.blind) throw new Error('遥控骰子不可用');
      items.splice(itemIndex, 1);
      face = applyFace(this, desc, extra, value, decision.remote.value, '遥控骰子');
    }

    // --- magician stage (±1 costs 3 HP) ---
    if (!decision.magicianResolved) {
      // After remote (or instead of): Magician may adjust. Mutual exclusion usually means
      // Magician-only path (no remote). If both somehow present, remote already applied.
      if (canMagicianLoose(this)) {
        openWait(tx, this, face, desc, extra, index, 'magician');
      }
      decision.magicianResolved = true;
    }

    if (decision.magician && Number.isInteger(decision.magician.adjust) && decision.magician.adjust !== 0) {
      const next = Math.max(1, Math.min(12, face + decision.magician.adjust));
      if (next !== face) {
        if (!decision.magician.hpPaid) {
          if (!this.s.player || this.s.player.hp <= 3) throw new Error('生命值不足3点，无法使用魔术师');
          this.hurt(this.s.player, 3);
          this.emit('desc', '魔术师：消耗3点生命');
          decision.magician.hpPaid = true;
        }
        face = applyFace(this, desc, extra, value, next, '魔术师');
      }
    }

    return face;
  };

  function choose(e, params) {
    const pending = e.s && e.s.pendingDiceControl;
    if (!pending) return e.state();
    const mode = pending.mode || 'remote';
    const original = Number(pending.value);
    const tx = clone(pending);
    if (!tx.decisions[tx.diceIndex]) tx.decisions[tx.diceIndex] = {};
    const slot = tx.decisions[tx.diceIndex];

    if (mode === 'magician') {
      let adjust = Number(params.adjust);
      if (params.use === false || params.keep === true) adjust = 0;
      if (!Number.isInteger(adjust) || adjust < -1 || adjust > 1) {
        e.emit('desc', '请选择保留、+1 或 −1');
        return e.state();
      }
      if (adjust !== 0) {
        if (!e.s.player || e.s.player.hp <= 3) {
          e.emit('desc', '生命值不足3点，无法使用魔术师');
          return e.state();
        }
        const next = original + adjust;
        if (next < 1 || next > 12) {
          e.emit('desc', '已到边界，无法再调整');
          return e.state();
        }
      }
      if (!canMagicianLoose(e)) {
        e.emit('desc', '魔术师不可用');
        return e.state();
      }
      slot.remoteResolved = true;
      slot.magicianResolved = true;
      slot.magician = { adjust };
    } else {
      const use = params.use === true;
      const value = Number(params.value);
      if (use && (!Number.isInteger(value) || value < 1 || value > 12 || !canControlLoose(e))) {
        e.emit('desc', '请选择1–12的有效骰面');
        return e.state();
      }
      if (use && Number.isInteger(original) && value === original) {
        e.emit('desc', '请选择与当前不同的骰面');
        return e.state();
      }
      slot.remoteResolved = true;
      slot.remote = use ? { use: true, value } : { use: false };
      // Magician stage still pending if Magician is available after remote.
      if (canMagicianLoose(e)) slot.magicianResolved = false;
      else slot.magicianResolved = true;
    }

    tx.acknowledged = Math.max(tx.acknowledged || 0, tx.presentedThrough || 0);
    e.s.pendingDiceControl = null;
    return run(e, tx.method, tx.args, tx);
  }

  for (const method of ['dispatch','acknowledgeEvents','aiTurn','aiTurn1v2','aiDefend','runAIDefend1v2',
    'startAITurn','endAi','endAi1v2','check']) {
    const original = E.prototype[method];
    if (typeof original !== 'function') continue;
    methods.set(method, original);
    E.prototype[method] = function(...args) {
      if (method === 'dispatch' && args[0] === 'chooseDiceControl') return choose(this, args[1] || {});
      if (method === 'dispatch' && args[0] === 'chooseMagicianAdjust') {
        return choose(this, Object.assign({ }, args[1] || {}, { /* mode inferred from pending */ }));
      }
      const pending = this.s && this.s.pendingDiceControl;
      if (pending && (method === 'acknowledgeEvents' || method === 'dispatch' && args[0] === 'clearEvents')) {
        const through = Number(method === 'dispatch' ? args[1] && args[1].throughId : args[0]) || 0;
        pending.acknowledged = Math.max(pending.acknowledged || 0, through);
        this.events = this.events.filter(evt => (evt.id || 0) > through);
        return this.state();
      }
      return run(this, method, args);
    };
  }
  global.AdventureDiceController = Object.freeze({ canControl, canMagician, hasMagician, hasRemote });
})(window);
