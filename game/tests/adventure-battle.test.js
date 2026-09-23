const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const gameRoot = path.resolve(__dirname, '..');
const { expand } = require('./_load');
const context = vm.createContext({
  console,
  Math,
  JSON,
  Date,
  Image: class Image {
    constructor() {
      this.complete = true;
      this.naturalWidth = 1;
    }
  },
  setTimeout: () => 1,
  clearTimeout: () => {},
  performance: { now: () => 0 }
});
context.window = context;

const sources = expand(['characters', 'ai', 'combat', 'adventure_content']).concat([
  'adventure/js/map/map.js',
  'adventure/js/deck/adventure_deck.js',
  'adventure/js/engine/adventure_engine.js',
  'adventure/js/engine/loot.js',
  'adventure/js/engine/shop.js',
  'adventure/js/engine/rewards.js',
  'adventure/js/engine/inventory.js',
  'adventure/js/engine/combat_result.js',
  'adventure/js/battle/battle_engine.js',
  'adventure/js/battle/adventure_battle_items.js',
  'js/ui/ui_core.js',
  'adventure/js/battle/adventure_battle_controller.js'
]);

for (const relative of sources) {
  const file = path.join(gameRoot, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { AdventureBattleEngine, CharacterRegistry, AdventureEngine } = context;

function number(value, color = 'RED', white = false) {
  return {
    value,
    color: white ? 'WHITE' : color,
    drawTwo: false,
    drawThree: false,
    potion: false,
    purify: false,
    superPurify: false,
    swapHand: false,
    shuffleToDeck: false,
    isBlack: false,
    isWhite: white,
    isNumberCard: true,
    isItemCard: false
  };
}

function black() {
  return {
    value: -1,
    color: 'BLACK',
    drawTwo: false,
    drawThree: false,
    potion: false,
    purify: false,
    superPurify: false,
    swapHand: false,
    shuffleToDeck: false,
    isBlack: true,
    isWhite: false,
    isNumberCard: false,
    isItemCard: true
  };
}

function start(pileOverrides = {}, top = number(2), topOwner = 'player') {
  const engine = new AdventureBattleEngine();
  const playerPile = Object.assign({
    deck: [number(4, 'BLUE'), number(5, 'GREEN')],
    hand: [number(1, 'YELLOW'), number(3, 'RED')],
    discard: [number(6, 'BLUE')],
    handLimit: 5
  }, pileOverrides);
  engine.startAdventure({
    player: 'Ryan',
    opponent: 'CastleWolf',
    playerState: { hp: 73, maxHp: 80, burn: 1, guard: 2 },
    playerPile,
    discardTop: top,
    discardTopOwner: topOwner
  });
  return engine;
}

function startLeon(pileOverrides = {}, top = number(1, 'RED'), topOwner = 'player') {
  const engine = new AdventureBattleEngine();
  const playerPile = Object.assign({
    deck: [number(4, 'BLUE'), number(5, 'GREEN')],
    hand: [number(1, 'YELLOW')],
    discard: [],
    handLimit: 5
  }, pileOverrides);
  engine.startAdventure({
    player: 'Leon',
    opponent: 'CastleWolf',
    playerState: { hp: 80, maxHp: 90 },
    playerPile,
    discardTop: top,
    discardTopOwner: topOwner
  });
  return engine;
}

test('Leon attack 1 applies burn after skip-defense attack resolves', () => {
  const engine = startLeon();
  let deferred = null;
  engine.later = (fn) => { deferred = fn; };

  engine.dispatch('selectCard', { index: 0 });
  engine.dispatch('doPlay');

  assert.equal(engine.s.ai.burn, 0);
  assert.ok(deferred, 'skip-defense attack should schedule settlement');
  deferred();
  assert.equal(engine.s.ai.burn, 3);
});

test('GhostFire applies three burn stacks in adventure combat', () => {
  const engine = start({ hand: [number(2, 'YELLOW')] }, number(2, 'RED'));
  engine._adventureEngine = {
    snapshot: () => ({ consumables: [{ name: 'GhostFire', displayName: '鬼火', combatUse: 'burn', burnAmount: 3 }] }),
    s: { consumables: ['GhostFire'] }
  };
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.busy = false;

  engine.useAdventureCombatItem(0);
  assert.equal(engine.s.ai.burn, 3);
});

test('CardTalisman discards one chosen hand card then draws two', () => {
  const engine = start({
    hand: [number(5, 'RED'), number(1, 'BLUE')],
    deck: [number(3, 'GREEN'), number(4, 'YELLOW'), number(2, 'RED')]
  });
  engine._adventureEngine = {
    snapshot: () => ({ consumables: [{ name: 'CardTalisman', displayName: '弃牌符', combatUse: 'discardTalisman', discardThenDraw: 2 }] }),
    s: { consumables: ['CardTalisman'] }
  };
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.busy = false;

  const beforeHand = engine.h.player.length;
  const beforeDeck = engine.deck.length;
  const beforeDiscard = engine.piles.player.discard.length;
  engine.useAdventureCombatItem(0, { index: 1 });
  assert.equal(engine.h.player.length, beforeHand - 1 + 2);
  assert.equal(engine.h.player.filter(c => c.value === 1 && c.color === 'BLUE').length, 0);
  assert.equal(engine.h.player[0].value, 5);
  assert.equal(engine.h.player[0].color, 'RED');
  assert.equal(engine.deck.length, beforeDeck - 2);
  assert.equal(engine.piles.player.discard.length, beforeDiscard + 1);
  assert.equal(engine.piles.player.discard[engine.piles.player.discard.length - 1].value, 1);
  assert.equal(engine._adventureEngine.s.consumables.length, 0);
  const def = context.AdventureRegistry.getItem('CardTalisman');
  assert.equal(def.displayName, '弃牌符');
  assert.ok(def.icon.endsWith('card_talisman.webp'));
});

test('ChaosOrb peeks NPC deck top and discards chosen cards without reordering', () => {
  const engine = start({ hand: [number(2, 'RED')] });
  engine._adventureEngine = {
    snapshot: () => ({ consumables: [{ name: 'ChaosOrb', displayName: '混沌球', combatUse: 'chaosOrb' }] }),
    s: { consumables: ['ChaosOrb'] }
  };
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.busy = false;
  // Deck end is the top: values 9 (top), 8, 7.
  engine.piles.ai.deck.splice(0, engine.piles.ai.deck.length,
    number(5, 'RED'), number(7, 'BLUE'), number(8, 'GREEN'), number(9, 'YELLOW'));
  engine.piles.ai.discard.splice(0, engine.piles.ai.discard.length);

  const preview = engine.useAdventureCombatItem(0);
  assert.equal(preview.pendingDialog, 'chaosOrb');
  assert.equal(preview.chaosOrbCards.length, 3);
  assert.equal(preview.chaosOrbCards[0].value, 9);
  assert.equal(preview.chaosOrbCards[1].value, 8);
  assert.equal(preview.chaosOrbCards[2].value, 7);
  assert.equal(engine._adventureEngine.s.consumables.length, 1, 'preview must not consume the item');

  // Discard middle card (8), keep 9 then 7 in original relative order.
  engine.useAdventureCombatItem(0, { discard: [false, true, false] });
  assert.equal(engine._adventureEngine.s.consumables.length, 0);
  assert.equal(engine.piles.ai.discard.length, 1);
  assert.equal(engine.piles.ai.discard[0].value, 8);
  assert.deepEqual(Array.from(engine.piles.ai.deck, c => c.value), [5, 7, 9]);
  assert.equal(engine.piles.ai.deck[engine.piles.ai.deck.length - 1].value, 9, 'top stays the kept original top');
  const def = context.AdventureRegistry.getItem('ChaosOrb');
  assert.equal(def.displayName, '混沌球');
  assert.equal(def.price, 6);
  assert.ok(def.icon.endsWith('chaos_orb.webp'));
});

test('adventure opponent is registered for the ordinary 1v1 character and AI interfaces', () => {
  const wolf = CharacterRegistry.get('CastleWolf');
  assert.ok(wolf);
  assert.equal(wolf.adventureNpc, true);
  assert.ok(context.AIRegistry.get('CastleWolf'));
});

test('adventure battle controller detects the exported shared 1v1 UI', () => {
  assert.equal(typeof context.GameUI, 'function');
  assert.equal(typeof context.AnimLayer, 'function');
  assert.equal(context.AdventureBattleController.isAvailable(), true);
});

test('black cards pause for a color choice before resolving in adventure combat', () => {
  const engine = start({ hand: [black()] });
  engine.dispatch('selectCard', { index: 0 });

  const pending = engine.dispatch('doPlay');
  assert.equal(pending.needColorChoice, true);
  assert.equal(pending.pendingDialog, 'color');
  assert.equal(pending.playerHand.length, 1);
  assert.equal(pending.atkCard, null, 'black card must not be painted into attack zone before color selection');
  assert.equal(pending.events.filter(event => event.type === 'playerPlay').length, 0, 'color staging must not emit a play animation');

  const resolved = engine.dispatch('chooseColor', { color: 'GREEN' });
  assert.equal(resolved.needColorChoice, false);
  assert.equal(resolved.pendingDialog, null);
  assert.equal(resolved.discardTop.chosenColor, 'GREEN');
  assert.equal(resolved.playerHand.length, 0);
  assert.equal(resolved.events.filter(event => event.type === 'playerPlay').length, 1, 'confirmed black card emits one play animation');
});

test('Chan 4 in adventure discards the selected NPC card without swapping piles', () => {
  const engine = new AdventureBattleEngine();
  const playerAttack = number(4, 'RED');
  const npcCard = number(6, 'BLUE');
  engine.startAdventure({
    player: 'Chan',
    opponent: 'CastleWolf',
    playerPile: {
      deck: [number(2, 'GREEN')],
      hand: [playerAttack],
      discard: [],
      handLimit: 5
    },
    discardTop: number(3, 'RED'),
    discardTopOwner: 'player'
  });

  // Isolate the skill transition from the startup refill/passive draw.
  engine.h.player.splice(0, engine.h.player.length, playerAttack);
  engine.h.ai.splice(0, engine.h.ai.length, npcCard);
  engine.piles.ai.discard.splice(0, engine.piles.ai.discard.length);
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.busy = false;
  engine.s.selectedCard = 0;

  const pending = engine.dispatch('doPlay');
  assert.equal(pending.phase, 'OPPONENT_CARD_CHOICE');
  engine.dispatch('chooseAICard', { index: 0 });
  engine.dispatch('doOpponentCardConfirm');

  assert.equal(engine.h.ai.length, 0);
  assert.equal(engine.h.player.some(card => card.value === npcCard.value), false);
  assert.equal(engine.piles.ai.discard.some(card => card.value === npcCard.value), true);
  assert.equal(engine.piles.player.discard.some(card => card.value === npcCard.value), false);
});

test('battle startup preserves the player pile and gives the NPC its own two-card hand', () => {
  const engine = start();
  assert.deepEqual(Array.from(engine.h.player, card => card.value), [1, 3]);
  assert.deepEqual(Array.from(engine.piles.player.deck, card => card.value), [4, 5]);
  assert.deepEqual(Array.from(engine.piles.player.discard, card => card.value), [6]);
  assert.equal(engine.h.ai.length, 2);
  assert.equal(engine.piles.ai.deck.length, 26);
  assert.equal(engine.s.player.hp, 74);
  assert.equal(engine.s.player.burn, 1);
  assert.equal(engine.s.player.guard, 2);
});

test('player and NPC refill only from their own discard piles', () => {
  const engine = start({ deck: [], hand: [], discard: [number(7, 'GREEN')] });
  engine.piles.ai.deck.splice(0, engine.piles.ai.deck.length);
  engine.piles.ai.hand.splice(0, engine.piles.ai.hand.length);
  engine.piles.ai.discard.splice(0, engine.piles.ai.discard.length, number(2, 'WHITE', true));

  engine.draw('player', 1);
  assert.equal(engine.h.player[0].value, 7);
  assert.equal(engine.piles.ai.discard.length, 1);

  engine.draw('ai', 1);
  assert.equal(engine.h.ai[0].value, 2);
  assert.equal(engine.piles.player.discard.length, 0);
});

test('shared table top returns to the previous card owner discard pile', () => {
  const engine = start();
  const playerDiscardBefore = engine.piles.player.discard.length;

  engine.s.atkOwner = 'ai';
  engine.setDiscardTop(number(3, 'WHITE', true));
  assert.equal(engine.piles.player.discard.length, playerDiscardBefore + 1);
  assert.equal(engine.piles.ai.discard.length, 0);
  assert.equal(engine.tableTopOwner, 'ai');

  engine.s.atkOwner = 'player';
  engine.setDiscardTop(number(4, 'GREEN'));
  assert.equal(engine.piles.ai.discard.length, 1);
  assert.equal(engine.piles.ai.discard[0].value, 3);
  assert.equal(engine.tableTopOwner, 'player');
});

test('room completion persists player resources and fully resets NPC cards', () => {
  const engine = start();
  const playerHand = Array.from(engine.h.player, card => card.value);
  const totalNpcCards = engine.piles.ai.deck.length + engine.piles.ai.hand.length + engine.piles.ai.discard.length;

  engine.s.atkOwner = 'ai';
  engine.setDiscardTop(engine.h.ai.splice(0, 1)[0]);
  const result = engine.finishAdventureBattle();

  assert.deepEqual(Array.from(result.playerPile.hand, card => card.value), playerHand);
  assert.equal(result.playerState.hp, 74);
  assert.equal(result.playerState.burn, 1);
  assert.equal(result.discardTop, null);
  assert.equal(result.npcResetCount, totalNpcCards);
  assert.equal(engine.piles.ai.hand.length, 0);
  assert.equal(engine.piles.ai.discard.length, 0);
  assert.equal(engine.piles.ai.deck.length, totalNpcCards);
});

test('the next room keeps the exact player hand, deck and discard snapshot', () => {
  const first = start();
  first.s.atkOwner = 'player';
  first.setDiscardTop(number(7, 'BLUE'));
  const saved = first.finishAdventureBattle();

  const second = new AdventureBattleEngine();
  second.startAdventure({
    player: 'Ryan',
    opponent: 'CastleFox',
    playerState: saved.playerState,
    playerPile: saved.playerPile,
    discardTop: saved.discardTop,
    discardTopOwner: saved.discardTopOwner
  });

  assert.deepEqual(
    Array.from(second.h.player, card => card.value),
    Array.from(saved.playerPile.hand, card => card.value)
  );
  // A new shared top is drawn from the persistent player deck at room start.
  assert.equal(second.piles.player.deck.length, saved.playerPile.deck.length - 1);
  assert.deepEqual(
    Array.from(second.piles.player.discard, card => card.value),
    Array.from(saved.playerPile.discard, card => card.value)
  );
  assert.equal(second.tableTopOwner, 'player');
});

test('adventure attack mod waits until damage is confirmed after Saiki 6 judge', () => {
  const engine = new AdventureBattleEngine();
  engine.startAdventure({
    player: 'Saiki',
    opponent: 'CastleWolf',
    playerState: { hp: 70, maxHp: 80 },
    playerPile: {
      deck: [number(4, 'BLUE')],
      hand: [number(6, 'RED'), number(4, 'YELLOW')],
      discard: [],
      handLimit: 5
    },
    discardTop: number(2),
    discardTopOwner: 'player'
  });

  engine.dispatch('selectCard', { index: 0 });
  const afterPlay = engine.dispatch('doPlay');
  assert.equal(afterPlay.phase, 'SAIKI_SIX_JUDGE');
  assert.notEqual(afterPlay.phase, 'ATTACK_MOD_CHOICE');

  engine.dispatch('selectCard', { index: 0 });
  const afterJudge = engine.dispatch('doSaikiSixConfirm');
  assert.equal(afterJudge.phase, 'ATTACK_MOD_CHOICE');
  assert.equal(afterJudge.pendingAttack.damage, 6); // ceil(4*1.5)

  const resolved = engine.dispatch('resolveAttackModChoice', { bonus: 2 });
  assert.equal(resolved.pendingAttack.damage, 8);
  assert.equal(resolved.phase, 'AI_DEFEND');
});

test('adventure attack mod appears after immediate damage skills without pre-play prompt', () => {
  const engine = start({ hand: [number(2, 'YELLOW')] }, number(2, 'RED'));
  engine.dispatch('selectCard', { index: 0 });
  const afterPlay = engine.dispatch('doPlay');
  assert.equal(afterPlay.phase, 'ATTACK_MOD_CHOICE');
  assert.ok(afterPlay.pendingAttack.damage > 0);
  const resolved = engine.dispatch('resolveAttackModChoice', { bonus: 0 });
  assert.equal(resolved.phase, 'AI_DEFEND');
});

test('dodge consumable voids npc attack only in defend phase', () => {
  const engine = start({ hand: [number(2, 'YELLOW')] }, number(2, 'RED'));
  engine._adventureEngine = {
    snapshot: () => ({ consumables: [{ name: 'Dodge', displayName: '闪避' }] }),
    s: { consumables: [{ name: 'Dodge', displayName: '闪避' }] }
  };

  // Offence phase: dodge cannot be used
  const blocked = engine.useAdventureCombatItem(0);
  assert.equal(blocked.phase, 'PLAYER_PLAY');
  assert.equal(engine._adventureEngine.s.consumables.length, 1);

  engine.s.phase = 'PLAYER_DEFEND';
  engine.s.busy = false;
  engine.s.pendingAttack = { damage: 5, unblock: false };
  engine.s.attackDebuffSnapshot = { owner: 'player', burn: 0, bleed: 0, frozen: false };
  engine.s.player.burn = 2;
  engine.s.player.hp = 70;

  const dodged = engine.useAdventureCombatItem(0);
  assert.equal(engine._adventureEngine.s.consumables.length, 0);
  assert.equal(engine.s.player.burn, 0);
  assert.equal(engine.s.player.hp, 70);
  assert.equal(dodged.phase, 'AI_TURN');
  assert.equal(engine.pendingSettlement && engine.pendingSettlement.kind, 'AI_ATTACK');
  assert.equal(engine.pendingSettlement.damage, 0);
});

test('1v2 skip-defense kill with empty event queue settles without freezing', () => {
  const engine = new AdventureBattleEngine();
  engine.later = () => {};
  engine.startAdventure1v2({
    player: 'Leon',
    opponent1: 'CastleWolf',
    opponent2: 'CastleWolf',
    stage: 2,
    playerState: { hp: 50, maxHp: 80 },
    playerPile: {
      deck: [],
      hand: [number(4, 'RED')],
      discard: [],
      handLimit: 5
    }
  });

  const hpBefore = engine.s.player.hp;
  engine.s.attackTarget = 'ai';
  engine.s.ai.hp = 4;
  engine.events = [];
  engine.s.pendingAttackMod = { card: number(4, 'RED'), skip: true, unblock: false, delay: 0 };
  engine.s.pendingAttack = { damage: 5, unblock: false };
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.busy = false;

  engine.continueAfterAttackMod();

  assert.equal(engine.s.ai.alive, false);
  assert.equal(engine.pendingSettlement, null);
  assert.equal(engine.s.player.hp, hpBefore + 3);
  assert.ok(engine.s.ai2.alive);
  assert.ok(engine.s.phase === 'AI2_TURN' || engine.s.phase === 'AI_TURN');
  assert.ok(engine.s.busy);
});

test('Otto 4 two-number branch enters NPC defense in challenge room', () => {
  const engine = new AdventureBattleEngine();
  engine.startAdventure1v2({
    player: 'Otto',
    opponent1: 'CastleWolf',
    opponent2: 'CastleBear',
    stage: 1,
    discardTop: number(1, 'RED'),
    playerPile: {
      // Otto 4 reveals the two cards at the end of the player deck.
      deck: [number(2, 'BLUE'), number(3, 'GREEN')],
      hand: [number(4, 'RED')],
      discard: [],
      handLimit: 5
    }
  });
  engine.later = () => assert.fail('zero-delay NPC defense must not use the shared combat timer');
  engine.h.ai.splice(0, engine.h.ai.length, number(2), number(6));
  engine.h.ai2.splice(0, engine.h.ai2.length);
  engine.s.attackTarget = 'ai';

  engine.dispatch('selectCard', { index: 0 });
  const pending = engine.dispatch('doPlay');
  assert.equal(pending.phase, 'ATTACK_MOD_CHOICE');
  assert.equal(pending.pendingAttack.damage, 5);

  const after = engine.dispatch('resolveAttackModChoice', { bonus: 0 });
  assert.equal(after.phase, 'AI_DEFEND');
  assert.equal(engine.h.ai.length, 1, 'NPC should spend its legal defense card');
  assert.equal(engine.pendingSettlement && engine.pendingSettlement.kind, 'PLAYER_ATTACK');
  assert.ok(engine.events.some(event => event.type === 'aiDefend'));
});

test('Otto 4 challenge defense continues after an NPC magic bridge without replacing the defense timer', () => {
  const engine = new AdventureBattleEngine();
  engine.startAdventure1v2({
    player: 'Otto',
    opponent1: 'CastleWolf',
    opponent2: 'CastleBear',
    stage: 1,
    discardTop: number(1, 'RED'),
    playerPile: {
      deck: [number(2, 'BLUE'), number(3, 'GREEN')],
      hand: [number(4, 'RED')],
      discard: [],
      handLimit: 5
    }
  });
  engine.later = () => assert.fail('NPC defense continuation must not use the shared combat timer');
  const magic = context.AdventureDeck.item('WHITE', 'greenMagic', { npcCard: true });
  engine.h.ai.splice(0, engine.h.ai.length, magic, number(2));
  engine.h.ai2.splice(0, engine.h.ai2.length);
  engine.s.attackTarget = 'ai';

  engine.dispatch('selectCard', { index: 0 });
  engine.dispatch('doPlay');
  engine.dispatch('resolveAttackModChoice', { bonus: 0 });

  assert.ok(engine.s.pendingAIBridge, 'magic defense should request another defense card');
  const bridgeEventId = engine.s.pendingAIBridge.afterEventId;
  engine.acknowledgeEvents(bridgeEventId);

  assert.equal(engine.s.defCard.value, 2);
  assert.equal(engine.h.ai.length, 0);
  assert.equal(engine.pendingSettlement && engine.pendingSettlement.kind, 'PLAYER_ATTACK');
  assert.ok(engine.events.some(event => event.type === 'aiDefend' && event.card && event.card.value === 2));
});

test('Otto 7 keeps HP/10 in challenge rooms and makes small hits unblockable', () => {
  const otto = CharacterRegistry.get('Otto');
  const emitted = [];
  const hurtCalls = [];
  const eng = { s: { is1v2: true, isAdventure: true }, emit: (...args) => emitted.push(args) };
  const helpers = {
    burn() {}, bleed() {}, guard() {}, heal() {}, draw() {}, clearDebuffs() {},
    hurt(...args) { hurtCalls.push(args); }
  };

  const fullHealth = { hp: 100, crit: 0 };
  const normal = otto.effect(eng, 7, number(7), fullHealth, {}, 'player', helpers);
  assert.equal(normal.d, 10);
  assert.equal(normal.unblock, false);

  const lowHealth = { hp: 30, crit: 0 };
  const small = otto.effect(eng, 7, number(7), lowHealth, {}, 'player', helpers);
  assert.equal(small.d, 3);
  assert.equal(small.unblock, true);
  assert.equal(hurtCalls.length, 0);
  assert.equal(emitted.length, 0);

  const classicDuo = otto.effect(
    { s: { is1v2: true, isAdventure: false }, emit() {} },
    7,
    number(7),
    { hp: 200, crit: 0 },
    {},
    'player',
    helpers
  );
  assert.equal(classicDuo.d, 10, 'classic 1v2 doubles HP and scales Otto 7 by /20');
});

test('Otto attack 0 no longer causes self damage', () => {
  const otto = CharacterRegistry.get('Otto');
  const hurtCalls = [];
  const eng = { s: { is1v2: true }, emit() {} };
  const actor = { hp: 100, crit: 2 };
  const result = otto.effect(eng, 0, number(0), actor, {}, 'player', {
    burn() {}, bleed() {}, guard() {}, heal() {}, draw() {}, clearDebuffs() {},
    hurt(...args) { hurtCalls.push(args); }
  });

  assert.equal(result.d, 10);
  assert.equal(hurtCalls.length, 0);
  assert.equal(actor.hp, 100);
});

test('adventure 1v2 keeps one shared NPC pile isolated from the player pile', () => {
  const engine = new AdventureBattleEngine();
  engine.later = () => {};
  engine.startAdventure1v2({
    player: 'Leon',
    opponent1: 'CastleWolf',
    opponent2: 'CastleBear',
    stage: 1,
    playerPile: { deck: [], hand: [], discard: [], handLimit: 5 }
  });

  assert.equal(engine.piles.ai.deck, engine.piles.ai2.deck);
  assert.equal(engine.piles.ai.discard, engine.piles.ai2.discard);
  assert.notEqual(engine.piles.player.deck, engine.piles.ai.deck);
  assert.notEqual(engine.piles.player.discard, engine.piles.ai.discard);

  const npcCards = [
    ...engine.piles.ai.deck,
    ...engine.piles.ai.discard,
    ...engine.h.ai,
    ...engine.h.ai2
  ];
  assert.equal(npcCards.filter(card => card.greenMagic).length, 2);

  // Even if the phase fields still point at an NPC, an explicit player
  // shuffle must only consume the player's discard pile.
  engine.s.defOwner = 'ai';
  engine.s.atkOwner = 'ai2';
  const playerCard = number(9, 'RED');
  const npcCard = context.AdventureDeck.item('WHITE', 'greenMagic');
  engine.piles.player.deck = [];
  engine.deck = engine.piles.player.deck;
  engine.piles.player.discard = [playerCard];
  engine.discardBottom = engine.piles.player.discard;
  engine.piles.ai.discard.push(npcCard);
  engine.useItem1v2(
    context.AdventureDeck.item('BLACK', 'shuffle'),
    engine.s.player,
    engine.s.ai,
    'player'
  );
  assert.equal(engine.piles.player.discard.length, 0);
  assert.equal(engine.piles.ai.discard.includes(npcCard), true);
  assert.equal(engine.piles.player.deck.includes(playerCard), true);

  engine.draw('player', 1);
  assert.equal(engine.h.player.some(card => card.greenMagic), false);

  // The shared NPC discard can be refilled through either NPC owner, but it
  // must remain the same pile and never become a player draw source.
  engine._shuffleDiscardIntoDeck('ai2');
  assert.equal(engine.piles.ai.discard.length, 0);
  assert.equal(engine.piles.ai.deck.includes(npcCard), true);
  assert.equal(engine.piles.ai.deck, engine.piles.ai2.deck);

  // A batch draw also observes the <3-card threshold between cards.
  engine.h.ai.length = 0;
  engine.h.ai2.length = 0;
  engine.piles.ai.deck.splice(0, engine.piles.ai.deck.length,
    number(1, 'RED'), number(2, 'RED'), number(3, 'RED'));
  engine.piles.ai.discard.splice(0, engine.piles.ai.discard.length, npcCard);
  engine.draw('ai2', 2);
  assert.equal(engine.piles.ai.discard.length, 0);
  assert.equal(engine.h.ai2.length, 2);
});

test('MagicTransfer moves one buff layer from player to opponent', () => {
  const engine = startLeon();
  engine._adventureEngine = {
    snapshot: () => ({ consumables: [{ name: 'MagicTransfer', displayName: '魔法转移' }] }),
    s: { consumables: ['MagicTransfer'] }
  };
  engine.s.player.burn = 2;
  engine.s.ai.burn = 0;
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.busy = false;

  engine.useAdventureCombatItem(0, 'burn');
  assert.equal(engine.s.player.burn, 1);
  assert.equal(engine.s.ai.burn, 1);
  assert.equal(engine._adventureEngine.s.consumables.length, 0);
});

test('PurifyWater uses player-chosen debuff kinds in combat', () => {
  const advEngine = new context.AdventureEngine();
  advEngine.s = { consumables: ['PurifyWater2'] };
  advEngine.snapshot = () => ({
    consumables: [{ name: 'PurifyWater2', displayName: '净化之水Ⅱ' }]
  });
  const engine = start({ hand: [number(2, 'YELLOW')] }, number(2, 'RED'));
  engine._adventureEngine = advEngine;
  engine.s.player.burn = 2;
  engine.s.player.bleed = 1;
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.busy = false;

  engine.useAdventureCombatItem(0, ['bleed', 'burn', 'burn']);
  assert.equal(engine.s.player.burn, 0);
  assert.equal(engine.s.player.bleed, 0);
  assert.equal(advEngine.s.consumables.length, 0);
});

test('adventure NPC uses guard after defending against player attack', () => {
  const engine = start({ hand: [number(4, 'RED')] }, number(2, 'RED'));
  engine.s.ai.guard = 2;
  engine.s.ai.hp = 20;
  engine.s.attackTarget = 'ai';
  engine.pendingSettlement = { kind: 'PLAYER_ATTACK', damage: 3, bleed: 0, afterEventId: 0 };
  engine.events = [];

  engine.acknowledgeEvents(0);

  assert.equal(engine.s.ai.guard, 0);
  assert.equal(engine.s.ai.hp, 19);
  assert.ok(engine.events.some(e => (e.desc || '').includes('守护')));
});

test('lord mode NPC uses guard after defending in 1v2', () => {
  const engine = new AdventureBattleEngine();
  engine.later = () => {};
  engine.startAdventure1v2({
    player: 'Leon',
    opponent1: 'CastleBear',
    opponent2: 'CastleWolf',
    stage: 1,
    playerPile: { deck: [], hand: [number(4, 'RED')], discard: [], handLimit: 5 }
  });
  engine.s.ai.guard = 2;
  engine.s.ai.hp = 25;
  engine.s.attackTarget = 'ai';
  engine.pendingSettlement = { kind: 'PLAYER_ATTACK', damage: 3, bleed: 0, afterEventId: 0 };
  engine.events = [];

  engine.acknowledgeEvents(0);

  assert.equal(engine.s.ai.guard, 0);
  assert.equal(engine.s.ai.hp, 24);
});

test('FlameFist triggers for Moze 2 defense in adventure 1v2', () => {
  const engine = new AdventureBattleEngine();
  engine.later = () => {};
  engine.startAdventure1v2({
    player: 'Moze',
    opponent1: 'CastleWolf',
    opponent2: 'CastleWolf',
    stage: 1,
    playerPile: { deck: [], hand: [number(2, 'RED')], discard: [], handLimit: 5 },
    discardTop: number(2, 'RED'),
    discardTopOwner: 'player'
  });
  engine._adventureEngine = {
    s: { accessories: ['FlameFist'] },
    hasAccessory(name) { return name === 'FlameFist'; },
    accessoryCount(name) { return name === 'FlameFist' ? 1 : 0; }
  };
  engine.s.phase = 'PLAYER_DEFEND';
  engine.s.pendingAttack = { damage: 4, unblock: false };
  engine.s.atkOwner = 'ai';
  engine.s.currentAITarget = 0;
  engine.s.selectedCard = 0;

  engine.defend1v2();

  assert.equal(engine.s.ai.burn, 1);
});

test('lord mode player discard ends turn with correct alternating AI attacker', () => {
  const engine = new AdventureBattleEngine();
  engine.later = () => {};
  engine.startAdventure1v2({
    player: 'Leon',
    opponent1: 'CastleWolf',
    opponent2: 'CastleWolf',
    stage: 1,
    playerPile: {
      deck: [],
      hand: [number(2, 'RED'), number(3, 'BLUE')],
      discard: [],
      handLimit: 5
    }
  });

  engine.s.lordPlayerTargetIdx = 1;
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.hasPlayedThisTurn = false;
  engine.s.busy = false;

  engine.dispatch('doEnterDiscard');
  engine.dispatch('selectCard', { index: 0 });
  engine.dispatch('doConfirmDiscard');

  assert.equal(engine.s.activeAttacker, 'ai2');
  assert.equal(engine.s.phase, 'AI2_TURN');
  assert.equal(engine.s.currentAITarget, 1);
});

test('challenge targeted trophy cards apply to the selected NPC2 target', () => {
  const runtime = context.FurryGame && context.FurryGame.CombatRuntime;
  const targeted = [
    ['BurnTrophy', 'burn', 1],
    ['PiercingTrophy', 'bleed', 1],
    ['FreezeTrophy', 'frozen', true],
    ['PoisonTrophy', 'poison', 1],
    ['ThornsTrophy', 'thorns', 1],
    ['TimeBombTrophy', 'bomb', 5],
    ['IceSealTrophy', 'iceSeal', true],
    ['HypothermiaTrophy', 'hypothermia', 1]
  ];

  try {
    // Challenge rooms use the lord adapter's alternating target selector.
    // Start this turn on NPC2 so a stale/default NPC1 target cannot pass.
    for (const [name, field, expected] of targeted) {
      const engine = new AdventureBattleEngine();
      engine.later = () => {};
      engine.startAdventure1v2({
        player: 'Ryan',
        opponent1: 'CastleWolf',
        opponent2: 'CastleBear',
        stage: 1,
        discardTop: number(2, 'RED'),
        playerPile: {
          deck: [number(3, 'BLUE')],
          hand: [context.AdventureDeck.trophyWhite(name)],
          discard: [],
          handLimit: 5
        }
      });
      engine.h.ai = [number(2, 'RED')];
      engine.h.ai2 = [number(2, 'RED')];
      engine.s.lordPlayerTargetIdx = 1;
      engine.s.phase = 'PLAYER_PLAY';
      engine.s.busy = false;
      engine.select(0);
      engine.dispatch('doPlay');

      assert.equal(engine.s.ai[field] || false, false, `${name} must not affect NPC1`);
      assert.equal(engine.s.ai2[field], expected, `${name} should affect NPC2`);
    }

    const disarm = new AdventureBattleEngine();
    disarm.later = () => {};
    disarm.startAdventure1v2({
      player: 'Ryan', opponent1: 'CastleWolf', opponent2: 'CastleBear', stage: 1,
      discardTop: number(2, 'RED'),
      playerPile: {
        deck: [number(3, 'BLUE')],
        hand: [context.AdventureDeck.trophyWhite('DisarmTrophy')],
        discard: [], handLimit: 5
      }
    });
    disarm.h.ai = [number(2, 'RED')];
    disarm.h.ai2 = [number(2, 'RED')];
    disarm.s.lordPlayerTargetIdx = 1;
    disarm.s.phase = 'PLAYER_PLAY';
    disarm.s.busy = false;
    disarm.select(0);
    disarm.dispatch('doPlay');
    assert.equal(disarm.s.pendingTrophyDisarm.targetKey, 'ai2', 'Disarm should open the NPC2 hand picker');

    runtime.setRandomSource(() => 0.99);
    const roulette = new AdventureBattleEngine();
    roulette.later = () => {};
    roulette.startAdventure1v2({
      player: 'Ryan', opponent1: 'CastleWolf', opponent2: 'CastleBear', stage: 1,
      discardTop: number(2, 'RED'),
      playerPile: {
        deck: [number(3, 'BLUE')],
        hand: [context.AdventureDeck.trophyWhite('RussianRouletteTrophy')],
        discard: [], handLimit: 5
      }
    });
    roulette.h.ai = [number(2, 'RED')];
    roulette.h.ai2 = [number(2, 'RED')];
    roulette.s.lordPlayerTargetIdx = 1;
    roulette.s.phase = 'PLAYER_PLAY';
    roulette.s.busy = false;
    const aiHp = roulette.s.ai.hp;
    const ai2Hp = roulette.s.ai2.hp;
    roulette.select(0);
    roulette.dispatch('doPlay');
    assert.equal(roulette.s.ai.hp, aiHp, 'Russian roulette must not damage NPC1');
    assert.equal(roulette.s.ai2.hp, ai2Hp - 10, 'Russian roulette must damage the selected NPC2 on a hit roll');
  } finally {
    runtime.resetRandomSource();
  }
});

test('challenge AI2 ends its turn after its hand is exhausted', () => {
  const engine = new AdventureBattleEngine();
  const callbacks = [];
  engine.later = fn => { callbacks.push(fn); };
  engine.startAdventure1v2({
    player: 'Leon',
    opponent1: 'CastleWolf',
    opponent2: 'CastleBear',
    stage: 1,
    playerPile: { deck: [], hand: [number(2, 'RED')], discard: [], handLimit: 5 }
  });

  engine.later = fn => { callbacks.push(fn); };
  engine.s.currentAITarget = 1;
  engine.s.phase = 'AI2_TURN';
  engine.s.busy = true;
  engine.s.aiTurnStarted = true;
  engine.s.aiHasPlayed = true;
  engine.h.ai2.splice(0, engine.h.ai2.length);
  engine.aiTurn1v2();
  assert.equal(callbacks.length, 0);
  assert.equal(engine.s.phase, 'PLAYER_PLAY');
  assert.equal(engine.s.activeAttacker, 'player');
  assert.equal(engine.s.busy, false);
});

test('ArmorBreakSpear makes defensible attack unblockable via attack mod choice', () => {
  const engine = startLeon();
  engine.s.pendingAttack = { damage: 4, unblock: false };
  engine.s.pendingAttackMod = { card: number(4, 'RED'), skip: false, unblock: false, delay: 0 };
  engine.s.phase = 'ATTACK_MOD_CHOICE';
  engine.s.busy = false;

  engine.dispatch('resolveAttackModChoice', { bonus: 0, unblock: true });

  assert.equal(engine.s.pendingAttackMod, null);
  assert.equal(engine.s.phase, 'AI_DEFEND');
  assert.equal(engine.s.pendingAttack.unblock, true);
});

test('Otto crit is optional after attack mod and blocked by ArmorBreakSpear', () => {
  const engine = new AdventureBattleEngine();
  engine.later = () => {};
  engine.startAdventure({
    player: 'Otto',
    opponent: 'CastleWolf',
    playerState: { hp: 100, maxHp: 100, crit: 1 },
    playerPile: { deck: [], hand: [number(1, 'RED')], discard: [], handLimit: 5 },
    discardTop: number(1, 'RED'),
    discardTopOwner: 'player'
  });
  engine.s.player.crit = 1;
  engine.s.pendingAttack = { damage: 5, unblock: false };
  engine.s.pendingAttackMod = { card: number(1, 'RED'), skip: false, unblock: false, delay: 0 };
  engine.s.phase = 'ATTACK_MOD_CHOICE';
  engine.s.busy = false;

  engine.dispatch('resolveAttackModChoice', { bonus: 0 });
  assert.equal(engine.s.phase, 'CRIT_CHOICE');
  assert.equal(engine.s.player.crit, 1);

  engine.dispatch('resolveCritChoice', { use: false });
  assert.equal(engine.s.phase, 'AI_DEFEND');
  assert.equal(engine.s.player.crit, 1);
  assert.equal(engine.s.pendingAttack.unblock, false);

  engine.s.player.crit = 1;
  engine.s.pendingAttack = { damage: 5, unblock: false };
  engine.s.pendingAttackMod = { card: number(1, 'RED'), skip: false, unblock: false, delay: 0 };
  engine.s.phase = 'ATTACK_MOD_CHOICE';
  engine.dispatch('resolveAttackModChoice', { bonus: 0 });
  engine.dispatch('resolveCritChoice', { use: true });
  assert.equal(engine.s.player.crit, 0);
  assert.equal(engine.s.pendingAttack.unblock, true);
  assert.equal(engine.s.defenseSkipped, true);

  engine.s.player.crit = 1;
  engine.s.pendingAttack = { damage: 5, unblock: false };
  engine.s.pendingAttackMod = { card: number(1, 'RED'), skip: false, unblock: false, delay: 0 };
  engine.s.phase = 'ATTACK_MOD_CHOICE';
  engine.dispatch('resolveAttackModChoice', { bonus: 0, unblock: true });
  assert.equal(engine.s.phase, 'AI_DEFEND');
  assert.equal(engine.s.player.crit, 1);
  assert.equal(engine.s.pendingAttack.unblock, true);
});

function startVs(opponent, pileOverrides = {}, top = number(2), topOwner = 'player') {
  const engine = new AdventureBattleEngine();
  engine.later = () => {};
  const playerPile = Object.assign({
    deck: [number(4, 'BLUE'), number(5, 'GREEN')],
    hand: [number(1, 'YELLOW'), number(3, 'RED')],
    discard: [number(6, 'BLUE')],
    handLimit: 5
  }, pileOverrides);
  engine.startAdventure({
    player: 'Ryan',
    opponent,
    playerState: { hp: 73, maxHp: 80 },
    playerPile,
    discardTop: top,
    discardTopOwner: topOwner
  });
  return engine;
}

function incomingPoisonRestore() {
  return {
    target: 'player',
    after: { bleed: 0, burn: 0, poison: 1, frozen: false },
    before: { bleed: 0, burn: 0, poison: 0, frozen: false }
  };
}

test('boss room equally picks castle bosses and locks the name', () => {
  const eng = new AdventureEngine();
  eng.s = { scene: 'castle' };
  const origRandom = Math.random;
  try {
    Math.random = () => 0;
    assert.equal(eng._pickBossName({}), 'CastleChameleon');
    Math.random = () => 0.5;
    assert.equal(eng._pickBossName({}), 'CastleEagle');
    assert.equal(eng._pickBossName({ bossName: 'CastleEagle' }), 'CastleEagle');
  } finally {
    Math.random = origRandom;
  }

  const room = { type: 'boss' };
  Math.random = () => 0.5;
  try {
    const name = eng._pickBossName(room);
    room.bossName = name;
    Math.random = () => 0;
    assert.equal(eng._pickBossName(room), name);
  } finally {
    Math.random = origRandom;
  }
});

test('CastleEagle attack and defend skills', () => {
  const engine = startVs('CastleEagle');
  assert.equal(engine.s.ai.maxHp, 35);

  engine.s.player.bleed = 0;
  engine.turnStart('ai');
  assert.equal(engine.s.player.bleed, 1);

  const atk1 = engine.effect('CastleEagle', 1, number(1, 'RED'), engine.s.ai, engine.s.player);
  assert.equal(atk1.d, 4);
  assert.equal(atk1.unblock, false);

  const atk3 = engine.effect('CastleEagle', 3, number(3, 'RED'), engine.s.ai, engine.s.player);
  assert.equal(atk3.d, 6);

  engine.s.player.guard = 2;
  engine.s.player.fly = 1;
  engine.s.player.crit = 1;
  const atk4 = engine.effect('CastleEagle', 4, number(4, 'RED'), engine.s.ai, engine.s.player);
  assert.equal(atk4.d, 3);
  assert.equal(atk4.unblock, true);
  assert.equal(engine.s.player.guard, 0);
  assert.equal(engine.s.player.fly, 0);
  assert.equal(engine.s.player.crit, 0);

  engine.s.ai.fly = 0;
  const atk0 = engine.effect('CastleEagle', 0, number(0, 'RED', true), engine.s.ai, engine.s.player);
  assert.equal(atk0.d, 4);
  assert.equal(engine.s.ai.fly, 2);

  const helpers = {
    heal: () => {},
    hurt: () => {},
    poison: () => {}
  };
  const mod = CharacterRegistry.get('CastleEagle');
  const def2 = mod.defend(engine, 'CastleEagle', 2, 5, number(2, 'RED'), engine.s.ai, engine.s.player, 'ai', 'RED', helpers);
  assert.equal(def2.remaining, 5);
  assert.ok((def2.desc || '').includes('反击'));

  const def0 = mod.defend(engine, 'CastleEagle', 0, 9, number(0, 'RED', true), engine.s.ai, engine.s.player, 'ai', 'RED', helpers);
  assert.equal(def0.remaining, 0);
});

test('NPC spends fly before guard and keeps retrying at 50%', () => {
  const engine = startVs('CastleEagle');
  engine.s.ai.fly = 2;
  engine.s.ai.guard = 3;
  engine.s.ai.hp = 20;
  engine.s.attackTarget = 'ai';
  engine.events = [];
  engine.ver = 0;
  const origRandom = Math.random;
  try {
    Math.random = () => 0.9;
    engine.pendingSettlement = { kind: 'PLAYER_ATTACK', damage: 4, bleed: 0, afterEventId: 0 };
    engine.acknowledgeEvents(0);
    assert.equal(engine.s.ai.fly, 0);
    assert.equal(engine.s.ai.guard, 0);
    assert.equal(engine.s.ai.hp, 19);
  } finally {
    Math.random = origRandom;
  }
});

test('player fly dodge succeeds at 1/2 and can retry after a miss', () => {
  const engine = startVs('CastleEagle');
  engine.later = () => {};
  const origRandom = Math.random;
  try {
    engine.s.player.fly = 2;
    engine.s.player.guard = 3;
    engine.s.pendingGuardDamage = 4;
    engine.s.pendingGuardBleed = 0;
    engine.s.defCard = null;
    engine.events = [{ id: 1 }];
    engine.ver = 1;
    Math.random = () => 0.9;
    engine.chooseFly();
    assert.equal(engine.s.player.fly, 1);
    assert.equal(engine.s.pendingDialog, 'flyRetry');
    assert.equal(engine.s.player.guard, 3);

    Math.random = () => 0.1;
    engine.chooseFlyContinue(true);
    assert.equal(engine.s.player.fly, 0);
    assert.equal(engine.pendingSettlement.damage, 0);
    assert.equal(engine.s.player.guard, 3);
  } finally {
    Math.random = origRandom;
  }
});

test('fly dodge does not cancel incoming attack buffs; dodge does', () => {
  const engine = startVs('CastleWolf');
  engine.later = () => {};
  const origRandom = Math.random;
  try {
    engine.s.player.fly = 1;
    engine.s.player.poison = 0;
    engine.s.player.hp = 70;
    engine.s.pendingGuardDamage = 4;
    engine.s.pendingGuardBleed = 0;
    engine.s.pendingBuffRestore = incomingPoisonRestore();
    engine.events = [];
    engine.ver = 0;
    Math.random = () => 0.1;
    engine.chooseFly();
    engine.acknowledgeEvents(engine.ver);
    assert.equal(engine.s.player.hp, 70);
    assert.equal(engine.s.player.poison, 1);
  } finally {
    Math.random = origRandom;
  }

  const dodgeEngine = startVs('CastleWolf');
  dodgeEngine.later = () => {};
  dodgeEngine._adventureEngine = {
    snapshot: () => ({ consumables: [{ name: 'Dodge', displayName: '闪避' }] }),
    s: { consumables: ['Dodge'] }
  };
  dodgeEngine.s.phase = 'PLAYER_DEFEND';
  dodgeEngine.s.busy = false;
  dodgeEngine.s.pendingAttack = { damage: 5, unblock: false };
  dodgeEngine.s.player.poison = 0;
  dodgeEngine.s.player.hp = 70;
  dodgeEngine.s.pendingBuffRestore = incomingPoisonRestore();
  dodgeEngine.s.attackDebuffSnapshot = { owner: 'player', burn: 0, bleed: 0, poison: 0, frozen: false };
  dodgeEngine.events = [];
  dodgeEngine.ver = 0;
  dodgeEngine.useAdventureCombatItem(0);
  assert.equal(dodgeEngine.s.player.hp, 70);
  assert.equal(dodgeEngine.s.player.poison, 0);
});

test('MagicTransfer can pull an NPC buff onto the player', () => {
  const engine = startLeon();
  engine._adventureEngine = {
    snapshot: () => ({ consumables: [{ name: 'MagicTransfer', displayName: '魔法转移' }] }),
    s: { consumables: ['MagicTransfer'] }
  };
  engine.s.player.guard = 0;
  engine.s.ai.guard = 2;
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.busy = false;

  engine.useAdventureCombatItem(0, { from: 'opp', kind: 'guard' });
  assert.equal(engine.s.ai.guard, 1);
  assert.equal(engine.s.player.guard, 1);
  assert.equal(engine._adventureEngine.s.consumables.length, 0);
});

test('MagicTransfer covers diving thorns and chaos and skips permanent marks', () => {
  const engine = startLeon();
  engine._adventureEngine = {
    snapshot: () => ({ consumables: [{ name: 'MagicTransfer', displayName: '魔法转移' }] }),
    s: { consumables: ['MagicTransfer', 'MagicTransfer', 'MagicTransfer'] }
  };
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.busy = false;

  engine.s.player.diving = true;
  engine.s.ai.diving = false;
  engine.useAdventureCombatItem(0, { from: 'self', kind: 'diving' });
  assert.equal(engine.s.player.diving, false);
  assert.equal(engine.s.ai.diving, true);

  engine.s.ai.thorns = 1;
  engine.s.player.thorns = 0;
  engine.useAdventureCombatItem(0, { from: 'opp', kind: 'thorns' });
  assert.equal(engine.s.ai.thorns, 0);
  assert.equal(engine.s.player.thorns, 1);

  engine.s.player.chaos_blue = true;
  engine.s.ai.chaos_blue = false;
  engine.useAdventureCombatItem(0, { from: 'self', kind: 'chaos_blue' });
  assert.equal(engine.s.player.chaos_blue, false);
  assert.equal(engine.s.ai.chaos_blue, true);

  const kinds = engine._listTransferableBuffs({ bloodthirst: true, bindMark: true, guard: 1 });
  assert.ok(kinds.includes('guard'));
  assert.ok(!kinds.includes('bloodthirst'));
  assert.ok(!kinds.includes('bind'));
});

test('Disarm trophy discards a selected NPC card and draws for the player', () => {
  const engine = startLeon();
  const trophy = context.AdventureDeck.trophyWhite('DisarmTrophy');
  engine.h.player = [trophy];
  engine.s.playerHand = engine.h.player;
  engine.h.ai = [number(4, 'RED'), number(2, 'BLUE')];
  engine.s.discardTop = number(1, 'RED');
  engine.s.phase = 'PLAYER_PLAY';
  engine.select(0);
  engine.play();
  assert.equal(engine.s.pendingDialog, 'trophyDisarm');
  engine.dispatch('chooseTrophyDisarm', { target: 'ai', index: 1 });
  assert.equal(engine.h.ai.length, 1);
  assert.equal(engine.s.pendingDialog, null);
});

test('Chameleon Paint borrows an NPC card with source metadata', () => {
  const engine = startLeon();
  engine._adventureEngine = {
    snapshot: () => ({ consumables: [{ name: 'ChameleonPaint', displayName: '变色龙颜料' }] }),
    s: { consumables: ['ChameleonPaint'] }
  };
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.busy = false;
  engine.h.ai = [number(2, 'RED')];
  engine.useAdventureCombatItem(0, { target: 'ai', index: 0 });
  assert.equal(engine.h.player.at(-1).borrowedFrom, 'ai');
  assert.equal(engine.h.player.at(-1).borrowedMonster, true);
  assert.equal(engine._adventureEngine.s.consumables.length, 0);
});

test('borrowed NPC number card resolves NPC attack skill against its owner', () => {
  const engine = startLeon();
  const borrowed = number(2, 'RED');
  borrowed.borrowedMonster = true;
  borrowed.borrowedFrom = 'ai';
  borrowed.borrowedMonsterName = 'CastleWolf';
  engine.h.player = [borrowed];
  engine.h.ai = [];
  engine.s.discardTop = number(1, 'RED');
  engine.s.phase = 'PLAYER_PLAY';
  engine.select(0);
  engine.play();
  assert.equal(engine.s.pendingAttack.damage, 4);
  assert.equal(engine.s.phase, 'ATTACK_MOD_CHOICE');
});

test('borrowed FrozenWhale white 6 in 1v2 applies AoE damage to all opponents', () => {
  const engine = new AdventureBattleEngine();
  engine.start1v2('Ryan', 'FrozenWhale', 'FrozenOceanLynx');
  const before = { whale: engine.s.ai.hp, lynx: engine.s.ai2.hp };
  const borrowed = number(6, 'BLUE');
  borrowed.isWhite = true;
  borrowed.chosenColor = 'BLUE';
  borrowed.color = 'WHITE';
  borrowed.borrowedMonster = true;
  borrowed.borrowedFrom = 'ai';
  borrowed.borrowedMonsterName = 'FrozenWhale';
  engine.h.player = [borrowed];
  engine.s.attackTarget = 'ai';
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.selectedCard = 0;
  engine.play1v2();
  assert.equal(engine.s.pendingAttack.damage, 4);
  assert.equal(engine.s.pendingAttack.aoeTargets.length, 2);
  assert.equal(engine.s.pendingAttack.aoeTargets[0], 'ai');
  assert.equal(engine.s.pendingAttack.aoeTargets[1], 'ai2');
  assert.equal(engine.s.pendingAttack.aoeDamage, 4);
  engine.pendingSettlement = {
    kind: 'PLAYER_ATTACK', damage: 4, bleed: 0, isDrain: false, afterEventId: engine.ver
  };
  engine.acknowledgeEvents(engine.ver);
  assert.equal(engine.s.ai.hp, before.whale - 4, 'whale takes regular damage');
  assert.equal(engine.s.ai2.hp, before.lynx - 4, 'lynx takes AoE damage');
});

test('borrowed FrozenWhale 6 in 1v2 applies AOE to non-main opponent', () => {
  const engine = new AdventureBattleEngine();
  engine.startAdventure1v2({
    player: 'Ryan',
    opponent1: 'FrozenWhale',
    opponent2: 'FrozenOceanLynx',
    playerPile: { deck: [], hand: [], discard: [], handLimit: 5 },
    discardTop: number(1, 'RED'),
    discardTopOwner: 'player'
  });
  const before = { whale: engine.s.ai.hp, lynx: engine.s.ai2.hp };
  const borrowed = number(6, 'BLUE');
  borrowed.isWhite = true;
  borrowed.chosenColor = 'BLUE';
  borrowed.color = 'WHITE';
  borrowed.borrowedMonster = true;
  borrowed.borrowedFrom = 'ai';
  borrowed.borrowedMonsterName = 'FrozenWhale';
  engine.h.player = [borrowed];
  engine.s.attackTarget = 'ai';
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.selectedCard = 0;
  engine.s.busy = false;
  engine.play1v2();
  assert.equal(engine.s.pendingAttack.damage, 4);
  assert.equal(engine.s.pendingAttack.aoeTargets.length, 2);
  engine.pendingSettlement = {
    kind: 'PLAYER_ATTACK', damage: 4, bleed: 0, isDrain: false, afterEventId: engine.ver
  };
  engine.acknowledgeEvents(engine.ver);
  assert.equal(engine.s.ai.hp, before.whale - 4, 'whale takes regular damage');
  assert.equal(engine.s.ai2.hp, before.lynx - 4, 'lynx takes AoE damage');
});

test('borrowed FrozenWhale 6 in 1v1 applies direct damage only', () => {
  const engine = new AdventureBattleEngine();
  engine.startAdventure({
    player: 'Ryan',
    opponent: 'FrozenWhale',
    playerPile: { deck: [], hand: [], discard: [], handLimit: 5 },
    discardTop: number(1, 'RED'),
    discardTopOwner: 'player'
  });
  const before = engine.s.ai.hp;
  const borrowed = number(6, 'BLUE');
  borrowed.isWhite = true;
  borrowed.chosenColor = 'BLUE';
  borrowed.color = 'WHITE';
  borrowed.borrowedMonster = true;
  borrowed.borrowedFrom = 'ai';
  borrowed.borrowedMonsterName = 'FrozenWhale';
  engine.h.player = [borrowed];
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.selectedCard = 0;
  engine.s.busy = false;
  engine.play();
  assert.equal(engine.s.pendingAttack.damage, 4);
  engine.pendingSettlement = {
    kind: 'PLAYER_ATTACK', damage: 4, bleed: 0, isDrain: false, afterEventId: engine.ver
  };
  engine.acknowledgeEvents(engine.ver);
  assert.equal(engine.s.ai.hp, before - 4, 'whale takes direct damage');
});

test('borrowed FrozenWhale white 4 applies hypothermia to the target, not self', () => {
  const engine = new AdventureBattleEngine();
  engine.startAdventure({
    player: 'Ryan',
    opponent: 'FrozenWhale',
    playerPile: { deck: [], hand: [], discard: [], handLimit: 5 },
    discardTop: number(1, 'RED'),
    discardTopOwner: 'player'
  });
  const borrowed = number(4, 'BLUE');
  borrowed.isWhite = true;
  borrowed.chosenColor = 'BLUE';
  borrowed.color = 'WHITE';
  borrowed.borrowedMonster = true;
  borrowed.borrowedFrom = 'ai';
  borrowed.borrowedMonsterName = 'FrozenWhale';
  engine.h.player = [borrowed];
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.selectedCard = 0;
  engine.s.busy = false;
  engine.play();
  assert.equal(engine.s.pendingAttack.hypothermiaTarget, 'ai', 'hypothermia lands on the target');
  assert.equal(engine.s.pendingAttack.hypothermiaAmount, 1);
  assert.ok(!(engine.s.player.hypothermia > 0), 'player must not gain hypothermia');
});

test('PurifyWater can clear an opponent buff', () => {
  const advEngine = new AdventureEngine();
  advEngine.s = { consumables: ['PurifyWater1'] };
  advEngine.snapshot = () => ({
    consumables: [{ name: 'PurifyWater1', displayName: '净化之水' }]
  });
  const engine = start({ hand: [number(2, 'YELLOW')] }, number(2, 'RED'));
  engine._adventureEngine = advEngine;
  engine.s.player.burn = 0;
  engine.s.ai.burn = 2;
  engine.s.phase = 'PLAYER_PLAY';
  engine.s.busy = false;

  engine.useAdventureCombatItem(0, [{ who: 'opp', kind: 'burn' }]);
  assert.equal(engine.s.ai.burn, 1);
  assert.equal(engine.s.player.burn, 0);
  assert.equal(advEngine.s.consumables.length, 0);
});

function startChan(pileOverrides = {}, top = number(3, 'RED')) {
  const engine = new AdventureBattleEngine();
  const playerPile = Object.assign({
    deck: [number(4, 'BLUE'), number(5, 'GREEN'), number(6, 'YELLOW')],
    hand: [number(3, 'RED'), number(1, 'YELLOW')],
    discard: [],
    handLimit: 5
  }, pileOverrides);
  engine.startAdventure({
    player: 'Chan',
    opponent: 'CastleWolf',
    playerState: { hp: 40, maxHp: 80 },
    playerPile,
    discardTop: top,
    discardTopOwner: 'player'
  });
  return engine;
}

test('Chan defense 3 heals from the revealed card and keeps remaining damage finite', () => {
  const engine = startChan();
  engine.s.phase = 'PLAYER_DEFEND';
  engine.s.busy = false;
  engine.s.pendingAttack = { damage: 8, unblock: false };
  engine.s.atkCard = number(2, 'RED');
  engine.s.atkOwner = 'ai';
  engine.s.discardTop = number(2, 'RED');
  engine.h.player.push(number(3, 'RED'));
  engine.s.selectedCard = engine.h.player.length - 1;
  engine.piles.player.deck.push(number(4, 'BLUE'));
  const hp = engine.s.player.hp;

  engine.defend();

  assert.equal(engine.s.phase === 'GAME_OVER', false);
  assert.equal(engine.s.player.alive, true);
  assert.ok(engine.pendingSettlement, 'defense should defer remaining damage');
  assert.equal(Number.isFinite(engine.pendingSettlement.damage), true);
  assert.equal(engine.pendingSettlement.damage, 8);
  assert.equal(engine.s.player.hp, hp + 2);
  assert.equal(engine.h.player.some(card => card.value === 4 && card.color === 'BLUE'), true);
});

test('Chan passive draws one extra card when entering a room', () => {
  const engine = startChan({
    deck: [number(7, 'GREEN'), number(5, 'BLUE')],
    hand: [number(1, 'YELLOW'), number(2, 'RED')]
  });
  assert.equal(engine.h.player.length, 3);
  const draws = engine.events.filter(evt => evt.type === 'draw' && evt.who === 'player');
  assert.equal(draws.length, 1);
  assert.equal(draws[0].count, 1);
});

test('Chan passive and refill emit a single player draw when a new attack turn starts', () => {
  const engine = startChan({
    deck: [number(4, 'BLUE'), number(5, 'GREEN'), number(6, 'YELLOW'), number(7, 'RED')],
    hand: [number(1, 'YELLOW'), number(2, 'RED')]
  });
  const before = engine.h.player.length;
  engine.events = [];
  engine.ver = 0;
  engine.endAi();
  const draws = engine.events.filter(evt => evt.type === 'draw' && evt.who === 'player');
  assert.equal(draws.length, 1);
  assert.equal(engine.h.player.length, before + draws[0].count);
  assert.ok(draws[0].count >= 1);
});
test('adventure challenge refills the player each round and after the first enemy defeat', () => {
  const engine = new AdventureBattleEngine();
  engine.startAdventure1v2({
    player: 'Leon', opponent1: 'CastleWolf', opponent2: 'CastleBear', stage: 1,
    playerPile: {
      deck: [number(2), number(3), number(4), number(5), number(6)],
      hand: [number(1)], discard: [], handLimit: 5
    }
  });
  const opening = engine.h.player.length;
  engine.fillHands1v2(true);
  assert.ok(engine.h.player.length > opening, 'challenge rooms still refill at the end of a round');
  assert.equal(engine.h.player.length, engine.piles.player.handLimit);

  while (engine.h.player.length > 1) engine.piles.player.discard.push(engine.h.player.pop());
  engine.s.ai.alive = false;
  engine.s.ai2.alive = true;
  engine._on1v2OpponentEliminated('ai');
  assert.equal(engine.s.challengeRefillAvailable, true);
  engine.fillHands1v2(true);
  assert.equal(engine.h.player.length, engine.piles.player.handLimit);
  engine.piles.player.discard.push(engine.h.player.pop());
  engine.fillHands1v2(true);
  assert.equal(engine.h.player.length, engine.piles.player.handLimit);
});

test('adventure challenge does not refill the player on enter or on victory', () => {
  const engine = new AdventureBattleEngine();
  engine.later = () => {};
  engine.startAdventure1v2({
    player: 'Leon', opponent1: 'CastleWolf', opponent2: 'CastleBear', stage: 1,
    playerPile: {
      deck: [number(2), number(3), number(4), number(5), number(6)],
      hand: [number(1)], discard: [], handLimit: 5
    }
  });
  assert.deepEqual(Array.from(engine.h.player, card => card.value), [1], 'entering a challenge room must keep the map hand');

  engine.s.ai.hp = 0;
  engine.s.ai.alive = false;
  engine.s.ai2.hp = 0;
  engine.s.ai2.alive = false;
  engine.startAITurn();
  assert.equal(engine.s.phase, 'GAME_OVER');
  assert.ok(engine.h.player.length < engine.piles.player.handLimit, 'a finishing blow must not refill to the hand limit');

  const handAfterFight = engine.h.player.length;
  const result = engine.finishAdventureBattle();
  assert.equal(result.playerPile.hand.length, handAfterFight);
});

test('adventure ordinary victory keeps the player hand without an automatic refill', () => {
  const engine = start({
    deck: [number(4), number(5), number(6)],
    hand: [number(1)],
    discard: []
  });
  engine.s.ai.alive = false;
  const result = engine.finishAdventureBattle();
  assert.equal(result.playerPile.hand.length, 1);
});

test('castle monster loot uses a d12 rule and enters the transient player hand', () => {
  const engine = start();
  context.FurryGame.CombatRuntime.setRandomSource(() => 0);
  try {
    engine.s.ai.alive = false;
    engine.s.ai.name = 'CastleGhost';
    const before = engine.h.player.length;
    const loot = engine._resolveAdventureTrophyDrop('ai');
    assert.equal(loot.roll, 1);
    assert.equal(loot.drops.length, 1);
    assert.equal(loot.drops[0], 'FlyTrophy');
    assert.equal(engine.h.player.length, before + 1);
    assert.equal(engine.h.player[engine.h.player.length - 1].trophyName, 'FlyTrophy');
    assert.equal(engine.s.trophyDrops.length, 1);
    assert.equal(engine.s.trophyDrops[0], 'FlyTrophy');
    const dice = engine.events.find(event => event.type === 'diceRoll' && event.purpose === 'trophyDrop');
    assert.equal(dice && dice.value, 1);
    assert.equal(dice && dice.outcome, 'success');
    assert.equal(engine._resolveAdventureTrophyDrop('ai'), null);
  } finally {
    context.FurryGame.CombatRuntime.resetRandomSource();
  }
});
test('forest monster loot follows the forest guide, including split outcomes', () => {
  const loot = context.AdventureLoot;
  let result = loot.rollMonsterDrop('forest', 'ForestMonkey', () => 0);
  assert.equal(result.drops[0], 'LushTrophy');
  result = loot.rollMonsterDrop('森林', 'ForestDeer', () => 0);
  assert.equal(result.drops[0], 'LushTrophy');
  result = loot.rollMonsterDrop('forest_scene', 'ForestDeer', () => 1 / 12);
  assert.equal(result.drops[0], 'GuardTrophy');
  result = loot.rollMonsterDrop('forest', 'ForestLeech', () => 0);
  assert.equal(result.drops[0], 'ParasiteTrophy');
  result = loot.rollMonsterDrop('forest', 'ForestRafflesia', () => 0.99);
  assert.equal(result.drops.length, 0);
});

test('ocean monster loot follows the ocean guide, including polar bear split outcomes', () => {
  const loot = context.AdventureLoot;
  let result = loot.rollMonsterDrop('ocean', 'FrozenOceanLynx', () => 0);
  assert.equal(result.drops[0], 'FreezeTrophy');
  result = loot.rollMonsterDrop('ocean', 'FrozenOceanLynx', () => 1 / 12);
  assert.equal(result.drops[0], 'IceSealTrophy');
  result = loot.rollMonsterDrop('冻洋', 'FrozenWhale', () => 2 / 12);
  assert.equal(result.drops[0], 'DivingTrophy');
  result = loot.rollMonsterDrop('ocean', 'FrozenOceanShark', () => 0);
  assert.equal(result.drops[0], 'PiercingTrophy');
  result = loot.rollMonsterDrop('ocean', 'FrozenOceanSeal', () => 0);
  assert.equal(result.drops[0], 'DisarmTrophy');
  result = loot.rollMonsterDrop('ocean', 'FrozenPolarBear', () => 0);
  assert.equal(result.drops[0], 'PiercingTrophy');
  result = loot.rollMonsterDrop('ocean_scene', 'FrozenPolarBear', () => 1 / 12);
  assert.equal(result.drops[0], 'HypothermiaTrophy');
  result = loot.rollMonsterDrop('ocean', 'FrozenOceanSnowyOwl', () => 0);
  assert.equal(result.drops[0], 'FlyTrophy');
  result = loot.rollMonsterDrop('ocean', 'FrozenPolarBear', () => 0.99);
  assert.equal(result.drops.length, 0);
});

test('FrozenOceanSnowyOwl skills match the ocean guide', () => {
  const mod = context.AdventureRegistry.getMonster('FrozenOceanSnowyOwl');
  assert.equal(mod.kind, '冻洋雪鸮');
  assert.equal(mod.hp, 24);
  assert.equal(mod.attackDamage({ value: 2, isNumberCard: true }), 2);
  assert.equal(mod.attackFly({ value: 2, isNumberCard: true }), 1);
  assert.equal(mod.attackDamage({ value: 5, isNumberCard: true }), 4);
  assert.equal(mod.attackStealItem({ value: 5, isNumberCard: true }), false);
  assert.equal(mod.attackStealItem({ value: 6, isNumberCard: true }), true);
  assert.equal(mod.defendBlock({ value: 2, isNumberCard: true }, 5), 2);
  assert.equal(mod.defendHypothermia({ value: 3, isNumberCard: true }), 1);
  const stage2 = mod.stageMods[2](mod);
  assert.equal(stage2.hp, 30);
  const stage3 = mod.stageMods[3](mod);
  assert.equal(stage3.attackDamage({ value: 1, isNumberCard: true }), 3);
  const stage4 = mod.stageMods[4](mod);
  assert.equal(stage4.defendBlock({ value: 1, isNumberCard: true }, 5), 3);
});

test('parasite trophy is a reusable self-buff card with the registered icon and effect', () => {
  const def = context.AdventureRegistry.getItem('ParasiteTrophy');
  assert.equal(def.kind, 'trophyWhite');
  assert.equal(def.trophyEffect, 'parasite');
  assert.equal(def.price, 5);
  assert.ok(def.icon.endsWith('buff_icons/parasite.webp'));

  const engine = start({ hand: [context.AdventureDeck.trophyWhite('ParasiteTrophy')] });
  engine.later = () => {};
  engine.useTrophyWhite(engine.h.player[0], engine.s.ai, 'player');
  assert.equal(engine.s.player.parasite, 1);
  assert.equal(engine.s.ai.parasite || 0, 0);
});

test('diving trophy grants diving to the player and forges for two water tokens', () => {
  const def = context.AdventureRegistry.getItem('DivingTrophy');
  assert.equal(def.kind, 'trophyWhite');
  assert.equal(def.trophyEffect, 'diving');
  assert.equal(def.price, 5);
  assert.equal(JSON.stringify(def.beastTradeCost), JSON.stringify(['shui', 'shui']));
  assert.ok(def.icon.endsWith('buff_icons/diving.webp'));

  const engine = start({ hand: [context.AdventureDeck.trophyWhite('DivingTrophy')] });
  engine.later = () => {};
  engine.useTrophyWhite(engine.h.player[0], engine.s.ai, 'player');
  assert.equal(engine.s.player.diving, true);
  assert.equal(engine.s.ai.diving || false, false);
});

test('ice seal and hypothermia trophies apply to the opponent', () => {
  const ice = context.AdventureRegistry.getItem('IceSealTrophy');
  assert.equal(ice.trophyEffect, 'iceSeal');
  assert.equal(JSON.stringify(ice.beastTradeCost), JSON.stringify(['shui', 'ben']));
  const cold = context.AdventureRegistry.getItem('HypothermiaTrophy');
  assert.equal(cold.trophyEffect, 'hypothermia');
  assert.equal(JSON.stringify(cold.beastTradeCost), JSON.stringify(['shui', 'huo']));

  const engine = start({ hand: [
    context.AdventureDeck.trophyWhite('IceSealTrophy'),
    context.AdventureDeck.trophyWhite('HypothermiaTrophy')
  ] });
  engine.later = () => {};
  engine.useTrophyWhite(engine.h.player[0], engine.s.ai, 'player');
  assert.ok(engine.s.ai.iceSeal);
  assert.equal(engine.s.player.iceSeal || 0, 0);
  engine.useTrophyWhite(engine.h.player[1], engine.s.ai, 'player');
  assert.equal(engine.s.ai.hypothermia, 1);
});

test('restoreSession writes spent combat items back onto the adventure engine', () => {
  const live = start();
  live.s.adventureConsumables = [{ name: 'Dodge' }];
  live.s.adventureGold = 4;
  const snapshot = {
    s: JSON.parse(JSON.stringify(live.s)),
    piles: JSON.parse(JSON.stringify(live.piles)),
    h: JSON.parse(JSON.stringify(live.h)),
    events: [],
    ver: live.ver,
    pendingSettlement: null,
    tableTopOwner: live.tableTopOwner,
    testMode: false
  };
  const map = new context.AdventureMap([[0, 1], [3, 2]]);
  const adv = new AdventureEngine();
  adv.mapName = 'stage_01_castle_1';
  adv.start(map, 'Ryan', { gold: 4, stage: 1, scene: 'castle', consumables: ['GhostFire', 'Dodge'] });
  const restored = new AdventureBattleEngine();
  restored.restoreSession(snapshot, adv);
  assert.deepEqual(adv.s.consumables, ['Dodge']);
});

test('restoreSession re-aliases NPC hand so draw still fills h.ai', () => {
  const live = start();
  live.h.ai.splice(0, live.h.ai.length);
  const snapshot = {
    s: JSON.parse(JSON.stringify(live.s)),
    piles: JSON.parse(JSON.stringify(live.piles)),
    h: JSON.parse(JSON.stringify(live.h)),
    events: [],
    ver: live.ver,
    pendingSettlement: null,
    tableTopOwner: live.tableTopOwner,
    testMode: false
  };
  const restored = new AdventureBattleEngine();
  restored.restoreSession(snapshot);
  assert.equal(restored.h.ai, restored.piles.ai.hand);
  assert.equal(restored.h.player, restored.piles.player.hand);
  const before = restored.h.ai.length;
  restored.draw('ai', 1, false);
  assert.equal(restored.h.ai.length, before + 1);
  assert.equal(restored.piles.ai.hand.length, restored.h.ai.length);
  restored.fillHands(true);
  assert.equal(restored.h.ai.length, restored.piles.ai.handLimit);
});

test('thorns trophy applies one thorns stack to the opponent', () => {
  const def = context.AdventureRegistry.getItem('ThornsTrophy');
  assert.equal(def.kind, 'trophyWhite');
  assert.equal(def.trophyEffect, 'thorns');
  assert.ok(def.icon.endsWith('buff_icons/thorns.webp'));

  const engine = start({ hand: [context.AdventureDeck.trophyWhite('ThornsTrophy')] });
  engine.later = () => {};
  engine.useTrophyWhite(engine.h.player[0], engine.s.ai, 'player');
  assert.equal(engine.s.ai.thorns, 1);
  assert.equal(engine.s.player.thorns || 0, 0);
});
