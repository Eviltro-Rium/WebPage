'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { gameRoot, loadInto } = require('./_load');

const w = vm.createContext({ console, Math, Date, setTimeout, clearTimeout });
w.window = w;
loadInto(w, ['characters', 'ai', 'combat', 'adventure_content']);
for (const script of [
  'adventure/js/deck/adventure_deck.js',
  'adventure/js/deck/npc_strategy.js',
  'adventure/js/battle/battle_engine.js',
  'adventure/js/battle/adventure_battle_items.js',
  'online_game/online_match.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(gameRoot, script), 'utf8'), w, { filename: script });
}
const { Card } = w.FurryGame;
const number = (value, color = 'RED') => Card.number(color, value);
const redTop = () => number(2);

function matchFor(actor, value, defenderHand, defender = 'Leon') {
  const host = actor === 'host';
  const match = new w.OnlineMatchHost(host ? 'RedFlag' : defender, host ? defender : 'RedFlag', actor);
  const { engine } = match;
  engine.h[host ? 'player' : 'ai'] = [number(value)];
  engine.h[host ? 'ai' : 'player'] = defenderHand;
  engine.s.discardTop = redTop();
  return match;
}

function dispatch(match, actor, method, params) {
  const result = match.dispatch(actor, method, params);
  assert.equal(result.ok, true, result.error);
  return result;
}

function play(match, actor) {
  dispatch(match, actor, 'selectCard', { index: 0 });
  return dispatch(match, actor, 'doPlay');
}

for (const [attacker, defender] of [['host', 'guest'], ['guest', 'host']]) {
  test(`RedFlag 0 lets only the ${defender} defender replace or keep cards before defense`, () => {
    for (const replace of [false, true]) {
      const match = matchFor(attacker, 0, [number(1), number(4, 'GREEN')]);
      const { engine } = match;
      const handKey = defender === 'host' ? 'player' : 'ai';
      const hp = engine.s[handKey].hp;
      const oldIds = engine.h[handKey].map(card => card.uid);
      const started = play(match, attacker);
      assert.equal(started.state.phase, 'REDFLAG_REDRAW_CHOICE');
      assert.equal(started.state.onlineActor, defender);
      assert.equal(match.dispatch(attacker, 'chooseRedFlagRedraw', { replace }).ok, false);
      assert.equal(match.dispatch(defender, 'doSkipDefend').ok, false);
      const chosen = dispatch(match, defender, 'chooseRedFlagRedraw', { replace });
      assert.equal(chosen.state.phase, 'PLAYER_DEFEND');
      assert.equal(engine.h[handKey].length, oldIds.length);
      assert.equal(engine.h[handKey].some(card => oldIds.includes(card.uid)), !replace);
      assert.equal(match.dispatch(defender, 'chooseRedFlagRedraw', { replace }).ok, false);
      dispatch(match, defender, 'doSkipDefend');
      assert.equal(engine.s[handKey].hp, hp - 7);
    }
  });

  test(`RedFlag 5 keeps a displayed physical card until ${defender} finishes defending`, () => {
    const picked = number(4, 'BLUE');
    const match = matchFor(attacker, 5, [picked]);
    const { engine } = match;
    const key = defender === 'host' ? 'player' : 'ai';
    const hp = engine.s[key].hp;
    const result = play(match, attacker);
    assert.equal(result.state.phase, 'PLAYER_DEFEND');
    assert.equal(result.state.pendingAttack.damage, 7);
    assert.equal(result.state.revealCards[0].uid, picked.uid);
    assert.equal(engine.h[key].length, 0);
    assert.equal(engine.discardBottom.some(card => card.uid === picked.uid), false);
    const resolved = dispatch(match, defender, 'doSkipDefend');
    assert.equal(engine.s[key].hp, hp - 7);
    assert.equal(engine.discardBottom.filter(card => card.uid === picked.uid).length, 1);
    assert.equal(engine.s.pendingRedFlagJudgment, null);
    assert.ok(resolved.events.some(event => event.type === 'judgmentEnd'));
  });
}

test('RedFlag 3 uses pre-defense hand size and applies hypothermia after damage below four', () => {
  for (const size of [3, 4]) {
    const match = matchFor('host', 3, Array.from({ length: size }, () => number(2)));
    const { engine } = match;
    const hp = engine.s.ai.hp;
    assert.equal(play(match, 'host').state.pendingAttack.damage, size);
    assert.equal(engine.s.ai.hypothermia, 0);
    dispatch(match, 'guest', 'selectCard', { index: 0 });
    const result = dispatch(match, 'guest', 'doDefend');
    assert.equal(engine.s.ai.hp, hp - size);
    assert.equal(engine.s.ai.hypothermia, size < 4 ? 1 : 0);
    if (size < 4) {
      const hit = result.events.findIndex(event => event.hpAfter === hp - size);
      assert.ok(hit >= 0 && result.events.findIndex(event => event.kind === 'hypothermia') > hit,
        JSON.stringify(result.events));
    }
  }
});

test('RedFlag passive draws once per real hypothermia discard', () => {
  const engine = new w.Engine();
  engine.start('RedFlag', 'Leon');
  const start = engine.h.player.length;
  engine.hypothermia(engine.s.ai, 1);
  assert.equal(engine.h.player.length, start);
  engine.hypothermia(engine.s.ai, 1);
  assert.equal(engine.h.player.length, start + 1);
  engine.hypothermia(engine.s.ai, 1);
  assert.equal(engine.h.player.length, start + 2);
  engine.h.ai.length = 0;
  engine.hypothermia(engine.s.ai, 1);
  assert.equal(engine.h.player.length, start + 2);

  engine.start('Leon', 'RedFlag');
  engine.hypothermia(engine.s.player, 2);
  const before = engine.h.ai.length;
  assert.equal(engine.s.phase, 'PLAYER_DISCARD');
  engine.select(0);
  engine.confirmDiscard();
  assert.equal(engine.h.ai.length, before + 1);
});

test('RedFlag 5 Adventure lets the player select and discards to the NPC pile on settlement', () => {
  const engine = new w.AdventureBattleEngine();
  const picked = Card.item('BLUE', 'potion');
  engine.later = () => {};
  engine.startAdventure1v2({ player: 'RedFlag', opponent1: 'CastleWolf', opponent2: 'CastleWolf', stage: 1,
    playerPile: { deck: [], hand: [number(5)], discard: [], handLimit: 5 } });
  engine.h.ai2.splice(0, engine.h.ai2.length, picked, number(4, 'GREEN'));
  engine.s.discardTop = redTop();
  engine.s.lordPlayerTargetIdx = 1;
  engine.dispatch('selectCard', { index: 0 });
  engine.dispatch('doPlay');
  assert.equal(engine.s.phase, 'OPPONENT_CARD_CHOICE');
  assert.equal(engine.s.opponentHandTarget, 'ai2');
  engine.dispatch('chooseAICard', { index: 0 });
  engine.dispatch('doOpponentCardConfirm');
  assert.equal(engine.s.pendingAttack.damage, 3);
  assert.equal(engine.s.revealCards[0].uid, picked.uid);
  engine.dispatch('resolveAttackModChoice');
  engine.acknowledgeEvents(engine.ver);
  engine.acknowledgeEvents(engine.ver);
  assert.equal(engine.s.pendingRedFlagJudgment, null, JSON.stringify({
    phase: engine.s.phase, events: engine.events, defense: engine.s.pendingAIDefense,
    settlement: engine.pendingSettlement, bridge: engine.s.pendingAIBridge
  }));
  assert.equal(engine.piles.ai2.discard.filter(card => card.uid === picked.uid).length, 1);
  assert.equal(engine.piles.player.discard.some(card => card.uid === picked.uid), false);
});

test('RedFlag 1 draws and applies hypothermia without a defense phase', () => {
  const match = matchFor('host', 1, [number(1)]);
  const attack = play(match, 'host');
  assert.equal(attack.state.phase, 'PLAYER_PLAY');
  assert.equal(match.engine.s.ai.hypothermia, 1);
  assert.equal(match.engine.h.player.length, 1);
});

test('RedFlag 4 only bypasses defense against a target with hypothermia', () => {
  for (const hypothermia of [0, 1]) {
    const match = matchFor('host', 4, [number(1)]);
    const target = match.engine.s.ai;
    const hp = target.hp;
    target.hypothermia = hypothermia;
    const attack = play(match, 'host');
    assert.equal(attack.state.phase, hypothermia ? 'PLAYER_PLAY' : 'PLAYER_DEFEND');
    if (!hypothermia) dispatch(match, 'guest', 'doSkipDefend');
    assert.equal(target.hp, hp - 4);
  }
});

test('RedFlag defense 1 blocks 2 and only retaliates against hypothermia', () => {
  for (const hypothermia of [0, 1]) {
    const match = new w.OnlineMatchHost('Leon', 'RedFlag');
    const { engine } = match;
    engine.h.player = [number(2)];
    engine.h.ai = [number(1)];
    engine.s.discardTop = redTop();
    engine.s.player.hypothermia = hypothermia;
    const attack = play(match, 'host');
    const damage = attack.state.pendingAttack.damage;
    const attackerHp = engine.s.player.hp;
    const defenderHp = engine.s.ai.hp;
    dispatch(match, 'guest', 'selectCard', { index: 0 });
    dispatch(match, 'guest', 'doDefend');
    assert.equal(engine.s.ai.hp, defenderHp - Math.max(0, damage - 2));
    assert.equal(engine.s.player.hp, attackerHp - hypothermia * 2);
  }
});

test('RedFlag defense 2 heals, applies hypothermia and draws', () => {
  const match = new w.OnlineMatchHost('Leon', 'RedFlag');
  const { engine } = match;
  engine.h.player = [number(2)];
  engine.h.ai = [number(2)];
  engine.s.discardTop = redTop();
  engine.s.ai.hp -= 5;
  const hp = engine.s.ai.hp;
  const attack = play(match, 'host');
  dispatch(match, 'guest', 'selectCard', { index: 0 });
  dispatch(match, 'guest', 'doDefend');
  assert.equal(engine.s.ai.hp, hp + 1 - attack.state.pendingAttack.damage);
  assert.equal(engine.s.player.hypothermia, 1);
  assert.equal(engine.h.ai.length, 1);
});

test('RedFlag defense 0 counters the full attack and discards half the attacker hand rounded up', () => {
  const match = new w.OnlineMatchHost('Leon', 'RedFlag');
  const { engine } = match;
  engine.h.player = [number(2), number(4), number(5), number(1)];
  engine.h.ai = [number(0)];
  engine.s.discardTop = redTop();
  const hp = [engine.s.player.hp, engine.s.ai.hp];
  const attack = play(match, 'host');
  const damage = attack.state.pendingAttack.damage;
  dispatch(match, 'guest', 'selectCard', { index: 0 });
  dispatch(match, 'guest', 'doDefend');
  assert.equal(engine.h.player.length, 1);
  assert.equal(engine.s.player.hp, hp[0] - damage);
  assert.equal(engine.s.ai.hp, hp[1] - damage);
});

test('RedFlag draws after the online defender confirms a threshold discard', () => {
  const match = matchFor('host', 3, [number(1), number(4, 'GREEN')]);
  const { engine } = match;
  engine.s.ai.hypothermia = 1;
  play(match, 'host');
  const skipped = dispatch(match, 'guest', 'doSkipDefend');
  assert.equal(skipped.state.phase, 'PLAYER_DISCARD');
  assert.equal(skipped.state.onlineActor, 'guest');
  assert.equal(engine.h.player.length, 0);
  dispatch(match, 'guest', 'selectCard', { index: 1 });
  const discarded = dispatch(match, 'guest', 'doConfirmDiscard');
  assert.equal(engine.h.player.length, 1);
  assert.equal(discarded.state.phase, 'PLAYER_PLAY');
  assert.equal(discarded.state.onlineActor, 'host');
});

test('online snapshots resume the RedFlag redraw choice and preserve a held judgment card', () => {
  for (const value of [0, 5]) {
    const match = matchFor('host', value, [number(4, 'GREEN')]);
    play(match, 'host');
    const restored = new w.OnlineMatchHost('RedFlag', 'Leon');
    restored.restoreSnapshot(match.captureSnapshot());
    const state = restored.project('guest');
    assert.equal(state.protocolVersion, 3);
    assert.equal(state.onlineCanAct, true);
    if (value === 0) {
      assert.equal(state.phase, 'REDFLAG_REDRAW_CHOICE');
      dispatch(restored, 'guest', 'chooseRedFlagRedraw', { replace: false });
    } else {
      assert.equal(state.revealCards.length, 1);
      assert.equal(restored.engine.discardBottom.some(card => card.uid === state.revealCards[0].uid), false);
    }
    dispatch(restored, 'guest', 'doSkipDefend');
    if (value === 5) {
      assert.equal(restored.engine.discardBottom.filter(card => card.uid === state.revealCards[0].uid).length, 1);
    }
  }
});
