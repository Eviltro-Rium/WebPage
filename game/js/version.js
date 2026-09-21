/* Shared release identifier: update together with deployment cache keys. */
(function (global) {
    const version = '2026.09.21.2';
    global.FURRY_TRIAL_VERSION = version;
    function mount() {
        if (document.getElementById('game-version')) return;
        const badge = document.createElement('div');
        badge.id = 'game-version';
        badge.textContent = 'v' + version;
        badge.title = 'Furry Trial 游戏版本';
        badge.style.cssText = 'position:fixed;right:max(8px,env(safe-area-inset-right));bottom:max(5px,env(safe-area-inset-bottom));z-index:10000;padding:2px 5px;border-radius:4px;background:rgba(10,16,28,.65);color:rgba(255,255,255,.75);font:10px/1.4 system-ui,sans-serif;pointer-events:none;user-select:none;';
        document.body.appendChild(badge);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
})(window);