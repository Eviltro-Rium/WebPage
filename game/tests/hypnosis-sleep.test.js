const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({ console, Math, JSON, Date, setTimeout: () => 1, clearTimeout: () => {}, performance: { now: () => 0 } });
context.window = context;
const files = [
  'js/characters/registry.js', 'js/characters/ryan.js', 'js/characters/leon.js',
  'js/characters/chan.js', 'js/characters/saiki.js', 'js/characters/blaze.js',
  'js/characters/serenity.js', 'js/characters/moze.js', 'js/characters/knight.js',
  'js/characters/otto.js', 'js/characters/vixraps.js',
  'js/ai/registry.js', 'js/ai/knight_ai.js', 'js/ai/leon_ai.js', 'js/ai/ryan_ai.js',
  'js/ai/blaze_ai.js', 'js/ai/serenity_ai.js', 'js/ai/saiki_ai.js', 'js/ai/moze_ai.js',
  'js/ai/chan_ai.js', 'js/ai/otto_ai.js', 'js/ai/vixraps_ai.js',
  'js/combat/protocol.js', 'js/combat/runtime.js', 'js/combat/events.js',
  'js/combat/state.js', 'js/combat/deck.js', 'js/combat/piles.js',
  'js/combat/invariants.js', 'js/combat/status_registry.js', 'js/combat/status_service.js',
  'js/combat/status.js', 'js/combat/damage.js', 'js/combat/modes.js',
  'js/combat/deck_port.js', 'js/combat/turn_machine.js', 'js/combat/dice.js',
  'js/combat/card_effects.js', 'js/combat/engine.js', 'js/combat/engine_1v2.js',
  'js/combat/engine_1v2_adapter.js', 'js/combat/engine_turns.js', 'js/combat/engine_attack.js',
  'js/combat/engine_ai.js', 'js/combat/engine_snapshot.js', 'js/combat/engine_lord.js'
];
for (const relative of files) {
  const file = path.join(root, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { Engine } = context;

function number(value, color = 'RED') {
  return { value, color, uid: `c${Math.random()}`, isNumberCard: true };
}

test('applyHypnosis marks the target and a second application does not stack', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.applyHypnosis(eng.s.ai);
  assert.ok(eng.s.ai.hypnosis === true);
  eng.applyHypnosis(eng.s.ai);
  assert.ok(eng.s.ai.hypnosis === true);
});

test('sleeping characters are immune to hypnosis', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.s.ai.sleep = true;
  eng.applyHypnosis(eng.s.ai);
  assert.ok(eng.s.ai.sleep === true);
  assert.ok(!eng.s.ai.hypnosis);
});

test('AI hypnosis does not promote on the defense right after application', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.s.phase = 'AI_DEFEND';
  eng.s.pendingAttack = { damage: 3, unblock: false, isDrain: false };
  eng.applyHypnosis(eng.s.ai);
  eng.aiDefend(number(3), 3);
  assert.ok(eng.s.ai.hypnosis === true, 'hypnosis survives the first defense');
  assert.ok(!eng.s.ai.sleep, 'no promotion before the target finished its own attack turn');
  assert.ok(!eng.s.ai.hypnosisArmed);
});

test('AI hypnosis promotes on defense entry after its own attack turn ended', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.s.phase = 'AI_DEFEND';
  eng.s.pendingAttack = { damage: 3, unblock: false, isDrain: false };
  eng.applyHypnosis(eng.s.ai);
  // AI 完成自己的进攻回合结束、玩家回合开始（turnStart('player')）→ armed 置位
  eng.turnStart('player');
  assert.ok(eng.s.ai.hypnosisArmed === true);
  eng.aiDefend(number(3), 3);
  assert.ok(eng.s.ai.sleep === true, 'hypnosis must promote to sleep');
  assert.ok(!eng.s.ai.hypnosis, 'hypnosis is consumed by the promotion');
  assert.equal(eng.pendingSettlement && eng.pendingSettlement.damage, 3,
    'sleeping AI skips defense so the full damage is pending');
});

