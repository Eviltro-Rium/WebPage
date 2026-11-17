const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { loadInto } = require('./_load');

const context = vm.createContext({
  console, Math, JSON, Date, setTimeout: () => 1, clearTimeout: () => {}
});
context.window = context;
loadInto(context, ['characters', 'ai', 'combat']);
const { Engine, CharacterRegistry } = context;

function number(value, color = 'RED') {
  return {
    value, color, uid: `n${value}${color}`, isNumberCard: true,
    isItemCard: false, isWhite: false, isBlack: false
  };
}

function fenricHelpers(eng, attackerKey = 'player') {
  const attacker = eng.s[attackerKey];
  return {
    guard: (n) => eng.addGuard(attacker, n),
    heal: (x, n) => eng.heal(x, n),
    draw: () => {}
  };
}

test('Fenric passive caps skill damage at 7', () => {
  const eng = new Engine();
  eng.start('Ryan', 'Fenric');
  const before = eng.s.ai.hp;
  const dealt = eng.dealAttackHit(eng.s.player, eng.s.ai, 11);
  assert.equal(dealt, 7);
  assert.equal(eng.s.ai.hp, before - 7);
});

test('Fenric passive does not cap buff damage', () => {
  const eng = new Engine();
  eng.start('Ryan', 'Fenric');
  const before = eng.s.ai.hp;
  eng.hurt(eng.s.ai, 12, false, { damageSource: 'buff', allowAvoidance: false });
  assert.equal(eng.s.ai.hp, before - 12);
});

test('Fenric attack 3 non red/blue deals +1 damage', () => {
  const eng = new Engine();
  eng.start('Fenric', 'Ryan');
  const mod = CharacterRegistry.get('Fenric');
  const card = number(3, 'YELLOW');
  const r = mod.effect(eng, 3, card, eng.s.player, eng.s.ai, 'player', fenricHelpers(eng));
  assert.equal(r.d, 5);
  assert.equal(r.unblock, false);
});

test('Fenric attack 3 red gains harden', () => {
  const eng = new Engine();
  eng.start('Fenric', 'Ryan');
  const mod = CharacterRegistry.get('Fenric');
  const card = number(3, 'RED');
  const r = mod.effect(eng, 3, card, eng.s.player, eng.s.ai, 'player', fenricHelpers(eng));
  assert.equal(r.d, 4);
  assert.equal(eng.s.player.harden, 1);
});

test('Fenric attack 0 is unblockable with harden', () => {
  const eng = new Engine();
  eng.start('Fenric', 'Ryan');
  eng.s.player.harden = 1;
  const mod = CharacterRegistry.get('Fenric');
  const card = number(0, 'RED');
  const r = mod.effect(eng, 0, card, eng.s.player, eng.s.ai, 'player', fenricHelpers(eng));
  assert.equal(r.d, 4);
  assert.equal(eng.s.player.guard, 2);
  assert.equal(r.unblock, true);
});

test('Fenric defend 1 blocks half and applies hypothermia', () => {
  const eng = new Engine();
  eng.start('Fenric', 'Ryan');
  const mod = CharacterRegistry.get('Fenric');
  const card = number(1, 'BLUE');
  const r = mod.defend(eng, 'Fenric', 1, 7, card, eng.s.player, eng.s.ai, 'player', 'BLUE', {
    counter: (x, n) => eng.counterAttack(eng.s.player, x, n),
    hurt: (x, n) => eng.hurt(x, n)
  });
  assert.equal(r.remaining, 3);
  assert.equal(eng.s.ai.hypothermia, 1);
});

test('Fenric defend 0 reflects via counter attack', () => {
  const eng = new Engine();
  eng.start('Fenric', 'Ryan');
  const mod = CharacterRegistry.get('Fenric');
  const card = number(0, 'RED');
  const before = eng.s.ai.hp;
  const r = mod.defend(eng, 'Fenric', 0, 6, card, eng.s.player, eng.s.ai, 'player', 'RED', {
    counter: (x, n) => eng.counterAttack(eng.s.player, x, n),
    hurt: (x, n) => eng.hurt(x, n)
  });
  assert.equal(r.remaining, 0);
  assert.equal(eng.s.ai.hp, before - 6);
});