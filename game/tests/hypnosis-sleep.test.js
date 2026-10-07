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

test('AI hypnosis promotes when its attack phase ends', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.s.phase = 'AI_DEFEND';
  eng.s.pendingAttack = { damage: 3, unblock: false, isDrain: false };
  eng.applyHypnosis(eng.s.ai);
  // AI 完成自己的进攻回合，玩家回合开始时立即转化。
  eng.s.pendingHypnosisPromote = 'ai';
  eng.turnStart('player');
  assert.ok(eng.s.ai.sleep === true, 'hypnosis must promote at the phase transition');
  assert.ok(!eng.s.ai.hypnosis);
  eng.aiDefend(number(3), 3);
  assert.ok(!eng.s.ai.hypnosis, 'hypnosis is consumed by the promotion');
  assert.equal(eng.pendingSettlement && eng.pendingSettlement.damage, 3,
    'sleeping AI skips defense so the full damage is pending');
});

test('defend-0 hypnosis promotes when the attack turn ends', () => {
  const eng = new Engine();
  eng.start('Saiki', 'Vixraps');
  // AI 进攻玩家，玩家 Vixraps 防御 0 反击施加催眠给 AI（AI 攻击流程中）
  eng.applyHypnosis(eng.s.ai);
  eng.s.pendingHypnosisPromote = 'ai';
  eng.turnStart('player'); // AI 攻击回合结束 → 玩家回合开始 → 立即转化
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

test('hypnosis survives the target own turn start', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.applyHypnosis(eng.s.ai);
  eng.turnStart('ai');
  assert.ok(eng.s.ai.hypnosis === true, 'hypnosis is not cleared by turn start');
  assert.ok(!eng.s.ai.sleep, 'hypnosis does not promote during its own turn start');
  assert.ok(!eng.s.ai.hypnosisArmed, 'own turn start does not arm the own hypnosis');
});

test('player hypnosis promotes when AI attack phase starts and skips defense', () => {
  const eng = new Engine();
  eng.start('Saiki', 'Vixraps');
  eng.s.phase = 'AI_TURN';
  eng.s.pendingAttack = { damage: 4, unblock: false, isDrain: false };
  eng.applyHypnosis(eng.s.player);
  eng._enterPlayerDefend(4, {});
  assert.ok(eng.s.player.hypnosis === true, 'no promotion on the first defense');
  assert.ok(!eng.s.player.sleep);
  // 玩家进攻回合结束（AI 回合开始）→ 立即转化并跳过下一次防御
  eng.s.pendingHypnosisPromote = 'player';
  eng.turnStart('ai');
  assert.ok(eng.s.player.sleep === true);
  eng.s.pendingAttack = { damage: 4, unblock: false, isDrain: false };
  const handled = eng._enterPlayerDefend(4, {});
  assert.equal(handled, true, 'sleeping player must not enter PLAYER_DEFEND');
  assert.ok(eng.s.player.sleep === true);
  assert.ok(!eng.s.player.hypnosis);
  assert.equal(eng.pendingSettlement && eng.pendingSettlement.damage, 4);
});

test('Vixraps attack 2 opens the ordinary purify dialog before defense', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.s.player.burn = 1;
  eng.h.player = [number(2, 'RED')];
  eng.s.selectedCard = 0;
  eng.s.discardTop = number(1, 'RED');
  const result = eng.play();
  assert.equal(result.pendingDialog, 'purify');
  assert.ok(eng.s.pendingVixrapsPurify);
  eng.choosePurify({ done: true });
  assert.equal(eng.s.pendingVixrapsPurify, null);
  assert.equal(eng.s.pendingDialog, null);
  assert.equal(eng.s.phase, 'AI_DEFEND');
});

test('Vixraps attack 7 applies hypnosis and burn and scales damage with burn stacks', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.s.ai.burn = 1;
  const r = eng.effect('Vixraps', 7, number(7), eng.s.player, eng.s.ai);
  assert.ok(!eng.s.ai.hypnosis);
  assert.equal(eng.s.ai.burn, 1);
  assert.equal(r.d, 6);
  eng.s.atkOwner='player'; eng.s.atkCard=number(7); eng.s.pendingAttack={damage:r.d};
  assert.equal(eng.prepareAttackSettlement(r.d,'ai'),6);
  assert.ok(eng.s.ai.hypnosis === true);
  assert.equal(eng.s.ai.burn,3);
});

