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

for (const relative of expand(['characters', 'ai', 'combat', 'adventure_content']).concat([
  'adventure/js/engine/loot.js'
])) {
  vm.runInContext(fs.readFileSync(path.join(gameRoot, relative), 'utf8'), context, { filename: relative });
}

const g = context.AdventureMonsterBridge.getAdventureNpcSkillDesc;
const card = (v) => ({ value: v, isNumberCard: true, isItemCard: false });

const cases = [
  ['ForestPiranha', 2, false, '流血'],
  ['ForestLeech', 5, false, '不可防御'],
  ['FrozenOceanSamoyed', 2, false, '手牌'],
  ['FrozenOceanSamoyed', 5, false, '弃掉'],
  ['FrozenOceanSeal', 3, true, '相同点'],
  ['ForestDendrobatidFrog', 5, false, '中毒'],
  ['CastleFox', 5, false, '手牌'],
  ['ForestPython', 2, false, '中毒'],
  ['ForestPython', 5, false, '先施加'],
  ['ForestPython', 0, false, '不可防御'],
  ['CastleGhost', 5, false, '正好剩1张'],
  ['ForestDryad', 0, true, '免疫所有伤害和debuff'],
  ['ForestPanda', 0, true, '即将被施加'],
  ['CastleFirefly', 5, true, '无防御效果'],
  ['CastleFirefly', 2, true, '道具'],
  ['FrozenWhale', 5, false, '所有其他角色']
];

test('adventure skill desc matches guide formulas', () => {
  for (const [name, v, def, needle] of cases) {
    const d = g(name, card(v), def, { stage: 1, playerHandSize: 0, attackerHandSize: 0 });
    assert.ok(d.includes(needle), name + ' ' + (def ? 'D' : 'A') + v + ' missing ' + needle + ': ' + d);
  }
});