test('defend-0 hypnosis promotes on the next defense because the attack turn already ended', () => {
  const eng = new Engine();
  eng.start('Saiki', 'Vixraps');
  // AI 进攻玩家，玩家 Vixraps 防御 0 反击施加催眠给 AI（AI 攻击流程中）
  eng.applyHypnosis(eng.s.ai);
  eng.turnStart('player'); // AI 攻击回合结束 → 玩家回合开始 → armed 置位
  eng.s.phase = 'AI_DEFEND';
  eng.s.pendingAttack = { damage: 3, unblock: false, isDrain: false };
  eng.aiDefend(number(3), 3);
  assert.ok(eng.s.ai.sleep === true, 'defend-0 hypnosis promotes on the next defense');
});

test('sleep clears at the character turn start and heals 10 HP', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.s.ai.hp = 40;
  eng.s.ai.sleep = true;
  eng.turnStart('ai');
  assert.ok(!eng.s.ai.sleep);
  assert.equal(eng.s.ai.hp, 50); // 40 + 10
});

test('sleep heal is capped by max HP', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.s.ai.hp = eng.s.ai.maxHp - 5;
  eng.s.ai.sleep = true;
  eng.turnStart('ai');
  assert.ok(!eng.s.ai.sleep);
  assert.equal(eng.s.ai.hp, eng.s.ai.maxHp);
});

test('hypnosis survives the target turn start and only promotes on defense', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.applyHypnosis(eng.s.ai);
  eng.turnStart('ai');
  assert.ok(eng.s.ai.hypnosis === true, 'hypnosis is not cleared by turn start');
  assert.ok(!eng.s.ai.sleep, 'hypnosis does not promote outside defense');
  assert.ok(!eng.s.ai.hypnosisArmed, 'own turn start does not arm the own hypnosis');
});

test('player hypnosis promotes on defense entry and skips the defense phase', () => {
  const eng = new Engine();
  eng.start('Saiki', 'Vixraps');
  eng.s.phase = 'AI_TURN';
  eng.s.pendingAttack = { damage: 4, unblock: false, isDrain: false };
  eng.applyHypnosis(eng.s.player);
  eng._enterPlayerDefend(4, {});
  assert.ok(eng.s.player.hypnosis === true, 'no promotion on the first defense');
  assert.ok(!eng.s.player.sleep);
  // 玩家进攻回合结束（AI 回合开始）→ armed 置位 → 下次防御转化并跳过
  eng.turnStart('ai');
  assert.ok(eng.s.player.hypnosisArmed === true);
  eng.s.pendingAttack = { damage: 4, unblock: false, isDrain: false };
  const handled = eng._enterPlayerDefend(4, {});
  assert.equal(handled, true, 'sleeping player must not enter PLAYER_DEFEND');
  assert.ok(eng.s.player.sleep === true);
  assert.ok(!eng.s.player.hypnosis);
  assert.equal(eng.pendingSettlement && eng.pendingSettlement.damage, 4);
});

test('Vixraps attack 7 applies hypnosis and burn and scales damage with burn stacks', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.s.ai.burn = 1;
  const r = eng.effect('Vixraps', 7, number(7), eng.s.player, eng.s.ai);
  assert.ok(eng.s.ai.hypnosis === true);
  assert.equal(eng.s.ai.burn, 3);
  assert.equal(r.d, 6);
});

test('Vixraps attack 0 applies hypnosis to the main target only', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  const r = eng.effect('Vixraps', 0, number(0), eng.s.player, eng.s.ai);
  assert.ok(eng.s.ai.hypnosis === true);
  assert.equal(eng.s.ai.burn, 0, 'main target burn was settled twice');
  assert.ok(r.d === 0);
});

