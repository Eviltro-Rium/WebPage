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

const { AdventureRegistry, AdventureLoot, AdventureMonsterBridge, Engine, CharacterRegistry } = context;
const getMonster = name => AdventureRegistry.getMonster(name) || AdventureRegistry.getBoss(name);
const { applyStageMods } = AdventureMonsterBridge;

function numCard(value, color = 'RED') {
  return { value, isNumberCard: true, isItemCard: false, color, isBlack: false, isWhite: false };
}

function blackCard() {
  return { value: -1, isNumberCard: false, isItemCard: true, color: 'BLACK', isBlack: true, isWhite: false };
}

test('FrozenKraken base stats, boss pool from stage 2', () => {
  const m = getMonster('FrozenKraken');
  assert.ok(m);
  assert.equal(m.kind, '克拉肯');
  assert.equal(m.hp, 50);
  assert.equal(m.handLimit, 3);
  assert.equal(m.minStage, 2);
  const pool = context.AdventureBossPool.ocean;
  assert.ok(!pool['*'].includes('FrozenKraken'));
  for (const stage of [2, 3, 4]) {
    assert.ok(pool[stage].includes('FrozenKraken'), 'stage ' + stage);
  }
});

test('FrozenKraken loot: 1-2 diving, 3-4 ice seal, 5-6 hypothermia', () => {
  for (const roll of [1, 2]) {
    const result = AdventureLoot.rollMonsterDrop('ocean', 'FrozenKraken', () => (roll - 1) / 12);
    assert.equal(result.drops.length, 1);
    assert.equal(result.drops[0], 'DivingTrophy');
  }
  for (const roll of [3, 4]) {
    const result = AdventureLoot.rollMonsterDrop('ocean', 'FrozenKraken', () => (roll - 1) / 12);
    assert.equal(result.drops.length, 1);
    assert.equal(result.drops[0], 'IceSealTrophy');
  }
  for (const roll of [5, 6]) {
    const result = AdventureLoot.rollMonsterDrop('ocean', 'FrozenKraken', () => (roll - 1) / 12);
    assert.equal(result.drops.length, 1);
    assert.equal(result.drops[0], 'HypothermiaTrophy');
  }
  for (const roll of [7, 8, 9, 10, 11, 12]) {
    const result = AdventureLoot.rollMonsterDrop('ocean', 'FrozenKraken', () => (roll - 1) / 12);
    assert.equal(result.drops.length, 0);
  }
});

test('FrozenKraken attack hooks', () => {
  const m = getMonster('FrozenKraken');
  for (const v of [4, 5, 6]) {
    assert.equal(m.attackHypothermia(numCard(v)), 1);
    assert.equal(m.attackKrakenJudge(numCard(v)), false);
    assert.equal(m.attackKrakenPurge(numCard(v)), false);
  }
  for (const v of [1, 2, 3]) {
    assert.equal(m.attackKrakenJudge(numCard(v)), true);
    assert.equal(m.attackKrakenPurge(numCard(v)), false);
    assert.equal(m.attackHypothermia(numCard(v)), 0);
  }
  assert.equal(m.attackKrakenPurge(numCard(0)), true);
  assert.equal(m.attackUnblockableBelow(numCard(0)), 5);
  assert.equal(m.attackUnblockableBelow(numCard(5)), 0);
});

test('FrozenKraken defend hooks', () => {
  const m = getMonster('FrozenKraken');
  for (const v of [1, 2, 3]) {
    assert.equal(m.defendCounter(numCard(v), 8), 4);
    assert.equal(m.defendCounter(numCard(v), 5), 3);
    assert.equal(m.defendGainDiving(numCard(v)), true);
    assert.equal(m.defendPlayerDiscard(numCard(v)), false);
  }
  assert.equal(m.defendGainDiving(numCard(0)), false);
  assert.equal(m.defendCounter(numCard(0), 8), 8);
  assert.equal(m.defendPlayerDiscard(numCard(0)), true);
});

test('FrozenKraken stage mods', () => {
  const m = getMonster('FrozenKraken');
  const s2 = applyStageMods(m, 2);
  assert.equal(s2.hp, 56);
  const s3 = applyStageMods(m, 3);
  assert.equal(s3.attackUnblockableBelow(numCard(5)), 5);
  assert.equal(s3.attackUnblockableBelow(numCard(0)), 5);
  const s4 = applyStageMods(m, 4);
  assert.equal(s4.defendHeal(numCard(2)), 1);
  assert.equal(s4.defendHeal(numCard(0)), 1);
  assert.equal(s4.attackUnblockableBelow(numCard(5)), 5, 'stage4 keeps stage3 weak-unblock');
});

function judgedBattle(judgedCard) {
  const eng = new Engine();
  eng.start('Ryan', 'FrozenKraken');
  eng.later = () => {};
  eng.piles = {
    player: { deck: [judgedCard], discard: [], hand: [] },
    ai: { deck: [], discard: [], hand: [] }
  };
  return eng;
}

test('FrozenKraken 1/2/3: normal color deals value and returns card to deck', () => {
  const eng = judgedBattle(numCard(5, 'GREEN'));
  const r = eng.effect('FrozenKraken', 2, numCard(2), eng.s.ai, eng.s.player);
  assert.equal(r.d, 5);
  assert.equal(eng.piles.player.discard.length, 0);
  assert.equal(eng.piles.player.deck.length, 1);
  assert.equal(eng.piles.player.deck[0].value, 5);
  assert.ok(eng.events.some(e => e.type === 'reveal'));
});

