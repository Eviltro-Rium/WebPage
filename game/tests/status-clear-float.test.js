const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const gameRoot = path.resolve(__dirname, '..');
const { expand } = require('./_load');
const context = vm.createContext({
  console, Math, JSON, Date,
  Image: class Image { constructor() { this.complete = true; this.naturalWidth = 1; } },
  setTimeout: () => 1,
  clearTimeout: () => {},
  performance: { now: () => 0 }
});
context.window = context;
for (const relative of expand(['characters', 'ai', 'combat', 'adventure_content'])) {
  const file = path.join(gameRoot, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

function newEngine() {
  const eng = new context.Engine();
  eng.start('Ryan', 'Pharaoh');
  eng.later = () => {};
  eng.events = [];
  return eng;
}

test('clearing debuffs emits one 清除负面状态 float on the cleared side', () => {
  const eng = newEngine();
  eng.s.ai.burn = 2;
  eng.s.ai.poison = 1;
  eng.clearDebuffs(eng.s.ai);
  const floats = eng.events.filter(e => e.type === 'buff' && e.kind === 'clearDebuffs');
  assert.equal(floats.length, 1);
  assert.equal(floats[0].desc, '清除负面状态');
  assert.equal(floats[0].who, 'ai');
  assert.deepEqual(Array.from(floats[0].removed).sort(), ['burn', 'poison']);
});

test('clearing positive buffs emits one 清除正面状态 float on the cleared side', () => {
  const eng = newEngine();
  eng.s.player.guard = 2;
  eng.s.player.fly = 1;
  eng.clearPositiveBuffs(eng.s.player);
  const floats = eng.events.filter(e => e.type === 'buff' && e.kind === 'clearBuffs');
  assert.equal(floats.length, 1);
  assert.equal(floats[0].desc, '清除正面状态');
  assert.equal(floats[0].who, 'player');
});

test('clearing with nothing to remove emits no float', () => {
  const eng = newEngine();
  eng.clearDebuffs(eng.s.ai);
  eng.clearPositiveBuffs(eng.s.player);
  assert.equal(eng.events.filter(e => e.kind === 'clearDebuffs' || e.kind === 'clearBuffs').length, 0);
});

test('Pharaoh 0 attack shows the 清除负面状态 float', () => {
  const eng = newEngine();
  eng.s.ai.burn = 2;
  const card = { value: 0, isNumberCard: true, isItemCard: false, color: 'WHITE' };
  eng.s.atkCard = card; eng.s.atkOwner = 'ai';
  eng.effect('Pharaoh', 0, card, eng.s.ai, eng.s.player);
  assert.equal(eng.events.filter(e => e.kind === 'clearDebuffs' && e.who === 'ai').length, 1);
});
