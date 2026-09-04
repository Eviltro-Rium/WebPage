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
  'adventure/js/adventure_registry.js',
  'adventure/js/currency.js',
  'adventure/js/room.js',
  'adventure/js/map.js',
  'adventure/js/adventure_deck.js',
  'adventure/js/items/item_defs.js',
  'adventure/js/adventure_engine.js'
];

for (const relative of sources) {
  const file = path.join(gameRoot, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { AdventureEngine, AdventureMap, AdventurePhase } = context;

function startEngine(grid = [[0, 1]]) {
  const map = new AdventureMap(grid);
  const eng = new AdventureEngine();
  eng.start(map, 'Ryan');
  return eng;
}

function enterNormalCombat(eng) {
  assert.ok(eng.move(0, 1));
  const room = eng.currentRoom();
  assert.equal(room.type, 'normal');
  eng.s.combat = { enemy: { name: 'CastleWolf' } };
  return room;
}

function enterBossCombat(eng) {
  assert.ok(eng.move(0, 1));
  const room = eng.currentRoom();
  assert.equal(room.type, 'boss');
  eng.s.combat = { enemy: { name: 'CastleChameleon' } };
  return room;
}

test('combat victory heals 3 HP in normal rooms', () => {
  const eng = startEngine();
  enterNormalCombat(eng);
  eng.s.player.hp = 10;
  eng.onCombatEnd('win');
  assert.equal(eng.s.player.hp, 13);
});

test('boss victory heals 10 HP', () => {
  const eng = startEngine([[0, 2]]);
  enterBossCombat(eng);
  eng.s.player.hp = 20;
  eng.onCombatEnd('win');
  assert.equal(eng.s.player.hp, 30);
});

test('LifeCore grants extra 3 HP after normal, challenge, and boss wins', () => {
  const normalEng = startEngine();
  normalEng.addItem('LifeCore');
  enterNormalCombat(normalEng);
  normalEng.s.player.hp = 10;
  normalEng.onCombatEnd('win');
  assert.equal(normalEng.s.player.hp, 16);

  const challengeEng = startEngine([[0, 6]]);
  challengeEng.addItem('LifeCore');
  assert.ok(challengeEng.move(0, 1));
  assert.equal(challengeEng.currentRoom().type, 'challenge');
  challengeEng.s.combat = { enemy: { name: 'CastleWolf' } };
  challengeEng.s.player.hp = 20;
  challengeEng.onCombatEnd('win');
  assert.equal(challengeEng.s.player.hp, 26);

  const bossEng = startEngine([[0, 2]]);
  bossEng.addItem('LifeCore');
  enterBossCombat(bossEng);
  bossEng.s.player.hp = 20;
  bossEng.onCombatEnd('win');
  assert.equal(bossEng.s.player.hp, 33);
});

test('same beast token type can be selected twice when two are offered', () => {
  const eng = startEngine();
  enterNormalCombat(eng);
  eng.s.phase = AdventurePhase.BEAST_CHOICE;
  eng.s.beastReward = { scenario: 1, auto: false, offeredTypes: ['ben', 'cao'], pickCount: 2 };
  eng.s.beastSelection = [];

  assert.deepEqual(Array.from(eng._offeredSlotTypes(eng.s.beastReward)), ['ben', 'ben', 'cao', 'cao']);
  assert.equal(eng.toggleBeastSlot(0), true);
  assert.equal(eng.toggleBeastSlot(1), true);
  assert.deepEqual(Array.from(eng._selectedBeastTypes()), ['ben', 'ben']);
  assert.equal(eng.toggleBeastSlot(2), false);
  assert.equal(eng.selectBeastToken('ben'), false);

  assert.equal(eng.confirmBeastTokenChoice(), true);
  assert.equal(eng.s.currency.tokens.ben, 2);
  assert.equal(eng.s.currency.tokens.cao, 0);
  assert.equal(eng.s.phase, AdventurePhase.MAP);
});

test('each duplicate color is its own selectable slot', () => {
  const eng = startEngine();
  eng.s.phase = AdventurePhase.BEAST_CHOICE;
  eng.s.beastReward = { scenario: 1, auto: false, offeredTypes: ['ben', 'cao'], pickCount: 2 };
  eng.s.beastSelection = [];
  eng.toggleBeastSlot(0);
  eng.toggleBeastSlot(2);
  const slots = eng._offeredSlots(eng.s.beastReward);
  assert.equal(slots[0].selected, true);
  assert.equal(slots[1].selected, false);
  assert.equal(slots[2].selected, true);
  assert.equal(slots[3].selected, false);
  eng.toggleBeastSlot(0);
  assert.deepEqual(Array.from(eng._selectedBeastTypes()), ['cao']);
  assert.equal(eng.toggleBeastSlot(1), true);
  assert.deepEqual(Array.from(eng._selectedBeastTypes()), ['cao', 'ben']);
});

test('clicking a selected slot after the pick limit unselects that slot', () => {
  const eng = startEngine();
  eng.s.phase = AdventurePhase.BEAST_CHOICE;
  eng.s.beastReward = { scenario: 1, auto: false, offeredTypes: ['ben', 'cao'], pickCount: 2 };
  eng.s.beastSelection = [];
  eng.toggleBeastSlot(0);
  eng.toggleBeastSlot(2);
  assert.equal(eng.toggleBeastSlot(1), false);
  assert.equal(eng.toggleBeastSlot(0), true);
  assert.deepEqual(Array.from(eng._selectedBeastTypes()), ['cao']);
  assert.equal(eng.toggleBeastSlot(3), true);
  assert.deepEqual(Array.from(eng._selectedBeastTypes()), ['cao', 'cao']);
});

test('combat victory rolls basic reward first, then dedicated beast settlement', () => {
  const eng = startEngine();
  const origRoll = context.AdventureCurrency.rollBeastReward;
  context.AdventureCurrency.rollBeastReward = () => ({
    scenario: 1, auto: false, offeredTypes: ['ben', 'huo'], pickCount: 2
  });
  const origRandom = Math.random;
  // 权重合计 12：无×1 + 金5–10×1 + 道具×1权重3 + 道具×2权重2；1.5/12 → 5 金币
  Math.random = () => 1.5 / 12;

  try {
    enterNormalCombat(eng);
    const goldBefore = eng.s.currency.gold;
    eng.onCombatEnd('win');
    assert.equal(eng.s.phase, AdventurePhase.COMBAT_SETTLE);
    assert.equal(eng.s.pendingCombatReward.stage, 'basic');
    assert.equal(eng.s.pendingCombatReward.basic.kind, 'gold');
    assert.equal(eng.s.pendingCombatReward.basic.gold, 5);
    assert.equal(eng.s.currency.gold, goldBefore);
    assert.equal(eng.currentRoom().cleared, true);
    assert.equal(eng.currentRoom().visited, true);

    assert.equal(eng.claimCombatReward(), true);
    assert.equal(eng.s.currency.gold, goldBefore + 5);
    assert.equal(eng.s.phase, AdventurePhase.BEAST_CHOICE);
    assert.equal(eng.currentRoom().rewardClaimed, true);
    assert.equal(eng.currentRoom().stashedLoot, null);

    assert.equal(eng.claimCombatReward(), false);
    eng.toggleBeastSlot(0);
    eng.toggleBeastSlot(1);
    assert.equal(eng.claimCombatReward(), true);
    assert.equal(eng.s.currency.tokens.ben, 2);
    assert.equal(eng.currentRoom().beastTokenClaimed, true);
    assert.equal(eng.s.phase, AdventurePhase.MAP);
    assert.equal(eng.s.pendingCombatReward, null);
  } finally {
    context.AdventureCurrency.rollBeastReward = origRoll;
    Math.random = origRandom;
  }
});

test('deferring basic reward stashes loot on the room for later claim', () => {
  const eng = startEngine();
  const origRoll = context.AdventureCurrency.rollBeastReward;
  context.AdventureCurrency.rollBeastReward = () => ({
    scenario: 7, auto: true, offered: { wuneng: 1 }, pickCount: 0
  });
  const origRandom = Math.random;
  Math.random = () => 3 / 12; // 金币 ×7（权重区间 [3,4)/12）

  try {
    enterNormalCombat(eng);
    const goldBefore = eng.s.currency.gold;
    eng.onCombatEnd('win');
    assert.equal(eng.deferCombatReward(), true);
    assert.equal(eng.s.currency.gold, goldBefore);
    assert.ok(eng.currentRoom().stashedLoot);
    assert.equal(eng.currentRoom().stashedLoot.kind, 'gold');
    assert.equal(eng.currentRoom().stashedLoot.gold, 7);
    assert.equal(eng.currentRoom().rewardClaimed, false);
    assert.equal(eng.s.phase, AdventurePhase.COMBAT_SETTLE);
    assert.equal(eng.s.pendingCombatReward.stage, 'beast');

    assert.equal(eng.claimCombatReward(), true);
    assert.equal(eng.s.currency.tokens.wuneng, 1);
    assert.equal(eng.s.phase, AdventurePhase.MAP);
    assert.ok(eng.currentRoom().stashedLoot);

    eng.enterCurrent();
    assert.equal(eng.s.phase, AdventurePhase.REWARD);
    assert.equal(eng.collectReward().kind, 'gold');
    assert.equal(eng.s.currency.gold, goldBefore + 7);
    assert.equal(eng.currentRoom().stashedLoot, null);
    assert.equal(eng.currentRoom().rewardClaimed, true);
    assert.equal(eng.s.phase, AdventurePhase.MAP);
  } finally {
    context.AdventureCurrency.rollBeastReward = origRoll;
    Math.random = origRandom;
  }
});

test('auto universal beast token is granted after basic reward claim', () => {
  const eng = startEngine();
  const origRoll = context.AdventureCurrency.rollBeastReward;
  context.AdventureCurrency.rollBeastReward = () => ({
    scenario: 7, auto: true, offered: { wuneng: 1 }, pickCount: 0
  });
  const origRandom = Math.random;
  Math.random = () => 0.01; // none

  try {
    enterNormalCombat(eng);
    eng.onCombatEnd('win');
    assert.equal(eng.s.phase, AdventurePhase.COMBAT_SETTLE);
    assert.equal(eng.s.pendingCombatReward.basic.kind, 'none');
    assert.equal(eng.claimCombatReward(), true);
    assert.equal(eng.s.phase, AdventurePhase.COMBAT_SETTLE);
    assert.equal(eng.s.pendingCombatReward.stage, 'beast');
    assert.equal(eng.s.currency.tokens.wuneng, 0);
    assert.equal(eng.claimCombatReward(), true);
    assert.equal(eng.s.currency.tokens.wuneng, 1);
    assert.equal(eng.s.phase, AdventurePhase.MAP);
  } finally {
    context.AdventureCurrency.rollBeastReward = origRoll;
    Math.random = origRandom;
  }
});

test('basic reward item rolls support one or two drops', () => {
  const eng = startEngine();
  const items = context.AdventureRegistry.allItems().filter(it => it.kind === 'consumable');
  const origRandom = Math.random;

  try {
    Math.random = () => 8 / 12; // 道具×1区间 [7,10)/12
    const itemLoot = eng._rollBasicCombatReward();
    assert.equal(itemLoot.kind, 'item');
    assert.ok(items.some(it => it.name === itemLoot.item));

    Math.random = () => 11 / 12; // 道具×2区间 [10,12)/12
    const twoLoot = eng._rollBasicCombatReward();
    assert.equal(twoLoot.kind, 'items');
    assert.equal(twoLoot.items.length, 2);
  } finally {
    Math.random = origRandom;
  }
});

test('start room is marked visited so it can glow as explored', () => {
  const eng = startEngine();
  const start = eng.s.map.get(0, 0);
  assert.equal(start.type, 'start');
  assert.equal(start.visited, true);
});

test('combat-only consumables cannot be used on the map', () => {
  const eng = startEngine();
  eng.s.consumables = ['Piercing', 'GhostFire', 'Vampire', 'FreezeItem', 'AttackMod1', 'Dodge', 'MagicTransfer', 'ArmorBreakSpear'];
  for (let i = eng.s.consumables.length - 1; i >= 0; i--) {
    const before = eng.s.consumables.length;
    const result = eng.useConsumable(i);
    assert.equal(result.ok, false);
    assert.match(result.message, /只能在对战中使用|对战界面/);
    assert.equal(eng.s.consumables.length, before);
  }
});

test('map-usable consumables apply heal and purify outside combat', () => {
  const eng = startEngine();
  eng.s.player.hp = 40;
  eng.s.player.burn = 2;
  eng.s.player.bleed = 1;
  eng.s.consumables = ['FirstAidKit', 'PurifyWater2'];

  const heal = eng.useConsumable(0);
  assert.equal(heal.ok, true);
  assert.equal(eng.s.player.hp, 47);
  assert.deepEqual(Array.from(eng.s.consumables), ['PurifyWater2']);

  const purify = eng.useConsumable(0, { purifyChoices: ['burn', 'burn', 'bleed'] });
  assert.equal(purify.ok, true);
  assert.equal(eng.s.player.burn, 0);
  assert.equal(eng.s.player.bleed, 0);
  assert.equal(eng.s.player.frozen, false);
  assert.equal(eng.s.consumables.length, 0);
});

test('purify water requires player to choose debuff kinds', () => {
  const eng = startEngine();
  eng.s.player.burn = 1;
  eng.s.consumables = ['PurifyWater1'];
  const pending = eng.useConsumable(0);
  assert.equal(pending.ok, false);
  assert.equal(pending.needsPurifyChoice, true);
  const applied = eng.useConsumable(0, { purifyChoices: ['burn'] });
  assert.equal(applied.ok, true);
  assert.equal(eng.s.player.burn, 0);
  assert.equal(eng.s.consumables.length, 0);
});

test('shop offers 3 item + 2 beast + 1 accessory slots', () => {
  const map = new AdventureMap([[0, 4]]);
  const eng = new AdventureEngine();
  eng.start(map, 'Ryan');
  eng.s.currency.addGold(40);
  assert.ok(eng.move(0, 1));
  eng.enterCurrent();
  assert.equal(eng.s.phase, AdventurePhase.SHOP);
  assert.equal(eng.currentRoom().shopSlots.length, 6);
  assert.ok(eng.currentRoom().shopSlots.every(Boolean));
  assert.equal(typeof eng.currentRoom().shopSlots[0], 'string');
  const item0Kind = context.AdventureRegistry.getItem(eng.currentRoom().shopSlots[0]).kind;
  assert.ok(item0Kind === 'consumable' || item0Kind === 'trophyWhite', 'shop slot 0 should be consumable or trophyWhite, got ' + item0Kind);
  assert.equal(eng.currentRoom().shopSlots[3].kind, 'beast');
  assert.equal(eng.currentRoom().shopSlots[4].kind, 'beast');
  assert.equal(context.AdventureRegistry.getItem(eng.currentRoom().shopSlots[5]).kind, 'accessory');

  const item = eng.currentRoom().shopSlots[0];
  const price = context.AdventureRegistry.getItem(item).price;
  const goldBefore = eng.s.currency.gold;
  const buy = eng.buyShopSlot(0);
  assert.equal(buy.ok, true);
  assert.equal(eng.s.currency.gold, goldBefore - price);
  assert.equal(eng.currentRoom().shopSlots[0], null);
  const def0 = context.AdventureRegistry.getItem(item);
  if (def0.kind === 'consumable') assert.ok(eng.s.consumables.includes(item));
  else assert.ok(eng.s.trophyWhiteCards.includes(item));

  const emptyBuy = eng.buyShopSlot(0);
  assert.equal(emptyBuy.ok, false);
  assert.equal(emptyBuy.message, 'sold-out');
});

test('shop beast slots cost 2/4 and cannot refresh', () => {
  const map = new AdventureMap([[0, 4]]);
  const eng = new AdventureEngine();
  eng.start(map, 'Ryan');
  eng.s.currency.addGold(20);
  eng.move(0, 1);
  eng.enterCurrent();
  eng.currentRoom().shopSlots = [
    null,
    null,
    null,
    { kind: 'beast', beastType: 'ben' },
    { kind: 'beast', beastType: 'wuneng' },
    null
  ];
  const goldBefore = eng.s.currency.gold;
  const buyNormal = eng.buyShopSlot(3);
  assert.equal(buyNormal.ok, true);
  assert.equal(eng.s.currency.gold, goldBefore - 2);
  assert.equal(eng.s.currency.tokens.ben, 1);

  const buyUni = eng.buyShopSlot(4);
  assert.equal(buyUni.ok, true);
  assert.equal(eng.s.currency.gold, goldBefore - 2 - 4);
  assert.equal(eng.s.currency.tokens.wuneng, 1);

  eng.currentRoom().shopSlots[3] = null;
  const refreshBeast = eng.refreshShopSlot(3);
  assert.equal(refreshBeast.ok, false);
});

test('shop refresh costs 2 gold and restocks empty slots', () => {
  const map = new AdventureMap([[0, 4]]);
  const eng = new AdventureEngine();
  eng.start(map, 'Ryan');
  eng.s.currency.addGold(10);
  eng.move(0, 1);
  eng.enterCurrent();
  eng.currentRoom().shopSlots = [null, 'Piercing', null, null, null, null];

  const goldBefore = eng.s.currency.gold;
  const refresh = eng.refreshShopSlot(0);
  assert.equal(refresh.ok, true);
  assert.equal(eng.s.currency.gold, goldBefore - 2);
  assert.ok(eng.currentRoom().shopSlots[0]);
  assert.equal(typeof eng.currentRoom().shopSlots[0], 'string');
  assert.equal(context.AdventureRegistry.getItem(eng.currentRoom().shopSlots[0]).kind, 'consumable');
});

test('wisdom necklace draws 2 after win and accessories have beast trade costs', () => {
  const map = new AdventureMap([[0, 1]]);
  const eng = new AdventureEngine();
  eng.start(map, 'Ryan');
  eng.addItem('WisdomNecklace');
  const AD = context.AdventureDeck;
  const pile = new AD.AdventurePile('player', AD.makePlayerDeck(), 5);
  pile.hand = [];
  eng.s.playerPile = pile;
  const before = pile.hand.length;
  eng.s.combat = { enemy: { name: 'x' }, kind: 'normal' };
  eng.onCombatEnd('win');
  assert.equal(pile.hand.length, before + 2);
  const necklace = context.AdventureRegistry.getItem('WisdomNecklace');
  assert.equal(JSON.stringify(necklace.beastTradeCost), '["shui","shui","shui","ben","cao"]');
  assert.ok(necklace.icon.indexOf('wisdom_necklace') >= 0);
  const fist = context.AdventureRegistry.getItem('FlameFist');
  assert.ok(fist);
  assert.equal(JSON.stringify(fist.beastTradeCost), '["huo","huo","huo","huo","ben"]');
  assert.equal(fist.onDefendBurn, 1);
  const bag = context.AdventureRegistry.getItem('BeastBag');
  assert.equal(JSON.stringify(bag.beastTradeCost), '["ben","ben","ben","cao","cao"]');
});

test('blacksmith entry gold by stage and beast trade with wuneng', () => {
  const map = new AdventureMap([[0, 5]]);
  const eng = new AdventureEngine();
  eng.start(map, 'Ryan');
  assert.ok(eng.move(0, 1));
  const room = eng.currentRoom();
  assert.equal(room.type, 'blacksmith');

  eng.s.currency.gold = 0;
  eng.enterCurrent();
  assert.equal(eng.s.phase, AdventurePhase.MAP);
  assert.equal(room.doorUnlocked, false);

  eng.s.currency.gold = 1;
  eng.enterCurrent();
  assert.equal(eng.s.phase, AdventurePhase.BLACKSMITH);
  assert.equal(room.doorUnlocked, true);
  assert.equal(eng.s.currency.gold, 0);
  assert.equal(room.blacksmithSlots.length, 3);

  eng.s.stage = 2;
  room.doorUnlocked = false;
  eng.s.currency.gold = 1;
  eng.s.phase = AdventurePhase.MAP;
  eng.enterCurrent();
  assert.equal(eng.s.phase, AdventurePhase.MAP);

  eng.s.currency.gold = 2;
  eng.enterCurrent();
  assert.equal(eng.s.phase, AdventurePhase.BLACKSMITH);
  assert.equal(eng.s.currency.gold, 0);

  eng.s.stage = 3;
  room.doorUnlocked = false;
  eng.s.currency.gold = 2;
  eng.s.phase = AdventurePhase.MAP;
  eng.enterCurrent();
  assert.equal(eng.s.phase, AdventurePhase.MAP);

  eng.s.currency.gold = 3;
  eng.enterCurrent();
  assert.equal(eng.s.phase, AdventurePhase.BLACKSMITH);
  assert.equal(eng.s.currency.gold, 0);

  room.blacksmithSlots = ['WisdomNecklace', null, null];
  eng.s.currency.addTokens({ shui: 2, ben: 1, cao: 1, wuneng: 1 });
  const buy = eng.buyBlacksmithSlot(0);
  assert.equal(buy.ok, true);
  assert.equal(eng.s.currency.tokens.shui, 0);
  assert.equal(eng.s.currency.tokens.wuneng, 0);
  assert.equal(eng.s.currency.tokens.ben, 0);
  assert.equal(eng.s.currency.tokens.cao, 0);
  assert.ok(eng.s.accessories.includes('WisdomNecklace'));
  assert.equal(room.blacksmithSlots[0], null);
});

test('blacksmith refresh costs 2 gold including empty slots', () => {
  const map = new AdventureMap([[0, 5]]);
  const eng = new AdventureEngine();
  eng.start(map, 'Ryan');
  eng.s.stage = 4;
  eng.s.currency.addGold(10);
  assert.ok(eng.move(0, 1));
  eng.enterCurrent();
  assert.equal(eng.s.currency.gold, 6);
  eng.currentRoom().blacksmithSlots = [null, 'FlameFist', null];
  const goldBefore = eng.s.currency.gold;
  const refresh = eng.refreshBlacksmithSlot(0);
  assert.equal(refresh.ok, true);
  assert.equal(eng.s.currency.gold, goldBefore - 2);
  assert.ok(eng.currentRoom().blacksmithSlots[0]);
  const refresh2 = eng.refreshBlacksmithSlot(2);
  assert.equal(refresh2.ok, true);
  assert.equal(eng.s.currency.gold, goldBefore - 4);
  assert.ok(eng.currentRoom().blacksmithSlots[2]);
});

test('shop sells accessories for 15 gold and can refresh accessory slot', () => {
  const eng = startEngine([[0, 4]]);
  eng.move(0, 1);
  eng.enterCurrent();
  eng.s.currency.addGold(50);
  eng.currentRoom().shopSlots[5] = 'FlameFist';
  const goldBefore = eng.s.currency.gold;

  eng.selectShopSlot(5);
  const buy = eng.buyShopSlot(5);
  assert.equal(buy.ok, true);
  assert.equal(eng.s.currency.gold, goldBefore - 15);
  assert.ok(eng.s.accessories.includes('FlameFist'));
  assert.equal(eng.currentRoom().shopSlots[5], null);

  eng.selectShopSlot(5);
  const refresh = eng.refreshShopSlot(5);
  assert.equal(refresh.ok, true);
  assert.equal(eng.s.currency.gold, goldBefore - 17);
  assert.equal(context.AdventureRegistry.getItem(eng.currentRoom().shopSlots[5]).kind, 'accessory');
});

test('shop and drop rolls are uniform over consumables only', () => {
  const eng = startEngine();
  const consumables = context.AdventureRegistry.allItems().filter(it => it.kind === 'consumable');
  assert.equal(consumables.length, 16);
  const names = new Set(consumables.map(it => it.name));
  const counts = Object.create(null);
  names.forEach(n => { counts[n] = 0; });

  const origRandom = Math.random;
  let i = 0;
  try {
    Math.random = () => {
      const r = (i % consumables.length) / consumables.length;
      i += 1;
      return r;
    };
    for (let n = 0; n < consumables.length; n++) {
      const name = eng._rollItemDrop();
      assert.ok(names.has(name));
      counts[name] += 1;
    }
  } finally {
    Math.random = origRandom;
  }
  names.forEach(n => assert.equal(counts[n], 1));
});

test('reward room door costs two random normal beasts and accepts wuneng wildcards', () => {
  const AC = context.AdventureCurrency;
  const eng = startEngine([[0, 3]]);
  const room = eng.s.map.get(0, 1);
  assert.equal(room.type, 'item');
  assert.ok(Array.isArray(room.doorCost));
  assert.equal(room.doorCost.length, 2);
  room.doorCost.forEach(t => assert.ok(AC.BEAST_TYPES.includes(t)));
  assert.equal(room.doorUnlocked, false);

  eng.move(0, 1);
  const blocked = eng.enterCurrent();
  assert.equal(blocked.ok, false);
  assert.equal(eng.s.phase, AdventurePhase.MAP);
  assert.equal(room.doorUnlocked, false);

  room.doorCost = ['ben', 'ben'];
  eng.s.currency.tokens.ben = 1;
  eng.s.currency.tokens.wuneng = 1;
  const opened = eng.enterCurrent();
  assert.equal(opened.ok, true);
  assert.equal(room.doorUnlocked, true);
  assert.equal(eng.s.currency.tokens.ben, 0);
  assert.equal(eng.s.currency.tokens.wuneng, 0);
  assert.equal(eng.s.phase, AdventurePhase.REWARD);
  assert.ok(eng.s.pendingRoomReward);

  eng.deferRoomReward();
  assert.ok(room.stashedLoot);
  assert.equal(eng.s.phase, AdventurePhase.MAP);
  const again = eng.enterCurrent();
  assert.equal(again.ok, true);
  assert.ok(eng.s.pendingRoomReward);
  assert.equal(eng.s.pendingRoomReward.kind, room.stashedLoot.kind);
});

test('reward room rolls weighted loot matching challenge pool', () => {
  const eng = startEngine();
  const origRandom = Math.random;
  try {
    Math.random = () => 0;
    let loot = eng._rollBonusRoomReward();
    assert.equal(loot.kind, 'gold');
    assert.equal(loot.gold, 6);

    Math.random = () => 2 / 12;
    loot = eng._rollBonusRoomReward();
    assert.equal(loot.gold, 12);

    Math.random = () => 3.5 / 12;
    loot = eng._rollBonusRoomReward();
    assert.equal(loot.kind, 'accessory');

    Math.random = () => 6.5 / 12;
    loot = eng._rollBonusRoomReward();
    assert.equal(loot.kind, 'items');
    assert.equal(loot.items.length, 2);

    Math.random = () => 10 / 12;
    loot = eng._rollBonusRoomReward();
    assert.equal(loot.kind, 'items');
    assert.equal(loot.items.length, 3);
  } finally {
    Math.random = origRandom;
  }
});

test('reward room stashed loot can be claimed or deferred', () => {
  const eng = startEngine([[0, 3]]);
  const room = eng.s.map.get(0, 1);
  room.doorUnlocked = true;
  room.stashedLoot = { kind: 'gold', gold: 12 };
  eng.move(0, 1);
  eng.enterCurrent();
  assert.equal(eng.s.pendingRoomReward.gold, 12);
  const goldBefore = eng.s.currency.gold;
  assert.equal(eng.claimRoomReward(), true);
  assert.equal(eng.s.currency.gold, goldBefore + 12);
  assert.equal(room.stashedLoot, null);

  room.stashedLoot = { kind: 'gold', gold: 6 };
  eng.enterCurrent();
  assert.equal(eng.deferRoomReward(), true);
  assert.equal(room.stashedLoot.gold, 6);
  eng.enterCurrent();
  assert.equal(eng.claimRoomReward(), true);
  assert.equal(room.stashedLoot, null);
});

test('challenge room skips basic combat reward and only rolls bonus', () => {
  const eng = startEngine([[0, 6]]);
  assert.ok(eng.move(0, 1));
  assert.equal(eng.currentRoom().type, 'challenge');
  eng.s.combat = { enemy: { name: 'CastleWolf' } };
  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    eng.onCombatEnd('win');
    assert.equal(eng.s.phase, AdventurePhase.COMBAT_SETTLE);
    assert.equal(eng.s.pendingCombatReward.stage, 'bonus');
    assert.equal(eng.s.pendingCombatReward.roomType, 'challenge');
    assert.equal(eng.s.pendingCombatReward.bonus.kind, 'gold');
    assert.equal(eng.s.pendingCombatReward.bonus.gold, 6);
    assert.equal(eng.s.pendingCombatReward.basic, undefined);
  } finally {
    Math.random = origRandom;
  }
});

test('challenge room bonus reward uses separate gold and item weights', () => {
  const eng = startEngine();
  const origRandom = Math.random;
  try {
    Math.random = () => 0; // 6 gold [0,1)/12
    let loot = eng._rollChallengeBonusReward();
    assert.equal(loot.kind, 'gold');
    assert.equal(loot.gold, 6);

    Math.random = () => 2 / 12; // 12 gold [1,3)/12
    loot = eng._rollChallengeBonusReward();
    assert.equal(loot.gold, 12);

    Math.random = () => 3.5 / 12; // 配饰 [3,5)/12
    loot = eng._rollChallengeBonusReward();
    assert.equal(loot.kind, 'accessory');
    assert.ok(loot.accessory);

    Math.random = () => 6.5 / 12; // 道具×2 [5,9)/12
    loot = eng._rollChallengeBonusReward();
    assert.equal(loot.kind, 'items');
    assert.equal(loot.items.length, 2);

    Math.random = () => 10 / 12; // 道具×3 [9,12)/12
    loot = eng._rollChallengeBonusReward();
    assert.equal(loot.kind, 'items');
    assert.equal(loot.items.length, 3);
  } finally {
    Math.random = origRandom;
  }
});

test('boss victory offers accessory reward and boss-exit stage after defer', () => {
  const eng = startEngine([[0, 2]]);
  enterBossCombat(eng);
  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    eng.onCombatEnd('win');
    assert.equal(eng.s.phase, AdventurePhase.COMBAT_SETTLE);
    assert.equal(eng.s.pendingCombatReward.stage, 'basic');
    assert.equal(eng.s.pendingCombatReward.roomType, 'boss');
    assert.equal(eng.s.pendingCombatReward.basic.kind, 'accessory');
    assert.ok(eng.s.pendingCombatReward.basic.accessory);
    assert.equal(eng.deferCombatReward(), true);
    assert.equal(eng.s.pendingCombatReward.stage, 'boss-exit');
    assert.ok(eng.currentRoom().stashedLoot);
    assert.equal(eng.s.phase, AdventurePhase.COMBAT_SETTLE);
  } finally {
    Math.random = origRandom;
  }
});

