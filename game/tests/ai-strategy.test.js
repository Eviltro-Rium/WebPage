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

test('opponent-hand policy keeps skill recognition and mode routing centralized', () => {
  const policy = context.FurryGame.OpponentHandPolicy;
  assert.ok(policy);
  assert.equal(policy.isSkill('Chan', 4), true);
  assert.equal(policy.isSkill('Saiki', 5), true);
  assert.equal(policy.isSkill('Saiki', 3), false);
  assert.equal(policy.isSkill('Otto', 4), false);
  const adventure = { s: { isAdventure: true, is1v2: false } };
  const classic = { s: { isAdventure: false, is1v2: false } };
  assert.equal(policy.strategy(adventure, { owner: 'player' }), 'player');
  assert.equal(policy.strategy(adventure, { owner: 'ai' }), 'random');
  assert.equal(policy.strategy(classic, { owner: 'player' }), 'random');
});

test('opponent-hand skills draw a target card automatically', () => {
  const runtime = context.FurryGame.CombatRuntime;
  runtime.setRandomSource(() => 0.999999);
  try {
    for (const [name, value] of [['Chan', 4], ['Chan', 7], ['Saiki', 5], ['Blaze', 4], ['Moze', 5], ['Leon', 7]]) {
        const engine = new Engine();
        engine.start(name, 'Ryan');
        engine.s.discardTop = number(3);
        engine.s.phase = 'PLAYER_PLAY';
        engine.s.selectedCard = 0;
        engine.h.player = [number(value)];
        engine.h.ai = [number(1), number(6), number(2)];
        engine.deck = [];
        engine.discardBottom = [];

        const state = engine.play();
        assert.notEqual(state.phase, 'OPPONENT_CARD_CHOICE', `${name} still exposes a hand choice phase`);
        assert.equal(engine.h.ai.length, 2, `${name} did not remove one target card`);
        assert.ok(engine.events.some(event => event.type === 'reveal' && /抽取对手手牌/.test(event.desc)), `${name} did not emit a reveal`);
    }
  } finally {
    runtime.resetRandomSource();
  }
});

test('adventure opponent-hand skills let the player choose the visible target card', () => {
  const engine = new Engine();
  engine.start('Chan', 'Ryan');
  engine.s.isAdventure = true;
  engine.s.revealAIHand = true;
  engine.s.discardTop = number(3, 'RED');
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.selectedCard = 0;
  engine.h.player = [number(4, 'RED')];
  engine.h.ai = [number(1, 'BLUE'), number(6, 'GREEN')];
  engine.deck = [];
  engine.discardBottom = [];

  const pending = engine.dispatch('doPlay');
  assert.equal(pending.phase, 'OPPONENT_CARD_CHOICE');
  assert.equal(pending.opponentHandTarget, 'ai');
  assert.equal(pending.selectedAICard, -1);
  assert.deepEqual(Array.from(pending.aiHand, card => card.value), [1, 6]);

  const selected = engine.dispatch('chooseAICard', { index: 1 });
  assert.equal(selected.selectedAICard, 1);
  const resolved = engine.dispatch('doOpponentCardConfirm');
  assert.equal(engine.h.ai.length, 1);
  assert.equal(engine.h.ai[0].value, 1);
  assert.equal(engine.h.player.some(card => card.value === 6), false);
  assert.equal(engine.discardBottom.some(card => card.value === 6), true, 'Adventure Chan 4 must discard the selected NPC card instead of swapping it');
  assert.notEqual(resolved.phase, 'OPPONENT_CARD_CHOICE');
});

test('adventure 1v2 chooses a card only from the current attack target', () => {
  const engine = new Engine();
  engine.start1v2('Chan', 'Ryan', 'Ryan');
  engine.s.isAdventure = true;
  engine.s.revealAIHand = true;
  engine.s.discardTop = number(3, 'RED');
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.attackTarget = 'ai2';
  engine.s.selectedCard = 0;
  engine.h.player = [number(4, 'RED')];
  engine.h.ai = [number(1, 'BLUE')];
  engine.h.ai2 = [number(6, 'GREEN'), number(2, 'YELLOW')];
  engine.deck = [];
  engine.discardBottom = [];

  const pending = engine.dispatch('doPlay');
  assert.equal(pending.phase, 'OPPONENT_CARD_CHOICE');
  assert.equal(pending.opponentHandTarget, 'ai2');
  engine.dispatch('chooseAICard', { index: 0 });
  engine.dispatch('doOpponentCardConfirm');
  assert.equal(engine.h.ai.length, 1, 'non-target NPC hand must remain untouched');
  assert.equal(engine.h.ai2.length, 1, 'selected target card should be removed');
  assert.equal(engine.h.ai2[0].value, 2);
});

