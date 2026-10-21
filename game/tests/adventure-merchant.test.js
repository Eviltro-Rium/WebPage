const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
function setup(ui = false) {
  const dom = new JSDOM('<div id="app"></div><div id="adventure-container"></div><div id="game-container"></div>');
  const ctx = vm.createContext({ console, Math, JSON, Date, document: dom.window.document,
    setTimeout: () => 1, clearTimeout() {}, performance: { now: () => 0 } });
  ctx.window = ctx;
  const files = ['js/combat/runtime.js', 'js/characters/registry.js', 'js/characters/ryan.js',
    'adventure/js/content/registry.js', 'adventure/js/content/currency.js', 'adventure/js/content/room.js',
    'adventure/js/map/map.js', 'adventure/js/deck/adventure_deck.js', 'adventure/js/items/item_defs.js',
    'adventure/js/engine/adventure_engine.js', 'adventure/js/engine/shop.js', 'adventure/js/engine/rewards.js',
    'adventure/js/engine/inventory.js', 'adventure/js/engine/combat_result.js', 'adventure/js/save/adventure_save.js'];
  if (ui) files.push('adventure/js/ui/adventure_ui.js', 'adventure/js/ui/adventure_ui_map_view.js',
    'adventure/js/ui/adventure_ui_panels.js', 'adventure/js/ui/adventure_ui_views.js',
    'adventure/js/battle/adventure_battle_controller.js');
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
  ctx.AdventureCurrency.rollBeastReward = () => ({ scenario: 7, auto: true, offered: { wuneng: 1 }, pickCount: 0 });
  return { ctx, dom };
}
function begin(ctx, opts = {}) {
  const eng = new ctx.AdventureEngine();
  eng.start(new ctx.AdventureMap([[0, 1, 1]]), 'Ryan', { gold: 30, ...opts });
  eng.mapName = 'merchant-test'; eng.move(0, 1);
  eng.s.combat = { enemy: { name: 'CastleWolf' } };
  let rolls = 0;
  eng._rollBasicCombatReward = () => { rolls++; return { kind: 'merchant', accessory: 'Magnet', sold: false }; };
  eng.onCombatEnd('win');
  return { eng, rolls: () => rolls };
}
function finishBeast(ctx, eng) {
  assert.equal(eng.s.pendingCombatReward.stage, 'beast');
  assert.equal(eng.claimCombatReward(), true);
  assert.equal(eng.s.phase, ctx.AdventurePhase.MAP);
}
function restore(ctx, eng) {
  const saved = JSON.parse(JSON.stringify(ctx.AdventureSave.serialize(eng)));
  const next = new ctx.AdventureEngine();
  next.restoreFromSave(saved, new ctx.AdventureMap(saved.mapLayout));
  return next;
}

test('not buying or deferring preserves the same merchant through beast settlement, leaving, and revisiting', () => {
  for (const action of ['claimCombatReward', 'deferCombatReward']) {
    const { ctx, dom } = setup(), { eng, rolls } = begin(ctx);
    assert.equal(eng[action](), true);
    assert.equal(eng.currentRoom().stashedLoot.kind, 'merchant');
    assert.equal(eng.currentRoom().stashedLoot.accessory, 'Magnet');
    finishBeast(ctx, eng);
    for (let repeat = 0; repeat < 3; repeat++) {
      assert.equal(eng.move(0, 0), true); assert.equal(eng.move(0, 1), true);
      eng.enterCurrent();
      assert.equal(eng.s.phase, ctx.AdventurePhase.REWARD);
      assert.equal(eng.snapshot().roomInfo.stashedLoot.accessory, 'Magnet');
      assert.equal(eng.s.currency.tokens.wuneng, 1, 'beast reward is not granted on re-entry');
      eng.skipReward();
    }
    assert.equal(rolls(), 1, 'no new offer is rolled');
    eng.enterCurrent(); const result = eng.buyMerchantAccessory();
    assert.equal(result.ok, true); assert.equal(result.price, 15);
    assert.equal(eng.s.currency.gold, 15); assert.deepEqual(Array.from(eng.s.accessories), ['Magnet']);
    assert.equal(eng.currentRoom().stashedLoot, null);
    assert.equal(eng.buyMerchantAccessory().ok, false);
    eng.enterCurrent(); assert.equal(eng.s.phase, ctx.AdventurePhase.MAP);
    assert.equal(rolls(), 1);
    dom.window.close();
  }
});

test('merchant persists when refreshed during beast settlement, on map, and while trading', () => {
  const { ctx, dom } = setup(); let { eng } = begin(ctx);
  eng.claimCombatReward(); eng = restore(ctx, eng);
  assert.equal(eng.currentRoom().stashedLoot.kind, 'merchant');
  finishBeast(ctx, eng); eng = restore(ctx, eng); eng.enterCurrent();
  eng = restore(ctx, eng);
  assert.equal(eng.s.phase, ctx.AdventurePhase.REWARD);
  assert.equal(eng.snapshot().roomInfo.stashedLoot.price, 15);
  assert.equal(eng.buyMerchantAccessory().ok, true);
  eng = restore(ctx, eng); eng.enterCurrent();
  assert.equal(eng.currentRoom().stashedLoot, null);
  assert.equal(eng.s.currency.gold, 15);
  assert.equal(eng.buyMerchantAccessory().ok, false);
  dom.window.close();
});

