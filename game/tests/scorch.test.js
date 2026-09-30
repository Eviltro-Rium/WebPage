const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Math, JSON, Date, setTimeout: () => 1, clearTimeout: () => {}, performance: { now: () => 0 } });
context.window = context;
const files = [
  'js/characters/registry.js', 'js/characters/ryan.js', 'js/characters/leon.js',
  'js/characters/chan.js', 'js/characters/saiki.js', 'js/characters/blaze.js',
  'js/characters/serenity.js', 'js/characters/moze.js', 'js/characters/knight.js',
  'js/characters/otto.js', 'js/characters/vixraps.js',
  'js/ai/registry.js', 'js/ai/knight_ai.js', 'js/ai/leon_ai.js', 'js/ai/ryan_ai.js',
  'js/ai/blaze_ai.js', 'js/ai/serenity_ai.js', 'js/ai/saiki_ai.js', 'js/ai/moze_ai.js',
  'js/ai/chan_ai.js', 'js/ai/otto_ai.js', 'js/ai/vixraps_ai.js',
  'js/combat/protocol.js', 'js/combat/runtime.js', 'js/combat/events.js',
  'js/combat/state.js', 'js/combat/deck.js', 'js/combat/piles.js',
  'js/combat/invariants.js', 'js/combat/status_registry.js', 'js/combat/status_service.js',
  'js/combat/status.js', 'js/combat/damage.js', 'js/combat/modes.js',
  'js/combat/deck_port.js', 'js/combat/turn_machine.js', 'js/combat/dice.js',
  'js/combat/card_effects.js', 'js/combat/engine.js', 'js/combat/engine_1v2.js',
  'js/combat/engine_1v2_adapter.js', 'js/combat/engine_turns.js', 'js/combat/engine_attack.js',
  'js/combat/engine_ai.js', 'js/combat/engine_snapshot.js', 'js/combat/engine_lord.js'
];
for (const relative of files) {
  const file = path.join(root, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { Engine } = context;

test('scorch registry metadata matches the negative-buff contract', () => {
  const def = context.FurryGame.StatusRegistry.get('scorch');
  assert.equal(def.label, '炙热');
  assert.equal(def.polarity, 'debuff');
  assert.equal(def.stack, false);
  assert.equal(def.max, 1);
  assert.equal(def.cleanse, 'reset');
  assert.equal(def.trigger, 'onBurnSettle');
  assert.equal(def.transferable, true);
});

test('burn settlement keeps stacks while scorch is held', () => {
  const eng = new Engine();
  eng.start('Ryan', 'Saiki');
  eng.later = () => {};
  const hp = eng.s.player.hp;
  eng.s.player.burn = 3;
  eng.setScorch(eng.s.player, true);
  assert.equal(eng.s.player.scorch, true);
  const dmg = eng.settleBurn(eng.s.player);
  assert.equal(dmg, 3);
  assert.equal(eng.s.player.hp, hp - 3);
  assert.equal(eng.s.player.burn, 3);
});

test('burn settlement decays stacks without scorch', () => {
  const eng = new Engine();
  eng.start('Ryan', 'Saiki');
  eng.later = () => {};
  eng.s.player.burn = 3;
  eng.settleBurn(eng.s.player);
  assert.equal(eng.s.player.burn, 2);
});

test('scorch trophy applies to the target, not the player', () => {
  const eng = new Engine();
  eng.start('Ryan', 'Saiki');
  eng.later = () => {};
  const card = { trophyWhite: true, trophyEffect: 'scorch', trophyName: 'ScorchTrophy' };
  assert.equal(eng.useTrophyWhite(card, eng.s.ai), true);
  assert.equal(eng.s.ai.scorch, true);
  assert.equal(!!eng.s.player.scorch, false);
});

test('scorch is cleared as a debuff', () => {
  const eng = new Engine();
  eng.start('Ryan', 'Saiki');
  eng.later = () => {};
  eng.setScorch(eng.s.player, true);
  eng.clean(eng.s.player, false, 'scorch');
  assert.equal(eng.s.player.scorch, false);
  eng.setScorch(eng.s.player, true);
  eng.clearDebuffs(eng.s.player);
  assert.equal(eng.s.player.scorch, false);
  eng.setScorch(eng.s.player, true);
  eng.clearPositiveBuffs(eng.s.player);
  assert.equal(eng.s.player.scorch, true);
});