test('1v2 opponent-hand skills use the selected target and runtime RNG', () => {
  const engine = new Engine();
  engine.start1v2('Chan', 'Ryan', 'Ryan');
  engine.s.discardTop = number(3, 'RED');
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.attackTarget = 'ai2';
  engine.s.selectedCard = 0;
  engine.h.player = [number(4, 'RED')];
  engine.h.ai = [number(1, 'BLUE'), number(2, 'GREEN')];
  engine.h.ai2 = [number(6, 'YELLOW'), number(5, 'RED')];
  engine.deck = [];
  engine.discardBottom = [];

  context.FurryGame.CombatRuntime.setRandomSource(() => 0);
  try {
    const state = engine.play1v2();
    assert.notEqual(state.phase, 'OPPONENT_CARD_CHOICE');
    assert.equal(engine.h.ai.length, 2, 'non-target NPC hand should be untouched');
    assert.equal(engine.h.ai2.length, 1, 'one random card should come from the selected target');
    assert.ok(engine.events.some(event => event.type === 'reveal' && event.who === 'ai2'));
  } finally {
    context.FurryGame.CombatRuntime.resetRandomSource();
  }
});

test('Leon 7 in 1v2 discards from the selected target hand', () => {
  const engine = new Engine();
  engine.start1v2('Leon', 'Ryan', 'Ryan');
  engine.s.discardTop = number(3, 'RED');
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.attackTarget = 'ai2';
  engine.s.selectedCard = 0;
  engine.h.player = [number(7, 'RED')];
  engine.h.ai = [number(1, 'BLUE'), number(2, 'GREEN')];
  engine.h.ai2 = [number(6, 'YELLOW'), number(5, 'RED')];
  engine.deck = [];
  engine.discardBottom = [];

  context.FurryGame.CombatRuntime.setRandomSource(() => 0);
  try {
    engine.play1v2();
    assert.equal(engine.h.ai.length, 2, 'non-target NPC hand should be untouched');
    assert.equal(engine.h.ai2.length, 1, 'Leon 7 should discard from the selected target');
  } finally {
    context.FurryGame.CombatRuntime.resetRandomSource();
  }
});

