/* Shared dice primitives for battle effects. */
(function (global) {
  const root = global.FurryGame || (global.FurryGame = {});
  const fallbackRandom = () => root.CombatRuntime ? root.CombatRuntime.random() : Math.random();
  class D12 {
    constructor(random = fallbackRandom) {
      this.sides = 12;
      this.random = typeof random === 'function' ? random : fallbackRandom;
    }

    roll() {
      return Math.min(this.sides, 1 + Math.floor(this.random() * this.sides));
    }
  }

  global.D12 = D12;
})(window);
