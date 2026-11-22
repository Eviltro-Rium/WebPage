(function () {
  CharacterRegistry.register({
    name: 'RedFlag',
    hp: 60,
    type: '战士',
    passive: '对手因[失温]实际弃牌时，抽1张牌',
    init() { return {}; },
    turnStart() {},
    attackEffectTiming: { 3: 'afterDamage' },

    onOpponentHypothermiaDiscard(eng, owner) {
      eng.emit('desc', 'RedFlag被动：对手因[失温]弃牌，抽1张牌');
      eng.draw(owner, 1, true);
    },

    judgeOpponentHand(eng, targetKey, index) {
      const card = eng.h[targetKey].splice(index, 1)[0];
      eng.s.pendingRedFlagJudgment = { card, targetKey };
      eng.emit('reveal', 'RedFlag 5牌：展示对手手牌', card,
        { who: targetKey, fromOwner: targetKey, from: 'hand', handIndex: index });
      return 3 + (card.isNumberCard ? Number(card.value) || 0 : 0);
    },

    effect(eng, v, card, attacker, target, owner, { draw }) {
      if (v === 0) return { d: 7 };
      if (v === 1) {
        draw(owner, 1, true);
        eng.hypothermia(target, 1);
        return { d: 0, skip: true };
      }
      if (v === 2) return { d: 4 };
      const targetKey = eng._who(target);
      if (v === 3) {
        const d = eng.h[targetKey].length;
        if (d < 4) eng.hypothermia(target, 1);
        return { d };
      }
      if (v === 4) return { d: 4, unblock: target.hypothermia > 0 };
      if (v === 5) {
        const index = window.FurryGame.OpponentHandPolicy.randomIndex(eng, eng.h[targetKey].length);
        return { d: index < 0 ? 3 : this.judgeOpponentHand(eng, targetKey, index) };
      }
      return { d: 0, skip: true };
    },

    damageAfterDefense(v, damage) {
      return v === 1 ? Math.max(0, damage - 2) : null;
    },

    defend(eng, name, v, d, card, defender, opponent, owner, color, { counter, heal, draw }) {
      if (v === 1) {
        const retaliate = opponent.hypothermia > 0;
        if (retaliate) counter(opponent, 2);
        return { remaining: Math.max(0, d - 2), desc: 'RedFlag 1牌：格挡2点' + (retaliate ? '，反击2点' : '') };
      }
      if (v === 2) {
        heal(defender, 1);
        eng.hypothermia(opponent, 1);
        draw(owner, 1, true);
        return { remaining: d, desc: 'RedFlag 2牌：恢复1点生命，施加[失温]并抽1张牌' };
      }
      if (v === 0) {
        counter(opponent, d);
        const target = eng._who(opponent);
        const hand = eng.h[target];
        const candidates = hand.map((_, index) => index);
        const indices = [];
        const count = Math.ceil(hand.length / 2);
        while (indices.length < count) {
          const random = window.FurryGame.OpponentHandPolicy.randomIndex(eng, candidates.length);
          indices.push(candidates.splice(random, 1)[0]);
        }
        indices.sort((a, b) => b - a);
        const discarded = indices.map(index => hand.splice(index, 1)[0]);
        eng.discardManyWithEvent(discarded, target, { handIndices: indices, desc: 'RedFlag 0牌：对手弃掉' + count + '张手牌' });
        return { remaining: d, desc: 'RedFlag 0牌：反击' + d + '点伤害' };
      }
      return { remaining: d, desc: '' };
    }
  });
})();
