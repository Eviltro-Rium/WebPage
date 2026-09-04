/**
 * 主页 3D 背景：日夜主题下的青翠小山丘。
 * 白天使用晴空与软云，夜间切换为月光、星点和低照度的山坡。
 */
(function () {
  if (typeof THREE === "undefined") return;
  var scenePages = [
    "page-home",
    "page-projects",
    "page-materials",
    "page-guestbook",
    "page-launchpad"
  ];
  var isScenePage = scenePages.some(function (pageClass) {
    return document.body.classList.contains(pageClass);
  });
  if (!isScenePage) return;

  var LIGHT_PALETTE = {
    sky: 0x58a8ee,
    zenith: 0x2880d8,
    horizon: 0x9ed0f5,
    fog: 0xb0daf5,
    fogNear: 38,
    fogFar: 92,
    soil: 0xc4a878,
    fieldLow: 0x548c2c,
    fieldHigh: 0xf0d060,
    lawn: 0x62a832,
    grassStem: 0x4e7a24,
    grassBlade: 0x68b034,
    grassTip: 0x9ed24e,
    flower: 0xfbfaf6,
    flowerHead: 0xf2c84a,
    particle: 0xffe9a0,
    sun: 0xfff1cc,
    cloud: 0xf7f3ec,
    cloudOpacity: 0.88,
    ambient: 0.58,
    sunIntensity: 1.48,
    fill: 0x7eb8f0,
    fillIntensity: 0.28,
    rim: 0xffd080,
    rimIntensity: 0.46,
    haze: 0xf0b45a,
    hemi: 0.52,
    exposure: 1.12,
    skyGlow: 1.0,
    moonGlow: 0
  };

  var DARK_PALETTE = {
    sky: 0x07111f,
    zenith: 0x050914,
    horizon: 0x1a3150,
    fog: 0x101b2b,
    fogNear: 34,
    fogFar: 88,
    soil: 0x382f28,
    fieldLow: 0x1f4a33,
    fieldHigh: 0x6a7044,
    lawn: 0x315b3b,
    grassStem: 0x21432d,
    grassBlade: 0x34734b,
    grassTip: 0x75a65c,
    flower: 0xcbd6e8,
    flowerHead: 0xd9b767,
    particle: 0xaac5e5,
    sun: 0xdbe7ff,
    cloud: 0x8493ad,
    cloudOpacity: 0,
    ambient: 0.25,
    sunIntensity: 0.34,
    fill: 0x405d88,
    fillIntensity: 0.24,
    rim: 0x91b6e8,
    rimIntensity: 0.42,
    haze: 0x516c92,
    hemi: 0.3,
    exposure: 0.88,
    skyGlow: 0,
    moonGlow: 1
  };

  var PALETTE = LIGHT_PALETTE;

  var HOME_POS = { x: 0, y: 7.2, z: 16.5 };
  var HOME_LOOK = { x: 0, y: 2.6, z: -6 };
  var CELESTIAL_PEAK = { x: 18, y: 20, z: -58 };
  var MOON_PEAK = CELESTIAL_PEAK;
  var CELESTIAL_DROP = 46;

  var SKY_VERT = [
    "varying vec3 vDir;",
    "void main() {",
    "  vDir = normalize(position);",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
    "}"
  ].join("\n");

  var SKY_FRAG = [
    "uniform vec3 uZenith;",
    "uniform vec3 uHorizon;",
    "uniform vec3 uHaze;",
    "uniform vec3 uSunDir;",
    "uniform vec3 uMoonDir;",
    "uniform float uSunGlow;",
    "uniform float uMoonGlow;",
    "varying vec3 vDir;",
    "void main() {",
    "  vec3 dir = normalize(vDir);",
    "  float h = clamp(dir.y * 0.52 + 0.32, 0.0, 1.0);",
    "  vec3 col = mix(uHorizon, uZenith, smoothstep(0.02, 0.78, h));",
    "  float rayleigh = pow(1.0 - max(dir.y, 0.0), 2.6);",
    "  col = mix(col, uHaze * vec3(1.08, 0.9, 0.68), rayleigh * mix(0.06, 0.22, uSunGlow));",
    "  float band = exp(-pow((h - 0.06) / 0.12, 2.0));",
    "  col = mix(col, uHaze, band * mix(0.12, 0.38, uSunGlow));",
    "  col += uHaze * exp(-pow(dir.y * 4.4, 2.0)) * mix(0.04, 0.14, uSunGlow);",
    "  float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);",
    "  float sunWash = pow(sunDot, 4.8) * uSunGlow;",
    "  col = mix(col, vec3(1.0, 0.76, 0.4), sunWash * 0.16);",
    "  float sunBloom = pow(sunDot, 14.0) * uSunGlow;",
    "  col += vec3(1.0, 0.62, 0.2) * sunBloom * 0.2;",
    "  float sunDisk = smoothstep(0.993, 0.9997, sunDot) * uSunGlow;",
    "  col = mix(col, vec3(1.0, 0.8, 0.42), sunDisk);",
    "  col += vec3(1.0, 0.68, 0.26) * pow(sunDot, 6.0) * uSunGlow * 0.2;",
    "  col += vec3(1.0, 0.78, 0.42) * pow(sunDot, 20.0) * uSunGlow * 0.14;",
    "  col += vec3(1.0, 0.88, 0.58) * pow(sunDot, 90.0) * uSunGlow * 0.16;",
    "  col += vec3(1.0, 0.92, 0.7) * pow(sunDot, 240.0) * uSunGlow * 0.12;",
    "  float ang = atan(dir.x, dir.z);",
    "  float shafts = pow(sunDot, 9.0) * (0.5 + 0.5 * sin(ang * 14.0 + dir.y * 6.0));",
    "  col += vec3(1.0, 0.76, 0.38) * shafts * uSunGlow * 0.1;",
    "  float aniso = pow(sunDot, 24.0) * abs(dir.x) * (1.0 - abs(dir.y));",
    "  col += vec3(1.0, 0.84, 0.5) * aniso * uSunGlow * 0.12;",
    "  float moonDot = max(dot(dir, normalize(uMoonDir)), 0.0);",
    "  float moonDisk = smoothstep(0.993, 0.9997, moonDot) * uMoonGlow;",
    "  col += vec3(0.94, 0.96, 1.0) * moonDisk;",
    "  col += vec3(0.72, 0.82, 1.0) * pow(moonDot, 14.0) * uMoonGlow * 0.32;",
    "  col += vec3(0.82, 0.88, 1.0) * pow(moonDot, 48.0) * uMoonGlow * 0.24;",
    "  col += vec3(0.7, 0.78, 1.0) * pow(moonDot, 6.0) * uMoonGlow * 0.1;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  var CLOUD_VERT = [
    "varying vec2 vUv;",
    "varying float vFogDepth;",
    "void main() {",
    "  vUv = uv;",
    "  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);",
    "  vFogDepth = -mvPosition.z;",
    "  gl_Position = projectionMatrix * mvPosition;",
    "}"
  ].join("\n");

  var CLOUD_FRAG = [
    "uniform sampler2D uMap;",
    "uniform vec3 uZenith;",
    "uniform vec3 uHorizon;",
    "uniform vec3 uHaze;",
    "uniform vec3 uTint;",
    "uniform vec3 uSunDir;",
    "uniform float uOpacity;",
    "uniform float uSunGlow;",
    "uniform vec3 fogColor;",
    "uniform float fogNear;",
    "uniform float fogFar;",
    "varying vec2 vUv;",
    "varying float vFogDepth;",
    "void main() {",
    "  float a = texture2D(uMap, vUv).a;",
    "  if (a < 0.02) discard;",
    "  vec3 sky = mix(uHorizon, uZenith, smoothstep(0.18, 0.88, vUv.y));",
    "  vec3 col = mix(sky, uTint, 0.72);",
    "  col = mix(col, vec3(1.0, 0.99, 0.96), 0.38);",
    "  float belly = smoothstep(0.72, 0.22, vUv.y);",
    "  col = mix(col, mix(uTint, uHaze, 0.28), belly * 0.16 * uSunGlow);",
    "  col += vec3(1.0, 0.96, 0.88) * smoothstep(0.35, 0.95, vUv.y) * uSunGlow * 0.06;",
    "  float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);",
    "  col = mix(col, fogColor, fogFactor * 0.35);",
    "  a *= uOpacity * (1.0 - fogFactor * 0.28);",
    "  gl_FragColor = vec4(col * a, a);",
    "}"
  ].join("\n");

  var PLANT_VERT = [
    "attribute float aPart;",
    "uniform float uTime;",
    "uniform vec2 uWindDir;",
    "uniform float uBend;",
    "varying float vHeight;",
    "varying float vPart;",
    "varying float vShade;",
    "varying vec3 vWorldPos;",
    "varying vec3 vNormal;",
    "#include <common>",
    "#include <fog_pars_vertex>",
    "void main() {",
    "  vHeight = position.y;",
    "  vPart = aPart;",
    "  vec3 pos = position;",
    "  vec4 world = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);",
    "  vec2 wpos = world.xz;",
    "  vec2 windDir = normalize(uWindDir);",
    "  vec2 crossDir = vec2(-windDir.y, windDir.x);",
    "  float along = dot(wpos, windDir);",
    "  float cross = dot(wpos, crossDir);",
    "  float swell = sin(along * 0.13 - uTime * 0.78);",
    "  float ripple = sin(along * 0.26 - uTime * 1.22 + cross * 0.04) * 0.32;",
    "  float wind = swell * 0.78 + ripple * 0.22;",
    "  float bend = pow(clamp(pos.y, 0.0, 1.2), 1.45);",
    "  vec2 offset = windDir * wind * bend * uBend;",
    "  float flutter = sin(along * 0.18 - uTime * 1.6 + pos.y * 2.0) * bend * bend * 0.045;",
    "  offset += crossDir * flutter;",
    "  pos.x += offset.x;",
    "  pos.z += offset.y;",
    "  vShade = 0.82 + 0.18 * sin(along * 0.35);",
    "  vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);",
    "  vec4 worldPos = modelMatrix * instanceMatrix * vec4(pos, 1.0);",
    "  vWorldPos = worldPos.xyz;",
    "  vec4 mvPosition = viewMatrix * worldPos;",
    "  gl_Position = projectionMatrix * mvPosition;",
    "  #include <fog_vertex>",
    "}"
  ].join("\n");

  var GRASS_FRAG = [
    "uniform vec3 uColorA;",
    "uniform vec3 uColorB;",
    "uniform vec3 uColorHead;",
    "uniform vec3 uSunDir;",
    "uniform vec3 uRimColor;",
    "uniform float uDay;",
    "varying float vHeight;",
    "varying float vPart;",
    "varying float vShade;",
    "varying vec3 vWorldPos;",
    "varying vec3 vNormal;",
    "#include <common>",
    "#include <fog_pars_fragment>",
    "void main() {",
    "  vec3 N = normalize(vNormal);",
    "  vec3 V = normalize(cameraPosition - vWorldPos);",
    "  N = faceforward(N, -V, N);",
    "  vec3 L = normalize(uSunDir);",
    "  float wrap = clamp(dot(N, L) * 0.46 + 0.54, 0.0, 1.0);",
    "  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.2);",
    "  vec3 H = normalize(L + V);",
    "  float spec = pow(max(dot(N, H), 0.0), 28.0);",
    "  float back = pow(max(dot(-N, L), 0.0), 1.35);",
    "  float sss = pow(max(dot(V, -L), 0.0), 1.8);",
    "  float h = clamp(vHeight / 0.52, 0.0, 1.0);",
    "  vec3 stem = uColorB * 0.88;",
    "  vec3 leaf = mix(uColorB, uColorA, 0.55);",
    "  vec3 tip = mix(uColorA, uColorHead, 0.62);",
    "  vec3 col = mix(stem, leaf, smoothstep(0.08, 0.46, h));",
    "  col = mix(col, tip, smoothstep(0.48, 0.92, h));",
    "  float grain = fract(sin(dot(vWorldPos.xz, vec2(12.9898, 78.233))) * 43758.5453);",
    "  col *= 0.94 + grain * 0.1;",
    "  col *= vShade * mix(0.8, 1.18, wrap);",
    "  col += tip * sss * 0.14 * uDay;",
    "  col += uRimColor * rim * 0.18;",
    "  col += vec3(0.92, 1.0, 0.55) * spec * 0.08 * uDay;",
    "  col += vec3(0.55, 0.82, 0.28) * back * 0.08 * uDay;",
    "  col += vec3(0.08, 0.12, 0.04) * (1.0 - smoothstep(0.0, 0.35, h)) * 0.16;",
    "  gl_FragColor = vec4(col, 1.0);",
    "  #include <fog_fragment>",
    "}"
  ].join("\n");

  var FLOWER_FRAG = [
    "uniform vec3 uColorA;",
    "uniform vec3 uColorB;",
    "uniform vec3 uColorHead;",
    "uniform vec3 uSunDir;",
    "uniform vec3 uRimColor;",
    "uniform float uDay;",
    "varying float vHeight;",
    "varying float vPart;",
    "varying float vShade;",
    "varying vec3 vWorldPos;",
    "varying vec3 vNormal;",
    "#include <common>",
    "#include <fog_pars_fragment>",
    "void main() {",
    "  vec3 N = normalize(vNormal);",
    "  vec3 V = normalize(cameraPosition - vWorldPos);",
    "  N = faceforward(N, -V, N);",
    "  vec3 L = normalize(uSunDir);",
    "  float wrap = clamp(dot(N, L) * 0.46 + 0.54, 0.0, 1.0);",
    "  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);",
    "  vec3 H = normalize(L + V);",
    "  float spec = pow(max(dot(N, H), 0.0), 36.0);",
    "  vec3 stem = uColorB * 0.92;",
    "  vec3 petal = uColorA;",
    "  vec3 heart = uColorHead;",
    "  vec3 col = mix(stem, petal, smoothstep(0.4, 0.8, vPart));",
    "  col = mix(col, heart, smoothstep(1.4, 1.8, vPart));",
    "  float grain = fract(sin(dot(vWorldPos.xz, vec2(12.9898, 78.233))) * 43758.5453);",
    "  col *= 0.96 + grain * 0.07;",
    "  col *= vShade * mix(0.86, 1.16, wrap);",
    "  col += petal * rim * 0.3;",
    "  col += uRimColor * rim * 0.12;",
    "  col += vec3(1.0, 0.96, 0.72) * spec * 0.18 * uDay;",
    "  gl_FragColor = vec4(col, 1.0);",
    "  #include <fog_fragment>",
    "}"
  ].join("\n");

  function lerpHex(a, b, t) {
    var c1 = new THREE.Color(a);
    var c2 = new THREE.Color(b);
    return c1.lerp(c2, t).getHex();
  }

  function isSafariEngine() {
    var ua = navigator.userAgent || "";
    return /Safari/i.test(ua) && !/Chrome|Chromium|Android/i.test(ua);
  }

  function lockSrgbOutput(renderer) {
    if (renderer.outputEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    var gl = renderer.getContext();
    if (!gl) return;
    try {
      if ("drawingBufferColorSpace" in gl) gl.drawingBufferColorSpace = "srgb";
      if ("unpackColorSpace" in gl) gl.unpackColorSpace = "srgb";
    } catch (e) { /* older WebKit */ }
  }

  function terrainHeight(x, z) {
    var hills =
      Math.sin(x * 0.11) * 1.55 +
      Math.cos(z * 0.09) * 1.2 +
      Math.sin((x + z) * 0.065) * 0.7 +
      Math.cos(x * 0.04 - z * 0.05) * 0.35;
    var clods =
      Math.sin(x * 1.35 + z * 0.62) * 0.045 +
      Math.cos(x * 0.88 - z * 1.18) * 0.032 +
      Math.sin(x * 2.4 + z * 1.9) * 0.018;
    var furrows = Math.sin(x * 0.72 + z * 0.28) * 0.055;
    return hills + clods + furrows;
  }

  function setPart(geo, part) {
    var arr = new Float32Array(geo.attributes.position.count);
    var i;
    for (i = 0; i < arr.length; i++) arr[i] = part;
    geo.setAttribute("aPart", new THREE.BufferAttribute(arr, 1));
    return geo;
  }

  function mergeGeometries(geometries) {
    var positions = [];
    var parts = [];
    var indices = [];
    var offset = 0;
    var g, pos, partAttr, i;
    for (g = 0; g < geometries.length; g++) {
      pos = geometries[g].attributes.position;
      partAttr = geometries[g].attributes.aPart;
      for (i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        parts.push(partAttr ? partAttr.getX(i) : 0);
      }
      if (geometries[g].index) {
        for (i = 0; i < geometries[g].index.count; i++) {
          indices.push(geometries[g].index.getX(i) + offset);
        }
      } else {
        for (i = 0; i < pos.count; i++) indices.push(offset + i);
      }
      offset += pos.count;
      geometries[g].dispose();
    }
    var merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute("aPart", new THREE.Float32BufferAttribute(parts, 1));
    merged.setIndex(indices);
    merged.computeVertexNormals();
    return merged;
  }

  function bladeAt(w, h, x, y, z, rotX, rotY, rotZ, segs) {
    var geo = new THREE.PlaneGeometry(w, h, 1, segs || 4);
    geo.translate(0, h * 0.5, 0);
    var pos = geo.attributes.position;
    var i, py, t;
    for (i = 0; i < pos.count; i++) {
      py = pos.getY(i);
      t = THREE.MathUtils.clamp(py / Math.max(h, 0.001), 0, 1);
      pos.setX(i, pos.getX(i) * (1.0 - t * 0.88));
      pos.setZ(i, pos.getZ(i) + t * t * 0.018);
    }
    geo.rotateX(rotX);
    geo.rotateY(rotY);
    geo.rotateZ(rotZ);
    geo.translate(x, y, z);
    return geo;
  }

  function planeAt(w, h, x, y, z, rotX, rotY, rotZ) {
    var geo = new THREE.PlaneGeometry(w, h, 1, 1);
    geo.translate(0, h * 0.5, 0);
    geo.rotateX(rotX);
    geo.rotateY(rotY);
    geo.rotateZ(rotZ);
    geo.translate(x, y, z);
    return geo;
  }

  function createGrassClumpGeometry() {
    var parts = [];
    var count = 12;
    var i, k, yaw, lean, h, w, ox, oz, rad;
    for (i = 0; i < count; i++) {
      yaw = (i / count) * Math.PI * 2 + (i % 3) * 0.07;
      lean = ((i % 5) - 2) * 0.06;
      h = 0.42 + (i % 4) * 0.07;
      w = 0.078 + (i % 3) * 0.016;
      rad = 0.1 + (i % 6) * 0.038;
      ox = Math.sin(yaw) * rad;
      oz = Math.cos(yaw) * rad;
      for (k = 0; k < 2; k++) {
        parts.push(bladeAt(w, h, ox, 0, oz, -0.05, yaw + k * Math.PI * 0.5, lean, 4));
      }
      parts.push(bladeAt(w * 1.5, h * 0.24, ox + 0.03, h * 0.2, oz, -0.36, yaw, 0.48, 2));
    }
    return mergeGeometries(parts);
  }

  function createUndergrowthGeometry() {
    var parts = [];
    var count = 8;
    var i, k, yaw, ox, oz;
    for (i = 0; i < count; i++) {
      yaw = (i / count) * Math.PI * 2;
      ox = Math.sin(yaw) * (0.08 + (i % 3) * 0.03);
      oz = Math.cos(yaw) * (0.08 + (i % 3) * 0.03);
      for (k = 0; k < 2; k++) {
        parts.push(bladeAt(0.07, 0.28 + (i % 3) * 0.04, ox, 0, oz, -0.04, yaw + k * Math.PI * 0.5, (i - 3.5) * 0.05, 3));
      }
    }
    return mergeGeometries(parts);
  }

  function createCarpetGeometry() {
    var parts = [];
    var count = 8;
    var i, k, yaw, ox, oz;
    for (i = 0; i < count; i++) {
      yaw = (i / count) * Math.PI * 2 + 0.11;
      ox = Math.sin(yaw) * (0.07 + (i % 4) * 0.028);
      oz = Math.cos(yaw) * (0.07 + (i % 4) * 0.028);
      for (k = 0; k < 2; k++) {
        parts.push(bladeAt(0.08, 0.16 + (i % 3) * 0.035, ox, 0, oz, -0.03, yaw + k * Math.PI * 0.5, (i - 3.5) * 0.04, 2));
      }
    }
    return mergeGeometries(parts);
  }

  function createFlowerGeometry() {
    var parts = [];
    var p, a, px, pz, i;
    parts.push(setPart(bladeAt(0.013, 0.4, 0, 0, 0, 0, 0, 0.025, 3), 0));
    parts.push(setPart(bladeAt(0.013, 0.4, 0, 0, 0, 0, Math.PI * 0.5, -0.02, 3), 0));
    for (i = 0; i < 2; i++) {
      a = i === 0 ? 0.55 : -0.55;
      parts.push(setPart(bladeAt(0.08, 0.06, Math.sin(a) * 0.018, 0.145 + i * 0.078, Math.cos(a) * 0.01, -0.45, a, 0.55, 2), 0));
      parts.push(setPart(bladeAt(0.07, 0.052, Math.sin(-a) * 0.016, 0.222 + i * 0.066, 0, 0.4, -a, -0.48, 2), 0));
    }
    for (p = 0; p < 7; p++) {
      a = (p / 7) * Math.PI * 2;
      px = Math.cos(a) * 0.038;
      pz = Math.sin(a) * 0.038;
      parts.push(setPart(planeAt(0.078, 0.064, px, 0.4, pz, -0.72, a, 0.08), 1));
      parts.push(setPart(planeAt(0.078, 0.064, px, 0.4, pz, -0.72, a + Math.PI * 0.5, 0.08), 1));
    }
    for (p = 0; p < 5; p++) {
      a = (p / 5) * Math.PI * 2 + 0.31;
      px = Math.cos(a) * 0.02;
      pz = Math.sin(a) * 0.02;
      parts.push(setPart(planeAt(0.046, 0.034, px, 0.411, pz, -0.55, a, 0.05), 1));
    }
    for (p = 0; p < 4; p++) {
      a = (p / 4) * Math.PI * 2 + 0.2;
      parts.push(setPart(planeAt(0.031, 0.02, Math.cos(a) * 0.009, 0.424, Math.sin(a) * 0.009, -0.2, a, 0), 2));
    }
    parts.push(setPart(planeAt(0.025, 0.024, 0, 0.428, 0, -0.15, 0, 0), 2));
    parts.push(setPart(planeAt(0.025, 0.024, 0, 0.428, 0, -0.15, Math.PI * 0.5, 0), 2));
    return mergeGeometries(parts);
  }

  function canvasTex(w, h, paint) {
    var cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    paint(cv.getContext("2d"), w, h);
    var tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    return tex;
  }

  function makeSoilTexture() {
    var size = 512;
    var canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#6b5330";
    ctx.fillRect(0, 0, size, size);
    var i, x, y, r, g, dark;
    for (i = 0; i < 28; i++) {
      x = Math.random() * size;
      y = Math.random() * size;
      r = 28 + Math.random() * 72;
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
      dark = Math.random() > 0.45;
      g.addColorStop(0, dark ? "rgba(42, 32, 18, 0.38)" : "rgba(120, 98, 58, 0.28)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
        ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    var img = ctx.getImageData(0, 0, size, size);
    var px = img.data;
    for (i = 0; i < px.length; i += 4) {
      var n = (Math.random() - 0.5) * 38;
      px[i] = Math.max(0, Math.min(255, px[i] + n));
      px[i + 1] = Math.max(0, Math.min(255, px[i + 1] + n * 0.85));
      px[i + 2] = Math.max(0, Math.min(255, px[i + 2] + n * 0.55));
    }
    ctx.putImageData(img, 0, 0);
    for (i = 0; i < 420; i++) {
      x = Math.random() * size;
      y = Math.random() * size;
      r = 0.6 + Math.random() * 2.4;
      var shade = 70 + Math.floor(Math.random() * 90);
      ctx.fillStyle = "rgba(" + shade + "," + (shade - 12) + "," + (shade - 28) + "," + (0.22 + Math.random() * 0.35) + ")";
        ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.55 + Math.random() * 0.55), Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.strokeStyle = "rgba(40, 28, 14, 0.12)";
    ctx.lineWidth = 1.2;
    for (i = 0; i < 18; i++) {
      y = (i / 18) * size + Math.random() * 8;
        ctx.beginPath();
      ctx.moveTo(0, y);
      for (x = 0; x <= size; x += 32) {
        ctx.lineTo(x, y + Math.sin(x * 0.04 + i) * 3.5);
      }
      ctx.stroke();
    }
    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  }

  function drawCloudLobe(ctx, x, y, rx, ry, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, "rgba(255,255,255," + alpha + ")");
    g.addColorStop(0.55, "rgba(255,255,255," + (alpha * 0.96) + ")");
    g.addColorStop(0.82, "rgba(255,255,255," + (alpha * 0.42) + ")");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
        ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }

  function makeCloudTexture(variant) {
    var layouts = [
      [
        [0.5, 0.7, 0.4, 0.2, 0.95],
        [0.28, 0.54, 0.16, 0.18, 0.9],
        [0.42, 0.42, 0.18, 0.22, 0.95],
        [0.58, 0.4, 0.2, 0.24, 1],
        [0.73, 0.52, 0.15, 0.18, 0.88],
        [0.5, 0.56, 0.17, 0.16, 0.82]
      ],
      [
        [0.5, 0.72, 0.42, 0.18, 0.94],
        [0.24, 0.58, 0.14, 0.16, 0.86],
        [0.38, 0.44, 0.17, 0.2, 0.94],
        [0.54, 0.38, 0.19, 0.23, 1],
        [0.7, 0.46, 0.16, 0.19, 0.9],
        [0.82, 0.6, 0.12, 0.14, 0.8]
      ],
      [
        [0.5, 0.68, 0.36, 0.19, 0.92],
        [0.32, 0.5, 0.18, 0.2, 0.93],
        [0.5, 0.4, 0.2, 0.24, 1],
        [0.68, 0.5, 0.17, 0.19, 0.9],
        [0.44, 0.58, 0.14, 0.14, 0.8]
      ]
    ];
    var tex = canvasTex(512, 256, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var layout = layouts[variant % layouts.length];
      var i, lobe;
      for (i = 0; i < layout.length; i++) {
        lobe = layout[i];
        drawCloudLobe(ctx, lobe[0] * w, lobe[1] * h, lobe[2] * w, lobe[3] * h, lobe[4]);
      }
      ctx.globalCompositeOperation = "destination-in";
      var cut = ctx.createLinearGradient(0, h * 0.18, 0, h);
      cut.addColorStop(0, "rgba(0,0,0,0)");
      cut.addColorStop(0.16, "rgba(0,0,0,0.85)");
      cut.addColorStop(0.34, "rgba(0,0,0,1)");
      cut.addColorStop(0.8, "rgba(0,0,0,1)");
      cut.addColorStop(0.93, "rgba(0,0,0,0)");
      ctx.fillStyle = cut;
      ctx.fillRect(0, 0, w, h);
      var image = ctx.getImageData(0, 0, w, h);
      var px = image.data;
      for (i = 0; i < px.length; i += 4) {
        px[i] = 255;
        px[i + 1] = 255;
        px[i + 2] = 255;
      }
      ctx.putImageData(image, 0, 0);
    });
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.premultiplyAlpha = true;
    return tex;
  }

  function makePlantMaterial(frag, colorA, colorB, colorHead, extras) {
    var uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uWindDir: { value: new THREE.Vector2(0.92, 0.38).normalize() },
        uBend: { value: extras.bend },
        uColorA: { value: new THREE.Color(colorA) },
        uColorB: { value: new THREE.Color(colorB) },
        uColorHead: { value: new THREE.Color(colorHead) },
        uSunDir: { value: new THREE.Vector3(0.55, 0.62, -0.55) },
        uRimColor: { value: new THREE.Color(PALETTE.rim) },
        uDay: { value: 1 }
      }
    ]);
    return new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: PLANT_VERT,
      fragmentShader: frag,
      side: THREE.DoubleSide,
      fog: true
    });
  }

  function scatterGrid(mesh, cols, rows, width, depth, stagger, scaleBase, scaleJitter, heightScale) {
    var dummy = new THREE.Object3D();
    var n = 0;
    var r, c, u, v, x, z, s;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        u = c / Math.max(cols - 1, 1);
        v = r / Math.max(rows - 1, 1);
        x = (u - 0.5) * width + (Math.random() - 0.5) * 0.1 + (r % 2 ? stagger : 0);
        z = (v - 0.5) * depth + (Math.random() - 0.5) * 0.1;
        dummy.position.set(x, terrainHeight(x, z), z);
        dummy.rotation.set(0, Math.atan2(0.38, 0.92) + (Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.04);
        s = scaleBase + Math.random() * scaleJitter;
        dummy.scale.set(s, s * heightScale * (0.88 + Math.random() * 0.28), s);
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        n += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function scatterFlowers(mesh, count, width, depth) {
    var dummy = new THREE.Object3D();
    var n = 0;
    var attempts = 0;
    var x, z, patch, s, viewDist, farBoost;

    function placeFlower(px, pz, extraScale) {
      viewDist = Math.hypot(px - HOME_POS.x, pz - HOME_POS.z);
      farBoost = THREE.MathUtils.clamp((viewDist - 10) / 32, 0, 1);
      dummy.position.set(px, terrainHeight(px, pz) - 0.024 - farBoost * 0.016, pz);
      dummy.rotation.set((Math.random() - 0.5) * 0.08, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.08);
      s = extraScale * (0.94 + Math.random() * 0.18);
      var xz = s * (1 + farBoost * 0.95);
      var y = s * (0.98 + Math.random() * 0.1) * (1 + farBoost * 0.1);
      dummy.scale.set(xz, y, xz);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      n += 1;
    }

    while (n < count && attempts < count * 20) {
      attempts += 1;
      x = (Math.random() - 0.5) * width;
      z = (Math.random() - 0.5) * depth;
      patch = Math.sin(x * 0.31) * Math.cos(z * 0.27) + Math.sin(x * 0.17 + z * 0.21);
      if (Math.random() > 0.72 + patch * 0.2) continue;
      placeFlower(x, z, 0.92 + Math.random() * 0.32);
    }
    while (n < count) {
      x = (Math.random() - 0.5) * width;
      z = (Math.random() - 0.5) * depth;
      placeFlower(x, z, 0.96 + Math.random() * 0.24);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function init() {
    var canvas = document.createElement("canvas");
    canvas.id = "hill-bg-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);

    var initialTheme =
      document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    PALETTE = initialTheme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
    var mobile = window.innerWidth < 820 || window.innerHeight < 560;
    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var subpageBoot =
      document.documentElement.classList.contains("subpage-is-booting");
    var isHomePage = document.body.classList.contains("page-home");
    var isProjectsPage = document.body.classList.contains("page-projects");
    var isGuestbook = document.body.classList.contains("page-guestbook");
    var commentsReady = !isGuestbook || window.__riumCommentsReady === true;
    var windowLoaded = document.readyState === "complete";
    var assetsReady =
      isProjectsPage ||
      (windowLoaded && (!isHomePage || window.__riumGalleryReady === true));
    var bootMode =
      !reducedMotion &&
      (document.documentElement.classList.contains("home-is-booting") ||
        document.documentElement.classList.contains("subpage-is-booting"));
    var bootStart = null;
    var bootDuration = subpageBoot
      ? mobile
        ? 1650
        : 1950
      : mobile
        ? 2200
        : 2600;
    var bootFromPos = new THREE.Vector3(0, 2.15, 5.2);
    var bootFromLook = new THREE.Vector3(0, 1.35, -0.8);
    var bootLook = new THREE.Vector3();
    var homePos = new THREE.Vector3(HOME_POS.x, HOME_POS.y, HOME_POS.z);
    var homeLook = new THREE.Vector3(HOME_LOOK.x, HOME_LOOK.y, HOME_LOOK.z);

    // Rendering at the physical 2x DPR on Retina screens quadruples the
    // fragment workload while making little visual difference for this full
    // viewport background.  A 1.5x cap keeps the scene crisp and lowers GPU
    // usage substantially; mobile devices use an even lighter target.
    var pixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
    var renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: pixelRatio < 1.5,
      powerPreference: "high-performance",
      alpha: false,
      stencil: false
    });
    window.__hillBackgroundActive = true;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(PALETTE.sky, 1);
    if (THREE.ACESFilmicToneMapping) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = isSafariEngine() ? PALETTE.exposure * 0.94 : PALETTE.exposure;
    }
    lockSrgbOutput(renderer);

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(PALETTE.sky);
    scene.fog = new THREE.Fog(lerpHex(PALETTE.fog, PALETTE.haze, 0.18), PALETTE.fogNear, PALETTE.fogFar);

    var camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 220);
    if (bootMode) {
      camera.position.copy(bootFromPos);
      camera.fov = 32;
      camera.lookAt(bootFromLook);
    } else {
      camera.position.copy(homePos);
      camera.lookAt(homeLook);
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    var hemi = new THREE.HemisphereLight(PALETTE.zenith, PALETTE.soil, PALETTE.hemi);
    scene.add(hemi);
    var ambient = new THREE.AmbientLight(0xffffff, PALETTE.ambient);
    scene.add(ambient);
    var sunLight = new THREE.DirectionalLight(PALETTE.sun, PALETTE.sunIntensity);
    sunLight.position.set(18, 22, 8);
    scene.add(sunLight);
    var fill = new THREE.DirectionalLight(PALETTE.fill, PALETTE.fillIntensity);
    fill.position.set(-8, 6, -4);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(PALETTE.rim, PALETTE.rimIntensity);
    rim.position.set(-14, 9, -18);
    scene.add(rim);

    var skyGeo = new THREE.SphereGeometry(110, 32, 20);
    var skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color(PALETTE.zenith) },
        uHorizon: { value: new THREE.Color(PALETTE.horizon) },
        uHaze: { value: new THREE.Color(PALETTE.haze) },
        uSunDir: { value: new THREE.Vector3(0.55, 0.62, -0.55).normalize() },
        uMoonDir: { value: new THREE.Vector3(-0.5, 0.58, -0.64).normalize() },
        uSunGlow: { value: PALETTE.skyGlow },
        uMoonGlow: { value: PALETTE.moonGlow }
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false
    });
    var skyDome = new THREE.Mesh(skyGeo, skyMat);
    skyDome.renderOrder = 0;
    scene.add(skyDome);

    function pointFromCamera(localPoint) {
      var probe = new THREE.Object3D();
      var point = new THREE.Vector3();
      probe.position.set(localPoint.x, localPoint.y, localPoint.z);
      camera.add(probe);
      camera.updateMatrixWorld(true);
      probe.getWorldPosition(point);
      camera.remove(probe);
      return point;
    }

    var sunPeak = pointFromCamera(CELESTIAL_PEAK);
    var moonPeak = pointFromCamera(MOON_PEAK);
    var sunExit = sunPeak.clone();
    var moonExit = moonPeak.clone();
    var sunEntry = sunPeak.clone();
    var moonEntry = moonPeak.clone();
    sunExit.y -= CELESTIAL_DROP;
    moonExit.y -= CELESTIAL_DROP;
    sunEntry.y += CELESTIAL_DROP;
    moonEntry.y += CELESTIAL_DROP;

    var sunAnchor = new THREE.Object3D();
    var moonAnchor = new THREE.Object3D();
    sunAnchor.position.copy(PALETTE.skyGlow > 0.5 ? sunPeak : sunExit);
    moonAnchor.position.copy(PALETTE.moonGlow > 0.5 ? moonPeak : moonExit);
    scene.add(sunAnchor);
    scene.add(moonAnchor);

    var starPositions = new Float32Array(420 * 3);
    var si;
    for (si = 0; si < 420; si++) {
      starPositions[si * 3] = (Math.random() - 0.5) * 150;
      starPositions[si * 3 + 1] = 14 + Math.random() * 76;
      starPositions[si * 3 + 2] = -118 + Math.random() * 108;
    }
    var starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    var starMat = new THREE.PointsMaterial({
      color: PALETTE.particle,
      size: 0.12,
      transparent: true,
      opacity: PALETTE.moonGlow * 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    var stars = new THREE.Points(starGeo, starMat);
    stars.visible = PALETTE.moonGlow > 0.01;
    stars.renderOrder = 1;
    scene.add(stars);

    var clouds = new THREE.Group();
    var cloudMaps = [makeCloudTexture(0), makeCloudTexture(1), makeCloudTexture(2)];
    var cloudMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uMap: { value: cloudMaps[0] },
          uZenith: { value: new THREE.Color(PALETTE.zenith) },
          uHorizon: { value: new THREE.Color(PALETTE.horizon) },
          uHaze: { value: new THREE.Color(PALETTE.haze) },
          uTint: { value: new THREE.Color(PALETTE.cloud) },
          uSunDir: { value: new THREE.Vector3(0.55, 0.62, -0.55).normalize() },
          uOpacity: { value: PALETTE.cloudOpacity },
          uSunGlow: { value: PALETTE.skyGlow }
        }
      ]),
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
      premultipliedAlpha: true
    });
    var cloudGeo = new THREE.PlaneGeometry(1, 1);
    var cloudLayouts = [
      [-22, 13.4, -38, 16.5, 6.4, 0],
      [6, 14.8, -44, 18.5, 7.0, 1],
      [24, 13.0, -34, 13.5, 5.2, 2],
      [-8, 16.2, -50, 20.0, 7.4, 1],
      [16, 12.6, -26, 11.5, 4.6, 0]
    ];
    var cloudMaterials = [];
    var ci;
    for (ci = 0; ci < cloudLayouts.length; ci++) {
      var layout = cloudLayouts[ci];
      var cMat = cloudMat.clone();
      cMat.uniforms.uMap.value = cloudMaps[layout[5]];
      cloudMaterials.push(cMat);
      var cloudMesh = new THREE.Mesh(cloudGeo, cMat);
      cloudMesh.position.set(layout[0], layout[1], layout[2]);
      cloudMesh.scale.set(layout[3], layout[4], 1);
      clouds.add(cloudMesh);
    }
    scene.add(clouds);
    clouds.visible = PALETTE.cloudOpacity > 0.01;

    var world = new THREE.Group();
    scene.add(world);

    var terrainGeo = new THREE.PlaneGeometry(72, 56, 96, 64);
    terrainGeo.rotateX(-Math.PI / 2);
    var terrainPos = terrainGeo.attributes.position;
    var terrainColors = new Float32Array(terrainPos.count * 3);
    var soil = new THREE.Color(PALETTE.soil);
    var fieldLow = new THREE.Color(PALETTE.fieldLow);
    var lawn = new THREE.Color(0x62a832);
    var tmpColor = new THREE.Color();
    var ti, tx, tz, ty, heightT, furrow, grit;
    for (ti = 0; ti < terrainPos.count; ti++) {
      tx = terrainPos.getX(ti);
      tz = terrainPos.getZ(ti);
      ty = terrainHeight(tx, tz);
      terrainPos.setY(ti, ty);
      heightT = THREE.MathUtils.clamp((ty + 2.2) / 5.2, 0, 1);
      furrow = 0.5 + 0.5 * Math.sin(tx * 0.72 + tz * 0.28);
      tmpColor.copy(fieldLow).lerp(lawn, 0.45 + heightT * 0.35);
      tmpColor.lerp(soil, 0.05 + (1 - furrow) * 0.03);
      grit = 0.94 + ((Math.sin(tx * 7.1 + tz * 5.3) * 0.5 + 0.5) * 0.12);
      tmpColor.multiplyScalar(grit);
      terrainColors[ti * 3] = tmpColor.r;
      terrainColors[ti * 3 + 1] = tmpColor.g;
      terrainColors[ti * 3 + 2] = tmpColor.b;
    }
    terrainGeo.setAttribute("color", new THREE.BufferAttribute(terrainColors, 3));
    terrainGeo.computeVertexNormals();
    var soilMap = makeSoilTexture();
    soilMap.repeat.set(18, 14);
    var terrainMat = new THREE.MeshLambertMaterial({
      map: soilMap,
      vertexColors: true,
      color: 0x96c44a
    });
    world.add(new THREE.Mesh(terrainGeo, terrainMat));

    var grassGeo = createGrassClumpGeometry();
    var underGeo = createUndergrowthGeometry();
    var carpetGeo = createCarpetGeometry();
    var flowerGeo = createFlowerGeometry();

    var grassMat = makePlantMaterial(GRASS_FRAG, PALETTE.grassBlade, PALETTE.grassStem, PALETTE.grassTip, { bend: 0.34 });
    var underMat = makePlantMaterial(GRASS_FRAG, PALETTE.fieldLow, PALETTE.grassStem, PALETTE.grassBlade, { bend: 0.22 });
    var carpetMat = makePlantMaterial(GRASS_FRAG, PALETTE.fieldLow, PALETTE.grassStem, PALETTE.grassBlade, { bend: 0.14 });
    var flowerMat = makePlantMaterial(FLOWER_FRAG, PALETTE.flower, PALETTE.grassStem, PALETTE.flowerHead, { bend: 0.16 });
    underMat.uniforms.uTime = grassMat.uniforms.uTime;
    underMat.uniforms.uWindDir = grassMat.uniforms.uWindDir;
    underMat.uniforms.uSunDir = grassMat.uniforms.uSunDir;
    carpetMat.uniforms.uTime = grassMat.uniforms.uTime;
    carpetMat.uniforms.uWindDir = grassMat.uniforms.uWindDir;
    carpetMat.uniforms.uSunDir = grassMat.uniforms.uSunDir;
    flowerMat.uniforms.uTime = grassMat.uniforms.uTime;
    flowerMat.uniforms.uWindDir = grassMat.uniforms.uWindDir;
    flowerMat.uniforms.uSunDir = grassMat.uniforms.uSunDir;

    var grassCols = mobile ? 90 : 150;
    var grassRows = mobile ? 64 : 108;
    var underCols = mobile ? 100 : 175;
    var underRows = mobile ? 72 : 125;
    var carpetCols = mobile ? 110 : 200;
    var carpetRows = mobile ? 80 : 145;
    var flowerCount = mobile ? 420 : 1050;

    var grass = new THREE.InstancedMesh(grassGeo, grassMat, grassCols * grassRows);
    grass.frustumCulled = false;
    scatterGrid(grass, grassCols, grassRows, 66, 50, 0.14, 1.08, 0.28, 1.02);
    world.add(grass);

    var undergrowth = new THREE.InstancedMesh(underGeo, underMat, underCols * underRows);
    undergrowth.frustumCulled = false;
    scatterGrid(undergrowth, underCols, underRows, 68, 52, 0.12, 1.12, 0.26, 0.82);
    world.add(undergrowth);

    var carpet = new THREE.InstancedMesh(carpetGeo, carpetMat, carpetCols * carpetRows);
    carpet.frustumCulled = false;
    scatterGrid(carpet, carpetCols, carpetRows, 70, 54, 0.1, 1.28, 0.22, 0.62);
    world.add(carpet);

    var flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerCount);
    flowers.frustumCulled = false;
    scatterFlowers(flowers, flowerCount, 66, 50);
    world.add(flowers);

    var pollenCount = 140;
    var pollenPos = new Float32Array(pollenCount * 3);
    var pi;
    for (pi = 0; pi < pollenCount; pi++) {
      pollenPos[pi * 3] = (Math.random() - 0.5) * 50;
      pollenPos[pi * 3 + 1] = 1.4 + Math.random() * 6;
      pollenPos[pi * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    var pollenGeo = new THREE.BufferGeometry();
    pollenGeo.setAttribute("position", new THREE.BufferAttribute(pollenPos, 3));
    var pollen = new THREE.Points(
      pollenGeo,
      new THREE.PointsMaterial({
        color: PALETTE.particle,
        size: 0.09,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      })
    );
    world.add(pollen);

    var sunDirWorld = new THREE.Vector3();
    var moonDirWorld = new THREE.Vector3();
    var lightDirWorld = new THREE.Vector3();
    var plantMaterials = [grassMat, underMat, carpetMat, flowerMat];
    var paletteColorKeys = [
      "sky",
      "zenith",
      "horizon",
      "fog",
      "soil",
      "fieldLow",
      "fieldHigh",
      "lawn",
      "grassStem",
      "grassBlade",
      "grassTip",
      "flower",
      "flowerHead",
      "particle",
      "sun",
      "cloud",
      "fill",
      "rim",
      "haze"
    ];
    var paletteColorKeySet = {};
    var pcki;
    for (pcki = 0; pcki < paletteColorKeys.length; pcki++) {
      paletteColorKeySet[paletteColorKeys[pcki]] = true;
    }

    function blendPalettes(from, to, progress) {
      var blended = {};
      var key;
      for (key in from) {
        if (!Object.prototype.hasOwnProperty.call(from, key)) continue;
        if (paletteColorKeySet[key]) {
          blended[key] = lerpHex(from[key], to[key], progress);
        } else {
          blended[key] = THREE.MathUtils.lerp(from[key], to[key], progress);
        }
      }
      return blended;
    }

    function repaintTerrain(palette) {
      soil.setHex(palette.soil);
      fieldLow.setHex(palette.fieldLow);
      lawn.setHex(palette.lawn);
      for (ti = 0; ti < terrainPos.count; ti++) {
        ty = terrainPos.getY(ti);
        heightT = THREE.MathUtils.clamp((ty + 2.2) / 5.2, 0, 1);
        tx = terrainPos.getX(ti);
        tz = terrainPos.getZ(ti);
        furrow = 0.5 + 0.5 * Math.sin(tx * 0.72 + tz * 0.28);
        tmpColor.copy(fieldLow).lerp(lawn, 0.45 + heightT * 0.35);
        tmpColor.lerp(soil, 0.05 + (1 - furrow) * 0.03);
        grit = 0.94 + ((Math.sin(tx * 7.1 + tz * 5.3) * 0.5 + 0.5) * 0.12);
        tmpColor.multiplyScalar(grit);
        terrainColors[ti * 3] = tmpColor.r;
        terrainColors[ti * 3 + 1] = tmpColor.g;
        terrainColors[ti * 3 + 2] = tmpColor.b;
      }
      terrainGeo.attributes.color.needsUpdate = true;
    }

    function setPlantColor(material, uniformName, color) {
      material.uniforms[uniformName].value.setHex(color);
    }

    function applyPalette(palette) {
      var i;
      PALETTE = palette;
      renderer.setClearColor(palette.sky, 1);
      if (THREE.ACESFilmicToneMapping) {
        renderer.toneMappingExposure = isSafariEngine() ? palette.exposure * 0.94 : palette.exposure;
      }
      scene.background.setHex(palette.sky);
      scene.fog.color.setHex(lerpHex(palette.fog, palette.haze, 0.18));
      scene.fog.near = palette.fogNear;
      scene.fog.far = palette.fogFar;

      hemi.color.setHex(palette.zenith);
      hemi.groundColor.setHex(palette.soil);
      hemi.intensity = palette.hemi;
      ambient.intensity = palette.ambient;
      sunLight.color.setHex(palette.sun);
      sunLight.intensity = palette.sunIntensity;
      fill.color.setHex(palette.fill);
      fill.intensity = palette.fillIntensity;
      rim.color.setHex(palette.rim);
      rim.intensity = palette.rimIntensity;

      skyMat.uniforms.uZenith.value.setHex(palette.zenith);
      skyMat.uniforms.uHorizon.value.setHex(palette.horizon);
      skyMat.uniforms.uHaze.value.setHex(palette.haze);
      skyMat.uniforms.uSunGlow.value = palette.skyGlow;
      skyMat.uniforms.uMoonGlow.value = palette.moonGlow;

      for (i = 0; i < cloudMaterials.length; i++) {
        cloudMaterials[i].uniforms.uZenith.value.setHex(palette.zenith);
        cloudMaterials[i].uniforms.uHorizon.value.setHex(palette.horizon);
        cloudMaterials[i].uniforms.uHaze.value.setHex(palette.haze);
        cloudMaterials[i].uniforms.uTint.value.setHex(palette.cloud);
        cloudMaterials[i].uniforms.uOpacity.value = palette.cloudOpacity;
        cloudMaterials[i].uniforms.uSunGlow.value = palette.skyGlow;
      }
      clouds.visible = palette.cloudOpacity > 0.01;

      for (i = 0; i < plantMaterials.length; i++) {
        setPlantColor(plantMaterials[i], "uRimColor", palette.rim);
        plantMaterials[i].uniforms.uDay.value = palette.skyGlow;
      }
      setPlantColor(grassMat, "uColorA", palette.grassBlade);
      setPlantColor(grassMat, "uColorB", palette.grassStem);
      setPlantColor(grassMat, "uColorHead", palette.grassTip);
      setPlantColor(underMat, "uColorA", palette.fieldLow);
      setPlantColor(underMat, "uColorB", palette.grassStem);
      setPlantColor(underMat, "uColorHead", palette.grassBlade);
      setPlantColor(carpetMat, "uColorA", palette.fieldLow);
      setPlantColor(carpetMat, "uColorB", palette.grassStem);
      setPlantColor(carpetMat, "uColorHead", palette.grassBlade);
      setPlantColor(flowerMat, "uColorA", palette.flower);
      setPlantColor(flowerMat, "uColorB", palette.grassStem);
      setPlantColor(flowerMat, "uColorHead", palette.flowerHead);

      pollen.material.color.setHex(palette.particle);
      pollen.material.opacity = 0.55 * palette.skyGlow;
      stars.material.color.setHex(palette.particle);
      stars.material.opacity = 0.78 * palette.moonGlow;
      stars.visible = palette.moonGlow > 0.01;
      repaintTerrain(palette);
    }

    function syncSkyDirections() {
      var i;
      sunAnchor.getWorldPosition(sunDirWorld);
      moonAnchor.getWorldPosition(moonDirWorld);
      sunDirWorld.sub(camera.position).normalize();
      moonDirWorld.sub(camera.position).normalize();
      skyMat.uniforms.uSunDir.value.copy(sunDirWorld);
      skyMat.uniforms.uMoonDir.value.copy(moonDirWorld);
      lightDirWorld
        .copy(sunDirWorld)
        .lerp(moonDirWorld, 1 - PALETTE.skyGlow)
        .normalize();
      for (i = 0; i < plantMaterials.length; i++) {
        plantMaterials[i].uniforms.uSunDir.value.copy(lightDirWorld);
      }
      for (i = 0; i < cloudMaterials.length; i++) {
        cloudMaterials[i].uniforms.uSunDir.value.copy(sunDirWorld);
      }
      sunLight.position.copy(lightDirWorld).multiplyScalar(40);
      fill.position.copy(lightDirWorld).multiplyScalar(-18);
      rim.position.copy(lightDirWorld).multiplyScalar(-32);
      rim.position.y = Math.max(8, Math.abs(rim.position.y));
    }

    function setCelestialState(theme) {
      if (theme === "dark") {
        sunAnchor.position.copy(sunExit);
        moonAnchor.position.copy(moonPeak);
      } else {
        sunAnchor.position.copy(sunPeak);
        moonAnchor.position.copy(moonExit);
      }
    }

    function onThemeTransition(event) {
      var detail = event.detail || {};
      var from = detail.from === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
      var to = detail.to === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
      var progress = THREE.MathUtils.clamp(Number(detail.progress) || 0, 0, 1);
      var palette = blendPalettes(from, to, progress);
      applyPalette(palette);
      // The outgoing body sets below the horizon; the incoming body drops in from above.
      if (detail.to === "dark") {
        sunAnchor.position.lerpVectors(sunPeak, sunExit, progress);
        moonAnchor.position.lerpVectors(moonEntry, moonPeak, progress);
      } else {
        sunAnchor.position.lerpVectors(sunEntry, sunPeak, progress);
        moonAnchor.position.lerpVectors(moonPeak, moonExit, progress);
      }
      syncSkyDirections();
    }

    function onThemeChange(event) {
      var theme = event.detail && event.detail.theme === "dark" ? "dark" : "light";
      applyPalette(theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE);
      setCelestialState(theme);
      syncSkyDirections();
    }

    document.addEventListener("rium-theme-transition", onThemeTransition);
    document.addEventListener("rium-theme-change", onThemeChange);
    setCelestialState(initialTheme);
    applyPalette(PALETTE);
    syncSkyDirections();

    function faceCloudsToCamera() {
      var i, mesh;
      for (i = 0; i < clouds.children.length; i++) {
        mesh = clouds.children[i];
        mesh.lookAt(camera.position.x, mesh.position.y, camera.position.z);
      }
    }

    var mouseX = 0;
    var mouseY = 0;
    var onMove = function (e) {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = -(e.clientY / window.innerHeight - 0.5) * 2;
    };
    document.addEventListener("mousemove", onMove, { passive: true });

    var resizeFrame = 0;
    var onResize = function () {
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(function () {
        resizeFrame = 0;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });
    };
    window.addEventListener("resize", onResize);

    var visible = !document.hidden;
    var animationFrameId = 0;
    var lastRenderTime = 0;
    var frameInterval = mobile ? 50 : 33;
    document.addEventListener("visibilitychange", function () {
      visible = !document.hidden;
      if (!visible) {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
        return;
      }
      lastRenderTime = 0;
      scheduleAnimationFrame();
    });

    function updateHomeLoading(progress, label, stage) {
      var percent = Math.round(THREE.MathUtils.clamp(progress, 0, 1) * 100);
      var bar = document.getElementById("home-loading-bar");
      var percentEl = document.getElementById("home-loading-percent");
      var labelEl = document.getElementById("home-loading-label");
      if (bar) bar.style.width = percent + "%";
      if (percentEl) percentEl.textContent = percent + "%";
      if (labelEl && label) labelEl.textContent = label;
      if (stage) {
        var stageEls = document.querySelectorAll("[data-loading-stage]");
        var stageNames = ["scene", "assets", "page", "enter"];
        var stageIndex = stageNames.indexOf(stage);
        Array.prototype.forEach.call(stageEls, function (stageEl) {
          var currentIndex = stageNames.indexOf(stageEl.getAttribute("data-loading-stage"));
          stageEl.classList.toggle("is-active", currentIndex === stageIndex);
          stageEl.classList.toggle("is-done", currentIndex >= 0 && currentIndex < stageIndex);
        });
      }
    }

    function refreshAssetsReady() {
      var galleryReady = !isHomePage || window.__riumGalleryReady === true;
      assetsReady = isProjectsPage || (windowLoaded && galleryReady);
      if (!bootMode && assetsReady && commentsReady) finishHomeLoading();
    }

    function finishHomeLoading() {
      if (!assetsReady) {
        updateHomeLoading(0.76, "正在等待页面资源加载…", "assets");
        return;
      }
      if (isGuestbook && !commentsReady) {
        updateHomeLoading(0.86, "正在等待留言加载…", "comments");
        return;
      }
      var loader = document.getElementById("home-loading");
      document.documentElement.classList.remove("home-is-booting", "subpage-is-booting");
      updateHomeLoading(1, isGuestbook ? "留言已加载" : "场景已就绪", "enter");
      if (!loader) return;
      loader.classList.add("is-done");
      window.setTimeout(function () {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
      }, 850);
    }

    window.addEventListener("load", function () {
      windowLoaded = true;
      refreshAssetsReady();
    });
    document.addEventListener("rium-page-assets-ready", function () {
      refreshAssetsReady();
    });
    document.addEventListener("rium-comments-ready", function () {
      commentsReady = true;
      refreshAssetsReady();
    });

    var running = true;
    function scheduleAnimationFrame() {
      if (!animationFrameId && visible && running) {
        animationFrameId = requestAnimationFrame(animate);
      }
    }

    function animate(t) {
      animationFrameId = 0;
      if (!running || !visible) return;
      if (lastRenderTime && t - lastRenderTime < frameInterval) {
        scheduleAnimationFrame();
        return;
      }
      lastRenderTime = t;
      var time = t * 0.001;
      if (!reducedMotion) {
        grassMat.uniforms.uTime.value = time;
        clouds.position.x = Math.sin(time * 0.03) * 2.4;
        pollen.rotation.y = time * 0.02;
        var pp = pollenGeo.attributes.position;
        for (pi = 0; pi < pollenCount; pi++) {
          var y = pp.getY(pi) + Math.sin(time * 0.6 + pi) * 0.004;
          pp.setY(pi, y > 8 ? 1.2 : y);
        }
        pp.needsUpdate = true;

        if (bootMode) {
          if (bootStart === null) bootStart = t;
          var rawBootProgress = THREE.MathUtils.clamp(
            (t - bootStart) / bootDuration,
            0,
            1
          );
          var readyForReveal = assetsReady && commentsReady;
          var bootProgress = readyForReveal
            ? rawBootProgress
            : Math.min(rawBootProgress, 0.92);
          var bootEase = 1 - Math.pow(1 - bootProgress, 3);
          var galleryProgress = isHomePage
            ? THREE.MathUtils.clamp(Number(window.__riumGalleryProgress) || 0, 0, 1)
            : windowLoaded
              ? 1
              : 0;
          var loadingProgress;
          var loadingLabel;
          var loadingStage;

          if (rawBootProgress < 0.22) {
            loadingProgress = (rawBootProgress / 0.22) * 0.18;
            loadingStage = "scene";
            loadingLabel = "正在初始化 3D 场景…";
          } else if (!assetsReady) {
            loadingProgress = 0.18 + galleryProgress * 0.58;
            loadingStage = "assets";
            loadingLabel = isHomePage
              ? galleryProgress > 0
                ? "正在加载相册图片…"
                : "正在加载页面资源…"
              : "正在加载页面资源…";
          } else if (isGuestbook && !commentsReady) {
            loadingProgress = 0.86;
            loadingStage = "page";
            loadingLabel = "正在加载留言…";
          } else {
            loadingProgress = 0.86 + rawBootProgress * 0.14;
            loadingStage = rawBootProgress >= 0.9 ? "enter" : "page";
            loadingLabel = rawBootProgress >= 0.9
              ? "即将进入页面…"
              : "正在整理页面布局…";
          }

          camera.position.lerpVectors(bootFromPos, homePos, bootEase);
          bootLook.lerpVectors(bootFromLook, homeLook, bootEase);
          camera.lookAt(bootLook);
          camera.fov = THREE.MathUtils.lerp(32, 48, bootEase);
          camera.updateProjectionMatrix();
          updateHomeLoading(loadingProgress, loadingLabel, loadingStage);

          if (bootProgress >= 1) {
            bootMode = false;
            camera.position.copy(homePos);
            camera.lookAt(homeLook);
            camera.fov = 48;
            camera.updateProjectionMatrix();
            finishHomeLoading();
          }
        } else {
          camera.position.x += (HOME_POS.x + mouseX * 1.6 - camera.position.x) * 0.035;
          camera.position.y += (HOME_POS.y + mouseY * 0.8 - camera.position.y) * 0.035;
          camera.position.z += (HOME_POS.z - camera.position.z) * 0.035;
          camera.fov = 48;
          camera.lookAt(homeLook);
        }
      } else {
        camera.position.copy(homePos);
        camera.fov = 48;
        camera.lookAt(homeLook);
      }
      faceCloudsToCamera();
      syncSkyDirections();
      renderer.render(scene, camera);
      scheduleAnimationFrame();
    }

    if (reducedMotion) {
      // Render the static scene once; no animation loop is needed when the
      // user has explicitly requested reduced motion.
      faceCloudsToCamera();
      syncSkyDirections();
      renderer.render(scene, camera);
      finishHomeLoading();
    } else {
      scheduleAnimationFrame();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
