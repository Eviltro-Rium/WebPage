/* Deterministic runtime services shared by combat, adventure and UI code. */
(function (global) {
  const root = global.FurryGame || (global.FurryGame = {});
  let source = () => Math.random();
  const timers = new WeakMap();

  function random() {
    const value = Number(source());
    return Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
  }

  function randomInt(max) {
    const limit = Math.max(0, Number(max) || 0);
    return limit ? Math.floor(random() * limit) : 0;
  }

  function schedule(owner, fn, delay = 0, channel = 'default') {
    if (typeof owner === 'function') {
      channel = delay || 'default';
      delay = fn || 0;
      fn = owner;
      owner = null;
    }
    const callback = typeof fn === 'function' ? fn : () => {};
    const ms = Math.max(0, Number(delay) || 0);
    if (owner && typeof owner === 'object') {
      let bucket = timers.get(owner);
      if (!bucket) { bucket = Object.create(null); timers.set(owner, bucket); }
      if (bucket[channel]) clearTimeout(bucket[channel]);
      let handle;
      handle = setTimeout(() => {
        if (bucket[channel] === handle) delete bucket[channel];
        callback();
      }, ms);
      bucket[channel] = handle;
      return handle;
    }
    return setTimeout(callback, ms);
  }

  function cancel(owner, channel = 'default') {
    if (!owner || typeof owner !== 'object') return;
    const bucket = timers.get(owner);
    if (!bucket || !bucket[channel]) return;
    clearTimeout(bucket[channel]);
    delete bucket[channel];
  }

  function wait(ms, owner = null, channel = 'wait') {
    return new Promise(resolve => schedule(owner, resolve, ms, channel));
  }

  const api = {
    random,
    randomInt,
    schedule,
    cancel,
    wait,
    setRandomSource(fn) { source = typeof fn === 'function' ? fn : () => Math.random(); },
    resetRandomSource() { source = () => Math.random(); }
  };
  root.CombatRuntime = Object.freeze(api);
  global.CombatRuntime = root.CombatRuntime;
})(window);
