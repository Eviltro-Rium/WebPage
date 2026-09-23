const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({
  console,
  Math,
  JSON,
  Date,
  Image: class Image {},
  setTimeout: fn => { fn(); return 1; },
  clearTimeout: () => {},
  performance: { now: () => 0 },
  document: {
    getElementById: () => null,
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {} }),
    body: { appendChild() {} }
  }
});
context.window = context;
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

function feedbackHarness() {
  const ui = Object.create(context.GameUI.prototype);
  const floating = [];
  const hits = [];
  ui.state = { player: {}, ai: {}, ai2: {} };
  ui.playFloatingText = (...args) => floating.push(args);
  ui._playHitFeedback = (...args) => hits.push(args);
  ui._updateHpBar = () => {};
  ui._updateBuffs = () => {};
  ui.shakeScreen = () => {};
  ui.burstParticles = () => {};
  return { ui, floating, hits };
}

test('plain monster damage uses a hit event and displays concise damage text', async () => {
  const { ui, floating, hits } = feedbackHarness();

  await ui._playEvents([{ type: 'hit', desc: '受到4点伤害', who: 'enemy', amount: 4 }], true);

  assert.deepEqual(floating, [['-4', '#ff4444', 'ai']]);
  assert.deepEqual(hits, [['ai', 4]]);
});

test('legacy plain player damage displays concise text and still plays hit feedback', async () => {
  const { ui, floating, hits } = feedbackHarness();

  await ui._playEvents([{ type: 'hurt', desc: '-3[伤害]', who: 'player', amount: 3 }], true);

  assert.deepEqual(floating, [['-3', '#ff4444', 'player']]);
  assert.deepEqual(hits, [['player', 3]]);
});

test('status damage keeps its semantic floating text', async () => {
  const { ui, floating, hits } = feedbackHarness();

  await ui._playEvents([{ type: 'hurt', desc: '-2[流血]', who: 'enemy', amount: 2, bleed: true }], true);

  assert.deepEqual(floating, [['-2❤️[流血]', '#cc2222', 'ai']]);
  assert.deepEqual(hits, [['ai', 2]]);
});

test('burn settle float uses red HP loss heart marker', async () => {
  const { ui, floating } = feedbackHarness();

  await ui._playEvents([{ type: 'burnSettle', desc: '-3[灼烧]，-1[灼烧层数]', who: 'player', amount: 3 }], true);

  assert.deepEqual(floating, [['-3❤️[灼烧]，-1[灼烧层数]', '#ff8800', 'player']]);
});

test('parseSegments colors -n❤️ red while keeping status tag color', () => {
  const segs = JSON.parse(JSON.stringify(context.parseSegments('-3❤️[灼烧]，-1[灼烧层数]', '#ff8800')));
  assert.deepEqual(segs, [
    { text: '-3❤️', color: '#ff4444' },
    { text: '[灼烧]', color: '#fdba74' },
    { text: '，-1', color: '#ff8800' },
    { text: '[灼烧层数]', color: '#fdba74' }
  ]);
});

test('second monster target field receives feedback in its own UI lane', async () => {
  const { ui, floating, hits } = feedbackHarness();

  await ui._playEvents([{ type: 'hit', desc: '受到5点伤害', target: 'ai2', amount: 5 }], true);

  assert.deepEqual(floating, [['-5', '#ff4444', 'ai2']]);
  assert.deepEqual(hits, [['ai2', 5]]);
});
