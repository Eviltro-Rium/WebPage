'use strict';
// 离线加载实际 HTML 的脚本顺序，发现单测桩未覆盖的入口与界面依赖断裂。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const gameRoot = path.resolve(__dirname, '..');

async function boot(t, entry) {
  const file = path.join(gameRoot, entry);
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
    runScripts: 'outside-only', url: 'http://localhost/game/' + entry,
    pretendToBeVisual: true
  });
  t.after(() => dom.window.close());
  const w = dom.window, errors = [];
  w.addEventListener('error', event => errors.push(event.error || event.message));
  w.setTimeout = w.setInterval = w.requestAnimationFrame = () => 1;
  w.clearTimeout = w.clearInterval = w.cancelAnimationFrame = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({
    measureText: text => ({ width: String(text).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} })
  }, { get: (target, key) => target[key] || (() => {}) });
  w.Image = class {
    constructor() { this.complete = true; this.naturalWidth = 64; this.naturalHeight = 64; }
    set src(value) { this._src = value; Promise.resolve().then(() => this.onload && this.onload()); }
    get src() { return this._src; }
  };
  // 不请求网络；页面启动必须能使用内嵌配置与地图。
  w.fetch = () => { throw new Error('Unexpected network request during local startup'); };
  const context = dom.getInternalVMContext();
  for (const script of w.document.querySelectorAll('script')) {
    Object.defineProperty(w.document, 'currentScript', { configurable: true, value: script });
    const source = script.getAttribute('src');
    if (source) {
      assert.ok(!/^https?:/.test(source), 'startup scripts are local');
      const scriptFile = path.resolve(path.dirname(file), source.split('?')[0]);
      vm.runInContext(fs.readFileSync(scriptFile, 'utf8'), context, { filename: scriptFile });
    } else if (script.textContent.trim()) {
      vm.runInContext(script.textContent, context, { filename: file + ':inline' });
    }
  }
  delete w.document.currentScript;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, []);
  return { w, context };
}

test('classic entry boots and renders the restored combat controls', async t => {
  const { w, context } = await boot(t, 'index.html');
  assert.ok(w.document.querySelector('#select-screen button'));
  const ui = vm.runInContext('ui', context);
  ui._buildGameScreen();
  assert.ok(w.document.querySelector('#player-reserve'));
  assert.ok(w.document.querySelector('#skill-book-btn'));
  assert.equal(typeof ui._renderDiceControl, 'function');
  assert.equal(typeof w.appendParsedSegments, 'function');
  assert.equal(w.CharacterRegistry.get('Moze').hp, 80);
  assert.equal(w.CharacterRegistry.get('Vixraps').hp, 65);
});

test('adventure entry boots, starts an embedded map and renders the new sacrifice room', async t => {
  const { w } = await boot(t, 'adventure/adventure.html');
  const picks = w.document.querySelectorAll('.adv-char-pick');
  assert.equal(picks.length, 10);
  picks[0].click();
  w.document.querySelector('#adv-start').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(w.document.querySelector('.adventure-wrap'));
  assert.ok(w.document.querySelector('.adv-cell.room-sacrifice'));
  const ui = new w.AdventureUI(w.document.getElementById('adventure-container'));
  ui.eng.start(new w.AdventureMap([[0, 10, 1]]), 'Ryan', { trophyWhiteCards: ['BurnTrophy'] });
  ui.eng.move(0, 1); ui.eng.enterCurrent(); ui.bindActions(); ui.render();
  assert.ok(ui.container.querySelector('#adv-sacrifice-upgrade'));
  assert.match(ui.container.textContent, /本层剩余 3 \/ 3 次升级/);
});

test('online entry boots and keeps the shared combat UI available', async t => {
  const { w } = await boot(t, 'online_game/index.html');
  assert.equal(typeof w.GameUI.prototype._buildGameScreen, 'function');
  assert.equal(typeof w.GameUI.prototype._renderDiceControl, 'function');
  assert.equal(typeof w.appendParsedSegments, 'function');
});
