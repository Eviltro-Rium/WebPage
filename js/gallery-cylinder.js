/**
 * 相册：上下两层圆柱，照片切竖条贴合柱面形成曲面；
 * 等高缩放，层内边缘等距，第二层反向旋转。
 */
(function () {
  var viewport = document.querySelector(".gallery-cylinder-viewport");
  var layersEl = document.querySelector(".gallery-cylinder-layers");
  if (!viewport || !layersEl) return;

  var sources = [];
  var seeds = document.querySelectorAll(".gallery-cylinder-seed img");
  var i;
  for (i = 0; i < seeds.length; i++) {
    sources.push(seeds[i].getAttribute("src"));
  }
  if (!sources.length) return;

  var natural = {};
  var pending = sources.length;

  function metrics(vw) {
    if (vw < 560) {
      return {
        radius: 250,
        targetH: 190,
        rowGap: 24,
        glassPad: 8,
        minEdgeGap: 6,
        strips: 6
      };
    }
    if (vw < 900) {
      return {
        radius: 370,
        targetH: 255,
        rowGap: 30,
        glassPad: 10,
        minEdgeGap: 8,
        strips: 7
      };
    }
    return {
      radius: 490,
      targetH: 310,
      rowGap: 36,
      glassPad: 12,
      minEdgeGap: 10,
      strips: 8
    };
  }

  function photoAt(src, targetH) {
    var dim = natural[src] || { w: 3, h: 4 };
    return { src: src, w: Math.round(targetH * dim.w / dim.h), h: targetH };
  }

  function layerFits(layerPhotos, circumference, glassPad, minEdgeGap) {
    if (!layerPhotos.length) return false;
    var totalGlassW = 0;
    var i;
    for (i = 0; i < layerPhotos.length; i++) {
      totalGlassW += layerPhotos[i].w + glassPad * 2;
    }
    return totalGlassW + layerPhotos.length * minEdgeGap <= circumference;
  }

  function packTwoLayers(photos, circumference, glassPad, minEdgeGap) {
    var n = photos.length;
    if (n <= 1) return [photos];

    var seen = {};
    var candidates = [];
    var base = Math.floor(n / 2);
    var delta;

    function addCandidate(count) {
      if (count < 1 || count > n - 1) return;
      if (seen[count]) return;
      seen[count] = true;
      candidates.push(count);
    }

    addCandidate(base);
    addCandidate(base + 1);
    for (delta = 1; delta <= 3; delta++) {
      addCandidate(base - delta);
      addCandidate(base + 1 + delta);
    }

    var best = null;
    var bestImbalance = Infinity;
    var c, c1, c2, layer1, layer2, imbalance;

    for (c = 0; c < candidates.length; c++) {
      c1 = candidates[c];
      c2 = n - c1;
      layer1 = photos.slice(0, c1);
      layer2 = photos.slice(c1);
      if (!layerFits(layer1, circumference, glassPad, minEdgeGap)) continue;
      if (!layerFits(layer2, circumference, glassPad, minEdgeGap)) continue;
      imbalance = Math.abs(c1 - c2);
      if (imbalance < bestImbalance) {
        bestImbalance = imbalance;
        best = [layer1, layer2];
      }
    }

    if (best) return best;

    c1 = Math.ceil(n / 2);
    return [photos.slice(0, c1), photos.slice(c1)];
  }

  function shuffleLayer(layer, layerIdx) {
    var n = layer.length;
    var out = [];
    var j;
    for (j = 0; j < n; j++) {
      out.push(layer[(j + layerIdx * 3) % n]);
    }
    if (layerIdx % 2 === 1) out.reverse();
    return out;
  }

  // 把宽度 w 切成 n 条，按柱面切线铺开。相邻片带轻微重叠，且重叠区映射到同一组源图像像素，
  // 既不会漏出背景缝，也不会出现重影。
  function buildStrips(opts) {
    var n = opts.strips;
    var arcW = opts.w / n;                 // 每条对应的弧长
    var angleStepRad = arcW / opts.radius; // 每条对应的圆心角(弧度)
    var angleStepDeg = angleStepRad * (180 / Math.PI);
    var chordW = 2 * opts.radius * Math.sin(angleStepRad / 2); // 切线片宽
    var overlap = opts.overlap || 1.5;     // 屏幕重叠像素
    var displayW = chordW + overlap;       // 实际渲染宽度
    var bgW = chordW * n + overlap;         // 背景图总宽，使重叠区共享同一像素
    var html = "";
    var s;

    for (s = 0; s < n; s++) {
      var subAngle = (s - (n - 1) / 2) * angleStepDeg;
      var edgeClass = "";
      if (s === 0) edgeClass = " is-first";
      else if (s === n - 1) edgeClass = " is-last";

      html +=
        '<span class="' +
        opts.className +
        edgeClass +
        '" style="width:' +
        displayW.toFixed(2) +
        "px;height:" +
        opts.h +
        "px;margin-left:" +
        (-displayW / 2).toFixed(2) +
        "px;margin-top:" +
        (-opts.h / 2) +
        "px;" +
        opts.styleExtra +
        "background-size:" +
        bgW.toFixed(2) +
        "px " +
        opts.h +
        "px;background-position:" +
        (-(s * chordW - overlap / 2)).toFixed(2) +
        "px 0;transform:rotateY(" +
        subAngle.toFixed(4) +
        "deg) translateZ(" +
        opts.radius +
        "px) translateY(" +
        opts.y +
        'px)"></span>';
    }

    return html;
  }

  function buildLayer(photos, radius, circumference, y, glassPad, minEdgeGap, strips, layerIdx) {
    var n = photos.length;
    var j;
    var glassWidths = [];
    var totalGlassW = 0;

    for (j = 0; j < n; j++) {
      var gw = photos[j].w + glassPad * 2;
      glassWidths.push(gw);
      totalGlassW += gw;
    }

    var edgeGap = (circumference - totalGlassW) / n;
    if (edgeGap < minEdgeGap) edgeGap = minEdgeGap;

    var html = "";
    var cursor = 0;
    var reverse = layerIdx === 1;

    html +=
      '<div class="gallery-cylinder-ring' +
      (reverse ? " gallery-cylinder-ring--reverse" : "") +
      '">';

    for (j = 0; j < n; j++) {
      var p = photos[j];
      var gW = glassWidths[j];
      var gH = p.h + glassPad * 2;
      var centerLinear = cursor + gW / 2;
      var angle = centerLinear * (360 / circumference);
      var glassRadius = radius - 2;

      html +=
        '<figure class="gallery-panel" role="listitem" style="transform:rotateY(' +
        angle.toFixed(3) +
        'deg)">';

      html += buildStrips({
        className: "gallery-glass",
        strips: strips,
        w: gW,
        h: gH,
        radius: glassRadius,
        y: y,
        overlap: 0.75,
        styleExtra: ""
      });

      html += buildStrips({
        className: "gallery-photo",
        strips: strips,
        w: p.w,
        h: p.h,
        radius: radius,
        y: y,
        overlap: 1.5,
        styleExtra: "background-image:url('" + p.src + "');"
      });

      html += "</figure>";
      cursor += gW + edgeGap;
    }

    html += "</div>";
    return html;
  }

  function layout() {
    var vw = viewport.clientWidth;
    var m = metrics(vw);
    var radius = m.radius;
    var circumference = 2 * Math.PI * radius;
    var targetH = m.targetH;
    var minEdgeGap = m.minEdgeGap;
    var photos;
    var packed;
    var html = "";
    var r;

    while (targetH >= 110) {
      photos = sources.map(function (src) {
        return photoAt(src, targetH);
      });
      packed = packTwoLayers(photos, circumference, m.glassPad, minEdgeGap);
      if (
        packed.length === 2 &&
        layerFits(packed[0], circumference, m.glassPad, minEdgeGap) &&
        layerFits(packed[1], circumference, m.glassPad, minEdgeGap)
      ) {
        break;
      }
      targetH -= 10;
    }

    for (r = 0; r < packed.length; r++) {
      var shuffled = shuffleLayer(packed[r], r);
      var y = (r - 0.5) * (targetH + m.rowGap);
      html += buildLayer(
        shuffled,
        radius,
        circumference,
        y,
        m.glassPad,
        minEdgeGap,
        m.strips,
        r
      );
    }

    var totalH = packed.length * targetH + (packed.length - 1) * m.rowGap;
    var viewportPad = Math.ceil(radius * 0.34 + totalH * 0.14 + 72);
    layersEl.innerHTML = html;
    viewport.style.setProperty("--cylinder-height", totalH + "px");
    viewport.style.setProperty("--viewport-pad", viewportPad + "px");
  }

  function done() {
    pending -= 1;
    if (pending > 0) return;
    layout();
    window.addEventListener("resize", layout);
  }

  for (i = 0; i < sources.length; i++) {
    (function (src) {
      var probe = new Image();
      probe.onload = function () {
        natural[src] = { w: probe.naturalWidth, h: probe.naturalHeight };
        done();
      };
      probe.onerror = done;
      probe.src = src;
    })(sources[i]);
  }
})();
