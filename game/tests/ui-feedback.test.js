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
for (const name of ['ui.js', 'ui_feedback.js']) {
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

test('plain monster damage uses a hit event without a redundant floating text', async () => {
  const { ui, floating, hits } = feedbackHarness();

  await ui._playEvents([{ type: 'hit', desc: '受到4点伤害', who: 'enemy', amount: 4 }], true);

  assert.deepEqual(floating, []);
  assert.deepEqual(hits, [['ai', 4]]);
});

test('legacy plain player damage stays label-free but still plays hit feedback', async () => {
  const { ui, floating, hits } = feedbackHarness();

  await ui._playEvents([{ type: 'hurt', desc: '-3[伤害]', who: 'player', amount: 3 }], true);

  assert.equal(floating.length, 0);
  assert.deepEqual(hits, [['player', 3]]);
});

test('status damage keeps its semantic floating text', async () => {
  const { ui, floating, hits } = feedbackHarness();

  await ui._playEvents([{ type: 'hurt', desc: '-2[流血]', who: 'enemy', amount: 2, bleed: true }], true);

  assert.deepEqual(floating, [['-2[流血]', '#cc2222', 'ai']]);
  assert.deepEqual(hits, [['ai', 2]]);
});

test('second monster receives feedback in its own UI lane', async () => {
  const { ui, floating, hits } = feedbackHarness();

  await ui._playEvents([{ type: 'hit', desc: '受到5点伤害', who: 'ai2', amount: 5 }], true);

  assert.deepEqual(floating, []);
  assert.deepEqual(hits, [['ai2', 5]]);
});
