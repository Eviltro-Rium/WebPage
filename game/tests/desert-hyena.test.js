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

const { AdventureRegistry, AdventureLoot, AdventureMonsterBridge, Engine, CharacterRegistry } = context;
const { applyStageMods, getAdventureNpcSkillDesc: describe } = AdventureMonsterBridge;
const getBoss = name => AdventureRegistry.getBoss(name);

function numCard(value, color = 'RED') {
  return { value, isNumberCard: true, isItemCard: false, color, isBlack: false, isWhite: false };
}

function blackCard() {
  return { value: -1, isNumberCard: false, isItemCard: true, color: 'BLACK', isBlack: true, isWhite: false };
}

function stagedEngine(t, stage = 2) {
  const base = getBoss('DesertHyena');
  AdventureMonsterBridge.registerMonsterChar(applyStageMods(base, stage));
  t.after(() => AdventureMonsterBridge.registerMonsterChar(base));
  const eng = new Engine();
  eng.start('Ryan', 'DesertHyena');
  eng.later = () => {};
  eng.s.isAdventure = true;
  return eng;
}

function defendWith(eng, card, incoming) {
  return CharacterRegistry.get('DesertHyena').defend(
    eng, 'DesertHyena', card.value, incoming, card, eng.s.ai, eng.s.player, 'ai', card.color, {
      heal: (x, n) => eng.heal(x, n), hurt: (x, n) => eng.hurt(x, n),
      counter: (x, n) => eng.counterAttack(eng.s.ai, x, n),
      clearDebuffs: x => eng.clearDebuffs(x),
      burn: (x, n) => eng.burn(x, n), bleed: (x, n) => eng.bleed(x, n), poison: (x, n) => eng.poison(x, n),
      draw: (w, n, an) => eng.draw(w, n, an)
    }
  );
}

test('DesertHyena base stats, boss pool, icon, whiteZeros', () => {
  const m = getBoss('DesertHyena');
  assert.ok(m);
  assert.equal(m.kind, '嘲风鬣狗');
  assert.equal(m.hp, 40);
  assert.equal(m.minStage, 2);
  assert.equal(m.whiteZeros, 2);
  assert.equal(m.handLimit, 3);
  assert.equal(m.icon, '../icons/npc_icons/desert_hyena.webp');
  assert.ok(fs.existsSync(path.join(gameRoot, 'icons/npc_icons/desert_hyena.webp')));
  const pool = context.AdventureBossPool.desert;
  for (const stage of [2, 3, 4]) {
    assert.ok(pool[stage].includes('DesertHyena'), 'stage ' + stage);
    assert.ok(pool[stage].includes('Pharaoh'), 'Pharaoh still in stage ' + stage);
  }
});

test('DesertHyena loot: rolls 1-6 drop ZeroTrophy', () => {
  for (const roll of [1, 2, 3, 4, 5, 6]) {
    const r = AdventureLoot.rollMonsterDrop('desert', 'DesertHyena', () => (roll - 1) / 12);
    assert.deepEqual(Array.from(r.drops), ['ZeroTrophy']);
  }
  for (const roll of [7, 12]) {
    assert.equal(AdventureLoot.rollMonsterDrop('desert', 'DesertHyena', () => (roll - 1) / 12).drops.length, 0);
  }
});

test('DesertHyena attack 1/2/3 scales with bleed (base 2)', () => {
  const m = getBoss('DesertHyena');
  for (const v of [1, 2, 3]) {
    assert.equal(m.attackDamage(numCard(v), { playerBleed: 0 }), 2);
    assert.equal(m.attackDamage(numCard(v), { playerBleed: 1 }), 4);
    assert.equal(m.attackDamage(numCard(v), { playerBleed: 3 }), 8);
    assert.equal(m.attackBleed(numCard(v)), 0);
    assert.equal(m.attackGainCrit(numCard(v)), 0);
    assert.equal(m.attackHyenaJudge(numCard(v)), false);
  }
});

test('DesertHyena attack 4/5/6: bleed + crit + hand-size damage', () => {
  const m = getBoss('DesertHyena');
  for (const v of [4, 5, 6]) {
    assert.equal(m.attackDamage(numCard(v), { playerHandSize: 0 }), 0);
    assert.equal(m.attackDamage(numCard(v), { playerHandSize: 3 }), 3);
    assert.equal(m.attackBleed(numCard(v)), 1);
    assert.equal(m.attackGainCrit(numCard(v)), 1);
    assert.equal(m.attackHyenaJudge(numCard(v)), false);
  }
});

test('DesertHyena attack 0 judge hook only on zero', () => {
  const m = getBoss('DesertHyena');
  assert.equal(m.attackHyenaJudge(numCard(0)), true);
  assert.equal(m.attackDamage(numCard(0), {}), 0);
});