test('Vixraps attack 0 applies hypnosis to the main target only', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  const r = eng.effect('Vixraps', 0, number(0), eng.s.player, eng.s.ai);
  assert.ok(eng.s.ai.hypnosis === true);
  assert.equal(eng.s.ai.burn, 0, 'main target burn was settled twice');
  assert.ok(r.d === 0);
});

test('Vixraps attack 6 applies burn, heals by stacks and deals equal damage', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.s.ai.burn = 2;
  eng.s.player.hp = 50;
  const r = eng.effect('Vixraps', 6, number(6), eng.s.player, eng.s.ai);
  assert.equal(r.d, 3, 'damage equals burn stacks including the new layer');
  assert.equal(eng.s.player.hp, 53, 'Vixraps heals by opponent burn stacks');
  assert.equal(eng.s.pendingVixrapsBurnSettle, null, 'no deferred settlement anymore');
  assert.equal(eng.s.ai.burn, 2, 'burn queues until damage settlement');
  const recovery = [...eng.events].reverse().find(event => event.type === 'heal');
  assert.equal(recovery && recovery.kind, 'heal', 'Vixraps 6 uses ordinary recovery floating text');
  eng.s.atkOwner = 'player'; eng.s.atkCard = number(6); eng.s.pendingAttack = { damage: r.d };
  assert.equal(eng.prepareAttackSettlement(r.d, 'ai'), 3);
  eng.settlePreparedHit(eng.s.player, eng.s.ai, { damage: 3, bleed: 0 });
  assert.equal(eng.s.ai.burn, 3, 'queued burn layer commits at settlement');
});

test('Vixraps attack 6 with no prior burn still hits for 1', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.s.player.hp = 50;
  const r = eng.effect('Vixraps', 6, number(6), eng.s.player, eng.s.ai);
  assert.equal(r.d, 1);
  assert.equal(eng.s.player.hp, 51);
  eng.s.atkOwner = 'player'; eng.s.atkCard = number(6); eng.s.pendingAttack = { damage: r.d };
  assert.equal(eng.prepareAttackSettlement(r.d, 'ai'), 1);
  eng.settlePreparedHit(eng.s.player, eng.s.ai, { damage: 1, bleed: 0 });
  assert.equal(eng.s.ai.burn, 1);
});

test('Vixraps attack 5 doubles burn after defense without pre-defense feedback', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.s.ai.burn = 2;
  eng.h.player = [number(5, 'RED')];
  eng.s.discardTop = number(5, 'RED');
  eng.s.phase = 'PLAYER_PLAY';
  eng.s.busy = false;
  eng.s.selectedCard = 0;
  eng.later = () => {};
  eng.play();
  assert.equal(eng.s.ai.burn, 2, 'status waits for defense to finish');
  eng.prepareAttackSettlement(5, 'ai');
  assert.equal(eng.s.ai.burn, 2, 'damage-first effect waits for HP settlement');
  eng.settlePreparedHit(eng.s.player, eng.s.ai, {damage:5,bleed:0});
  assert.equal(eng.s.ai.burn, 4);
  assert.ok(!eng.s.pendingBuffRestore, 'no old deferred restore remains');
  assert.equal(eng.s.phase, 'AI_DEFEND');
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
  assert.ok(r.remaining === 5, 'defend 0 no longer blocks: full damage pending');
});

test('wake emits one ordinary heal event', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.s.ai.hp = 40;
  eng.s.ai.sleep = true;
  eng.turnStart('ai');
  const wakes = eng.events.filter(event => event.type === 'heal' && (event.kind === 'wake' || event.kind === 'heal'));
  assert.equal(wakes.length, 1);
  assert.match(wakes[0].desc, /\+10/);
});

