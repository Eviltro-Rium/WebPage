const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const gameRoot = path.resolve(__dirname, '..');
const characterFiles = [
  'registry.js',
  'knight.js',
  'leon.js',
  'ryan.js',
  'blaze.js',
  'serenity.js',
  'saiki.js',
  'moze.js',
  'chan.js'
].map(file => path.join(gameRoot, 'js', 'characters', file));
const aiFiles = [
  'registry.js',
  'knight_ai.js',
  'leon_ai.js',
  'ryan_ai.js',
  'blaze_ai.js',
  'serenity_ai.js',
  'saiki_ai.js',
  'moze_ai.js',
  'chan_ai.js'
].map(file => path.join(gameRoot, 'js', 'ai', file));

const context = vm.createContext({
  console,
  Math,
  JSON,
  setTimeout: () => 1,
  clearTimeout: () => {},
  performance: { now: () => 0 }
});
context.window = context;

for (const file of [
  ...characterFiles,
  path.join(gameRoot, 'js', 'combat', 'protocol.js'),
  path.join(gameRoot, 'js', 'combat', 'runtime.js'),
  path.join(gameRoot, 'js', 'combat', 'events.js'),
  path.join(gameRoot, 'js', 'combat', 'state.js'),
  path.join(gameRoot, 'js', 'combat', 'deck.js'),
  path.join(gameRoot, 'js', 'combat', 'piles.js'),
  path.join(gameRoot, 'js', 'combat', 'status_registry.js'),
  path.join(gameRoot, 'js', 'combat', 'status_service.js'),
  path.join(gameRoot, 'js', 'combat', 'status.js'),
  path.join(gameRoot, 'js', 'combat', 'damage.js'),
  path.join(gameRoot, 'js', 'combat', 'modes.js'),
  path.join(gameRoot, 'js', 'combat', 'deck_port.js'),
  path.join(gameRoot, 'js', 'combat', 'turn_machine.js'),
  path.join(gameRoot, 'js', 'combat', 'card_effects.js'),
  path.join(gameRoot, 'js', 'combat', 'opponent_hand_policy.js'),
  path.join(gameRoot, 'js', 'combat', 'engine.js'),
  path.join(gameRoot, 'js', 'combat', 'engine_1v2.js'),
  path.join(gameRoot, 'js', 'combat', 'engine_turns.js'),
  path.join(gameRoot, 'js', 'combat', 'engine_attack.js'),
  path.join(gameRoot, 'js', 'combat', 'engine_ai.js'),
  ...aiFiles
]) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { AIRegistry, CharacterRegistry, Engine } = context;

function number(value, color = 'RED', white = false) {
  return {
    value,
    color: white ? 'WHITE' : color,
    drawTwo: false,
    drawThree: false,
    potion: false,
    purify: false,
    superPurify: false,
    swapHand: false,
    shuffleToDeck: false,
    isBlack: false,
    isWhite: white,
    isNumberCard: true,
    isItemCard: false
  };
}

function item(kind, color = 'WHITE') {
  return {
    value: -1,
    color,
    drawTwo: kind === 'drawTwo',
    drawThree: kind === 'drawThree',
    potion: kind === 'potion',
    purify: kind === 'purify',
    superPurify: kind === 'superPurify',
    swapHand: kind === 'swap',
    shuffleToDeck: kind === 'shuffle',
    isBlack: color === 'BLACK',
    isWhite: color === 'WHITE',
    isNumberCard: false,
    isItemCard: true
  };
}

function setup(aiName) {
  const engine = new Engine();
  engine.start('Ryan', aiName);
  engine.s.discardTop = number(3);
  engine.h.ai = [];
  engine.h.player = [];
  engine.deck = [];
  engine.discardBottom = [];
  return engine;
}

