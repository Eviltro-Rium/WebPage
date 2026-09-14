const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Math, JSON, setTimeout, clearTimeout });
context.window = context;
for (const relative of [
  'js/combat/protocol.js', 'js/combat/runtime.js', 'js/combat/dice.js',
  'js/combat/state.js', 'js/combat/deck.js', 'js/combat/modes.js', 'js/combat/invariants.js'
]) {
  const file = path.join(root, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

test('CombatRuntime centralizes injectable random values and cancellable timers', async () => {
  const runtime = context.FurryGame.CombatRuntime;
  runtime.setRandomSource(() => 0.25);
  assert.equal(runtime.random(), 0.25);
  assert.equal(runtime.randomInt(12), 3);
  assert.equal(new context.D12().roll(), 4);

  const owner = {};
  let calls = 0;
  runtime.schedule(owner, () => { calls += 1; }, 12, 'same-channel');
  runtime.schedule(owner, () => { calls += 10; }, 0, 'same-channel');
  await runtime.wait(5);
  assert.equal(calls, 10);
  runtime.cancel(owner, 'same-channel');
  runtime.resetRandomSource();
});

function adventureEngine() {
  const { Card } = context.FurryGame;
  const playerDeck = [Card.number('RED', 1)];
  const playerDiscard = [Card.number('RED', 2)];
  const npcDeck = [Card.number('BLUE', 3)];
  const npcDiscard = [Card.number('BLUE', 4)];
  return {
    s: { isAdventure: true, is1v2: true, phase: 'PLAYER_PLAY', discardTop: npcDiscard[0], discardTopOwner: 'ai' },
    piles: {
      player: { deck: playerDeck, hand: [], discard: playerDiscard },
      ai: { deck: npcDeck, hand: [], discard: npcDiscard },
      ai2: { deck: npcDeck, hand: [], discard: npcDiscard }
    }
  };
}

test('CombatInvariants accepts isolated adventure piles and shared 1v2 NPC piles', () => {
  const { CombatInvariants } = context.FurryGame;
  const engine = adventureEngine();
  assert.equal(CombatInvariants.check(engine, 'start').ok, true);
  assert.equal(CombatInvariants.check(engine, 'draw').ok, true);
});

test('CombatInvariants reports ownership, conservation, and end-of-room violations', () => {
  const { CombatInvariants, Card } = context.FurryGame;

  const brokenShare = adventureEngine();
  brokenShare.piles.ai2.deck = [];
  assert.throws(() => CombatInvariants.check(brokenShare, 'draw', { throw: true }), /NPC牌库未共享/);

  const brokenIsolation = adventureEngine();
  brokenIsolation.piles.player.deck = brokenIsolation.piles.ai.deck;
  assert.throws(() => CombatInvariants.check(brokenIsolation, 'draw', { throw: true }), /玩家与NPC牌堆未隔离/);

  const sharedCard = adventureEngine();
  sharedCard.piles.player.deck[0] = sharedCard.piles.ai.deck[0];
  assert.throws(() => CombatInvariants.check(sharedCard, 'draw', { throw: true }), /共享同一张牌对象/);

  const duplicated = adventureEngine();
  CombatInvariants.check(duplicated, 'start');
  duplicated.piles.ai.hand.push(Card.number('RED', 1));
  assert.throws(() => CombatInvariants.check(duplicated, 'discard', { throw: true }), /牌重复/);

  const lost = adventureEngine();
  CombatInvariants.check(lost, 'start');
  lost.piles.player.deck.pop();
  assert.throws(() => CombatInvariants.check(lost, 'discard', { throw: true }), /牌丢失/);

  const wrongTop = adventureEngine();
  wrongTop.s.discardTop = wrongTop.piles.player.deck[0];
  assert.throws(() => CombatInvariants.check(wrongTop, 'setDiscardTop', { throw: true }), /弃牌库顶/);

  const unrecovered = adventureEngine();
  unrecovered.s.phase = 'GAME_OVER';
  unrecovered.piles.ai.hand.push(Card.number('GREEN', 5));
  assert.throws(() => CombatInvariants.check(unrecovered, 'finishAdventureBattle', { throw: true }), /NPC手牌未回收/);
});
