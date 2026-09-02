/**
 * 冒险模式注册表
 * 仿 CharacterRegistry / AIRegistry 模式，集中管理怪物、Boss、道具定义。
 * 每个实体通过 IIFE 调用 register 注册，运行时通过 get 按名取用。
 */
window.AdventureRegistry = {
  _monsters: {},
  _bosses: {},
  _items: {},

  registerMonster(mod) { this._monsters[mod.name] = mod; },
  registerBoss(mod)    { this._bosses[mod.name] = mod; },
  registerItem(mod)    { this._items[mod.name] = mod; },

  getMonster(name) { return this._monsters[name] || null; },
  getBoss(name)    { return this._bosses[name] || null; },
  getItem(name)    { return this._items[name] || null; },

  allMonsters() { return Object.values(this._monsters); },
  allBosses()   { return Object.values(this._bosses); },
  allItems()    { return Object.values(this._items); },

  itemsByKind(kind) {
    if (!this._itemsByKind) {
      this._itemsByKind = {};
      for (const it of Object.values(this._items)) {
        const k = it.kind || 'unknown';
        (this._itemsByKind[k] || (this._itemsByKind[k] = [])).push(it);
      }
    }
    return this._itemsByKind[kind] || [];
  },

  monsterNames() { return Object.keys(this._monsters); },
  bossNames()    { return Object.keys(this._bosses); },
  itemNames()    { return Object.keys(this._items); }
};