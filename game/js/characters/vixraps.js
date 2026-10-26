(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Vixraps',
    hp: 85,
    type: '灼热',
    passive: '打出黑牌后，在搭桥出牌之前，必须弃掉1张牌，然后恢复2点生命并对对手施加1层灼伤。如果打出黑牌后没有手牌，则不需要弃牌，仍可恢复2点生命并施加1层灼伤',
    init() { return {}; },
    turnStart(eng, ch) {},
    damageAtSettlement(eng, v, a, t) { return v === 7 ? (t.burn || 0) * 2 : null; },
    attackEffectTiming: {1: 'afterDamage', 5: 'afterDamage'},
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, heal, draw, hurt } = helpers;
      let d = 0, skip = false, unblock = false, immediateBuffs = false;

      if (v === 1) {
        d = 2;
        unblock = true;
        burn(2);
      }
      if (v === 2) {
        d = 3;
        // The player uses the ordinary Purify dialog; NPCs keep the automatic branch.
        if (eng && eng.s && a === eng.s.player) return { d, skip, unblock, pendingPurify: true };
        if (typeof eng.clean === 'function') eng.clean(a, false);
      }
      if (v === 3) {
        d = 4;
      }
      if (v === 4) {
        heal(a, 1);
        burn(1);
        draw(owner, 1, true);
      }
      if (v === 5) {
        d = 5;
        const currentBurn = t.burn || 0;
        if (currentBurn > 0) {
          t.burn = Math.min(5, currentBurn * 2);
          const who = (typeof eng._who === 'function') ? eng._who(t)
            : (owner === 'player' ? (t === (eng.s && eng.s.ai2) ? 'ai2' : 'ai') : 'player');
          eng.emit('buff', `灼伤翻倍至${t.burn}层`, null, { who, kind: 'burn', stacks: t.burn });
          // Keep the doubled stacks visible during defense; otherwise
          // _deferAttackBuffs rolls burn back until settle restores it.
          immediateBuffs = true;
        }
      }
      if (v === 6) {
        // 先施加1层灼伤，再按对手当前灼伤层数恢复等量生命并造成等额伤害。
        burn(1);
        const stacks = t.burn || 0;
        if (stacks > 0) heal(a, stacks);
        d = stacks;
      }
      if (v === 7) {
        if (typeof eng.applyHypnosis === 'function') eng.applyHypnosis(t);
        burn(2);
        d = (t.burn || 0) * 2;
      }
      if (v === 0) {
        // 只对当前目标施加催眠和2层灼伤，所有对手仍连续结算两次已有灼伤。
        if (typeof eng.applyHypnosis === 'function') eng.applyHypnosis(t);
        burn(2);
        const targetKeys = typeof eng._enemyKeys === 'function'
          ? eng._enemyKeys(owner)
          : [t];
        const targets = (targetKeys.length ? targetKeys : [t])
          .map(key => typeof key === 'string' && eng.s ? eng.s[key] : key);
        targets.forEach(entity => {
          if (!entity) return;
          for (let i = 0; i < 2; i++) {
            if (typeof eng.settleBurn === 'function') eng.settleBurn(entity);
          }
        });
      }

      return { d, skip, unblock, immediateBuffs };
    },
    damageAfterDefense(v, damage, defender) {
      return null;
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, burn } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d, desc = '';

      if (v === 1) {
        counter(opponent, 2);
        burn(opponent, 2);
        remaining = d;
        desc = 'Vixraps 1牌：反击2点+施加2层灼伤';
      }
      if (v === 2) {
        heal(defender, 2);
        const currentBurn = opponent.burn || 0;
        const service = window.FurryGame && window.FurryGame.StatusService;
        if (currentBurn > 0) {
          if (service) service.set(opponent, 'burn', currentBurn * 2);
          else opponent.burn = Math.min(5, currentBurn * 2);
          if (opponent.burn !== currentBurn) {
            const target = typeof eng._who === 'function' ? eng._who(opponent) : (owner === 'player' ? 'ai' : 'player');
            eng.emit('buff', '[灼伤]翻倍至' + opponent.burn + '层', null,
              {who:target, target, kind:'burn', stacksBefore:currentBurn, stacks:opponent.burn, operation:'multiply'});
          }
        }
        remaining = d;
        desc = `Vixraps 2牌：恢复2点` + (opponent.burn > currentBurn ? `+对手灼伤翻倍至${opponent.burn}层` : '');
      }
      if (v === 3) {
        const counterDmg = Math.ceil(d / 2);
        counter(opponent, counterDmg);
        heal(defender, 1);
        remaining = d;
        desc = `Vixraps 3牌：反击${counterDmg}点+恢复1点`;
      }
      if (v === 0) {
        if (typeof eng.applyHypnosis === 'function') eng.applyHypnosis(opponent);
        burn(opponent, 1);
        remaining = d;
        const healAmount = (opponent.burn || 0) * 2;
        heal(defender, healAmount);
        desc = `Vixraps 0牌：对手灼伤${opponent.burn}层+恢复${healAmount}点`;
      }

      return { remaining, desc };
    }
  });
})();