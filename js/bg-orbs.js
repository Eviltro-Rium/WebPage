(function () {
  // 游戏页面有自己的背景，不重复注入
  if (document.getElementById('game-container')) return;
  if (document.getElementById('bg-orbs')) return;

  var canvas = document.createElement('canvas');
  canvas.id = 'bg-orbs';
  document.body.prepend(canvas);

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  // ---------- 配色：取自网站背景渐变 ----------
  var PALETTE = [
    { r: 56,  g: 189, b: 248 },  // sky-400
    { r: 34,  g: 211, b: 238 },  // cyan-400
    { r: 45,  g: 212, b: 191 },  // teal-400
    { r: 74,  g: 222, b: 128 },  // green-400
    { r: 255, g: 255, b: 255 },  // white highlight
  ];

  var w, h;
  var ORB_COUNT = 10;

  function resize() {
    w = canvas.width  = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  // ---------- 光球对象 ----------
  function makeOrb() {
    var c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    return {
      x:  Math.random() * w,
      y:  Math.random() * h,
      r:  50 + Math.random() * 70,           // 半径 50-120px
      vx: (Math.random() - 0.5) * 0.25,       // 水平漂移速度
      vy: (Math.random() - 0.5) * 0.2,        // 垂直漂移速度
      phase:     Math.random() * Math.PI * 2,
      wobbleAmp: 15 + Math.random() * 30,      // 上下浮动幅度
      wobbleSpd: 0.3 + Math.random() * 0.4,
      baseAlpha: 0.06 + Math.random() * 0.07,  // 峰值透明度
      color: c,
    };
  }

  var orbs = [];
  resize();
  for (var i = 0; i < ORB_COUNT; i++) orbs.push(makeOrb());

  window.addEventListener('resize', resize);

  // ---------- 绘制一个发光球 ----------
  function drawOrb(orb) {
    var cx = orb.x;
    var cy = orb.y;
    var r  = orb.r;
    var c  = orb.color;

    // 3 层同心圆，从内到外递减透明度
    var layers = [
      { ratio: 0.25, alphaMul: 1 },
      { ratio: 0.55, alphaMul: 0.5 },
      { ratio: 0.85, alphaMul: 0.2 },
      { ratio: 1.0,  alphaMul: 0.05 },
    ];

    for (var i = 0; i < layers.length; i++) {
      var lr   = r * layers[i].ratio;
      var alpha = orb.baseAlpha * layers[i].alphaMul;
      var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, lr);
      grad.addColorStop(0, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')');
      grad.addColorStop(1, 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, lr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- 动画循环 ----------
  function tick(now) {
    var t = now * 0.001;  // 秒
    ctx.clearRect(0, 0, w, h);

    for (var i = 0; i < orbs.length; i++) {
      var o = orbs[i];

      // 漂移
      o.x += o.vx;
      o.y += Math.sin(t * o.wobbleSpd + o.phase) * o.wobbleAmp * 0.1;

      // 环绕屏幕（从左边出去就从右边进来）
      if (o.x < -o.r)      o.x = w + o.r;
      if (o.x > w + o.r)   o.x = -o.r;
      if (o.y < -o.r)      o.y = h + o.r;
      if (o.y > h + o.r)   o.y = -o.r;

      drawOrb(o);
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
