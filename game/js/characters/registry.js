window.Characters = window.Characters || {};
window.CharacterRegistry = {
  _chars: {},
  register(mod) {
    if (typeof mod.defend === 'function' && !mod.defend.combatBoundary) {
      const defend = mod.defend;
      mod.defend = function (engine, ...args) {
        const run = () => defend.call(this, engine, ...args);
        return typeof engine.resolveDefenseSkill === 'function' ? engine.resolveDefenseSkill(run) : run();
      };
      mod.defend.combatBoundary = true;
    }
    this._chars[mod.name] = mod;
  },
  get(name) { return this._chars[name] || null; },
  all() { return Object.values(this._chars); },
  names() { return Object.keys(this._chars); }
};