test('merchant failures retain stock; coupon prices update on both snapshot and actual charge', () => {
  const { ctx, dom } = setup(), { eng } = begin(ctx);
  eng.claimCombatReward(); finishBeast(ctx, eng); eng.enterCurrent();
  eng.s.currency.gold = 0;
  assert.equal(eng.buyMerchantAccessory().reason, 'gold');
  assert.equal(eng.currentRoom().stashedLoot.accessory, 'Magnet');
  eng.s.currency.gold = 20; eng.addItem('Magnet');
  assert.equal(eng.buyMerchantAccessory().reason, 'accessoryFull');
  assert.equal(eng.s.currency.gold, 20);
  eng.s.accessories = ['Coupon'];
  assert.equal(eng.snapshot().roomInfo.stashedLoot.price, 8, 'discount is not frozen when the offer was stashed');
  const bought = eng.buyMerchantAccessory();
  assert.equal(bought.price, 8); assert.equal(eng.s.currency.gold, 12);
  dom.window.close();
});

test('generic reward collection cannot erase a merchant offer', () => {
  const { ctx, dom } = setup(), { eng } = begin(ctx);
  eng.claimCombatReward(); finishBeast(ctx, eng); eng.enterCurrent();
  assert.equal(eng.collectReward(), null);
  assert.equal(eng.currentRoom().stashedLoot.kind, 'merchant');
  assert.equal(eng.s.currency.gold, 30);
  dom.window.close();
});

test('purchased initial merchant stays sold in snapshot and cannot be charged twice', () => {
  const { ctx, dom } = setup(), { eng } = begin(ctx);
  assert.equal(eng.buyMerchantAccessory().ok, true);
  assert.equal(eng.snapshot().pendingCombatReward.basic.sold, true);
  assert.equal(eng.buyMerchantAccessory().reason, 'sold');
  eng.claimCombatReward(); finishBeast(ctx, eng);
  assert.equal(eng.currentRoom().stashedLoot, null);
  assert.equal(eng.s.currency.gold, 15);
  dom.window.close();
});

test('real room UI retains a merchant map badge, supports revisits, and removes the badge after purchase', () => {
  const { ctx, dom } = setup(true), { eng } = begin(ctx);
  eng.claimCombatReward(); finishBeast(ctx, eng);
  const ui = new ctx.AdventureUI(dom.window.document.getElementById('app')); ui.eng = eng;
  ui._buildSidebar = ui._buildLog = ui._buildTipsBanner = () => dom.window.document.createElement('div');
  ui._queueMapReturnFeedback = () => {};
  ui.render = () => ctx.AdventureUIViews.render(ui, { ...eng.snapshot(), mapViewModel: ui._createMapViewModel() });
  ui.bindActions(); ui.render();
  const board = ui.container.querySelector('.adventure-board');
  assert.match(board.querySelector('[data-c="1"] .adv-cell-merchant-icon').getAttribute('src'), /wandering_merchant.webp$/);
  assert.match(board.querySelector('[data-c="1"]').title, /流浪商人可交易/);
  eng.enterCurrent(); ui.render();
  assert.ok(ui.container.querySelector('#adv-merchant-buy'));
  assert.equal(ui.container.querySelector('#adv-reward'), null);
  ui.container.querySelector('#adv-merchant-leave').click();
  assert.equal(eng.s.phase, ctx.AdventurePhase.MAP);
  eng.enterCurrent(); ui.render();
  ui.container.querySelector('#adv-merchant-buy').click();
  assert.equal(eng.s.phase, ctx.AdventurePhase.MAP);
  assert.equal(ui.container.querySelector('.adv-cell-merchant-icon'), null);
  ui._syncMapCells(board, ui._createMapViewModel());
  assert.equal(board.querySelector('.adv-cell-merchant-icon'), null);
  assert.equal(eng.s.currency.gold, 15);
  dom.window.close();
});

test('battle settlement uses the 64px merchant portrait and shows purchased stock as sold', () => {
  const { ctx, dom } = setup(true), { eng } = begin(ctx);
  assert.equal(ctx.AdventureBattleController.resumeSettlement(eng), true);
  const overlay = dom.window.document.getElementById('adv-settle-overlay');
  const portrait = overlay.querySelector('.adv-merchant-portrait');
  assert.equal(portrait.getAttribute('width'), '64');
  assert.match(portrait.getAttribute('src'), /wandering_merchant.webp$/);
  overlay.querySelector('#adv-settle-merchant-buy').click();
  assert.equal(overlay.querySelector('#adv-settle-merchant-buy').disabled, true);
  assert.match(overlay.textContent, /已购买/);
  assert.equal(eng.s.currency.gold, 15);
  dom.window.close();
});
