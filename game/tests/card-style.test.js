const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function makeGradient() {
  return { addColorStop() {} };
}

function makeContext2d() {
  return {
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, ellipse() {},
    save() {}, restore() {}, clip() {}, fillRect() {}, fill() {}, stroke() {},
    drawImage() {}, fillText() {}, strokeText() {},
    createLinearGradient: makeGradient,
    createRadialGradient: makeGradient
  };
}

function makeCanvas() {
  const attributes = {};
  return {
    width: 0,
    height: 0,
    className: '',
    style: {},
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return attributes[name] || null; },
    getContext() { return makeContext2d(); }
  };
}

class FakeImage {
  constructor() {
    this.complete = false;
    this.naturalWidth = 0;
  }
  set src(value) {
    this._src = value;
    this.complete = true;
    this.naturalWidth = 32;
    queueMicrotask(() => { if (this.onload) this.onload(); });
  }
}

const context = vm.createContext({
  console,
  URL,
  Image: FakeImage,
  queueMicrotask,
  document: {
    currentScript: { src: 'file:///C:/MyWeb/game/js/card_style.js' },
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return makeCanvas();
    }
  }
});
context.window = context;

const source = fs.readFileSync(path.resolve(__dirname, '../js/card_style.js'), 'utf8');
vm.runInContext(source, context, { filename: 'card_style.js' });

function number(value, color, white = false) {
  return { value, color, isNumberCard: true, isItemCard: false, isBlack: false, isWhite: white };
}

function item(color, props = {}) {
  return Object.assign({
    value: -1,
    color,
    isNumberCard: false,
    isItemCard: true,
    isBlack: color === 'BLACK',
    isWhite: color === 'WHITE'
  }, props);
}

test('all standard card families render with the shared restrained style', () => {
  const cards = [
    number(7, 'RED'),
    number(3, 'YELLOW'),
    number(5, 'BLUE'),
    number(1, 'GREEN'),
    number(6, 'WHITE', true),
    item('WHITE', { potion: true }),
    item('WHITE', { purify: true }),
    item('WHITE', { superPurify: true }),
    item('WHITE', { drawThree: true }),
    item('WHITE', { swapHand: true }),
    item('BLACK', { drawTwo: true }),
    item('BLACK', { shuffleToDeck: true })
  ];

  for (const card of cards) {
    const canvas = context.CardStyle.renderCard(card, 70, 100, false);
    assert.equal(canvas.width, 70);
    assert.equal(canvas.height, 100);
    assert.equal(canvas.className, 'card-canvas');
    assert.ok(canvas.getAttribute('aria-label'));
  }
});

test('chosen-color black and white cards expose a clear color description', () => {
  const black = context.CardStyle.renderCard(item('BLACK', { chosenColor: 'RED' }), 70, 100, true);
  const white = context.CardStyle.renderCard(item('WHITE', { chosenColor: 'YELLOW' }), 40, 58, false);

  assert.match(black.getAttribute('aria-label'), /指定红色/);
  assert.equal(black.getAttribute('aria-selected'), 'true');
  assert.match(white.getAttribute('aria-label'), /指定黄色/);
});

test('card back uses the same dimensions and accessibility contract', () => {
  const canvas = context.CardStyle.renderCardBack(70, 100);
  assert.equal(canvas.width, 70);
  assert.equal(canvas.height, 100);
  assert.equal(canvas.className, 'card-back-canvas');
  assert.equal(canvas.getAttribute('aria-label'), '卡牌背面');
});
