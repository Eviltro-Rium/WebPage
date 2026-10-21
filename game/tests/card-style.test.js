const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function makeGradient() {
  return { addColorStop() {} };
}

function makeContext2d() {
  const ctx = {
    fills: [],
    texts: [],
    fillPaths: [],
    pathPoints: [],
    strokes: [],
    _fillStyle: null,
    _strokeStyle: null,
    get fillStyle() { return this._fillStyle; },
    set fillStyle(value) { this._fillStyle = value; },
    get strokeStyle() { return this._strokeStyle; },
    set strokeStyle(value) { this._strokeStyle = value; },
    beginPath() { this.pathPoints = []; },
    moveTo(x, y) { this.pathPoints.push([x, y]); },
    lineTo(x, y) { this.pathPoints.push([x, y]); },
    quadraticCurveTo() {}, closePath() {}, ellipse() {}, arc() {},
    globalCompositeOperation: 'source-over',
    save() {}, restore() {}, clip() {}, fillRect() {},
    fill() {
      this.fills.push(this._fillStyle);
      this.fillPaths.push({ color: this._fillStyle, points: this.pathPoints.slice() });
    },
    stroke() { this.strokes.push(this._strokeStyle); },
    drawImage() {}, fillText(value) { this.texts.push(value); }, strokeText() {},
    createLinearGradient: makeGradient,
    createRadialGradient: makeGradient
  };
  return ctx;
}

function makeCanvas() {
  const attributes = {};
  const ctx = makeContext2d();
  return {
    width: 0,
    height: 0,
    className: '',
    style: {},
    context: ctx,
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return attributes[name] || null; },
    getContext() { return ctx; }
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
    currentScript: { src: 'file:///C:/MyWeb/game/js/ui/card_style.js' },
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return makeCanvas();
    }
  }
});
context.window = context;

const source = fs.readFileSync(path.resolve(__dirname, '../js/ui/card_style.js'), 'utf8');
vm.runInContext(source, context, { filename: 'card_style.js' });
for (const file of ['adventure/js/content/registry.js', 'adventure/js/items/item_defs.js']) {
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), context, { filename: file });
}

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

test('white cards keep the ivory face while chosen colors fill the central oval', () => {
  const glassFill = 'rgba(255,255,255,0.16)';
  const punch = 'rgba(0,0,0,0.62)';
  const variants = [
    number(3, 'WHITE', true),
    Object.assign(number(3, 'WHITE', true), { npcCard: true }),
    item('WHITE', { trophyWhite: true, trophyName: 'BurnTrophy' })
  ];
  for (const card of variants) {
    const canvas = context.CardStyle.renderCard(card, 70, 100, false);
    assert.ok(canvas.context.fills.includes(punch));
    assert.ok(canvas.context.fills.includes(glassFill));
    assert.ok(canvas.context.strokes.includes('rgba(255,255,255,0.55)'));
  }
  const chosen = context.CardStyle.renderCard(
    Object.assign(number(3, 'WHITE', true), { chosenColor: 'RED' }),
    70, 100, false
  );
  const chosenTrophy = context.CardStyle.renderCard(
    item('WHITE', { trophyWhite: true, trophyName: 'BurnTrophy', chosenColor: 'BLUE' }),
    70, 100, false
  );
  assert.equal(chosen.context.fills.includes(glassFill), false);
  assert.ok(chosen.context.strokes.includes('#E5383B'));
  assert.equal(chosenTrophy.context.fills.includes(glassFill), false);
  assert.ok(chosenTrophy.context.strokes.includes('#2563EB'));
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

test('monster white cards use canvas identity instead of a CSS black rim class', () => {
  const npc = Object.assign(number(3, 'WHITE', true), { npcCard: true });
  const player = number(3, 'WHITE', true);
  const trophy = item('WHITE', { trophyWhite: true, trophyName: 'BurnTrophy' });

  const npcCanvas = context.CardStyle.renderCard(npc, 70, 100, false);
  const playerCanvas = context.CardStyle.renderCard(player, 70, 100, false);
  const trophyCanvas = context.CardStyle.renderCard(trophy, 70, 100, false);

  assert.equal(npcCanvas.className, 'card-canvas');
  assert.equal(playerCanvas.className, 'card-canvas');
  assert.equal(trophyCanvas.className, 'card-canvas');
  assert.match(npcCanvas.getAttribute('aria-label'), /（怪物）/);
  assert.doesNotMatch(playerCanvas.getAttribute('aria-label'), /（怪物）/);
  assert.doesNotMatch(trophyCanvas.getAttribute('aria-label'), /（怪物）/);
  assert.equal(context.CardStyle.isNpcWhiteCard(npc), true);
  assert.equal(context.CardStyle.isNpcWhiteCard(player), false);
  assert.equal(context.CardStyle.isNpcWhiteCard(trophy), false);
  assert.equal(context.CardStyle.isNpcWhiteCard(player, { isNpc: true }), true);
});

test('trophy source badges occupy the correct top corners at hand and thumbnail sizes', () => {
  const cases = [
    ['BurnTrophy', true, false, '怪物掉落'],
    ['DisarmTrophy', false, true, '铁匠锻造'],
    ['SmallPotionTrophy', true, true, '怪物掉落、铁匠锻造']
  ];
  for (const width of [46, 70]) {
    for (const [trophyName, drop, forge, sourceLabel] of cases) {
      const card = item('WHITE', { trophyWhite: true, trophyName, chosenColor: 'GREEN' });
      const canvas = context.CardStyle.renderCard(card, width, Math.round(width * 1.45), false);
      assert.match(canvas.getAttribute('aria-label'), new RegExp('获取途径：' + sourceLabel));
      for (const [color, expected, side] of [['#0F766E', drop, 'left'], ['#B45309', forge, 'right']]) {
        const badges = canvas.context.fillPaths.filter(fill => fill.color === color);
        assert.equal(badges.length, expected ? 1 : 0, trophyName + ' ' + side);
        if (!expected) continue;
        const xs = badges[0].points.map(point => point[0]);
        const ys = badges[0].points.map(point => point[1]);
        assert.ok(side === 'left' ? Math.max(...xs) < width / 2 : Math.min(...xs) > width / 2);
        assert.ok(Math.min(...ys) > 0 && Math.max(...ys) < canvas.height / 3);
      }
    }
  }
});

test('trophy source kind participates in the bitmap cache key', () => {
  const card = item('WHITE', { trophyWhite: true, trophyName: 'FutureTrophy', trophyKind: 'drop' });
  const drop = context.CardStyle.renderCard(card, 60, 88, false);
  const forge = context.CardStyle.renderCard({ ...card, trophyKind: 'forge' }, 60, 88, false);
  assert.ok(drop.context.fills.includes('#0F766E'));
  assert.ok(forge.context.fills.includes('#B45309'));
  assert.equal(forge.context.fills.includes('#0F766E'), false);
});

test('all trophy faces keep their names and descriptions outside the card artwork', () => {
  for (const def of context.AdventureRegistry.allItems().filter(it => it.kind === 'trophyWhite')) {
    const canvas = context.CardStyle.renderCard(item('WHITE', { trophyWhite: true, trophyName: def.name }), 104, 151, false);
    assert.deepEqual(canvas.context.texts, [], def.name + ' must have no painted text');
  }
});
