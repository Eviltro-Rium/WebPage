const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Math, JSON, setTimeout: () => 1, clearTimeout: () => {} });
context.window = context;

for (const relative of ['js/combat/events.js', 'js/combat/status_registry.js', 'js/combat/status_service.js', 'js/combat/status.js']) {
  const file = path.join(root, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

test('status registry describes and clears every current status', () => {
  const registry = context.FurryGame.StatusRegistry;
  const entity = {
    burn: 2, bleed: 2, poison: 1, frozen: true, blind: 1, bomb: 3, iceSeal: 1,
    hypothermia: 2, bindMark: true, guard: 2, fly: 1, crit: 1, lush: 1,
    parasite: 1, diving: true, bloodthirst: true, hypnosis: true, sleep: true,
    chaos_red: true, chaos_yellow: true, chaos_blue: true, chaos_green: true
  };

  assert.ok(registry.get('hypothermia'));
  assert.equal(registry.get('bind').property, 'bindMark');
  assert.equal(registry.get('diving').trigger, 'onBlueAttack');
  registry.all.forEach(def => {
    assert.ok(def.icon, `${def.id} needs an icon`);
    assert.ok(def.polarity === 'buff' || def.polarity === 'debuff', `${def.id} needs polarity`);
    assert.ok(def.cleanse, `${def.id} needs cleanse metadata`);
    assert.ok(def.trigger, `${def.id} needs trigger metadata`);
    assert.equal(typeof def.stack, 'boolean', `${def.id} needs stack metadata`);
  });
  assert.equal(registry.list(entity).length, registry.all.length);
  assert.equal(registry.list(entity, def => def.polarity === 'debuff').length, registry.debuffs.length);
  assert.equal(registry.list(entity, def => def.polarity === 'buff').length, registry.buffs.length);

  registry.clear(entity, 'burn');
  assert.equal(entity.burn, 1);
  registry.clearGroup(entity, 'debuff', 'all');
  registry.clearGroup(entity, 'buff', 'all');
  assert.equal(registry.list(entity).length, 0);
});

test('EngineStatus delegates cleanup to the registry', () => {
  const entity = { burn: 1, bindMark: true, diving: true, chaos_blue: true, guard: 2 };
  context.FurryGame.EngineStatus.clearDebuffs(entity);
  assert.equal(entity.burn, 0);
  assert.equal(entity.bindMark, false);
  context.FurryGame.EngineStatus.clearPositiveBuffs(entity);
  assert.equal(entity.diving, false);
  assert.equal(entity.chaos_blue, false);
  assert.equal(entity.guard, 0);
});

test('StatusService is the single clamped mutation boundary', () => {
  const service = context.FurryGame.StatusService;
  const entity = {};
  service.ensure(entity);
  service.add(entity, 'burn', 99);
  service.add(entity, 'guard', 99);
  service.add(entity, 'freeze', 1);
  assert.equal(entity.burn, 5);
  assert.equal(entity.guard, 5);
  assert.equal(entity.frozen, true);
  service.remove(entity, 'burn', 2);
  service.clear(entity, 'freeze');
  assert.equal(entity.burn, 3);
  assert.equal(entity.frozen, false);
  service.clearGroup(entity, 'buff', 'all');
  assert.equal(entity.guard, 0);
});
