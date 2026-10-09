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

const { AdventureRegistry, AdventureLoot, AdventureMonsterBridge, Engine } = context;
const { applyStageMods, getAdventureNpcSkillDesc: describe } = AdventureMonsterBridge;
const getBoss = name => AdventureRegistry.getBoss(name);

function numCard(value, color = 'RED') {
  return { value, isNumberCard: true, isItemCard: false, color, isBlack: false, isWhite: false };
}

function stagedEngine(t, stage = 2) {
  const base = getBoss('Pharaoh');
  AdventureMonsterBridge.registerMonsterChar(applyStageMods(base, stage));
  t.after(() => AdventureMonsterBridge.registerMonsterChar(base));
  const eng = new Engine();
  eng.start('Ryan', 'Pharaoh');
  eng.later = () => {};
  return eng;
}

function defendWith(eng, card, incoming) {
  return context.CharacterRegistry.get('Pharaoh').defend(eng, 'Pharaoh', card.value, incoming, card, eng.s.ai, eng.s.player, 'ai', card.color, {
    heal: (x, n) => eng.heal(x, n), hurt: (x, n) => eng.hurt(x, n),
    counter: (x, n) => eng.counterAttack(eng.s.ai, x, n),
    clearDebuffs: x => eng.clearDebuffs(x),
    burn: (x, n) => eng.burn(x, n), bleed: (x, n) => eng.bleed(x, n), poison: (x, n) => eng.poison(x, n)
  });
}

test('Pharaoh base stats, boss pool and Stage 2 gate', () => {
  const m = getBoss('Pharaoh');
  assert.ok(m);
  assert.equal(m.kind, '法老');
  assert.equal(m.hp, 50);
  assert.equal(m.minStage, 2);
  assert.equal(m.whiteZeros, 2);
  assert.equal(m.icon, '../icons/npc_icons/pharaoh.webp');
  const pool = context.AdventureBossPool.desert;
  assert.equal(pool['*'], undefined);
  for (const stage of [2, 3, 4]) assert.ok(pool[stage].includes('Pharaoh'));
});

