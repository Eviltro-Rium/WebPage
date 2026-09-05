const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const gameRoot = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Math, JSON });
context.window = context;
for (const file of ['js/combat_events.js', 'js/engine_status.js', 'js/engine_damage.js']) {
  const fullPath = path.join(gameRoot, file);
  vm.runInContext(fs.readFileSync(fullPath, 'utf8'), context, { filename: fullPath });
}

const { FurryGame } = context;
const { EngineStatus, EngineDamage } = FurryGame;
const targets = ['player', 'ai', 'ai2'];
const damageKinds = [
  FurryGame.CombatEvents.DamageKinds.NORMAL,
  FurryGame.CombatEvents.DamageKinds.BLEED,
  FurryGame.CombatEvents.DamageKinds.POISON,
  'bomb'
];

function harness() {
  const state = {
    player: { name: 'Player', hp: 20, maxHp: 20, alive: true, burn: 0, bleed: 0, poison: 0 },
    ai: { name: 'AI Fox', hp: 20, maxHp: 20, alive: true, burn: 0, bleed: 0, poison: 0 },
    ai2: { name: 'AI2 Bear', hp: 20, maxHp: 20, alive: true, burn: 0, bleed: 0, poison: 0 },
    bombPlayTokens: {}
  };
  const events = [];
  const engine = {
    s: state,
    name(entity) { return entity.name.replace(/^AI\d*\s+/, ''); },
    emit(type, desc, card, extra) { events.push(Object.assign({ type, desc, card }, extra)); }
  };
  return { engine, state, events };
}

test('damage events use target and kind for every participant and damage kind', () => {
  for (const target of targets) {
    for (const kind of damageKinds.slice(0, 3)) {
      const { engine, state, events } = harness();
      const entity = state[target];
      EngineDamage.apply(engine, entity, 3, kind === 'normal' ? false : kind);
      const event = events.at(-1);
      assert.equal(event.target, target);
      assert.equal(event.who, target);
      assert.equal(event.kind, kind);
      assert.equal(event.type, kind === 'normal' ? 'hit' : 'hurt');
    }
  }
});

test('bomb settlement emits one typed event for every participant', () => {
  for (const target of targets) {
    const { engine, state, events } = harness();
    state[target].bomb = 1;
    state.bombPlayTokens[target] = 1;
    EngineDamage.tickBomb(engine, target);
    assert.equal(events.length, 1);
    assert.deepEqual(
      { type: events[0].type, target: events[0].target, kind: events[0].kind, amount: events[0].amount },
      { type: 'bombExplode', target, kind: 'bomb', amount: 5 }
    );
    assert.equal(state[target].hp, 15);
  }
});

test('normal damage presentation no longer inspects the description text', () => {
  const uiEvents = fs.readFileSync(path.join(gameRoot, 'js', 'ui_events.js'), 'utf8');
  assert.equal(uiEvents.includes("includes('[伤害]')"), false);
  assert.equal(uiEvents.includes('includes("[伤害]")'), false);
});
