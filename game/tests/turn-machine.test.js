const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const gameRoot = path.resolve(__dirname, '..');
const context = vm.createContext({
  console,
  Math,
  JSON,
  setTimeout: () => 1,
  clearTimeout: () => {},
  performance: { now: () => 0 }
});
context.window = context;

for (const relative of [
  'js/combat/events.js',
  'js/combat/piles.js',
  'js/combat/status.js',
  'js/combat/damage.js',
  'js/combat/modes.js',
  'js/combat/deck_port.js',
  'js/combat/turn_machine.js'
]) {
  const file = path.join(gameRoot, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { FurryGame } = context;

test('EngineModes exposes topology adapters for each battle mode', () => {
  const M = FurryGame.EngineModes;
  assert.equal(M.adapterFor({}), '1v1');
  assert.equal(M.adapterFor({ is1v2: true }), '1v2');
  assert.equal(M.adapterFor({ isLord: true, is1v2: true }), 'lord');
  assert.equal(M.adapterFor({ isAdventure: true }), 'adventure');
  assert.equal(M.keysFor({ is1v2: true }).join(','), 'player,ai,ai2');
  assert.equal(M.resolveAttackTarget({ attackTarget: 'ai2', is1v2: true }), 'ai2');
  assert.equal(M.current({ isAdventure: true }).sharedDeck, false);
  assert.equal(M.current({}).sharedDeck, true);
});

test('DeckPort.shared draws from the shared deck and emits target', () => {
  const events = [];
  const engine = {
    deck: [{ value: 1 }, { value: 2 }],
    discardBottom: [],
    h: { player: [] },
    _suppressDrawAnim: false,
    emit(type, desc, card, extra) { events.push({ type, desc, extra }); }
  };
  const drawn = FurryGame.DeckPort.shared.draw(engine, 'player', 2, true);
  assert.equal(drawn.length, 2);
  assert.equal(engine.h.player.length, 2);
  assert.equal(engine.deck.length, 0);
  assert.equal(events[0].type, 'draw');
  assert.equal(events[0].extra.target, 'player');
  assert.equal(FurryGame.DeckPort.usesSharedDeck({ s: { isAdventure: true }, piles: {} }), false);
  assert.equal(FurryGame.DeckPort.usesSharedDeck({ s: {} }), true);
});

test('TurnMachine settles player attack after events are acknowledged', () => {
  const calls = [];
  const engine = {
    ver: 3,
    events: [{ id: 1 }, { id: 2 }, { id: 3 }],
    pendingSettlement: { kind: 'PLAYER_ATTACK', damage: 4, bleed: 0, afterEventId: 2 },
    s: {
      pendingAIBridge: null,
      pendingAIContinue: null,
      pendingDefenseDamage: 4,
      forceEndPlayerTurn: false,
      attackTarget: 'ai',
      ai: { hp: 20, name: 'AI Leon', guard: 0, fly: 0 }
    },
    _restoreAttackBuffs() { calls.push('restore'); },
    applyDefenderAvoidance(target, dmg) { calls.push('avoid:' + dmg); return dmg; },
    hurt(target, dmg) { calls.push('hurt:' + dmg); target.hp -= dmg; },
    settleBleed() { calls.push('bleed'); },
    resolveSerenityHalf() { calls.push('serenity'); },
    afterAttack() { calls.push('after'); },
    _allEnemiesDead() { return false; },
    startAITurn() { calls.push('startAI'); },
    check() { calls.push('check'); return this.s; }
  };
  FurryGame.TurnMachine.acknowledgeEvents(engine, 2);
  assert.equal(engine.events.length, 1);
  assert.equal(engine.events[0].id, 3);
  assert.equal(engine.pendingSettlement, null);
  assert.equal(engine.s.ai.hp, 16);
  assert.deepEqual(calls, ['restore', 'avoid:4', 'hurt:4', 'bleed', 'serenity', 'after', 'check']);
});
