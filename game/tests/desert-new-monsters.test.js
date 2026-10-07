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

function rollDrop(scene, name, roll) {
  return AdventureLoot.rollMonsterDrop(scene, name, () => (roll - 1) / 12);
}

// ===== 沙漠蜥蜴 DesertLizard =====
test('DesertLizard base stats and pool', () => {
  const m = getMonster('DesertLizard');
  assert.ok(m);
  assert.equal(m.kind, '沙漠蜥蜴');
  assert.equal(m.hp, 20);
  assert.equal(m.icon, '../icons/npc_icons/desert_lizard.webp');
  assert.ok(context.AdventureMonsterPool.desert['*'].includes('DesertLizard'));
});

test('DesertLizard loot: 1-2 sandblind, 3-4 quicksand', () => {
  for (const roll of [1, 2]) {
    const r = rollDrop('desert', 'DesertLizard', roll);
    assert.equal(r.drops.length, 1);
    assert.equal(r.drops[0], 'SandblindTrophy');
  }
  for (const roll of [3, 4]) {
    const r = rollDrop('desert', 'DesertLizard', roll);
    assert.equal(r.drops.length, 1);
    assert.equal(r.drops[0], 'QuicksandTrophy');
  }
  for (const roll of [5, 6, 12]) {
    assert.equal(rollDrop('desert', 'DesertLizard', roll).drops.length, 0);
  }
});

test('DesertLizard attack hooks', () => {
  const m = getMonster('DesertLizard');
  for (const v of [1, 2, 3]) {
    assert.equal(m.attackDamage(numCard(v)), 3);
    assert.equal(m.attackSandblind(numCard(v)), 1);
    assert.equal(m.attackQuicksand(numCard(v)), 0);
  }
  for (const v of [4, 5, 6]) {
    assert.equal(m.attackDamage(numCard(v)), 5);
    assert.equal(m.attackSandblind(numCard(v)), 0);
    assert.equal(m.attackQuicksand(numCard(v)), 1);
  }
});

test('DesertLizard defend: block cap 2 + 2 sandblind', () => {
  const m = getMonster('DesertLizard');
  assert.equal(m.defendBlock(numCard(2), 8), 2);
  assert.equal(m.defendBlock(numCard(2), 1), 1);
  assert.equal(m.defendSandblind(numCard(2)), 2);
  assert.equal(m.defendSandblind(numCard(5)), 0);
});

test('DesertLizard stage mods', () => {
  const m = getMonster('DesertLizard');
  const s2 = applyStageMods(m, 2);
  assert.equal(s2.hp, 25);
  const s3 = applyStageMods(m, 3);
  assert.equal(s3.attackSandblind(numCard(2)), 2);
  assert.equal(s3.attackSandblind(numCard(5)), 0);
  assert.equal(s3.attackQuicksand(numCard(5)), 1);
  const s4 = applyStageMods(m, 4);
  assert.equal(s4.defendBlock(numCard(2), 8), 3);
  assert.equal(s4.defendBlock(numCard(2), 2), 2);
});

test('DesertLizard effect: 1/2/3 deals 3 + 1 sandblind', () => {
  const eng = new Engine();
  eng.start('Ryan', 'DesertLizard');
  eng.later = () => {};
  const r = eng.effect('DesertLizard', 2, numCard(2), eng.s.ai, eng.s.player);
  assert.equal(r.d, 3);
  eng.prepareAttackSettlement(r.d, 'player');
  eng.commitAttackStatuses('afterDamage');
  assert.equal(eng.s.player.sandblind, 1);
});

test('DesertLizard effect: 4/5/6 deals 5 + 1 quicksand', () => {
  const eng = new Engine();
  eng.start('Ryan', 'DesertLizard');
  eng.later = () => {};
  const r = eng.effect('DesertLizard', 5, numCard(5), eng.s.ai, eng.s.player);
  assert.equal(r.d, 5);
  eng.prepareAttackSettlement(r.d, 'player');
  eng.commitAttackStatuses('afterDamage');
  assert.equal(eng.s.player.quicksand, 1);
});

// ===== 沙漠沙虫 DesertSandworm =====
test('DesertSandworm base stats', () => {
  const m = getMonster('DesertSandworm');
  assert.ok(m);
  assert.equal(m.kind, '沙漠沙虫');
  assert.equal(m.hp, 25);
});

test('DesertSandworm loot: 1-2 sandblind, 3-4 parasite', () => {
  for (const roll of [1, 2]) {
    const r = rollDrop('desert', 'DesertSandworm', roll);
    assert.equal(r.drops[0], 'SandblindTrophy');
  }
  for (const roll of [3, 4]) {
    const r = rollDrop('desert', 'DesertSandworm', roll);
    assert.equal(r.drops[0], 'ParasiteTrophy');
  }
});

