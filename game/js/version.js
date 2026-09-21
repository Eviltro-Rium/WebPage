/* Shared release identifier: update together with deployment cache keys. */
(function (global) {
    const version = '2.27';
    const IS_TEST = true; // 正式上线时改为 false
    global.FURRY_TRIAL_VERSION = version;
    function mount() {
        if (document.getElementById('game-version')) return;
        const badge = document.createElement('div');
        badge.id = 'game-version';
        const label = IS_TEST ? 'v' + version + ' · 测试中' : 'v' + version;
        badge.textContent = label;
        badge.title = IS_TEST ? '测试模式 · Furry Trial ' + version : 'Furry Trial 游戏版本 ' + version;
        const isTest = IS_TEST;
        badge.style.cssText = [
            'position:fixed',
            'right:max(8px,env(safe-area-inset-right))',
            'bottom:max(5px,env(safe-area-inset-bottom))',
            'z-index:10000',
            'padding:' + (isTest ? '5px 12px' : '2px 5px'),
            'border-radius:' + (isTest ? '999px' : '4px'),
            'background:' + (isTest ? 'rgba(251,191,36,0.12)' : 'rgba(10,16,28,.65)'),
            'color:' + (isTest ? '#fde68a' : 'rgba(255,255,255,.75)'),
            'border:' + (isTest ? '1px solid rgba(251,191,36,0.28)' : 'none'),
            'font:' + (isTest ? 'bold 0.7rem/1 system-ui,sans-serif' : '10px/1.4 system-ui,sans-serif'),
            'letter-spacing:0.04em',
            'box-shadow:' + (isTest ? '0 2px 8px rgba(0,0,0,0.15)' : 'none'),
            'backdrop-filter:blur(12px)',
            '-webkit-backdrop-filter:blur(12px)',
            'pointer-events:none',
            'user-select:none'
        ].join(';');
        document.body.appendChild(badge);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
})(window);