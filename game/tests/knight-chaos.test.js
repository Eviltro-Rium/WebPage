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

function blackNumber(value, chosenColor) {
  return {
    value, color: 'BLACK', chosenColor, uid: `b${Math.random()}`,
    isNumberCard: true, isItemCard: false, isWhite: false, isBlack: true
  };
}

function whiteNumber(value, chosenColor) {
  return {
    value, color: 'WHITE', chosenColor, uid: `w${Math.random()}`,
    isNumberCard: true, isItemCard: false, isWhite: true, isBlack: false
  };
}

test('Knight gains chaos from designated black number cards', () => {
  const eng = new Engine();
  eng.start('Knight', 'Ryan');
  const card = blackNumber(3, 'BLUE');
  eng._grantChaosForCard(eng.s.player, card);
  assert.equal(!!eng.s.player.chaos_blue, true);
  assert.equal(!!eng.s.player.chaos_red, false);
});

test('Knight gains chaos from designated white number cards', () => {
  const eng = new Engine();
  eng.start('Knight', 'Ryan');
  const card = whiteNumber(2, 'YELLOW');
  eng._grantChaosForCard(eng.s.player, card);
  assert.equal(!!eng.s.player.chaos_yellow, true);
});

test('Knight gains chaos from white item cards by designated color', () => {
  const eng = new Engine();
  eng.start('Knight', 'Ryan');
  const potion = {
    value: -1, color: 'WHITE', chosenColor: 'RED', isWhite: true,
    isItemCard: true, isNumberCard: false, potion: true
  };
  eng._grantChaosForCard(eng.s.player, potion);
  assert.equal(!!eng.s.player.chaos_red, true);
});

test('Knight ignores black item cards for chaos grant', () => {
  const eng = new Engine();
  eng.start('Knight', 'Ryan');
  const blackItem = {
    value: -1, color: 'BLACK', chosenColor: 'GREEN', isBlack: true, isWhite: false,
    isItemCard: true, isNumberCard: false, purify: true
  };
  eng._grantChaosForCard(eng.s.player, blackItem);
  assert.equal(!!eng.s.player.chaos_green, false);
});

test('Knight white item play grants chaos immediately', () => {
  const eng = new Engine();
  eng.start('Knight', 'Ryan');
  eng.later = () => {};
  const potion = {
    value: -1, color: 'WHITE', chosenColor: 'BLUE', isWhite: true,
    isItemCard: true, isNumberCard: false, potion: true, uid: 'p1'
  };
  eng.h.player = [potion];
  eng.s.discardTop = number(1, 'BLUE');
  eng.s.phase = 'PLAYER_PLAY';
  eng.s.busy = false;
  eng.s.selectedCard = 0;
  eng.play();
  assert.equal(!!eng.s.player.chaos_blue, true);
});

test('Knight still gains chaos from base-color number cards', () => {
  const eng = new Engine();
  eng.start('Knight', 'Ryan');
  eng._grantChaosForCard(eng.s.player, number(1, 'GREEN'));
  assert.equal(!!eng.s.player.chaos_green, true);
});
