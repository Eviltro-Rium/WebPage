window.Characters = window.Characters || {};
window.CharacterRegistry = {
  _chars: {},
  register(mod) { this._chars[mod.name] = mod; },
  get(name) { return this._chars[name] || null; },
  all() { return Object.values(this._chars); },
  names() { return Object.keys(this._chars); }
};
