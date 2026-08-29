const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const gameRoot = path.resolve(__dirname, '..');
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

const sources = [
  'js/characters/registry.js',
  'js/characters/ryan.js',
  'js/characters/leon.js',
  'js/characters/chan.js',
  'js/characters/saiki.js',
  'js/characters/blaze.js',
  'js/characters/serenity.js',
  'js/characters/moze.js',
  'js/characters/knight.js',
  'js/ai/registry.js',
  'js/ai/knight_ai.js',
  'js/ai/leon_ai.js',
  'js/ai/ryan_ai.js',
  'js/ai/blaze_ai.js',
  'js/ai/serenity_ai.js',
  'js/ai/saiki_ai.js',
  'js/ai/moze_ai.js',
  'js/ai/chan_ai.js',
  'js/engine.js',
  'js/engine_lord.js',
  'adventure/js/adventure_registry.js',
  'adventure/js/monster.js',
  'adventure/js/monsters/castle.js',
  'adventure/js/boss.js',
  'adventure/js/monster_registry.js',
  'adventure/js/adventure_deck.js',
  'adventure/js/items/item_defs.js',
  'adventure/js/currency.js',
  'adventure/js/room.js',
  'adventure/js/map.js',
  'adventure/js/adventure_deck.js',
  'adventure/js/adventure_engine.js',
  'adventure/js/adventure_battle_engine.js',
  'js/bridge.js',
  'js/ui.js',
  'adventure/js/combat_bridge.js'
];

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
  assert.equal(engine.s.ai.burn, 2);
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

test('adventure opponent is registered for the ordinary 1v1 character and AI interfaces', () => {
  const wolf = CharacterRegistry.get('CastleWolf');
  assert.ok(wolf);
  assert.equal(wolf.adventureNpc, true);
  assert.ok(context.AIRegistry.get('CastleWolf'));
});

test('adventure combat bridge detects the exported shared 1v1 UI', () => {
  assert.equal(typeof context.GameUI, 'function');
  assert.equal(typeof context.AnimLayer, 'function');
  assert.equal(context.AdventureCombatBridge.isAvailable(), true);
});

test('black cards pause for a color choice before resolving in adventure combat', () => {
  const engine = start({ hand: [black()] });
  engine.dispatch('selectCard', { index: 0 });

  const pending = engine.dispatch('doPlay');
  assert.equal(pending.needColorChoice, true);
  assert.equal(pending.pendingDialog, 'color');
  assert.equal(pending.playerHand.length, 1);

  const resolved = engine.dispatch('chooseColor', { color: 'GREEN' });
  assert.equal(resolved.needColorChoice, false);
  assert.equal(resolved.pendingDialog, null);
  assert.equal(resolved.discardTop.chosenColor, 'GREEN');
  assert.equal(resolved.playerHand.length, 0);
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
