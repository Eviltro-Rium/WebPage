const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const gameRoot = path.resolve(__dirname, '..');
const { expand } = require('./_load');
const context = vm.createContext({
  console,
  Math,
  JSON,
  Date,
  Image: class Image {
    constructor() {
      this.complete = true;
      this.naturalWidth = 1;
    }
  },
  setTimeout: () => 1,
  clearTimeout: () => {},
  performance: { now: () => 0 }
});
context.window = context;

const sources = expand(['characters', 'ai', 'combat', 'adventure_content']).concat([
  'adventure/js/engine/loot.js'
]);

for (const relative of sources) {
  const file = path.join(gameRoot, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { AdventureRegistry, AdventureLoot, AdventureMonsterBridge, Engine } = context;
const getMonster = name => AdventureRegistry.getMonster(name);
const { applyStageMods } = AdventureMonsterBridge;

function numCard(value, color = 'RED') {
  return { value, isNumberCard: true, isItemCard: false, color, isBlack: false, isWhite: false };
}

test('DesertCamel base stats and pool', () => {
  const m = getMonster('DesertCamel');
  assert.ok(m);
  assert.equal(m.kind, '沙漠骆驼');
  assert.equal(m.hp, 20);
  assert.equal(m.firstStrike, true);
  assert.equal(m.icon, '../icons/npc_icons/desert_camel.webp');
  const pool = context.AdventureMonsterPool.desert;
  assert.ok(pool['*'].includes('DesertBison'));
  assert.ok(pool['*'].includes('DesertCamel'));
});

test('DesertCamel loot: 1-2 sandblind, 3-4 thorns', () => {
  for (const roll of [1, 2]) {
    const result = AdventureLoot.rollMonsterDrop('desert', 'DesertCamel', () => (roll - 1) / 12);
    assert.equal(result.roll, roll);
    assert.equal(result.drops.length, 1);
    assert.equal(result.drops[0], 'SandblindTrophy');
  }
  for (const roll of [3, 4]) {
    const result = AdventureLoot.rollMonsterDrop('desert', 'DesertCamel', () => (roll - 1) / 12);
    assert.equal(result.roll, roll);
    assert.equal(result.drops.length, 1);
    assert.equal(result.drops[0], 'ThornsTrophy');
  }
  for (const roll of [5, 6, 7, 8, 9, 10, 11, 12]) {
    const result = AdventureLoot.rollMonsterDrop('desert', 'DesertCamel', () => (roll - 1) / 12);
    assert.equal(result.drops.length, 0);
  }
});

test('DesertCamel attack hooks', () => {
  const m = getMonster('DesertCamel');
  for (const v of [1, 2, 3]) {
    assert.equal(m.attackDamage(numCard(v)), 3);
    assert.equal(m.attackSandblind(numCard(v)), 2);
    assert.equal(m.attackThorns(numCard(v)), 0);
  }
  for (const v of [4, 5, 6]) {
    assert.equal(m.attackDamage(numCard(v)), 5);
    assert.equal(m.attackSandblind(numCard(v)), 0);
    assert.equal(m.attackThorns(numCard(v)), 1);
  }
});

test('DesertCamel defend 1/2/3: half block, thorns only at stage 4', () => {
  const m = getMonster('DesertCamel');
  assert.equal(m.defendBlock(numCard(2), 8), 4);
  assert.equal(m.defendBlock(numCard(2), 5), 3);
  assert.equal(m.defendBlock(numCard(5), 8), 0);
  assert.equal(typeof m.defendThorns, 'undefined');
  const s4 = applyStageMods(m, 4);
  assert.equal(s4.defendThorns(numCard(2)), 1);
  assert.equal(s4.defendThorns(numCard(5)), 0);
});

test('DesertCamel stage mods', () => {
  const m = getMonster('DesertCamel');
  const s2 = applyStageMods(m, 2);
  assert.equal(s2.hp, 25);
  const s3 = applyStageMods(m, 3);
  assert.equal(s3.attackDamage(numCard(2)), 4);
  assert.equal(s3.attackDamage(numCard(5)), 5);
  const s4 = applyStageMods(m, 4);
  assert.equal(s4.attackDamage(numCard(2)), 4, 'stage4 keeps stage3 damage bonus');
});

test('DesertCamel 1/2/3: damage 3 and 2 sandblind on target', () => {
  const eng = new Engine();
  eng.start('Ryan', 'DesertCamel');
  eng.later = () => {};
  const r = eng.effect('DesertCamel', 2, numCard(2), eng.s.ai, eng.s.player);
  assert.equal(r.d, 3);
  eng.prepareAttackSettlement(r.d, 'player');
  eng.commitAttackStatuses('afterDamage');
  assert.equal(eng.s.player.sandblind, 2);
  assert.equal(eng.s.player.thorns || 0, 0);
});

test('DesertCamel 4/5/6: damage 5 and thorns on target', () => {
  const eng = new Engine();
  eng.start('Ryan', 'DesertCamel');
  eng.later = () => {};
  const r = eng.effect('DesertCamel', 5, numCard(5), eng.s.ai, eng.s.player);
  assert.equal(r.d, 5);
  eng.prepareAttackSettlement(r.d, 'player');
  eng.commitAttackStatuses('afterDamage');
  assert.equal(eng.s.player.thorns, 1);
});

test('DesertCamel skill desc', () => {
  const { getAdventureNpcSkillDesc } = AdventureMonsterBridge;
  const atk2 = getAdventureNpcSkillDesc('DesertCamel', numCard(2), false, { stage: 1 });
  assert.ok(atk2.includes('3点'));
  assert.ok(atk2.includes('沙盲'));
  const atk5 = getAdventureNpcSkillDesc('DesertCamel', numCard(5), false, { stage: 1 });
  assert.ok(atk5.includes('5点'));
  assert.ok(atk5.includes('荆棘'));
  const atk2s3 = getAdventureNpcSkillDesc('DesertCamel', numCard(2), false, { stage: 3 });
  assert.ok(atk2s3.includes('4点'));
  const def2 = getAdventureNpcSkillDesc('DesertCamel', numCard(2), true, { stage: 1 });
  assert.ok(def2.includes('半数'));
  const def2s4 = getAdventureNpcSkillDesc('DesertCamel', numCard(2), true, { stage: 4 });
  assert.ok(def2s4.includes('荆棘'));
});
