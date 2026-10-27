const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'script_manifest.json'), 'utf8'));
function context(dom) {
  const ctx = vm.createContext({ console, Math, JSON, Date, setTimeout: () => 1, clearTimeout() {},
    performance: { now: () => 0 }, document: dom && dom.window.document,
    matchMedia: () => ({ matches: true }), Image: class {} });
  ctx.window = ctx;
  const runtime = manifest.adventure_runtime.slice(0, manifest.adventure_runtime.indexOf('adventure/js/engine/glitch.js') + 1);
  const files = [...manifest.characters, ...manifest.ai, ...manifest.combat, ...manifest.adventure_content,
    ...runtime, 'adventure/js/save/adventure_save.js', 'adventure/js/battle/battle_engine.js',
    'adventure/js/battle/adventure_battle_items.js', 'adventure/js/battle/dice_controller.js'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
  return ctx;
}
function engine(ctx, opts = {}) {
  const eng = new ctx.AdventureEngine();
  eng.start(new ctx.AdventureMap([[0, 7, 1]]), 'Ryan', { scene: 'castle', stage: 3, ...opts });
  eng.mapName = 'glitch-test';
  assert.equal(eng.move(0, 1), true);
  eng.enterCurrent();
  return eng;
}
function roll(ctx, eng, face) {
  ctx.FurryGame.CombatRuntime.setRandomSource(() => (face - .5) / 12);
  assert.equal(eng.rollGlitchEvent(), true);
  ctx.FurryGame.CombatRuntime.resetRandomSource();
}
function restore(ctx, eng) {
  const save = JSON.parse(JSON.stringify(ctx.AdventureSave.serialize(eng)));
  const next = new ctx.AdventureEngine();
  next.restoreFromSave(save, new ctx.AdventureMap(save.mapLayout));
  return next;
}
const total = pile => pile.hand.length + pile.deck.length + pile.discard.length;

test('entering opens exploration; leaving before the roll preserves the one-shot opportunity', () => {
  const ctx = context(), eng = engine(ctx);
  assert.equal(eng.canMoveTo(0, 2), false, 'pending event page locks movement');
  assert.equal(eng.leaveGlitchRoom(), true);
  assert.equal(eng.canMoveTo(0, 2), true);
  eng.enterCurrent();
  roll(ctx, eng, 9);
  assert.equal(eng.rollGlitchEvent(), false);
  assert.equal(eng.leaveGlitchRoom(), false, 'cannot skip a committed die');
  assert.equal(eng.move(0, 2), false);
  eng.resolveGlitchEvent();
  assert.equal(eng.leaveGlitchRoom(), true);
  eng.enterCurrent();
  assert.equal(eng.rollGlitchEvent(), false);
});

test('all twelve faces execute the six documented outcomes exactly once', async t => {
  for (let face = 1; face <= 12; face++) await t.test('face ' + face, () => {
    const ctx = context(), eng = engine(ctx, { consumables: ['FirstAidKit'] });
    eng.s.player.hp = eng.s.player.maxHp - 20;
    eng.s.player.burn = 2; eng.s.player.guard = 2; eng.s.player.crit = 1;
    const pile = eng.s.playerPile, count = total(pile), oldHand = pile.hand.slice();
    roll(ctx, eng, face);
    assert.equal(eng.resolveGlitchEvent(), true);
    assert.equal(eng.resolveGlitchEvent(), false);
    const event = eng.currentRoom().glitchEvent;
    if (face <= 2) {
      assert.equal(event.status, 'combat');
      assert.notEqual(event.scene, 'castle');
      assert.equal(eng.s.combat.enemy.name, event.monsterName);
      assert.equal(eng.s.combat.kind, 'glitch');
      assert.equal(eng.s.stage, 3);
      assert.ok(ctx.AdventureRegistry.getMonster(event.monsterName));
    } else if (face <= 4) {
      assert.equal(event.status, 'discard');
      assert.equal(eng.leaveGlitchRoom(), false);
      assert.equal(eng.discardGlitchItem(0), true);
      assert.equal(eng.s.consumables.length, 0);
      assert.equal(eng.discardGlitchItem(0), false);
    } else if (face <= 6) {
      assert.equal(eng.s.player.burn, 0);
      assert.equal(eng.s.player.guard, 0);
      assert.equal(eng.s.player.crit, 0);
    } else if (face <= 8) {
      assert.equal(pile.hand.length, 3);
      assert.ok(oldHand.every(card => pile.discard.includes(card)));
      assert.equal(eng.s.discardTop.get(), null);
    } else if (face <= 10) {
      assert.equal(eng.s.player.hp, eng.s.player.maxHp - 10);
      assert.equal(pile.hand.length, pile.handLimit);
    } else {
      assert.equal(eng.s.consumables.length, 2);
      assert.equal(ctx.AdventureRegistry.getItem(event.itemName).kind, 'consumable');
    }
    assert.equal(total(pile), count, 'events conserve the physical deck');
  });
});

test('discard with no items completes; random item overflow requires a choice', () => {
  const ctx = context(), empty = engine(ctx);
  roll(ctx, empty, 3); empty.resolveGlitchEvent();
  assert.equal(empty.currentRoom().glitchEvent.status, 'done');
  const full = engine(ctx, { consumables: Array(6).fill('FirstAidKit'), accessories: ['Magician'] });
  roll(ctx, full, 11); full.resolveGlitchEvent();
  assert.equal(full.s.consumables.length, 7);
  assert.notEqual(full.currentRoom().glitchEvent.itemName, 'DiceController');
  assert.equal(full.useConsumable(0).ok, false);
  assert.equal(full.leaveGlitchRoom(), false);
  const next = restore(ctx, full);
  assert.equal(next.currentRoom().glitchEvent.status, 'overflow');
  next.discardGlitchItem(6);
  assert.equal(next.s.consumables.length, 6);
  assert.equal(next.leaveGlitchRoom(), true);
});

test('Magician adjusts once with its existing HP cost; remote cannot adjust the event', () => {
  const ctx = context(), eng = engine(ctx, { accessories: ['Magician'] });
  roll(ctx, eng, 1);
  const hp = eng.s.player.hp;
  assert.equal(eng.adjustGlitchDice(-1), false);
  assert.equal(eng.adjustGlitchDice(1), true);
  assert.equal(eng.s.player.hp, hp - 3);
  assert.equal(eng.adjustGlitchDice(1), false);
  const next = restore(ctx, eng);
  assert.equal(next.s.phase, ctx.AdventurePhase.GLITCH);
  assert.equal(next.currentRoom().glitchEvent.roll, 2);
  assert.equal(next.rollGlitchEvent(), false);
  assert.equal(next.adjustGlitchDice(-1), false);
  const remote = engine(ctx, { consumables: ['DiceController'] });
  roll(ctx, remote, 6);
  assert.equal(remote.adjustGlitchDice(1), false);
  assert.equal(remote.s.consumables[0], 'DiceController');
  const blind = engine(ctx, { accessories: ['Magician'] });
  blind.s.player.blind = 1; roll(ctx, blind, 6);
  assert.equal(blind.adjustGlitchDice(1), false);
  blind.s.player.blind = 0; blind.s.player.hp = 3;
  assert.equal(blind.adjustGlitchDice(1), false);
});

test('saved outcomes never grant resources again; pending discard survives reload', () => {
  const ctx = context(), eng = engine(ctx, { consumables: ['FirstAidKit'] });
  roll(ctx, eng, 3); eng.resolveGlitchEvent();
  const next = restore(ctx, eng);
  assert.equal(next.currentRoom().glitchEvent.status, 'discard');
  next.discardGlitchItem(0); next.leaveGlitchRoom(); next.enterCurrent();
  assert.equal(next.resolveGlitchEvent(), false);
  assert.equal(next.rollGlitchEvent(), false);
  const gift = engine(ctx); roll(ctx, gift, 12); gift.resolveGlitchEvent();
  const savedGift = restore(ctx, gift);
  assert.equal(savedGift.s.consumables.length, 1);
  assert.equal(savedGift.resolveGlitchEvent(), false);
});

test('glitch encounter survives combat reload, and hourglass escape permanently consumes its event', () => {
  const ctx = context(), eng = engine(ctx);
  roll(ctx, eng, 1); eng.resolveGlitchEvent();
  const name = eng.s.combat.enemy.name;
  eng.markActiveCombat();
  const next = restore(ctx, eng);
  next.enterCurrent();
  assert.equal(next.s.combat.enemy.name, name);
  assert.equal(next.currentRoom().glitchEvent.status, 'combat');
  const escape = ctx.AdventureCombatEffects.apply({ s: { isAdventure: true }, _adventureEngine: next },
    ctx.AdventureRegistry.getItem('RewindHourglass'));
  assert.equal(escape.ok, true);
  assert.match(escape.message, /不能重新抽取/);
  next.rewindCurrentRoomCombat();
  next.enterCurrent();
  assert.equal(next.s.phase, ctx.AdventurePhase.GLITCH);
  assert.equal(next.currentRoom().glitchEvent.status, 'done');
  assert.equal(next.rollGlitchEvent(), false);
  assert.equal(next.s.combat, null);
});

test('glitch victory keeps normal monster trophy drops and skips normal rewards and base healing', () => {
  const ctx = context(), eng = engine(ctx);
  roll(ctx, eng, 1); eng.resolveGlitchEvent();
  const battle = new ctx.AdventureBattleEngine();
  battle._adventureEngine = eng;
  battle.startAdventure({ player: 'Ryan', opponent: eng.s.combat.enemy.name, stage: 3, scene: 'castle' });
  const dropRow = ctx.AdventureLoot.getDropTable(eng.s.combat.enemy.name).find(row => row.first <= 10 && row.drops.length);
  assert.ok(dropRow, 'foreign monster has its own trophy rule');
  ctx.FurryGame.CombatRuntime.setRandomSource(() => (dropRow.first - .5) / 12);
  battle.s.ai.hp = 0; battle.s.ai.alive = false; battle.check();
  ctx.FurryGame.CombatRuntime.resetRandomSource();
  assert.deepEqual(Array.from(battle.s.trophyDrops), Array.from(dropRow.drops));
  assert.equal(battle.s.trophyRolls.length, 1);
  eng.s.player.hp -= 5;
  const hp = eng.s.player.hp, gold = eng.s.currency.gold;
  eng.onCombatEnd('win');
  assert.equal(eng.s.phase, ctx.AdventurePhase.MAP);
  assert.equal(eng.s.pendingCombatReward, null);
  assert.equal(eng.s.beastReward, null);
  assert.equal(eng.s.currency.gold, gold);
  assert.equal(eng.s.player.hp, hp);
  eng.enterCurrent();
  assert.equal(eng.rollGlitchEvent(), false);
});

test('all sixty CSV and embedded maps use the required count and remain connected', () => {
  const ctx = context();
  const files = fs.readdirSync(path.join(root, 'adventure/maps')).filter(name => /^stage_.*\.csv$/.test(name));
  assert.equal(files.length, 60);
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, 'adventure/maps', file), 'utf8');
    assert.equal(ctx.AdventureMapData[file.replace('.csv', '')], source.replace(/\r\n/g, '\n'));
    const map = ctx.AdventureMap.fromCsvText(source);
    const stage = Number(file.match(/^stage_(\d+)/)[1]);
    assert.equal(map.summary().counts.glitch, stage <= 2 ? 1 : 2, file);
    assert.equal(map.reachableFromStart().length, map.grid.flat().filter(room => room.isEnterable()).length, file);
    assert.ok(map.start && map.exit, file);
  }
});

