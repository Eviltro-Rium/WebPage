(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Saiki',
    hp: 80,
    type: '猎手',
    passive: '进攻时打出有效黄色牌会施加1层流血',
    init() { return {}; },
    turnStart(eng, ch) {},
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, bleed, guard, takeReveal, heal, draw, clearDebuffs } = helpers;
      let d = 0, skip = false, unblock = false, immediateBuffs = false;
      if (v === 1) {
        d = 4;
      } else if (v === 2) {
        d = 3;
        heal(a, 1);
      } else if (v === 3) {
        d = 2;
      } else if (v === 4) {
        d = 5;
        unblock = !!t.bleed;
      } else if (v === 5) {
        if (a.hp <= 20) {
          heal(a, 4);
          skip = true;
        } else if (a.hp <= 50) {
          d = 4;
          skip = true;
        } else {
          d = 4;
          let targetKey = eng._who(t);
          let oh = eng.h[targetKey];
          if (oh.length) {
            let drawn = oh.splice(Math.floor(Math.random() * oh.length), 1)[0];
            eng.s.revealCards = [JSON.parse(JSON.stringify(drawn))];
            eng.emit('reveal', 'Saiki 5牌抽取对手手牌', drawn, { who: targetKey, from: 'hand' });
            if (eng.s.isAdventure) {
              eng.discardWithEvent(drawn, targetKey, { from: 'reveal', faceUp: true, desc: `Saiki 5牌弃掉${eng.cardText(drawn)}` });
            } else {
              eng.h[owner].push(drawn);
            }
          }
        }
      } else if (v === 7) {
        d = 2 + 2 * t.bleed;
        heal(a, d);
      } else if (v === 0) {
        let totalBleed = eng.s.is1v2 ? eng.s.player.bleed + eng.s.ai.bleed + eng.s.ai2.bleed : a.bleed + t.bleed;
        let oldBleed = t.bleed;
        bleed(1);
        d = 1 + 3 * oldBleed;
        heal(a, totalBleed);
        immediateBuffs = true;
      }
      return { d, skip, unblock, immediateBuffs };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw, burn, bleed, cancelAttackDebuffs, clearDebuffs } = helpers;
      let remaining = d, desc = '';
      if (v === 1) {
        let b = Math.min(3, d);
        remaining = Math.max(0, d - b);
        desc = `Saiki 1牌：防御至多3点`;
      } else if (v === 2) {
        hurt(opponent, 2);
        bleed(opponent, 1);
        remaining = d;
        desc = 'Saiki 2牌：2点伤害+1层流血';
      } else if (v === 0) {
        let shared = Math.ceil(d / 2);
        hurt(opponent, shared);
        hurt(defender, shared);
        remaining = 0;
        cancelAttackDebuffs(owner, true);
        desc = `Saiki 0牌：免疫debuff，双方均摊${shared}点伤害并反弹debuff`;
      }
      return { remaining, desc };
    }
  });
})();