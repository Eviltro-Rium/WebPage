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
const { getMonster, applyStageMods } = (function () {
  const R = AdventureRegistry;
  const bridge = AdventureMonsterBridge;
  return { getMonster: name => R.getMonster(name), applyStageMods: bridge.applyStageMods };
})();

function numCard(value) {
  return { value, isNumberCard: true, isItemCard: false, color: 'RED', isBlack: false, isWhite: false };
}

// ===== 怪物池测试 =====

test('desert pool registers DesertBison for all stages', () => {
  const pool = context.AdventureMonsterPool.desert['*'];
  assert.ok(pool.includes('DesertBison'));
  assert.ok(getMonster('DesertBison'), 'DesertBison should be registered as a monster');
});

// ===== loot 掉落测试 =====

test('DesertBison loot: roll 1-3 drops PiercingTrophy', () => {
  for (const roll of [1, 2, 3]) {
    const result = AdventureLoot.rollMonsterDrop('desert', 'DesertBison', () => (roll - 1) / 12);
    assert.equal(result.roll, roll);
    assert.equal(result.drops.length, 1);
    assert.equal(result.drops[0], 'PiercingTrophy');
  }
});

test('DesertBison loot: roll 4 drops CritTrophy', () => {
  const result = AdventureLoot.rollMonsterDrop('desert', 'DesertBison', () => 3 / 12);
  assert.equal(result.roll, 4);
  assert.equal(result.drops.length, 1);
  assert.equal(result.drops[0], 'CritTrophy');
});

test('DesertBison loot: roll 5-12 drops nothing', () => {
  for (const roll of [5, 6, 8, 12]) {
    const result = AdventureLoot.rollMonsterDrop('desert', 'DesertBison', () => (roll - 1) / 12);
    assert.equal(result.roll, roll);
    assert.equal(result.drops.length, 0);
  }
});

// ===== 基础属性测试 =====

test('DesertBison base stats', () => {
  const m = getMonster('DesertBison');
  assert.equal(m.name, 'DesertBison');
  assert.equal(m.kind, '沙漠野牛');
  assert.equal(m.hp, 24);
  assert.equal(m.attack, 3);
  assert.equal(m.defense, 2);
});

// ===== 进攻测试 =====

test('DesertBison attackDamage: 1/2/3 deals 2*playerBleed', () => {
  const m = getMonster('DesertBison');
  for (const v of [1, 2, 3]) {
    assert.equal(m.attackDamage(numCard(v), { playerBleed: 0 }), 0);
    assert.equal(m.attackDamage(numCard(v), { playerBleed: 1 }), 2);
    assert.equal(m.attackDamage(numCard(v), { playerBleed: 3 }), 6);
    assert.equal(m.attackDamage(numCard(v), {}), 0);
  }
});

test('DesertBison attackDamage: 4/5/6 deals 2', () => {
  const m = getMonster('DesertBison');
  for (const v of [4, 5, 6]) {
    assert.equal(m.attackDamage(numCard(v), { playerBleed: 3 }), 2, '4/5/6 damage ignores bleed');
  }
});

test('DesertBison attackUnblockable: 4/5/6', () => {
  const m = getMonster('DesertBison');
  for (const v of [4, 5, 6]) {
    assert.equal(m.attackUnblockable(numCard(v)), true);
  }
  for (const v of [0, 1, 2, 3]) {
    assert.equal(m.attackUnblockable(numCard(v)), false);
  }
});

test('DesertBison attackBleed: 4/5/6 applies 1 stack', () => {
  const m = getMonster('DesertBison');
  for (const v of [4, 5, 6]) {
    assert.equal(m.attackBleed(numCard(v)), 1);
  }
  for (const v of [0, 1, 2, 3]) {
    assert.equal(m.attackBleed(numCard(v)), 0);
  }
});

test('DesertBison attackGainCrit: 4/5/6 gains 1 crit', () => {
  const m = getMonster('DesertBison');
  for (const v of [4, 5, 6]) {
    assert.equal(m.attackGainCrit(numCard(v)), 1);
  }
  for (const v of [0, 1, 2, 3]) {
    assert.equal(m.attackGainCrit(numCard(v)), 0);
  }
});

