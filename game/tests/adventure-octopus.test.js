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
const { Engine } = context;
const getMonster = name => AdventureRegistry.getMonster(name);
const { applyStageMods } = AdventureMonsterBridge;

function numCard(value, color = 'RED') {
  return { value, isNumberCard: true, isItemCard: false, color, isBlack: false, isWhite: false };
}

function blackCard() {
  return { value: -1, isNumberCard: false, isItemCard: true, color: 'BLACK', isBlack: true, isWhite: false };
}

test('FrozenOceanOctopus base stats and pool', () => {
  const m = getMonster('FrozenOceanOctopus');
  assert.ok(m);
  assert.equal(m.kind, '冻洋章鱼');
  assert.equal(m.hp, 24);
  const pool = context.AdventureMonsterPool.ocean;
  for (const stage of ['*', 2, 3, 4]) {
    assert.ok(pool[stage].includes('FrozenOceanOctopus'), 'stage ' + stage);
  }
});

test('FrozenOceanOctopus loot: 1-2 diving, 3-4 small potion', () => {
  for (const roll of [1, 2]) {
    const result = AdventureLoot.rollMonsterDrop('ocean', 'FrozenOceanOctopus', () => (roll - 1) / 12);
    assert.equal(result.roll, roll);
    assert.equal(result.drops.length, 1);
    assert.equal(result.drops[0], 'DivingTrophy');
  }
  for (const roll of [3, 4]) {
    const result = AdventureLoot.rollMonsterDrop('ocean', 'FrozenOceanOctopus', () => (roll - 1) / 12);
    assert.equal(result.roll, roll);
    assert.equal(result.drops.length, 1);
    assert.equal(result.drops[0], 'SmallPotionTrophy');
  }
  for (const roll of [5, 6, 7, 8, 9, 10, 11, 12]) {
    const result = AdventureLoot.rollMonsterDrop('ocean', 'FrozenOceanOctopus', () => (roll - 1) / 12);
    assert.equal(result.drops.length, 0);
  }
});

test('FrozenOceanOctopus attack hooks', () => {
  const m = getMonster('FrozenOceanOctopus');
  for (const v of [4, 5, 6]) {
    assert.equal(m.attackDamage(numCard(v)), 4);
    assert.equal(m.attackOctopusJudge(numCard(v)), false);
    assert.equal(m.attackGainDiving(numCard(v)), true);
  }
  for (const v of [1, 2, 3]) {
    assert.equal(m.attackDamage(numCard(v)), 0);
    assert.equal(m.attackOctopusJudge(numCard(v)), true);
    assert.equal(m.attackGainDiving(numCard(v)), false);
  }
  assert.equal(m.attackOctopusJudgeDamage(false), 3);
  assert.equal(m.attackOctopusJudgeDamage(true), 5);
});

test('FrozenOceanOctopus defend 1/2/3: counter 2 + heal 1', () => {
  const m = getMonster('FrozenOceanOctopus');
  for (const v of [1, 2, 3]) {
    assert.equal(m.defendCounter(numCard(v), 5), 2);
    assert.equal(m.defendHeal(numCard(v)), 1);
  }
  assert.equal(m.defendCounter(numCard(4), 5), 0);
  assert.equal(m.defendHeal(numCard(4)), 0);
});

test('FrozenOceanOctopus stage mods', () => {
  const m = getMonster('FrozenOceanOctopus');
  const s2 = applyStageMods(m, 2);
  assert.equal(s2.hp, 30);
  const s3 = applyStageMods(m, 3);
  assert.equal(s3.attackDamage(numCard(5)), 5);
  assert.equal(s3.attackOctopusJudgeDamage(false), 4);
  assert.equal(s3.attackOctopusJudgeDamage(true), 6);
  const s4 = applyStageMods(m, 4);
  assert.equal(s4.defendHeal(numCard(2)), 2);
  assert.equal(s4.defendHeal(numCard(5)), 0);
});

function judgedBattle(judgedCard) {
  const eng = new Engine();
  eng.start('Ryan', 'FrozenOceanOctopus');
  eng.later = () => {};
  eng.piles = {
    player: { deck: [judgedCard], discard: [], hand: [] },
    ai: { deck: [], discard: [], hand: [] }
  };
  return eng;
}

test('FrozenOceanOctopus 1/2/3: normal color deals 3 and returns card to deck', () => {
  const eng = judgedBattle(numCard(5, 'GREEN'));
  const r = eng.effect('FrozenOceanOctopus', 2, numCard(2), eng.s.ai, eng.s.player);
  assert.equal(r.d, 3);
  assert.equal(eng.piles.player.discard.length, 0);
  assert.equal(eng.piles.player.deck.length, 1);
  assert.equal(eng.piles.player.deck[0].value, 5);
});

test('FrozenOceanOctopus 1/2/3: black/white deals 5 and discards the card', () => {
  const eng = judgedBattle(blackCard());
  const r = eng.effect('FrozenOceanOctopus', 1, numCard(1), eng.s.ai, eng.s.player);
  assert.equal(r.d, 5);
  assert.equal(eng.piles.player.deck.length, 0);
  assert.equal(eng.piles.player.discard.length, 1);
  assert.equal(eng.piles.player.discard[0].isBlack, true);
});

test('FrozenOceanOctopus skill desc', () => {
  const { getAdventureNpcSkillDesc } = AdventureMonsterBridge;
  const atk2 = getAdventureNpcSkillDesc('FrozenOceanOctopus', numCard(2), false, { stage: 1 });
  assert.ok(atk2.includes('判定'));
  assert.ok(atk2.includes('3点'));
  assert.ok(atk2.includes('5点'));
  const atk5 = getAdventureNpcSkillDesc('FrozenOceanOctopus', numCard(5), false, { stage: 1 });
  assert.ok(atk5.includes('4点'));
  assert.ok(atk5.includes('潜水'));
  const atk5s3 = getAdventureNpcSkillDesc('FrozenOceanOctopus', numCard(5), false, { stage: 3 });
  assert.ok(atk5s3.includes('5点'));
  const def2 = getAdventureNpcSkillDesc('FrozenOceanOctopus', numCard(2), true, { stage: 1 });
  assert.ok(def2.includes('2'));
  assert.ok(def2.includes('恢复1点生命'));
});
