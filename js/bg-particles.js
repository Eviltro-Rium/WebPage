(function () {
  // 不在游戏中执行（游戏有自己的粒子效果）
  if (document.getElementById('game-container')) return;

  // 如果已经初始化过则跳过
  if (document.getElementById('bg-particles')) return;

  var canvas = document.createElement('canvas');
  canvas.id = 'bg-particles';
  document.body.prepend(canvas);

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var particles = [];
  var COUNT = 20;

  // 配色：从背景渐变中取色，半透明
  var COLORS = [
    { r: 56, g: 189, b: 248 },   // sky-400
    { r: 34, g: 211, b: 238 },   // cyan-400
    { r: 45, g: 212, b: 191 },   // teal-400
    { r: 74, g: 222, b: 128 },   // green-400
  ];

  var w, h;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function initParticles() {
    for (var i = 0; i < COUNT; i++) {
      var c = COLORS[i % COLORS.length];
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: 2 + Math.random() * 4,
        speedX: (Math.random() - 0.5) * 0.35,
        speedY: (Math.random() - 0.5) * 0.35,
        phase: Math.random() * 360,
        color: c,
        alphaBase: 0.06 + Math.random() * 0.10,
        wobbleSpeed: 0.3 + Math.random() * 0.5,
        wobbleAmp: 6 + Math.random() * 12,
      });
    }
  }

  resize();
  initParticles();

  window.addEventListener('resize', resize);

  function animate() {
    ctx.clearRect(0, 0, w, h);
    var now = Date.now() / 1000;

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];

      // 缓慢漂移
      p.x += p.speedX;
      p.y += p.speedY;

      // 柔和波浪
      var wobble = Math.sin(now * p.wobbleSpeed + p.phase) * p.wobbleAmp;
      var drawY = ((p.y + wobble) % (h + 40)) - 20;
      var drawX = ((p.x) % (w + 40)) - 20;

      // 呼吸透明度
      var alpha = p.alphaBase + 0.04 * Math.sin(now * 0.8 + p.phase);

      ctx.beginPath();
      ctx.arc(drawX, drawY, p.size, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + p.color.r + ',' + p.color.g + ',' + p.color.b + ',' + alpha + ')';
      ctx.fill();

      // 微光晕
      ctx.beginPath();
      ctx.arc(drawX, drawY, p.size * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + p.color.r + ',' + p.color.g + ',' + p.color.b + ',' + (alpha * 0.35) + ')';
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  animate();
})();