test('Leon 0 in 1v2 randomly discards from the shared opponent hands', () => {
  const engine = new Engine();
  engine.start1v2('Leon', 'Ryan', 'Ryan');
  engine.s.discardTop = number(0, 'RED');
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.attackTarget = 'ai';
  engine.s.selectedCard = 0;
  engine.h.player = [number(0, 'RED')];
  engine.h.ai = [number(1, 'BLUE'), number(2, 'GREEN')];
  engine.h.ai2 = [number(6, 'YELLOW')];
  engine.deck = [];
  engine.discardBottom = [];

  context.FurryGame.CombatRuntime.setRandomSource(() => 0);
  try {
    const state = engine.play1v2();
    assert.notEqual(state.phase, 'OPPONENT_CARD_CHOICE');
    assert.equal(engine.h.ai.length + engine.h.ai2.length, 1);
    assert.equal(state.pendingLeonZeroDiscard, undefined);
  } finally {
    context.FurryGame.CombatRuntime.resetRandomSource();
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

test('Moze can use value 6 without guard and Saiki 7 is always playable for drain', () => {
  const moze = setup('Moze');
  const six = number(6);
  moze.h.ai = [number(1), six];
  assert.equal(moze.chooseAIPlay(moze.s.discardTop), six);

  const saiki = setup('Saiki');
  const seven = number(7);
  const two = number(2);
  saiki.h.ai = [seven, two];
  assert.equal(saiki.chooseAIPlay(saiki.s.discardTop), seven);
});

test('Blaze defense 2 follows the documented burn and half-block rule', () => {
  const engine = setup('Blaze');
  engine.s.atkOwner = 'player';
  const mod = CharacterRegistry.get('Blaze');
  const defenseCard = number(2);

  // Blaze 2 is a normal defense skill, not a reveal-based special branch.
  assert.equal(engine.defenseJudge('ai', defenseCard, 9), null);
  const result = mod.defend(
    engine,
    'Blaze',
    2,
    9,
    defenseCard,
    engine.s.ai,
    engine.s.player,
    'ai',
    'RED',
    {
      hurt: (target, amount, kind) => engine.hurt(target, amount, kind),
      heal: (target, amount, kind) => engine.heal(target, amount, kind),
      burn: (target, amount) => engine.burn(target, amount),
      counter: (target, amount) => engine.counterAttack(engine.s.ai, target, amount)
    }
  );

  assert.equal(engine.s.player.burn, 2);
  assert.equal(result.remaining, 4);
});

test('Leon, Saiki, and Blaze attack branches follow the updated character docs', () => {
  const leon = new Engine();
  leon.start('Leon', 'Ryan');
  let result = leon.effect('Leon', 1, number(1), leon.s.player, leon.s.ai);
  assert.equal(result.skip, true);
  assert.equal(leon.s.ai.burn, 3);

  const saiki = new Engine();
  saiki.start('Saiki', 'Ryan');
  result = saiki.effect('Saiki', 1, number(1), saiki.s.player, saiki.s.ai);
  assert.equal(result.d, 2);
  assert.equal(saiki.s.ai.bleed, 2);
  saiki.s.player.hp = 40;
  result = saiki.effect('Saiki', 5, number(5), saiki.s.player, saiki.s.ai);
  assert.equal(result.skip, true);
  assert.equal(saiki.s.player.hp, 45);
  saiki.s.player.hp = 41;
  result = saiki.effect('Saiki', 5, number(5), saiki.s.player, saiki.s.ai);
  assert.equal(result.d, 4);

  const blaze = new Engine();
  blaze.start('Blaze', 'Ryan');
  result = blaze.effect('Blaze', 5, number(5), blaze.s.player, blaze.s.ai);
  assert.equal(blaze.s.player.burn, 1);
  assert.equal(result.d, 4); // base 2 + one burn + the non-stacking passive

  const challenge = new Engine();
  challenge.start1v2('Blaze', 'Ryan', 'Ryan');
  result = challenge.effect('Blaze', 0, number(0), challenge.s.player, challenge.s.ai);
  assert.equal(result.aoeDamage, 5);
  assert.equal(challenge.s.ai.burn, 2);
  assert.equal(challenge.s.ai2.burn, 2);

  // The primary target can die before the AOE pass runs; the surviving target
  // must still receive the same all-opponents damage.
  challenge.s.ai.hp = 0;
  challenge.s.ai.alive = false;
  challenge.s.ai2.hp = 10;
  challenge.s.ai2.alive = true;
  challenge.performAttack({
    type: 'aoe',
    attacker: 'player',
    target: 'ai',
    aoeTargets: ['ai', 'ai2'],
    aoeDamage: 5,
    skipTarget: true
  });
  assert.equal(challenge.s.ai2.hp, 5, 'AOE should continue when the primary target is already defeated');
});

test('Leon discard branches return removed cards to the opponent discard pile', () => {
  const engine = new Engine();
  engine.start('Leon', 'Ryan');
  engine.s.discardTop = number(0);
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.selectedCard = 0;
  engine.h.player = [number(0)];
  engine.h.ai = [number(1), number(2), number(3)];
  engine.deck = [];
  engine.discardBottom = [];
  context.FurryGame.CombatRuntime.setRandomSource(() => 0);
  try {
    engine.play();
    assert.equal(engine.h.ai.length, 1);
    assert.equal(engine.discardBottom.length, 3); // opening top + two discarded hand cards
    assert.deepEqual(engine.discardBottom.slice(-2).map(card => card.value), [1, 2]);
  } finally {
    context.FurryGame.CombatRuntime.resetRandomSource();
  }

  const seven = new Engine();
  seven.start('Leon', 'Ryan');
  seven.s.discardTop = number(0);
  seven.s.phase = 'PLAYER_PLAY';
  seven.s.selectedCard = 0;
  seven.h.player = [number(7)];
  seven.h.ai = [number(4)];
  seven.deck = [];
  seven.discardBottom = [];
  context.FurryGame.CombatRuntime.setRandomSource(() => 0);
  try {
    seven.play();
    assert.equal(seven.h.ai.length, 0);
    assert.equal(seven.discardBottom.at(-1).value, 4);
  } finally {
    context.FurryGame.CombatRuntime.resetRandomSource();
  }

  const emptyTarget = new Engine();
  emptyTarget.start('Leon', 'Ryan');
  emptyTarget.s.discardTop = number(0);
  emptyTarget.s.phase = 'PLAYER_PLAY';
  emptyTarget.s.selectedCard = 0;
  emptyTarget.h.player = [number(7)];
  emptyTarget.h.ai = [];
  emptyTarget.deck = [];
  emptyTarget.discardBottom = [];
  emptyTarget.play();
  assert.equal(emptyTarget.s.ai.burn, 2, 'Leon 7 should still apply burn when the target hand is empty');

  const defense = new Engine();
  defense.start('Ryan', 'Leon');
  defense.h.player = [number(1), number(2)];
  defense.deck = [];
  defense.discardBottom = [];
  const leon = CharacterRegistry.get('Leon');
  leon.defend(
    defense,
    'Leon',
    0,
    4,
    number(0),
    defense.s.ai,
    defense.s.player,
    'ai',
    'RED',
    {
      hurt: (target, amount, kind) => defense.hurt(target, amount, kind),
      heal: (target, amount, kind) => defense.heal(target, amount, kind),
      draw: (owner, amount, animated) => defense.draw(owner, amount, animated),
      burn: (target, amount) => defense.burn(target, amount),
      counter: (target, amount) => defense.counterAttack(defense.s.ai, target, amount)
    }
  );
  assert.equal(defense.h.player.length, 0, 'Leon defense 0 should discard every attacker card');
  assert.equal(defense.discardBottom.length, 2, 'discarded cards must remain in the shared discard pile');
});

test('Saiki defense 3 always returns the revealed judge card to hand', () => {
  const engine = setup('Saiki');
  engine.deck = [number(2, 'YELLOW')];
  const beforeDiscard = engine.discardBottom.length;

  const result = engine.defenseJudge('ai', number(3), 7);

  assert.equal(result.remaining, 0);
  assert.equal(engine.h.ai.length, 1);
  assert.equal(engine.h.ai[0].value, 2);
  assert.equal(engine.discardBottom.length, beforeDiscard);
});

test('Serenity defense 2 drains attacker HP and heals only actual life taken', () => {
  const engine = setup('Serenity');
  engine.s.ai.hp = 20;
  engine.s.player.hp = 50;
  engine.s.player.bleed = 2;
  const mod = CharacterRegistry.get('Serenity');

  const result = mod.defend(
    engine,
    'Serenity',
    2,
    5,
    number(2),
    engine.s.ai,
    engine.s.player,
    'ai',
    'RED',
    {
      hurt: (target, amount, kind) => engine.hurt(target, amount, kind),
      heal: (target, amount, kind) => engine.heal(target, amount, kind),
      bleed: (target, amount) => engine.bleed(target, amount)
    }
  );

  assert.equal(result.remaining, 5);
  assert.equal(engine.s.player.bleed, 3);
  assert.equal(engine.s.player.hp, 44);
  assert.equal(engine.s.ai.hp, 26);
});

test('Knight defense 0 drains the active ai2 target in 1v2', () => {
  const engine = setup('Ryan');
  engine.s.modeId = '1v2';
  engine.s.is1v2 = true;
  engine.s.player = engine.character('Knight');
  engine.s.ai2 = engine.character('Moze', true);
  engine.s.ai2.name = 'AI2 Moze';
  const knight = engine.s.player;
  const ai1Before = engine.s.ai.hp;
  engine.s.ai2.hp = 20;
  knight.chaos_red = true;
  knight.chaos_yellow = true;
  knight.chaos_blue = true;
  knight.chaos_green = true;

  const mod = CharacterRegistry.get('Knight');
  const result = mod.defend(
    engine,
    'Knight',
    0,
    8,
    number(0),
    knight,
    engine.s.ai2,
    'player',
    'RED',
    {
      hurt: (target, amount, kind) => engine.hurt(target, amount, kind),
      heal: (target, amount, kind) => engine.heal(target, amount, kind),
      draw: () => {},
      burn: (target, amount) => engine.burn(target, amount),
      bleed: (target, amount) => engine.bleed(target, amount),
      counter: (target, amount) => engine.counterAttack(knight, target, amount)
    }
  );

  assert.equal(result.remaining, 0);
  assert.equal(engine.s.ai2.hp, 12);
  assert.equal(engine.s.ai.hp, ai1Before);
});
