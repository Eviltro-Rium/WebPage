/**
 * Boss 类 —— 空框架，待后续填充。
 *
 * 设计说明：
 *  - Boss 是怪物的强化形态，通常有多阶段（phase）与专属技能。
 *  - 进入 Boss 房后，主角需战胜 Boss 才能通关本层。
 *  - 此处仅搭出阶段骨架与技能钩子，具体逻辑以后填充。
 */
(function () {
  class Boss extends Monster {
    constructor(name, opts = {}) {
      super(name, opts);
      this.kind = opts.kind || 'Boss';

      this.phases = opts.phases || 1;
      this.phase = 1;

      this.phaseThresholds = opts.phaseThresholds || [];
      this.specialSkills = opts.specialSkills || [];

      this._def = opts;
    }

    isBoss() { return true; }

    currentPhase() { return this.phase; }

    isFinalPhase() { return this.phase >= this.phases; }

    checkPhaseTransition(eng) {
    }

    chooseAction(eng, ctx) {
      return null;
    }

    special(eng, skill, target, helpers) {
      return { d: 0, desc: '' };
    }

    onPhaseChange(newPhase, eng) {
    }

    static fromRegistry(name, override = {}) {
      const mod = window.AdventureRegistry.getBoss(name);
      if (!mod) return null;
      return new Boss(mod.name, Object.assign({}, mod, override));
    }
  }

  window.Boss = Boss;
})();