test('clearDebuffs removes hypnosis and sleep', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  eng.applyHypnosis(eng.s.ai);
  eng.s.ai.sleep = true;
  eng.s.ai.hypnosisArmed = true;
  eng.clearDebuffs(eng.s.ai);
  assert.ok(!eng.s.ai.hypnosis);
  assert.ok(!eng.s.ai.hypnosisArmed, 'clearing hypnosis also clears its phase marker');
  assert.ok(!eng.s.ai.sleep);
});
test('end-to-end: AI hypnosis on player promotes at the attack-phase transition', () => {
  const eng = new Engine();
  eng.start('Saiki', 'Vixraps');
  eng.s.pendingHypnosisPromote = 'player';
  eng.turnStart('ai');
  eng.applyHypnosis(eng.s.player);
  assert.ok(eng.s.player.hypnosis === true);
  assert.ok(!eng.s.player.hypnosisArmed, 'armed false right after application');
  eng.s.phase = 'AI_TURN';
  eng.s.pendingAttack = { damage: 4, unblock: false, isDrain: false };
  eng._enterPlayerDefend(4, {});
  assert.ok(eng.s.player.hypnosis === true, 'hypnosis survives first defense');
  assert.ok(!eng.s.player.sleep, 'no sleep on first defense');
  eng.s.pendingHypnosisPromote = 'ai';
  eng.turnStart('player');
  assert.ok(!eng.s.player.hypnosisArmed, 'legacy phase marker remains clear');
  eng.s.pendingHypnosisPromote = 'player';
  eng.turnStart('ai');
  assert.ok(eng.s.player.sleep === true, 'player sleeps when AI attack phase starts');
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
  eng.s.pendingHypnosisPromote = 'player';
  eng.turnStart('ai');
  const r = eng.effect('Vixraps', 7, number(7), eng.s.ai, eng.s.player);
  assert.ok(!eng.s.player.hypnosis, 'hypnosis waits for defense');
  eng.s.atkOwner='ai'; eng.s.pendingAttack={damage:r.d};
  eng.prepareAttackSettlement(r.d, 'player');
  assert.ok(eng.s.player.hypnosis === true, 'hypnosis applies after defense');
  assert.ok(!eng.s.player.hypnosisArmed, 'armed false right after application');
  eng.s.phase = 'AI_TURN';
  eng.s.pendingAttack = { damage: r.d, unblock: false, isDrain: false };
  eng._enterPlayerDefend(r.d, {});
  assert.ok(!eng.s.player.sleep, 'no sleep on first defense');
  eng.s.pendingHypnosisPromote = 'ai';
  eng.turnStart('player');
  eng.s.pendingHypnosisPromote = 'player';
  eng.turnStart('ai');
  assert.ok(eng.s.player.sleep === true, 'player sleeps before the next defense');
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
  eng.s.pendingHypnosisPromote = 'player';
  eng.aiTurn();
  assert.ok(eng.s.player.sleep === true, 'player hypnosis promotes to sleep on normal attack');
  assert.ok(!eng.s.player.hypnosis, 'hypnosis consumed');
});

test('1v2: AI2 hypnosis does not promote when AI1 turn starts', () => {
  const eng = new Engine();
  eng.start1v2('Vixraps', 'Saiki', 'Ryan');
  eng.applyHypnosis(eng.s.ai2);
  eng.s.pendingHypnosisPromote = 'player';
  eng.turnStart('ai');
  assert.ok(eng.s.ai2.hypnosis === true, 'AI2 hypnosis survives AI1 turn start');
  assert.ok(!eng.s.ai2.sleep, 'AI2 must not sleep when AI1 starts');
});

test('1v2: AI2 hypnosis promotes after AI2 attack ends, wakes on next own turn', () => {
  const eng = new Engine();
  eng.start1v2('Vixraps', 'Saiki', 'Leon');
  eng.applyHypnosis(eng.s.ai2);
  eng.s.pendingHypnosisPromote = 'player';
  eng.turnStart('ai');
  assert.ok(eng.s.ai2.hypnosis === true);
  eng.s.pendingHypnosisPromote = 'ai';
  eng.turnStart('ai2');
  assert.ok(eng.s.ai2.hypnosis === true, 'AI2 still hypnotized at own attack start');
  assert.ok(!eng.s.ai2.sleep);
  eng.s.ai2.hp = 40;
  eng.s.pendingHypnosisPromote = 'ai2';
  eng.turnStart('player');
  assert.ok(eng.s.ai2.sleep === true, 'AI2 sleeps when its attack phase ends');
  assert.ok(!eng.s.ai2.hypnosis);
  eng.s.ai2.lush = 0;
  eng.s.ai2.parasite = 0;
  eng.s.pendingHypnosisPromote = 'player';
  eng.turnStart('ai2');
  assert.ok(!eng.s.ai2.sleep, 'AI2 wakes at its next attack turn start');
  assert.equal(eng.s.ai2.hp, 50);
});

