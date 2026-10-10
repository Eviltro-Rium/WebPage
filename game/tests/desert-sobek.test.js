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
  'adventure/js/content/stage_guide.js',
  'adventure/js/battle/battle_engine.js',
  'adventure/js/battle/adventure_battle_items.js'
]);
for (const relative of sources) {
  const file = path.join(gameRoot, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const {
  AdventureRegistry, AdventureLoot, AdventureMonsterBridge, Engine,
  CharacterRegistry, AdventureBattleEngine, AdventureStageGuide, AdventureMonsterNotes
} = context;
const { applyStageMods, getAdventureNpcSkillDesc: describe } = AdventureMonsterBridge;
const getBoss = name => AdventureRegistry.getBoss(name);

function numCard(value, color = 'RED') {
  return { value, isNumberCard: true, isItemCard: false, color, isBlack: false, isWhite: false, chosenColor: color };
}

function stagedEngine(t, stage = 2) {
  const base = getBoss('DesertSobek');
  AdventureMonsterBridge.registerMonsterChar(applyStageMods(base, stage));
  t.after(() => AdventureMonsterBridge.registerMonsterChar(base));
  const eng = new Engine();
  eng.start('Ryan', 'DesertSobek');
  eng.later = () => {};
  eng.s.isAdventure = true;
  return eng;
}

function defendWith(eng, card, incoming) {
  return CharacterRegistry.get('DesertSobek').defend(
    eng, 'DesertSobek', card.value, incoming, card, eng.s.ai, eng.s.player, 'ai', card.color, {
      heal: (x, n) => eng.heal(x, n), hurt: (x, n) => eng.hurt(x, n),
      counter: (x, n) => eng.counterAttack(eng.s.ai, x, n),
      clearDebuffs: x => eng.clearDebuffs(x),
      burn: (x, n) => eng.burn(x, n), bleed: (x, n) => eng.bleed(x, n), poison: (x, n) => eng.poison(x, n),
      draw: (w, n, an) => eng.draw(w, n, an)
    }
  );
}

test('DesertSobek base stats, boss pool, icon, whiteZeros', () => {
  const m = getBoss('DesertSobek');
  assert.ok(m);
  assert.equal(m.kind, '鳄神索贝克');
  assert.equal(m.hp, 35);
  assert.equal(m.minStage, 2);
  assert.equal(m.whiteZeros, 2);
  assert.equal(m.handLimit, 3);
  assert.equal(m.icon, '../icons/npc_icons/desert_sobek.webp');
  assert.ok(fs.existsSync(path.join(gameRoot, 'icons/npc_icons/desert_sobek.webp')));
  assert.ok(fs.existsSync(path.join(gameRoot, 'icons/npc_icons/desert_sobek.webp')));
  const pool = context.AdventureBossPool.desert;
  for (const stage of [2, 3, 4]) {
    assert.ok(pool[stage].includes('DesertSobek'), 'stage ' + stage);
    assert.ok(pool[stage].includes('Pharaoh'));
    assert.ok(pool[stage].includes('DesertHyena'));
  }
});

test('DesertSobek loot: 1-4 LushTrophy, 5 CritTrophy, 6 PiercingTrophy', () => {
  for (const roll of [1, 2, 3, 4]) {
    const r = AdventureLoot.rollMonsterDrop('desert', 'DesertSobek', () => (roll - 1) / 12);
    assert.deepEqual(Array.from(r.drops), ['LushTrophy']);
  }
  assert.deepEqual(Array.from(AdventureLoot.rollMonsterDrop('desert', 'DesertSobek', () => 4 / 12).drops), ['CritTrophy']);
  assert.deepEqual(Array.from(AdventureLoot.rollMonsterDrop('desert', 'DesertSobek', () => 5 / 12).drops), ['PiercingTrophy']);
  for (const roll of [7, 12]) {
    assert.equal(AdventureLoot.rollMonsterDrop('desert', 'DesertSobek', () => (roll - 1) / 12).drops.length, 0);
  }
});

test('DesertSobek attack 1/2/3: 3 damage + bleed', () => {
  const m = getBoss('DesertSobek');
  for (const v of [1, 2, 3]) {
    assert.equal(m.attackDamage(numCard(v), {}), 3);
    assert.equal(m.attackBleed(numCard(v)), 1);
    assert.equal(m.attackLush(numCard(v)), 0);
    assert.equal(m.attackGainCrit(numCard(v)), 0);
  }
});

test('DesertSobek attack 4/5/6: 5 damage; GREEN lush; YELLOW crit', () => {
  const m = getBoss('DesertSobek');
  for (const v of [4, 5, 6]) {
    assert.equal(m.attackDamage(numCard(v), {}), 5);
    assert.equal(m.attackBleed(numCard(v)), 0);
    assert.equal(m.attackLush(numCard(v, 'GREEN')), 1);
    assert.equal(m.attackLush(numCard(v, 'YELLOW')), 0);
    assert.equal(m.attackGainCrit(numCard(v, 'YELLOW')), 1);
    assert.equal(m.attackGainCrit(numCard(v, 'GREEN')), 0);
  }
});

test('DesertSobek attack 0: scales with positive stacks; unblockable below 4', () => {
  const m = getBoss('DesertSobek');
  assert.equal(m.attackDamage(numCard(0), { playerPositiveBuffStacks: 0 }), 0);
  assert.equal(m.attackDamage(numCard(0), { playerPositiveBuffStacks: 1 }), 3);
  assert.equal(m.attackDamage(numCard(0), { playerPositiveBuffStacks: 2 }), 6);
  // Must ignore playerBuffTotal (debuff-mixed)
  assert.equal(m.attackDamage(numCard(0), { playerBuffTotal: 5 }), 0);
  assert.equal(m.attackLush(numCard(0)), 1);
  assert.equal(m.attackLushTarget(numCard(0)), 1);
  assert.equal(m.attackUnblockableBelow(numCard(0)), 4);
  assert.equal(m.attackUnblockableBelow(numCard(1)), 0);
});

test('DesertSobek attack 0 via effect: mutual lush first then scale; <=3 unblockable', (t) => {
  const eng = stagedEngine(t, 2);
  eng.s.player.guard = 0;
  eng.s.player.fly = 0;
  eng.s.player.crit = 0;
  eng.s.player.lush = 0;
  eng.s.player.bleed = 3; // debuff must not count
  eng.s.ai.lush = 0;
  const r = eng.effect('DesertSobek', 0, numCard(0), eng.s.ai, eng.s.player);
  // Mutual lush is applied inside effect before damage, then captureAttackSkill
  // defers/restores statuses — so assert via damage (3 = 1 lush × 3), not live stacks.
  assert.equal(r.d, 3, 'new lush counted as 1 positive stack');
  assert.equal(r.unblock, true, 'damage <=3 is unblockable');
  const pending = eng.s.pendingSkillStatuses || [];
  assert.ok(pending.some(e => e.id === 'lush' && e.target === 'player'), 'player lush queued');
  assert.ok(pending.some(e => e.id === 'lush' && e.target === 'ai'), 'sobek lush queued');
});

test('DesertSobek attack 0: more positive stacks → higher damage, >3 blockable', (t) => {
  const eng = stagedEngine(t, 2);
  eng.s.player.guard = 1;
  eng.s.player.fly = 1;
  eng.s.player.lush = 0;
  eng.s.ai.lush = 0;
  const r = eng.effect('DesertSobek', 0, numCard(0), eng.s.ai, eng.s.player);
  // guard1 + fly1 + new lush1 = 3 → damage 9 > 3 → not unblockable via below
  assert.equal(r.d, 9);
  assert.equal(r.unblock, false);
});

test('DesertSobek defend 1/2/3 heal 3; stage4 heal 4', () => {
  const m = getBoss('DesertSobek');
  for (const v of [1, 2, 3]) assert.equal(m.defendHeal(numCard(v)), 3);
  assert.equal(m.defendHeal(numCard(0)), 0);
  const s4 = applyStageMods(m, 4);
  for (const v of [1, 2, 3]) assert.equal(s4.defendHeal(numCard(v)), 4);
  assert.equal(s4.defendHeal(numCard(0)), 0);
});

test('DesertSobek defend 0: immune; counter only with lush and consumes 1', (t) => {
  const eng = stagedEngine(t, 2);
  eng.s.ai.lush = 0;
  const noLush = defendWith(eng, numCard(0), 8);
  assert.equal(noLush.remaining, 0);
  assert.match(noLush.desc || '', /免疫/);

  eng.s.ai.lush = 2;
  const playerHp = eng.s.player.hp;
  const withLush = defendWith(eng, numCard(0), 8);
  assert.equal(withLush.remaining, 0);
  assert.equal(eng.s.ai.lush, 1, 'consumed 1 lush');
  assert.equal(eng.s.player.hp, playerHp - 3, 'counter 3');
});

test('DesertSobek stage mods: HP+7, attack+1, defendHeal+1', () => {
  const m = getBoss('DesertSobek');
  const s2 = applyStageMods(m, 2);
  assert.equal(s2.hp, 42);
  const s3 = applyStageMods(m, 3);
  assert.equal(s3.attackDamage(numCard(1), {}), 4);
  assert.equal(s3.attackDamage(numCard(4), {}), 6);
  assert.equal(s3.attackDamage(numCard(0), { playerPositiveBuffStacks: 1 }), 4); // 3+1
  const s4 = applyStageMods(m, 4);
  assert.equal(s4.defendHeal(numCard(2)), 4);
});

test('DesertSobek fertility revive: lush>0 clears positive only, hp=15; no lush stays dead', () => {
  const base = getBoss('DesertSobek');
  AdventureMonsterBridge.registerMonsterChar(applyStageMods(base, 2));
  const eng = new AdventureBattleEngine();
  eng.start('Ryan', 'DesertSobek');
  eng.later = () => {};
  eng.s.isAdventure = true;
  eng._adventureEngine = { s: { accessories: [], consumables: [] } };
  if (typeof eng._hasAccessory !== 'function') eng._hasAccessory = () => false;
  if (typeof eng._flashAccessory !== 'function') eng._flashAccessory = () => {};
  if (typeof eng._consumeAccessory !== 'function') eng._consumeAccessory = () => false;

  const events = [];
  const prevEmit = eng.emit.bind(eng);
  eng.emit = (type, text, card, meta) => {
    events.push({ type, text, meta });
    return prevEmit(type, text, card, meta);
  };

  // Without lush → stays dead
  eng.s.ai.hp = 3;
  eng.s.ai.lush = 0;
  eng.s.ai.alive = true;
  eng.hurt(eng.s.ai, 10);
  assert.equal(eng.s.ai.hp, 0);
  assert.equal(eng.s.ai.alive, false);

  // With lush → revive to 15, clear positive, keep debuff
  eng.s.ai.hp = 5;
  eng.s.ai.alive = true;
  eng.s.ai.lush = 2;
  eng.s.ai.guard = 2;
  eng.s.ai.crit = 1;
  eng.s.ai.bleed = 2;
  eng.hurt(eng.s.ai, 20);
  assert.equal(eng.s.ai.hp, 15);
  assert.equal(eng.s.ai.alive, true);
  assert.equal(eng.s.ai.lush || 0, 0);
  assert.equal(eng.s.ai.guard || 0, 0);
  assert.equal(eng.s.ai.crit || 0, 0);
  assert.equal(eng.s.ai.bleed, 2, 'debuffs preserved');
  assert.ok(events.some(e => e.type === 'buff' && e.text === '[丰饶]复活' && e.meta && e.meta.kind === 'fertility'));

  // Multi-revive OK
  eng.s.ai.lush = 1;
  eng.s.ai.hp = 2;
  eng.hurt(eng.s.ai, 50);
  assert.equal(eng.s.ai.hp, 15);
  assert.equal(eng.s.ai.alive, true);

  AdventureMonsterBridge.registerMonsterChar(base);
});

test('DesertSobek panel text matches compact shorthand', () => {
  assert.equal(describe('DesertSobek', numCard(2), false, { stage: 2 }), '3🗡️，施加[流血]');
  assert.equal(describe('DesertSobek', numCard(2), false, { stage: 3 }), '4🗡️，施加[流血]');
  assert.equal(describe('DesertSobek', numCard(5), false, { stage: 2 }), '5🗡️；🟢获得[茂盛]、🟡获得[暴击]');
  assert.equal(describe('DesertSobek', numCard(0), false, { stage: 2 }), '双方获得[茂盛]，对手每层正面buff→3🗡️（≤3不可防御）');
  assert.equal(describe('DesertSobek', numCard(2), true, { stage: 2 }), '回3❤️');
  assert.equal(describe('DesertSobek', numCard(2), true, { stage: 4 }), '回4❤️');
  assert.equal(describe('DesertSobek', numCard(0), true, { stage: 2 }), '免疫所有伤害；有[茂盛]则消耗1层反击3🗡️');
});

test('DesertSobek stage guide + notes present', () => {
  assert.ok(AdventureStageGuide.DesertSobek);
  assert.ok(AdventureStageGuide.DesertSobek.some(x => String(x.stage) === '2'));
  assert.ok(AdventureMonsterNotes.DesertSobek);
  assert.ok(AdventureMonsterNotes.DesertSobek.some(n => n.title === '被动'));
});
