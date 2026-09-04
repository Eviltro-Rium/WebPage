(function () {
  // The game owns its own particle canvas.
  if (document.getElementById("game-container")) return;
  if (document.getElementById("bg-orbs")) return;
  if (document.body.classList.contains("page-home")) return;

  var canvas = document.createElement("canvas");
  canvas.id = "bg-orbs";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  var isHomepage = document.body.classList.contains("page-home");

  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Keep a matching palette for both site themes.
  var lightPalette = [
    { r: 56, g: 189, b: 248 },
    { r: 34, g: 211, b: 238 },
    { r: 45, g: 212, b: 191 },
    { r: 74, g: 222, b: 128 },
  ];
  var darkPalette = [
    { r: 68, g: 132, b: 188 },
    { r: 55, g: 123, b: 164 },
    { r: 60, g: 151, b: 139 },
    { r: 75, g: 155, b: 119 },
  ];
  var themeMix = document.documentElement.getAttribute("data-theme") === "dark" ? 1 : 0;

  var particlePalette = [
    { r: 255, g: 255, b: 255, minAlpha: 0.34, maxAlpha: 0.58 },
  ];
  var darkParticleColor = { r: 194, g: 225, b: 247 };

  var width = 0;
  var height = 0;
  var orbs = [];
  var particles = [];
  var frameId = 0;
  var previousTime = 0;
  var lastDrawTime = 0;
  var frameInterval = 33;
  var resizeFrame = 0;
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function blendColor(light, dark, amount) {
    return {
      r: Math.round(light.r + (dark.r - light.r) * amount),
      g: Math.round(light.g + (dark.g - light.g) * amount),
      b: Math.round(light.b + (dark.b - light.b) * amount),
    };
  }

  function makeOrb() {
    return {
      x: random(0, width),
      y: random(0, height),
      radius: isHomepage ? random(90, 210) : random(70, 150),
      vx: random(-7, 7),
      vy: random(-4, 4),
      phase: random(0, Math.PI * 2),
      wobble: random(12, 34),
      alpha: isHomepage ? random(0.055, 0.11) : random(0.04, 0.075),
      colorIndex: Math.floor(Math.random() * lightPalette.length),
    };
  }

  function makeParticle() {
    var color = particlePalette[Math.floor(Math.random() * particlePalette.length)];

    return {
      x: random(0, width),
      y: random(0, height),
      size: random(1.5, 4.2),
      speed: random(11, 30),
      phase: random(0, Math.PI * 2),
      sway: random(5, 17),
      alpha: random(color.minAlpha, color.maxAlpha),
      color: color,
    };
  }

  function rebuildScene() {
    var orbCount = isHomepage ? (width < 640 ? 7 : 11) : (width < 640 ? 6 : 8);
    var particleCount = isHomepage
      ? (width < 640 ? 22 : Math.min(38, Math.round(width / 42)))
      : 0;

    orbs = [];
    particles = [];

    for (var i = 0; i < orbCount; i += 1) orbs.push(makeOrb());
    for (var j = 0; j < particleCount; j += 1) particles.push(makeParticle());
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    // Decorative background motion is capped around 30fps to leave more
    // frame time for scrolling and interactive controls.
    frameInterval = width < 640 ? 50 : 33;

    // The canvas is a soft decorative layer; avoid allocating a full 2x
    // Retina buffer for it on every content page.
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    rebuildScene();
    if (motionQuery.matches) draw(0, 0);
  }

  function wrap(item, padding) {
    if (item.x < -padding) item.x = width + padding;
    if (item.x > width + padding) item.x = -padding;
    if (item.y < -padding) item.y = height + padding;
    if (item.y > height + padding) item.y = -padding;
  }

  function drawOrb(orb, time, delta) {
    orb.x += orb.vx * delta;
    orb.y += orb.vy * delta;
    wrap(orb, orb.radius);

    var pulse = 1 + Math.sin(time * 0.00035 + orb.phase) * 0.08;
    var x = orb.x + Math.sin(time * 0.00022 + orb.phase) * orb.wobble;
    var y = orb.y + Math.cos(time * 0.00018 + orb.phase) * orb.wobble;
    var radius = orb.radius * pulse;
    var color = blendColor(
      lightPalette[orb.colorIndex],
      darkPalette[orb.colorIndex],
      themeMix
    );
    var gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);

    gradient.addColorStop(
      0,
      "rgba(" + color.r + "," + color.g + "," + color.b + "," + orb.alpha + ")"
    );
    gradient.addColorStop(
      0.42,
      "rgba(" + color.r + "," + color.g + "," + color.b + "," + orb.alpha * 0.42 + ")"
    );
    gradient.addColorStop(1, "rgba(" + color.r + "," + color.g + "," + color.b + ",0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticle(particle, time, delta) {
    particle.x += particle.speed * delta;
    if (particle.x > width + 20) particle.x = -20;

    var y = particle.y + Math.sin(time * 0.00065 + particle.phase) * particle.sway;
    var shimmer = 0.72 + Math.sin(time * 0.001 + particle.phase) * 0.28;
    var alpha = particle.alpha * shimmer;
    var color = blendColor(
      particle.color,
      darkParticleColor,
      themeMix
    );

    ctx.shadowBlur = particle.size * 2.8;
    ctx.shadowColor =
      "rgba(" + color.r + "," + color.g + "," + color.b + "," + alpha * 0.55 + ")";
    ctx.fillStyle =
      "rgba(" + color.r + "," + color.g + "," + color.b + "," + alpha + ")";
    ctx.beginPath();
    ctx.arc(particle.x, y, particle.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function draw(time, delta) {
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = isHomepage ? "source-over" : "screen";

    for (var i = 0; i < orbs.length; i += 1) drawOrb(orbs[i], time, delta);

    ctx.globalCompositeOperation = "source-over";
    for (var j = 0; j < particles.length; j += 1) drawParticle(particles[j], time, delta);
  }

  function onThemeTransition(event) {
    var detail = event.detail || {};
    var progress = Math.max(0, Math.min(1, Number(detail.progress) || 0));
    themeMix = detail.to === "dark" ? progress : 1 - progress;
  }

  function onThemeChange(event) {
    themeMix = event.detail && event.detail.theme === "dark" ? 1 : 0;
  }

  function animate(time) {
    if (lastDrawTime && time - lastDrawTime < frameInterval) {
      frameId = window.requestAnimationFrame(animate);
      return;
    }
    var delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
    lastDrawTime = time;
    previousTime = time;
    draw(time, delta);
    frameId = window.requestAnimationFrame(animate);
  }

  function start() {
    window.cancelAnimationFrame(frameId);
    frameId = 0;
    previousTime = 0;
    lastDrawTime = 0;

    if (motionQuery.matches || document.hidden) {
      draw(performance.now(), 0);
      return;
    }

    frameId = window.requestAnimationFrame(animate);
  }

  function scheduleResize() {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(function () {
      resizeFrame = 0;
      resize();
    });
  }

  window.addEventListener("resize", scheduleResize, { passive: true });
  document.addEventListener("visibilitychange", start);
  document.addEventListener("rium-theme-transition", onThemeTransition);
  document.addEventListener("rium-theme-change", onThemeChange);

  if (typeof motionQuery.addEventListener === "function") {
    motionQuery.addEventListener("change", start);
  } else if (typeof motionQuery.addListener === "function") {
    motionQuery.addListener(start);
  }

  resize();
  start();
})();
