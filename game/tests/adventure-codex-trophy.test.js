const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

function setup() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="char-detail-screen"></div><div id="select-screen" class="active"></div></body>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = function () {
    return {
      canvas: this,
      fillRect() {}, strokeRect() {}, clearRect() {},
      beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
      quadraticCurveTo() {}, bezierCurveTo() {}, ellipse() {}, arc() {}, fill() {}, stroke() {},
      save() {}, restore() {}, translate() {}, scale() {},
      drawImage() {}, fillText() {}, strokeText() {},
      measureText: () => ({ width: 8 }),
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; },
      setTransform() {}, clip() {},
      globalCompositeOperation: 'source-over',
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: ''
    };
  };
  const root = path.resolve(__dirname, '..');
  for (const relative of [
    'adventure/js/content/registry.js',
    'adventure/js/items/item_defs.js',
    'js/ui/card_style.js',
    'js/ui/adventure_codex.js'
  ]) {
    w.eval(fs.readFileSync(path.join(root, relative), 'utf8'));
  }
  return { dom, w };
}

test('trophy codex groups drop/forge/both with real cards and shared rules', () => {
  const { dom, w } = setup();
  const screen = w.document.getElementById('char-detail-screen');
  w.AdventureCodex.show(screen);
  screen.querySelector('[data-cat="trophyWhite"]').click();

  const sections = [...screen.querySelectorAll('[data-trophy-kind]')];
  assert.deepEqual(sections.map(section => section.getAttribute('data-trophy-kind')), ['drop', 'forge', 'both']);
  assert.equal(screen.querySelector('.codex-trophy-columns'), null);
  assert.equal(screen.querySelector('.char-detail-avatar'), null, 'no circular icon frames');
  assert.ok(screen.querySelector('.codex-trophy-face'), 'renders a card canvas');
  assert.ok(sections[0].querySelector('[data-codex-trophy="BurnTrophy"]'));
  assert.ok(sections[1].querySelector('[data-codex-trophy="DisarmTrophy"]') || sections[1].querySelector('[data-codex-trophy="RiotTrophy"]'));
  assert.ok(sections[2].querySelector('[data-codex-trophy="SmallPotionTrophy"]'));
  assert.equal(screen.querySelectorAll('.codex-trophy-face').length, screen.querySelectorAll('.codex-trophy-entry').length);
  assert.equal(screen.querySelector('.codex-trophy-intro-top').lastElementChild.textContent, '共 25 张');
  assert.equal(sections[0].querySelector('.codex-trophy-cost'), null, 'drop cards have no forge cost');
  const burn = screen.querySelector('[data-codex-trophy="BurnTrophy"]').closest('article');
  assert.equal(burn.querySelector('.codex-trophy-name').textContent, '灼伤');
  assert.equal(burn.querySelector('.codex-trophy-effect').textContent, '对手获得1层[灼伤]');
  assert.equal(burn.querySelectorAll('.codex-trophy-play-rules span').length, 2);
  const zero = screen.querySelector('[data-codex-trophy="ZeroTrophy"]').closest('article');
  assert.equal(zero.querySelector('.codex-trophy-effect').textContent, '释放角色当前阶段的0技能');
  assert.equal(zero.querySelector('.is-exception').textContent, '不抽牌不继续搭桥');
  assert.equal(zero.querySelector('[data-beast="wuneng"]').textContent, '万能兽元×2');
  assert.doesNotMatch(screen.textContent, /堆叠上限|维持效果|无法防御蓝色|归零爆炸造成|每有1层/);
  for (const canvas of screen.querySelectorAll('.codex-trophy-face')) {
    assert.equal(canvas.width, 88);
    assert.equal(canvas.height, 128);
  }
  dom.window.close();
});
