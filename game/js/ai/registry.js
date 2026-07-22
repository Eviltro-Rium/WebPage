window.AIRegistry = (() => {
  const modules = Object.create(null);
  const defaults = {
    attackScore() { return null; },
    defendScore() { return null; },
    keepScore() { return null; },
    skip() { return false; },
    specialEffect() { return null; }
  };

  return {
    register(mod) {
      if (!mod || typeof mod.name !== 'string' || !mod.name.trim()) {
        throw new Error('AI module requires a character name');
      }
      const normalized = Object.assign({}, defaults, mod, { name: mod.name.trim() });
      modules[normalized.name] = normalized;
      return normalized;
    },
    get(name) { return modules[name] || null; },
    all() { return Object.values(modules); },
    names() { return Object.keys(modules); }
  };
})();