test('DesertSandworm attack hooks', () => {
  const m = getMonster('DesertSandworm');
  for (const v of [1, 2, 3]) {
    assert.equal(m.attackDamage(numCard(v)), 4);
    assert.equal(m.attackUnblockableIfBuff(numCard(v), { sandblind: 0 }), false);
    assert.equal(m.attackUnblockableIfBuff(numCard(v), { sandblind: 2 }), true);
  }
  for (const v of [4, 5, 6]) {
    assert.equal(m.attackDamage(numCard(v)), 5);
    assert.equal(m.attackParasite(numCard(v)), 1);
  }
});

test('DesertSandworm defend: counter 2 + 1 sandblind', () => {
  const m = getMonster('DesertSandworm');
  assert.equal(m.defendCounter(numCard(2)), 2);
  assert.equal(m.defendSandblind(numCard(2)), 1);
});

test('DesertSandworm stage mods', () => {
  const m = getMonster('DesertSandworm');
  assert.equal(applyStageMods(m, 2).hp, 30);
  assert.equal(applyStageMods(m, 3).attackDamage(numCard(2)), 5);
  assert.equal(applyStageMods(m, 3).attackDamage(numCard(5)), 6);
  const s4 = applyStageMods(m, 4);
  assert.equal(s4.defendHeal(numCard(2)), 2);
});

test('DesertSandworm effect: 4/5/6 grants parasite', () => {
  const eng = new Engine();
  eng.start('Ryan', 'DesertSandworm');
  eng.later = () => {};
  const r = eng.effect('DesertSandworm', 5, numCard(5), eng.s.ai, eng.s.player);
  assert.equal(r.d, 5);
  eng.prepareAttackSettlement(r.d, 'player');
  eng.commitAttackStatuses('afterDamage');
  assert.equal(eng.s.ai.parasite, 1);
});

// ===== 沙漠圣甲虫 DesertScarab =====
test('DesertScarab base stats', () => {
  const m = getMonster('DesertScarab');
  assert.ok(m);
  assert.equal(m.kind, '沙漠圣甲虫');
  assert.equal(m.hp, 20);
});

test('DesertScarab loot: 1-2 russian roulette, 3-4 fly', () => {
  for (const roll of [1, 2]) {
    const r = rollDrop('desert', 'DesertScarab', roll);
    assert.equal(r.drops[0], 'RussianRouletteTrophy');
  }
  for (const roll of [3, 4]) {
    const r = rollDrop('desert', 'DesertScarab', roll);
    assert.equal(r.drops[0], 'FlyTrophy');
  }
});

test('DesertScarab attack color buff', () => {
  const m = getMonster('DesertScarab');
  assert.equal(m.attackDamage(numCard(2)), 3);
  assert.equal(m.attackDamage(numCard(5)), 4);
  const red = m.attackColorBuff(numCard(2, 'RED'));
  assert.equal(red.burn, 2);
  assert.equal(red.thorns, undefined);
  const yellow = m.attackColorBuff(numCard(2, 'YELLOW'));
  assert.equal(yellow.thorns, 1);
  assert.equal(yellow.burn, undefined);
  const blue = m.attackColorBuff(numCard(2, 'BLUE'));
  assert.equal(blue.iceSeal, 1);
  const green = m.attackColorBuff(numCard(2, 'GREEN'));
  assert.equal(green.poison, 1);
  assert.equal(m.attackColorBuff(numCard(5, 'RED')), null);
  assert.equal(m.attackFly(numCard(5)), 1);
  assert.equal(m.attackFly(numCard(2)), 0);
});

test('DesertScarab defend: block 3', () => {
  const m = getMonster('DesertScarab');
  assert.equal(m.defendBlock(numCard(2), 8), 3);
  assert.equal(m.defendBlock(numCard(2), 2), 2);
});

test('DesertScarab stage mods', () => {
  const m = getMonster('DesertScarab');
  assert.equal(applyStageMods(m, 2).hp, 25);
  assert.equal(applyStageMods(m, 3).attackDamage(numCard(2)), 4);
  assert.equal(applyStageMods(m, 4).defendBlock(numCard(2), 8), 4);
});

test('DesertScarab effect: RED card applies 2 burn', () => {
  const eng = new Engine();
  eng.start('Ryan', 'DesertScarab');
  eng.later = () => {};
  const r = eng.effect('DesertScarab', 2, numCard(2, 'RED'), eng.s.ai, eng.s.player);
  assert.equal(r.d, 3);
  eng.prepareAttackSettlement(r.d, 'player');
  eng.commitAttackStatuses('afterDamage');
  assert.equal(eng.s.player.burn, 2);
});