for (const [label, card, baseDamage, burns] of [
  ['zero', number(0, 'GREEN'), 4, true],
  ['item', item('potion'), 4, true],
  ['number', number(6), 6, false]
]) {
  for (const existingBurn of [0, 1]) {
    test(`Blaze 4 AI draws ${label} with ${existingBurn} existing burn`, () => {
      const engine = setup('Blaze');
      engine.h.player = [card];
      engine.s.atkOwner = 'ai';
      engine.s.ai.burn = existingBurn;
      const result = engine.aiSpecialEffect('Blaze', 4, number(4));
      assert.equal(result.d, baseDamage + existingBurn);
      assert.equal(result.skip, false);
      assert.equal(engine.h.player.length, 0);
      assert.equal(engine.h.ai.length, 0);
      assert.equal(engine.discardBottom.at(-1).value, card.value);
      assert.equal(engine.s.ai.burn, existingBurn);
      assert.equal(engine.s.player.burn, 0);
      engine.commitAttackStatuses('afterDamage');
      assert.equal(engine.s.ai.burn, existingBurn + (burns ? 1 : 0));
      assert.equal(engine.s.player.burn, burns ? 1 : 0);
    });
  }
}

test('Blaze 4 applies burn only to the selected challenge opponent', () => {
  const engine = new Engine();
  engine.start1v2('Blaze', 'Ryan', 'Ryan');
  engine.s.attackTarget = 'ai2';
  engine.h.ai = [number(5)];
  engine.h.ai2 = [number(0)];
  engine.s.pendingOpponentSkill = {name:'Blaze', value:4, attackCard:number(4), targetKey:'ai2'};
  engine.s.selectedAICard = 0;
  engine.finishOpponentAttack = (_pending, damage) => damage;
  assert.equal(engine.resolveOpponentHandCard(), 4);
  engine.commitAttackStatuses('afterDamage');
  assert.equal(engine.s.player.burn, 1);
  assert.equal(engine.s.ai.burn, 0);
  assert.equal(engine.s.ai2.burn, 1);
  assert.equal(engine.h.ai.length, 1);
  assert.equal(engine.h.ai2.length, 0);
});

test('Blaze 4 opponent empty hand matches no-number branch', () => {
  const engine = new Engine();
  engine.start('Blaze', 'Ryan');
  engine.s.player.burn = 1;
  engine.h.ai = [];
  engine.s.pendingOpponentSkill = { name: 'Blaze', value: 4, attackCard: number(4) };
  engine.finishOpponentAttack = (_p, damage) => ({ damage, skip: false });
  const result = engine.resolveOpponentHandSkill(engine.s.pendingOpponentSkill);
  assert.equal(result.damage, 5);
  engine.commitAttackStatuses('afterDamage');
  assert.equal(engine.s.player.burn, 2);
  assert.equal(engine.s.ai.burn, 1);
});

test('Blaze 4 AI empty opponent hand', () => {
  const engine = setup('Blaze');
  engine.h.player = [];
  engine.s.atkOwner = 'ai';
  engine.s.ai.burn = 0;
  const result = engine.aiSpecialEffect('Blaze', 4, number(4));
  assert.equal(result.d, 4);
  assert.equal(engine.s.ai.burn, 0);
  assert.equal(engine.s.player.burn, 0);
  engine.commitAttackStatuses('afterDamage');
  assert.equal(engine.s.ai.burn, 1);
  assert.equal(engine.s.player.burn, 1);
});

for (const [label, card, baseDamage, burns] of [
  ['zero', number(0), 4, true], ['item', item('potion'), 4, true], ['number', number(6), 6, false]
]) {
  for (const existingBurn of [0, 1]) {
    test(`Blaze 4 player draws ${label} with ${existingBurn} existing burn`, () => {
      const engine = new Engine();
      engine.start('Blaze', 'Ryan');
      engine.s.player.burn = existingBurn;
      engine.h.ai = [card];
      engine.s.pendingOpponentSkill = {name:'Blaze', value:4, attackCard:number(4)};
      engine.s.selectedAICard = 0;
      engine.finishOpponentAttack = (_pending, damage, skip) => ({damage, skip});
      const result = engine.resolveOpponentHandCard();
      assert.equal(result.damage, baseDamage + existingBurn);
      assert.equal(result.skip, false);
      assert.equal(engine.h.ai.length, 0);
      assert.equal(engine.discardBottom.at(-1).value, card.value);
      assert.equal(engine.s.player.burn, existingBurn);
      assert.equal(engine.s.ai.burn, 0);
      engine.commitAttackStatuses('afterDamage');
      assert.equal(engine.s.player.burn, existingBurn + (burns ? 1 : 0));
      assert.equal(engine.s.ai.burn, burns ? 1 : 0);
    });
  }
}

