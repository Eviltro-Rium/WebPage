const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');

function setup(t) {
  const dom = new JSDOM(`<body><main id="game-screen">
    <div id="npc-deck-info">怪物牌库</div><div id="discard-top"></div>
    <div id="adventure-info-bar"></div><div id="ai-hand"></div><div id="ai2-hand"></div>
    <div class="player-hand-zone"><div id="player-hand"></div></div>
    <div id="adventure-item-bar"></div><div id="controls"></div>
  </main></body>`, { runScripts: 'outside-only' });
  const w = dom.window;
  w.GameUI = function () {};
  w.cardId = card => String(card.uid);
  w.AdventureRegistry = { getItem: name => ({ name, kind: 'consumable', combatUse: 'heal', displayName: name }) };
  const timers = [];
  w.setTimeout = fn => { timers.push(fn); return timers.length; };
  w.FurryGame = { CombatRuntime: { wait: async () => {}, schedule: (owner, fn) => w.setTimeout(fn) } };
  for (const file of ['js/ui/render/runtime.js', 'js/ui/renderer.js', 'js/ui/events.js', 'js/ui/render/adventure_bar.js']) {
    w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  }
  const ui = new w.GameUI();
  ui.gameScreen = w.document.getElementById('game-screen');
  ui.state = { isAdventure: true, phase: 'PLAYER_PLAY', player: {}, adventureConsumables: [
    { name: 'Potion', displayName: '药剂' }, { name: 'Potion', displayName: '药剂' }
  ], adventureAccessories: [] };
  ui._showZoneDesc = () => {};
  ui._renderPlayerHand = () => {};
  ui._renderAIHand = () => {};
  ui._renderDiscardTop = () => {};
  ui._updateUseItemButton = () => {};
  t.after(() => dom.window.close());
  return { w, ui, timers, doc: w.document };
}

test('inventory stays below controls with currency below equipment across repeated renders', t => {
  const { ui, doc } = setup(t);
  for (let i = 0; i < 5; i++) ui._renderAdventureItemBar(ui.state);
  const panel = doc.querySelector('.adventure-inventory-panel');
  assert.equal(doc.querySelectorAll('.adventure-inventory-panel').length, 1);
  assert.equal(doc.getElementById('controls').nextElementSibling, panel);
  assert.deepEqual([...panel.children].map(node => node.id), ['adventure-item-bar', 'adventure-info-bar']);
  assert.equal(doc.querySelectorAll('[data-item-index]').length, 2);
});

test('consume animation targets exactly one duplicate, holds layout, then allows the shifted item to reappear', async t => {
  const { ui, doc, timers } = setup(t);
  ui._renderAdventureItemBar(ui.state);
  const [first, second] = doc.querySelectorAll('[data-item-index]');
  const consuming = ui._playCombatItemConsumption({ itemIndex: 0, itemName: 'Potion' });
  assert.ok(first.classList.contains('item-consuming'));
  assert.ok(!second.classList.contains('item-consuming'));
  assert.equal(first.style.visibility, '');
  timers.shift()();
  await consuming;
  assert.equal(first.style.visibility, 'hidden');
  assert.equal(second.style.visibility, '');
  assert.ok(first.isConnected, 'slot dimensions remain until the effect finishes');
  ui._isConsumingEvents = true;
  ui.state.adventureConsumables.shift();
  ui._renderAdventureItemBar(ui.state);
  assert.equal(first.style.visibility, 'hidden', 'an intermediate repaint cannot reveal the consumed slot');
  ui._isConsumingEvents = false;
  ui._renderAdventureItemBar(ui.state);
  const remaining = doc.querySelector('[data-item-index="0"]');
  assert.equal(remaining.style.visibility, '');
  assert.equal(remaining.hasAttribute('aria-hidden'), false);
});