test('boss accessory claim moves to boss-exit without beast settlement', () => {
  const eng = startEngine([[0, 2]]);
  enterBossCombat(eng);
  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    eng.onCombatEnd('win');
    const name = eng.s.pendingCombatReward.basic.accessory;
    assert.equal(eng.claimCombatReward(), true);
    assert.ok(eng.s.accessories.includes(name));
    assert.equal(eng.s.pendingCombatReward.stage, 'boss-exit');
    assert.equal(eng.s.phase, AdventurePhase.COMBAT_SETTLE);
    eng.enterNextStage();
    assert.equal(eng.s.phase, AdventurePhase.CLEAR);
  } finally {
    Math.random = origRandom;
  }
});

test('boss reward snapshot preserves accessory name for settlement UI', () => {
  const eng = startEngine([[0, 2]]);
  enterBossCombat(eng);
  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    eng.onCombatEnd('win');
    const snap = eng.snapshot();
    assert.equal(snap.pendingCombatReward.basic.kind, 'accessory');
    assert.ok(snap.pendingCombatReward.basic.accessory);
    assert.equal(snap.pendingCombatReward.basic.accessory, eng.s.pendingCombatReward.basic.accessory);
  } finally {
    Math.random = origRandom;
  }
});

test('returnToMap exits boss-exit settlement to MAP phase', () => {
  const eng = startEngine([[0, 2]]);
  enterBossCombat(eng);
  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    eng.onCombatEnd('win');
    eng.claimCombatReward();
    assert.equal(eng.s.pendingCombatReward.stage, 'boss-exit');
    assert.equal(eng.returnToMap(), true);
    assert.equal(eng.s.phase, AdventurePhase.MAP);
    assert.equal(eng.s.pendingCombatReward, null);
  } finally {
    Math.random = origRandom;
  }
});

