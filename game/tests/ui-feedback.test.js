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
  performance: { now: () => 0 }
});
context.window = context;

const uiDir = path.resolve(__dirname, '..', 'js');
for (const name of ['ui.js', 'ui_feedback.js', 'ui_renderer.js', 'ui_events.js', 'ui_controls.js']) {
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

  assert.deepEqual(floating, [['-2[流血]', '#cc2222', 'ai']]);
  assert.deepEqual(hits, [['ai', 2]]);
});

test('second monster target field receives feedback in its own UI lane', async () => {
  const { ui, floating, hits } = feedbackHarness();

  await ui._playEvents([{ type: 'hit', desc: '受到5点伤害', target: 'ai2', amount: 5 }], true);

  assert.deepEqual(floating, [['-5', '#ff4444', 'ai2']]);
  assert.deepEqual(hits, [['ai2', 5]]);
});
