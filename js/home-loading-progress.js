/* One progress value for the homepage loading bar and camera. */
(function (root) {
  function clamp(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
  function create() {
    var progress = 0;
    return {
      step: function (target, elapsedMs) {
        target = Math.max(progress, clamp(target));
        // Limit resume jumps; normal frame rates retain the same easing speed.
        var dt = Math.max(0, Math.min(100, Number(elapsedMs) || 0));
        progress += (target - progress) * (1 - Math.exp(-dt / 180));
        if (target - progress < 0.001) progress = target;
        return progress;
      },
      value: function () { return progress; }
    };
  }
  var api = Object.freeze({ create: create });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RiumHomeLoadingProgress = api;
})(typeof window === 'object' ? window : this);