test('beast token cap is 8 by default and 12 with BeastBag', () => {
  const eng = startEngine();
  assert.equal(eng.s.currency.maxBeast, 8);
  assert.equal(context.AdventureCurrency.DEFAULT_MAX_BEAST_TOKENS, 8);
  assert.equal(context.AdventureCurrency.BOOSTED_MAX_BEAST_TOKENS, 12);
  assert.ok(eng.addItem('BeastBag'));
  assert.equal(eng.s.currency.maxBeast, 12);
  const bag = context.AdventureRegistry.getItem('BeastBag');
  assert.equal(bag.beastCap, 12);
  assert.ok(bag.icon.indexOf('beast_core_sack') >= 0);
});

test('reward rooms are not on a shortest start-to-boss path in CSV maps', () => {
  const mapsDir = path.join(gameRoot, 'adventure/maps');
  function parseCsv(text) {
    const rows = [];
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      rows.push(t.split(',').map(x => Number(String(x).trim())));
    }
    return rows;
  }
  function neighbors(grid, r, c) {
    const out = [];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < grid.length && cc < grid[0].length && grid[rr][cc] !== -1) out.push([rr, cc]);
    }
    return out;
  }
  function find(grid, code) {
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[0].length; c++) {
        if (grid[r][c] === code) return [r, c];
      }
    }
    return null;
  }
  function key(r, c) { return r + ',' + c; }
  function bfsDist(grid, start) {
    const dist = new Map([[key(start[0], start[1]), 0]]);
    const q = [start.slice()];
    while (q.length) {
      const [r, c] = q.shift();
      const d = dist.get(key(r, c));
      for (const [nr, nc] of neighbors(grid, r, c)) {
        const k = key(nr, nc);
        if (dist.has(k)) continue;
        dist.set(k, d + 1);
        q.push([nr, nc]);
      }
    }
    return dist;
  }
  function onSomeShortest(grid, start, boss, cell) {
    const fromS = bfsDist(grid, start);
    const fromB = bfsDist(grid, boss);
    const total = fromS.get(key(boss[0], boss[1]));
    const d1 = fromS.get(key(cell[0], cell[1]));
    const d2 = fromB.get(key(cell[0], cell[1]));
    return d1 != null && d2 != null && total != null && d1 + d2 === total;
  }

  for (const file of fs.readdirSync(mapsDir).filter(f => f.endsWith('.csv'))) {
    const grid = parseCsv(fs.readFileSync(path.join(mapsDir, file), 'utf8'));
    const start = find(grid, 0);
    const boss = find(grid, 2);
    const item = find(grid, 3);
    assert.ok(start && boss && item, file);
    assert.equal(onSomeShortest(grid, start, boss, item), false, file + ' reward on shortest path');
  }
});
