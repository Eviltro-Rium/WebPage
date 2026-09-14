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
context.CharacterRegistry = { get: () => null, all: () => [] };
context.AIRegistry = { get: () => null };

for (const relative of [
  'js/combat/protocol.js',
  'js/combat/events.js',
  'js/combat/state.js',
  'js/combat/deck.js',
  'js/combat/piles.js',
  'js/combat/status.js',
  'js/combat/damage.js',
  'js/combat/modes.js',
  'js/combat/deck_port.js',
  'js/combat/turn_machine.js',
  'js/combat/engine.js'
]) {
  const file = path.join(gameRoot, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { Engine, FurryGame } = context;

function guardHarness() {
  const engine = new Engine();
  engine.s = {
    player: { name: 'Player', hp: 20, maxHp: 20, alive: true, fly: 1, guard: 3 },
    phase: 'GUARD_CHOICE',
    busy: false,
    pendingGuardDamage: 4,
    pendingGuardBleed: 0,
    pendingDefenseDamage: 4,
    pendingDialog: 'guard',
    defCard: null
  };
  engine.events = [];
  engine.ver = 0;
  engine.emit = () => {};
  engine.rollD12 = () => 12; // 7-12 means the fly attempt fails.
  engine.state = () => engine.s;
  engine.check = () => engine.s;
  engine._pendingBleedActive = () => 0;
  engine.deferSettlement = (kind, damage, bleed) => {
    engine.pendingSettlement = { kind, damage, bleed };
  };
  return engine;
}

test('failed fly keeps the defense open so guard can be chosen', () => {
  const engine = guardHarness();

  engine.chooseFly();
  assert.equal(engine.s.player.fly, 0);
  assert.equal(engine.s.pendingDialog, 'flyRetry');
  assert.equal(engine.s.player.guard, 3);

  engine.chooseFlyContinue(false);
  assert.equal(engine.s.pendingDialog, 'guard');
  assert.equal(engine.s.phase, 'GUARD_CHOICE');

  engine.chooseGuard(2);
  assert.equal(engine.s.player.guard, 1);
  assert.equal(engine.pendingSettlement.damage, 2);
});

test('super purify clears every current combat and adventure status', () => {
  const entity = {
    burn: 2, bleed: 2, poison: 2, frozen: true, bomb: 4, blind: 1, iceSeal: 1,
    hypothermia: 2, guard: 3, fly: 2, lush: 2, crit: 2, parasite: 1,
    diving: true, bloodthirst: true, bindMark: true,
    chaos_red: true, chaos_yellow: true, chaos_blue: true, chaos_green: true
  };

  FurryGame.EngineStatus.clean(entity, true);

  for (const key of ['burn', 'bleed', 'poison', 'bomb', 'blind', 'iceSeal', 'hypothermia', 'guard', 'fly', 'lush', 'crit', 'parasite']) {
    assert.equal(entity[key], 0, key + ' should be cleared');
  }
  for (const key of ['frozen', 'diving', 'bloodthirst', 'bindMark', 'chaos_red', 'chaos_yellow', 'chaos_blue', 'chaos_green']) {
    assert.equal(entity[key], false, key + ' should be cleared');
  }
});
