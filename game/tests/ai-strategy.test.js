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
  path.join(gameRoot, 'js', 'combat_events.js'),
  path.join(gameRoot, 'js', 'engine_piles.js'),
  path.join(gameRoot, 'js', 'engine_status.js'),
  path.join(gameRoot, 'js', 'engine_damage.js'),
  path.join(gameRoot, 'js', 'engine_modes.js'),
  path.join(gameRoot, 'js', 'engine.js'),
  ...aiFiles
]) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { AIRegistry, Engine } = context;

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

test('all eight characters have complete independent AI strategies', () => {
  assert.deepEqual(
    Array.from(AIRegistry.names()).sort(),
    ['Blaze', 'Chan', 'Knight', 'Leon', 'Moze', 'Ryan', 'Saiki', 'Serenity'].sort()
  );
  for (const role of AIRegistry.all()) {
    for (const method of ['attackScore', 'defendScore', 'keepScore', 'skip', 'specialEffect']) {
      assert.equal(typeof role[method], 'function', `${role.name}.${method}`);
    }
  }
});

test('Ryan value 5 consumes the best extra card for lethal damage', () => {
  const engine = setup('Ryan');
  engine.s.player.hp = 8;
  engine.h.ai = [number(6), number(2)];
  engine.s.atkOwner = 'ai';

  const result = engine.aiSpecialEffect('Ryan', 5, number(5));

  assert.equal(result.d, 9);
  assert.deepEqual(engine.h.ai.map(card => card.value), [2]);
  assert.equal(engine.discardBottom.at(-1).value, 6);
});

test('Leon value 7 applies burn and really discards the stolen card', () => {
  const engine = setup('Leon');
  engine.h.player = [number(4, 'BLUE')];
  engine.s.atkOwner = 'ai';

  const result = engine.aiSpecialEffect('Leon', 7, number(7));

  assert.equal(result.d, 6);
  assert.equal(engine.s.player.burn, 2);
  assert.equal(engine.h.player.length, 0);
  assert.equal(engine.discardBottom.at(-1).value, 4);
});

test('Blaze value 4 keeps a stolen zero and converts it into burn setup', () => {
  const engine = setup('Blaze');
  engine.h.player = [number(0, 'GREEN')];
  engine.s.atkOwner = 'ai';

  const result = engine.aiSpecialEffect('Blaze', 4, number(4));

  assert.equal(result.skip, true);
  assert.equal(engine.h.ai[0].value, 0);
  assert.equal(engine.s.ai.burn, 1);
  assert.equal(engine.s.player.burn, 1);
});

test('Chan value 4 trades its weakest card for a valuable stolen card', () => {
  const engine = setup('Chan');
  engine.h.ai = [number(1)];
  engine.h.player = [number(0, 'BLUE')];
  engine.s.atkOwner = 'ai';

  const result = engine.aiSpecialEffect('Chan', 4, number(4));

  assert.equal(result.d, 0);
  assert.equal(engine.h.ai[0].value, 0);
  assert.equal(engine.h.player[0].value, 1);
});

test('Moze value 4 spends only enough value to reach guard cap', () => {
  const engine = setup('Moze');
  engine.s.ai.guard = 4;
  engine.h.ai = [number(1), number(7)];
  engine.s.atkOwner = 'ai';

  engine.aiSpecialEffect('Moze', 4, number(4));

  assert.equal(engine.s.ai.guard, 5);
  assert.deepEqual(engine.h.ai.map(card => card.value), [7]);
  assert.equal(engine.s.discardTop.value, 3);
  assert.equal(engine.discardBottom.at(-1).value, 1);
});

test('player Moze value 4 also sends its judge card to discard bottom', () => {
  const engine = setup('Ryan');
  engine.s.player = engine.character('Moze');
  engine.s.phase = 'SAIKI_SIX_JUDGE';
  engine.s.pendingNumberJudge = { type: 'Moze', attackCard: number(4) };
  engine.s.selectedCard = 0;
  engine.h.player = [number(5, 'BLUE')];

  engine.finishNumberJudge();

  assert.equal(engine.s.discardTop.value, 3);
  assert.equal(engine.discardBottom.at(-1).value, 5);
  assert.equal(engine.s.player.guard, 5);
});

test('Saiki value 6 prefers a yellow judge when its bleed payoff wins', () => {
  const engine = setup('Saiki');
  engine.h.ai = [number(5, 'YELLOW'), number(7, 'RED')];
  engine.s.atkOwner = 'ai';

  const result = engine.aiSpecialEffect('Saiki', 6, number(6));

  assert.equal(result.d, 8);
  assert.equal(engine.s.player.bleed, 1);
  assert.deepEqual(engine.h.ai.map(card => card.value), [7]);
});

