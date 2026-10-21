const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const gameRoot = path.resolve(__dirname, '..');
const context = vm.createContext({
  console, Math, JSON, Date,
  Image: class Image { constructor() { this.complete = true; this.naturalWidth = 1; } },
  setTimeout: () => 1, clearTimeout: () => {},
  performance: { now: () => 0 }
});
context.window = context;

const sources = [
  'js/combat/runtime.js',
  'js/characters/registry.js',
  'js/characters/ryan.js',
  'adventure/js/content/registry.js',
  'adventure/js/content/currency.js',
  'adventure/js/content/room.js',
  'adventure/js/map/map.js',
  'adventure/js/deck/adventure_deck.js',
  'adventure/js/items/item_defs.js',
  'adventure/js/items/map_effects.js',
  'adventure/js/engine/adventure_engine.js',
  'adventure/js/engine/loot.js',
  'adventure/js/engine/shop.js',
  'adventure/js/engine/rewards.js',
  'adventure/js/engine/inventory.js',
  'adventure/js/engine/combat_result.js'
];
for (const relative of sources) {
  const file = path.join(gameRoot, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { AdventureCurrency, AdventureEngine, AdventureMap, AdventurePhase } = context;

function currency(tokens) {
  const c = new AdventureCurrency();
  if (tokens) c.addTokens(tokens);
  return c;
}

test('single exact typed pay: one plan, usesWild false', () => {
  const c = currency({ ben: 2, cao: 0, wuneng: 0 });
  const plans = c.listBeastPaymentPlans(['ben', 'ben']);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].ben, 2);
  assert.equal(plans[0].wuneng, 0);
  assert.equal(plans[0].usesWild, false);
});

test('explicit cost wuneng alone does not set usesWild', () => {
  const c = currency({ ben: 1, wuneng: 1 });
  const plans = c.listBeastPaymentPlans(['ben', 'wuneng']);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].ben, 1);
  assert.equal(plans[0].wuneng, 1);
  assert.equal(plans[0].usesWild, false);
});

test('shortfall filled only by wild: single plan usesWild true', () => {
  const c = currency({ ben: 1, wuneng: 1 });
  const plans = c.listBeastPaymentPlans(['ben', 'ben']);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].ben, 1);
  assert.equal(plans[0].wuneng, 1);
  assert.equal(plans[0].usesWild, true);
});

function spendKey(p) {
  return ['ben', 'cao', 'shui', 'huo', 'wuneng'].map(t => p[t] || 0).join(',');
}

test('typed enough AND spare wuneng: unique spend signatures', () => {
  const c = currency({ ben: 2, wuneng: 2 });
  const plans = c.listBeastPaymentPlans(['ben', 'ben']);
  // only one typed kind → 3 spends: 本×2 / 本+万 / 万×2
  assert.equal(plans.length, 3);
  assert.ok(plans.some(p => !p.usesWild && p.ben === 2 && p.wuneng === 0));
  assert.ok(plans.some(p => p.usesWild && p.ben === 1 && p.wuneng === 1));
  assert.ok(plans.some(p => p.usesWild && p.ben === 0 && p.wuneng === 2));
  assert.equal(new Set(plans.map(spendKey)).size, plans.length);
});

test('ben+huo with typed+wuneng>=2: 4 distinct spend plans including both mixes', () => {
  const c = currency({ ben: 1, huo: 1, wuneng: 2 });
  const plans = c.listBeastPaymentPlans(['ben', 'huo']);
  assert.equal(plans.length, 4);
  assert.equal(new Set(plans.map(spendKey)).size, 4);
  const typed = plans.find(p => !p.usesWild);
  assert.ok(typed);
  assert.equal(typed.ben, 1);
  assert.equal(typed.huo, 1);
  assert.equal(typed.wuneng, 0);
  const wildOnes = plans.filter(p => p.usesWild && p.wuneng === 1);
  assert.equal(wildOnes.length, 2); // ben+万 and huo+万 both kept
  assert.ok(wildOnes.some(p => p.ben === 1 && p.huo === 0));
  assert.ok(wildOnes.some(p => p.ben === 0 && p.huo === 1));
  const allWild = plans.find(p => p.wuneng === 2);
  assert.ok(allWild);
  assert.equal(allWild.ben, 0);
  assert.equal(allWild.huo, 0);
  assert.equal(allWild.usesWild, true);
});

test('ben+huo with wuneng=1: 3 plans, no wuneng×2', () => {
  const c = currency({ ben: 1, huo: 1, wuneng: 1 });
  const plans = c.listBeastPaymentPlans(['ben', 'huo']);
  assert.equal(plans.length, 3);
  assert.ok(plans.some(p => !p.usesWild && p.ben === 1 && p.huo === 1 && p.wuneng === 0));
  assert.ok(plans.some(p => p.usesWild && p.ben === 1 && p.huo === 0 && p.wuneng === 1));
  assert.ok(plans.some(p => p.usesWild && p.ben === 0 && p.huo === 1 && p.wuneng === 1));
  assert.ok(!plans.some(p => p.wuneng === 2));
  assert.equal(new Set(plans.map(spendKey)).size, plans.length);
});

