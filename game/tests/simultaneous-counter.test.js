const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { loadInto } = require('./_load');

const context = vm.createContext({
  console,
  Math,
  JSON,
  Date,
  setTimeout: () => 1,
  clearTimeout: () => {},
  performance: { now: () => 0 }
});
context.window = context;
loadInto(context, ['characters', 'ai', 'combat']);

const { Engine, FurryGame } = context;
const Card = FurryGame.Card;

function number(value, color = 'RED') {
  return Card.number(color, value);
}

function battle() {
  const engine = new Engine();
  engine.start('Ryan', 'Ryan');
  engine.later = () => {};
  engine.s.player.guard = 0;
  engine.s.player.fly = 0;
  engine.s.ai.guard = 0;
  engine.s.ai.fly = 0;
  return engine;
}

test('player counter and remaining attack both land on mutual KO', () => {
  const engine = battle();
  engine.s.player.hp = 2;
  engine.s.ai.hp = 2;
  engine.s.pendingAttack = { damage: 6, unblock: false };
  engine.s.atkCard = number(3, 'RED');
  engine.s.atkOwner = 'ai';
  engine.s.discardTop = number(3, 'RED');
  engine.h.player = [number(2, 'RED')];
  engine.s.phase = 'PLAYER_DEFEND';
  engine.s.busy = false;
  engine.s.selectedCard = 0;

  engine.defend();

  assert.equal(engine.s.phase, 'AI_TURN');
  assert.ok(engine.pendingSettlement);
  assert.equal(engine.s.player.hp, 4, 'Ryan 2 heals before hits land');
  assert.equal(engine.s.ai.hp, 2, 'counter is queued, not applied yet');
  assert.equal((engine.s.queuedCounterHits || []).length, 1);

  engine.acknowledgeEvents(engine.ver);

  assert.equal(engine.s.player.hp, 0);
  assert.equal(engine.s.ai.hp, 0);
  assert.equal(engine.s.player.alive, false);
  assert.equal(engine.s.ai.alive, false);
  assert.equal(engine.s.phase, 'GAME_OVER');
});

test('NPC counter and remaining attack both land on mutual KO', () => {
  const engine = battle();
  engine.s.player.hp = 2;
  engine.s.ai.hp = 2;
  engine.s.pendingAttack = { damage: 4, unblock: false };
  engine.s.atkCard = number(3, 'RED');
  engine.s.atkOwner = 'player';
  engine.s.discardTop = number(3, 'RED');
  engine.h.ai = [number(2, 'RED')];
  engine.s.phase = 'AI_DEFEND';
  engine.s.busy = true;

  engine.aiDefend(engine.s.atkCard, 4);

  assert.ok(engine.pendingSettlement);
  assert.equal(engine.pendingSettlement.kind, 'PLAYER_ATTACK');
  assert.equal(engine.s.ai.hp, 4, 'Ryan 2 heals before hits land');
  assert.equal(engine.s.player.hp, 2, 'counter is queued, not applied yet');
  assert.equal(engine.s.phase, 'AI_DEFEND');

  engine.acknowledgeEvents(engine.ver);

  assert.equal(engine.s.player.hp, 0);
  assert.equal(engine.s.ai.hp, 0);
  assert.equal(engine.s.phase, 'GAME_OVER');
});

test('player can spend guard against an NPC counter before both hits settle', () => {
  const engine = battle();
  engine.s.player.hp = 10;
  engine.s.player.guard = 2;
  engine.s.ai.hp = 6;
  engine.s.pendingAttack = { damage: 4, unblock: false };
  engine.s.atkCard = number(3, 'RED');
  engine.s.atkOwner = 'player';
  engine.s.discardTop = number(3, 'RED');
  engine.h.ai = [number(2, 'RED')];
  engine.s.phase = 'AI_DEFEND';
  engine.s.busy = true;

  engine.aiDefend(engine.s.atkCard, 4);

  assert.equal(engine.s.phase, 'GUARD_CHOICE');
  assert.equal(engine.s.pendingDialog, 'guard');
  assert.equal(engine.s.counterAvoidance, true);
  assert.equal(engine.s.pendingGuardDamage, 2, 'Ryan 2 counters 2');
  assert.equal(engine.s.player.hp, 10);
  assert.equal(engine.s.player.guard, 2);
  assert.equal(engine.s.ai.hp, 8, 'Ryan 2 heals before remaining attack lands');
  assert.equal(engine.pendingSettlement, null);

  engine.chooseGuard(2);
  assert.equal(engine.s.player.guard, 0);
  assert.ok(engine.pendingSettlement);
  engine.acknowledgeEvents(engine.ver);

  assert.equal(engine.s.player.hp, 10, 'guard blocked the whole counter');
  assert.equal(engine.s.ai.hp, 4, 'remaining attack still lands');
});

test('player fly can dodge an NPC counter without cancelling remaining attack', () => {
  const engine = battle();
  engine.s.player.hp = 10;
  engine.s.player.fly = 1;
  engine.s.ai.hp = 6;
  engine.s.pendingAttack = { damage: 4, unblock: false };
  engine.s.atkCard = number(3, 'RED');
  engine.s.atkOwner = 'player';
  engine.s.discardTop = number(3, 'RED');
  engine.h.ai = [number(2, 'RED')];
  engine.s.phase = 'AI_DEFEND';
  engine.s.busy = true;
  engine.rollD12 = () => 3;

  engine.aiDefend(engine.s.atkCard, 4);
  assert.equal(engine.s.phase, 'GUARD_CHOICE');
  engine.chooseFly();
  engine.acknowledgeEvents(engine.ver);

  assert.equal(engine.s.player.fly, 0);
  assert.equal(engine.s.player.hp, 10);
  assert.equal(engine.s.ai.hp, 4);
});
