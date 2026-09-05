/* Shared dice primitives for battle effects. */
(function (global) {
  class D12 {
    constructor(random = Math.random) {
      this.sides = 12;
      this.random = typeof random === 'function' ? random : Math.random;
    }

    roll() {
      return Math.min(this.sides, 1 + Math.floor(this.random() * this.sides));
    }
  }

  global.D12 = D12;
})(window);
