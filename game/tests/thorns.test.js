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

function number(value, color = 'RED') {
  return { value, color, uid: `c${Math.random()}`, isNumberCard: true, isItemCard: false, isWhite: false, isBlack: false };
}

test('thorns stacks cap at 1 and is a cleanseable debuff', () => {
  const registry = context.FurryGame.StatusRegistry;
  const def = registry.get('thorns');
  assert.equal(def.polarity, 'debuff');
  assert.equal(def.max, 1);
  assert.equal(def.trigger, 'onAttackSkill');
  const eng = new Engine();
  eng.start('Ryan', 'Saiki');
  eng.thorns(eng.s.player, 1);
  eng.thorns(eng.s.player, 1);
  assert.equal(eng.s.player.thorns, 1);
  eng.clearDebuffs(eng.s.player);
  assert.equal(eng.s.player.thorns || 0, 0);
});

test('attack-phase skill with thorns deals 1 independent damage and ignores guard', () => {
  const eng = new Engine();
  eng.start('Ryan', 'Saiki');
  eng.later = () => {};
  eng.s.player.thorns = 1;
  eng.s.player.guard = 3;
  const hp = eng.s.player.hp;
  eng.h.player = [number(3, 'RED')];
  eng.s.discardTop = number(3, 'RED');
  eng.s.phase = 'PLAYER_PLAY';
  eng.s.busy = false;
  eng.s.selectedCard = 0;
  eng.play();
  assert.equal(eng.s.player.hp, hp - 1);
  assert.equal(eng.s.player.guard, 3);
  assert.equal(eng.s.player.thorns, 1);
});

test('item cards in attack phase do not trigger thorns', () => {
  const eng = new Engine();
  eng.start('Ryan', 'Saiki');
  eng.later = () => {};
  eng.s.player.thorns = 1;
  const hp = eng.s.player.hp;
  const potion = { value: -1, color: 'WHITE', isWhite: true, isItemCard: true, isNumberCard: false, potion: true };
  eng.h.player = [potion];
  eng.s.discardTop = number(1, 'RED');
  eng.s.phase = 'PLAYER_PLAY';
  eng.s.busy = false;
  eng.s.selectedCard = 0;
  eng.play();
  assert.equal(eng.s.player.hp, hp);
});

test('defense skills do not trigger thorns', () => {
  const eng = new Engine();
  eng.start('Ryan', 'Saiki');
  eng.later = () => {};
  eng.s.player.thorns = 1;
  const hp = eng.s.player.hp;
  eng.s.pendingAttack = { damage: 2 };
  eng.s.atkCard = number(2, 'RED');
  eng.s.discardTop = number(2, 'RED');
  eng.h.player = [number(1, 'RED')];
  eng.s.phase = 'PLAYER_DEFEND';
  eng.s.busy = false;
  eng.s.selectedCard = 0;
  eng.defend();
  assert.equal(eng.s.player.hp, hp);
});
