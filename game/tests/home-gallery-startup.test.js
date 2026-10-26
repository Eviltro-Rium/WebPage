const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.resolve(__dirname, '../../js/gallery-cylinder.js'), 'utf8');

test('gallery decode concurrency stays at two and layout waits for the camera to finish', async t => {
  const dom = new JSDOM('<html class="home-is-booting"><body><canvas id="hill-bg-canvas"></canvas>' +
    '<div class="gallery-cylinder-viewport"><div class="gallery-cylinder-layers"></div></div>' +
    '<div class="gallery-cylinder-seed">' + [1, 2, 3, 4].map(i => `<img src="${i}.webp">`).join('') + '</div></body></html>',
  { runScripts: 'outside-only', url: 'http://localhost/' });
  t.after(() => dom.window.close());
  const w = dom.window, images = [], idle = [];
  Object.defineProperty(w.document.querySelector('.gallery-cylinder-viewport'), 'clientWidth', { value: 1000 });
  w.Image = class {
    constructor() { this.naturalWidth = 300; this.naturalHeight = 400; images.push(this); }
    decode() { return Promise.resolve(); }
  };
  w.requestIdleCallback = fn => idle.push(fn);
  w.eval(source);
  assert.equal(images.length, 0, 'no image decode competes with scene construction');
  w.document.dispatchEvent(new w.CustomEvent('rium-scene-ready'));
  assert.equal(images.length, 2);
  images[0].onload(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(images.length, 3);
  images[1].onerror();
  assert.equal(images.length, 4);
  images[2].onload(); images[3].onload();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(w.document.querySelectorAll('.gallery-photo').length, 0);
  assert.notEqual(w.__riumGalleryReady, true);
  assert.ok(images.every(image => image.fetchPriority === 'low'));
  w.document.documentElement.classList.remove('home-is-booting');
  w.document.dispatchEvent(new w.CustomEvent('rium-home-ready'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(idle.length, 1, 'normal completion and safety release cannot duplicate layout');
  idle[0]();
  assert.equal(w.__riumGalleryReady, true);
  assert.equal(w.document.querySelectorAll('.gallery-photo').length, 4 * 8);
  assert.equal(w.document.querySelectorAll('.gallery-glass').length, 4 * 8);
});