test('glitch hand events can recycle an exhausted deck without duplicating the table top on restore', () => {
  const ctx = context();
  for (const face of [7, 9]) {
    const eng = engine(ctx), pile = eng.s.playerPile;
    pile.discard.push(...pile.deck.splice(0));
    eng.s.discardTop = new ctx.AdventureDeck.DiscardTop(pile.discard.at(-1));
    const count = total(pile);
    if (face === 9) while (pile.hand.length > 1) pile.discardFromHand(0);
    roll(ctx, eng, face); eng.resolveGlitchEvent();
    assert.equal(total(pile), count);
    assert.equal(total(restore(ctx, eng).s.playerPile), count);
  }
});

test('the real battle controller returns a glitch victory directly to the map without reward UI', async () => {
  const dom = new JSDOM('<div id="adventure-container"></div><div id="game-container"><div id="game-screen"></div></div>');
  const ctx = context(dom), eng = engine(ctx);
  roll(ctx, eng, 1); eng.resolveGlitchEvent();
  const callbacks = []; ctx.setTimeout = fn => { callbacks.push(fn); return callbacks.length; };
  ctx.AnimLayer = class {};
  ctx.GameUI = class {
    _initParticles() {} _buildGameScreen() {} _startPolling() {} _hideTooltip() {}
    updateDisplay() { this._showGameOver(); }
  };
  ctx.AdventureBattleEngine = class {
    constructor() { this.s = { phase: 'GAME_OVER', player: { alive: true } }; this.events = []; this.later = () => {}; }
    state() { return { ...this.s, events: [] }; }
    restoreSession() { return this.state(); }
    finishAdventureBattle() { return {}; }
  };
  vm.runInContext(fs.readFileSync(path.join(root, 'adventure/js/battle/adventure_battle_controller.js'), 'utf8'), ctx);
  let finished = null;
  await ctx.AdventureBattleController.startCombat('Ryan', eng.s.combat.enemy.name, result => { finished = result; }, {
    adventureEngine: eng, resumeBattle: { s: {} }
  });
  assert.equal(eng.s.phase, ctx.AdventurePhase.MAP);
  assert.equal(dom.window.document.querySelector('#adv-settle-overlay'), null);
  callbacks.forEach(fn => fn());
  assert.equal(finished, 'win');
  assert.equal(ctx.AdventureBattleController.activeEngine(), null);
  dom.window.close();
});

