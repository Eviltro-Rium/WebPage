/**
 * 冒险模式 NPC（怪物/Boss）出牌策略
 *
 * 进攻优先级：药剂牌 → 数字牌降序。由于 NPC 牌库全为白牌（总是合法），
 * 进攻时会把所有手牌打完（药剂牌搭桥后继续出）。
 *
 * 防御限制：只能打出 1~3 数字牌或药剂牌（4~6 不可防御）。
 * 防御优先级：药剂牌 → 1~3 数字牌降序。
 */
(function () {
  const NpcStrategy = {
    chooseAttack(hand) {
      for (let i = 0; i < hand.length; i++) if (hand[i].potion) return i;
      let best = -1, bestVal = -1;
      for (let i = 0; i < hand.length; i++) {
        if (hand[i].isNumberCard && hand[i].value > bestVal) { bestVal = hand[i].value; best = i; }
      }
      return best;
    },

    chooseDefend(hand) {
      for (let i = 0; i < hand.length; i++) if (hand[i].potion) return i;
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
      return card.potion || (card.isNumberCard && card.value >= 1 && card.value <= 3);
    },

    attackOrder(hand) {
      const indices = hand.map((_, i) => i);
      indices.sort((a, b) => {
        const ca = hand[a], cb = hand[b];
        if (ca.potion && !cb.potion) return -1;
        if (!ca.potion && cb.potion) return 1;
        return (cb.value || 0) - (ca.value || 0);
      });
      return indices;
    }
  };

  window.AdventureNpcStrategy = NpcStrategy;
})();