test('DesertHyena defend hooks', () => {
  const m = getBoss('DesertHyena');
  for (const v of [1, 2, 3]) {
    assert.equal(m.defendCounter(numCard(v), 8), 4);
    assert.equal(m.defendCounter(numCard(v), 5), 3);
    assert.equal(m.defendGainCrit(numCard(v)), 0);
    assert.equal(m.defendPlayerDiscard(numCard(v)), false);
  }
  assert.equal(m.defendCounter(numCard(0), 8), 6);
  assert.equal(m.defendGainCrit(numCard(0)), 1);
  assert.equal(m.defendPlayerDiscard(numCard(0)), true);
});

test('DesertHyena stage mods', () => {
  const m = getBoss('DesertHyena');
  const s2 = applyStageMods(m, 2);
  assert.equal(s2.hp, 50);
  assert.equal(typeof s2.attackUnblockable, 'undefined');
  const s3 = applyStageMods(m, 3);
  assert.equal(s3.hp, 50);
  assert.equal(s3.attackUnblockable(numCard(2, 'YELLOW')), true);
  assert.equal(s3.attackUnblockable(numCard(5, 'RED')), false);
  assert.equal(s3.attackUnblockable(Object.assign(numCard(4, 'WILD'), { chosenColor: 'YELLOW' })), true);
  const s4 = applyStageMods(m, 4);
  assert.equal(s4.hp, 50);
  assert.equal(s4.defendHeal(numCard(2)), 1);
  assert.equal(s4.defendHeal(numCard(0)), 1);
  assert.equal(s4.attackUnblockable(numCard(1, 'YELLOW')), true);
});

test('DesertHyena 0: number card deals ceil(value*1.5) and always discards', () => {
  const eng = new Engine();
  eng.start('Ryan', 'DesertHyena');
  eng.later = () => {};
  eng.piles = {
    player: { deck: [numCard(5, 'GREEN')], discard: [], hand: [] },
    ai: { deck: [], discard: [], hand: [] }
  };
  const r = eng.effect('DesertHyena', 0, numCard(0), eng.s.ai, eng.s.player);
  assert.equal(r.d, 8);
  assert.equal(eng.piles.player.deck.length, 0);
  assert.equal(eng.piles.player.discard.length, 1);
  assert.equal(eng.piles.player.discard[0].value, 5);
});

test('DesertHyena 0: non-number applies 2 bleed + thorns and draws 1', () => {
  const eng = new Engine();
  eng.start('Ryan', 'DesertHyena');
  eng.later = () => {};
  eng.piles = {
    player: { deck: [blackCard()], discard: [], hand: [] },
    ai: { deck: [numCard(3), numCard(4), numCard(5)], discard: [], hand: [] }
  };
  const handBefore = eng.h.ai.length;
  const r = eng.effect('DesertHyena', 0, numCard(0), eng.s.ai, eng.s.player);
  assert.equal(r.d, 0);
  assert.equal(eng.piles.player.discard.length, 1);
  assert.equal(eng.s.player.bleed, 2);
  assert.equal(eng.s.player.thorns, 1);
  assert.equal(eng.h.ai.length, handBefore + 1);
});

test('DesertHyena 0: number 0 card fails like non-number', () => {
  const eng = new Engine();
  eng.start('Ryan', 'DesertHyena');
  eng.later = () => {};
  eng.piles = {
    player: { deck: [numCard(0, 'RED')], discard: [], hand: [] },
    ai: { deck: [numCard(2)], discard: [], hand: [] }
  };
  const r = eng.effect('DesertHyena', 0, numCard(0), eng.s.ai, eng.s.player);
  assert.equal(r.d, 0);
  assert.equal(eng.s.player.bleed, 2);
  assert.equal(eng.s.player.thorns, 1);
});

test('DesertHyena stage3 yellow attack is unblockable without spending crit', (t) => {
  const eng = stagedEngine(t, 3);
  eng.s.ai.crit = 2;
  const r = eng.effect('DesertHyena', 2, numCard(2, 'YELLOW'), eng.s.ai, eng.s.player);
  assert.equal(r.d, 2);
  assert.equal(r.unblock, true);
  assert.equal(eng.s.ai.crit, 2, 'stage3 yellow unblock does not consume crit');
});

test('DesertHyena stage4 defend heal on 1/2/3 and 0', (t) => {
  const eng = stagedEngine(t, 4);
  eng.s.ai.hp = 20;
  defendWith(eng, numCard(2), 8);
  assert.equal(eng.s.ai.hp, 21);
  eng.s.ai.hp = 20;
  eng.s.ai.crit = 0;
  defendWith(eng, numCard(0), 8);
  assert.equal(eng.s.ai.hp, 21);
  assert.equal(eng.s.ai.crit, 1);
  assert.equal(eng.s.pendingKrakenDefendDiscard, true);
});

test('DesertHyena defend 1/2/3 counters half incoming', (t) => {
  const eng = stagedEngine(t, 2);
  const playerHp = eng.s.player.hp;
  defendWith(eng, numCard(1), 7);
  assert.equal(eng.s.player.hp, playerHp - 4);
});