test('DesertScarab effect: 4/5/6 grants fly', () => {
  const eng = new Engine();
  eng.start('Ryan', 'DesertScarab');
  eng.later = () => {};
  const r = eng.effect('DesertScarab', 5, numCard(5), eng.s.ai, eng.s.player);
  assert.equal(r.d, 4);
  eng.prepareAttackSettlement(r.d, 'player');
  eng.commitAttackStatuses('afterDamage');
  assert.equal(eng.s.ai.fly, 1);
});

// ===== 沙漠蝎子 DesertScorpion =====
test('DesertScorpion base stats', () => {
  const m = getMonster('DesertScorpion');
  assert.ok(m);
  assert.equal(m.kind, '沙漠蝎子');
  assert.equal(m.hp, 18);
});

test('DesertScorpion loot: 1-3 poison, 4 thorns', () => {
  for (const roll of [1, 2, 3]) {
    const r = rollDrop('desert', 'DesertScorpion', roll);
    assert.equal(r.drops[0], 'PoisonTrophy');
  }
  const r4 = rollDrop('desert', 'DesertScorpion', 4);
  assert.equal(r4.drops[0], 'ThornsTrophy');
});

test('DesertScorpion attack hooks', () => {
  const m = getMonster('DesertScorpion');
  for (const v of [1, 2, 3]) {
    assert.equal(m.attackDamage(numCard(v)), 3);
    assert.equal(m.attackUnblockableIfBuff(numCard(v), { poison: 0 }), false);
    assert.equal(m.attackUnblockableIfBuff(numCard(v), { poison: 1 }), true);
  }
  for (const v of [4, 5, 6]) {
    assert.equal(m.attackDamage(numCard(v)), 2);
    assert.equal(m.attackUnblockable(numCard(v)), true);
    assert.equal(m.attackThorns(numCard(v)), 1);
    assert.equal(m.attackPoison(numCard(v)), 1);
  }
});

test('DesertScorpion defend poison drain', () => {
  const m = getMonster('DesertScorpion');
  const pd = m.defendPoisonDrain(numCard(2));
  assert.equal(pd.poison, 1);
  assert.equal(pd.drain, 0);
  assert.equal(m.defendPoisonDrain(numCard(5)), null);
});

test('DesertScorpion stage mods', () => {
  const m = getMonster('DesertScorpion');
  assert.equal(applyStageMods(m, 2).hp, 24);
  assert.equal(applyStageMods(m, 3).attackDamage(numCard(2)), 4);
  const s4 = applyStageMods(m, 4);
  const pd = s4.defendPoisonDrain(numCard(2));
  assert.equal(pd.poison, 1);
  assert.equal(pd.drain, 1);
});

test('DesertScorpion effect: 4/5/6 unblockable + thorns + poison', () => {
  const eng = new Engine();
  eng.start('Ryan', 'DesertScorpion');
  eng.later = () => {};
  const r = eng.effect('DesertScorpion', 5, numCard(5), eng.s.ai, eng.s.player);
  assert.equal(r.d, 2);
  assert.equal(r.unblock, true);
  eng.prepareAttackSettlement(r.d, 'player');
  eng.commitAttackStatuses('afterDamage');
  assert.equal(eng.s.player.thorns, 1);
  assert.equal(eng.s.player.poison, 1);
});

// ===== 沙漠毒蛇 DesertViper =====
test('DesertViper base stats', () => {
  const m = getMonster('DesertViper');
  assert.ok(m);
  assert.equal(m.kind, '沙漠毒蛇');
  assert.equal(m.hp, 20);
});

test('DesertViper loot: 1-4 poison', () => {
  for (const roll of [1, 2, 3, 4]) {
    const r = rollDrop('desert', 'DesertViper', roll);
    assert.equal(r.drops[0], 'PoisonTrophy');
  }
});

test('DesertViper attack hooks', () => {
  const m = getMonster('DesertViper');
  for (const v of [1, 2, 3]) {
    assert.equal(m.attackDamage(numCard(v)), 3);
    assert.equal(m.attackPoison(numCard(v)), 1);
  }
  assert.equal(m.attackDrain(numCard(5), { playerPoison: 0 }), 2);
  assert.equal(m.attackDrain(numCard(5), { playerPoison: 2 }), 4);
  assert.equal(m.attackDrain(numCard(2), { playerPoison: 2 }), 0);
});

test('DesertViper defend: block cap 2 + 1 poison', () => {
  const m = getMonster('DesertViper');
  assert.equal(m.defendBlock(numCard(2), 8), 2);
  assert.equal(m.defendBlock(numCard(2), 1), 1);
  assert.equal(m.defendPoison(numCard(2)), 1);
});

test('DesertViper stage mods', () => {
  const m = getMonster('DesertViper');
  assert.equal(applyStageMods(m, 2).hp, 24);
  const s3 = applyStageMods(m, 3);
  assert.equal(s3.attackDrain(numCard(5), { playerPoison: 0 }), 3);
  assert.equal(s3.attackDrain(numCard(5), { playerPoison: 2 }), 5);
  const s4 = applyStageMods(m, 4);
  assert.equal(s4.defendPoison(numCard(2)), 2);
});