test('Pharaoh only appears from Stage 2 in desert boss picks', () => {
  const file = path.join(gameRoot, 'adventure/js/engine/adventure_engine.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  const eng = new context.AdventureEngine();
  eng.s = { scene: 'desert', stage: 1 };
  for (let i = 0; i < 50; i++) assert.notEqual(eng._pickBossName({ bossName: 'Pharaoh' }), 'Pharaoh');
  eng.s.stage = 2;
  const desertBosses = new Set();
  for (let i = 0; i < 80; i++) desertBosses.add(eng._pickBossName({}));
  assert.ok(desertBosses.has('Pharaoh'));
  assert.ok(desertBosses.has('DesertHyena'));
  for (const name of desertBosses) assert.ok(['Pharaoh', 'DesertHyena', 'DesertSobek'].includes(name));
  for (const scene of ['castle', 'forest', 'ocean']) {
    eng.s = { scene, stage: 3 };
    for (let i = 0; i < 30; i++) assert.notEqual(eng._pickBossName({}), 'Pharaoh');
  }
});

test('Pharaoh loot: rolls 1-6 drop ZeroTrophy', () => {
  for (const roll of [1, 2, 3, 4, 5, 6]) {
    const r = AdventureLoot.rollMonsterDrop('desert', 'Pharaoh', () => (roll - 1) / 12);
    assert.deepEqual(Array.from(r.drops), ['ZeroTrophy']);
  }
  for (const roll of [7, 12]) {
    assert.equal(AdventureLoot.rollMonsterDrop('desert', 'Pharaoh', () => (roll - 1) / 12).drops.length, 0);
  }
});

test('Pharaoh attack hooks follow card value and color', () => {
  const m = getBoss('Pharaoh');
  for (const v of [1, 2, 3]) {
    assert.equal(m.attackDamage(numCard(v)), 3);
    assert.equal(m.attackBurn(numCard(v, 'RED')), 2);
    assert.equal(m.attackBurn(numCard(v, 'BLUE')), 0);
    assert.equal(m.attackQuicksand(numCard(v, 'YELLOW')), 1);
    assert.equal(m.attackQuicksand(numCard(v, 'GREEN')), 0);
    assert.equal(m.attackHypothermia(numCard(v, 'BLUE')), 1);
    assert.equal(m.attackHypothermia(numCard(v, 'RED')), 0);
    assert.equal(m.attackLush(numCard(v, 'GREEN')), 1);
    assert.equal(m.attackLush(numCard(v, 'YELLOW')), 0);
    assert.equal(m.attackUnblockable(numCard(v, 'YELLOW')), false);
    assert.equal(m.attackDrawSelf(numCard(v)), 0);
  }
  const wildYellow = Object.assign(numCard(2, 'WILD'), { chosenColor: 'YELLOW' });
  assert.equal(m.attackQuicksand(wildYellow), 1);
  for (const v of [4, 5, 6]) {
    assert.equal(m.attackDamage(numCard(v)), 6);
    assert.equal(m.attackUnblockable(numCard(v, 'YELLOW')), true);
    assert.equal(m.attackUnblockable(numCard(v, 'RED')), false);
    assert.equal(m.attackBurn(numCard(v, 'RED')), 0);
  }
  const zero = numCard(0, 'WHITE');
  assert.equal(m.attackDamage(zero), 0);
  assert.equal(m.attackHeal(zero), 3);
  assert.equal(m.attackClearSelfDebuffs(zero), true);
  assert.equal(m.attackDrawSelf(zero), 2);
});

test('Pharaoh defend hooks', () => {
  const m = getBoss('Pharaoh');
  for (const v of [1, 2, 3]) {
    assert.equal(m.defendCounter(numCard(v), 7), 3);
    assert.equal(m.defendHeal(numCard(v)), 1);
    assert.equal(m.defendClearDebuffs(numCard(v)), false);
  }
  for (const v of [4, 5, 6]) {
    assert.equal(m.defendCounter(numCard(v), 7), 0);
    assert.equal(m.defendHeal(numCard(v)), 0);
  }
  assert.equal(m.defendCounter(numCard(0), 7), 7);
  assert.equal(m.defendHeal(numCard(0)), 0);
  assert.equal(m.defendClearDebuffs(numCard(0)), true);
});

test('Pharaoh stage mods: Stage 3 attack +1, Stage 4 defend heal +1', () => {
  const m = getBoss('Pharaoh');
  const s2 = applyStageMods(m, 2);
  assert.equal(s2.attackDamage(numCard(2)), 3);
  assert.equal(s2.defendHeal(numCard(2)), 1);
  const s3 = applyStageMods(m, 3);
  assert.equal(s3.attackDamage(numCard(2)), 4);
  assert.equal(s3.attackDamage(numCard(5)), 7);
  assert.equal(s3.attackDamage(numCard(0)), 0);
  assert.equal(s3.defendHeal(numCard(2)), 1);
  const s4 = applyStageMods(m, 4);
  assert.equal(s4.attackDamage(numCard(5)), 7);
  assert.equal(s4.defendHeal(numCard(2)), 2);
  assert.equal(s4.defendHeal(numCard(0)), 0);
});

test('Pharaoh 0 attack heals 3, clears own debuffs, draws 2, deals no damage', t => {
  const eng = stagedEngine(t, 2);
  eng.s.ai.hp = 30;
  eng.s.ai.burn = 2;
  eng.s.ai.poison = 1;
  const handBefore = eng.h.ai.length;
  const card = numCard(0, 'WHITE');
  eng.s.atkCard = card; eng.s.atkOwner = 'ai';
  const r = eng.effect('Pharaoh', 0, card, eng.s.ai, eng.s.player);
  assert.ok(!r.d);
  assert.equal(eng.s.ai.hp, 33);
  assert.equal(eng.s.ai.burn, 0);
  assert.equal(eng.s.ai.poison, 0);
  assert.equal(eng.h.ai.length, handBefore + 2);
});

test('Pharaoh 4/5/6 yellow attack is unblockable, other colors are not', t => {
  const eng = stagedEngine(t, 2);
  const yellow = numCard(5, 'YELLOW');
  eng.s.atkCard = yellow; eng.s.atkOwner = 'ai';
  const r = eng.effect('Pharaoh', 5, yellow, eng.s.ai, eng.s.player);
  assert.equal(r.d, 6);
  assert.equal(r.unblock, true);
  const red = numCard(5, 'RED');
  eng.s.atkCard = red;
  const r2 = eng.effect('Pharaoh', 5, red, eng.s.ai, eng.s.player);
  assert.equal(r2.d, 6);
  assert.ok(!r2.unblock);
});

test('Pharaoh 1/2/3 green attack grants itself lush', t => {
  const eng = stagedEngine(t, 2);
  const card = numCard(2, 'GREEN');
  eng.s.atkCard = card; eng.s.atkOwner = 'ai';
  const r = eng.effect('Pharaoh', 2, card, eng.s.ai, eng.s.player);
  assert.equal(r.d, 3);
  eng.prepareAttackSettlement(r.d, 'player');
  eng.commitAttackStatuses('afterDamage');
  assert.equal(eng.s.ai.lush, 1);
  assert.equal(eng.s.player.lush || 0, 0);
});

test('Pharaoh 1/2/3 red attack burns the target for 2 after damage', t => {
  const eng = stagedEngine(t, 2);
  const card = numCard(2, 'RED');
  eng.s.atkCard = card; eng.s.atkOwner = 'ai';
  const r = eng.effect('Pharaoh', 2, card, eng.s.ai, eng.s.player);
  assert.equal(r.d, 3);
  eng.prepareAttackSettlement(r.d, 'player');
  eng.commitAttackStatuses('afterDamage');
  assert.equal(eng.s.player.burn, 2);
  assert.equal(eng.s.ai.burn || 0, 0);
});

test('Pharaoh defend 1/2/3 heals 1 and counters 3; Stage 4 heals 2', t => {
  const eng = stagedEngine(t, 4);
  eng.s.ai.hp = 30;
  const playerHp = eng.s.player.hp;
  const result = defendWith(eng, numCard(2), 5);
  assert.equal(result.remaining, 5);
  assert.equal(eng.s.ai.hp, 32);
  assert.equal(eng.s.player.hp, playerHp - 3);
});

test('Pharaoh defend 0 clears own debuffs and counters the incoming damage', t => {
  const eng = stagedEngine(t, 2);
  eng.s.ai.burn = 2;
  eng.s.ai.bleed = 1;
  const playerHp = eng.s.player.hp;
  defendWith(eng, numCard(0, 'WHITE'), 5);
  assert.equal(eng.s.ai.burn, 0);
  assert.equal(eng.s.ai.bleed, 0);
  assert.equal(eng.s.player.hp, playerHp - 5);
});

test('compactSkillText follows the panel shorthand rules', () => {
  const c = AdventureMonsterBridge.compactSkillText;
  assert.equal(c('造成3点[伤害]，施加1层[流血]（不可防御）'), '3🗡️，施加[流血]（不可防御）');
  assert.equal(c('恢复2点生命，格挡至多3点伤害，抽取1张牌'), '回2❤️，格挡至多3🛡️，抽1🃏');
  assert.equal(c('吸取2+玩家[中毒]层数点生命'), '吸2+玩家[中毒]层数❤️');
  assert.equal(c('格挡半数伤害（向上取整）'), '格挡半数伤害');
  assert.equal(c('反击相同点伤害，跳过防御'), '反击相同点伤害，跳过防御');
});

test('Pharaoh skill panel text', () => {
  for (const stage of [2, 3, 4]) {
    const bonus = stage >= 3 ? 1 : 0;
    assert.match(describe('Pharaoh', numCard(2), false, { stage }), new RegExp('^' + (3 + bonus) + '🗡️，.*🔴施加2层\\[灼伤\\].*🟡施加\\[流沙\\].*🔵施加\\[失温\\].*🟢获得\\[茂盛\\]'));
    assert.match(describe('Pharaoh', numCard(5), false, { stage }), new RegExp('^' + (6 + bonus) + '🗡️，.*🟡则不可防御'));
    assert.equal(describe('Pharaoh', numCard(0), false, { stage }), '回3❤️，清除自身所有负面状态，抽2🃏');
    assert.equal(describe('Pharaoh', numCard(2), true, { stage }), '反击3🗡️，回' + (stage >= 4 ? 2 : 1) + '❤️');
    assert.equal(describe('Pharaoh', numCard(0), true, { stage }), '清除自身所有负面状态，反击相同点伤害');
    assert.equal(describe('Pharaoh', numCard(5), true, { stage }), '无防御效果');
  }
});

test('Pharaoh stage guide entries', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(context.AdventureStageGuide.Pharaoh)), [
    { stage: '3', text: '进攻技能伤害 +1' },
    { stage: '4', text: '防御恢复 +1' }
  ]);
  assert.match(JSON.stringify(context.AdventureMonsterNotes.Pharaoh), /Stage 2/);
});