test('Vixraps passive forces exactly one discard before the next bridge', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  const black = context.FurryGame.Card.item('BLACK', 'drawTwo');
  const keep = number(2, 'RED');
  eng.h.player = [black, keep];
  eng.s.player.hp = 50;
  eng.s.selectedCard = 0;
  eng.s.discardTop = number(1, 'RED');

  eng.play();
  let state = eng.dispatch('chooseColor', { color: 'RED' });
  assert.equal(state.phase, 'PLAYER_DISCARD');
  assert.ok(state.pendingVixrapsPassive);
  assert.equal(eng.s.player.hp, 50);
  assert.throws(() => eng.confirmDiscard(), /请选择要弃掉的牌/);
  eng.s.selectedCards = [0];
  state = eng.confirmDiscard();
  assert.equal(state.phase, 'PLAYER_PLAY');
  assert.equal(state.pendingVixrapsPassive, null);
  assert.equal(eng.s.player.hp, 52);
  assert.equal(eng.s.ai.burn, 1);
  assert.equal(eng.h.player.length, 2, 'drawTwo resolves before the passive discard');
});

test('Vixraps passive heals immediately when a black card leaves no hand', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  const black = context.FurryGame.Card.item('BLACK', 'black');
  eng.h.player = [black];
  eng.s.player.hp = 50;
  eng.s.selectedCard = 0;
  eng.s.discardTop = number(1, 'RED');
  eng.play();
  const state = eng.dispatch('chooseColor', { color: 'RED' });
  assert.equal(state.phase, 'PLAYER_PLAY');
  assert.equal(state.pendingVixrapsPassive, null);
  assert.equal(eng.s.player.hp, 52);
  assert.equal(eng.s.ai.burn, 1);
});

