(function () {
  // 游戏页面不启用
  if (document.getElementById('game-container')) return;
  // 触屏设备不启用
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;

  var dot  = document.createElement('div');
  var ring = document.createElement('div');
  dot.className  = 'cursor-dot';
  ring.className = 'cursor-ring';
  document.body.appendChild(dot);
  document.body.appendChild(ring);

  document.body.style.cursor = 'none';

  // 给所有可点击元素加上 pointer 提示
  var style = document.createElement('style');
  style.textContent = 'a:hover ~ .cursor-ring, button:hover ~ .cursor-ring, .cursor-ring.cursor-hover { transform: translate(-50%, -50%) scale(1.6); border-color: rgba(255,255,255,0.85); }';
  document.head.appendChild(style);

  var mx = window.innerWidth / 2, my = window.innerHeight / 2;
  var rx = mx, ry = my;  // ring follows with lag

  // 交互元素悬停检测
  var hoverEls = 'a, button, input, textarea, select, .launch-pad-btn, .char-card, .char-detail-card, .download-item, .btn, summary';
  var isHovering = false;

  function updateHover() {
    var el = document.elementFromPoint(mx, my);
    if (!el) return;
    var hovering = el.closest(hoverEls);
    if (hovering !== isHovering) {
      isHovering = !!hovering;
      ring.classList.toggle('cursor-hover', isHovering);
      dot.classList.toggle('cursor-hidden', isHovering);
    }
  }

  function onMove(e) {
    mx = e.clientX;
    my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top  = my + 'px';
  }

  function onLeave() {
    dot.classList.add('cursor-hidden');
    ring.classList.add('cursor-hidden');
  }
  function onEnter() {
    dot.classList.remove('cursor-hidden');
    ring.classList.remove('cursor-hidden');
  }

  window.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('mouseleave', onLeave);
  document.addEventListener('mouseenter', onEnter);

  // 环以轻微延迟跟随（平滑感）
  function follow(now) {
    var dx = mx - rx;
    var dy = my - ry;
    rx += dx * 0.18;
    ry += dy * 0.18;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
    updateHover();
    requestAnimationFrame(follow);
  }
  requestAnimationFrame(follow);
})();
