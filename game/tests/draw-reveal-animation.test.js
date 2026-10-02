const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Fake-DOM harness for draw / judgment-reveal / discard flights.
// Reproduces the reported symptom class: flights anchored to the wrong
// element (deck instead of hand), innocent hand cards hidden/removed by
// stale positional indexes, and hands repainted without draw masking.

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.id = '';
    this.textContent = '';
    this._innerHTML = '';
    this._listeners = {};
  }
  get classList() {
    const self = this;
    return {
      add(...cls) {
        const set = new Set(self.className.split(' ').filter(Boolean));
        cls.forEach(c => set.add(c));
        self.className = [...set].join(' ');
      },
      remove(...cls) {
        const set = new Set(self.className.split(' ').filter(Boolean));
        cls.forEach(c => set.delete(c));
        self.className = [...set].join(' ');
      },
      contains(c) { return self.className.split(' ').includes(c); },
      toggle(c, force) {
        const has = self.className.split(' ').includes(c);
        const on = force === undefined ? !has : !!force;
        if (on && !has) self.className = (self.className + ' ' + c).trim();
        if (!on && has) self.className = self.className.split(' ').filter(x => x !== c).join(' ');
        return on;
      }
    };
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) {
    this._innerHTML = String(v);
    this.children.forEach(c => { c.parentNode = null; });
    this.children = [];
  }
  get lastElementChild() { return this.children.length ? this.children[this.children.length - 1] : null; }
  get isConnected() { return true; }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parentNode = null;
    return child;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  setAttribute() {}
  getAttribute() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 50, height: 70 }; }
  querySelectorAll(sel) { return queryAll(this, sel); }
  querySelector(sel) { return queryAll(this, sel)[0] || null; }
}

function matchToken(el, token) {
  if (token.startsWith('#')) return el.id === token.slice(1);
  if (token.startsWith('.')) return el.className.split(' ').includes(token.slice(1));
  const m = token.match(/^\[data-index="(\d+)"\]$/);
  if (m) return String(el.dataset.index) === m[1];
  if (token === '*') return true;
  return true;
}

function queryAll(root, selector) {
  const tokens = String(selector).split(' ').filter(Boolean);
  let sets = [root];
  for (const token of tokens) {
    const next = [];
    const walk = (el) => {
      for (const child of el.children) {
        if (matchToken(child, token)) next.push(child);
        walk(child);
      }
    };
    sets.forEach(walk);
    sets = next;
  }
  return sets;
}

function makeDocument() {
  const body = new FakeEl('body');
  const byId = {};
  const doc = {
    body,
    createElement: (tag) => new FakeEl(tag),
    getElementById: (id) => byId[id] || null,
    querySelector: (sel) => queryAll(body, sel)[0] || null,
    querySelectorAll: (sel) => queryAll(body, sel),
  };
  for (const id of ['player-hand', 'ai-hand', 'ai2-hand', 'atk-cards', 'def-cards',
    'reveal-cards', 'reveal-desc', 'atk-desc', 'def-desc', 'action-desc',
    'discard-top', 'deck-area']) {
    const el = new FakeEl('div');
    el.id = id;
    byId[id] = el;
    body.appendChild(el);
  }
  return doc;
}

let nowMs = 0;
const context = vm.createContext({
  console,
  Math,
  JSON,
  Date,
  Image: class Image {},
  setTimeout: fn => { fn(); return 1; },
  clearTimeout: () => {},
  performance: { now: () => nowMs },
  requestAnimationFrame: (fn) => { nowMs += 16; fn(nowMs); return 1; },
});
context.window = context;
context.document = makeDocument();
context.document.defaultView = context;

const uiDir = path.resolve(__dirname, '..', 'js', 'ui');
const uiFiles = ['ui_core.js',
  'render/particles.js', 'render/home_screen.js', 'render/combat_screen.js',
  'render/status_render.js', 'render/hand_render.js', 'render/adventure_bar.js',
  'render/zone_render.js',
  'feedback.js', 'renderer.js', 'events.js', 'controls.js'];
