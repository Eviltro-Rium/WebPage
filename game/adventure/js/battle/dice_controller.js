/* Adventure-only D12 decision boundary.
 * Synchronous skills are resumed by replaying their single entry action from
 * a JSON checkpoint with recorded randomness. No timer or completed result is
 * committed while waiting; already-presented event IDs are never played twice.
 */
(function (global) {
  const E = global.AdventureBattleEngine;
  const runtime = global.FurryGame.CombatRuntime;
  if (!E || !runtime) throw new Error('dice_controller.js requires AdventureBattleEngine and CombatRuntime');
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const itemName = item => typeof item === 'string' ? item : item && item.name;
  const inventory = e => e._adventureEngine && e._adventureEngine.s
    ? e._adventureEngine.s.consumables || [] : e.s.adventureConsumables || [];
  const canControl = e => e.s && e.s.isAdventure && e.s.player && e.s.player.alive && !e.s.player.blind &&
    inventory(e).some(item => itemName(item) === 'DiceController');
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
    if (e._diceTransaction || (!resume && !canControl(e))) return methods.get(method).apply(e,args);
    const tx = resume || {method, args:clone(args), baseline:capture(e), randomTape:[], decisions:[], acknowledged:0};
    if (resume) e.restoreSession(tx.baseline, e._adventureEngine);
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
      // Only JSON fields are stored. A refreshed page can resume the same action.
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

  const originalRoll = E.prototype.rollD12;
  E.prototype.rollD12 = function(desc, extra = {}) {
    const tx = this._diceTransaction;
    if (!tx) return originalRoll.call(this,desc,extra);
    const index = tx.index++;
    const value = originalRoll.call(this,desc,extra);
    const decision = tx.decisions[index];
    if (decision) {
      if (!decision.use) return value;
      const items = inventory(this), itemIndex = items.findIndex(item => itemName(item) === 'DiceController');
      if (itemIndex < 0 || this.s.player.blind) throw new Error('遥控骰子不可用');
      items.splice(itemIndex,1);
      const chosen = decision.value;
      this.s.diceRoll.value = chosen;
      const event = this.events[this.events.length - 1];
      event.value = chosen; event.originalValue = value; event.controlled = true;
      event.desc = extra.purpose === 'trophyDrop' ? desc : desc + '：' + chosen + '（遥控骰子）';
      return chosen;
    }
    if (canControl(this)) {
      tx.value = value; tx.desc = desc; tx.diceIndex = index;
      tx.who = extra.who || 'player'; tx.purpose = extra.purpose || 'judgment';
      throw WAIT;
    }
    return value;
  };

  function choose(e, params) {
    const pending = e.s && e.s.pendingDiceControl;
    if (!pending) return e.state(); // Duplicate click cannot consume another item.
    const use = params.use === true;
    const value = Number(params.value);
    if (use && (!Number.isInteger(value) || value < 1 || value > 12 || !canControl(e))) {
      e.emit('desc','请选择1–12的有效骰面'); return e.state();
    }
    const tx = clone(pending);
    tx.decisions[tx.diceIndex] = use ? {use:true,value} : {use:false};
    // Prelude animations and the original die were already shown before the decision.
    tx.acknowledged = Math.max(tx.acknowledged || 0, tx.presentedThrough || 0);
    e.s.pendingDiceControl = null;
    return run(e,tx.method,tx.args,tx);
  }

  for (const method of ['dispatch','acknowledgeEvents','aiTurn','aiTurn1v2','aiDefend','runAIDefend1v2',
    'startAITurn','endAi','endAi1v2','check']) {
    const original = E.prototype[method];
    if (typeof original !== 'function') continue;
    methods.set(method,original);
    E.prototype[method] = function(...args) {
      if (method === 'dispatch' && args[0] === 'chooseDiceControl') return choose(this,args[1] || {});
      const pending = this.s && this.s.pendingDiceControl;
      if (pending && (method === 'acknowledgeEvents' || method === 'dispatch' && args[0] === 'clearEvents')) {
        const through = Number(method === 'dispatch' ? args[1] && args[1].throughId : args[0]) || 0;
        pending.acknowledged = Math.max(pending.acknowledged || 0,through);
        this.events = this.events.filter(evt => (evt.id || 0) > through);
        return this.state();
      }
      return run(this,method,args);
    };
  }
  global.AdventureDiceController = Object.freeze({canControl});
})(window);
