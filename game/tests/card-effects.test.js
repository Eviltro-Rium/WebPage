const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Math, JSON });
context.window = context;
for (const relative of ['js/combat/protocol.js', 'js/combat/card_effects.js']) {
  const file = path.join(root, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

test('CardEffects resolves all public card families', () => {
  const { Card, CardEffects } = context.FurryGame;
  assert.equal(CardEffects.resolve(Card.item('PURPLE', 'magic')).id, 'purpleMagic');
  assert.equal(CardEffects.resolve(Card.item('GREEN', 'greenMagic')).id, 'greenMagic');
  assert.equal(CardEffects.resolve(Card.item('WHITE', 'potion')).id, 'potion');
  assert.equal(CardEffects.resolve(Card.number('red', 4)).id, 'number');
  const trophy = Card.item('WHITE', 'item', { trophyWhite: true, trophyEffect: 'burn' });
  assert.equal(CardEffects.resolve(trophy).id, 'trophyWhite');
  assert.equal(CardEffects.isItem(trophy), true);
  assert.equal(CardEffects.kind(Card.item('BLACK', 'purify')), 'purify');
});

test('CardEffects.apply routes generic effects through the engine boundary', () => {
  const { Card, CardEffects } = context.FurryGame;
  const player = { hp: 2, alive: true, burn: 0, bleed: 0, poison: 0 };
  const ai = { hp: 4, alive: true, guard: 0 };
  const calls = [];
  const engine = {
    s: { player, ai, isAdventure: false, attackTarget: 'ai' },
    h: { player: [], ai: [] },
    heal(who, amount) { calls.push(['heal', who, amount]); who.hp += amount; },
    clearDebuffs(who) { calls.push(['clearDebuffs', who]); },
    clearPositiveBuffs(who) { calls.push(['clearPositiveBuffs', who]); },
    draw(who, amount) { calls.push(['draw', who, amount]); },
    clean(who) { calls.push(['clean', who]); },
    emit(type, desc) { calls.push(['emit', type, desc]); },
    _shuffleDiscardIntoDeck(owner) { calls.push(['shuffle', owner]); },
    _isAdventureBoss() { return false; }
  };
  CardEffects.apply(engine, Card.item('GREEN', 'greenMagic'), { owner: player, target: ai, who: 'player' });
  CardEffects.apply(engine, Card.item('WHITE', 'drawTwo'), { owner: player, target: ai, who: 'player' });
  CardEffects.apply(engine, Card.item('BLACK', 'shuffle'), { owner: player, target: ai, who: 'player' });
  assert.deepEqual(calls.map(call => call[0]), ['heal', 'clearDebuffs', 'draw', 'shuffle', 'emit']);
  assert.equal(calls[2][2], 2);
});