test('refreshed inventory and reduced motion cannot consume a replacement slot', async t => {
  const { ui, doc, w, timers } = setup(t);
  ui._renderAdventureItemBar(ui.state);
  await ui._playCombatItemConsumption({ itemIndex: 0, itemName: 'Other' });
  assert.equal(timers.length, 0);
  await ui._playCombatItemConsumption({ itemIndex: 0, itemName: 'Potion', inventoryBefore: ['Potion', 'Potion', 'Potion'] });
  assert.equal(timers.length, 0, 'already refreshed duplicate inventory is not consumed twice');
  w.matchMedia = () => ({ matches: true });
  await ui._playCombatItemConsumption({ itemIndex: 1, itemName: 'Potion' });
  assert.equal(timers.length, 0);
  assert.equal(doc.querySelector('[data-item-index="1"]').style.visibility, 'hidden');
});

test('consume feedback precedes only its own effects, preserving earlier events and authoritative IDs', t => {
  const { ui } = setup(t);
  const events = [
    { id: 5, type: 'desc' }, { id: 6, type: 'discard' }, { id: 7, type: 'draw' },
    { id: 8, type: 'itemConsumed', effectAfterId: 5 },
    { id: 9, type: 'cardTransfer' }, { id: 10, type: 'itemConsumed', effectAfterId: 8 }
  ];
  assert.deepEqual(Array.from(ui._animationOrder(events), e => e.id), [5, 8, 6, 7, 10, 9]);
  assert.deepEqual(events.map(e => e.id), [5, 6, 7, 8, 9, 10]);
});

test('discard and redraw keeps the outgoing hand available before draw playback', t => {
  const { ui } = setup(t);
  const renders = [];
  ui._renderPlayerHand = opts => renders.push(opts);
  ui._prepareHandAnimation([{ type: 'discard', from: 'hand', who: 'player' }, { type: 'draw', who: 'player', count: 2 }]);
  assert.equal(renders.length, 0);
  ui._prepareHandAnimation([{ type: 'draw', who: 'player', count: 2 }]);
  assert.equal(renders[0].hideTrailing, 2);
});

test('borrowed card flies from its NPC hand while the player arrival is masked', async t => {
  const { ui, doc } = setup(t);
  const source = doc.createElement('canvas'); source.className = 'card-canvas'; source.dataset.cardId = 'borrowed';
  doc.getElementById('ai2-hand').appendChild(source);
  ui._findHandCardElement = hand => hand.querySelector('canvas');
  const actions = [];
  ui._renderPlayerHand = opts => actions.push(['render', opts.hideTrailing]);
  ui._repaintOwnerHand = who => actions.push(['settle', who]);
  ui.anim = { flyCard: async (card, from, to, duration, arc, who) => {
    assert.equal(who, 'ai2'); assert.equal(source.style.visibility, 'hidden');
    assert.equal(to.id, 'player-hand'); assert.ok(from.getBoundingClientRect());
    actions.push(['fly', card.uid]);
  } };
  await ui._playEvents([{ type: 'cardTransfer', who: 'player', from: 'ai2', card: { uid: 'borrowed' } }]);
  assert.deepEqual(actions, [['render', 1], ['fly', 'borrowed'], ['settle', 'ai2'], ['settle', 'player']]);
  assert.equal(ui._drawAnimationRemaining.player, 0);
});

test('chaos orb deck discard flies simultaneously from the NPC deck and preserves unrelated hand cards', async t => {
  const { ui, doc } = setup(t);
  const hand = doc.getElementById('ai-hand');
  hand.innerHTML = '<canvas class="card-canvas" data-card-id="same"></canvas>';
  const origins = [];
  ui._repaintOwnerHand = () => { throw Error('deck discard must not repaint a hand'); };
  ui.anim = { discardCard: async (card, origin, target, faceUp, opts) => {
    origins.push(origin.getBoundingClientRect()); assert.equal(faceUp, true); assert.equal(opts.landsOnTop, false);
  } };
  await ui._playDiscardManyAnimation({ who: 'ai', from: 'npcDeck', faceUp: true, cards: [{ uid: 'same' }, { uid: 'other' }] });
  assert.equal(origins.length, 2); assert.equal(hand.children.length, 1);
});