test('DesertHyena skill panel text (compact)', () => {
  const low = describe('DesertHyena', numCard(2), false, { stage: 2 });
  assert.match(low, /2\+玩家\[流血\]层数×2🗡️/);
  const high = describe('DesertHyena', numCard(5), false, { stage: 2 });
  assert.match(high, /施加\[流血\]/);
  assert.match(high, /获得\[暴击\]/);
  assert.match(high, /手牌/);
  const zero = describe('DesertHyena', numCard(0), false, { stage: 2 });
  assert.match(zero, /翻开牌库顶1🃏/);
  assert.match(zero, /1\.5/);
  assert.match(zero, /流血/);
  assert.match(zero, /荆棘/);
  assert.match(zero, /抽1🃏/);
  const defLow = describe('DesertHyena', numCard(2), true, { stage: 2 });
  assert.match(defLow, /反击一半伤害/);
  const def0 = describe('DesertHyena', numCard(0), true, { stage: 2 });
  assert.match(def0, /反击6🗡️/);
  assert.match(def0, /暴击/);
  assert.match(def0, /弃1🃏/);
  const def0s4 = describe('DesertHyena', numCard(0), true, { stage: 4 });
  assert.match(def0s4, /回1❤️/);
  const highS3 = describe('DesertHyena', numCard(5), false, { stage: 3 });
  assert.match(highS3, /不可防御/);
});

test('DesertHyena mock: one roll per defend phase; matching color nullifies', (t) => {
  const eng = stagedEngine(t, 2);
  eng.s.isAdventure = true;
  const rolls = [];
  eng.rollD12 = () => (rolls.length ? rolls.shift() : 2);
  rolls.push(2); // 1-3 → RED
  eng._rollAdventureDefendPhaseMocks();
  assert.equal(eng.s.ai.mockAttackColor, 'RED');
  assert.equal(eng.s.ai.tauntMark, true);
  // Same phase: two attacks share the roll; no second d12
  assert.equal(eng._applyAdventureDefendPhaseMock(eng.s.ai, numCard(4, 'RED')), true);
  assert.equal(eng._applyAdventureDefendPhaseMock(eng.s.ai, numCard(3, 'YELLOW')), false);
  assert.equal(eng.s.ai.mockAttackColor, 'RED');
  assert.equal(rolls.length, 0, 'must not re-roll mid-phase');
});

test('DesertHyena mock: new defend phase re-rolls; attack phase clears mark', (t) => {
  const eng = stagedEngine(t, 2);
  eng.s.isAdventure = true;
  const rolls = [];
  eng.rollD12 = () => (rolls.length ? rolls.shift() : 2);
  rolls.push(2); // RED
  eng.turnStart('player');
  assert.equal(eng.s.ai.mockAttackColor, 'RED');
  assert.equal(eng.s.ai.tauntMark, true);
  assert.equal(eng._applyAdventureDefendPhaseMock(eng.s.ai, numCard(5, 'RED')), true);

  // Hyena enters attack → clear
  eng.turnStart('ai');
  assert.equal(eng.s.ai.mockAttackColor, null);
  assert.equal(eng.s.ai.tauntMark, false);
  assert.equal(eng._applyAdventureDefendPhaseMock(eng.s.ai, numCard(5, 'RED')), false);

  // Next defend phase → new roll
  rolls.push(5); // YELLOW
  eng.turnStart('player');
  assert.equal(eng.s.ai.mockAttackColor, 'YELLOW');
  assert.equal(eng.s.ai.tauntMark, true);
  assert.equal(eng._applyAdventureDefendPhaseMock(eng.s.ai, numCard(4, 'YELLOW')), true);
  assert.equal(eng._applyAdventureDefendPhaseMock(eng.s.ai, numCard(4, 'RED')), false);
});

test('DesertHyena onEnterDefendPhase maps d12 to four colors and sets tauntMark', () => {
  const m = getBoss('DesertHyena');
  const entity = { name: '沙漠鬣狗' };
  const events = [];
  const eng = {
    rollD12: () => eng._roll,
    emit: (type, desc, card, extra) => events.push({ type, desc, extra }),
    _who: () => 'ai'
  };
  const expected = [
    [1, 'RED'], [3, 'RED'], [4, 'YELLOW'], [6, 'YELLOW'],
    [7, 'BLUE'], [9, 'BLUE'], [10, 'GREEN'], [12, 'GREEN']
  ];
  for (const [roll, color] of expected) {
    eng._roll = roll;
    events.length = 0;
    assert.equal(m.onEnterDefendPhase(eng, entity), color);
    assert.equal(entity.mockAttackColor, color);
    assert.equal(entity.tauntMark, true);
    assert.ok(events.some(e => e.type === 'buff' && e.extra && e.extra.kind === 'taunt'));
  }
  m.clearDefendPhaseMock(eng, entity);
  assert.equal(entity.mockAttackColor, null);
  assert.equal(entity.tauntMark, false);
});