test('Serenity value 7 does not friendly-fire the second AI in 1v2', () => {
  const engine = setup('Serenity');
  engine.s.is1v2 = true;
  engine.s.ai2 = engine.character('Moze', true);
  engine.s.ai2.name = 'AI2 Moze';
  engine.s.ai.hp = 50;
  engine.s.atkOwner = 'ai';

  const result = engine.aiSpecialEffect('Serenity', 7, number(7));

  assert.equal(result.d, 5);
  assert.equal(result.unblock, true);
  assert.equal(engine.s.ai.hp, 48);
  assert.equal(engine.s.ai2.hp, engine.s.ai2.maxHp);
});

test('bloodthirst Serenity value 0 resets both hands without an undefined target', () => {
  const engine = setup('Serenity');
  engine.s.ai.hp = 20;
  engine.h.ai = [number(2), number(3)];
  engine.h.player = [number(1), number(4)];
  engine.deck = [number(6), number(5), number(4), number(3), number(2), number(1)];
  engine.s.atkOwner = 'ai';

  const result = engine.aiSpecialEffect('Serenity', 0, number(0));

  assert.equal(result.skip, true);
  assert.equal(engine.s.ai.hp, 27);
  assert.equal(engine.h.ai.length, 4);
  assert.equal(engine.h.player.length, 1);
  assert.equal(engine.discardBottom.length, 4);
});

test('Knight value 0 delegates damage once and keeps its setup option', () => {
  const engine = setup('Knight');
  engine.s.is1v2 = true;
  engine.s.atkOwner = 'ai';
  const knight = engine.s.ai;
  knight.chaos_red = true;
  knight.chaos_yellow = true;
  knight.chaos_blue = true;
  knight.chaos_green = true;
  const hpBefore = engine.s.player.hp;

  const result = engine.aiSpecialEffect('Knight', 0, number(0));

  assert.equal(result.d, 8);
  assert.equal(result.skip, false);
  assert.equal(result.unblock, true);
  assert.equal(engine.s.player.hp, hpBefore);

  knight.chaos_red = false;
  knight.chaos_yellow = false;
  knight.chaos_blue = false;
  knight.chaos_green = false;
  const setupResult = engine.aiSpecialEffect('Knight', 0, number(0));
  assert.equal(setupResult.d, 6);
  assert.equal(engine.aiSkip('Knight', number(0), engine.aiContext()), false);
  assert.ok(knight.chaos_red && knight.chaos_yellow && knight.chaos_blue && knight.chaos_green);
});

test('defense considers lethal damage and role-aware discard keeps potion', () => {
  const engine = setup('Ryan');
  engine.s.ai.hp = 10;
  const zero = number(0);
  engine.h.ai = [number(2), zero];
  assert.equal(engine.chooseAIDefend(engine.s.discardTop, 12), zero);

  const potion = item('potion');
  engine.h.ai = [potion, number(1), number(2), number(3), number(4), number(5)];
  engine.trimAI();
  assert.equal(engine.h.ai.includes(potion), true);
  assert.equal(engine.h.ai.some(card => card.isNumberCard && card.value === 1), false);
});

test('manual multi-card discard preserves cards and emits animation events', () => {
  const engine = setup('Ryan');
  engine.h.player = [number(1), number(2), number(3)];
  engine.s.phase = 'PLAYER_DISCARD';
  engine.s.mayDiscardAfterSkill = true;
  engine.s.selectedCards = [0, 2];

  engine.confirmDiscard();

  assert.deepEqual(engine.h.player.map(card => card.value), [2]);
  assert.deepEqual(Array.from(engine.discardBottom, card => card.value), [3, 1]);
  const discardEvents = engine.events.filter(event => event.type === 'discard');
  assert.equal(discardEvents.length, 2);
  assert.deepEqual(Array.from(discardEvents, event => event.handIndex), [2, 0]);
});

test('Moze can use value 6 without guard and Saiki saves value 7 for bleed', () => {
  const moze = setup('Moze');
  const six = number(6);
  moze.h.ai = [number(1), six];
  assert.equal(moze.chooseAIPlay(moze.s.discardTop), six);

  const saiki = setup('Saiki');
  const seven = number(7);
  const two = number(2);
  saiki.h.ai = [seven, two];
  assert.equal(saiki.chooseAIPlay(saiki.s.discardTop), two);
});
