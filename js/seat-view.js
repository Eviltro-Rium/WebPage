/* 常驻背景中的长椅视角；正文只发送意图，镜头由宿主控制。 */
(function () {
  function init() {
    var frame = document.getElementById('site-content');
    if (!frame) {
      var button = document.querySelector('[data-take-seat]');
      if (button) button.addEventListener('click', function () {
        if (window.parent !== window) window.parent.postMessage({ type: 'rium-take-seat' }, '*');
      });
      window.addEventListener('message', function (event) {
        if (event.source === window.parent && event.data && event.data.type === 'rium-seat-return' && button) button.focus();
      });
      return;
    }
    var back = document.getElementById('seat-return');
    function setSeated(active) {
      document.documentElement.classList.toggle('is-seated', active);
      frame.inert = active;
      frame.setAttribute('aria-hidden', String(active));
      back.hidden = !active;
      document.dispatchEvent(new CustomEvent('rium-seat-change', { detail: { active: active } }));
      if (active) back.focus();
      else frame.contentWindow.postMessage({ type: 'rium-seat-return' }, '*');
    }
    window.addEventListener('message', function (event) {
      if (event.source === frame.contentWindow && event.data && event.data.type === 'rium-take-seat' && document.getElementById('hill-bg-canvas')) setSeated(true);
    });
    back.addEventListener('click', function () { setSeated(false); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') setSeated(false); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
