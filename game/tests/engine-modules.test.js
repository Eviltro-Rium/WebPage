const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Math, JSON, setTimeout: () => 1, clearTimeout: () => {} });
context.window = context;
vm.runInContext('window.Engine = function Engine() {}; window.FurryGame = {};', context);
for (const relative of ['js/combat/engine_turns.js', 'js/combat/engine_attack.js', 'js/combat/engine_ai.js', 'js/combat/engine_snapshot.js']) {
  const file = path.join(root, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

test('engine responsibilities are exposed as independent modules', () => {
  const proto = context.Engine.prototype;
  for (const method of ['fillHands', 'endTurn', 'later', 'resolveAttack', 'resolveDefense', 'aiSpecialEffect', 'combatSnapshot', 'restoreCombatSnapshot']) {
    assert.equal(typeof proto[method], 'function', method);
  }
  assert.ok(context.FurryGame.EngineTurns);
  assert.ok(context.FurryGame.EngineAttack);
  assert.ok(context.FurryGame.EngineAI);
  assert.ok(context.FurryGame.EngineSnapshot);
});

test('topology-specific 1v2 and adventure item code is not embedded in core files', () => {
  const engineSource = fs.readFileSync(path.join(root, 'js/combat/engine.js'), 'utf8');
  const oneVTwoSource = fs.readFileSync(path.join(root, 'js/combat/engine_1v2.js'), 'utf8');
  const adapterSource = fs.readFileSync(path.join(root, 'js/combat/engine_1v2_adapter.js'), 'utf8');
  const adventureSource = fs.readFileSync(path.join(root, 'adventure/js/battle/battle_engine.js'), 'utf8');
  const itemSource = fs.readFileSync(path.join(root, 'adventure/js/battle/adventure_battle_items.js'), 'utf8');
  assert.doesNotMatch(engineSource, /start1v2|aiTurn1v2|defend1v2/);
  assert.match(oneVTwoSource, /start1v2/);
  assert.match(adapterSource, /_state1v2|dispatch/);
  assert.doesNotMatch(adventureSource, /\n    useAdventureCombatItem\(|\n    _applyBuffTransfer\(/);
  assert.match(itemSource, /useAdventureCombatItem|_applyBuffTransfer/);
});

test('combat snapshots round-trip state and piles', () => {
  const Engine = context.Engine;
  const engine = new Engine();
  engine.mode = 'adventure';
  engine.s = { phase: 'PLAYER_PLAY', turn: 4 };
  engine.h = { player: [{ value: 2 }], ai: [] };
  engine.deck = [{ value: 3 }];
  engine.discardBottom = [{ value: 1 }];
  engine.events = [{ id: 9, type: 'desc' }];
  engine.ver = 9;
  engine.pendingSettlement = null;
  engine.state = () => engine.s;
  const snapshot = engine.combatSnapshot();
  engine.s.turn = 8;
  engine.restoreCombatSnapshot(snapshot);
  assert.equal(engine.s.turn, 4);
  assert.equal(engine.h.player[0].value, 2);
  assert.equal(engine.deck[0].value, 3);
});