test('DesertViper effect: 1/2/3 deals 3 + 1 poison', () => {
  const eng = new Engine();
  eng.start('Ryan', 'DesertViper');
  eng.later = () => {};
  const r = eng.effect('DesertViper', 2, numCard(2), eng.s.ai, eng.s.player);
  assert.equal(r.d, 3);
  eng.prepareAttackSettlement(r.d, 'player');
  eng.commitAttackStatuses('afterDamage');
  assert.equal(eng.s.player.poison, 1);
});

// ===== 沙漠秃鹫 DesertVulture =====
test('DesertVulture base stats', () => {
  const m = getMonster('DesertVulture');
  assert.ok(m);
  assert.equal(m.kind, '沙漠秃鹫');
  assert.equal(m.hp, 24);
});

test('DesertVulture loot: 1-2 fly, 3-4 sandblind', () => {
  for (const roll of [1, 2]) {
    const r = rollDrop('desert', 'DesertVulture', roll);
    assert.equal(r.drops[0], 'FlyTrophy');
  }
  for (const roll of [3, 4]) {
    const r = rollDrop('desert', 'DesertVulture', roll);
    assert.equal(r.drops[0], 'SandblindTrophy');
  }
});

test('DesertVulture attack: YELLOW→2 sandblind, else fly', () => {
  const m = getMonster('DesertVulture');
  for (const v of [1, 2, 3]) {
    assert.equal(m.attackDamage(numCard(v)), 3);
    assert.equal(m.attackSandblind(numCard(v, 'YELLOW')), 2);
    assert.equal(m.attackFly(numCard(v, 'YELLOW')), 0);
    assert.equal(m.attackSandblind(numCard(v, 'RED')), 0);
    assert.equal(m.attackFly(numCard(v, 'RED')), 1);
    assert.equal(m.attackFly(numCard(v, 'BLUE')), 1);
  }
  for (const v of [4, 5, 6]) {
    assert.equal(m.attackDamage(numCard(v)), 5);
    assert.equal(m.attackClearPositive(numCard(v)), true);
  }
});

test('DesertVulture defend: block 1 + counter 1 + 1 sandblind', () => {
  const m = getMonster('DesertVulture');
  assert.equal(m.defendBlock(numCard(2), 8), 1);
  assert.equal(m.defendCounter(numCard(2)), 1);
  assert.equal(m.defendSandblind(numCard(2)), 1);
});

test('DesertVulture stage mods', () => {
  const m = getMonster('DesertVulture');
  assert.equal(applyStageMods(m, 2).hp, 30);
  assert.equal(applyStageMods(m, 3).attackDamage(numCard(2)), 4);
  assert.equal(applyStageMods(m, 4).defendCounter(numCard(2)), 2);
});

test('DesertVulture effect: YELLOW 1/2/3 → 2 sandblind on target', () => {
  const eng = new Engine();
  eng.start('Ryan', 'DesertVulture');
  eng.later = () => {};
  const r = eng.effect('DesertVulture', 2, numCard(2, 'YELLOW'), eng.s.ai, eng.s.player);
  assert.equal(r.d, 3);
  eng.prepareAttackSettlement(r.d, 'player');
  eng.commitAttackStatuses('afterDamage');
  assert.equal(eng.s.player.sandblind, 2);
  assert.equal(eng.s.ai.fly || 0, 0);
});

test('DesertVulture effect: RED 1/2/3 → fly on self', () => {
  const eng = new Engine();
  eng.start('Ryan', 'DesertVulture');
  eng.later = () => {};
  const r = eng.effect('DesertVulture', 2, numCard(2, 'RED'), eng.s.ai, eng.s.player);
  assert.equal(r.d, 3);
  eng.prepareAttackSettlement(r.d, 'player');
  eng.commitAttackStatuses('afterDamage');
  assert.equal(eng.s.ai.fly, 1);
  assert.equal(eng.s.player.sandblind || 0, 0);
});

test('DesertVulture effect: 4/5/6 clears positive buffs', () => {
  const eng = new Engine();
  eng.start('Ryan', 'DesertVulture');
  eng.later = () => {};
  eng.s.player.guard = 3;
  eng.s.player.fly = 1;
  eng.s.player.crit = 2;
  const r = eng.effect('DesertVulture', 5, numCard(5), eng.s.ai, eng.s.player);
  assert.equal(r.d, 5);
  eng.prepareAttackSettlement(r.d, 'player');
  eng.commitAttackStatuses('afterDamage');
  assert.equal(eng.s.player.guard, 0);
  assert.equal(eng.s.player.fly, 0);
  assert.equal(eng.s.player.crit, 0);
});