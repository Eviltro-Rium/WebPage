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

const sources = expand(['characters', 'ai', 'combat', 'adventure_content']).concat([
  'adventure/js/engine/loot.js',
  'adventure/js/content/stage_guide.js'
]);
for (const relative of sources) {
  const file = path.join(gameRoot, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { AdventureRegistry, AdventureMonsterBridge, Engine } = context;
const { applyStageMods } = AdventureMonsterBridge;
const getBoss = name => AdventureRegistry.getBoss(name);

function stagedEngine(t, stage = 1) {
  const base = getBoss('ForestPython');
  AdventureMonsterBridge.registerMonsterChar(applyStageMods(base, stage));
  t.after(() => AdventureMonsterBridge.registerMonsterChar(base));
  const eng = new Engine();
  eng.start('Ryan', 'ForestPython');
  eng.later = () => {};
  eng.s.isAdventure = true;
  return eng;
}

function numCard(value, color = 'RED') {
  return { value, isNumberCard: true, isItemCard: false, color, isBlack: false, isWhite: false };
}

test('ForestPython base stats', () => {
  const m = getBoss('ForestPython');
  assert.ok(m);
  assert.equal(m.kind, '缠枝巨蟒');
  assert.equal(m.hp, 30);
  assert.equal(m.whiteZeros, 1);
  assert.equal(m.handLimit, 3);
  assert.equal(m.icon, '../icons/npc_icons/forest_python.webp');
});

test('ForestPython 3/4/0 attackDamage uses current (after-apply) poison stacks', () => {
  const m = getBoss('ForestPython');
  assert.equal(m.attackDamage(numCard(5), { playerPoison: 0 }), 0);
  assert.equal(m.attackDamage(numCard(4), { playerPoison: 0 }), 0);
  assert.equal(m.attackDamage(numCard(0), { playerPoison: 0 }), 0);
  assert.equal(m.attackDamage(numCard(3), { playerPoison: 0 }), 0);
  assert.equal(m.attackDamage(numCard(3), { playerPoison: 1 }), 3);
  assert.equal(m.attackDamage(numCard(0), { playerPoison: 1 }), 3);
  assert.equal(m.attackDamage(numCard(3), { playerPoison: 2 }), 6);
  assert.equal(m.attackDamage(numCard(4), { playerPoison: 2 }), 6);
  assert.equal(m.attackDamage(numCard(0), { playerPoison: 2 }), 6);
  assert.equal(m.attackDamage(numCard(3), { playerPoison: 3 }), 6);
});

test('ForestPython 1/2 deal two without poison; only 0/3/4 apply poison', () => {
  const m = getBoss('ForestPython');
  assert.equal(m.attackDamage(numCard(1), { playerPoison: 2 }), 2);
  assert.equal(m.attackDamage(numCard(2), { playerPoison: 2 }), 2);
  for (const v of [0, 3, 4]) {
    assert.equal(m.attackPoison(numCard(v)), 1, 'attackPoison ' + v);
  }
  assert.equal(m.attackPoison(numCard(2)), 0);
  assert.equal(m.attackUnblockable(numCard(0)), true);
  assert.equal(m.attackUnblockable(numCard(3)), false);
});

test('ForestPython defendPoison on 1/2/0; defendCounter is half incoming', () => {
  const m = getBoss('ForestPython');
  for (const v of [1, 2]) {
    assert.equal(m.defendPoison(numCard(v)), 1);
    assert.equal(m.defendCounter(numCard(v), 5), 3);
    assert.equal(m.defendCounter(numCard(v), 6), 3);
  }
  assert.equal(m.defendPoison(numCard(0)), 1);
  assert.equal(m.defendPoison(numCard(4)), 0);
  assert.equal(m.defendCounter(numCard(0), 5), 0);
  assert.equal(m.defendSplit(numCard(0)), true);
});

test('ForestPython attackDrawSelf when player has exactly one poison stack', () => {
  const m = getBoss('ForestPython');
  assert.equal(m.attackDrawSelf(numCard(2), { playerPoison: 2 }), 0);
  assert.equal(m.attackDrawSelf(numCard(2), { playerPoison: 1 }), 1);
  assert.equal(m.attackDrawSelf(numCard(2), { playerPoison: 0 }), 0);
  assert.equal(m.attackDrawSelf(numCard(3), { playerPoison: 1 }), 0);
});

test('ForestPython stage3: +1 only for 0/1/2; 3/4 unchanged', () => {
  const m = getBoss('ForestPython');
  const s3 = applyStageMods(m, 3);
  assert.equal(s3.attackDamage(numCard(3), { playerPoison: 2 }), 6);
  assert.equal(s3.attackDamage(numCard(3), { playerPoison: 0 }), 0);
  assert.equal(s3.attackDamage(numCard(3), { playerPoison: 1 }), 3);
  assert.equal(s3.attackDamage(numCard(2), { playerPoison: 0 }), 3);
  assert.equal(s3.attackDamage(numCard(1), { playerPoison: 0 }), 3);
  assert.equal(s3.attackDamage(numCard(0), { playerPoison: 0 }), 1);
  assert.equal(s3.attackDamage(numCard(0), { playerPoison: 1 }), 4);
  assert.equal(s3.attackDamage(numCard(0), { playerPoison: 2 }), 7);
});

test('ForestPython stage4: defense heals one and leaves counters unchanged', () => {
  const m = getBoss('ForestPython');
  const s4 = applyStageMods(m, 4);
  assert.equal(s4.defendCounter(numCard(1), 5), 3);
  assert.equal(s4.defendCounter(numCard(2), 4), 2);
  assert.equal(s4.defendCounter(numCard(0), 5), 0);
  assert.equal(s4.defendHeal(numCard(0)), 1);
  assert.equal(s4.defendHeal(numCard(2)), 1);
});

test('ForestPython 3 via effect: poison applied early then damage 3 from 0 stacks', (t) => {
  const eng = stagedEngine(t, 1);
  eng.s.player.poison = 0;
  const r = eng.effect('ForestPython', 3, numCard(3), eng.s.ai, eng.s.player);
  assert.equal(r.d, 3, 'preview uses after-apply poison=1');
  const pending = eng.s.pendingSkillStatuses || [];
  assert.ok(pending.some(e => e.id === 'poison' && e.target === 'player'), 'poison queued beforeDamage');
});

test('ForestPython 0 via effect: poison 1→2 then damage 6; settlement live matches', (t) => {
  const eng = stagedEngine(t, 1);
  eng.s.player.poison = 1;
  const card = numCard(0);
  eng.s.atkCard = card;
  eng.s.atkOwner = 'ai';
  const r = eng.effect('ForestPython', 0, card, eng.s.ai, eng.s.player);
  assert.equal(r.d, 6, 'preview with after-apply poison=2');
  eng.s.pendingAttack = { damage: r.d, unblock: true };
  const amount = eng.prepareAttackSettlement(r.d, 'player');
  assert.equal(eng.s.player.poison, 2, 'beforeDamage committed poison');
  assert.equal(amount, 6, 'settlement live damage matches preview (no double-count)');
});

test('ForestPython 3 at poison cap: still 6, no phantom 3rd stack', (t) => {
  const eng = stagedEngine(t, 1);
  eng.s.player.poison = 2;
  const card = numCard(3);
  eng.s.atkCard = card;
  eng.s.atkOwner = 'ai';
  const r = eng.effect('ForestPython', 3, card, eng.s.ai, eng.s.player);
  assert.equal(r.d, 6);
  eng.s.pendingAttack = { damage: r.d };
  const amount = eng.prepareAttackSettlement(r.d, 'player');
  assert.equal(eng.s.player.poison, 2);
  assert.equal(amount, 6, 'must not deal 9 from uncapped poison+1');
});