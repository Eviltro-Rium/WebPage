'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { loadInto } = require('./_load');

const context = vm.createContext({ console, Math, JSON, Date, setTimeout: () => 1, clearTimeout() {} });
context.window = context;
loadInto(context, ['characters', 'ai', 'combat']);

const number = value => context.FurryGame.Card.number('RED', value);
const createBattle = () => new context.Engine();

for (const burn of [0, 1, 5]) {
  test(`Blaze 4 consumes ${burn} self burn, heals, and keeps both hands intact`, () => {
    const engine = createBattle();
    engine.start('Blaze', 'Ryan');
    engine.later = () => {};
    engine.h.player = [number(4), number(2)];
    engine.h.ai = [number(5)];
    engine.s.discardTop = number(2);
    engine.s.player.hp = 30;
    engine.s.player.burn = burn;
    engine.s.selectedCard = 0;

    engine.play();

    assert.equal(engine.s.player.hp, 31 + burn);
    assert.equal(engine.s.player.burn, 0);
    assert.equal(engine.s.ai.burn, 1);
    assert.deepEqual(Array.from(engine.h.ai, card => card.value), [5]);
    assert.deepEqual(Array.from(engine.h.player, card => card.value), [2]);
    assert.equal(engine.s.pendingAttack?.damage, 0);
  });
}

test('Blaze 4 AI resolves the same healing skill against an empty player hand', () => {
  const engine = createBattle();
  engine.start('Ryan', 'Blaze');
  engine.later = () => {};
  engine.s.phase = 'AI_TURN';
  engine.s.aiTurnStarted = true;
  engine.s.ai.hp = 30;
  engine.s.ai.burn = 2;
  engine.s.discardTop = number(2);
  engine.h.ai = [number(4)];
  engine.h.player = [];

  engine.aiTurn();

  assert.equal(engine.s.ai.hp, 33);
  assert.equal(engine.s.ai.burn, 0);
  assert.equal(engine.s.player.burn, 1);
  assert.equal(engine.s.pendingAttack?.damage, 0);
  assert.notEqual(engine.s.phase, 'PLAYER_DEFEND');
});

test('Blaze 4 applies burn only to the selected 1v2 opponent', () => {
  const engine = createBattle();
  engine.start1v2('Blaze', 'Ryan', 'Ryan');
  engine.later = () => {};
  engine.s.player.hp = 30;
  engine.s.player.burn = 3;
  engine.s.discardTop = number(2);
  engine.h.player = [number(4)];
  engine.s.attackTarget = 'ai2';
  engine.s.selectedCard = 0;

  engine.play1v2();

  assert.equal(engine.s.player.hp, 34);
  assert.equal(engine.s.player.burn, 0);
  assert.equal(engine.s.ai.burn, 0);
  assert.equal(engine.s.ai2.burn, 1);
});