test('Vixraps passive waits for a black purify dialog before forcing discard', () => {
  const eng = new Engine();
  eng.start('Vixraps', 'Saiki');
  const blackPurify = context.FurryGame.Card.item('BLACK', 'purify');
  const follow = number(2, 'RED');
  eng.h.player = [blackPurify, follow];
  eng.s.player.burn = 1;
  eng.s.player.hp = 50;
  eng.s.selectedCard = 0;
  eng.s.discardTop = number(1, 'RED');
  eng.play();
  let state = eng.dispatch('chooseColor', { color: 'RED' });
  assert.equal(state.pendingDialog, 'purify');
  assert.ok(state.pendingVixrapsPassive);
  state = eng.choosePurify({ done: true });
  assert.equal(state.phase, 'PLAYER_DISCARD');
  assert.ok(state.pendingVixrapsPassive);
  eng.s.selectedCards = [0];
  state = eng.confirmDiscard();
  assert.equal(state.phase, 'PLAYER_PLAY');
  assert.equal(eng.s.player.hp, 52);
  assert.equal(eng.s.ai.burn, 1);
});
function setupAttack(eng, name, value, defender='ai') {
  const attacker = defender==='player' ? 'ai' : 'player';
  eng.s.atkOwner=attacker; eng.s.atkCard=number(value); eng.s.defCard=null;
  const r=eng.effect(name,value,eng.s.atkCard,eng.s[attacker],eng.s[defender]);
  eng.s.pendingAttack={damage:r.d,isDrain:!!r.isDrain};
  return r;
}
test('settlement re-reads capped burn after defense cleansing and commits only once', () => {
  const eng=new Engine();eng.start('Vixraps','Ryan');eng.s.ai.burn=5;
  const r=setupAttack(eng,'Vixraps',7);
  assert.equal(eng.s.ai.burn,5);assert.ok(!eng.s.ai.hypnosis);
  eng.clearDebuffs(eng.s.ai);
  const damage=eng.prepareAttackSettlement(r.d,'ai');
  assert.equal(eng.s.ai.burn,2);assert.equal(damage,4);assert.ok(eng.s.ai.hypnosis);
  eng.prepareAttackSettlement(damage,'ai');assert.equal(eng.s.ai.burn,2);
});
test('full immunity cancels delayed attack effects', () => {
  const eng=new Engine();eng.start('Vixraps','Ryan');setupAttack(eng,'Vixraps',7);
  eng.cancelAttackDebuffs('ai');eng.s.defCard=number(0);eng.s.defOwner='ai';
  assert.equal(eng.prepareAttackSettlement(0,'ai'),0);
  assert.equal(eng.s.ai.burn,0);assert.ok(!eng.s.ai.hypnosis);
});
test('half defense is recalculated without repeating guard gain', () => {
  const eng=new Engine();eng.start('Vixraps','Moze');eng.s.ai.burn=3;
  const r=setupAttack(eng,'Vixraps',7);
  eng.s.defCard=number(1);eng.s.defOwner='ai';eng.addGuard(eng.s.ai,1);eng.clearDebuffs(eng.s.ai);
  assert.equal(eng.prepareAttackSettlement(Math.floor(r.d/2),'ai'),2);assert.equal(eng.s.ai.guard,1);
});
test('state damage keeps attack modifiers and doubling uses post-defense stacks', () => {
  const eng=new Engine();eng.start('Leon','Ryan');const r=setupAttack(eng,'Leon',5);
  eng.s.pendingAttack.damage+=3;eng.burn(eng.s.ai,1);
  assert.equal(eng.prepareAttackSettlement(r.d+3,'ai'),9);
  const second=new Engine();second.start('Vixraps','Blaze');setupAttack(second,'Vixraps',5);second.burn(second.s.ai,1);
  const remaining=second.prepareAttackSettlement(5,'ai');assert.equal(second.s.ai.burn,1);
  second.settlePreparedHit(second.s.player,second.s.ai,{damage:remaining,bleed:0});assert.equal(second.s.ai.burn,2);
});
test('manual guard reduces life steal only once', () => {
  const eng=new Engine();eng.start('Ryan','Otto');eng.s.player.guard=3;eng.s.ai.hp=50;
  eng.s.pendingAttack={damage:5,isDrain:true};eng.s.atkOwner='ai';eng.s.atkCard=number(4);
  eng.askGuard(5);eng.chooseGuard(1);assert.equal(eng.s.player.guard,2);
  eng.acknowledgeEvents(eng.ver);
  assert.equal(eng.s.player.guard,2);assert.equal(eng.s.player.hp,66);assert.equal(eng.s.ai.hp,54);
});
test('queued effects survive refresh snapshots', () => {
  const eng=new Engine();eng.start('Vixraps','Ryan');const r=setupAttack(eng,'Vixraps',7);
  const restored=new Engine();restored.restoreCombatSnapshot(eng.combatSnapshot());
  assert.equal(restored.prepareAttackSettlement(r.d,'ai'),4);assert.equal(restored.s.ai.burn,2);assert.ok(restored.s.ai.hypnosis);
});
test('HP events carry the values needed for sequential animations', () => {
  const eng=new Engine();eng.start('Ryan','Leon');eng.events=[];eng.hurt(eng.s.ai,3);eng.heal(eng.s.ai,2);
  const hit=eng.events.find(e=>e.type==='hit'), heal=eng.events.find(e=>e.type==='heal');
  assert.equal(hit.hpBefore,90);assert.equal(hit.hpAfter,87);assert.equal(heal.hpBefore,87);assert.equal(heal.hpAfter,89);
});