test('two typed need + 1 wild: 3 distinct spends (no wildSub collapse)', () => {
  const c = currency({ ben: 1, cao: 1, wuneng: 1 });
  const plans = c.listBeastPaymentPlans(['ben', 'cao']);
  assert.equal(plans.length, 3);
  const typed = plans.find(p => !p.usesWild);
  assert.ok(typed);
  assert.equal(typed.ben, 1);
  assert.equal(typed.cao, 1);
  assert.equal(typed.wuneng, 0);
  const wildOnes = plans.filter(p => p.usesWild);
  assert.equal(wildOnes.length, 2);
  assert.ok(wildOnes.every(p => p.wuneng === 1));
  assert.ok(wildOnes.some(p => p.ben === 1 && p.cao === 0));
  assert.ok(wildOnes.some(p => p.ben === 0 && p.cao === 1));
  assert.equal(new Set(plans.map(spendKey)).size, plans.length);
});

test('payBeastCost with spend map pays exactly that plan', () => {
  const c = currency({ ben: 2, wuneng: 2 });
  const plans = c.listBeastPaymentPlans(['ben', 'ben']);
  const wildPlan = plans.find(p => p.ben === 0 && p.wuneng === 2);
  assert.ok(wildPlan);
  assert.equal(c.payBeastCost(['ben', 'ben'], wildPlan), true);
  assert.equal(c.tokens.ben, 2);
  assert.equal(c.tokens.wuneng, 0);
});

test('blacksmith auto-pays single typed plan without pending', () => {
  const map = new AdventureMap([[0, 5]]);
  const eng = new AdventureEngine();
  eng.start(map, 'Ryan');
  eng.s.currency.addGold(10);
  assert.ok(eng.move(0, 1));
  eng.enterCurrent();
  const room = eng.currentRoom();
  room.blacksmithSlots = ['BurnTrophy'.length ? 'FlameFist' : null, null, null];
  // FlameFist costs huo×4 + ben — give exact typed
  room.blacksmithSlots = ['FlameFist', null, null];
  eng.s.currency.addTokens({ huo: 4, ben: 1 });
  const buy = eng.buyBlacksmithSlot(0);
  assert.equal(buy.ok, true);
  assert.equal(eng.s.pendingBeastPayment, null);
  assert.equal(eng.s.currency.tokens.huo, 0);
  assert.equal(eng.s.currency.tokens.ben, 0);
  assert.ok(eng.s.accessories.includes('FlameFist'));
});

test('blacksmith with typed+spare wild sets pendingBeastPayment', () => {
  const map = new AdventureMap([[0, 5]]);
  const eng = new AdventureEngine();
  eng.start(map, 'Ryan');
  eng.s.currency.addGold(10);
  assert.ok(eng.move(0, 1));
  eng.enterCurrent();
  const room = eng.currentRoom();
  room.blacksmithSlots = ['FlameFist', null, null];
  eng.s.currency.addTokens({ huo: 4, ben: 1, wuneng: 1 });
  const pending = eng.buyBlacksmithSlot(0);
  assert.equal(pending.ok, false);
  assert.equal(pending.needBeastChoice, true);
  assert.ok(eng.s.pendingBeastPayment);
  assert.ok(pending.plans.length > 1);
  const snap = eng.snapshot();
  assert.ok(snap.pendingBeastPayment);
  assert.equal(snap.pendingBeastPayment.kind, 'blacksmithSlot');
  assert.ok(Array.isArray(snap.pendingBeastPayment.plans));
  // tokens unchanged until confirm
  assert.equal(eng.s.currency.tokens.huo, 4);
  assert.equal(eng.s.currency.tokens.wuneng, 1);
  const typed = pending.plans.find(p => !p.usesWild);
  assert.ok(typed);
  const buy = eng.confirmBeastPayment(typed);
  assert.equal(buy.ok, true);
  assert.equal(eng.s.pendingBeastPayment, null);
  assert.equal(eng.s.currency.tokens.huo, 0);
  assert.equal(eng.s.currency.tokens.wuneng, 1);
  assert.ok(eng.s.accessories.includes('FlameFist'));
});

test('cancelBeastPayment clears pending without spending', () => {
  const map = new AdventureMap([[0, 5]]);
  const eng = new AdventureEngine();
  eng.start(map, 'Ryan');
  eng.s.currency.addGold(10);
  assert.ok(eng.move(0, 1));
  eng.enterCurrent();
  eng.currentRoom().blacksmithSlots = ['FlameFist', null, null];
  eng.s.currency.addTokens({ huo: 3, ben: 1, wuneng: 1 });
  const pending = eng.buyBlacksmithSlot(0);
  assert.equal(pending.needBeastChoice, true);
  assert.equal(eng.cancelBeastPayment().ok, true);
  assert.equal(eng.s.pendingBeastPayment, null);
  assert.equal(eng.s.currency.tokens.huo, 3);
  assert.equal(eng.s.currency.tokens.wuneng, 1);
  assert.equal(eng.currentRoom().blacksmithSlots[0], 'FlameFist');
});

test('door cost same rules: substitute-only requires confirm', () => {
  const map = new AdventureMap([[0, 3]]);
  const eng = new AdventureEngine();
  eng.start(map, 'Ryan');
  const room = eng.s.map.get(0, 1);
  room.doorCost = ['ben', 'cao'];
  eng.s.currency.tokens.ben = 1;
  eng.s.currency.tokens.wuneng = 1;
  assert.ok(eng.move(0, 1));
  const pending = eng.enterCurrent();
  assert.equal(pending.needBeastChoice, true);
  assert.equal(room.doorUnlocked, false);
  const opened = eng.confirmBeastPayment(0);
  assert.equal(opened.ok, true);
  assert.equal(room.doorUnlocked, true);
  assert.equal(eng.s.currency.tokens.ben, 0);
  assert.equal(eng.s.currency.tokens.wuneng, 0);
  assert.equal(eng.s.phase, AdventurePhase.REWARD);
});
