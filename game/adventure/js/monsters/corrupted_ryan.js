/** Final encounter, awakened after the Stage 4 scene Boss is defeated. */
(function () {
  const R = window.AdventureRegistry;
  if (!R) return;
  const face = card => card && card.isNumberCard && !card.isItemCard ? Math.max(0, Number(card.value) || 0) : 0;
  const sum = cards => cards.reduce((total, card) => total + face(card), 0);
  const low = v => v >= 1 && v <= 3;
  const passive = '手牌上限3张；对手每使用一张黑牌，恢复2点生命';

  R.registerBoss({
    name: 'CorruptedRyan', kind: '堕落 Ryan', hp: 50, handLimit: 3,
    minStage: 4, finalEnemy: true, sevenSkill: true, passive,
    icon: '../icons/npc_icons/corrupted_ryan.webp',
    onOpponentBlackCard(eng, self) { eng.heal(self, 2, 'passive'); },
    attackEffectTiming(v) { return v === 0 ? 'beforeDamage' : 'afterDamage'; },
    attackSkill(eng, card, self, opponent, owner) {
      const v = card.value, hand = eng.h[owner] || [];
      let damage = 0;
      if (low(v)) {
        damage = 4;
        let index = -1;
        hand.forEach((candidate, i) => {
          if (face(candidate) > 0 && (index < 0 || face(candidate) < face(hand[index]))) index = i;
        });
        if (index >= 0) {
          const discarded = hand.splice(index, 1)[0];
          eng.discardWithEvent(discarded, owner, { handIndex: index, desc: '堕落 Ryan：弃掉点数最小的非0数字牌' });
          eng.draw(owner, 1, true);
        }
      } else if (v >= 4 && v <= 6) {
        damage = 4;
        const color = eng.effective(card);
        if (color === 'RED') eng.magmaVein(self, 1);
        else {
          const status = { YELLOW: 'crit', BLUE: 'diving', GREEN: 'lush' }[color];
          if (status) {
            const S = window.FurryGame.StatusService;
            const before = S.amount(self, status);
            S.add(self, status, 1);
            if (S.amount(self, status) > before) eng.emit('buff', '堕落 Ryan：获得[' + {crit:'暴击',diving:'潜水',lush:'茂盛'}[status] + ']', null,
              {who:owner,target:owner,kind:status,stacks:S.amount(self,status)});
          }
        }
      } else if (v === 7) {
        damage = sum(hand);
        if (!hand.length) eng.draw(owner, 1, true);
      } else if (v === 0) {
        eng.clearDebuffs(self);
        const drawn = eng.draw(owner, 2, true);
        damage = sum(drawn);
        eng.emit('desc', '堕落 Ryan：抽取的两张牌合计' + damage + '点伤害（魔法牌按0点）');
      }
      return { d: damage, skip: false, unblock: false };
    },
    defendSkill(eng, card, damage, self, opponent, owner, helpers) {
      if (low(card.value)) {
        helpers.counter(opponent, 2);
        helpers.heal(self, 2);
        return { remaining: damage, desc: '堕落 Ryan：反击2点伤害，恢复2点生命' };
      }
      if (card.value === 0) {
        helpers.cancelAttackDebuffs(owner, false);
        eng.applyHypnosis(opponent);
        return { remaining: 0, desc: '堕落 Ryan：免疫本次所有伤害和debuff，施加[催眠]' };
      }
      return { remaining: damage, desc: '无防御效果' };
    },
    skillDescription(card, defend) {
      const v = card.value;
      if (defend) return low(v) ? '反击2🗡️，恢复2❤️' : v === 0 ? '免疫本次所有伤害和debuff，施加[催眠]' : '无防御效果';
      if (low(v)) return '4🗡️，弃掉手中点数最小的非0数字牌，再抽1🃏；无可弃数字牌时跳过换牌';
      if (v >= 4 && v <= 6) return '4🗡️，按技能牌有效颜色获得：🔴[熔脉] / 🟡[暴击] / 🔵[潜水] / 🟢[茂盛]';
      if (v === 7) return '造成剩余手牌数字之和点🗡️；没有手牌则抽1🃏';
      if (v === 0) return '清除自身所有debuff，抽2🃏，造成这两张牌数字之和点🗡️（魔法牌按0点）';
      return '无进攻效果';
    }
  });
  window.AdventureMonsterNotes = window.AdventureMonsterNotes || {};
  window.AdventureMonsterNotes.CorruptedRyan = [
    {title:'出现条件',lines:['击败Stage 4场景Boss并完成战利品结算后，选择「唤醒堕落 Ryan」进入最终战。']},
    {title:'被动',lines:[passive]},
    {title:'特殊说明',lines:['使用统一怪物牌组；白牌继承有效颜色。7牌具有专属进攻技能。最终战胜利后完成冒险。']}
  ];
})();