for (const name of uiFiles) {
  const file = path.join(uiDir, name);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

// Deterministic card faces with stable identity for the harness.
context.renderCard = (card, w, h) => {
  const el = context.document.createElement('canvas');
  el.className = 'card-canvas';
  if (card) el.dataset.cardId = context.cardId(card);
  return el;
};
context.renderCardBack = () => {
  const el = context.document.createElement('canvas');
  el.className = 'card-canvas';
  return el;
};

function card(uid, color = 'RED', value = 1) {
  return { uid, color, value, isNumberCard: true, isItemCard: false, isBlack: false, isWhite: false };
}

function harness() {
  const doc = context.document;
  // Reset shared ids between tests.
  for (const id of ['player-hand', 'ai-hand', 'ai2-hand', 'reveal-cards']) {
    doc.getElementById(id).innerHTML = '';
  }
  const ui = Object.create(context.GameUI.prototype);
  const animCalls = [];
  ui.anim = {
    drawCards: async (count, isPlayer, target) => { animCalls.push({ op: 'draw', count, isPlayer, target: target && target.id }); },
    discardCard: async (c, fromEl, toEl) => { animCalls.push({ op: 'discard', from: fromEl && fromEl.id, fromClass: fromEl && fromEl.className, to: toEl && toEl.id }); },
    flyCard: async () => { animCalls.push({ op: 'fly' }); },
    flyCardBack: async () => { animCalls.push({ op: 'flyBack' }); },
    swapHands: async () => { animCalls.push({ op: 'swap' }); },
  };
  ui.state = {
    player: { name: 'Ryan' }, ai: { name: 'Saiki', alive: true }, ai2: { name: 'Otto', alive: true },
    phase: 'PLAYER_PLAY', selectedCard: -1, selectedCards: [],
    playerHand: [], aiHandSize: 0,
  };
  ui._prevState = null;
  ui._animatingPlayerCardKey = '';
  ui._drawAnimationRemaining = null;
  ui._npcHandFocusIndex = -1;
  ui._lastAnimatedAIDefenseKey = null;
  ui._isConsumingEvents = false;
  const renders = { player: 0, ai: 0 };
  const basePlayer = ui._renderPlayerHand.bind(ui);
  ui._renderPlayerHand = (opts) => { renders.player++; return basePlayer(opts); };
  ui._updateHpBar = () => {};
  ui._updateBuffs = () => {};
  ui._eventTarget = (evt, fallback = 'player') => {
    const t = (evt && (evt.target || evt.who)) || fallback;
    return t === 'ai2' ? 'ai2' : t === 'ai' ? 'ai' : 'player';
  };
  ui.playFloatingText = () => {};
  ui._playHitFeedback = () => {};
  ui.shakeScreen = () => {};
  ui.burstParticles = () => {};
  return { ui, doc, animCalls, renders };
}

function paintHand(doc, id, cards) {
  const el = doc.getElementById(id);
  el.innerHTML = '';
  cards.forEach((c, i) => {
    const cv = context.renderCard(c, 40, 58);
    cv.dataset.index = i;
    el.appendChild(cv);
  });
  return el;
}

test('hand-sourced judgment reveal anchors to the player hand, not the deck', async () => {
  const { ui, doc, animCalls } = harness();
  // Ryan 5 style: followup card already spliced from state AND repainted out
  // of the DOM before the reveal plays. The stale index now points at an
  // innocent card that must not flicker (hide) mid-flight.
  const judged = card('judge-1', 'RED', 5);
  const innocent = card('other-2', 'BLUE', 2);
  ui.state.playerHand = [innocent];
  ui._prevState = { selectedCard: 0 };
  paintHand(doc, 'player-hand', [innocent]);
  const innocentEl = doc.getElementById('player-hand').children[0];
  const writes = [];
  const styleTarget = innocentEl.style;
  Object.defineProperty(innocentEl, 'style', {
    value: new Proxy(styleTarget, {
      set(t, p, v) { if (p === 'visibility') writes.push(v); t[p] = v; return true; },
    }),
  });
  ui._drawAnimationRemaining = { player: 0, ai: 0, ai2: 0 };

  await ui._playEvents([{
    id: 1, type: 'reveal', card: judged, who: 'player', from: 'hand', fromOwner: 'player', handIndex: 0,
    desc: 'Ryan 5牌追加',
  }], true);

  assert.equal(doc.getElementById('reveal-cards').children.length, 1);
  assert.deepEqual(writes, []);
  const handKids = doc.getElementById('player-hand').children;
  assert.equal(handKids.length, 1);
  assert.equal(handKids[0].dataset.cardId, context.cardId(innocent));
});

test('opponent-hand steal reveal preserves the innocent NPC card', async () => {
  const { ui, doc } = harness();
  // Leon 0 / steal style: the stolen card already left authoritative state,
  // and the NPC hand DOM was repainted post-splice before the reveal plays.
  // The shifted innocent card at the stale index must not be hidden/removed.
  const stolen = card('stolen-9', 'GREEN', 4);
  const next = card('next-3', 'YELLOW', 1);
  const third = card('third-4', 'BLUE', 2);
  ui.state.isAdventure = true;
  ui.state.aiHand = [next, third];
  ui.state.aiHandSize = 2;
  paintHand(doc, 'ai-hand', [next, third]);
  ui._drawAnimationRemaining = { player: 0, ai: 0, ai2: 0 };

  await ui._playEvents([{
    id: 2, type: 'reveal', card: stolen, who: 'ai', from: 'hand', fromOwner: 'ai', handIndex: 0,
    desc: '抽取对手手牌判定',
  }], true);

  assert.equal(doc.getElementById('reveal-cards').children.length, 1);
  const handKids = doc.getElementById('ai-hand').children;
  assert.equal(handKids.length, 2);
  assert.equal(handKids[0].dataset.cardId, context.cardId(next));
  assert.notEqual(handKids[0].style.visibility, 'hidden');
});

test('discard with a stale hand index keeps the innocent card and repaints', async () => {
  const { ui, doc, renders } = harness();
  // Discarded card already gone from state; the positional index now points
  // at an innocent card. It must not be removed; the hand must repaint.
  const gone = card('gone-5', 'RED', 3);
  const innocent = card('keep-6', 'BLUE', 1);
  ui.state.playerHand = [innocent];
  paintHand(doc, 'player-hand', [gone, innocent].map((c, i) => {
    c._i = i;
    return c;
  }));
  // Re-tag painted indexes to mimic a pre-splice paint.
  doc.getElementById('player-hand').children.forEach((el, i) => { el.dataset.index = i; });
  const before = renders.player;
  ui._drawAnimationRemaining = { player: 0, ai: 0, ai2: 0 };

  await ui._playEvents([{
    id: 3, type: 'discard', card: gone, who: 'player', handIndex: 0,
    desc: '弃牌', destination: 'bottom',
  }], true);

  const handKids = doc.getElementById('player-hand').children;
  assert.ok(handKids.some(el => el.dataset.cardId === context.cardId(innocent)));
  assert.ok(renders.player > before);
});

test('exact identity match still consumes the source element', async () => {
  const { ui, doc } = harness();
  // When the DOM still holds the real card (nothing spliced yet), the
  // flight consumes that element exactly like before.
  const real = card('real-7', 'RED', 2);
  ui.state.playerHand = [real];
  paintHand(doc, 'player-hand', [real]);
  ui._drawAnimationRemaining = { player: 0, ai: 0, ai2: 0 };

  await ui._playEvents([{
    id: 4, type: 'reveal', card: real, who: 'player', from: 'hand', fromOwner: 'player', handIndex: 0,
    desc: '判定',
  }], true);

  assert.equal(doc.getElementById('reveal-cards').children.length, 1);
});
