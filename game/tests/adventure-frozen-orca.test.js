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
const { getBoss, applyStageMods } = (function () {
  const R = AdventureRegistry;
  const bridge = AdventureMonsterBridge;
  return { getBoss: name => R.getBoss(name), applyStageMods: bridge.applyStageMods };
})();

function numCard(value) {
  return { value, isNumberCard: true, isItemCard: false, color: 'RED', isBlack: false, isWhite: false };
}

// ===== loot 掉落测试 =====

test('FrozenOrca loot: roll 1-3 drops DivingTrophy', () => {
  for (const roll of [1, 2, 3]) {
    const result = AdventureLoot.rollMonsterDrop('ocean', 'FrozenOrca', () => (roll - 1) / 12);
    assert.equal(result.roll, roll);
    assert.equal(result.drops.length, 1);
    assert.equal(result.drops[0], 'DivingTrophy');
  }
});

test('FrozenOrca loot: roll 4-5 drops PiercingTrophy', () => {
  for (const roll of [4, 5]) {
    const result = AdventureLoot.rollMonsterDrop('ocean', 'FrozenOrca', () => (roll - 1) / 12);
    assert.equal(result.roll, roll);
    assert.equal(result.drops.length, 1);
    assert.equal(result.drops[0], 'PiercingTrophy');
  }
});

test('FrozenOrca loot: roll 6 drops HypothermiaTrophy', () => {
  const result = AdventureLoot.rollMonsterDrop('ocean', 'FrozenOrca', () => 5 / 12);
  assert.equal(result.roll, 6);
  assert.equal(result.drops.length, 1);
  assert.equal(result.drops[0], 'HypothermiaTrophy');
});

test('FrozenOrca loot: roll 7-12 drops nothing', () => {
  for (const roll of [7, 8, 9, 10, 11, 12]) {
    const result = AdventureLoot.rollMonsterDrop('ocean', 'FrozenOrca', () => (roll - 1) / 12);
    assert.equal(result.roll, roll);
    assert.equal(result.drops.length, 0);
  }
});

// ===== boss 基础属性测试 =====

test('FrozenOrca base stats', () => {
  const boss = getBoss('FrozenOrca');
  assert.ok(boss, 'FrozenOrca should be registered as a boss');
  assert.equal(boss.name, 'FrozenOrca');
  assert.equal(boss.kind, '冻洋虎鲸');
  assert.equal(boss.hp, 40);
  assert.equal(boss.attack, 3);
  assert.equal(boss.defense, 2);
  assert.equal(boss.handLimit, 3);
  assert.equal(boss.whiteZeros, 2);
});

// ===== 进攻测试 =====

test('FrozenOrca attackDamage: 1/2/3 deals 3', () => {
  const boss = getBoss('FrozenOrca');
  for (const v of [1, 2, 3]) {
    assert.equal(boss.attackDamage(numCard(v), {}), 3);
  }
});

test('FrozenOrca attackDamage: 4/5/6 deals 5', () => {
  const boss = getBoss('FrozenOrca');
  for (const v of [4, 5, 6]) {
    assert.equal(boss.attackDamage(numCard(v), {}), 5);
  }
});

test('FrozenOrca attackDamage: 0 deals 2 + 2*playerBleed', () => {
  const boss = getBoss('FrozenOrca');
  assert.equal(boss.attackDamage(numCard(0), { playerBleed: 0 }), 2);
  assert.equal(boss.attackDamage(numCard(0), { playerBleed: 1 }), 4);
  assert.equal(boss.attackDamage(numCard(0), { playerBleed: 3 }), 8);
  assert.equal(boss.attackDamage(numCard(0), {}), 2);
});

test('FrozenOrca attackGainDiving: 1/2/3 grants diving', () => {
  const boss = getBoss('FrozenOrca');
  for (const v of [1, 2, 3]) {
    assert.equal(boss.attackGainDiving(numCard(v)), true);
  }
  for (const v of [0, 4, 5, 6]) {
    assert.equal(boss.attackGainDiving(numCard(v)), false);
  }
});

test('FrozenOrca attackHypothermia: 1/2/3 applies 1 stack', () => {
  const boss = getBoss('FrozenOrca');
  for (const v of [1, 2, 3]) {
    assert.equal(boss.attackHypothermia(numCard(v)), 1);
  }
  for (const v of [0, 4, 5, 6]) {
    assert.equal(boss.attackHypothermia(numCard(v)), 0);
  }
});

test('FrozenOrca attackBleed: 4/5/6 applies 1 stack', () => {
  const boss = getBoss('FrozenOrca');
  for (const v of [4, 5, 6]) {
    assert.equal(boss.attackBleed(numCard(v)), 1);
  }
  for (const v of [0, 1, 2, 3]) {
    assert.equal(boss.attackBleed(numCard(v)), 0);
  }
});

// ===== 防御测试 =====