test('FrozenKraken 1/2/3: black card deals 0, discards, unblock, diving, ice seal', () => {
  const eng = judgedBattle(blackCard());
  const r = eng.effect('FrozenKraken', 1, numCard(1), eng.s.ai, eng.s.player);
  assert.equal(r.d, 0);
  assert.equal(r.unblock, true);
  assert.equal(eng.piles.player.deck.length, 0);
  assert.equal(eng.piles.player.discard.length, 1);
  assert.equal(eng.s.ai.diving, true);
  assert.ok(eng.s.player.iceSeal);
});

test('FrozenKraken 0: purge counts cleared layers into damage', () => {
  const eng = new Engine();
  eng.start('Ryan', 'FrozenKraken');
  eng.later = () => {};
  eng.s.ai.burn = 2;
  eng.s.ai.poison = 1;
  const r = eng.effect('FrozenKraken', 0, numCard(0), eng.s.ai, eng.s.player);
  assert.equal(r.d, 6);
  assert.equal(r.unblock, false);
  assert.equal(eng.s.ai.burn, 0);
  assert.equal(eng.s.ai.poison, 0);
  assert.equal(eng.s.player.hypothermia, 1);
});

test('FrozenKraken 0: damage below 5 is unblockable', () => {
  const eng = new Engine();
  eng.start('Ryan', 'FrozenKraken');
  eng.later = () => {};
  const r = eng.effect('FrozenKraken', 0, numCard(0), eng.s.ai, eng.s.player);
  assert.equal(r.d, 3);
  assert.equal(r.unblock, true);
});

test('FrozenKraken 0 defense marks player discard choice', () => {
  const eng = new Engine();
  eng.start('Ryan', 'FrozenKraken');
  eng.later = () => {};
  const before = eng.h.player.length;
  assert.ok(before > 0);
  const charDef = CharacterRegistry.get('FrozenKraken');
  const out = charDef.defend(
    eng, 'FrozenKraken', 0, 6, numCard(0), eng.s.ai, eng.s.player, 'ai', 'RED',
    { heal: (x, n) => { x.hp += n; }, hurt: (x, n) => { x.hp -= n; } }
  );
  assert.equal(eng.s.player.hp, 70 - 6);
  assert.equal(eng.s.pendingKrakenDefendDiscard, true);
  assert.ok(eng.events.some(e => e.desc && e.desc.includes('弃掉')));
});

test('FrozenKraken defend discard flow completes and resumes play', () => {
  const eng = new Engine();
  eng.start('Ryan', 'FrozenKraken');
  eng.later = () => {};
  eng.s.pendingKrakenDefendDiscard = true;
  eng.s.phase = 'PLAYER_DISCARD';
  eng.s.busy = false;
  eng.s.forcedDiscard = true;
  eng.s.selectedCards = [0];
  const before = eng.h.player.length;
  const st = eng.confirmDiscard();
  assert.equal(eng.h.player.length, before - 1);
  assert.equal(eng.s.pendingKrakenDefendDiscard, false);
  assert.equal(st.phase, 'PLAYER_PLAY');
});

test('defend-heal branch no longer throws and keeps counter (samoyed)', () => {
  const eng = new Engine();
  eng.start('Ryan', 'FrozenOceanSamoyed');
  eng.later = () => {};
  const charDef = CharacterRegistry.get('FrozenOceanSamoyed');
  const frozenPlayer = Object.assign({}, eng.s.player, { frozen: true });
  const out = charDef.defend(
    eng, 'FrozenOceanSamoyed', 2, 6, numCard(2), eng.s.ai, frozenPlayer, 'ai', 'RED',
    { heal: (x, n) => { x.hp += n; }, hurt: (x, n) => { x.hp -= n; } }
  );
  assert.equal(eng.s.ai.hp, 20 + 1);
  assert.equal(frozenPlayer.hp, 70 - 3);
  assert.ok(out.desc.includes('反击'));
});

test('FrozenKraken skill desc', () => {
  const { getAdventureNpcSkillDesc } = AdventureMonsterBridge;
  const atk2 = getAdventureNpcSkillDesc('FrozenKraken', numCard(2), false, { stage: 1 });
  assert.ok(atk2.includes('判定'));
  assert.ok(atk2.includes('对应数字'));
  assert.ok(atk2.includes('数字零'));
  const atk5 = getAdventureNpcSkillDesc('FrozenKraken', numCard(5), false, { stage: 1 });
  assert.ok(atk5.includes('手牌数'));
  assert.ok(atk5.includes('失温'));
  const atk0 = getAdventureNpcSkillDesc('FrozenKraken', numCard(0), false, { stage: 1 });
  assert.ok(atk0.includes('清除自身'));
  assert.ok(atk0.includes('不可防御'));
  const def2 = getAdventureNpcSkillDesc('FrozenKraken', numCard(2), true, { stage: 1 });
  assert.ok(def2.includes('一半'));
  assert.ok(def2.includes('潜水'));
  const def2s4 = getAdventureNpcSkillDesc('FrozenKraken', numCard(2), true, { stage: 4 });
  assert.ok(def2s4.includes('恢复1点生命'));
  const def0 = getAdventureNpcSkillDesc('FrozenKraken', numCard(0), true, { stage: 1 });
  assert.ok(def0.includes('相同点'));
  assert.ok(def0.includes('弃掉'));
});
