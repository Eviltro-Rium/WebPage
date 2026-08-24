(function () {
  if (document.getElementById("game-container")) return;
  if ("ontouchstart" in window || navigator.maxTouchPoints > 0) return;

  var dot = document.createElement("div");
  var ring = document.createElement("div");
  dot.className = "cursor-dot";
  ring.className = "cursor-ring";
  document.body.appendChild(dot);
  document.body.appendChild(ring);
  document.documentElement.classList.add("custom-cursor-active");

  var mx = window.innerWidth * 0.5;
  var my = window.innerHeight * 0.5;
  var rx = mx;
  var ry = my;
  var hovering = false;

  var hoverSelector =
    "a, button, input, textarea, select, summary, label, " +
    ".btn, .logo, .nav a, .launch-pad-btn, .char-card, .char-detail-card, " +
    ".download-item, .download-link, [role='button'], [data-cursor-hover]";

  function setTransform(el, x, y, scale) {
    var s = scale || 1;
    el.style.transform =
      "translate3d(" + x + "px," + y + "px,0) translate(-50%,-50%) scale(" + s + ")";
  }

  function updateHover() {
    var el = document.elementFromPoint(mx, my);
    if (!el) return;
    var target = el.closest(hoverSelector);
    var next = !!target;
    if (next === hovering) return;
    hovering = next;
    ring.classList.toggle("cursor-hover", hovering);
    dot.classList.toggle("cursor-hover", hovering);
  }

  function onMove(e) {
    mx = e.clientX;
    my = e.clientY;
    setTransform(dot, mx, my, hovering ? 0.35 : 1);
  }

  function onLeave() {
    dot.classList.add("cursor-hidden");
    ring.classList.add("cursor-hidden");
  }

  function onEnter() {
    dot.classList.remove("cursor-hidden");
    ring.classList.remove("cursor-hidden");
  }

  window.addEventListener("mousemove", onMove, { passive: true });
  document.addEventListener("mouseleave", onLeave);
  document.addEventListener("mouseenter", onEnter);

  function follow() {
    var dx = mx - rx;
    var dy = my - ry;
    rx += dx * 0.16;
    ry += dy * 0.16;
    setTransform(ring, rx, ry, hovering ? 1.65 : 1);
    updateHover();
    requestAnimationFrame(follow);
  }

  setTransform(dot, mx, my, 1);
  setTransform(ring, rx, ry, 1);
  requestAnimationFrame(follow);
})();