// ===== 防御测试 =====

test('DesertBison defendCounter: 1/2/3 counters card value', () => {
  const m = getMonster('DesertBison');
  assert.equal(m.defendCounter(numCard(1), 8), 1);
  assert.equal(m.defendCounter(numCard(2), 8), 2);
  assert.equal(m.defendCounter(numCard(3), 8), 3);
  for (const v of [0, 4, 5, 6, 7]) {
    assert.equal(m.defendCounter(numCard(v), 8), 0);
  }
});

test('DesertBison defendBleed: 1/2/3 applies 1 stack', () => {
  const m = getMonster('DesertBison');
  for (const v of [1, 2, 3]) {
    assert.equal(m.defendBleed(numCard(v)), 1);
  }
  for (const v of [0, 4, 5, 6, 7]) {
    assert.equal(m.defendBleed(numCard(v)), 0);
  }
});

// ===== stageMods 测试 =====

test('DesertBison stage2: hp +6 = 30', () => {
  const m = getMonster('DesertBison');
  const s2 = applyStageMods(m, 2);
  assert.equal(s2.hp, 30);
});

test('DesertBison stage3: 1/2/3 deals 3*playerBleed', () => {
  const m = getMonster('DesertBison');
  const s3 = applyStageMods(m, 3);
  assert.equal(s3.hp, 30, 'stage3 should include stage2 hp bonus');
  assert.equal(s3.attackDamage(numCard(1), { playerBleed: 1 }), 3, '1/2/3 base 2 -> 3 per bleed');
  assert.equal(s3.attackDamage(numCard(3), { playerBleed: 2 }), 6);
  assert.equal(s3.attackDamage(numCard(4), { playerBleed: 3 }), 2, '4/5/6 unchanged');
});

test('DesertBison stage4: defendBleed applies 2 stacks', () => {
  const m = getMonster('DesertBison');
  const s4 = applyStageMods(m, 4);
  assert.equal(s4.hp, 30, 'stage4 should include stage2 hp bonus');
  assert.equal(s4.defendBleed(numCard(2)), 2, 'defendBleed +1 = 2');
  assert.equal(s4.defendCounter(numCard(2), 8), 2, 'counter unchanged');
  assert.equal(s4.attackDamage(numCard(1), { playerBleed: 1 }), 3, 'attack unchanged');
});

// ===== 技能说明测试 =====

test('DesertBison skill desc: attack and defend match desert.md', () => {
  const { getAdventureNpcSkillDesc } = AdventureMonsterBridge;

  const atk123 = getAdventureNpcSkillDesc('DesertBison', numCard(2), false, { stage: 1 });
  assert.ok(atk123.includes('玩家[流血]层数×2'), 'attack 1/2/3 should scale with bleed x2');
  assert.ok(!atk123.includes('不可防御'), 'attack 1/2/3 should be blockable');

  const atk123s3 = getAdventureNpcSkillDesc('DesertBison', numCard(2), false, { stage: 3 });
  assert.ok(atk123s3.includes('玩家[流血]层数×3'), 'stage3 attack scales with bleed x3');

  const atk456 = getAdventureNpcSkillDesc('DesertBison', numCard(5), false, { stage: 1 });
  assert.ok(atk456.includes('2点伤害'), 'attack 4/5/6 deals 2');
  assert.ok(atk456.includes('不可防御'), 'attack 4/5/6 should be unblockable');
  assert.ok(atk456.includes('流血'), 'attack 4/5/6 should apply bleed');
  assert.ok(atk456.includes('暴击'), 'attack 4/5/6 should gain crit');

  const def123 = getAdventureNpcSkillDesc('DesertBison', numCard(2), true, { stage: 1 });
  assert.ok(def123.includes('反击'), 'defend 1/2/3 should counter');
  assert.ok(def123.includes('2'), 'counter should show card value');
  assert.ok(def123.includes('流血'), 'defend 1/2/3 should apply bleed');

  const def123s4 = getAdventureNpcSkillDesc('DesertBison', numCard(2), true, { stage: 4 });
  assert.ok(def123s4.includes('2层[流血]'), 'stage4 defend bleed becomes 2 stacks');
});