test('Vixraps defend 0 applies hypnosis to the attacker for the next defense', () => {
  const eng = new Engine();
  eng.start('Saiki', 'Vixraps');
  const m = context.CharacterRegistry.get('Vixraps');
  const r = m.defend(eng, 'Vixraps', 0, 5, number(0), eng.s.player, eng.s.ai, 'player', 'RED', {
    hurt: (x, n) => eng.hurt(x, n),
    heal: (x, n) => eng.heal(x, n),
    burn: (x, n) => eng.burn(x, n),
    counter: (x, n) => eng.hurt(x, n),
    cancelAttackDebuffs: () => {},
    clearDebuffs: x => eng.clearDebuffs(x),
    addGuard: (x, n) => eng.addGuard(x, n)
  });
  assert.ok(eng.s.ai.hypnosis === true, 'defend 0 applies hypnosis to the attacker');
  assert.ok(eng.s.ai.burn >= 1);
  assert.ok(r.remaining === 2, 'ceil(5/2)=2 damage still pending');
});

test('clearDebuffs removes hypnosis and sleep', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.applyHypnosis(eng.s.ai);
  eng.s.ai.sleep = true;
  eng.clearDebuffs(eng.s.ai);
  assert.ok(!eng.s.ai.hypnosis);
  assert.ok(!eng.s.ai.sleep);
});
test('end-to-end: AI hypnosis on player promotes after a full turn cycle', () => {
  const eng = new Engine();
  eng.start('Saiki', 'Vixraps');
  eng.turnStart('ai');
  eng.applyHypnosis(eng.s.player);
  assert.ok(eng.s.player.hypnosis === true);
  assert.ok(!eng.s.player.hypnosisArmed, 'armed false right after application');
  eng.s.phase = 'AI_TURN';
  eng.s.pendingAttack = { damage: 4, unblock: false, isDrain: false };
  eng._enterPlayerDefend(4, {});
  assert.ok(eng.s.player.hypnosis === true, 'hypnosis survives first defense');
  assert.ok(!eng.s.player.sleep, 'no sleep on first defense');
  eng.turnStart('player');
  assert.ok(!eng.s.player.hypnosisArmed, 'player armed not set on own turn start');
  eng.turnStart('ai');
  assert.ok(eng.s.player.hypnosisArmed === true, 'player armed on AI turn start');
  eng.s.phase = 'AI_TURN';
  eng.s.pendingAttack = { damage: 4, unblock: false, isDrain: false };
  const handled = eng._enterPlayerDefend(4, {});
  assert.ok(eng.s.player.sleep === true, 'hypnosis must promote to sleep');
  assert.ok(!eng.s.player.hypnosis, 'hypnosis consumed');
  assert.equal(handled, true, 'sleeping player skips defense');
});

test('end-to-end: AI Vixraps attack-7 effect applies hypnosis to player', () => {
  const eng = new Engine();
  eng.start('Saiki', 'Vixraps');
  eng.turnStart('ai');
  const r = eng.effect('Vixraps', 7, number(7), eng.s.ai, eng.s.player);
  assert.ok(eng.s.player.hypnosis === true, 'player has hypnosis after AI attack-7');
  assert.ok(!eng.s.player.hypnosisArmed, 'armed false right after application');
  eng.s.phase = 'AI_TURN';
  eng.s.pendingAttack = { damage: r.d, unblock: false, isDrain: false };
  eng._enterPlayerDefend(r.d, {});
  assert.ok(!eng.s.player.sleep, 'no sleep on first defense');
  eng.turnStart('player');
  eng.turnStart('ai');
  assert.ok(eng.s.player.hypnosisArmed === true, 'player armed after full turn cycle');
  eng.s.phase = 'AI_TURN';
  eng.s.pendingAttack = { damage: 4, unblock: false, isDrain: false };
  eng._enterPlayerDefend(4, {});
  assert.ok(eng.s.player.sleep === true, 'player hypnosis promotes to sleep');
});
test('1v1 normal attack path promotes player hypnosis to sleep', () => {
  const eng = new Engine();
  eng.start('Saiki', 'Vixraps');
  eng.applyHypnosis(eng.s.player);
  eng.s.player.hypnosisArmed = true;
  eng.h.ai = [number(3, 'RED')];
  eng.s.discardTop = number(1, 'RED');
  eng.s.aiTurnStarted = false;
  eng.s.phase = 'AI_TURN';
  eng.aiTurn();
  assert.ok(eng.s.player.sleep === true, 'player hypnosis promotes to sleep on normal attack');
  assert.ok(!eng.s.player.hypnosis, 'hypnosis consumed');
});
