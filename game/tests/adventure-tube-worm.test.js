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

const { AdventureRegistry, AdventureLoot, AdventureMonsterBridge } = context;
const getMonster = name => AdventureRegistry.getMonster(name);
const { applyStageMods } = AdventureMonsterBridge;

function numCard(value) {
  return { value, isNumberCard: true, isItemCard: false, color: 'RED', isBlack: false, isWhite: false };
}

test('FrozenOceanTubeWorm base stats and pool', () => {
  const m = getMonster('FrozenOceanTubeWorm');
  assert.ok(m);
  assert.equal(m.kind, '冻洋管虫');
  assert.equal(m.hp, 25);
  assert.equal(m.handLimit, 3);
  assert.equal(m.minStage, 2);
  const pool = context.AdventureMonsterPool.ocean;
  assert.ok(pool[2].includes('FrozenOceanTubeWorm'));
  assert.ok(!pool['*'].includes('FrozenOceanTubeWorm'));
});

test('FrozenOceanTubeWorm loot: 1-2 BurnTrophy, 3-4 DivingTrophy', () => {
  for (const roll of [1, 2]) {
    const result = AdventureLoot.rollMonsterDrop('ocean', 'FrozenOceanTubeWorm', () => (roll - 1) / 12);
    assert.equal(result.roll, roll);
    assert.equal(result.drops.length, 1);
    assert.equal(result.drops[0], 'BurnTrophy');
  }
  for (const roll of [3, 4]) {
    const result = AdventureLoot.rollMonsterDrop('ocean', 'FrozenOceanTubeWorm', () => (roll - 1) / 12);
    assert.equal(result.roll, roll);
    assert.equal(result.drops.length, 1);
    assert.equal(result.drops[0], 'DivingTrophy');
  }
  for (const roll of [5, 6, 7, 8, 9, 10, 11, 12]) {
    const result = AdventureLoot.rollMonsterDrop('ocean', 'FrozenOceanTubeWorm', () => (roll - 1) / 12);
    assert.equal(result.drops.length, 0);
  }
});

test('FrozenOceanTubeWorm attack 1/2/3: damage + burn', () => {
  const m = getMonster('FrozenOceanTubeWorm');
  for (const v of [1, 2, 3]) {
    assert.equal(m.attackDamage(numCard(v)), v);
    assert.equal(m.attackBurn(numCard(v)), 1);
    assert.equal(m.attackBurnSettle(numCard(v)), false);
  }
});

test('FrozenOceanTubeWorm attack 4/5/6: burn settle, no card damage', () => {
  const m = getMonster('FrozenOceanTubeWorm');
  for (const v of [4, 5, 6]) {
    assert.equal(m.attackDamage(numCard(v)), 0);
    assert.equal(m.attackBurn(numCard(v)), 2);
    assert.equal(m.attackBurnSettle(numCard(v)), true);
  }
});

test('FrozenOceanTubeWorm defend 1/2/3: block up to 2 + diving', () => {
  const m = getMonster('FrozenOceanTubeWorm');
  for (const v of [1, 2, 3]) {
    assert.equal(m.defendBlock(numCard(v), 5), 2);
    assert.equal(m.defendBlock(numCard(v), 1), 1);
    assert.equal(m.defendGainDiving(numCard(v)), true);
  }
  assert.equal(m.defendBlock(numCard(4), 5), 0);
  assert.equal(m.defendGainDiving(numCard(4)), false);
});

test('FrozenOceanTubeWorm stage3 burn +1, stage4 block +1', () => {
  const m = getMonster('FrozenOceanTubeWorm');
  const s3 = applyStageMods(m, 3);
  assert.equal(s3.attackBurn(numCard(1)), 2);
  assert.equal(s3.attackBurn(numCard(4)), 3);
  const s4 = applyStageMods(m, 4);
  assert.equal(s4.attackBurn(numCard(1)), 2, 'stage4 keeps stage3 burn bonus');
  assert.equal(s4.defendBlock(numCard(1), 5), 3);
  assert.equal(s4.defendBlock(numCard(1), 2), 2);
});

test('FrozenOceanTubeWorm effect: 4 settles burn with immediateBuffs', () => {
  const eng = new context.Engine();
  eng.start('Ryan', 'FrozenOceanTubeWorm');
  eng.s.player.hp = 50;
  eng.s.player.burn = 0;
  const r = eng.effect('FrozenOceanTubeWorm', 4, numCard(4), eng.s.ai, eng.s.player);
  assert.equal(r.d, 0);
  assert.equal(r.immediateBuffs, true);
  assert.equal(eng.s.player.hp, 48, 'settle deals current burn stacks as damage');
  assert.equal(eng.s.player.burn, 1, 'one layer remains after settle');
});

test('FrozenOceanTubeWorm skill desc', () => {
  const { getAdventureNpcSkillDesc } = AdventureMonsterBridge;
  const atk2 = getAdventureNpcSkillDesc('FrozenOceanTubeWorm', numCard(2), false, { stage: 1 });
  assert.ok(atk2.includes('2点伤害'));
  assert.ok(atk2.includes('灼伤'));

  const atk5 = getAdventureNpcSkillDesc('FrozenOceanTubeWorm', numCard(5), false, { stage: 1 });
  assert.ok(atk5.includes('2层[灼伤]') || atk5.includes('施加2层'));
  assert.ok(atk5.includes('灼伤]结算') || atk5.includes('灼伤结算'));

  const def2 = getAdventureNpcSkillDesc('FrozenOceanTubeWorm', numCard(2), true, { stage: 1 });
  assert.ok(def2.includes('格挡至多2'));
  assert.ok(def2.includes('潜水'));

  const atk5s3 = getAdventureNpcSkillDesc('FrozenOceanTubeWorm', numCard(5), false, { stage: 3 });
  assert.ok(atk5s3.includes('3层'));
});
