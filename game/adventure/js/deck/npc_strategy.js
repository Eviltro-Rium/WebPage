/**
 * 冒险模式 NPC（怪物/Boss）出牌策略
 *
 * 进攻道具优先级：白双抽 → 紫魔法 → 绿魔法 → 其余走引擎默认分。
 * 数字牌：降序。NPC 牌库全为白牌（总是合法），魔法/双抽搭桥后会继续出牌。
 *
 * 防御可用牌由主引擎根据怪物技能判定；本策略保留魔法牌优先、数字牌降序的通用顺序。
 */
(function () {
  const ATTACK_SCORE = {
    drawTwo: 220,
    purpleMagic: 200,
    greenMagic: 190
  };

  function attackItemRank(card) {
    if (!card || !card.isItemCard || !card.npcCard) return 0;
    if (card.drawTwo) return 4;
    if (card.magic || card.magicColor === 'purple') return 3;
    if (card.greenMagic || card.magicColor === 'green') return 2;
    return 0;
  }

  const NpcStrategy = {
    itemAttackScore(card) {
      const rank = attackItemRank(card);
      if (rank === 4) return ATTACK_SCORE.drawTwo;
      if (rank === 3) return ATTACK_SCORE.purpleMagic;
      if (rank === 2) return ATTACK_SCORE.greenMagic;
      return null;
    },

    chooseAttack(hand) {
      for (let i = 0; i < hand.length; i++) if (hand[i] && hand[i].drawTwo && hand[i].npcCard) return i;
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
        const ra = attackItemRank(ca);
        const rb = attackItemRank(cb);
        if (ra !== rb) return rb - ra;
        return (cb.value || 0) - (ca.value || 0);
      });
      return indices;
    }
  };

  window.AdventureNpcStrategy = NpcStrategy;
})();