test('real glitch page buttons honor dice control, mandatory discard and combat launch', async () => {
  const dom = new JSDOM('<div id="app"></div>'), ctx = context(dom);
  for (const file of ['adventure/js/ui/adventure_ui.js', 'adventure/js/ui/adventure_ui_glitch.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
  }
  const ui = new ctx.AdventureUI(dom.window.document.getElementById('app'));
  ui.eng = engine(ctx, { accessories: ['Magician'], consumables: ['FirstAidKit'] });
  ui.render = () => ui.container.replaceChildren(ui._buildGlitchPage(ui.eng.snapshot()));
  let launches = 0; ui._startBridgeCombat = async () => { launches++; };
  ui.bindActions(); ui.render();
  ctx.FurryGame.CombatRuntime.setRandomSource(() => 2.5 / 12);
  ui.container.querySelector('#adv-glitch-roll').click();
  ctx.FurryGame.CombatRuntime.resetRandomSource();
  await new Promise(resolve => globalThis.setTimeout(resolve, 0));
  assert.equal(ui.container.querySelector('#adv-glitch-leave'), null);
  ui.container.querySelector('[data-glitch-discard] img').click();
  assert.ok(ui.container.querySelector('#adv-glitch-leave'));
  ui.eng = engine(ctx); roll(ctx, ui.eng, 1); ui.render();
  await ui._finishGlitchRoll();
  assert.equal(launches, 1);
  dom.window.close();
});
