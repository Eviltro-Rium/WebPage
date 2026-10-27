(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Serenity',
    hp: 75,
    type: '暗影',
    passive: '免疫冷冻；生命低于30获得嗜血印记（不可净化，冒险离房时生命高于30则清除）；无印记时恢复额外+1',
    init() { return {}; },
    turnStart(eng, ch) { if (ch.hp < 30) ch.bloodthirst = true; },
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, bleed, guard, takeReveal, heal, draw, clearDebuffs, hurt } = helpers;
      let d = 0, skip = false, unblock = false;
      let bt = !!a.bloodthirst || a.hp < 30;
      if (a.hp < 30) a.bloodthirst = true;
      if (v === 1) {
        d = 2;
        if (bt) bleed(2);
        else heal(a, 2);
      } else if (v === 2) {
        d = bt ? 5 : 3;
      } else if (v === 3) {
        d = 3;
        skip = bt;
      } else if (v === 4) {
        d = 5;
        if (bt) bleed(1);
      } else if (v === 5) {
        let r = eng.reveal('Serenity 5牌判定');
        if (r && ['YELLOW', 'GREEN'].includes(eng.effective(r))) {
          heal(a, 3);
          skip = true;
        } else {
          d = 5;
        }
        if (r) eng.discardWithEvent(r, owner, { from: 'reveal', faceUp: true, desc: `Serenity 5牌将${eng.cardText(r)}置于弃牌库底` });
      } else if (v === 6) {
        d = 6;
        const hand = eng.h && eng.h[owner] || [];
        if (hand.length) {
          if (owner === 'player') {
            eng.s.pendingSerenitySixDiscard = true;
          } else if (typeof eng.chooseAIDiscard === 'function') {
            const worst = eng.chooseAIDiscard(hand);
            const card = hand.splice(worst, 1)[0];
            eng.discardWithEvent(card, owner, { handIndex: worst, desc: 'Serenity 6牌：弃掉' + eng.cardText(card) });
          }
        }
      } else if (v === 7) {
        d = 5;
        unblock = true;
        if (!bt) hurt(a, 2);
        if (eng.s.is1v2) {
          let aoeTarget = owner === 'player' ? (t === eng.s.ai ? 'ai2' : 'ai') : (owner === 'ai' ? 'ai2' : 'ai');
          eng.performAttack({type:'unblockable',attacker:owner,target:aoeTarget,damage:5,direct:true});
        }
      } else if (v === 0) {
        let own = eng.h[owner], bonus = Math.min(9, own.length * 3);
        if (bonus > 0) heal(a, bonus);
        const dropped = own.splice(0, own.length);
        eng.discardManyWithEvent(dropped, owner, { desc: 'Serenity 0牌：弃掉所有手牌' });
        if (bt) {
          const targetKey = typeof eng._who === 'function' ? eng._who(t) : (owner === 'player' ? 'ai' : 'player');
          let opp = eng.h[targetKey] || [], count = opp.length;
          const discarded = opp.splice(0, opp.length);
          eng.discardManyWithEvent(discarded, targetKey, { desc: 'Serenity 嗜血0牌：对手弃掉所有手牌' });
          draw(targetKey, Math.max(0, count - 1), true);
        }
        draw(owner, 4, true);
        skip = true;
      }
      return { d, skip, unblock };
    },
    damageAfterDefense(v, damage, defender) {
      if ([3].includes(v)) return Math.max(0, damage - Math.ceil(damage / 2));
      if (v === 1) return Math.max(0, damage - 3);
      return null;
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw, burn, bleed, cancelAttackDebuffs, clearDebuffs } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d, desc = '';
      if (v === 1) {
        let b = Math.min(3, d);
        remaining = Math.max(0, d - b);
        desc = 'Serenity 1牌：防御至多3点';
      } else if (v === 2) {
        bleed(opponent, 1);
        let drain = (opponent.bleed || 0) * 1;
        // Life steal must remove HP from the attacker and heal the defender
        // by the amount actually taken (after fly/guard mitigation).
        if (typeof eng.drainAttack === 'function') {
          eng.drainAttack(defender, opponent, drain, { forceDrainAvoidance: true });
        } else {
          const before = opponent.hp;
          hurt(opponent, drain, 'drain');
          const taken = Math.max(0, before - opponent.hp);
          if (taken > 0) heal(defender, taken, 'drain');
        }
        remaining = d;
        desc = `Serenity 2牌：1层流血+吸取${drain}点生命`;
      } else if (v === 3) {
        let b = Math.ceil(d / 2);
        remaining = Math.max(0, d - b);
        let bt = !!defender.bloodthirst || defender.hp < 30;
        if (defender.hp < 30) defender.bloodthirst = true;
        if (bt) counter(opponent, 2);
        desc = bt ? `Serenity 3牌：格挡${b}点+反击2点(嗜血)` : `Serenity 3牌：格挡${b}点`;
        // v===0 由 engine.js#defenseJudge 翻牌判定完成，这里不再处理。
      }
      return { remaining, desc };
    }
  });
})();
