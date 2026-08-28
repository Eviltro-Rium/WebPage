/**
 * 冒险模式 NPC（怪物/Boss）出牌策略
 *
 * 进攻优先级：魔法牌 → 数字牌降序。由于 NPC 牌库全为白牌（总是合法），
 * 进攻时会把所有手牌打完（魔法牌搭桥后继续出）。
 *
 * 防御可用牌由主引擎根据怪物技能判定；本策略保留魔法牌优先、数字牌降序的通用顺序。
 */
(function () {
  const NpcStrategy = {
    chooseAttack(hand) {
      const magicRank = card => card && (card.magic || card.magicColor === 'purple' ? 2 : (card.greenMagic || card.magicColor === 'green' ? 1 : 0));
      for (let rank = 2; rank >= 1; rank--) {
        for (let i = 0; i < hand.length; i++) if (magicRank(hand[i]) === rank) return i;
      }
      let best = -1, bestVal = -1;
      for (let i = 0; i < hand.length; i++) {
        if (hand[i].isNumberCard && hand[i].value > bestVal) { bestVal = hand[i].value; best = i; }
      }
      return best;
    },

    chooseDefend(hand) {
      const magicRank = card => card && (card.magic || card.magicColor === 'purple' ? 2 : (card.greenMagic || card.magicColor === 'green' ? 1 : 0));
      for (let rank = 2; rank >= 1; rank--) {
        for (let i = 0; i < hand.length; i++) if (magicRank(hand[i]) === rank) return i;
      }
      let best = -1, bestVal = -1;
      for (let i = 0; i < hand.length; i++) {
        if (hand[i].isNumberCard && hand[i].value >= 1 && hand[i].value <= 3 && hand[i].value > bestVal) {
          bestVal = hand[i].value; best = i;
        }
      }
      return best;
    },

    isDefendLegal(card) {
      if (!card) return false;
      return card.magic || card.greenMagic || card.magicColor === 'green' || (card.isNumberCard && card.value >= 1 && card.value <= 3);
    },

    attackOrder(hand) {
      const indices = hand.map((_, i) => i);
      indices.sort((a, b) => {
        const ca = hand[a], cb = hand[b];
        const ra = ca.magic || ca.magicColor === 'purple' ? 2 : (ca.greenMagic || ca.magicColor === 'green' ? 1 : 0);
        const rb = cb.magic || cb.magicColor === 'purple' ? 2 : (cb.greenMagic || cb.magicColor === 'green' ? 1 : 0);
        if (ra !== rb) return rb - ra;
        return (cb.value || 0) - (ca.value || 0);
      });
      return indices;
    }
  };

  window.AdventureNpcStrategy = NpcStrategy;
})();