test('FrozenOrca defendClearDebuffs: all number cards clear debuffs', () => {
  const boss = getBoss('FrozenOrca');
  for (const v of [0, 1, 2, 3, 4, 5, 6]) {
    assert.equal(boss.defendClearDebuffs(numCard(v)), true);
  }
});

test('FrozenOrca defendBlock: 1/2/3 blocks ceil(incoming/2)', () => {
  const boss = getBoss('FrozenOrca');
  assert.equal(boss.defendBlock(numCard(1), 5), 3);
  assert.equal(boss.defendBlock(numCard(2), 4), 2);
  assert.equal(boss.defendBlock(numCard(3), 7), 4);
  assert.equal(boss.defendBlock(numCard(0), 5), 0);
  assert.equal(boss.defendBlock(numCard(4), 5), 0);
});

test('FrozenOrca defendCounter: 0 counters same damage', () => {
  const boss = getBoss('FrozenOrca');
  assert.equal(boss.defendCounter(numCard(0), 6), 6);
  assert.equal(boss.defendCounter(numCard(0), 0), 0);
  assert.equal(boss.defendCounter(numCard(1), 6), 0);
  assert.equal(boss.defendCounter(numCard(3), 6), 0);
});

// ===== stageMods 测试 =====

test('FrozenOrca stage2: hp +10 = 50', () => {
  const boss = getBoss('FrozenOrca');
  const s2 = applyStageMods(boss, 2);
  assert.equal(s2.hp, 50);
});

test('FrozenOrca stage3: attackDamage +1', () => {
  const boss = getBoss('FrozenOrca');
  const s3 = applyStageMods(boss, 3);
  assert.equal(s3.hp, 50, 'stage3 should include stage2 hp bonus');
  assert.equal(s3.attackDamage(numCard(1), {}), 4, '1/2/3 base 3 +1 = 4');
  assert.equal(s3.attackDamage(numCard(4), {}), 6, '4/5/6 base 5 +1 = 6');
  assert.equal(s3.attackDamage(numCard(0), { playerBleed: 2 }), 7, '0 base 2+4 +1 = 7');
});

test('FrozenOrca stage4: defendImmune on 0', () => {
  const boss = getBoss('FrozenOrca');
  const s4 = applyStageMods(boss, 4);
  assert.equal(s4.hp, 50, 'stage4 should include stage2 hp bonus');
  assert.equal(s4.attackDamage(numCard(1), {}), 4, 'stage4 should include stage3 damage bonus');
  assert.equal(s4.defendImmune(numCard(0)), true, 'stage4 defendImmune on 0');
  assert.equal(s4.defendImmune(numCard(1)), false, 'stage4 defendImmune only on 0');
  assert.equal(s4.defendCounter(numCard(0), 6), 6, 'stage4 still counters on 0');
  assert.equal(s4.defendClearDebuffs(numCard(0)), true, 'stage4 still clears debuffs');
});

test('FrozenOrca skill desc: attack and defend match ocean.md', () => {
  const { getAdventureNpcSkillDesc } = AdventureMonsterBridge;
  const atk123 = getAdventureNpcSkillDesc('FrozenOrca', numCard(2), false, { stage: 1 });
  assert.ok(atk123.includes('潜水'), 'attack 1/2/3 should mention diving');
  assert.ok(atk123.includes('失温'), 'attack 1/2/3 should mention hypothermia');
  assert.ok(!atk123.includes('清除自身'), 'attack should not show defend clear text');

  const atk456 = getAdventureNpcSkillDesc('FrozenOrca', numCard(5), false, { stage: 1 });
  assert.ok(atk456.includes('流血'), 'attack 4/5/6 should mention bleed');

  const atk0 = getAdventureNpcSkillDesc('FrozenOrca', numCard(0), false, { stage: 1 });
  assert.ok(atk0.includes('流血'), 'attack 0 should mention bleed-scaled damage');

  const def123 = getAdventureNpcSkillDesc('FrozenOrca', numCard(2), true, { stage: 1 });
  assert.equal(def123, '清除自身所有负面状态，格挡半数伤害（向上取整）');

  const def0 = getAdventureNpcSkillDesc('FrozenOrca', numCard(0), true, { stage: 1 });
  assert.ok(def0.includes('反击相同点伤害'), 'defend 0 should mention same-point counter');
  assert.ok(def0.includes('清除自身所有负面状态'), 'defend 0 should mention clear debuffs');
  assert.ok(!def0.includes('免疫所有伤害'), 'stage1 defend 0 should not be immune');

  const def0s4 = getAdventureNpcSkillDesc('FrozenOrca', numCard(0), true, { stage: 4 });
  assert.ok(def0s4.includes('免疫所有伤害'), 'stage4 defend 0 should be immune');
  assert.ok(def0s4.includes('清除自身所有负面状态'), 'stage4 defend 0 still clears');

  const def7 = getAdventureNpcSkillDesc('FrozenOrca', numCard(7), true, { stage: 1 });
  assert.equal(def7, '清除自身所有负面状态');
});