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

test('sandblind stacks cap at 6 and cleanses by 1 stack', () => {
  const registry = context.FurryGame.StatusRegistry;
  const def = registry.get('sandblind');
  assert.equal(def.polarity, 'debuff');
  assert.equal(def.max, 6);
  assert.equal(def.trigger, 'onAttackSkill');
  assert.equal(def.cleanse, 'decrement');
  const eng = new Engine();
  eng.start('Ryan', 'Saiki');
  eng.sandblind(eng.s.player, 4);
  eng.sandblind(eng.s.player, 4);
  assert.equal(eng.s.player.sandblind, 6);
  eng.clean(eng.s.player, false, 'sandblind');
  assert.equal(eng.s.player.sandblind, 5);
  eng.clearDebuffs(eng.s.player);
  assert.equal(eng.s.player.sandblind || 0, 0);
});

test('sandblind miss skips skill and defense, and always spends 1 stack', () => {
  const eng = new Engine();
  eng.start('Ryan', 'Saiki');
  eng.later = () => {};
  eng.s.player.sandblind = 2;
  eng.rollD12 = () => 1; // threshold 4 → fail
  const aiHp = eng.s.ai.hp;
  eng.h.player = [number(3, 'RED')];
  eng.s.discardTop = number(3, 'RED');
  eng.s.phase = 'PLAYER_PLAY';
  eng.s.busy = false;
  eng.s.selectedCard = 0;
  eng.play();
  assert.equal(eng.s.player.sandblind, 1);
  assert.equal(eng.s.ai.hp, aiHp);
  assert.equal(eng.s.pendingAttack && eng.s.pendingAttack.damage, 0);
  assert.equal(!!eng.s.defenseSkipped, true);
});

test('sandblind pass still spends 1 stack and allows skill', () => {
  const eng = new Engine();
  eng.start('Ryan', 'Saiki');
  eng.later = () => {};
  eng.s.player.sandblind = 1;
  eng.rollD12 = () => 12; // threshold 2 → pass
  eng.h.player = [number(3, 'RED')];
  eng.s.discardTop = number(3, 'RED');
  eng.s.phase = 'PLAYER_PLAY';
  eng.s.busy = false;
  eng.s.selectedCard = 0;
  eng.play();
  assert.equal(eng.s.player.sandblind, 0);
  assert.ok(eng.s.pendingAttack || eng.s.phase === 'AI_DEFEND' || eng.s.phase === 'ATTACK_MOD_CHOICE' || eng.s.busy);
});

test('6 stacks of sandblind always fail the D12 check', () => {
  const eng = new Engine();
  eng.start('Ryan', 'Saiki');
  eng.s.player.sandblind = 6;
  eng.rollD12 = () => 12;
  assert.equal(eng._onAttackSkillRelease(eng.s.player), true);
  assert.equal(eng.s.player.sandblind, 5);
});

test('item cards in attack phase do not trigger sandblind', () => {
  const eng = new Engine();
  eng.start('Ryan', 'Saiki');
  eng.later = () => {};
  eng.s.player.sandblind = 3;
  const potion = { value: -1, color: 'WHITE', isWhite: true, isItemCard: true, isNumberCard: false, potion: true };
  eng.h.player = [potion];
  eng.s.discardTop = number(1, 'RED');
  eng.s.phase = 'PLAYER_PLAY';
  eng.s.busy = false;
  eng.s.selectedCard = 0;
  eng.play();
  assert.equal(eng.s.player.sandblind, 3);
});

test('AI sandblind miss skips player defense and spends 1 stack', () => {
  const eng = new Engine();
  eng.start('Ryan', 'Saiki');
  eng.later = () => {};
  eng.s.ai.sandblind = 3;
  eng.rollD12 = () => 1; // threshold 6 → fail
  const playerHp = eng.s.player.hp;
  eng.h.ai = [number(3, 'RED')];
  eng.s.discardTop = number(3, 'RED');
  eng.s.phase = 'AI_TURN';
  eng.s.busy = false;
  eng.s.aiTurnStarted = false;
  eng.s.aiHasPlayed = false;
  eng.aiTurn();
  assert.equal(eng.s.ai.sandblind, 2);
  assert.equal(eng.s.player.hp, playerHp);
  assert.notEqual(eng.s.phase, 'PLAYER_DEFEND');
});
