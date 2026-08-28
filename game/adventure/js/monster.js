/**
 * 怪物类 Monster —— 空框架，待后续填充。
 *
 * 设计说明：
 *  - 怪物作为普通房间与 Boss 房的敌方单位，与主角（CharacterRegistry 中的角色）对战。
 *  - 怪物行为由 AI 驱动，不需要玩家手动出牌，因此接口比角色更精简。
 *  - 此处仅搭出属性骨架与钩子方法，具体数值与技能逻辑以后填充。
 */
(function () {
  class Monster {
    constructor(name, opts = {}) {
      this.name = name;
      this.kind = opts.kind || '普通怪物';
      this.maxHp = opts.hp || 30;
      this.hp = this.maxHp;
      this.attack = opts.attack || 5;
      this.defense = opts.defense || 0;
      this.icon = opts.icon || null;

      this.buffs = {};
      this.extra = {};
      this.guard = 0;
      this.fly = 0;
      this.lush = Math.max(0, Number(opts.initialLush) || 0);

      // Keep the registry hooks available to the legacy adventure path too.
      for (const hook of [
        'attackDamage', 'attackUnblockable', 'attackHeal', 'attackLush', 'attackTurnStart',
        'defendBlock', 'defendHeal', 'defendPoison', 'defendBleed', 'defendGuard', 'defendLush'
      ]) {
        if (typeof opts[hook] === 'function') this[hook] = opts[hook];
      }

      this._def = opts;
    }

    isAlive() { return this.hp > 0; }
    isDead()  { return this.hp <= 0; }

    isDebuffed() {
      return Object.keys(this.buffs).some(k => this.buffs[k] > 0);
    }

    init(eng) {
      this.buffs = {};
      this.extra = {};
      this.guard = 0;
      this.fly = 0;
      this.lush = Math.max(0, Number(this._def.initialLush) || 0);
    }

    turnStart(eng, ctx) {
    }

    chooseAction(eng, ctx) {
      return null;
    }

    effect(eng, action, target, helpers) {
      return { d: 0, desc: '' };
    }

    defend(eng, incoming, helpers) {
      return { remaining: incoming, desc: '' };
    }

    onTurnEnd(eng, ctx) {
    }

    static fromRegistry(name, override = {}) {
      const mod = window.AdventureRegistry.getMonster(name);
      if (!mod) return null;
      return new Monster(mod.name, Object.assign({}, mod, override));
    }
  }

  window.Monster = Monster;
})();