test('status-only hypothermia commits its forced discard once', () => {
  const eng=new Engine();eng.start('Ryan','Leon');eng.s.ai.hypothermia=1;eng.h.ai=[number(2),number(3)];
  eng.captureAttackSkill(()=>{eng.hypothermia(eng.s.ai,1);return {d:0};},'Ryan',4,eng.s.player,eng.s.ai);
  assert.equal(eng.h.ai.length,1);assert.equal(eng.s.ai.hypothermia,1);
});
test('post-defense group cleanse removes newly gained positive buffs', () => {
  const eng=new Engine();eng.start('Ryan','Moze');eng.s.ai.guard=2;
  eng.captureAttackSkill(()=>{eng.clearPositiveBuffs(eng.s.ai);return {d:4};},'Ryan',3,eng.s.player,eng.s.ai);
  eng.s.pendingAttack={damage:4};assert.equal(eng.s.ai.guard,2);eng.addGuard(eng.s.ai,1);
  eng.prepareAttackSettlement(4,'ai');assert.equal(eng.s.ai.guard,0);
});
test('damage modifiers multiply the live formula and a failed roulette stays zero', () => {
  const eng=new Engine();eng.start('Leon','Ryan');const r=setupAttack(eng,'Leon',5);
  eng.s.pendingAttack.damage=r.d*2;eng.s.pendingAttack.damageMultiplier=2;eng.burn(eng.s.ai,1);
  assert.equal(eng.prepareAttackSettlement(r.d*2,'ai'),12);
  const missed=new Engine();missed.start('Leon','Ryan');setupAttack(missed,'Leon',5);
  missed.s.pendingAttack.damage=0;missed.s.pendingAttack.damageMultiplier=0;missed.burn(missed.s.ai,1);
  assert.equal(missed.prepareAttackSettlement(0,'ai'),0);
});
test('guard blocks the main hit but does not erase existing defense bleed', () => {
  const eng=new Engine();eng.start('Ryan','Otto');eng.s.player.bleed=2;eng.s.player.guard=5;
  eng.s.atkOwner='ai';eng.s.atkCard=number(3);eng.s.defCard=number(1);eng.s.defOwner='player';eng.s.pendingAttack={damage:2};
  eng.askGuard(2,2);eng.chooseGuard(2);eng.acknowledgeEvents(eng.ver);
  assert.equal(eng.s.player.hp,68);assert.equal(eng.s.player.bleed,1);
});

test('attack resource consumption stays committed before defense', () => {
  const eng=new Engine();eng.start('Knight','Ryan');eng.s.player.chaos_red=true;eng.s.player.chaos_blue=true;
  const r=setupAttack(eng,'Knight',7);assert.equal(r.d,8);assert.ok(!eng.s.player.chaos_red);assert.ok(!eng.s.player.chaos_blue);
  eng.prepareAttackSettlement(r.d,'ai');assert.ok(!eng.s.player.chaos_red);
});


test('1v2: Vixraps attack 0 adds burn only to the selected target', () => {
  for (const targetKey of ['ai', 'ai2']) {
    const eng = new Engine();
    eng.start1v2('Vixraps', 'Saiki', 'Ryan');
    eng.s.attackTarget = targetKey;
    const otherKey = targetKey === 'ai' ? 'ai2' : 'ai';
    const target = eng.s[targetKey], other = eng.s[otherKey];
    target.burn = other.burn = 0;
    const targetHp = target.hp, otherHp = other.hp, playerHp = eng.s.player.hp;
    const result = eng.effect('Vixraps', 0, number(0), eng.s.player, target);
    assert.equal(result.d, 0);
    assert.equal(target.hypnosis, true);
    assert.equal(!!other.hypnosis, false);
    assert.equal(target.hp, targetHp - 3, 'target settles its newly applied 2 burn twice');
    assert.equal(other.hp, otherHp, 'unselected enemy has no new burn or damage');
    assert.equal(other.burn, 0);
    assert.equal(eng.s.player.hp, playerHp);
  }
});

test('1v2: Vixraps attack 0 still settles existing burn on all opponents', () => {
  const eng = new Engine();
  eng.start1v2('Vixraps', 'Saiki', 'Ryan');
  eng.s.attackTarget = 'ai2';
  eng.s.ai.burn = 3;
  eng.s.ai2.burn = 0;
  const hp = eng.s.ai.hp;
  eng.effect('Vixraps', 0, number(0), eng.s.player, eng.s.ai2);
  assert.equal(eng.s.ai.burn, 1, 'existing burn settles twice without gaining new stacks');
  assert.equal(eng.s.ai.hp, hp - 5);
  assert.equal(!!eng.s.ai.hypnosis, false);
});
